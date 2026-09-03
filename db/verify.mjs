// db/verify.mjs — 스키마 변경 관리 오프라인 점검 (DB 접속 불필요)
//
// 사용: npm run db:verify
// CI 와 커밋 훅에서 돌린다. DB 가 있어야 알 수 있는 것(체크섬 드리프트)은 db:status 가 본다.
//
// 왜 필요한가: 규약(공통 컬럼 · COMMENT · down 파일 · 번호)은 사람이 지키기로 한 것이라
// 반드시 어긋난다. 어긋난 순간 실패하게 만들어 두면 규약이 문서가 아니라 게이트가 된다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(DB_DIR, 'migrations');
const BASELINE_DIR = join(DB_DIR, 'baseline');

const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

function read(path, file) {
  const sql = readFileSync(join(path, file), 'utf8');
  if (sql.charCodeAt(0) === 0xfeff) fail(file, 'BOM 이 있습니다. BOM 없는 UTF-8 로 저장하세요.');
  return sql;
}

// ── 1. 어느 SQL 에서도 금지 ───────────────────────────────────────────
const FORBIDDEN = [
  [/DROP\s+SCHEMA\s+public/i, 'DROP SCHEMA public — 다른 앱 테이블이 사는 스키마입니다.'],
  [/^\s*\\[a-z]/im, 'psql 메타 명령(\\i, \\copy 등) — 러너는 node+pg 로 실행합니다.'],
];

function checkForbidden(file, sql) {
  for (const [re, msg] of FORBIDDEN) if (re.test(sql)) fail(file, msg);
}

// ── 2. migrations/ — 번호 · down 짝 ───────────────────────────────────
function checkMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return;
  const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const ups = all.filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();

  for (const f of all) {
    if (!/^\d{4}_[a-z0-9_]+(\.down)?\.sql$/.test(f)) {
      fail(f, '파일명 규칙 위반 — NNNN_snake_case[.down].sql');
    }
  }

  const seen = new Map();
  for (const f of ups) {
    const v = f.slice(0, 4);
    if (seen.has(v)) fail(f, `번호 중복: ${v} (이미 ${seen.get(v)})`);
    seen.set(v, f);

    checkForbidden(f, read(MIGRATIONS_DIR, f));
    const down = f.replace(/\.sql$/, '.down.sql');
    if (!existsSync(join(MIGRATIONS_DIR, down))) {
      fail(f, `${down} 이 없습니다 — 되돌릴 수 없는 마이그레이션입니다.`);
    }
  }
  return ups.length;
}

// ── 3. baseline/ — 공통 컬럼 규약 · COMMENT ───────────────────────────
// 규약(10.7 §3.4): 만들어진 모든 테이블은
//   (a) 공통 컬럼 루프의 full_set 또는 log_set 에 들어 있거나
//   (b) `-- common:exempt <table>` 로 이유와 함께 면제 선언되어야 하고,
//   (c) COMMENT ON TABLE 이 있어야 한다.
function checkBaseline() {
  if (!existsSync(BASELINE_DIR)) return 0;
  const files = readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const f of files) {
    const sql = read(BASELINE_DIR, f);
    checkForbidden(f, sql);

    const created = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?app\.(\w+)/gi)]
      .map((m) => m[1]);
    const commented = new Set(
      [...sql.matchAll(/COMMENT\s+ON\s+TABLE\s+app\.(\w+)/gi)].map((m) => m[1]),
    );
    const exempt = new Set(
      [...sql.matchAll(/--\s*common:exempt\s+(\w+)/gi)].map((m) => m[1]),
    );
    // 공통 컬럼은 DO 루프가 붙인다. 루프가 도는 테이블 이름은 ARRAY['a','b'] 리터럴에 있다.
    // 변수 이름(full_set 등)에 기대지 않는다 — 파일마다 다르게 쓸 수 있다.
    // 만든 테이블 이름과 겹치는 것만 취해 무관한 배열이 섞이는 것을 막는다.
    const inLoop = new Set();
    for (const arr of sql.matchAll(/ARRAY\[([^\]]*)\]/gi)) {
      for (const q of arr[1].matchAll(/'([^']+)'/g)) {
        if (created.includes(q[1])) inLoop.add(q[1]);
      }
    }

    for (const t of created) {
      if (!commented.has(t)) fail(f, `app.${t} — COMMENT ON TABLE 이 없습니다.`);
      if (!inLoop.has(t) && !exempt.has(t)) {
        fail(f, `app.${t} — 공통 컬럼 루프에도 없고 '-- common:exempt ${t}' 선언도 없습니다.`);
      }
      if (inLoop.has(t) && exempt.has(t)) {
        fail(f, `app.${t} — 공통 컬럼 루프와 면제 선언에 동시에 있습니다.`);
      }
    }
    for (const t of exempt) {
      if (!created.includes(t)) fail(f, `common:exempt ${t} — 그런 테이블을 만들지 않습니다.`);
    }
  }
  return files.length;
}

const nMig = checkMigrations() ?? 0;
const nBase = checkBaseline();

if (problems.length) {
  console.error(`[db:verify] ${problems.length}건\n`);
  for (const p of problems) console.error(`  ✖ ${p}`);
  process.exit(1);
}
console.log(`[db:verify] 통과 — migrations ${nMig}개 · baseline ${nBase}개 파일`);
