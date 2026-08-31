// 토픽 서비스 — 콘텐츠 수와 진행률은 저장하지 않고 관계/이벤트 테이블에서 매 요청 계산한다.
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';

const TOPIC_SUMMARY = `
  SELECT t.id, t.slug, t.label_ko, t.description, t.visibility,
         (SELECT count(*)::int
            FROM public.topic_contents tc
            JOIN public.lessons l ON l.id = tc.lesson_id
           WHERE tc.topic_id = t.id AND l.published
             AND (l.visibility = 'public' OR l.created_by = $1)) AS lesson_count,
         (SELECT count(*)::int
            FROM public.topic_contents tc
            JOIN public.conversation_scenarios s ON s.id = tc.scenario_id
           WHERE tc.topic_id = t.id
             AND (s.visibility = 'public' OR s.created_by = $1)) AS scenario_count,
         (SELECT COALESCE(sum(jsonb_array_length(v.words)), 0)::int
            FROM public.topic_contents tc
            JOIN public.vocab_sets v ON v.id = tc.vocab_set_id
           WHERE tc.topic_id = t.id
             AND (v.visibility = 'public' OR v.created_by = $1)) AS vocab_count
    FROM public.topics t
   WHERE (t.visibility = 'public' OR t.created_by = $1)`;

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
      `SELECT l.id, l.slug, l.kind, l.title, l.subtitle, l.difficulty, l.est_minutes,
              l.source, l.visibility,
              (SELECT count(*)::int FROM public.lesson_items i WHERE i.lesson_id = l.id) AS question_count,
              (SELECT count(*)::int FROM public.user_lesson_attempts a
                WHERE a.user_id = $1 AND a.lesson_id = l.id) AS attempt_count,
              (SELECT max(correct_count)::int FROM public.user_lesson_attempts a
                WHERE a.user_id = $1 AND a.lesson_id = l.id) AS best_correct
         FROM public.topic_contents tc
         JOIN public.lessons l ON l.id = tc.lesson_id
        WHERE tc.topic_id = $2 AND l.published
          AND (l.visibility = 'public' OR l.created_by = $1)
        ORDER BY tc.position, tc.id`,
      [user.id, topicId],
    ),
    pool.query(
      `SELECT s.id, s.slug, s.title, s.tag, s.level, s.description,
              s.opening_message, s.objectives, s.source, s.visibility
         FROM public.topic_contents tc
         JOIN public.conversation_scenarios s ON s.id = tc.scenario_id
        WHERE tc.topic_id = $2 AND (s.visibility = 'public' OR s.created_by = $1)
        ORDER BY tc.position, tc.id`,
      [user.id, topicId],
    ),
    pool.query(
      `SELECT v.id, v.slug, v.title, v.description, v.words, v.source, v.visibility
         FROM public.topic_contents tc
         JOIN public.vocab_sets v ON v.id = tc.vocab_set_id
        WHERE tc.topic_id = $2 AND (v.visibility = 'public' OR v.created_by = $1)
        ORDER BY tc.position, tc.id`,
      [user.id, topicId],
    ),
    pool.query(
      `WITH topic_lessons AS (
         SELECT tc.lesson_id FROM public.topic_contents tc WHERE tc.topic_id = $2 AND tc.lesson_id IS NOT NULL
       ), topic_scenarios AS (
         SELECT tc.scenario_id FROM public.topic_contents tc WHERE tc.topic_id = $2 AND tc.scenario_id IS NOT NULL
       ), topic_words AS (
         SELECT DISTINCT lower(x.word->>'word') AS word
           FROM public.topic_contents tc
           JOIN public.vocab_sets vs ON vs.id = tc.vocab_set_id
           CROSS JOIN LATERAL jsonb_array_elements(vs.words) x(word)
          WHERE tc.topic_id = $2
       )
       SELECT
         (SELECT count(*)::int FROM topic_lessons) AS lesson_total,
         (SELECT count(DISTINCT a.lesson_id)::int
            FROM public.user_lesson_attempts a JOIN topic_lessons tl ON tl.lesson_id = a.lesson_id
           WHERE a.user_id = $1) AS lesson_done,
         (SELECT count(*)::int FROM topic_scenarios) AS scenario_total,
         (SELECT count(DISTINCT s.scenario_id)::int
            FROM public.conversation_sessions s JOIN topic_scenarios ts ON ts.scenario_id = s.scenario_id
           WHERE s.user_id = $1 AND EXISTS (
             SELECT 1 FROM public.conversation_messages m WHERE m.session_id = s.id AND m.role = 'user'
           )) AS scenario_done,
         (SELECT count(*)::int FROM topic_words) AS vocab_total,
         (SELECT count(DISTINCT tw.word)::int
            FROM topic_words tw
            JOIN public.vocab_words w ON lower(w.word) = tw.word
            JOIN public.user_vocab_cards c ON c.word_id = w.id AND c.user_id = $1 AND NOT c.suspended) AS vocab_done`,
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
  let where = `(s.visibility = 'public' OR s.created_by = $1)`;
  if (topicId) {
    params.push(topicId);
    join = `JOIN public.topic_contents tc ON tc.scenario_id = s.id`;
    where += ` AND tc.topic_id = $2`;
  }
  const { rows } = await pool.query(
    `SELECT s.id, s.slug, s.title, s.tag, s.level, s.description,
            s.opening_message, s.objectives, s.source, s.visibility
       FROM public.conversation_scenarios s ${join}
      WHERE ${where}
      ORDER BY s.created_at, s.id`,
    params,
  );
  return rows;
}

export async function getScenarioForSession(user, scenarioId, client = pool) {
  const { rows: [row] } = await client.query(
    `SELECT id, slug, title, tag, level, description, system_prompt, opening_message, objectives
       FROM public.conversation_scenarios
      WHERE id = $2 AND (visibility = 'public' OR created_by = $1)`,
    [user.id, scenarioId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '회화 시나리오를 찾을 수 없습니다.');
  return row;
}

export async function addVocabSetToCards(user, vocabSetId) {
  return withTx(async (client) => {
    const { rows: [set] } = await client.query(
      `SELECT id, words FROM public.vocab_sets
        WHERE id = $2 AND (visibility = 'public' OR created_by = $1)`,
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
        `INSERT INTO public.vocab_words
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
          `SELECT id FROM public.vocab_words WHERE word_key = lower(btrim($1)) AND lang = 'en'`,
          [word],
        );
        wordId = existing?.id;
      }
      if (!wordId) continue;
      const { rowCount } = await client.query(
        `INSERT INTO public.user_vocab_cards (user_id, word_id)
         VALUES ($1, $2) ON CONFLICT (user_id, word_id) DO NOTHING`,
        [user.id, wordId],
      );
      if (rowCount) added += 1; else duplicates += 1;
    }
    return { added, duplicates, total: added + duplicates };
  });
}
