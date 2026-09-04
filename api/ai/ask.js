// 오케스트레이터 — 검증 → 세마포어 → 렌더 → 실행 → 파싱/검증 → repair → 강등.
//
// 재시도 정책:
//  1. 1차 정상 호출
//  2. 파싱/검증 실패 시에만 같은 provider, "새 세션"에 repair 프롬프트 1회
//     (잘못된 턴을 컨텍스트에 남기지 않기 위해 새 세션)
//  3. 3차 없음. task별 강등: tutor → degraded 원문 / vocab_entry → SCHEMA_VIOLATION(저장 금지)
//  0. sessionRef + provider.supportsResume 이면 히스토리 없이 CLI 세션 resume. 실패 시 히스토리 새 세션 1회 폴백
//     (전송 오류·TIMEOUT 은 폴백 없음). 결과 meta.resumed / meta.resume_fallback.
//  4. 전송 오류(CLI_NOT_FOUND/NOT_LOGGED_IN)는 내용 재시도 안 함.
//     TIMEOUT만 예산 40% 이상 남았을 때 1회, 백오프 400ms → 1200ms(±25% 지터)
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { extractJson } from '../lib/cli/json.js';
import { Semaphore } from '../lib/semaphore.js';
import { NORMALIZERS } from './normalize.js';
import { LIMITS, renderChatMessages, renderCliPrompt, renderRepairPrompt } from './prompts.js';
import { LESSON_GEN_LC_SCHEMA, TASK_SCHEMAS, validateAgainst } from './schemas.js';
import { getProvider } from './registry.js';

// 타임아웃 체인: 브라우저 abort(api-client 31분) > HTTP 예산 30.5분 > CLI 프로세스 30분.
// 2026-08-31 사용자 결정 — 퀴즈 보강(어원·관계어)으로 출력이 커져 140s 를 넘기자 기본을 30분으로 상향.
// Node http 서버는 응답 지연에 자체 타임아웃이 없어(server.timeout=0 기본) 서버쪽 추가 설정은 불필요.
const HTTP_BUDGET_MS = 1_830_000;
const PROCESS_TIMEOUT_MS = Number(process.env.AI_PROCESS_TIMEOUT_MS) || 1_800_000;

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

// context(선택): 서버가 조립한 학습 자료 텍스트(lesson_qa). 시스템 프롬프트 뒤 '--- 학습 자료 ---' 절로 들어가며
// 학습자 입력이 아니므로 LEARNER_INPUT 으로 감싸지 않고 LIMITS.userMessage 길이 제한도 userMessage 에만 적용한다.
// 생략하면 기존 task 의 프롬프트는 그대로다(하위호환).
export async function askAI({
  task = 'tutor', providerId, model, history = [], userMessage, context = null,
  // promptVariant(선택): 같은 task 안에서 시스템 프롬프트를 고르는 키. 현재는 lesson_gen 의 part='lc' 만 쓴다.
  promptVariant = null,
  // ollamaUrl 인자는 없다 — Ollama 엔드포인트는 서버 설정(config.ai.ollamaUrl)이 유일한 출처다.
  // 예전에는 라우트가 클라이언트 본문의 ollamaUrl 을 여기로 실어 날랐고, 그게 그대로 fetch 대상이 돼
  // 사내망·사이드카(:8000)·API 자기 자신에 임의 POST 를 보낼 수 있는 SSRF 였다(플랜 10.5 S2).
  sessionRef = null, signal,
}) {
  if (!TASK_SCHEMAS[task]) throw new HttpError(400, 'BAD_REQUEST', `알 수 없는 task: ${task}`);
  if (typeof userMessage !== 'string' || !userMessage.trim()) {
    throw new HttpError(400, 'BAD_REQUEST', 'userMessage가 필요합니다.');
  }
  if (userMessage.length > LIMITS.userMessage) {
    throw new HttpError(413, 'PROMPT_TOO_LONG', `메시지는 ${LIMITS.userMessage}자 이하여야 합니다.`);
  }
  if (context !== null && context !== undefined && typeof context !== 'string') {
    throw new HttpError(400, 'BAD_REQUEST', 'context 는 문자열이어야 합니다.');
  }
  const provider = getProvider(providerId);
  // 응답 검증도 프롬프트에 실은 계약과 같은 스키마를 봐야 한다(LC 는 script 필수).
  const schema = task === 'lesson_gen' && promptVariant === 'lc' ? LESSON_GEN_LC_SCHEMA : TASK_SCHEMAS[task];
  const deadline = Date.now() + HTTP_BUDGET_MS;

  const globalSlot = await globalSemaphore.acquire(signal);
  let providerSlot;
  try {
    providerSlot = await providerSemaphore(provider.id).acquire(signal);
    const queuedMs = globalSlot.queuedMs + providerSlot.queuedMs;

    const includeSchemaContract = !provider.supportsJsonSchema;
    const buildInput = ({ withHistory, ref }) => ({
      prompt: renderCliPrompt({ task, history: withHistory ? history : [], userMessage, includeSchemaContract, context, part: promptVariant }),
      messages: renderChatMessages({ task, history: withHistory ? history : [], userMessage, context, part: promptVariant }),
      jsonSchema: provider.supportsJsonSchema ? schema : null,
      model, sessionRef: ref, signal,
      // 모든 task 공통 30분 기본(AI_PROCESS_TIMEOUT_MS 로 조정) — provider 기본값(120s)으로 더 줄이지 않는다
      timeoutMs: PROCESS_TIMEOUT_MS,
    });

    // ── 세션 resume (하이브리드) ──
    // sessionRef 가 있고 provider 가 CLI 세션을 이어갈 수 있으면 히스토리를 생략하고 시스템 지시 + 새 메시지만
    // 보낸다 — 맥락은 CLI 세션이 쥔다(8턴 창이 아닌 전체 대화). resume 이 실패하면(세션 파일 없음·다른 머신·
    // 만료 등) 예전처럼 히스토리를 통째로 넣은 새 세션으로 1회 폴백한다. DB 히스토리는 여전히 단일 소스.
    const canResume = Boolean(sessionRef) && provider.supportsResume === true;
    let runInput = canResume
      ? buildInput({ withHistory: false, ref: sessionRef })
      : buildInput({ withHistory: true, ref: null });
    let resumed = canResume;
    let resumeFallback = false;

    // ── 1차 호출 (TIMEOUT 1회 재시도 포함) ──
    let result;
    try {
      result = await runWithTimeoutRetry(provider, runInput, deadline);
    } catch (err) {
      // 전송 계층 오류는 폴백해도 같은 이유로 실패한다 — 내용(세션) 문제일 때만 히스토리로 재시도
      const transport = ['TIMEOUT', 'NOT_LOGGED_IN', 'CLI_NOT_FOUND', 'QUEUE_FULL'].includes(err.code);
      if (canResume && !transport && !signal?.aborted && Date.now() < deadline - 20_000) {
        console.warn(`[ai] ${provider.id} resume 실패 (${err.code || err.message}) → 히스토리 재전송으로 폴백`);
        runInput = buildInput({ withHistory: true, ref: null });
        resumed = false;
        resumeFallback = true;
        try {
          result = await runWithTimeoutRetry(provider, runInput, deadline);
        } catch (err2) {
          throw decorate(err2, provider.id);
        }
      } else {
        throw decorate(err, provider.id);
      }
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
          prompt: renderRepairPrompt({ task, part: promptVariant, badOutput: result.structured ? JSON.stringify(result.structured) : result.text }),
          messages: [{ role: 'user', content: renderRepairPrompt({ task, part: promptVariant, badOutput: result.text }) }],
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
          meta: { queuedMs, durationMs: result.meta?.durationMs, violations, resumed, resume_fallback: resumeFallback },
        };
      }
      // 영속 콘텐츠/근거 응답 task는 형식 위반 출력을 저장하거나 내보내지 않는다.
      throw new HttpError(502, 'SCHEMA_VIOLATION',
        `모델 응답이 스키마를 위반했습니다: ${violations.slice(0, 3).join('; ')}`,
        { provider: provider.id });
    }

    return {
      ok: true, provider: provider.id,
      sessionRef: result.sessionRef,
      data: NORMALIZERS[task](parsed),
      meta: { queuedMs, durationMs: result.meta?.durationMs, model: result.model, resumed, resume_fallback: resumeFallback },
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
