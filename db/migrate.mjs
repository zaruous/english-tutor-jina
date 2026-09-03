// db/migrate.mjs — 마이그레이션 러너 (up / status / down / reset)
//
// 사용: node db/migrate.mjs <up|status|down|reset> [--target legacy|app] [--yes]
//
// 규칙 (docs/PLAN-vocab-backend.md Phase 1, db/README.md):
//  - 파일명 NNNN_snake_case.sql (4자리 0패딩, 사전순 = 적용순, 번호 재사용 금지)
//  - 이력: <schema>.schema_migrations (러너가 부트스트랩)
//  - 체크섬 강제: 적용된 파일을 수정하면 즉시 실패
//  - pg_advisory_lock 으로 동시 실행 차단
//  - SQL 문 분할 금지: client.query(파일 전체) — $$ … $$ 본문 보호
//  - 파일당 1 트랜잭션 (1행 "-- migrate:no-transaction" 이면 예외)
//  - reset: legacy 는 명시 목록만 DROP(다른 앱 테이블과 동거), app 은 스키마째 DROP. 둘 다 --yes 필수
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DB_DIR = dirname(fileURLToPath(import.meta.url));
const LOCK_KEY_SQL = `SELECT pg_advisory_lock(hashtext('jina_migrations'))`;

// 적용 대상 두 개가 공존한다 (플랜 10.7 이관 중).
//   legacy — 옛 DB `jina` 의 public 스키마. 다른 앱 테이블 11개가 같이 산다 → 명시 목록만 DROP.
//   app    — 전용 DB `jina_eng` 의 app 스키마. 우리 것뿐이라 스키마째 DROP 해도 된다.
// Phase 2 에서 legacy 를 삭제하면 이 분기도 사라진다.
const TARGETS = {
  legacy: {
    dir: 'migrations',
    schema: 'public',
    database: () => process.env.PGDATABASE,
    resetMode: 'tables',
  },
  app: {
    dir: 'baseline',
    schema: process.env.DB_SCHEMA || 'app',
    database: () => process.env.PGDATABASE_APP || 'jina_eng',
    resetMode: 'schema',
  },
};

const targetName = (() => {
  const i = process.argv.indexOf('--target');
  const v = i === -1 ? 'legacy' : process.argv[i + 1];
  if (!TARGETS[v]) {
    console.error(`알 수 없는 --target: ${v} (가능: ${Object.keys(TARGETS).join(', ')})`);
    process.exit(1);
  }
  return v;
})();
const TARGET = TARGETS[targetName];
const SCHEMA = TARGET.schema;
const MIGRATIONS_DIR = join(DB_DIR, TARGET.dir);
const HISTORY = `${SCHEMA}.schema_migrations`;

// reset 이 지울 수 있는 테이블의 전체 목록 — FK 역순. 여기 없는 테이블은 절대 건드리지 않는다.
const RESET_TABLES = [
  'user_audit_log',
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
  'roles',
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

async function connect() {
  const client = new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: TARGET.database(),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  await client.connect();
  await client.query(`SET client_encoding = 'UTF8'`);
  return client;
}

async function bootstrap(client) {
  if (SCHEMA !== 'public') {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  }
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${HISTORY} (
      version     TEXT        PRIMARY KEY,
      checksum    TEXT        NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms INT         NOT NULL,
      applied_by  TEXT        NOT NULL
    )`);
}

async function appliedMap(client) {
  const { rows } = await client.query(
    `SELECT version, checksum FROM ${HISTORY} ORDER BY version`,
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
      await client.query(m.sql);
    } else {
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(
          `INSERT INTO ${HISTORY} (version, checksum, duration_ms, applied_by)
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
        `INSERT INTO ${HISTORY} (version, checksum, duration_ms, applied_by)
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
    await client.query(sql);
    await client.query(`DELETE FROM ${HISTORY} WHERE version = $1`, [last]);
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
  if (TARGET.resetMode === 'schema') {
    // 전용 DB 라 스키마째 지운다. public 이면 절대 안 된다 — 남의 테이블이 산다.
    if (SCHEMA === 'public') throw new Error('public 스키마는 통째로 드롭하지 않습니다.');
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    console.log(`✖ DROP SCHEMA ${SCHEMA} CASCADE`);
    return;
  }
  for (const t of RESET_TABLES) {
    await client.query(`DROP TABLE IF EXISTS public.${t} CASCADE`);
    console.log(`✖ DROP TABLE IF EXISTS public.${t}`);
  }
}

const command = process.argv[2];
const commands = { up, status, down, reset };
if (!commands[command]) {
  console.error(`사용법: node db/migrate.mjs <up|status|down|reset> [--target legacy|app] [--yes]`);
  process.exit(1);
}

const client = await connect();
console.log(`[migrate:${command}] target=${targetName} db=${TARGET.database()} schema=${SCHEMA} dir=db/${TARGET.dir}`);
try {
  await client.query(LOCK_KEY_SQL);
  await bootstrap(client);
  await commands[command](client);
} catch (err) {
  console.error(`[migrate:${command}] ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
