// db/seeds/content.mjs — db/content/*.json → 콘텐츠 카탈로그 (플랜 10.7 Phase 2)
//
// 콘텐츠 시드가 마이그레이션이 아니라 데이터인 이유: 체크섬 불변 마이그레이션 안에 있으면
// 관리자가 편집한 순간 db:reset 이 그것을 되돌린다. JSON 은 관리자 저작(플랜 13)의 export 대상이 된다.
// 전부 slug 기준 upsert 라 재실행이 안전하다.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from '../../api/lib/db.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));

// 시드 콘텐츠는 전부 공개 상태다 — status/visibility 축의 기본값(draft/private)이 아니라 명시한다.
//
// 관리자가 고친 행(source='curated', 플랜 13 결정 5)은 재시드가 덮지 않는다. DO UPDATE 의 WHERE 가
// 그 행을 건너뛰면 RETURNING 도 비어 오므로, 그때는 slug 로 id 를 다시 얻고 curated 라고 표시해 돌려준다.
// 호출자는 curated 면 detail(본문·문항)도 건너뛰어야 한다 — 여기서 메타만 지키고 본문을 덮으면
// 제목은 관리자 것, 지문은 JSON 것인 반쪽 행이 된다.
async function upsertItem(client, { type, slug, title, description = '', difficulty = 3, source = 'seed', visibility = 'public' }) {
  const { rows: [row] } = await client.query(
    `INSERT INTO content_items (type, slug, title, description, difficulty, status, visibility, source)
     VALUES ($1, $2, $3, $4, $5, 'published', $6, $7)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title, description = EXCLUDED.description, difficulty = EXCLUDED.difficulty,
       status = 'published', visibility = EXCLUDED.visibility, source = EXCLUDED.source, updated_at = now()
     WHERE content_items.source <> 'curated'
     RETURNING id`,
    [type, slug, title, description, difficulty, visibility, source],
  );
  if (row) return { id: row.id, curated: false };
  const { rows: [existing] } = await client.query(`SELECT id FROM content_items WHERE slug = $1`, [slug]);
  // 행이 안 돌아오는 경우는 curated 충돌뿐이다. 그런데 slug 도 없다면 전제가 깨진 것이라 조용히 넘기지 않는다.
  if (!existing) throw new Error(`content_items upsert 가 행을 돌려주지 않았는데 slug 도 없습니다: ${slug}`);
  return { id: existing.id, curated: true };
}

async function seedLessons(client) {
  const lessons = read('lessons.json');
  let curated = 0;
  for (const l of lessons) {
    const { id, curated: keep } = await upsertItem(client, {
      type: 'lesson', slug: l.slug, title: l.title, difficulty: l.difficulty,
      source: l.source, visibility: l.visibility,
    });
    if (keep) { curated += 1; continue; }   // 문항 삭제(아래 DELETE)까지 전부 건너뛴다
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
  return { n: lessons.length, curated };
}

async function seedScenarios(client) {
  const scenarios = read('scenarios.json');
  let curated = 0;
  for (const s of scenarios) {
    const { id, curated: keep } = await upsertItem(client, {
      type: 'scenario', slug: s.slug, title: s.title, description: s.description,
      source: s.source, visibility: s.visibility,
    });
    if (keep) { curated += 1; continue; }
    await client.query(
      `INSERT INTO scenario_details (content_id, tag, level, system_prompt, opening_message, objectives)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (content_id) DO UPDATE SET
         tag = EXCLUDED.tag, level = EXCLUDED.level, system_prompt = EXCLUDED.system_prompt,
         opening_message = EXCLUDED.opening_message, objectives = EXCLUDED.objectives`,
      [id, s.tag, s.level, s.system_prompt, s.opening_message, JSON.stringify(s.objectives)],
    );
  }
  return { n: scenarios.length, curated };
}

async function seedVocabSets(client) {
  const sets = read('vocab-sets.json');
  let curated = 0;
  for (const v of sets) {
    const { id, curated: keep } = await upsertItem(client, {
      type: 'vocab_set', slug: v.slug, title: v.title, description: v.description,
      source: v.source, visibility: v.visibility,
    });
    if (keep) { curated += 1; continue; }
    await client.query(
      `INSERT INTO vocab_set_details (content_id, words) VALUES ($1, $2::jsonb)
       ON CONFLICT (content_id) DO UPDATE SET words = EXCLUDED.words`,
      [id, JSON.stringify(v.words)],
    );
  }
  return { n: sets.length, curated };
}

// topics 에는 source 컬럼이 없어(0001 baseline) curated 보호를 걸 수 없다 — 관리자가 라벨·구성을 고쳐도
// 재시드가 topics.json 대로 되돌린다. 토픽 저작(플랜 13 Phase B)이 시드 토픽을 고치기 시작하면
// source 축을 topics 에도 얹는 마이그레이션이 먼저다. 그때까지는 시드 토픽은 JSON 이 단일 소스다.
// 기존 토픽의 status·visibility 는 재시드가 건드리지 않는다 — 관리자가 내린(archived) 시드 토픽을
// db:seed 한 번이 다시 공개해 버리면 안 된다(라운드 05 리뷰). topics 에는 source 축이 없어 content_items 처럼
// curated 로 가를 수 없으니, 처음 INSERT 만 published/public 이고 그 뒤 상태는 관리 API 가 단일 소스다.
async function seedTopics(client) {
  const topics = read('topics.json');
  let links = 0;
  for (const t of topics) {
    const { rows: [topic] } = await client.query(
      `INSERT INTO topics (slug, label_ko, description, status, visibility)
       VALUES ($1, $2, $3, 'published', $4)
       ON CONFLICT (slug) DO UPDATE SET
         label_ko = EXCLUDED.label_ko, description = EXCLUDED.description, updated_at = now()
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

// curated 는 세 종류를 합친 "재시드가 건너뛴 행" 수 — 0 이 아니면 JSON 과 DB 가 어긋난 행이 그만큼 있다는 뜻이다.
export async function seedContent(client) {
  const words = await seedWords(client);
  const lessons = await seedLessons(client);
  const scenarios = await seedScenarios(client);
  const sets = await seedVocabSets(client);
  const topics = await seedTopics(client);
  return {
    words, lessons: lessons.n, scenarios: scenarios.n, sets: sets.n, ...topics,
    curated: lessons.curated + scenarios.curated + sets.curated,
  };
}

// 직접 실행하면 콘텐츠만 넣는다 (db:seed 는 개발 계정까지 함께).
// 비교는 pathToFileURL 로 한다 — `file://${argv[1]}` 문자열 결합은 Windows 에서 백슬래시·공백(%20)이
// 인코딩되지 않아 항상 false 였고, npm run db:seed:content 가 아무 일도 하지 않고 exit 0 으로 끝났다.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = await pool.connect();
  try {
    const n = await seedContent(client);
    console.log(`콘텐츠 시드 — 단어 ${n.words} · 레슨 ${n.lessons} · 시나리오 ${n.scenarios} · 단어세트 ${n.sets} · 토픽 ${n.topics}(연결 ${n.links}) · curated 건너뜀 ${n.curated}`);
  } finally {
    client.release();
    await pool.end();
  }
}
