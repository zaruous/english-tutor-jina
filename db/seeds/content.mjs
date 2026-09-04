// db/seeds/content.mjs — db/content/*.json → 콘텐츠 카탈로그 (플랜 10.7 Phase 2)
//
// 콘텐츠 시드가 마이그레이션이 아니라 데이터인 이유: 체크섬 불변 마이그레이션 안에 있으면
// 관리자가 편집한 순간 db:reset 이 그것을 되돌린다. JSON 은 관리자 저작(플랜 13)의 export 대상이 된다.
// 전부 slug 기준 upsert 라 재실행이 안전하다.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../../api/lib/db.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));

// 시드 콘텐츠는 전부 공개 상태다 — status/visibility 축의 기본값(draft/private)이 아니라 명시한다.
async function upsertItem(client, { type, slug, title, description = '', difficulty = 3, source = 'seed', visibility = 'public' }) {
  const { rows: [row] } = await client.query(
    `INSERT INTO content_items (type, slug, title, description, difficulty, status, visibility, source)
     VALUES ($1, $2, $3, $4, $5, 'published', $6, $7)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title, description = EXCLUDED.description, difficulty = EXCLUDED.difficulty,
       status = 'published', visibility = EXCLUDED.visibility, source = EXCLUDED.source, updated_at = now()
     RETURNING id`,
    [type, slug, title, description, difficulty, visibility, source],
  );
  return row.id;
}

async function seedLessons(client) {
  const lessons = read('lessons.json');
  for (const l of lessons) {
    const id = await upsertItem(client, {
      type: 'lesson', slug: l.slug, title: l.title, difficulty: l.difficulty,
      source: l.source, visibility: l.visibility,
    });
    await client.query(
      `INSERT INTO lesson_details (content_id, kind, subtitle, est_minutes, passage, vocab, faq, position)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
       ON CONFLICT (content_id) DO UPDATE SET
         kind = EXCLUDED.kind, subtitle = EXCLUDED.subtitle, est_minutes = EXCLUDED.est_minutes,
         passage = EXCLUDED.passage, vocab = EXCLUDED.vocab, faq = EXCLUDED.faq, position = EXCLUDED.position`,
      [id, l.kind, l.subtitle, l.est_minutes, JSON.stringify(l.passage),
       JSON.stringify(l.vocab), JSON.stringify(l.faq), l.position],
    );
    // 문항은 JSON 이 단일 소스 — 파일에서 사라진 문항은 DB 에서도 지운다.
    await client.query(`DELETE FROM lesson_items WHERE content_id = $1 AND position > $2`,
      [id, l.items.length]);
    for (const it of l.items) {
      await client.query(
        `INSERT INTO lesson_items (content_id, position, stem, options, answer, explanation, skill_code)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT (content_id, position) DO UPDATE SET
           stem = EXCLUDED.stem, options = EXCLUDED.options, answer = EXCLUDED.answer,
           explanation = EXCLUDED.explanation, skill_code = EXCLUDED.skill_code`,
        [id, it.position, it.stem, JSON.stringify(it.options), it.answer, it.explanation, it.skill_code],
      );
    }
  }
  return lessons.length;
}

async function seedScenarios(client) {
  const scenarios = read('scenarios.json');
  for (const s of scenarios) {
    const id = await upsertItem(client, {
      type: 'scenario', slug: s.slug, title: s.title, description: s.description,
      source: s.source, visibility: s.visibility,
    });
    await client.query(
      `INSERT INTO scenario_details (content_id, tag, level, system_prompt, opening_message, objectives)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (content_id) DO UPDATE SET
         tag = EXCLUDED.tag, level = EXCLUDED.level, system_prompt = EXCLUDED.system_prompt,
         opening_message = EXCLUDED.opening_message, objectives = EXCLUDED.objectives`,
      [id, s.tag, s.level, s.system_prompt, s.opening_message, JSON.stringify(s.objectives)],
    );
  }
  return scenarios.length;
}

async function seedVocabSets(client) {
  const sets = read('vocab-sets.json');
  for (const v of sets) {
    const id = await upsertItem(client, {
      type: 'vocab_set', slug: v.slug, title: v.title, description: v.description,
      source: v.source, visibility: v.visibility,
    });
    await client.query(
      `INSERT INTO vocab_set_details (content_id, words) VALUES ($1, $2::jsonb)
       ON CONFLICT (content_id) DO UPDATE SET words = EXCLUDED.words`,
      [id, JSON.stringify(v.words)],
    );
  }
  return sets.length;
}

async function seedTopics(client) {
  const topics = read('topics.json');
  let links = 0;
  for (const t of topics) {
    const { rows: [topic] } = await client.query(
      `INSERT INTO topics (slug, label_ko, description, status, visibility)
       VALUES ($1, $2, $3, 'published', $4)
       ON CONFLICT (slug) DO UPDATE SET
         label_ko = EXCLUDED.label_ko, description = EXCLUDED.description,
         status = 'published', visibility = EXCLUDED.visibility, updated_at = now()
       RETURNING id`,
      [t.slug, t.label_ko, t.description, t.visibility],
    );
    for (const c of t.contents) {
      const { rowCount } = await client.query(
        `INSERT INTO topic_contents (topic_id, content_id, position)
         SELECT $1, ci.id, $3 FROM content_items ci WHERE ci.slug = $2
         ON CONFLICT (topic_id, content_id) DO UPDATE SET position = EXCLUDED.position`,
        [topic.id, c.content_slug, c.position],
      );
      if (!rowCount) throw new Error(`topics.json 이 없는 콘텐츠를 가리킵니다: ${c.content_slug}`);
      links += 1;
    }
  }
  return { topics: topics.length, links };
}

async function seedWords(client) {
  const words = read('vocab-words.json');
  for (const w of words) {
    await client.query(
      `INSERT INTO vocab_words (word, lang, pos, ipa, meaning_ko, examples, difficulty, source)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'seed')
       ON CONFLICT (word_key, lang) DO UPDATE SET
         pos = EXCLUDED.pos, ipa = EXCLUDED.ipa, meaning_ko = EXCLUDED.meaning_ko,
         examples = EXCLUDED.examples, difficulty = EXCLUDED.difficulty, updated_at = now()`,
      [w.word, w.lang, w.pos, w.ipa, w.meaning_ko, JSON.stringify(w.examples), w.difficulty],
    );
  }
  return words.length;
}

export async function seedContent(client) {
  const words = await seedWords(client);
  const lessons = await seedLessons(client);
  const scenarios = await seedScenarios(client);
  const sets = await seedVocabSets(client);
  const topics = await seedTopics(client);
  return { words, lessons, scenarios, sets, ...topics };
}

// 직접 실행하면 콘텐츠만 넣는다 (db:seed 는 개발 계정까지 함께).
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = await pool.connect();
  try {
    const n = await seedContent(client);
    console.log(`콘텐츠 시드 — 단어 ${n.words} · 레슨 ${n.lessons} · 시나리오 ${n.scenarios} · 단어세트 ${n.sets} · 토픽 ${n.topics}(연결 ${n.links})`);
  } finally {
    client.release();
    await pool.end();
  }
}
