// 오케스트레이터 — 검증 → 세마포어 → 렌더 → 실행 → 파싱/검증 → repair → 강등.
//
// 재시도 정책:
//  1. 1차 정상 호출
//  2. 파싱/검증 실패 시에만 같은 provider, "새 세션"에 repair 프롬프트 1회
//     (잘못된 턴을 컨텍스트에 남기지 않기 위해 새 세션)
//  3. 3차 없음. task별 강등: tutor → degraded 원문 / vocab_entry → SCHEMA_VIOLATION(저장 금지)
//  4. 전송 오류(CLI_NOT_FOUND/NOT_LOGGED_IN)는 내용 재시도 안 함.
//     TIMEOUT만 예산 40% 이상 남았을 때 1회, 백오프 400ms → 1200ms(±25% 지터)
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { extractJson } from '../lib/cli/json.js';
import { Semaphore } from '../lib/semaphore.js';
import { NORMALIZERS } from './normalize.js';
import { LIMITS, renderChatMessages, renderCliPrompt, renderRepairPrompt } from './prompts.js';
import { TASK_SCHEMAS, validateAgainst } from './schemas.js';
import { getProvider } from './registry.js';

const HTTP_BUDGET_MS = 150_000;  // 브라우저 abort 180s > HTTP 150s > 프로세스 90~120s
const PROCESS_TIMEOUT_MS = 120_000;

const globalSemaphore = new Semaphore(4, { queueMax: config.ai.queueMax });
const providerSemaphores = new Map();
function providerSemaphore(id) {
  if (!providerSemaphores.has(id)) {
    providerSemaphores.set(id, new Semaphore(config.ai.maxConcurrency, { queueMax: config.ai.queueMax }));
  }
  return providerSemaphores.get(id);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => Math.round(ms * (0.75 + Math.random() * 0.5));

export async function askAI({
  task = 'tutor', providerId, model, history = [], userMessage,
  sessionRef = null, ollamaUrl, signal,
}) {
  if (!TASK_SCHEMAS[task]) throw new HttpError(400, 'BAD_REQUEST', `알 수 없는 task: ${task}`);
  if (typeof userMessage !== 'string' || !userMessage.trim()) {
    throw new HttpError(400, 'BAD_REQUEST', 'userMessage가 필요합니다.');
  }
  if (userMessage.length > LIMITS.userMessage) {
    throw new HttpError(413, 'PROMPT_TOO_LONG', `메시지는 ${LIMITS.userMessage}자 이하여야 합니다.`);
  }
  const provider = getProvider(providerId);
  const schema = TASK_SCHEMAS[task];
  const deadline = Date.now() + HTTP_BUDGET_MS;

  const globalSlot = await globalSemaphore.acquire(signal);
  let providerSlot;
  try {
    providerSlot = await providerSemaphore(provider.id).acquire(signal);
    const queuedMs = globalSlot.queuedMs + providerSlot.queuedMs;

    const includeSchemaContract = !provider.supportsJsonSchema;
    const runInput = {
      prompt: renderCliPrompt({ task, history, userMessage, includeSchemaContract }),
      messages: renderChatMessages({ task, history, userMessage }),
      jsonSchema: provider.supportsJsonSchema ? schema : null,
      model, sessionRef, signal, baseUrl: ollamaUrl,
      timeoutMs: Math.min(PROCESS_TIMEOUT_MS, provider.timeoutMs),
    };

    // ── 1차 호출 (TIMEOUT 1회 재시도 포함) ──
    let result;
    try {
      result = await runWithTimeoutRetry(provider, runInput, deadline);
    } catch (err) {
      throw decorate(err, provider.id);
    }

    // ── 파싱 + 검증 ──
    let parsed = result.structured ?? extractJson(result.text);
    let violations = parsed ? validateAgainst(schema, parsed) : ['JSON 파싱 실패'];

    // ── repair: 같은 provider, 새 세션 1회 ──
    if (violations.length > 0 && Date.now() < deadline - 15_000) {
      try {
        const repair = await provider.run({
          ...runInput,
          sessionRef: null,
          prompt: renderRepairPrompt({ task, badOutput: result.structured ? JSON.stringify(result.structured) : result.text }),
          messages: [{ role: 'user', content: renderRepairPrompt({ task, badOutput: result.text }) }],
        });
        const repairParsed = repair.structured ?? extractJson(repair.text);
        const repairViolations = repairParsed ? validateAgainst(schema, repairParsed) : ['JSON 파싱 실패'];
        if (repairViolations.length === 0) {
          parsed = repairParsed;
          violations = [];
        }
      } catch { /* repair 실패 → 강등 경로 */ }
    }

    // ── 강등 ──
    if (violations.length > 0) {
      if (task === 'tutor') {
        // 회화 UI가 깨지지 않게 원문을 자유 텍스트로 (기존 ai-provider.jsx 동작 유지)
        return {
          ok: true, provider: provider.id, degraded: true,
          sessionRef: result.sessionRef,
          data: {
            reply_en: String(result.text || '').slice(0, 500),
            reply_ko: null, corrections: [], scores: null, suggestion: null,
          },
          meta: { queuedMs, durationMs: result.meta?.durationMs, violations },
        };
      }
      // vocab_entry: 쓰레기 카드를 영구 저장하는 것보다 실패가 낫다
      throw new HttpError(502, 'SCHEMA_VIOLATION',
        `모델 응답이 스키마를 위반했습니다: ${violations.slice(0, 3).join('; ')}`,
        { provider: provider.id });
    }

    return {
      ok: true, provider: provider.id,
      sessionRef: result.sessionRef,
      data: NORMALIZERS[task](parsed),
      meta: { queuedMs, durationMs: result.meta?.durationMs, model: result.model },
    };
  } finally {
    providerSlot?.release();
    globalSlot.release();
  }
}

async function runWithTimeoutRetry(provider, runInput, deadline) {
  try {
    return await provider.run(runInput);
  } catch (err) {
    const budgetLeft = deadline - Date.now();
    if (err.code === 'TIMEOUT' && budgetLeft > HTTP_BUDGET_MS * 0.4) {
      await sleep(jitter(400));
      try {
        return await provider.run({ ...runInput, timeoutMs: Math.min(runInput.timeoutMs, budgetLeft - 5000) });
      } catch (err2) {
        if (err2.code === 'TIMEOUT') throw err2;
        await sleep(jitter(1200));
        throw err2;
      }
    }
    throw err;
  }
}

function decorate(err, providerId) {
  if (err instanceof HttpError) {
    err.extra = { ...err.extra, provider: err.extra?.provider || providerId };
    return err;
  }
  return new HttpError(502, 'CLI_FAILED', err.message, { provider: providerId });
}
