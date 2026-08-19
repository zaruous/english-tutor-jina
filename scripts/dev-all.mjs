// 정적 서버(3003) + API 서버(3004) 동시 실행. concurrently 불필요.
import { spawn } from 'node:child_process';

const procs = [
  ['web', 'server.js'],
  ['api', 'api/server.js'],
].map(([name, entry]) => {
  const p = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (line) => line.trim() && console.log(`[${name}] ${line}`);
  p.stdout.on('data', (d) => String(d).split('\n').forEach(prefix));
  p.stderr.on('data', (d) => String(d).split('\n').forEach(prefix));
  p.on('exit', (code) => { console.log(`[${name}] exited (${code})`); process.exit(code ?? 0); });
  return p;
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { procs.forEach((p) => p.kill(sig)); });
}
