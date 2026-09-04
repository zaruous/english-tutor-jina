// PGlite 데이터 디렉터리의 단일 프로세스 잠금.
//
// PGlite 는 프로세스마다 독립된 PostgreSQL 인스턴스다. 같은 디렉터리를 두 프로세스가 열면
// 서로의 쓰기를 보지 못한다 — 실측(2026-09-03): API 서버가 떠 있는 상태에서 다른 프로세스가
// users.display_name 을 UPDATE 했지만 API 는 끝까지 옛 값을 돌려줬다. 나중에 flush 한 쪽이 이기고,
// 에러도 경고도 없다. 그래서 먼저 연 쪽이 PID 를 적어 두고 나중 프로세스를 거부한다.
//
// 잠금 파일의 PID 가 죽어 있으면(강제 종료·크래시) 자동으로 회수한다 — 사람이 지울 일은 없다.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function livePid(lockPath) {
  let pid;
  try {
    pid = Number(readFileSync(lockPath, 'utf8').trim());
  } catch {
    return null;                                 // 잠금 파일 없음
  }
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return null;
  try {
    process.kill(pid, 0);                        // 시그널 0 = 존재 확인만
    return pid;
  } catch (err) {
    return err.code === 'EPERM' ? pid : null;    // EPERM = 살아 있으나 다른 사용자 소유
  }
}

export function lockDataDir(dataDir) {
  mkdirSync(dataDir, { recursive: true });       // PGlite 는 부모 디렉터리를 만들지 않는다(비재귀 mkdir)
  const lockPath = join(dataDir, 'jina.lock');
  const owner = livePid(lockPath);
  if (owner) {
    throw new Error(
      `PGlite 데이터 디렉터리 ${dataDir} 를 PID ${owner} 가 이미 열고 있습니다. ` +
      'PGlite 는 한 번에 한 프로세스만 열 수 있습니다 — API 서버를 멈춘 뒤 다시 실행하세요 ' +
      '(여러 프로세스가 동시에 붙어야 하면 DB_DRIVER=pg 를 쓰세요).',
    );
  }
  writeFileSync(lockPath, String(process.pid));
  const release = () => {
    try {
      if (readFileSync(lockPath, 'utf8').trim() === String(process.pid)) rmSync(lockPath, { force: true });
    } catch { /* 이미 지워졌거나 다른 프로세스가 회수했다 */ }
  };
  process.once('exit', release);
  return release;
}
