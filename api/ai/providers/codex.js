// codex CLI 어댑터 — NDJSON 스트림 출력, 프롬프트는 stdin('-').
// resume에는 --sandbox 플래그가 없어 -c sandbox_mode=read-only 를 쓰고,
// id는 옵션 뒤에 온다 (exec resume [OPTS] <ID> [PROMPT]).
// 종료코드보다 본문 유무를 우선한다.
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';
import { ensureAgentCwd, resolveCodex } from '../../lib/cli/invocation.js';
import { runCli } from '../../lib/cli/run-cli.js';

export const codex = {
  id: 'codex',
  label: 'Codex',
  kind: 'cli',
  supportsJsonSchema: false,
  get defaultModel() { return config.ai.models.codex; },
  timeoutMs: 120_000,

  models() {
    // CLI가 목록을 주지 않음 — 큐레이션 배열
    return ['gpt-5.2-codex', 'gpt-5.2', 'gpt-5.1-codex-mini'];
  },

  async probe() {
    try {
      const { command, argsPrefix = [] } = resolveCodex();
      const { stdout, stderr, exitCode } = await runCli(
        { command, args: [...argsPrefix, 'login', 'status'], cwd: ensureAgentCwd(), env: codexEnv() },
        { timeoutMs: 8000 },
      );
      const out = stdout + stderr;
      const loggedIn = exitCode === 0 && !/not logged in/i.test(out);
      return { ok: loggedIn, detail: loggedIn ? 'logged in' : out.slice(0, 200) };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },

  async run({ prompt, model, sessionRef, timeoutMs, signal }) {
    const { command, argsPrefix = [] } = resolveCodex();
    const first = ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check',
      '--ignore-user-config', '--ignore-rules', '--color', 'never'];
    const resume = ['exec', 'resume', '--json', '--skip-git-repo-check',
      '--ignore-user-config', '--ignore-rules',
      '-c', 'sandbox_mode=read-only',
      sessionRef];
    const args = [
      ...argsPrefix,
      ...(sessionRef ? resume : first),
      ...(model || this.defaultModel ? ['--model', model || this.defaultModel] : []),
      '-',
    ];
    const { stdout, stderr, exitCode, durationMs } = await runCli(
      { command, args, cwd: ensureAgentCwd(), env: codexEnv(), stdin: prompt },
      { timeoutMs: timeoutMs ?? this.timeoutMs, signal },
    );

    // NDJSON 파싱: thread.started → thread_id / 마지막 item.completed의 agent_message → text
    let threadId = sessionRef || null;
    let text = null;
    let eventError = null;
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      let event;
      try { event = JSON.parse(trimmed); } catch { continue; }
      if (event.type === 'thread.started' && event.thread_id) threadId = event.thread_id;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') text = event.item.text ?? text;
      if (event.type === 'turn.failed' || event.type === 'error') {
        eventError = event.error?.message || event.message || JSON.stringify(event).slice(0, 200);
      }
    }
    // 종료코드보다 본문 유무 우선
    if (text == null) {
      const out = stdout + stderr;
      if (/not logged in|login required|unauthorized/i.test(out)) {
        throw new HttpError(503, 'NOT_LOGGED_IN', 'codex가 로그인 상태가 아닙니다.', { provider: 'codex' });
      }
      throw new HttpError(502, 'CLI_FAILED',
        `codex 실패 (exit ${exitCode}): ${(eventError || stderr || stdout).slice(0, 300)}`,
        { provider: 'codex' });
    }
    return {
      text,
      structured: null,
      sessionRef: threadId,
      model: model || this.defaultModel,
      meta: { durationMs, exitCode, eventError },
    };
  },
};

// 구독 로그인 강제: API 키가 env에 있으면 그것부터 쓰려다 실패한다
function codexEnv() {
  return { CODEX_API_KEY: '', OPENAI_API_KEY: '' };
}
