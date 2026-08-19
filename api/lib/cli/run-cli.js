// CLI 1회 실행 래퍼: spawn → stdin 주입 → stdout/stderr 수집 → 타임아웃/취소 시
// 프로세스 트리 강제 종료. 요청당 프로세스 1개, 상주 데몬 없음.
import { spawn } from 'node:child_process';
import { HttpError } from '../errors.js';

const WIN = process.platform === 'win32';
const OUTPUT_CAP = 4 * 1024 * 1024; // 4MB — 폭주 방지

export function terminateProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  try {
    if (WIN) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    } else {
      // detached로 띄운 프로세스 그룹 전체에 SIGKILL
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  } catch { /* 이미 죽었으면 무시 */ }
}

// invocation: { command, args, env?, cwd, stdin? }
// 반환: { stdout, stderr, exitCode, durationMs }
export function runCli(invocation, { timeoutMs = 120_000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        env: {
          ...process.env,
          NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', TERM: 'dumb',
          ...invocation.env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: !WIN, // POSIX: 프로세스 그룹으로 묶어 트리 종료 가능하게
      });
    } catch (err) {
      reject(new HttpError(503, 'CLI_NOT_FOUND', `실행 실패: ${err.message}`));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let aborted = false;

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);

    const onAbort = () => {
      aborted = true;
      terminateProcessTree(child);
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    child.on('error', (err) => finish(() => {
      const code = err.code === 'ENOENT' ? 'CLI_NOT_FOUND' : 'CLI_FAILED';
      reject(new HttpError(code === 'CLI_NOT_FOUND' ? 503 : 502, code, err.message));
    }));

    child.stdout.on('data', (chunk) => {
      if (stdout.length < OUTPUT_CAP) stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < OUTPUT_CAP) stderr += chunk;
    });

    child.on('close', (exitCode) => finish(() => {
      if (aborted) {
        reject(new HttpError(499, 'BAD_REQUEST', '요청이 취소되었습니다.'));
      } else if (timedOut) {
        reject(new HttpError(504, 'TIMEOUT', `CLI가 ${Math.round(timeoutMs / 1000)}s 안에 응답하지 않았습니다.`));
      } else {
        resolve({ stdout, stderr, exitCode, durationMs: Date.now() - started });
      }
    }));

    if (invocation.stdin !== undefined) {
      child.stdin.on('error', () => { /* EPIPE: 프로세스가 먼저 죽은 경우 */ });
      child.stdin.end(invocation.stdin);
    } else {
      child.stdin.end();
    }
  });
}
