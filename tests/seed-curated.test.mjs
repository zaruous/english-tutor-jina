// 재시드가 관리자 편집(source='curated')을 덮지 않는다 (플랜 13 결정 5 · 설계 검토 D4).
//
// setupDb() 가 마이그레이션 전체 + seedContent 1회를 이미 끝낸 상태에서 시작한다. 여기서는 행을
// "관리자가 고친 것처럼" 바꿔 놓고 seedContent 를 다시 돌려, 무엇이 남고(curated) 무엇이 JSON 으로
// 되돌아가는지(seed) 본다. 메타(content_items)만 지키고 본문(detail·문항)을 덮으면 반쪽 행이 되므로
// 세 계층을 전부 단정한다. pglite 메모리 DB 라 실 DB 를 건드리지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { seedContent } from '../db/seeds/content.mjs';
import { closeDb, pool, setupDb } from './helpers/db.mjs';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'content');
const readJson = (f) => JSON.parse(readFileSync(join(CONTENT_DIR, f), 'utf8'));

// JSON 에 실제로 있는 slug 를 고정한다 — 파일에서 사라지면 여기가 먼저 깨져 픽스처 드리프트를 알려준다.
const CURATED_LESSON = 'toeic-lc-short-conversation-1';
const SEED_LESSON = 'toeic-part7-set23';
const SCENARIO = 'business-interview-star';
const VOCAB_SET = 'business-interview-core-20';
const TOPIC = 'business-interview';

async function reseed() {
  const client = await pool.connect();
  try { return await seedContent(client); } finally { client.release(); }
}

async function itemBySlug(slug) {
  const { rows: [row] } = await pool.query(
    `SELECT id, title, description, difficulty, source, status, visibility FROM content_items WHERE slug = $1`, [slug],
  );
  return row;
}

async function curatedCount() {
  const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM content_items WHERE source = 'curated'`);
  return n;
}

before(async () => { await setupDb(); });
after(() => closeDb());

describe('seed-curated — 재시드와 관리자 편집', () => {
  it('curated 레슨은 메타·detail·문항이 전부 유지되고, seed 레슨은 JSON 으로 되돌아간다', async () => {
    const lessons = readJson('lessons.json');
    const jsonSeed = lessons.find((l) => l.slug === SEED_LESSON);
    const jsonCurated = lessons.find((l) => l.slug === CURATED_LESSON);
    assert.ok(jsonSeed && jsonCurated, '픽스처 slug 가 lessons.json 에 있어야 한다');

    // 관리자 편집을 흉내 낸다 — 메타·detail·문항 한 줄씩, 그리고 문항 하나 추가.
    const { id } = await itemBySlug(CURATED_LESSON);
    await pool.query(
      `UPDATE content_items SET source = 'curated', title = '관리자 수정본', difficulty = 5 WHERE id = $1`, [id],
    );
    await pool.query(`UPDATE lesson_details SET subtitle = '관리자 부제' WHERE content_id = $1`, [id]);
    await pool.query(`UPDATE lesson_items SET stem = '관리자 문항' WHERE content_id = $1 AND position = 1`, [id]);
    await pool.query(
      `INSERT INTO lesson_items (content_id, position, stem, options, answer, explanation)
       VALUES ($1, $2, '추가 문항', '[{"id":"A","text":"a"},{"id":"B","text":"b"}]'::jsonb, 'A', '(A)')`,
      [id, jsonCurated.items.length + 1],
    );
    // 같은 편집을 source 를 안 바꾼 seed 행에도 한다 — 이쪽은 되돌아가야 한다.
    await pool.query(`UPDATE content_items SET title = '되돌아갈 제목' WHERE slug = $1`, [SEED_LESSON]);

    const n = await reseed();
    assert.equal(n.curated, await curatedCount(), '건너뛴 수는 DB 의 curated 행 수와 같다');
    assert.equal(n.curated, 1);
    assert.equal(n.lessons, lessons.length, 'lessons 카운트는 건너뛴 행을 포함한 JSON 전체다');

    const kept = await itemBySlug(CURATED_LESSON);
    assert.equal(kept.source, 'curated');
    assert.equal(kept.title, '관리자 수정본');
    assert.equal(kept.difficulty, 5);
    const { rows: [detail] } = await pool.query(`SELECT subtitle FROM lesson_details WHERE content_id = $1`, [id]);
    assert.equal(detail.subtitle, '관리자 부제');
    const { rows: items } = await pool.query(
      `SELECT position, stem FROM lesson_items WHERE content_id = $1 ORDER BY position`, [id],
    );
    assert.equal(items.length, jsonCurated.items.length + 1, '추가한 문항이 DELETE position > n 에 잘리지 않는다');
    assert.equal(items[0].stem, '관리자 문항');

    const restored = await itemBySlug(SEED_LESSON);
    assert.equal(restored.source, 'seed');
    assert.equal(restored.title, jsonSeed.title);
  });

  it('curated 시나리오·단어세트도 detail 본문이 유지된다', async () => {
    const scenario = await itemBySlug(SCENARIO);
    const vocab = await itemBySlug(VOCAB_SET);
    await pool.query(`UPDATE content_items SET source = 'curated', description = '관리자 설명' WHERE id = ANY($1)`,
      [[scenario.id, vocab.id]]);
    await pool.query(`UPDATE scenario_details SET system_prompt = '관리자 프롬프트' WHERE content_id = $1`, [scenario.id]);
    await pool.query(`UPDATE vocab_set_details SET words = '["only"]'::jsonb WHERE content_id = $1`, [vocab.id]);

    const n = await reseed();
    assert.equal(n.curated, await curatedCount());
    assert.ok(n.curated >= 2, '앞 테스트의 레슨이 남아 있어도 최소 2');

    assert.equal((await itemBySlug(SCENARIO)).description, '관리자 설명');
    assert.equal((await itemBySlug(VOCAB_SET)).description, '관리자 설명');
    const { rows: [sd] } = await pool.query(`SELECT system_prompt FROM scenario_details WHERE content_id = $1`, [scenario.id]);
    assert.equal(sd.system_prompt, '관리자 프롬프트');
    const { rows: [vd] } = await pool.query(`SELECT words FROM vocab_set_details WHERE content_id = $1`, [vocab.id]);
    assert.deepEqual(vd.words, ['only']);
  });

  it('curated 를 seed 로 되돌리면 다음 재시드가 다시 덮는다', async () => {
    // 보호는 source 값 하나에 걸려 있다 — 관리자가 "JSON 으로 초기화" 하려면 source 만 되돌리면 된다.
    await pool.query(`UPDATE content_items SET source = 'seed' WHERE slug = $1`, [CURATED_LESSON]);
    await reseed();
    const jsonCurated = readJson('lessons.json').find((l) => l.slug === CURATED_LESSON);
    const row = await itemBySlug(CURATED_LESSON);
    assert.equal(row.title, jsonCurated.title);
    assert.equal(row.difficulty, jsonCurated.difficulty);
    const { rows: [{ n }] } = await pool.query(
      `SELECT count(*)::int AS n FROM lesson_items WHERE content_id = $1`, [row.id],
    );
    assert.equal(n, jsonCurated.items.length, '추가했던 문항은 JSON 기준으로 잘린다');
  });

  it('topics 는 source 축이 없어 재시드가 항상 덮는다 (알려진 한계)', async () => {
    // content.mjs 의 seedTopics 주석과 짝이다 — 토픽에 source 를 얹는 마이그레이션이 들어오면 이 단정을 뒤집는다.
    const json = readJson('topics.json').find((t) => t.slug === TOPIC);
    await pool.query(`UPDATE topics SET label_ko = '관리자 라벨' WHERE slug = $1`, [TOPIC]);
    await reseed();
    const { rows: [t] } = await pool.query(`SELECT label_ko FROM topics WHERE slug = $1`, [TOPIC]);
    assert.equal(t.label_ko, json.label_ko);
  });
});
