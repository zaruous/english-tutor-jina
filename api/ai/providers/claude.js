// claude CLI 어댑터 — 프롬프트는 stdin, 출력은 --output-format json 단일 봉투
// {result, session_id, is_error}. 도구는 전면 차단.
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';
import { extractJson } from '../../lib/cli/json.js';
import { ensureAgentCwd, resolveClaude } from '../../lib/cli/invocation.js';
import { runCli } from '../../lib/cli/run-cli.js';

export const claude = {
  id: 'claude',
  label: 'Claude',
  kind: 'cli',
  supportsJsonSchema: false, // 프롬프트 계약 + extractJson
  get defaultModel() { return config.ai.models.claude; },
  timeoutMs: 120_000,

  models() {
    // CLI가 모델 목록을 주지 않음 — 큐레이션 배열
    return ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5'];
  },

  async probe() {
    try {
      const { command } = resolveClaude();
      const { stdout, exitCode } = await runCli(
        { command, args: ['auth', 'status'], cwd: ensureAgentCwd() }, // 출력 자체가 JSON
        { timeoutMs: 8000 },
      );
      const parsed = extractJson(stdout);
      const loggedIn = parsed ? Boolean(parsed.loggedIn ?? parsed.logged_in ?? true) : exitCode === 0;
      return { ok: exitCode === 0 && loggedIn, detail: loggedIn ? 'logged in' : 'not logged in' };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },

  async run({ prompt, model, sessionRef, timeoutMs, signal }) {
    const { command } = resolveClaude();
    const newSessionId = sessionRef ? null : randomUUID();
    const args = [
      '-p', '--output-format', 'json',
      '--model', model || this.defaultModel,
      '--allowed-tools', '',              // 도구 전면 차단 (빈 문자열 보존 필요)
      '--permission-mode', 'default',
      ...(sessionRef ? ['--resume', sessionRef] : ['--session-id', newSessionId]),
    ];
    const { stdout, stderr, exitCode, durationMs } = await runCli(
      { command, args, cwd: ensureAgentCwd(), stdin: prompt },
      { timeoutMs: timeoutMs ?? this.timeoutMs, signal },
    );

    let envelope = null;
    try { envelope = JSON.parse(stdout); } catch { envelope = extractJson(stdout); }
    if (!envelope || envelope.is_error) {
      if (/not logged in|please run \/login|authentication/i.test(stdout + stderr)) {
        throw new HttpError(503, 'NOT_LOGGED_IN', 'claude CLI가 로그인 상태가 아닙니다.', { provider: 'claude' });
      }
      throw new HttpError(502, 'CLI_FAILED',
        `claude 실패 (exit ${exitCode}): ${(envelope?.result || stderr || stdout).slice(0, 300)}`,
        { provider: 'claude' });
    }
    return {
      text: envelope.result ?? '',
      structured: null,
      sessionRef: envelope.session_id || newSessionId || sessionRef,
      model: model || this.defaultModel,
      meta: { durationMs, exitCode },
    };
  },
};
