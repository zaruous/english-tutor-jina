// 정적 서버(3003) + API 서버(3004) 동시 실행 — `npm run dev`. concurrently 불필요.
//  - 한쪽이 죽으면 나머지도 정리하고 같은 종료 코드로 끝난다 (고아 프로세스 방지, Windows 포함)
//  - Ctrl+C(SIGINT)/SIGTERM 은 두 자식에 전파
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { name: 'web', entry: 'server.js',     port: process.env.PORT     || 3003 },
  { name: 'api', entry: 'api/server.js', port: process.env.API_PORT || 3004 },
];

const pad = Math.max(...TARGETS.map((t) => t.name.length));
const procs = new Map();
let shuttingDown = false;
let exitCode = 0;

const alive = () => [...procs.values()].filter((p) => p.exitCode === null && p.signalCode === null);

function finish() {
  if (alive().length === 0) process.exit(exitCode);
}

function shutdown(code, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  if (reason) console.log(`[dev] ${reason}`);
  for (const p of alive()) {
    try { p.kill(); } catch { /* 이미 종료됨 */ }
  }
  // 자식들이 exit 이벤트를 돌려주면 finish()가 즉시 종료. 안 죽는 자식이 있어도 2초 뒤 강제 종료.
  setTimeout(() => process.exit(exitCode), 2000);
  finish();
}

for (const t of TARGETS) {
  const p = spawn(process.execPath, [t.entry], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.set(t.name, p);

  const tag = `[${t.name.padEnd(pad)}]`;
  const own = `[${t.name}]`; // 자식이 이미 자기 접두어를 붙였으면 중복하지 않음
  const forward = (stream) => (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      stream.write(line.startsWith(own) ? `${line}\n` : `${tag} ${line}\n`);
    }
  };
  p.stdout.on('data', forward(process.stdout));
  p.stderr.on('data', forward(process.stderr));

  p.on('error', (err) => shutdown(1, `${t.name} 실행 실패: ${err.message}`));
  p.on('exit', (code, signal) => {
    if (shuttingDown) { finish(); return; }
    const how = signal ? `signal ${signal}` : `code ${code}`;
    // Windows 강제 종료(TerminateProcess)는 4294967295 같은 값이 올라오므로 0..255 밖은 1로 정규화
    const normalized = Number.isInteger(code) && code >= 0 && code <= 255 ? code : 1;
    shutdown(normalized, `${t.name} 종료 (${how}) → 나머지 프로세스도 정리합니다`);
  });
}

console.log(`[dev] web http://localhost:${TARGETS[0].port}  ·  api http://localhost:${TARGETS[1].port}  (Ctrl+C 로 둘 다 종료)`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => shutdown(0, `${sig} 수신 — 종료 중`));
}
