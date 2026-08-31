// providerId → 실제 실행 커맨드 해석.
// Windows에서는 .cmd shim을 직접 spawn할 수 없고, cmd.exe 래핑을 타면 개행이 든
// 프롬프트가 깨진다 — codex/cursor는 내부 node 진입점을 직접 실행해 우회한다.
// POSIX(이 컨테이너)에서는 shebang으로 직접 spawn이 된다.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../errors.js';
import { which } from './which.js';

const WIN = process.platform === 'win32';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// 빈 디렉터리 — 리포 루트를 cwd로 주면 CLI가 프로젝트를 인덱싱해 기동이 느려지고
// 프롬프트가 부풀며, 도구가 탈출해도 버려도 되는 곳에 떨어지게 한다.
export const AGENT_CWD = join(REPO_ROOT, '.jina-agent-cwd');
export function ensureAgentCwd() {
  mkdirSync(AGENT_CWD, { recursive: true });
  return AGENT_CWD;
}

function notFound(provider, what) {
  return new HttpError(503, 'CLI_NOT_FOUND', `${what} 을(를) 찾을 수 없습니다.`, { provider });
}

export function resolveClaude() {
  const exe = which('claude');
  if (!exe) throw notFound('claude', 'claude CLI');
  return { command: exe };
}

export function resolveAgy() {
  const exe = which('agy');
  if (!exe) throw notFound('agy', 'agy CLI');
  // .cmd/.bat 이면 cmd.exe 래핑을 타며 개행이 깨진다 — 즉시 실패가 낫다
  if (/\.(cmd|bat)$/i.test(exe)) {
    throw new HttpError(502, 'CLI_FAILED', 'agy가 .cmd shim으로 설치되어 있습니다. 실제 실행 파일 경로를 PATH 앞에 두세요.', { provider: 'agy' });
  }
  return { command: exe };
}

export function resolveCodex() {
  if (WIN) {
    // .cmd shim 우회: 우리 node로 내부 진입점을 직접 실행
    const entry = join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (!existsSync(entry)) throw notFound('codex', 'codex 내부 진입점(codex.js)');
    return { command: process.execPath, argsPrefix: [entry] };
  }
  const exe = which('codex');
  if (!exe) throw notFound('codex', 'codex CLI');
  return { command: exe };
}

export function resolveCursor() {
  if (WIN) {
    const base = join(process.env.LOCALAPPDATA || '', 'cursor-agent', 'versions');
    let latest = null;
    try {
      const versions = readdirSync(base).sort();
      latest = versions[versions.length - 1] || null;
    } catch { /* base 없음 */ }
    if (!latest) throw notFound('cursor', 'cursor-agent');
    return {
      command: join(base, latest, 'node.exe'),
      argsPrefix: [join(base, latest, 'index.js')],
      env: { CURSOR_INVOKED_AS: 'cursor-agent' },
    };
  }
  const exe = which('cursor-agent');
  if (!exe) throw notFound('cursor', 'cursor-agent CLI');
  return { command: exe, env: { CURSOR_INVOKED_AS: 'cursor-agent' } };
}
