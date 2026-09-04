// db/migrate.mjs — 마이그레이션 러너 (up / status / down / reset)
//
// 규칙 (docs/PLAN-vocab-backend.md Phase 1):
//  - 파일명 NNNN_snake_case.sql (4자리 0패딩, 사전순 = 적용순, 번호 재사용 금지)
//  - 이력: public.schema_migrations (러너가 부트스트랩)
//  - 체크섬 강제: 적용된 파일을 수정하면 즉시 실패
//  - pg_advisory_lock 으로 동시 실행 차단
//  - SQL 문 분할 금지: client.query(파일 전체) — $$ … $$ 본문 보호
//  - 파일당 1 트랜잭션 (1행 "-- migrate:no-transaction" 이면 예외)
//  - reset 은 명시적 목록만 DROP + --yes 필수 (DROP SCHEMA 절대 금지)
//  - DB_DRIVER=pglite 면 PGLITE_DATA_DIR 의 파일 DB 에 같은 절차를 적용 (플랜 10.7 Phase 1)
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_KEY_SQL = `SELECT pg_advisory_lock(hashtext('jina_migrations'))`;

// reset 이 지울 수 있는 테이블의 전체 목록 — FK 역순. 여기 없는 테이블은 절대 건드리지 않는다.
const RESET_TABLES = [
  'topic_contents',
  'lesson_reports',
  'lesson_drafts',
  'ai_jobs',
  'vocab_quizzes',
  'correction_reviews',
  'lesson_qa_sessions',
  'user_lesson_attempts',
  'lesson_items',
  'lessons',
  'vocab_sets',
  'conversation_scenarios',
  'topics',
  'corrections',
  'conversation_messages',
  'conversation_sessions',
  'vocab_reviews',
  'user_vocab_cards',
  'vocab_words',
  'auth_sessions',
  'user_goals',
  'users',
  'schema_migrations',
];
// 같은 스키마에 사는 기존 앱 테이블 — reset 목록에 섞이면 코드 버그이므로 self-assert.
const FOREIGN_TABLES = [
  'study_sessions', 'session_messages', 'session_corrections', 'vocabulary',
  'vocab_quiz_details', 'diary_details', 'freetalk_details', 'grammar_details',
  'pronunciation_details', 'roleplay_details', 'shadowing_details',
];
for (const t of RESET_TABLES) {
  if (FOREIGN_TABLES.includes(t)) {
    throw new Error(`reset 목록에 기존 앱 테이블이 섞였습니다: ${t}`);
  }
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function listMigrationFiles() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const seen = new Set();
  for (const f of files) {
    const version = f.slice(0, 4);
    if (seen.has(version)) throw new Error(`마이그레이션 번호 중복: ${version} (${f})`);
    seen.add(version);
  }
  return files;
}

function readMigration(file) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  if (sql.charCodeAt(0) === 0xfeff) {
    throw new Error(`${file}: BOM이 있습니다. BOM 없는 UTF-8로 저장하세요.`);
  }
  const noTransaction = /^--\s*migrate:no-transaction\s*$/m.test(sql.split('\n', 1)[0]);
  return { file, version: file.replace(/\.sql$/, ''), sql, checksum: sha256(sql), noTransaction };
}

// 러너는 커넥션 1개를 붙잡고 있어야 한다 — pg_advisory_lock 이 세션 단위이기 때문이다.
// 그래서 풀(api/lib/db.js)이 아니라 여기서 직접 연결한다. exec 는 문장이 여럿 든 마이그레이션 파일용.
const DRIVER = (process.env.DB_DRIVER || 'pg').trim();

async function connect() {
  if (DRIVER === 'pglite') {
    // 메모리 DB 는 프로세스와 함께 사라진다 — 마이그레이션이 남지 않으니 실수를 미리 막는다.
    if (!process.env.PGLITE_DATA_DIR) {
      throw new Error(
        'DB_DRIVER=pglite 로 마이그레이션하려면 PGLITE_DATA_DIR 이 필요합니다 ' +
        '(빈 값 = 메모리 DB 라 종료와 함께 사라집니다).',
      );
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const { lockDataDir } = await import('../api/lib/pglite-lock.js');
    lockDataDir(process.env.PGLITE_DATA_DIR);   // API 서버가 같은 디렉터리를 열고 있으면 여기서 멈춘다
    const db = await PGlite.create(process.env.PGLITE_DATA_DIR);
    return {
      query: (sql, params) => db.query(sql, params ?? [], { parsers: { 20: Number, 1700: Number } }),
      exec: (sql) => db.exec(sql),
      end: () => db.close(),
    };
  }
  const client = new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  await client.connect();
  await client.query(`SET client_encoding = 'UTF8'`);
  client.exec = (sql) => client.query(sql);   // pg 는 파라미터 없는 query 가 곧 simple protocol 이다
  return client;
}

async function bootstrap(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version     TEXT        PRIMARY KEY,
      checksum    TEXT        NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms INT         NOT NULL,
      applied_by  TEXT        NOT NULL
    )`);
}

async function appliedMap(client) {
  const { rows } = await client.query(
    `SELECT version, checksum FROM public.schema_migrations ORDER BY version`,
  );
  return new Map(rows.map((r) => [r.version, r.checksum]));
}

function verifyChecksums(applied, migrations) {
  for (const m of migrations) {
    const known = applied.get(m.version);
    if (known && known !== m.checksum) {
      throw new Error(
        `${m.file}: 적용된 마이그레이션이 수정되었습니다 (checksum 불일치). ` +
        `파일을 되돌리고 새 마이그레이션을 추가하세요.`,
      );
    }
  }
}

async function up(client) {
  const migrations = listMigrationFiles().map(readMigration);
  const applied = await appliedMap(client);
  verifyChecksums(applied, migrations);
  const pending = migrations.filter((m) => !applied.has(m.version));
  if (pending.length === 0) {
    console.log('적용할 마이그레이션이 없습니다.');
    return;
  }
  for (const m of pending) {
    const started = Date.now();
    if (m.noTransaction) {
      await client.exec(m.sql);
    } else {
      await client.query('BEGIN');
      try {
        await client.exec(m.sql);
        await client.query(
          `INSERT INTO public.schema_migrations (version, checksum, duration_ms, applied_by)
           VALUES ($1, $2, $3, $4)`,
          [m.version, m.checksum, Date.now() - started, process.env.USER || 'unknown'],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${m.file} 적용 실패: ${err.message}`);
      }
    }
    if (m.noTransaction) {
      await client.query(
        `INSERT INTO public.schema_migrations (version, checksum, duration_ms, applied_by)
         VALUES ($1, $2, $3, $4)`,
        [m.version, m.checksum, Date.now() - started, process.env.USER || 'unknown'],
      );
    }
    console.log(`✔ ${m.file} (${Date.now() - started}ms)`);
  }
}

async function status(client) {
  const migrations = listMigrationFiles().map(readMigration);
  const applied = await appliedMap(client);
  for (const m of migrations) {
    const known = applied.get(m.version);
    const state = !known ? 'pending' : known === m.checksum ? 'applied' : 'MODIFIED!';
    console.log(`${state.padEnd(9)} ${m.file}`);
  }
  for (const version of applied.keys()) {
    if (!migrations.some((m) => m.version === version)) {
      console.log(`missing   ${version} (이력에는 있으나 파일이 없음)`);
    }
  }
}

async function down(client) {
  const applied = await appliedMap(client);
  const versions = [...applied.keys()].sort();
  const last = versions[versions.length - 1];
  if (!last) {
    console.log('되돌릴 마이그레이션이 없습니다.');
    return;
  }
  const downFile = `${last}.down.sql`;
  let sql;
  try {
    sql = readFileSync(join(MIGRATIONS_DIR, downFile), 'utf8');
  } catch {
    throw new Error(`${downFile} 이 없습니다. down 파일 없는 마이그레이션은 되돌릴 수 없습니다.`);
  }
  await client.query('BEGIN');
  try {
    await client.exec(sql);
    await client.query(`DELETE FROM public.schema_migrations WHERE version = $1`, [last]);
    await client.query('COMMIT');
    console.log(`↩ ${downFile} 적용`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`${downFile} 실패: ${err.message}`);
  }
}

async function reset(client) {
  if (!process.argv.includes('--yes')) {
    throw new Error('reset 은 파괴적입니다. 확실하면 --yes 를 붙이세요.');
  }
  for (const t of RESET_TABLES) {
    await client.query(`DROP TABLE IF EXISTS public.${t} CASCADE`);
    console.log(`✖ DROP TABLE IF EXISTS public.${t}`);
  }
}

const command = process.argv[2];
const commands = { up, status, down, reset };
if (!commands[command]) {
  console.error(`사용법: node db/migrate.mjs <up|status|down|reset [--yes]>`);
  process.exit(1);
}

// connect() 도 실패할 수 있다(pglite 잠금 충돌 등) — 스택 대신 이유가 보이도록 같은 핸들러 안에 둔다.
let client = null;
try {
  client = await connect();
  await client.query(LOCK_KEY_SQL);
  await bootstrap(client);
  await commands[command](client);
} catch (err) {
  console.error(`[migrate:${command}] ${err.message}`);
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
