// 테스트용 DB 하네스.
//
// node:test 는 파일마다 별도 프로세스를 띄우므로 pglite 에서는 파일 단위로 DB 가 통째로 격리된다
// (메모리 인스턴스가 프로세스와 함께 사라진다). 그래서 테스트 간 truncate 가 필요 없고,
// 마이그레이션이 넣는 시드(0003 단어·0006 레슨·0014 토픽)를 그대로 쓸 수 있다.
//
// DB_DRIVER=pg 로 같은 테스트를 돌릴 때는 이미 마이그레이션된 실 DB 를 쓴다 — 하네스가
// 마이그레이션을 적용하지 않는다. 대신 테스트가 만든 사용자를 지우면 FK CASCADE 로 흔적이 사라진다.
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../api/config.js';
import { pool } from '../../api/lib/db.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

let migrated = null;

// 마이그레이션 전체를 적용한 DB 를 돌려준다. 같은 프로세스에서 여러 번 불러도 한 번만 적용된다.
export function setupDb() {
  if (!migrated) {
    migrated = (async () => {
      if (config.db.driver === 'pglite') {
        const files = readdirSync(MIGRATIONS_DIR)
          .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
          .sort();
        for (const file of files) {
          // 파일 하나에 여러 문장이 들어 있으므로 query(확장 프로토콜)가 아니라 exec 를 쓴다.
          await pool.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        }
      }
      return pool;
    })();
  }
  return migrated;
}

// 테스트 사용자 — 이메일이 매번 달라 pg 드라이버로 돌려도 기존 계정과 충돌하지 않는다.
// password_hash 는 형태만 맞으면 된다(로그인 경로를 타지 않는 테스트용).
export async function createUser({ tz = 'Asia/Seoul' } = {}) {
  await setupDb();
  const email = `test-${randomUUID()}@jina.test`;
  const { rows: [user] } = await pool.query(
    `INSERT INTO public.users (email, display_name, password_hash, tz)
     VALUES ($1, 'test', 'scrypt$test$test$test', $2)
     RETURNING id, email, tz, display_name`,
    [email, tz],
  );
  return user;
}

// users 를 지우면 학습·회화·단어 기록이 FK CASCADE 로 함께 사라진다(0001~0012 전부 ON DELETE CASCADE).
export async function dropUser(userId) {
  await pool.query(`DELETE FROM public.users WHERE id = $1`, [userId]);
}

export async function closeDb() {
  await pool.end();
}

export { pool };
