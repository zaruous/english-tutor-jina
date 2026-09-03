// db/inspect.mjs — 적용된 스키마를 사람이 읽는 형태로 덤프한다.
//
// 사용: npm run db:inspect [-- --target legacy|app]
//
// psql \d+ 를 못 쓰는 환경(Windows 콘솔 코드페이지)에서도 스키마를 확인하려고 만들었다.
// COMMENT ON 을 규약으로 붙였으므로 이 출력이 곧 스키마 문서다.
import 'dotenv/config';
import pg from 'pg';

const TARGETS = {
  legacy: { schema: 'public', database: () => process.env.PGDATABASE },
  app: { schema: process.env.DB_SCHEMA || 'app', database: () => process.env.PGDATABASE_APP || 'jina_eng' },
};
const i = process.argv.indexOf('--target');
const name = i === -1 ? 'app' : process.argv[i + 1];
if (!TARGETS[name]) {
  console.error(`알 수 없는 --target: ${name} (가능: ${Object.keys(TARGETS).join(', ')})`);
  process.exit(1);
}
const { schema, database } = TARGETS[name];

const c = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: database(),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
await c.connect();
await c.query(`SET client_encoding = 'UTF8'`);

const q = async (sql, p = []) => (await c.query(sql, p)).rows;

const [{ v }] = await q(`SELECT current_database() || ' / ' || $1 AS v`, [schema]);
const [{ c: schemaComment }] = await q(
  `SELECT obj_description(oid, 'pg_namespace') AS c FROM pg_namespace WHERE nspname = $1`, [schema]);
console.log(`\n${v}`);
if (schemaComment) console.log(`  ${schemaComment}`);

const tables = await q(`
  SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment,
         (SELECT count(*) FROM pg_attribute a
           WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS ncols,
         (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid) AS est_rows
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = $1 AND c.relkind = 'r'
   ORDER BY c.relname`, [schema]);

if (tables.length === 0) {
  console.log('\n(테이블 없음)');
  await c.end();
  process.exit(0);
}

// 공통 컬럼은 목록에서 접어 둔다 — 테이블마다 같아서 읽을 때 방해만 된다.
const COMMON = new Set([
  'description', 'is_active', 'is_deleted', 'deleted_at', 'deleted_by',
  'created_at', 'created_by', 'updated_at', 'updated_by',
  ...Array.from({ length: 10 }, (_, k) => `cmf_${k + 1}`),
]);

for (const t of tables) {
  console.log(`\n── ${t.name}  (컬럼 ${t.ncols}, 행 ~${t.est_rows < 0 ? 0 : t.est_rows})`);
  if (t.comment) console.log(`   ${t.comment}`);

  const cols = await q(`
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS notnull,
           pg_get_expr(d.adbin, d.adrelid) AS dflt,
           col_description(a.attrelid, a.attnum) AS comment
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = ($1 || '.' || $2)::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`, [schema, t.name]);

  const own = cols.filter((x) => !COMMON.has(x.name));
  const common = cols.filter((x) => COMMON.has(x.name));
  for (const x of own) {
    const bits = [x.type];
    if (x.notnull) bits.push('NOT NULL');
    if (x.dflt) bits.push(`= ${x.dflt}`);
    console.log(`   · ${x.name.padEnd(16)} ${bits.join(' ')}`);
    if (x.comment) console.log(`       ${x.comment}`);
  }
  if (common.length) console.log(`   · [공통 ${common.length}] ${common.map((x) => x.name).join(' ')}`);

  const cons = await q(`
    SELECT conname AS name, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid = ($1 || '.' || $2)::regclass
     ORDER BY contype, conname`, [schema, t.name]);
  for (const k of cons) console.log(`   ⊢ ${k.name}: ${k.def}`);

  const idx = await q(`
    SELECT indexname AS name, indexdef AS def FROM pg_indexes
     WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`, [schema, t.name]);
  for (const k of idx) {
    if (cons.some((x) => x.name === k.name)) continue;   // 제약이 만든 인덱스는 위에서 이미 보였다
    console.log(`   ⋯ ${k.def.replace(/^CREATE (UNIQUE )?INDEX \w+ ON [\w.]+ USING \w+ /, (m, u) => (u ? 'UNIQUE ' : ''))}`);
  }
}

console.log(`\n테이블 ${tables.length}개`);
await c.end();
