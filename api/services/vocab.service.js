// 단어장 서비스 — 파생값(status/preview/next_review_in_days)의 단일 소스는 서버.
// status는 저장하지 않고 매 요청 now()로 계산한다:
//  - 버그 1 해소: learned가 시간이 지나면 자동으로 due 복귀 (배치 잡 불필요)
//  - 버그 2 해소: 복습 큐 = suspended=false AND next_review<=now() → new도 포함
//  - 버그 3 해소: 복습 버튼 부제는 preview[r].label (실제 계산의 dry-run)
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';
import { applyReview, predict, SRS_RESULTS } from './srs.js';

// status는 CASE 별칭이라 같은 레벨 WHERE에서 못 쓴다 — 서브쿼리로 감싼다.
const CARD_SELECT = `
  SELECT c.id, c.word_id, w.word, w.pos, w.ipa,
         COALESCE(c.meaning_ko_override, w.meaning_ko) AS meaning_ko,
         COALESCE(c.examples_override, w.examples)     AS examples,
         w.difficulty,
         CASE WHEN c.suspended            THEN 'suspended'
              WHEN c.review_count = 0     THEN 'new'
              WHEN c.next_review <= now() THEN 'due'
              ELSE                             'learned' END AS status,
         c.next_review, c.interval_days, c.ease_factor,
         c.review_count, c.fail_count, c.added_at, c.suspended,
         c.last_result, c.last_reviewed_at,
         GREATEST(0, (c.next_review AT TIME ZONE $2)::date - (now() AT TIME ZONE $2)::date)::int
           AS next_review_in_days
    FROM user_vocab_cards c
    JOIN vocab_words w ON w.id = c.word_id
   WHERE c.user_id = $1`;

function toDto(row) {
  return {
    id: row.id,
    word_id: row.word_id,
    word: row.word,
    pos: row.pos,
    ipa: row.ipa,
    meaning_ko: row.meaning_ko,
    examples: row.examples,
    difficulty: row.difficulty,
    status: row.status,
    next_review_at: row.next_review,
    next_review_in_days: row.next_review_in_days,
    interval_days: row.interval_days,
    ease_factor: row.ease_factor,
    review_count: row.review_count,
    fail_count: row.fail_count,
    accuracy: row.review_count > 0
      ? Math.round(((row.review_count - row.fail_count) / row.review_count) * 100)
      : null,
    added_at: row.added_at,
    suspended: row.suspended,
    last_result: row.last_result,
    last_reviewed_at: row.last_reviewed_at,
    preview: predict(row),
  };
}

// export: dashboard.service.js가 due 집계를 재구현하지 않고 이 함수를 재사용한다.
export async function fetchStats(userId, client = pool) {
  const { rows: [stats] } = await client.query(
    `SELECT count(*) FILTER (WHERE NOT suspended AND review_count = 0)                          ::int AS new,
            count(*) FILTER (WHERE NOT suspended AND review_count > 0 AND next_review <= now()) ::int AS due,
            count(*) FILTER (WHERE NOT suspended AND review_count > 0 AND next_review >  now()) ::int AS learned,
            count(*) FILTER (WHERE NOT suspended)                                               ::int AS total
       FROM user_vocab_cards WHERE user_id = $1`,
    [userId],
  );
  return stats;
}

export async function listCards(user, { status, q } = {}) {
  const params = [user.id, user.tz];
  // v1: suspended는 목록 기본 제외 (프론트 VocabListRow가 3분기만 처리)
  let sql = `SELECT * FROM (${CARD_SELECT}) t WHERE t.status <> 'suspended'`;
  if (status) {
    params.push(status);
    sql += ` AND t.status = $${params.length}`;
  }
  if (q) {
    params.push(`${q.toLowerCase()}%`);
    sql += ` AND (lower(t.word) LIKE $${params.length} OR t.meaning_ko LIKE $${params.length})`;
  }
  sql += ` ORDER BY t.added_at DESC`;
  const { rows } = await pool.query(sql, params);
  return { cards: rows.map(toDto), stats: await fetchStats(user.id) };
}

// 복습 큐: new + due 모두 포함 (구현 전 프론트는 due만 걸러 new가 영원히 안 나왔다)
export async function dueCards(user) {
  const { rows } = await pool.query(
    `${CARD_SELECT} AND c.suspended = false AND c.next_review <= now()
     ORDER BY c.next_review ASC`,
    [user.id, user.tz],
  );
  return { cards: rows.map(toDto) };
}

export async function review(user, cardId, { result, clientRequestId, elapsedMs }) {
  if (!SRS_RESULTS.includes(result)) {
    throw new HttpError(400, 'BAD_REQUEST', `result는 ${SRS_RESULTS.join('/')} 중 하나여야 합니다.`);
  }
  return withTx(async (client) => {
    // 멱등: 같은 client_request_id가 이미 처리됐으면 현재 상태를 replay로 응답
    if (clientRequestId) {
      const { rows: [existing] } = await client.query(
        `SELECT card_id FROM vocab_reviews WHERE client_request_id = $1`,
        [clientRequestId],
      );
      if (existing) {
        const card = await getCard(user, existing.card_id, client);
        return { card, stats: await fetchStats(user.id, client), replay: true };
      }
    }

    const { rows: [card] } = await client.query(
      `SELECT * FROM user_vocab_cards WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [cardId, user.id],
    );
    if (!card) throw new HttpError(404, 'NOT_FOUND', '카드를 찾을 수 없습니다.');

    const next = applyReview(card, result);
    const { rows: [updated] } = await client.query(
      `UPDATE user_vocab_cards
          SET next_review = CASE WHEN $3::int IS NOT NULL
                                 THEN now() + make_interval(mins => $3::int)
                                 ELSE (date_trunc('day', now() AT TIME ZONE $4) + make_interval(days => $5::int)) AT TIME ZONE $4
                            END,
              interval_days = $5, ease_factor = $6,
              review_count = review_count + 1,
              fail_count = fail_count + CASE WHEN $7 = 'again' THEN 1 ELSE 0 END,
              last_result = $7, last_reviewed_at = now(), updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING next_review`,
      [cardId, user.id, next.againMinutes, user.tz, next.interval_days, next.ease_factor, result],
    );

    await client.query(
      `INSERT INTO vocab_reviews
         (card_id, user_id, word_id, result, prev_interval_days, prev_ease_factor,
          next_interval_days, next_ease_factor, next_review, elapsed_ms, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [cardId, user.id, card.word_id, result, card.interval_days, card.ease_factor,
       next.interval_days, next.ease_factor, updated.next_review,
       elapsedMs ?? null, clientRequestId ?? null],
    );

    const dto = await getCard(user, cardId, client);
    return { card: dto, stats: await fetchStats(user.id, client) };
  });
}

export async function getCard(user, cardId, client = pool) {
  const { rows: [row] } = await client.query(
    `SELECT * FROM (${CARD_SELECT}) t WHERE t.id = $3`,
    [user.id, user.tz, cardId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '카드를 찾을 수 없습니다.');
  return toDto(row);
}

// 사전(풀) upsert — 카드는 만들지 않는다. INSERT … DO NOTHING 후 0행이면 재조회(동시 추가 경합 대비).
// 이 분기를 빼먹으면 "이미 있는 단어를 추가할 때만 500"이 난다.
// addCardFromEntry(카드 생성)와 registerPoolEntries(풀 자동 등록)가 공유한다 — 플랜 09 §4.
export async function upsertWordEntry(client, { word, entry, source, createdBy }) {
  if (entry) {
    const { rows } = await client.query(
      `INSERT INTO vocab_words (word, pos, ipa, meaning_ko, examples, difficulty, source, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       ON CONFLICT (word_key, lang) DO NOTHING
       RETURNING id`,
      [entry.word || word, entry.pos, entry.ipa, entry.meaning_ko,
       JSON.stringify(entry.examples), entry.difficulty, source, createdBy],
    );
    if (rows.length > 0) return { wordId: rows[0].id, created: true };
  }
  const { rows: [existing] } = await client.query(
    `SELECT id FROM vocab_words WHERE word_key = lower(btrim($1)) AND lang = 'en'`,
    [word],
  );
  if (!existing) throw new HttpError(404, 'NOT_FOUND', '사전 항목 생성에 실패했습니다.');
  return { wordId: existing.id, created: false };
}

// AI 생성물(퀴즈 10단어·단어 세트)을 풀에 자동 등록 — 나만의 단어장(카드)에는 넣지 않는다(플랜 09 §2.2).
// 호출자는 실패를 삼키고 로그만 남긴다 — 퀴즈/세트 생성 성공이 우선.
export async function registerPoolEntries(words, { source, createdBy }) {
  let created = 0;
  let skipped = 0;
  for (const w of words || []) {
    const word = String(w?.word || '').trim();
    const meaning = String(w?.meaning_ko || '').trim();
    if (!word || !meaning) { skipped += 1; continue; }
    const entry = {
      word, pos: w.pos ?? null, ipa: w.ipa ?? null, meaning_ko: meaning,
      examples: [w.example_en].filter(Boolean),
      difficulty: Number.isInteger(w.difficulty) ? w.difficulty : 3,
    };
    const r = await upsertWordEntry(pool, { word, entry, source, createdBy });
    if (r.created) created += 1;
  }
  return { created, existing: (words?.length ?? 0) - created - skipped, skipped };
}

// AI가 만든 사전 항목(entry)을 저장. 트랜잭션 안에는 SELECT/INSERT만 —
// CLI 대기는 이 함수 밖(라우트)에서 끝났다.
export async function addCardFromEntry(user, { word, entry, source }) {
  return withTx(async (client) => {
    const { wordId, created } = await upsertWordEntry(client, { word, entry, source, createdBy: user.id });

    const { rows: cardRows } = await client.query(
      `INSERT INTO user_vocab_cards (user_id, word_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, word_id) DO NOTHING
       RETURNING id`,
      [user.id, wordId],
    );
    if (cardRows.length === 0) {
      const { rows: [dup] } = await client.query(
        `SELECT id FROM user_vocab_cards WHERE user_id = $1 AND word_id = $2`,
        [user.id, wordId],
      );
      const card = await getCard(user, dup.id, client);
      return { card, duplicate: true, wordCreated: created };
    }
    const card = await getCard(user, cardRows[0].id, client);
    return { card, duplicate: false, wordCreated: created };
  });
}

export const POOL_SOURCES = ['seed', 'ai', 'manual', 'lesson', 'conversation'];
export const POOL_PAGE_SIZE = 50;

// 전체 단어장(풀) 탐색 — 플랜 09 Phase 2. in_my_vocab 는 LEFT JOIN 파생(저장 금지 규범).
// summary(풀 크기·출처별·내가 담은 수)는 필터와 무관한 전체 집계 — 헤더 "N단어 · 내 단어장 M" 용.
export async function listPool(user, { q, source, page = 1 } = {}) {
  const params = [user.id];
  let where = `w.lang = 'en'`;
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND (w.word_key LIKE $${params.length} OR w.meaning_ko LIKE $${params.length})`;
  }
  if (source) {
    params.push(source);
    where += ` AND w.source = $${params.length}`;
  }
  const offset = (page - 1) * POOL_PAGE_SIZE;
  const { rows } = await pool.query(
    `SELECT w.id, w.word, w.pos, w.ipa, w.meaning_ko, w.examples, w.difficulty, w.source,
            (c.id IS NOT NULL) AS in_my_vocab,
            count(*) OVER ()::int AS filtered_total
       FROM vocab_words w
       LEFT JOIN user_vocab_cards c ON c.word_id = w.id AND c.user_id = $1
      WHERE ${where}
      ORDER BY w.word_key
      LIMIT ${POOL_PAGE_SIZE} OFFSET ${offset}`,
    params,
  );
  const { rows: [summary] } = await pool.query(
    `SELECT count(*)::int AS total,
            ${POOL_SOURCES.map((s) => `count(*) FILTER (WHERE w.source = '${s}')::int AS ${s}`).join(', ')},
            count(c.id)::int AS mine
       FROM vocab_words w
       LEFT JOIN user_vocab_cards c ON c.word_id = w.id AND c.user_id = $1
      WHERE w.lang = 'en'`,
    [user.id],
  );
  return {
    words: rows.map(({ filtered_total, ...w }) => w),
    page, page_size: POOL_PAGE_SIZE,
    total: rows[0]?.filtered_total ?? 0,
    summary: {
      total: summary.total, mine: summary.mine,
      by_source: Object.fromEntries(POOL_SOURCES.map((s) => [s, summary[s]])),
    },
  };
}

export async function findWordEntry(word) {
  const { rows: [row] } = await pool.query(
    `SELECT id FROM vocab_words WHERE word_key = lower(btrim($1)) AND lang = 'en'`,
    [word],
  );
  return row || null;
}

export async function deleteCard(user, cardId) {
  const { rowCount } = await pool.query(
    `DELETE FROM user_vocab_cards WHERE id = $1 AND user_id = $2`,
    [cardId, user.id],
  );
  if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', '카드를 찾을 수 없습니다.');
}

export async function patchCard(user, cardId, { meaning_ko, examples, suspended, reset }) {
  return withTx(async (client) => {
    const { rows: [card] } = await client.query(
      `SELECT id FROM user_vocab_cards WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [cardId, user.id],
    );
    if (!card) throw new HttpError(404, 'NOT_FOUND', '카드를 찾을 수 없습니다.');

    if (meaning_ko !== undefined) {
      await client.query(
        `UPDATE user_vocab_cards SET meaning_ko_override = $3, updated_at = now()
          WHERE id = $1 AND user_id = $2`,
        [cardId, user.id, meaning_ko],
      );
    }
    if (examples !== undefined) {
      await client.query(
        `UPDATE user_vocab_cards SET examples_override = $3::jsonb, updated_at = now()
          WHERE id = $1 AND user_id = $2`,
        [cardId, user.id, examples === null ? null : JSON.stringify(examples)],
      );
    }
    if (suspended !== undefined) {
      await client.query(
        `UPDATE user_vocab_cards SET suspended = $3, updated_at = now()
          WHERE id = $1 AND user_id = $2`,
        [cardId, user.id, Boolean(suspended)],
      );
    }
    if (reset) {
      await client.query(
        `UPDATE user_vocab_cards
            SET next_review = now(), interval_days = 1, ease_factor = 2.50,
                review_count = 0, fail_count = 0, last_result = NULL,
                last_reviewed_at = NULL, updated_at = now()
          WHERE id = $1 AND user_id = $2`,
        [cardId, user.id],
      );
    }
    return getCard(user, cardId, client);
  });
}

export async function stats(user) {
  const base = await fetchStats(user.id);
  const { rows: weekly } = await pool.query(
    `SELECT (reviewed_at AT TIME ZONE $2)::date AS day,
            count(*)::int AS reviews,
            count(*) FILTER (WHERE result <> 'again')::int AS passed
       FROM vocab_reviews
      WHERE user_id = $1 AND reviewed_at > now() - interval '7 days'
      GROUP BY 1 ORDER BY 1`,
    [user.id, user.tz],
  );
  return { stats: base, weekly };
}
