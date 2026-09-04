// 회화 서비스 — 세션/메시지/첨삭 영속화 (docs/plan/01-conversation.md Phase C2).
// 파생값(message_count/avg_score/last_user_text)은 저장하지 않고 매 요청 계산한다
// (vocab.service.js CARD_SELECT 패턴 ②). 저장 흐름의 심장은 saveExchange —
// AI 호출은 라우트(트랜잭션 밖)에서 끝났고, 여기서는 user+assistant+corrections를
// 트랜잭션 하나로 원자 저장한다.
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';
import { predict } from './srs.js';
import { getScenarioForSession } from './topic.service.js';

const SESSION_SELECT = `
  SELECT s.id, s.title, s.scenario_id, s.scenario, s.status, s.started_at, s.ended_at, s.last_message_at,
         (SELECT count(*)::int FROM conversation_messages m
           WHERE m.session_id = s.id)                                          AS message_count,
         (SELECT round(avg(v.value::numeric))::int
            FROM conversation_messages m2,
                 LATERAL jsonb_each_text(m2.scores) v
           WHERE m2.session_id = s.id AND m2.scores IS NOT NULL)               AS avg_score,
         (SELECT m3.content FROM conversation_messages m3
           WHERE m3.session_id = s.id AND m3.role = 'user'
           ORDER BY m3.id DESC LIMIT 1)                                        AS last_user_text
    FROM conversation_sessions s
   WHERE s.user_id = $1`;

// status는 CASE 별칭이라 같은 레벨 WHERE 불가 — 서브쿼리로 감싼다 (vocab과 동일).
// export: corrections.service.js(첨삭 SRS 복습)와 progress.service.js가 status CASE/preview
// 로직을 재정의하지 않고 이 SELECT를 재사용한다 (파생값 단일 소스).
export const CORRECTION_SELECT = `
  SELECT c.id, c.session_id, c.message_id, c.original, c.corrected, c.reason, c.type,
         c.seen_count, c.suspended, c.created_at,
         CASE WHEN c.suspended            THEN 'suspended'
              WHEN c.review_count = 0     THEN 'new'
              WHEN c.next_review <= now() THEN 'due'
              ELSE                             'learned' END AS status,
         c.next_review, c.interval_days, c.ease_factor,
         c.review_count, c.fail_count, c.last_result, c.last_reviewed_at,
         GREATEST(0, (c.next_review AT TIME ZONE $2)::date - (now() AT TIME ZONE $2)::date)::int
           AS next_review_in_days
    FROM corrections c
   WHERE c.user_id = $1`;

function sessionDto(row) {
  return {
    id: row.id,
    scenario_id: row.scenario_id,
    title: row.title,
    status: row.status,
    scenario: row.scenario,
    started_at: row.started_at,
    ended_at: row.ended_at,
    last_message_at: row.last_message_at,
    message_count: row.message_count,
    avg_score: row.avg_score,
    last_user_text: row.last_user_text,
  };
}

function messageDto(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    content_ko: row.content_ko,
    corrections: row.corrections,
    scores: row.scores,
    suggestion: row.suggestion,
    degraded: row.degraded,
    provider: row.provider,
    model: row.model,
    created_at: row.created_at,
  };
}

export function correctionDto(row) {
  return {
    id: row.id,
    original: row.original,
    corrected: row.corrected,
    reason: row.reason,
    type: row.type,
    seen_count: row.seen_count,
    status: row.status,
    next_review_at: row.next_review,
    next_review_in_days: row.next_review_in_days,
    interval_days: row.interval_days,
    ease_factor: row.ease_factor,
    review_count: row.review_count,
    fail_count: row.fail_count,
    last_result: row.last_result,
    session_id: row.session_id,
    message_id: row.message_id,
    suspended: row.suspended,
    created_at: row.created_at,
    preview: predict(row), // srs.js 재사용 — corrections가 vocab과 같은 컬럼 세트인 이유
  };
}

export async function listSessions(user) {
  const { rows } = await pool.query(
    `${SESSION_SELECT} ORDER BY COALESCE(s.last_message_at, s.started_at) DESC LIMIT 50`,
    [user.id],
  );
  return { sessions: rows.map(sessionDto) };
}

export async function getSessionDto(user, sessionId, client = pool) {
  const { rows: [row] } = await client.query(
    `SELECT * FROM (${SESSION_SELECT}) t WHERE t.id = $2`,
    [user.id, sessionId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
  return sessionDto(row);
}

export async function createSession(user, { title, scenario, scenarioId } = {}) {
  let snapshot = scenario ?? null;
  let resolvedTitle = title ?? null;
  let openingMessage = null;
  if (scenarioId) {
    const selected = await getScenarioForSession(user, scenarioId);
    resolvedTitle ||= selected.title;
    snapshot = {
      tag: selected.tag,
      level: '★'.repeat(selected.level) + '☆'.repeat(5 - selected.level),
      title: selected.title,
      description: selected.description,
      opening_message: selected.opening_message,
      objectives: selected.objectives,
    };
    openingMessage = selected.opening_message || null;
  }
  return withTx(async (client) => {
    const { rows: [row] } = await client.query(
      `INSERT INTO conversation_sessions (user_id, title, scenario, scenario_id, last_message_at)
       VALUES ($1, COALESCE($2, '새 회화'), $3::jsonb, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE now() END)
       RETURNING id`,
      [user.id, resolvedTitle, snapshot ? JSON.stringify(snapshot) : null, scenarioId ?? null, openingMessage],
    );
    if (openingMessage) {
      await client.query(
        `INSERT INTO conversation_messages (session_id, user_id, role, content)
         VALUES ($1, $2, 'assistant', $3)`,
        [row.id, user.id, openingMessage],
      );
    }
    return { session: await getSessionDto(user, row.id, client) };
  });
}

export async function getSessionWithMessages(user, sessionId) {
  const session = await getSessionDto(user, sessionId);
  const { rows } = await pool.query(
    `SELECT * FROM conversation_messages
      WHERE session_id = $1 AND user_id = $2
      ORDER BY id ASC LIMIT 500`,
    [sessionId, user.id],
  );
  return { session, messages: rows.map(messageDto) };
}

export async function patchSession(user, sessionId, { title, ended }) {
  const { rowCount } = await pool.query(
    `UPDATE conversation_sessions
        SET title  = COALESCE($3, title),
            status = CASE WHEN $4 THEN 'ended' ELSE status END,
            ended_at = CASE WHEN $4 AND ended_at IS NULL THEN now() ELSE ended_at END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [sessionId, user.id, title ?? null, Boolean(ended)],
  );
  if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
  return { session: await getSessionDto(user, sessionId) };
}

export async function deleteSession(user, sessionId) {
  const { rowCount } = await pool.query(
    `DELETE FROM conversation_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, user.id],
  );
  if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
}

// 멱등 replay: 같은 client_request_id의 user 행 + 바로 다음 assistant 행.
// 트랜잭션 밖 SELECT — 저장 전에 확인하고, 23505 경합 시에도 이 경로로 재응답한다.
export async function findReplay(user, sessionId, clientRequestId, client = pool) {
  if (!clientRequestId) return null;
  const { rows: [userRow] } = await client.query(
    `SELECT * FROM conversation_messages
      WHERE client_request_id = $1 AND user_id = $2`,
    [clientRequestId, user.id],
  );
  if (!userRow) return null;
  const { rows: [assistantRow] } = await client.query(
    `SELECT * FROM conversation_messages
      WHERE session_id = $1 AND id > $2 AND role = 'assistant'
      ORDER BY id ASC LIMIT 1`,
    [userRow.session_id, userRow.id],
  );
  return {
    replay: true,
    session: await getSessionDto(user, userRow.session_id, client),
    user_message: messageDto(userRow),
    assistant_message: assistantRow ? messageDto(assistantRow) : null,
    corrections_saved: 0,
  };
}

// 세션 로드 + 소유권/상태 검사 (전송 전).
export async function loadSessionForSend(user, sessionId) {
  const { rows: [session] } = await pool.query(
    `SELECT s.id, s.title, s.status, s.provider_ref, s.provider_ref_provider,
            s.scenario_id, cs.system_prompt AS scenario_system_prompt,
            cs.opening_message AS scenario_opening_message
       FROM conversation_sessions s
       LEFT JOIN scenario_details cs ON cs.content_id = s.scenario_id
      WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, user.id],
  );
  if (!session) throw new HttpError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
  if (session.status === 'ended') {
    throw new HttpError(409, 'SESSION_ENDED', '종료된 세션입니다.',
      { hint: '종료된 세션입니다. 새 회화를 시작하세요.' });
  }
  return session;
}

// 히스토리는 DB가 단일 소스 — 클라이언트 history는 받지 않는다.
// 첫 턴과 resume 폴백에서만 프롬프트에 들어간다(CLI 세션 resume 시엔 생략). askAI가 LIMITS(8턴/6000자)로 다시 절단하므로 넉넉히 16개.
export async function loadHistory(sessionId) {
  const { rows } = await pool.query(
    `SELECT role, content FROM conversation_messages
      WHERE session_id = $1 ORDER BY id DESC LIMIT 16`,
    [sessionId],
  );
  return rows.reverse();
}

// 원자 저장: user 행 + assistant 행 + corrections 적재 + 세션 갱신 (트랜잭션 하나).
// AI 호출은 이 함수 밖에서 끝났다 — 트랜잭션 안에서 CLI를 기다리지 않는다 (pool.max=8).
export async function saveExchange(user, sessionId, { text, clientRequestId, ai }) {
  try {
    return await withTx(async (client) => {
      const { rows: [userRow] } = await client.query(
        `INSERT INTO conversation_messages
           (session_id, user_id, role, content, client_request_id)
         VALUES ($1, $2, 'user', $3, $4)
         RETURNING *`,
        [sessionId, user.id, text, clientRequestId ?? null],
      );

      const d = ai.data;
      const degraded = Boolean(ai.degraded);
      const { rows: [assistantRow] } = await client.query(
        `INSERT INTO conversation_messages
           (session_id, user_id, role, content, content_ko, corrections, scores,
            suggestion, degraded, provider, model, latency_ms)
         VALUES ($1, $2, 'assistant', $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)
         RETURNING *`,
        [sessionId, user.id,
         d.reply_en || '(응답 없음)', d.reply_ko ?? null,
         JSON.stringify(d.corrections || []),
         d.scores ? JSON.stringify(d.scores) : null,
         d.suggestion ?? null, degraded, ai.provider ?? null,
         ai.meta?.model ?? null, ai.meta?.durationMs ?? null],
      );

      // corrections 적재 — degraded 응답은 건너뜀 (자유 텍스트라 첨삭 신뢰 불가).
      // 재발(dedup_key 충돌)은 seen_count+1 + 즉시 due 승격.
      let correctionsSaved = 0;
      if (!degraded && Array.isArray(d.corrections)) {
        for (const c of d.corrections) {
          const original = String(c.original || '').slice(0, 500);
          const corrected = String(c.corrected || '').slice(0, 500);
          if (!original || !corrected) continue;
          await client.query(
            `INSERT INTO corrections
               (user_id, session_id, message_id, original, corrected, reason, type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, dedup_key) DO UPDATE
               SET seen_count  = corrections.seen_count + 1,
                   next_review = LEAST(corrections.next_review, now()),
                   message_id  = EXCLUDED.message_id, session_id = EXCLUDED.session_id,
                   reason      = COALESCE(EXCLUDED.reason, corrections.reason),
                   updated_at  = now()`,
            [user.id, sessionId, userRow.id, original, corrected,
             c.reason ? String(c.reason).slice(0, 500) : null,
             ['grammar', 'usage', 'spelling'].includes(c.type) ? c.type : 'usage'],
          );
          correctionsSaved += 1;
        }
      }

      await client.query(
        `UPDATE conversation_sessions
            SET last_message_at = now(), updated_at = now(),
                title = CASE WHEN title = '새 회화' THEN left($3, 40) ELSE title END,
                -- CLI resume 핸들: 다음 턴이 같은 provider 면 히스토리 없이 이어간다. stateless provider(ollama) 는 NULL 로 비운다
                provider_ref = $4, provider_ref_provider = $5
          WHERE id = $1 AND user_id = $2`,
        [sessionId, user.id, text, ai.sessionRef ?? null, ai.sessionRef ? (ai.provider ?? null) : null],
      );

      return {
        session: await getSessionDto(user, sessionId, client),
        user_message: messageDto(userRow),
        assistant_message: messageDto(assistantRow),
        corrections_saved: correctionsSaved,
      };
    });
  } catch (err) {
    // 동시 중복 전송 경합: reqid UNIQUE(23505) → replay 경로로 재응답.
    // 이 분기를 빼먹으면 "더블클릭할 때만 500"이 난다.
    if (err?.code === '23505' && clientRequestId) {
      const replay = await findReplay(user, sessionId, clientRequestId);
      if (replay) return replay;
    }
    throw err;
  }
}

// export: corrections.service.js(복습 응답)와 progress.service.js가 due 집계를 재구현하지 않는다
// (vocab.service.js의 fetchStats export와 같은 규범).
export async function fetchCorrectionStats(userId, client = pool) {
  const { rows: [stats] } = await client.query(
    `SELECT count(*) FILTER (WHERE NOT suspended AND next_review <= now())::int AS due,
            count(*) FILTER (WHERE NOT suspended)                          ::int AS total
       FROM corrections WHERE user_id = $1`,
    [userId],
  );
  return stats;
}

// 단건 재조회 — 복습 UPDATE 직후 서버 파생값(status/preview/next_review_in_days)을 다시 계산한다.
export async function getCorrectionDto(user, correctionId, client = pool) {
  const { rows: [row] } = await client.query(
    `SELECT * FROM (${CORRECTION_SELECT}) t WHERE t.id = $3`,
    [user.id, user.tz, correctionId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '첨삭을 찾을 수 없습니다.');
  return correctionDto(row);
}

export async function listCorrections(user, { due, limit = 50 } = {}) {
  const params = [user.id, user.tz];
  let sql = `${CORRECTION_SELECT}`;
  if (due) sql += ` AND c.suspended = false AND c.next_review <= now()`;
  params.push(limit);
  sql += ` ORDER BY c.next_review ASC, c.id ASC LIMIT $${params.length}`;
  const { rows } = await pool.query(sql, params);
  return { corrections: rows.map(correctionDto), stats: await fetchCorrectionStats(user.id) };
}
