// db/new-migration.mjs — 마이그레이션 짝(up + down) 생성기
//
// 사용: npm run db:new -- add_speaking_set_details
//
// 번호를 손으로 매기면 언젠가 중복되고, down 파일은 잊는다. 둘 다 자동으로 만든다.
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

const raw = argv.join('_').trim();
if (!raw) {
  console.error('사용법: npm run db:new -- <snake_case_이름>');
  process.exit(1);
}
const name = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
if (!/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error(`이름이 규칙에 맞지 않습니다: ${name} (소문자·숫자·밑줄)`);
  process.exit(1);
}

const used = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .map((f) => Number(f.slice(0, 4)));
const next = String((used.length ? Math.max(...used) : 0) + 1).padStart(4, '0');

const upFile = `${next}_${name}.sql`;
const downFile = `${next}_${name}.down.sql`;
for (const f of [upFile, downFile]) {
  if (existsSync(join(MIGRATIONS_DIR, f))) {
    console.error(`이미 있습니다: ${f}`);
    process.exit(1);
  }
}

const up = `-- ${upFile}
-- 무엇을 왜 바꾸는지 한 줄. 관련 플랜: docs/plan/NN-*.md
--
-- 규칙 (db/README.md)
--   · 적용된 뒤에는 수정 금지 — 체크섬 불일치로 러너가 실패한다. 고칠 것은 새 번호로.
--   · 멱등하게(IF NOT EXISTS). 파일당 1 트랜잭션(러너가 감싼다).
--   · 트랜잭션 밖에서 돌아야 하면 이 파일 1행에 -- migrate:no-transaction
--   · 스키마 접두를 쓰지 않는다 — 러너가 search_path 를 DB_SCHEMA 하나로 고정한다.
--   · 콘텐츠(레슨·시나리오·단어)는 마이그레이션이 아니라 db/content/*.json 에 넣는다.

`;

const down = `-- ${downFile}
-- ${upFile} 을 되돌린다. 데이터 손실이 있으면 여기 적어 둘 것.

`;

writeFileSync(join(MIGRATIONS_DIR, upFile), up, 'utf8');
writeFileSync(join(MIGRATIONS_DIR, downFile), down, 'utf8');
console.log(`+ db/migrations/${upFile}`);
console.log(`+ db/migrations/${downFile}`);
