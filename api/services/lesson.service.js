// 학습(lesson) 서비스 — 파생값(progress/attempt_count/best_correct/score)의 단일 소스는 서버.
// 정답·해설 유출 방지의 구조적 보장: GET 계열 쿼리는 컬럼을 나열하고
// answer/explanation을 아예 쓰지 않는다 (SELECT * 금지).
// 채점은 POST /api/lessons/:id/attempts 서버 채점 — 정답/해설은 채점 응답에만 실린다.
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';

// 목록: LEFT JOIN LATERAL로 사용자별 attempt 집계 (저장 금지, 매 요청 계산)
const LIST_SELECT = `
  SELECT l.id, l.slug, l.kind, l.title, l.subtitle, l.difficulty, l.est_minutes, l.position,
         (SELECT count(*)::int FROM public.lesson_items i WHERE i.lesson_id = l.id) AS question_count,
         COALESCE(a.attempt_count, 0) AS attempt_count, a.best_correct, a.last_attempted_at
    FROM public.lessons l
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS attempt_count, max(correct_count)::int AS best_correct,
             max(created_at) AS last_attempted_at
        FROM public.user_lesson_attempts ua
       WHERE ua.user_id = $1 AND ua.lesson_id = l.id
    ) a ON true
   WHERE l.published
   ORDER BY l.position, l.id`;

// progress.done/total — 항상 이 쿼리로 집계 (저장 금지)
async function fetchProgress(userId, client = pool) {
  const { rows: [p] } = await client.query(
    `SELECT (SELECT count(*)::int FROM public.lessons WHERE published) AS total,
            (SELECT count(DISTINCT ua.lesson_id)::int
               FROM public.user_lesson_attempts ua
               JOIN public.lessons l2 ON l2.id = ua.lesson_id AND l2.published
              WHERE ua.user_id = $1) AS done`,
    [userId],
  );
  return p;
}

export async function listLessons(user) {
  const { rows } = await pool.query(LIST_SELECT, [user.id]);
  return { lessons: rows, progress: await fetchProgress(user.id) };
}

export async function getLesson(user, lessonId) {
  // ★ answer/explanation은 컬럼 나열에 존재하지 않는다 — DTO 유출 불가
  const { rows: [l] } = await pool.query(
    `SELECT id, slug, kind, title, subtitle, difficulty, est_minutes, position,
            passage, vocab, faq
       FROM public.lessons WHERE id = $1 AND published`,
    [lessonId],
  );
  if (!l) throw new HttpError(404, 'NOT_FOUND', '레슨을 찾을 수 없습니다.');

  const { rows: items } = await pool.query(
    `SELECT position, stem, options FROM public.lesson_items
      WHERE lesson_id = $1 ORDER BY position`,
    [lessonId],
  );

  // '다음 지문': position, id 순서상 다음 published 레슨, 마지막이면 첫 레슨(순환)
  const { rows: [next] } = await pool.query(
    `SELECT id FROM public.lessons
      WHERE published AND (position, id) > ($2::int, $1::bigint)
      ORDER BY position, id LIMIT 1`,
    [lessonId, l.position],
  );
  let nextLessonId = next?.id ?? null;
  if (nextLessonId === null) {
    const { rows: [first] } = await pool.query(
      `SELECT id FROM public.lessons WHERE published ORDER BY position, id LIMIT 1`,
    );
    nextLessonId = first?.id ?? null;
  }

  const { rows: [agg] } = await pool.query(
    `SELECT count(*)::int AS attempt_count, max(correct_count)::int AS best_correct
       FROM public.user_lesson_attempts WHERE user_id = $1 AND lesson_id = $2`,
    [user.id, lessonId],
  );

  return {
    lesson: {
      id: l.id, slug: l.slug, kind: l.kind, title: l.title, subtitle: l.subtitle,
      difficulty: l.difficulty, est_minutes: l.est_minutes,
      passage: l.passage,
      questions: items.map((i) => ({ n: i.position, stem: i.stem, options: i.options })),
      vocabulary: l.vocab, // mock 계약 유지 — PassageColumn/QuestionsColumn이 lesson.vocabulary를 읽는다
      faq: l.faq,
      attempt_count: agg.attempt_count, best_correct: agg.best_correct,
      question_count: items.length,
      next_lesson_id: nextLessonId,
    },
  };
}

// 채점 응답 results 조립 — 저장 answers + 아이템(answer/explanation 포함)에서 재구성
function buildResults(items, answers) {
  const results = {};
  for (const i of items) {
    const your = answers[String(i.position)];
    results[String(i.position)] = {
      your,
      correct: your === i.answer,
      answer: i.answer,
      explanation: i.explanation,
    };
  }
  return results;
}

const score = (correct, total) => Math.round((correct / total) * 100);

export async function submitAttempt(user, lessonId, { answers, clientRequestId, elapsedMs }) {
  return withTx(async (client) => {
    // 문항 로드 (published 레슨만) — 채점 재료. 트랜잭션 안은 SELECT/INSERT만.
    const { rows: items } = await client.query(
      `SELECT i.position, i.options, i.answer, i.explanation
         FROM public.lesson_items i
         JOIN public.lessons l ON l.id = i.lesson_id AND l.published
        WHERE i.lesson_id = $1 ORDER BY i.position`,
      [lessonId],
    );
    if (items.length === 0) throw new HttpError(404, 'NOT_FOUND', '레슨을 찾을 수 없습니다.');

    // 멱등: 같은 client_request_id면 저장된 answers로 results 재구성 → replay
    if (clientRequestId) {
      const { rows: [existing] } = await client.query(
        `SELECT id, lesson_id, answers, correct_count, total_count, created_at
           FROM public.user_lesson_attempts WHERE client_request_id = $1`,
        [clientRequestId],
      );
      if (existing) {
        return {
          attempt: {
            id: existing.id, lesson_id: existing.lesson_id,
            correct_count: existing.correct_count, total_count: existing.total_count,
            score: score(existing.correct_count, existing.total_count),
            created_at: existing.created_at,
          },
          results: buildResults(items, existing.answers),
          progress: await fetchProgress(user.id, client),
          replay: true,
        };
      }
    }

    // 검증 — 키는 아이템 position의 문자열 집합과 정확히 일치, 값은 해당 옵션 id 중 하나
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      throw new HttpError(400, 'BAD_REQUEST', 'answers 객체가 필요합니다.');
    }
    const expected = items.map((i) => String(i.position));
    const got = Object.keys(answers);
    if (got.length !== expected.length || expected.some((k) => !(k in answers))) {
      throw new HttpError(400, 'BAD_REQUEST', '모든 문항에 답해야 합니다.');
    }
    for (const i of items) {
      const your = answers[String(i.position)];
      if (!i.options.some((o) => o.id === your)) {
        throw new HttpError(400, 'BAD_REQUEST', `${i.position}번 문항의 답이 올바르지 않습니다.`);
      }
    }

    const correctCount = items.filter((i) => answers[String(i.position)] === i.answer).length;
    const { rows: [attempt] } = await client.query(
      `INSERT INTO public.user_lesson_attempts
         (user_id, lesson_id, answers, correct_count, total_count, elapsed_ms, client_request_id)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
       RETURNING id, lesson_id, correct_count, total_count, created_at`,
      [user.id, lessonId, JSON.stringify(answers), correctCount, items.length,
       elapsedMs ?? null, clientRequestId ?? null],
    );

    return {
      attempt: {
        id: attempt.id, lesson_id: attempt.lesson_id,
        correct_count: attempt.correct_count, total_count: attempt.total_count,
        score: score(attempt.correct_count, attempt.total_count),
        created_at: attempt.created_at,
      },
      results: buildResults(items, answers),
      progress: await fetchProgress(user.id, client),
    };
  });
}
