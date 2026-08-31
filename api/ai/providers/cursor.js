// cursor-agent 어댑터 — print 모드는 워크스페이스 신뢰를 요구해 --trust가 필수
// (--yolo/-f는 쓰기 허용이라 절대 금지). -p는 모든 도구 접근을 허용한다고 명시되어
// 있어 --mode ask + --sandbox enabled 로 잠근다. 프롬프트는 positional.
// JSON 봉투 키는 관용 파싱: result ?? response ?? message.
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';
import { extractJson } from '../../lib/cli/json.js';
import { AGENT_CWD, ensureAgentCwd, resolveCursor } from '../../lib/cli/invocation.js';
import { runCli } from '../../lib/cli/run-cli.js';

export const cursor = {
  id: 'cursor',
  supportsResume: true,  // --resume <chat id>
  label: 'Cursor',
  kind: 'cli',
  supportsJsonSchema: false,
  get defaultModel() { return config.ai.models.cursor; },
  timeoutMs: 120_000,

  models() {
    return ['gpt-5', 'sonnet-4.5', 'opus-4.5'];
  },

  async probe() {
    try {
      const { command, argsPrefix = [], env } = resolveCursor();
      const { stdout, stderr, exitCode } = await runCli(
        { command, args: [...argsPrefix, 'status'], cwd: ensureAgentCwd(), env },
        { timeoutMs: 8000 },
      );
      const out = stdout + stderr;
      const ok = exitCode === 0 && !/not logged in|log in/i.test(out);
      return { ok, detail: ok ? 'ok' : out.slice(0, 200) };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },

  async run({ prompt, model, sessionRef, timeoutMs, signal }) {
    const { command, argsPrefix = [], env } = resolveCursor();
    ensureAgentCwd();
    const args = [
      ...argsPrefix,
      '--print', '--output-format', 'json',
      '--mode', 'ask', '--sandbox', 'enabled',
      '--trust',
      '--workspace', AGENT_CWD,
      '--model', model || this.defaultModel,
      ...(sessionRef ? ['--resume', sessionRef] : []),
      prompt,
    ];
    const { stdout, stderr, exitCode, durationMs } = await runCli(
      { command, args, cwd: AGENT_CWD, env },
      { timeoutMs: timeoutMs ?? this.timeoutMs, signal },
    );
    const envelope = extractJson(stdout);
    const text = envelope?.result ?? envelope?.response ?? envelope?.message ?? null;
    if (text == null) {
      const out = stdout + stderr;
      if (/not logged in|login/i.test(out)) {
        throw new HttpError(503, 'NOT_LOGGED_IN', 'cursor-agent가 로그인 상태가 아닙니다.', { provider: 'cursor' });
      }
      throw new HttpError(502, 'CLI_FAILED',
        `cursor 실패 (exit ${exitCode}): ${(stderr || stdout).slice(0, 300)}`,
        { provider: 'cursor' });
    }
    return {
      text,
      structured: null,
      sessionRef: envelope?.session_id ?? envelope?.chatId ?? envelope?.chat_id ?? sessionRef ?? null,
      model: model || this.defaultModel,
      meta: { durationMs, exitCode },
    };
  },
};
