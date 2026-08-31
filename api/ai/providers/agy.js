// agy(Antigravity) CLI 어댑터 — Go flag 스타일이라 프롬프트를 stdin으로 못 받고
// `-p` 가 다음 argv 토큰을 삼킨다. 프롬프트는 --print <텍스트> 플래그 값으로,
// 반드시 args 배열 맨 끝에 둔다. --json-schema를 주면 structured_output 필드에
// 깨끗한 객체가 온다(response에는 프로즈가 섞임).
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';
import { extractJson } from '../../lib/cli/json.js';
import { ensureAgentCwd, resolveAgy } from '../../lib/cli/invocation.js';
import { runCli } from '../../lib/cli/run-cli.js';

const PROMPT_MAX = 24_000; // Windows 명령줄 32767자 상한 대비 여유

export const agy = {
  id: 'agy',
  supportsResume: true,  // --conversation <conversation_id>
  label: 'Antigravity',
  kind: 'cli',
  supportsJsonSchema: true,
  get defaultModel() { return config.ai.models.agy; },
  timeoutMs: 120_000,

  async models() {
    try {
      const { command } = resolveAgy();
      const { stdout, exitCode } = await runCli(
        { command, args: ['models'], cwd: ensureAgentCwd() }, { timeoutMs: 8000 },
      );
      if (exitCode !== 0) return [];
      return stdout.split('\n').map((l) => l.trim()).filter((l) => l && !/\s/.test(l));
    } catch {
      return [];
    }
  },

  async probe() {
    // agy에는 --version이 없다 — `agy models`의 exit 0을 생존+인증 프로브로 사용
    try {
      const { command } = resolveAgy();
      const { exitCode, stderr } = await runCli(
        { command, args: ['models'], cwd: ensureAgentCwd() }, { timeoutMs: 8000 },
      );
      return { ok: exitCode === 0, detail: exitCode === 0 ? 'ok' : stderr.slice(0, 200) };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },

  async run({ prompt, model, sessionRef, jsonSchema, timeoutMs, signal }) {
    if (prompt.length > PROMPT_MAX) {
      throw new HttpError(413, 'PROMPT_TOO_LONG', `agy 프롬프트 상한(${PROMPT_MAX}자)을 넘었습니다.`, { provider: 'agy' });
    }
    const { command } = resolveAgy();
    // agy 내부 print 타임아웃은 우리 프로세스 타임아웃보다 10초 먼저 — SIGKILL 전에 agy가 스스로 정리한다
    const printTimeoutSec = Math.max(30, Math.floor(((timeoutMs ?? this.timeoutMs) - 10_000) / 1000));
    const args = [
      '--output-format', 'json', '--sandbox', '--mode', 'plan', '--disable-slash-commands',
      '--print-timeout', `${printTimeoutSec}s`,
      '--model', model || this.defaultModel,
      ...(jsonSchema ? ['--json-schema', JSON.stringify(jsonSchema)] : []),
      // -c/--continue 는 "가장 최근 대화"라 서버에서 위험 → --conversation만 사용
      ...(sessionRef ? ['--conversation', sessionRef] : []),
      '--print', prompt, // 반드시 맨 끝
    ];
    const { stdout, stderr, exitCode, durationMs } = await runCli(
      { command, args, cwd: ensureAgentCwd() },
      { timeoutMs: timeoutMs ?? this.timeoutMs, signal },
    );
    const envelope = extractJson(stdout);
    if (!envelope || envelope.status !== 'SUCCESS') {
      if (/login|unauthorized|not authenticated/i.test(stdout + stderr)) {
        throw new HttpError(503, 'NOT_LOGGED_IN', 'agy가 로그인 상태가 아닙니다.', { provider: 'agy' });
      }
      throw new HttpError(502, 'CLI_FAILED',
        `agy 실패 (exit ${exitCode}, status ${envelope?.status}): ${(stderr || stdout).slice(0, 300)}`,
        { provider: 'agy' });
    }
    // 모르는 conversation id 를 주면 agy 는 에러 대신 조용히 다른(최근/새) 대화로 이어간다 —
    // 다른 세션의 맥락이 섞이는 오염이므로 resume 실패로 취급해 askAI 의 히스토리 폴백을 태운다.
    if (sessionRef && envelope.conversation_id && envelope.conversation_id !== sessionRef) {
      throw new HttpError(502, 'RESUME_FAILED',
        `agy가 요청한 conversation(${sessionRef.slice(0, 8)}…)이 아닌 다른 세션으로 응답했습니다.`,
        { provider: 'agy' });
    }
    return {
      text: envelope.response ?? '',
      structured: envelope.structured_output ?? null, // 최우선으로 읽는다
      sessionRef: envelope.conversation_id || sessionRef || null,
      model: model || this.defaultModel,
      meta: { durationMs, exitCode, usage: envelope.usage },
    };
  },
};
