// 학습(lesson) 서비스 — 파생값(progress/attempt_count/best_correct/score)의 단일 소스는 서버.
// 정답·해설 유출 방지의 구조적 보장: GET 계열 쿼리는 컬럼을 나열하고
// answer/explanation을 아예 쓰지 않는다 (SELECT * 금지).
// 채점은 POST /api/lessons/:id/attempts 서버 채점 — 정답/해설은 채점 응답에만 실린다.
import { discoverable } from '../lib/content-scope.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';

// 레슨 = content_items(type='lesson') + lesson_details 1:1 (플랜 10.7 Phase 2).
// 가시성 판정의 단일 소스는 api/lib/content-scope.js (플랜 11 결정 2).
// $1 은 항상 user_id 다 — 소유자는 비공개 콘텐츠도 본다.
const LESSON_SOURCE = `content_items l JOIN lesson_details d ON d.content_id = l.id`;
const LESSON_VISIBLE = `l.type = 'lesson' AND ${discoverable('l')}`;

// 목록: LEFT JOIN LATERAL로 사용자별 attempt 집계 (저장 금지, 매 요청 계산)
// LessonSummary 컬럼 — GET /api/lessons 행과 GET /api/lessons/recommended 행이 같은 모양이 되도록 한 곳에서 정의.
const SUMMARY_COLS = `
         l.id, l.slug, d.kind, l.title, d.subtitle, l.difficulty, d.est_minutes, d.position,
         l.source, l.visibility,
         (SELECT count(*)::int FROM lesson_items i WHERE i.content_id = l.id) AS question_count,
         COALESCE(a.attempt_count, 0) AS attempt_count, a.best_correct, a.last_attempted_at`;
// last_correct/last_total = 가장 최근 시도의 채점 결과 (추천 reason 'retry_low_score' 판정용)
const ATTEMPT_AGG = `
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS attempt_count, max(correct_count)::int AS best_correct,
             max(created_at) AS last_attempted_at,
             (array_agg(correct_count ORDER BY created_at DESC, id DESC))[1]::int AS last_correct,
             (array_agg(total_count   ORDER BY created_at DESC, id DESC))[1]::int AS last_total
        FROM user_lesson_attempts ua
       WHERE ua.user_id = $1 AND ua.content_id = l.id
    ) a ON true`;
const LIST_BODY = `
  SELECT ${SUMMARY_COLS}
    FROM ${LESSON_SOURCE} ${ATTEMPT_AGG}
   WHERE ${LESSON_VISIBLE}`;
const LIST_SELECT = `${LIST_BODY}
   ORDER BY d.position, l.id`;

export const LESSON_STATUS_FILTERS = ['new', 'attempted']; // status 필터 허용값 — 라우트 400 판정과 공유

// progress.done/total — 항상 이 쿼리로 집계 (저장 금지)
async function fetchProgress(userId, client = pool) {
  const { rows: [p] } = await client.query(
    `SELECT (SELECT count(*)::int FROM content_items l WHERE ${LESSON_VISIBLE}) AS total,
            (SELECT count(DISTINCT ua.content_id)::int
               FROM user_lesson_attempts ua
               JOIN content_items l ON l.id = ua.content_id AND ${LESSON_VISIBLE}
              WHERE ua.user_id = $1) AS done`,
    [userId],
  );
  return p;
}

// kind: lesson_details.kind 문자열(없는 kind 는 빈 목록), status: 'new'(attempt_count=0) | 'attempted'(≥1).
// status 는 attempt_count 파생값 기준이라 집계 결과를 서브쿼리로 감싸 WHERE 에 쓴다. progress 는 필터와 무관한 전체 진도.
export async function listLessons(user, { kind, status } = {}) {
  const params = [user.id];
  const where = [];
  if (kind) {
    params.push(kind);
    where.push(`t.kind = $${params.length}`);
  }
  if (status === 'new') where.push('t.attempt_count = 0');
  else if (status === 'attempted') where.push('t.attempt_count >= 1');
  else if (status !== undefined && status !== null) {
    throw new HttpError(400, 'BAD_REQUEST', `status 는 ${LESSON_STATUS_FILTERS.join('/')} 중 하나여야 합니다.`);
  }
  const sql = where.length === 0
    ? LIST_SELECT
    : `SELECT * FROM (${LIST_BODY}) t WHERE ${where.join(' AND ')} ORDER BY t.position, t.id`;
  const { rows } = await pool.query(sql, params);
  return { lessons: rows.map(summaryDto), progress: await fetchProgress(user.id) };
}

// LessonSummary DTO — 집계 내부 컬럼(last_correct/last_total)은 내려보내지 않는다
function summaryDto(row) {
  const { last_correct, last_total, ...summary } = row;
  return summary;
}

// 추천 ≤ limit 건 + reason_code. 대시보드 '시험대비' 추천도 이 함수의 첫 항목을 쓴다(규칙 단일 소스).
//  - next_in_series : 가장 최근에 채점한 레슨의 바로 다음 (position, id) 레슨 — 마지막 레슨이면 첫 레슨으로 순환
//                     (getLesson 의 '다음 지문'과 같은 규칙). 정답률과 무관하게 항상 추천한다.
//  - not_started    : 아직 한 번도 풀지 않은 레슨 (position 순)
//  - retry_low_score: 가장 최근 시도 정답률 < 70% (낮은 순)
// 우선순위는 위 순서. next_in_series 를 제외하면 최근 시도 ≥ 70% 인 레슨은 추천하지 않는다.
// 시도가 있으면 next_in_series, 없으면 not_started 가 채워지므로 published 레슨이 하나라도 있으면 빈 배열이 아니다
// — 대시보드 '시험대비' 카드·오늘의 학습 항목이 항상 레슨 1건을 갖는 근거(docs/plan/07 Phase 1 추천).
const LOW_SCORE_RATIO = 0.7;
export async function recommendLessons(user, { limit = 3 } = {}) {
  const max = Math.min(Math.max(Number(limit) || 3, 1), 3);
  const [{ rows }, { rows: [last] }] = await Promise.all([
    pool.query(LIST_SELECT, [user.id]),
    pool.query(
      `SELECT ua.content_id AS lesson_id FROM user_lesson_attempts ua
         JOIN content_items l ON l.id = ua.content_id AND ${LESSON_VISIBLE}
        WHERE ua.user_id = $1 ORDER BY ua.created_at DESC, ua.id DESC LIMIT 1`,
      [user.id],
    ),
  ]);

  let nextId = null;
  if (last) {
    const idx = rows.findIndex((r) => r.id === last.lesson_id); // rows 는 (position, id) 순
    if (idx >= 0) nextId = rows[(idx + 1) % rows.length].id; // 마지막 → 첫 레슨 순환
  }
  const lastRatio = (r) => (r.attempt_count > 0 && r.last_total > 0 ? r.last_correct / r.last_total : null);
  const isLow = (r) => { const p = lastRatio(r); return p !== null && p < LOW_SCORE_RATIO; };

  const picked = [];
  const next = rows.find((r) => r.id === nextId);
  if (next) picked.push({ ...summaryDto(next), reason_code: 'next_in_series' });
  for (const r of rows) {
    if (r.id !== nextId && r.attempt_count === 0) picked.push({ ...summaryDto(r), reason_code: 'not_started' });
  }
  rows.filter((r) => r.id !== nextId && isLow(r))
    .sort((a, b) => lastRatio(a) - lastRatio(b))
    .forEach((r) => picked.push({ ...summaryDto(r), reason_code: 'retry_low_score' }));
  return picked.slice(0, max);
}

export async function getLesson(user, lessonId) {
  // ★ answer/explanation은 컬럼 나열에 존재하지 않는다 — DTO 유출 불가
  const { rows: [l] } = await pool.query(
    `SELECT l.id, l.slug, d.kind, l.title, d.subtitle, l.difficulty, d.est_minutes, d.position,
            d.passage, d.vocab, d.faq, l.source, l.visibility
       FROM ${LESSON_SOURCE}
      WHERE l.id = $2 AND ${LESSON_VISIBLE}`,
    [user.id, lessonId],
  );
  if (!l) throw new HttpError(404, 'NOT_FOUND', '레슨을 찾을 수 없습니다.');

  const { rows: items } = await pool.query(
    `SELECT position, stem, options FROM lesson_items
      WHERE content_id = $1 ORDER BY position`,
    [lessonId],
  );

  // '다음 지문': position, id 순서상 다음 published 레슨, 마지막이면 첫 레슨(순환)
  const { rows: [next] } = await pool.query(
    `SELECT l.id FROM ${LESSON_SOURCE}
      WHERE ${LESSON_VISIBLE}
        AND (d.position, l.id) > ($3::int, $2::bigint)
      ORDER BY d.position, l.id LIMIT 1`,
    [user.id, lessonId, l.position],
  );
  let nextLessonId = next?.id ?? null;
  if (nextLessonId === null) {
    const { rows: [first] } = await pool.query(
      `SELECT l.id FROM ${LESSON_SOURCE}
        WHERE ${LESSON_VISIBLE}
        ORDER BY d.position, l.id LIMIT 1`,
      [user.id],
    );
    nextLessonId = first?.id ?? null;
  }

  const { rows: [agg] } = await pool.query(
    `SELECT count(*)::int AS attempt_count, max(correct_count)::int AS best_correct,
            (array_agg(id ORDER BY created_at DESC, id DESC))[1]::bigint AS last_attempt_id
       FROM user_lesson_attempts WHERE user_id = $1 AND content_id = $2`,
    [user.id, lessonId],
  );

  return {
    lesson: {
      id: l.id, slug: l.slug, kind: l.kind, title: l.title, subtitle: l.subtitle,
      difficulty: l.difficulty, est_minutes: l.est_minutes,
      source: l.source, visibility: l.visibility,
      passage: l.passage,
      questions: items.map((i) => ({ n: i.position, stem: i.stem, options: i.options })),
      // 같은 문항을 lesson_items 컬럼명(position)으로도 — Q&A item_id(=position) 매핑·scripts/verify-lesson-qa.mjs 용. 정답 없음.
      items: items.map((i) => ({ position: i.position, stem: i.stem, options: i.options })),
      vocabulary: l.vocab, // mock 계약 유지 — PassageColumn/QuestionsColumn이 lesson.vocabulary를 읽는다
      faq: l.faq,
      attempt_count: agg.attempt_count, best_correct: agg.best_correct,
      last_attempt_id: agg.last_attempt_id,
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
      `SELECT i.position, i.options, i.answer, i.explanation, i.skill_code
         FROM lesson_items i
         JOIN content_items l ON l.id = i.content_id AND ${LESSON_VISIBLE}
        WHERE i.content_id = $2 ORDER BY i.position`,
      [user.id, lessonId],
    );
    if (items.length === 0) throw new HttpError(404, 'NOT_FOUND', '레슨을 찾을 수 없습니다.');

    // 멱등: 같은 client_request_id면 저장된 answers로 results 재구성 → replay
    if (clientRequestId) {
      const { rows: [existing] } = await client.query(
        `SELECT id, content_id AS lesson_id, answers, correct_count, total_count, skill_code, created_at
           FROM user_lesson_attempts WHERE client_request_id = $1 AND user_id = $2`,
        [clientRequestId, user.id],
      );
      if (existing) {
        return {
          attempt: {
            id: existing.id, lesson_id: existing.lesson_id,
            correct_count: existing.correct_count, total_count: existing.total_count,
            skill_code: existing.skill_code,
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
    const wrongSkills = items
      .filter((i) => answers[String(i.position)] !== i.answer)
      .map((i) => i.skill_code)
      .filter(Boolean);
    const skillCode = wrongSkills.length
      ? [...new Set(wrongSkills)].sort((a, b) =>
        wrongSkills.filter((x) => x === b).length - wrongSkills.filter((x) => x === a).length)[0]
      : null;
    const { rows: [attempt] } = await client.query(
      `INSERT INTO user_lesson_attempts
         (user_id, content_id, answers, correct_count, total_count, elapsed_ms, client_request_id, skill_code)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
       RETURNING id, content_id AS lesson_id, correct_count, total_count, skill_code, created_at`,
      [user.id, lessonId, JSON.stringify(answers), correctCount, items.length,
       elapsedMs ?? null, clientRequestId ?? null, skillCode],
    );

    return {
      attempt: {
        id: attempt.id, lesson_id: attempt.lesson_id,
        correct_count: attempt.correct_count, total_count: attempt.total_count,
        skill_code: attempt.skill_code,
        score: score(attempt.correct_count, attempt.total_count),
        created_at: attempt.created_at,
      },
      results: buildResults(items, answers),
      progress: await fetchProgress(user.id, client),
    };
  });
}

// ── Jina Q&A (lesson_qa) — 학습 자료는 서버가 조립한다 ─────────────────────────
// ★ 정답·해설 비노출의 구조적 보장: 이 절의 모든 쿼리는 컬럼을 나열하고 answer/explanation 을 SELECT 하지 않는다.
//   프롬프트 컨텍스트는 아래 함수들이 만든 텍스트만 쓰므로, 어떤 경로로도 정답이 AI 에 전달될 수 없다.

const stripEmphasis = (s) => String(s).replace(/\*\*/g, ''); // 지문 강조 마크(**…**) 제거
const PASSAGE_HEADER = [['type', '유형'], ['from', '보낸 사람'], ['to', '받는 사람'], ['cc', 'CC'], ['date', '날짜']];

// 지문 → { text: 인용 검증용 원문(헤더 값 + 제목 + 본문 문단), block: 프롬프트용 라벨 붙은 텍스트 }
// block 에는 발신/수신/날짜 헤더도 넣는다(Part 7 은 헤더가 문제 단서가 된다). 프롬프트에 보인 것은 모두 '지문 원문'이므로
// 헤더 값(예: `Daniel Park <…>`, `Tuesday, May 26 · 09:14`)도 text 에 포함해 그대로 인용하면 검증을 통과한다.
// 라벨('보낸 사람:'·'제목:' 등)은 서버가 붙인 표기라 text 에 없다 — 프롬프트 규칙 2 가 라벨 인용을 금지한다.
// ★ scripts/verify-lesson-qa.mjs 의 passageText(헤더 값 + subject + body)와 같은 기준을 유지할 것.
function renderPassage(passage) {
  const p = passage && typeof passage === 'object' ? passage : {};
  const header = PASSAGE_HEADER
    .filter(([key]) => typeof p[key] === 'string' && p[key].trim())
    .map(([key, label]) => [label, stripEmphasis(p[key]).trim()]);
  const subject = typeof p.subject === 'string' ? stripEmphasis(p.subject).trim() : '';
  // LC 스크립트는 [{speaker,text}] 객체 배열이다(플랜 10.7 §3.2). 인용 검증 대상은 대사 자체이므로
  // 화자 라벨은 붙이지 않는다 — 프롬프트가 본 문자열과 text 가 어긋나면 정당한 인용이 버려진다.
  const body = (Array.isArray(p.body) ? p.body : [])
    .map((para) => (para && typeof para === 'object' ? para.text : para))
    .filter((para) => typeof para === 'string' && para.trim())
    .map((para) => stripEmphasis(para).trim());

  const text = [...header.map(([, v]) => v), subject, ...body].filter(Boolean).join('\n');
  const lines = ['[지문]', ...header.map(([label, v]) => `${label}: ${v}`)];
  if (subject) lines.push(`제목: ${subject}`);
  lines.push('', ...body);
  return { text, block: lines.join('\n') };
}

// 문항 + 학습자의 답 (제출 후에만). options 는 [{id,text}] — correct 플래그가 애초에 없다.
function renderItems(items, answers) {
  const lines = ['[문항과 학습자의 답]'];
  for (const it of items) {
    lines.push(`Q${it.position}. ${it.stem}`);
    for (const o of it.options || []) lines.push(`  (${o.id}) ${o.text}`);
    const your = answers?.[String(it.position)];
    const chosen = (it.options || []).find((o) => o.id === your);
    lines.push(`  학습자의 답: ${chosen ? `(${chosen.id}) ${chosen.text}` : '(없음)'}`, '');
  }
  return lines.join('\n').trimEnd();
}

// 컨텍스트 조립 + 검증. 반환 { mode, context, passageText, attempt }
//  - attemptId 없음 → 'pre_submit': 지문만. itemId 는 무시(단, 레슨에 없는 position 이면 400).
//  - attemptId 있음 → 소유권(user)·레슨 일치 검증 후 'post_submit': 지문 + 문항(itemId 면 그 문항만) + 학습자의 답.
export async function prepareQa(user, lessonId, { attemptId, itemId } = {}) {
  const { rows: [lesson] } = await pool.query(
    `SELECT l.id, d.passage FROM ${LESSON_SOURCE}
      WHERE l.id = $2 AND ${LESSON_VISIBLE}`,
    [user.id, lessonId],
  );
  if (!lesson) throw new HttpError(404, 'NOT_FOUND', '레슨을 찾을 수 없습니다.');

  // ★ answer/explanation 없음
  const { rows: items } = await pool.query(
    `SELECT position, stem, options FROM lesson_items WHERE content_id = $1 ORDER BY position`,
    [lessonId],
  );
  if (itemId !== undefined && !items.some((i) => i.position === itemId)) {
    throw new HttpError(400, 'BAD_REQUEST', `item_id ${itemId} 는 이 레슨의 문항이 아닙니다.`);
  }

  const passage = renderPassage(lesson.passage);
  if (attemptId === undefined) {
    return { mode: 'pre_submit', context: passage.block, passageText: passage.text, attempt: null };
  }

  const { rows: [attempt] } = await pool.query(
    `SELECT id, user_id, content_id AS lesson_id, answers FROM user_lesson_attempts WHERE id = $1`,
    [attemptId],
  );
  if (!attempt) throw new HttpError(404, 'NOT_FOUND', '채점 기록을 찾을 수 없습니다.');
  if (attempt.user_id !== user.id || attempt.lesson_id !== lessonId) {
    throw new HttpError(403, 'FORBIDDEN', '이 레슨의 내 채점 기록이 아닙니다.');
  }
  const scoped = itemId === undefined ? items : items.filter((i) => i.position === itemId);
  return {
    mode: 'post_submit',
    context: `${passage.block}\n\n${renderItems(scoped, attempt.answers)}`,
    passageText: passage.text,
    attempt: { id: attempt.id },
  };
}

// 인용 검증 — 공백 정규화(연속 공백 → 1칸) + 타이포그래피 따옴표 통일 후 지문 텍스트의 부분문자열이어야 한다.
// 통과하지 못한 인용은 버리고 개수만 citations_dropped 로 돌려준다(모델이 지문에 없는 문장을 지어낸 경우).
const normalizeQuote = (s) => String(s)
  .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
  .replace(/\s+/g, ' ').trim();
export function verifyCitations(citations, passageText) {
  const haystack = normalizeQuote(passageText);
  const kept = [];
  let dropped = 0;
  for (const c of Array.isArray(citations) ? citations : []) {
    const quote = String(c?.quote || '').trim();
    if (quote && haystack.includes(normalizeQuote(quote))) kept.push({ quote });
    else dropped += 1;
  }
  return { citations: kept.slice(0, 3), dropped };
}

// CLI resume 핸들 — 키 user+lesson+attempt+provider (회화의 provider_ref 패턴, 0011_lesson_qa.sql)
export async function findQaSessionRef(user, lessonId, attemptId, provider) {
  const { rows: [row] } = await pool.query(
    `SELECT provider_ref FROM lesson_qa_sessions
      WHERE user_id = $1 AND content_id = $2 AND attempt_id = $3 AND provider = $4`,
    [user.id, lessonId, attemptId, provider],
  );
  return row?.provider_ref ?? null;
}

export async function saveQaSessionRef(user, lessonId, attemptId, provider, providerRef) {
  if (!providerRef) return; // stateless provider(ollama) — 핸들 없음
  await pool.query(
    `INSERT INTO lesson_qa_sessions (user_id, content_id, attempt_id, provider, provider_ref)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, content_id, attempt_id, provider)
     DO UPDATE SET provider_ref = EXCLUDED.provider_ref, updated_at = now()`,
    [user.id, lessonId, attemptId, provider, providerRef],
  );
}

export async function reportLesson(user, lessonId, { reason, details }) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM content_items l WHERE l.id = $2 AND ${LESSON_VISIBLE}`,
    [user.id, lessonId],
  );
  if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', '레슨을 찾을 수 없습니다.');
  const { rows: [row] } = await pool.query(
    `INSERT INTO lesson_reports (user_id, content_id, reason, details)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, content_id) DO UPDATE
       SET reason = EXCLUDED.reason, details = EXCLUDED.details, created_at = now()
     RETURNING id, content_id AS lesson_id, reason, details, created_at`,
    [user.id, lessonId, reason, details ?? null],
  );
  return row;
}

// ── 오답 노트 (플랜 08 Phase A) — 파생 조회, 스키마 변경 0 ──────────────────
// "미극복 오답" = 레슨별 **최신** attempt 에서 틀린 문항. 다시 풀어 맞히면 최신 attempt 에서
// 빠지므로 목록에서 자동으로 사라진다(극복). times_wrong 은 전체 attempt 누적이라 극복 후에도
// "몇 번 틀렸던 문항인지"가 남는다.
// 본인이 제출한 문항만 반환하므로 정답·해설 포함이 허용된다(플랜 07 '제출 후 공개' 규범).
const MISTAKES_SQL = `
  WITH latest AS (
    SELECT DISTINCT ON (a.content_id) a.id, a.content_id AS lesson_id, a.answers, a.created_at
      FROM user_lesson_attempts a
     WHERE a.user_id = $1
     ORDER BY a.content_id, a.created_at DESC, a.id DESC
  ),
  wrong AS (
    SELECT l.lesson_id, l.id AS attempt_id, l.created_at AS last_wrong_at,
           i.id AS item_id, i.position, i.stem, i.options, i.answer, i.explanation, i.skill_code,
           l.answers ->> i.position::text AS my_answer
      FROM latest l
      JOIN lesson_items i ON i.content_id = l.lesson_id
     WHERE l.answers ? i.position::text
       AND l.answers ->> i.position::text IS DISTINCT FROM i.answer
  )
  SELECT w.*, ls.title AS lesson_title, ld.subtitle AS lesson_subtitle, ld.kind, ls.difficulty,
         (SELECT count(*)::int
            FROM user_lesson_attempts a2
           WHERE a2.user_id = $1 AND a2.content_id = w.lesson_id
             AND a2.answers ? w.position::text
             AND a2.answers ->> w.position::text IS DISTINCT FROM w.answer) AS times_wrong
    FROM wrong w
    JOIN content_items ls ON ls.id = w.lesson_id
    JOIN lesson_details ld ON ld.content_id = ls.id`;

const optionText = (options, id) => (options || []).find((o) => o.id === id)?.text ?? null;

function mistakeDto(row) {
  return {
    item_id: row.item_id,
    lesson_id: row.lesson_id,
    lesson_title: row.lesson_title,
    lesson_subtitle: row.lesson_subtitle,
    kind: row.kind,
    difficulty: row.difficulty,
    attempt_id: row.attempt_id,
    position: row.position,
    stem: row.stem,
    options: row.options,
    my_answer: row.my_answer,
    my_answer_text: optionText(row.options, row.my_answer),
    answer: row.answer,
    answer_text: optionText(row.options, row.answer),
    explanation: row.explanation,
    skill_code: row.skill_code,
    times_wrong: row.times_wrong,
    last_wrong_at: row.last_wrong_at,
  };
}

// skill: lesson_items.skill_code 필터(값이 NULL 인 문항은 'unknown' 으로 묶어 노출).
// 집계(by_skill)는 필터와 무관한 전체 — 필터 칩의 개수 배지가 필터를 따라 바뀌면 안 된다.
export async function listMistakes(user, { skill, lessonId } = {}) {
  const params = [user.id];
  let where = '';
  if (skill) {
    params.push(skill === 'unknown' ? null : skill);
    where += skill === 'unknown'
      ? ` WHERE w.skill_code IS NULL`
      : ` WHERE w.skill_code = $${params.length}`;
  }
  if (lessonId) {
    params.push(lessonId);
    where += `${where ? ' AND' : ' WHERE'} w.lesson_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `${MISTAKES_SQL}${where} ORDER BY w.last_wrong_at DESC, w.lesson_id, w.position`,
    params,
  );
  const { rows: all } = await pool.query(
    `SELECT COALESCE(w.skill_code, 'unknown') AS skill_code, count(*)::int AS n
       FROM (${MISTAKES_SQL}) w GROUP BY 1 ORDER BY 2 DESC`,
    [user.id],
  );
  // 극복 = 과거에 틀렸으나 최신 attempt 에서는 오답이 아닌 문항
  const { rows: [overcome] } = await pool.query(
    `SELECT count(*)::int AS n FROM (
       SELECT DISTINCT a.content_id AS lesson_id, i.position
         FROM user_lesson_attempts a
         JOIN lesson_items i ON i.content_id = a.content_id
        WHERE a.user_id = $1 AND a.answers ? i.position::text
          AND a.answers ->> i.position::text IS DISTINCT FROM i.answer
       EXCEPT
       SELECT w.lesson_id, w.position FROM (${MISTAKES_SQL}) w
     ) t`,
    [user.id],
  );
  return {
    mistakes: rows.map(mistakeDto),
    by_skill: all.map((r) => ({ skill_code: r.skill_code, count: r.n })),
    total: rows.length,
    overcome: overcome.n,
  };
}
