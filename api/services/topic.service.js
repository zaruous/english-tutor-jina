// 토픽 서비스 — 콘텐츠 수와 진행률은 저장하지 않고 관계/이벤트 테이블에서 매 요청 계산한다.
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';

// 콘텐츠 가시성 판정은 타입과 무관하게 같다 — content_items 한 곳만 본다 (플랜 10.7 Phase 2).
// $1 은 항상 user_id: 소유자는 자기 비공개 콘텐츠도 본다.
const VISIBLE = (a) => `${a}.status = 'published' AND (${a}.visibility = 'public' OR ${a}.created_by = $1)`;
// 토픽 구성은 (topic_id, content_id) 단일 FK 다 — 배타 FK 3종과 부분 UNIQUE 가 사라졌다.
const OF_TYPE = (a, type) => `${a}.type = '${type}' AND ${VISIBLE(a)}`;

const TOPIC_SUMMARY = `
  SELECT t.id, t.slug, t.label_ko, t.description, t.visibility,
         (SELECT count(*)::int
            FROM topic_contents tc
            JOIN content_items l ON l.id = tc.content_id
           WHERE tc.topic_id = t.id AND ${OF_TYPE('l', 'lesson')}) AS lesson_count,
         (SELECT count(*)::int
            FROM topic_contents tc
            JOIN content_items s ON s.id = tc.content_id
           WHERE tc.topic_id = t.id AND ${OF_TYPE('s', 'scenario')}) AS scenario_count,
         (SELECT COALESCE(sum(jsonb_array_length(vd.words)), 0)::int
            FROM topic_contents tc
            JOIN content_items v ON v.id = tc.content_id
            JOIN vocab_set_details vd ON vd.content_id = v.id
           WHERE tc.topic_id = t.id AND ${OF_TYPE('v', 'vocab_set')}) AS vocab_count
    FROM topics t
   WHERE ${VISIBLE('t')}`;

function topicDto(row) {
  const eligible = row.lesson_count >= 3 && row.scenario_count >= 1 && row.vocab_count >= 20;
  return {
    id: row.id, slug: row.slug, label_ko: row.label_ko, description: row.description,
    lesson_count: row.lesson_count, scenario_count: row.scenario_count,
    vocab_count: row.vocab_count, eligible,
  };
}

export async function listTopics(user, { includeIneligible = false } = {}) {
  const { rows } = await pool.query(`${TOPIC_SUMMARY} ORDER BY t.created_at, t.id`, [user.id]);
  const topics = rows.map(topicDto);
  return includeIneligible ? topics : topics.filter((t) => t.eligible);
}

async function getTopicRow(user, topicId) {
  const { rows: [row] } = await pool.query(
    `SELECT * FROM (${TOPIC_SUMMARY}) q WHERE q.id = $2`,
    [user.id, topicId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
  return row;
}

export async function getTopic(user, topicId) {
  const row = await getTopicRow(user, topicId);
  const topic = topicDto(row);
  const [lessonsResult, scenariosResult, setsResult, progressResult] = await Promise.all([
    pool.query(
      `SELECT l.id, l.slug, d.kind, l.title, d.subtitle, l.difficulty, d.est_minutes,
              l.source, l.visibility,
              (SELECT count(*)::int FROM lesson_items i WHERE i.content_id = l.id) AS question_count,
              (SELECT count(*)::int FROM user_lesson_attempts a
                WHERE a.user_id = $1 AND a.content_id = l.id) AS attempt_count,
              (SELECT max(correct_count)::int FROM user_lesson_attempts a
                WHERE a.user_id = $1 AND a.content_id = l.id) AS best_correct
         FROM topic_contents tc
         JOIN content_items l ON l.id = tc.content_id
         JOIN lesson_details d ON d.content_id = l.id
        WHERE tc.topic_id = $2 AND ${OF_TYPE('l', 'lesson')}
        ORDER BY tc.position, tc.id`,
      [user.id, topicId],
    ),
    pool.query(
      `SELECT s.id, s.slug, s.title, sd.tag, sd.level, s.description,
              sd.opening_message, sd.objectives, s.source, s.visibility
         FROM topic_contents tc
         JOIN content_items s ON s.id = tc.content_id
         JOIN scenario_details sd ON sd.content_id = s.id
        WHERE tc.topic_id = $2 AND ${OF_TYPE('s', 'scenario')}
        ORDER BY tc.position, tc.id`,
      [user.id, topicId],
    ),
    pool.query(
      `SELECT v.id, v.slug, v.title, v.description, vd.words, v.source, v.visibility
         FROM topic_contents tc
         JOIN content_items v ON v.id = tc.content_id
         JOIN vocab_set_details vd ON vd.content_id = v.id
        WHERE tc.topic_id = $2 AND ${OF_TYPE('v', 'vocab_set')}
        ORDER BY tc.position, tc.id`,
      [user.id, topicId],
    ),
    pool.query(
      `WITH topic_lessons AS (
         -- 분모도 화면 목록과 같은 가시성 규칙 — 남의 private 생성물이 진행률 분모에 섞이면 안 된다.
         SELECT tc.content_id AS lesson_id FROM topic_contents tc
           JOIN content_items l ON l.id = tc.content_id
          WHERE tc.topic_id = $2 AND ${OF_TYPE('l', 'lesson')}
       ), topic_scenarios AS (
         SELECT tc.content_id AS scenario_id FROM topic_contents tc
           JOIN content_items s ON s.id = tc.content_id
          WHERE tc.topic_id = $2 AND ${OF_TYPE('s', 'scenario')}
       ), topic_words AS (
         SELECT DISTINCT lower(x.word->>'word') AS word
           FROM topic_contents tc
           JOIN content_items vs ON vs.id = tc.content_id
           JOIN vocab_set_details vsd ON vsd.content_id = vs.id
           CROSS JOIN LATERAL jsonb_array_elements(vsd.words) x(word)
          WHERE tc.topic_id = $2 AND ${OF_TYPE('vs', 'vocab_set')}
       )
       SELECT
         (SELECT count(*)::int FROM topic_lessons) AS lesson_total,
         (SELECT count(DISTINCT a.content_id)::int
            FROM user_lesson_attempts a JOIN topic_lessons tl ON tl.lesson_id = a.content_id
           WHERE a.user_id = $1) AS lesson_done,
         (SELECT count(*)::int FROM topic_scenarios) AS scenario_total,
         (SELECT count(DISTINCT s.scenario_id)::int
            FROM conversation_sessions s JOIN topic_scenarios ts ON ts.scenario_id = s.scenario_id
           WHERE s.user_id = $1 AND EXISTS (
             SELECT 1 FROM conversation_messages m WHERE m.session_id = s.id AND m.role = 'user'
           )) AS scenario_done,
         (SELECT count(*)::int FROM topic_words) AS vocab_total,
         (SELECT count(DISTINCT tw.word)::int
            FROM topic_words tw
            JOIN vocab_words w ON lower(w.word) = tw.word
            JOIN user_vocab_cards c ON c.word_id = w.id AND c.user_id = $1 AND NOT c.suspended) AS vocab_done`,
      [user.id, topicId],
    ),
  ]);
  const p = progressResult.rows[0];
  const done = p.lesson_done + p.scenario_done + p.vocab_done;
  const total = p.lesson_total + p.scenario_total + p.vocab_total;
  return {
    topic,
    lessons: lessonsResult.rows,
    scenarios: scenariosResult.rows,
    vocab_sets: setsResult.rows,
    progress: {
      lesson: { done: p.lesson_done, total: p.lesson_total },
      conversation: { done: p.scenario_done, total: p.scenario_total },
      vocabulary: { done: p.vocab_done, total: p.vocab_total },
      percent: total ? Math.round((done / total) * 100) : 0,
    },
  };
}

export async function listScenarios(user, { topicId } = {}) {
  const params = [user.id];
  let join = '';
  let where = OF_TYPE('s', 'scenario');
  if (topicId) {
    params.push(topicId);
    join = `JOIN topic_contents tc ON tc.content_id = s.id`;
    where += ` AND tc.topic_id = $2`;
  }
  const { rows } = await pool.query(
    `SELECT s.id, s.slug, s.title, sd.tag, sd.level, s.description,
            sd.opening_message, sd.objectives, s.source, s.visibility
       FROM content_items s
       JOIN scenario_details sd ON sd.content_id = s.id ${join}
      WHERE ${where}
      ORDER BY s.created_at, s.id`,
    params,
  );
  return rows;
}

export async function getScenarioForSession(user, scenarioId, client = pool) {
  const { rows: [row] } = await client.query(
    `SELECT s.id, s.slug, s.title, sd.tag, sd.level, s.description,
            sd.system_prompt, sd.opening_message, sd.objectives
       FROM content_items s
       JOIN scenario_details sd ON sd.content_id = s.id
      WHERE s.id = $2 AND ${OF_TYPE('s', 'scenario')}`,
    [user.id, scenarioId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '회화 시나리오를 찾을 수 없습니다.');
  return row;
}

export async function addVocabSetToCards(user, vocabSetId) {
  return withTx(async (client) => {
    const { rows: [set] } = await client.query(
      `SELECT v.id, vd.words FROM content_items v
         JOIN vocab_set_details vd ON vd.content_id = v.id
        WHERE v.id = $2 AND ${OF_TYPE('v', 'vocab_set')}`,
      [user.id, vocabSetId],
    );
    if (!set) throw new HttpError(404, 'NOT_FOUND', '단어 세트를 찾을 수 없습니다.');
    let added = 0;
    let duplicates = 0;
    for (const w of set.words || []) {
      const word = String(w?.word || '').trim();
      const meaning = String(w?.meaning_ko || '').trim();
      if (!word || !meaning) continue;
      const examples = [w.example_en].filter(Boolean);
      const { rows: inserted } = await client.query(
        `INSERT INTO vocab_words
           (word, pos, ipa, meaning_ko, examples, difficulty, source, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'lesson', $7)
         ON CONFLICT (word_key, lang) DO NOTHING
         RETURNING id`,
        [word, w.pos ?? null, w.ipa ?? null, meaning, JSON.stringify(examples),
         Number.isInteger(w.difficulty) ? w.difficulty : 3, user.id],
      );
      let wordId = inserted[0]?.id;
      if (!wordId) {
        const { rows: [existing] } = await client.query(
          `SELECT id FROM vocab_words WHERE word_key = lower(btrim($1)) AND lang = 'en'`,
          [word],
        );
        wordId = existing?.id;
      }
      if (!wordId) continue;
      const { rowCount } = await client.query(
        `INSERT INTO user_vocab_cards (user_id, word_id)
         VALUES ($1, $2) ON CONFLICT (user_id, word_id) DO NOTHING`,
        [user.id, wordId],
      );
      if (rowCount) added += 1; else duplicates += 1;
    }
    return { added, duplicates, total: added + duplicates };
  });
}
