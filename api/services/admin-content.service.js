// 관리자 콘텐츠 서비스 — 목록 · 상태 전이 · 공개 여닫기 (플랜 11 Phase 2) · 레슨 생성/수정 (플랜 13 Phase A).
//
// 규범:
//  - 전이 판정의 단일 소스는 api/lib/content-status.js (플랜 11 결정 7). 라우트는 역할을 고정하지 않고
//    같은 엔드포인트라도 `to` 에 따라 필요한 역할이 달라진다(draft→review 는 author, →published 는 reviewer).
//  - 전이·생성·수정마다 content_audit_log 1행 (플랜 11 결정 5). 승인자가 곧 작성자면 self_review 를
//    남기고, REQUIRE_SEPARATE_REVIEWER=1 이면 자가 승인이 403 이 된다(결정 9).
//  - 저작 검증의 단일 소스는 서버 — AI 생성과 같은 validateGeneratedLesson 을 그대로 호출한다
//    (플랜 13 결정 2). 실패는 422 + validation_errors 로 돌려주고 화면은 그대로 렌더만 한다.
//  - 이 파일의 GET 은 관리 화면 전용이라 정답(answer)·해설(explanation)을 포함한다 —
//    라우트가 requireRole('author') 이상으로 가드한다. 학습 API 의 비노출 규범과 혼동하지 말 것.
import { assertTransition } from '../lib/content-status.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { loadRoles } from '../lib/roles.js';
import { withTx } from '../lib/tx.js';
import { validateGeneratedLesson } from './ai-job.service.js';

export const CONTENT_TYPES = ['lesson', 'scenario', 'vocab_set'];
const LESSON_KINDS = ['toeic_part5', 'toeic_part7', 'toeic_lc'];

const CONTENT_COLS = `
  c.id, c.type, c.slug, c.title, c.description, c.difficulty, c.status, c.visibility,
  c.source, c.created_by, c.created_at, c.updated_at`;

function contentDto(row) {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    status: row.status,
    visibility: row.visibility,
    source: row.source,
    created_by: row.created_by,
    created_by_email: row.created_by_email ?? null,
    kind: row.kind ?? null,
    question_count: row.question_count ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listContents(actor, { type, status, q, limit = 100, offset = 0 } = {}) {
  const params = [];
  const where = ['1=1'];
  if (type) {
    if (!CONTENT_TYPES.includes(type)) {
      throw new HttpError(400, 'BAD_REQUEST', `type 은 ${CONTENT_TYPES.join('/')} 중 하나여야 합니다.`);
    }
    params.push(type);
    where.push(`c.type = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(c.title ILIKE $${params.length} OR c.slug ILIKE $${params.length})`);
  }
  const whereSql = where.join(' AND ');

  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM content_items c WHERE ${whereSql}`, params,
  );
  // 상태 칩 개수는 status 필터와 무관한 전체다 — 필터를 누르면 배지가 그 필터를 따라 바뀌면 안 된다.
  const countParams = type ? [type] : [];
  const { rows: countRows } = await pool.query(
    `SELECT c.status, count(*)::int AS cnt FROM content_items c
      ${type ? 'WHERE c.type = $1' : ''} GROUP BY c.status`,
    countParams,
  );
  const counts = { draft: 0, review: 0, published: 0, archived: 0 };
  for (const r of countRows) counts[r.status] = r.cnt;

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT ${CONTENT_COLS}, u.email AS created_by_email, d.kind,
            (SELECT count(*)::int FROM lesson_items i WHERE i.content_id = c.id) AS question_count
       FROM content_items c
       LEFT JOIN lesson_details d ON d.content_id = c.id
       LEFT JOIN users u ON u.id = c.created_by
      WHERE ${whereSql}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { contents: rows.map(contentDto), total, counts };
}

// 관리 화면 상세 — 에디터가 그대로 폼에 채운다. 레슨 문항은 answer/explanation 포함(파일 머리 주석).
export async function getContent(actor, contentId) {
  const { rows: [c] } = await pool.query(
    `SELECT ${CONTENT_COLS}, u.email AS created_by_email
       FROM content_items c LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = $1`,
    [contentId],
  );
  if (!c) throw new HttpError(404, 'NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
  const content = contentDto(c);

  if (c.type === 'lesson') {
    const { rows: [d] } = await pool.query(
      `SELECT kind, subtitle, est_minutes, passage, vocab, faq, position
         FROM lesson_details WHERE content_id = $1`,
      [contentId],
    );
    const { rows: items } = await pool.query(
      `SELECT position, stem, options, answer, explanation, skill_code
         FROM lesson_items WHERE content_id = $1 ORDER BY position`,
      [contentId],
    );
    content.detail = d ?? null;
    content.items = items;
    content.question_count = items.length;
  } else if (c.type === 'scenario') {
    const { rows: [d] } = await pool.query(
      `SELECT tag, level, system_prompt, opening_message, objectives
         FROM scenario_details WHERE content_id = $1`,
      [contentId],
    );
    content.detail = d ?? null;
  } else if (c.type === 'vocab_set') {
    const { rows: [d] } = await pool.query(
      `SELECT words FROM vocab_set_details WHERE content_id = $1`, [contentId],
    );
    content.detail = d ?? null;
  }

  const { rows: audit } = await pool.query(
    `SELECT a.id, a.action, a.from_status, a.to_status, a.note, a.rev, a.created_at, u.email AS actor_email
       FROM content_audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.content_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT 5`,
    [contentId],
  );
  content.recent_audit = audit;
  content.current_rev = await latestRev(pool, contentId);
  return { content };
}

async function writeAudit(client, { contentId, actorId, action, fromStatus = null, toStatus = null, note = '', rev = null }) {
  await client.query(
    `INSERT INTO content_audit_log (content_id, actor_id, action, from_status, to_status, note, rev)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [contentId, actorId, action, fromStatus, toStatus, note, rev],
  );
}

// ── 리비전 (0019) — 저장 1번 = rev 1행, 현재 본문 = 최신 rev ────────────────
// 스냅숏은 에디터 페이로드와 같은 모양이라 복원이 곧 "그 페이로드로 다시 저장"이다.

async function latestRev(client, contentId) {
  const { rows: [r] } = await client.query(
    `SELECT COALESCE(max(rev), 0)::int AS rev FROM content_revisions WHERE content_id = $1`,
    [contentId],
  );
  return r.rev;
}

// 호출 전 content_items 행이 FOR UPDATE 로 잠겨 있어야 rev 채번이 경합하지 않는다.
async function writeRevision(client, { contentId, actorId, snapshot, statusAt, note }) {
  const rev = (await latestRev(client, contentId)) + 1;
  await client.query(
    `INSERT INTO content_revisions (content_id, rev, snapshot, status_at, note, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
    [contentId, rev, JSON.stringify(snapshot), statusAt, note, actorId],
  );
  return rev;
}

// 정규화 결과 → 스냅숏(에디터 PATCH 페이로드와 동일 모양). 복원 시 normalizeLessonPayload 를 그대로 통과한다.
function lessonSnapshot(p) {
  return {
    kind: p.kind, title: p.title, subtitle: p.subtitle, difficulty: p.difficulty,
    est_minutes: p.estMinutes, passage: p.passage, vocab: p.vocab, faq: p.faq,
    items: p.items.map((i) => ({
      stem: i.stem, options: i.options, answer: i.answer,
      explanation: i.explanation, skill_code: i.skill_code ?? null,
    })),
  };
}

// 상태 전이 — from 은 클라이언트가 아니라 잠근 행에서 읽는다(경합 시 이중 전이 방지).
export async function transitionStatus(actor, contentId, { to, note = '' }) {
  await loadRoles();
  return withTx(async (client) => {
    const { rows: [row] } = await client.query(
      `SELECT id, status, visibility, created_by FROM content_items WHERE id = $1 FOR UPDATE`,
      [contentId],
    );
    if (!row) throw new HttpError(404, 'NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');

    assertTransition(row.status, to, actor.role);

    // 자가 승인(결정 9) — 만든 사람이 published 로 올리면 사실을 남기고, 설정으로 막을 수 있다.
    // env 는 호출 시점에 읽는다 — 부팅 후 토글·테스트에서 켜고 끄기 위해서다.
    const selfReview = to === 'published' && row.created_by !== null && row.created_by === actor.id;
    if (selfReview && process.env.REQUIRE_SEPARATE_REVIEWER === '1') {
      throw new HttpError(403, 'FORBIDDEN', '자신이 만든 콘텐츠는 다른 검수자가 승인해야 합니다.');
    }

    const { rows: [updated] } = await client.query(
      `UPDATE content_items
          SET status = $2, updated_by = $3, updated_at = now()
        WHERE id = $1
        RETURNING ${CONTENT_COLS.replaceAll('c.', '')}`,
      [contentId, to, actor.id],
    );
    // 전이 시점의 본문 버전을 스탬프한다 — 승인 행의 rev 가 곧 "검수자가 승인한 그 내용"이다.
    // 리비전이 없는 타입(시나리오·단어 세트)은 0 → null.
    const revAt = await latestRev(client, contentId);
    await writeAudit(client, {
      contentId, actorId: actor.id, action: 'status_change',
      fromStatus: row.status, toStatus: to,
      note: [note, selfReview ? 'self_review=true' : null].filter(Boolean).join(' · '),
      rev: revAt || null,
    });
    return { content: contentDto(updated) };
  });
}

// 공개 여닫기 — 전이표와 별개의 조작(플랜 11 §5). reviewer 이상은 라우트가 가드한다.
// draft/review 의 public 은 DB CHECK 도 막지만, 409 로 이유를 먼저 말해 준다.
export async function setVisibility(actor, contentId, { to }) {
  if (!['public', 'private'].includes(to)) {
    throw new HttpError(400, 'BAD_REQUEST', 'to 는 public/private 중 하나여야 합니다.');
  }
  return withTx(async (client) => {
    const { rows: [row] } = await client.query(
      `SELECT id, status, visibility FROM content_items WHERE id = $1 FOR UPDATE`,
      [contentId],
    );
    if (!row) throw new HttpError(404, 'NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
    if (row.visibility === to) throw new HttpError(409, 'CONFLICT', `이미 ${to} 상태입니다.`);
    if (to === 'public' && !['published', 'archived'].includes(row.status)) {
      throw new HttpError(409, 'CONFLICT', `${row.status} 상태의 콘텐츠는 공개할 수 없습니다.`);
    }
    const { rows: [updated] } = await client.query(
      `UPDATE content_items
          SET visibility = $2, updated_by = $3, updated_at = now()
        WHERE id = $1
        RETURNING ${CONTENT_COLS.replaceAll('c.', '')}`,
      [contentId, to, actor.id],
    );
    await writeAudit(client, {
      contentId, actorId: actor.id, action: 'visibility_change',
      note: `${row.visibility} → ${to}`,
    });
    return { content: contentDto(updated) };
  });
}

// ── 레슨 저작 (플랜 13 Phase A) ─────────────────────────────────────────────

// 저작 페이로드 정규화 + 서버 검증. AI 생성과 같은 규칙(validateGeneratedLesson)을 그대로 통과해야
// 저장된다 — LC 는 passage.body 가 곧 script([{speaker,text}]) 라서 그대로 넘긴다.
function normalizeLessonPayload(payload) {
  const errors = [];
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  const kind = LESSON_KINDS.includes(p.kind) ? p.kind : null;
  if (!kind) errors.push(`kind 는 ${LESSON_KINDS.join('/')} 중 하나여야 합니다.`);

  const title = typeof p.title === 'string' ? p.title.trim() : '';
  if (title.length < 1 || title.length > 200) errors.push('title 은 1~200자여야 합니다.');

  const difficulty = Number(p.difficulty ?? 3);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    errors.push('difficulty 는 1~5 정수여야 합니다.');
  }
  const subtitle = typeof p.subtitle === 'string' ? p.subtitle.trim() : '';

  const passage = p.passage && typeof p.passage === 'object' && !Array.isArray(p.passage) ? p.passage : null;
  if (!passage) errors.push('passage 객체가 필요합니다.');

  const items = Array.isArray(p.items) ? p.items : [];
  if (items.length < 1 || items.length > 20) errors.push('문항은 1~20개여야 합니다.');

  const vocab = Array.isArray(p.vocab) ? p.vocab : [];
  const faq = Array.isArray(p.faq) ? p.faq : [];

  const estRaw = p.est_minutes ?? Math.max(3, Math.ceil(items.length * 1.2));
  const estMinutes = Number(estRaw);
  if (!Number.isInteger(estMinutes) || estMinutes < 1 || estMinutes > 180) {
    errors.push('est_minutes 는 1~180 정수여야 합니다.');
  }

  if (errors.length === 0) {
    errors.push(...validateGeneratedLesson(
      { title, items, script: kind === 'toeic_lc' ? passage.body : undefined },
      items.length,
      { part: kind === 'toeic_lc' ? 'lc' : undefined },
    ));
  }
  if (errors.length) {
    throw new HttpError(422, 'VALIDATION_FAILED', '저장 전 검증에 실패했습니다.', { validation_errors: errors });
  }
  return { kind, title, difficulty, subtitle, passage, items, vocab, faq, estMinutes };
}

async function replaceItems(client, contentId, items) {
  await client.query(`DELETE FROM lesson_items WHERE content_id = $1`, [contentId]);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    await client.query(
      `INSERT INTO lesson_items (content_id, position, stem, options, answer, explanation, skill_code)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [contentId, i + 1, item.stem, JSON.stringify(item.options), item.answer,
       item.explanation, item.skill_code ?? null],
    );
  }
}

// 생성 — 항상 draft + private + curated 로 태어난다(플랜 11 결정 1 기본값 함정: status 는 명시).
// 공개는 상태 전이(→ published)와 공개 여닫기가 따로 담당한다. rev 1 이 함께 생긴다.
export async function createLesson(actor, payload) {
  const p = normalizeLessonPayload(payload);
  const slugBase = `curated-${p.kind.replace(/_/g, '-')}`;
  return withTx(async (client) => {
    const { rows: [pos] } = await client.query(
      `SELECT COALESCE(max(position), 0)::int + 1 AS next FROM lesson_details`);
    const { rows: [row] } = await client.query(
      `INSERT INTO content_items (type, slug, title, difficulty, status, visibility, source, created_by, updated_by)
       VALUES ('lesson', $1, $2, $3, 'draft', 'private', 'curated', $4, $4)
       RETURNING id`,
      [`${slugBase}-${Date.now()}`, p.title, p.difficulty, actor.id],
    );
    await client.query(
      `INSERT INTO lesson_details (content_id, kind, subtitle, est_minutes, passage, vocab, faq, position)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
      [row.id, p.kind, p.subtitle, p.estMinutes, JSON.stringify(p.passage),
       JSON.stringify(p.vocab), JSON.stringify(p.faq), pos.next],
    );
    await replaceItems(client, row.id, p.items);
    const rev = await writeRevision(client, {
      contentId: row.id, actorId: actor.id, snapshot: lessonSnapshot(p), statusAt: 'draft', note: '생성',
    });
    await writeAudit(client, { contentId: row.id, actorId: actor.id, action: 'create', note: 'lesson 생성', rev });
    return getContentInTx(client, row.id);
  });
}

// 저장(수정·복원)의 공통 경로 — 본문 교체 + 새 리비전 + 감사 로그.
// 검수 중(review) 저장은 검수 요청을 자동 철회해 초안으로 되돌린다:
// 검수자가 본 것과 다른 내용이 그대로 승인되는 구멍을 막는다(승인 무결성).
async function applyLessonSave(client, actor, row, p, { action, note }) {
  await client.query(
    `UPDATE content_items
        SET title = $2, difficulty = $3,
            source = CASE WHEN source = 'seed' THEN 'curated' ELSE source END,
            updated_by = $4, updated_at = now()
      WHERE id = $1`,
    [row.id, p.title, p.difficulty, actor.id],
  );
  await client.query(
    `UPDATE lesson_details
        SET kind = $2, subtitle = $3, est_minutes = $4,
            passage = $5::jsonb, vocab = $6::jsonb, faq = $7::jsonb
      WHERE content_id = $1`,
    [row.id, p.kind, p.subtitle, p.estMinutes,
     JSON.stringify(p.passage), JSON.stringify(p.vocab), JSON.stringify(p.faq)],
  );
  await replaceItems(client, row.id, p.items);
  const rev = await writeRevision(client, {
    contentId: row.id, actorId: actor.id, snapshot: lessonSnapshot(p), statusAt: row.status, note,
  });
  await writeAudit(client, { contentId: row.id, actorId: actor.id, action, note, rev });
  if (row.status === 'review') {
    await client.query(
      `UPDATE content_items SET status = 'draft', updated_at = now() WHERE id = $1`, [row.id]);
    await writeAudit(client, {
      contentId: row.id, actorId: actor.id, action: 'status_change',
      fromStatus: 'review', toStatus: 'draft', note: '수정으로 검수 요청 자동 철회', rev,
    });
  }
  return rev;
}

async function lockLessonRow(client, contentId) {
  const { rows: [row] } = await client.query(
    `SELECT id, type, status, source FROM content_items WHERE id = $1 FOR UPDATE`,
    [contentId],
  );
  if (!row || row.type !== 'lesson') throw new HttpError(404, 'NOT_FOUND', '레슨을 찾을 수 없습니다.');
  return row;
}

// 수정 — 시드 편집은 curated 로 표시해 재시드가 덮어쓰지 않게 한다(플랜 13 결정 5).
// 상태·가시성은 여기서 건드리지 않는다(검수 자동 철회 한 가지 예외) — 전이는 전이 API 의 일이다.
export async function updateLesson(actor, contentId, payload) {
  const p = normalizeLessonPayload(payload);
  return withTx(async (client) => {
    const row = await lockLessonRow(client, contentId);
    await applyLessonSave(client, actor, row, p, { action: 'update', note: '수정' });
    return getContentInTx(client, contentId);
  });
}

// ── 리비전 조회 · 복원 ──────────────────────────────────────────────────────

export async function listRevisions(actor, contentId) {
  const { rows: [c] } = await pool.query(
    `SELECT id FROM content_items WHERE id = $1`, [contentId]);
  if (!c) throw new HttpError(404, 'NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
  const { rows } = await pool.query(
    `SELECT r.rev, r.status_at, r.note, r.created_at, u.email AS created_by_email,
            r.snapshot ->> 'title' AS title,
            jsonb_array_length(r.snapshot -> 'items') AS question_count
       FROM content_revisions r LEFT JOIN users u ON u.id = r.created_by
      WHERE r.content_id = $1 ORDER BY r.rev DESC`,
    [contentId],
  );
  return { revisions: rows, current_rev: rows[0]?.rev ?? 0 };
}

export async function getRevision(actor, contentId, rev) {
  const { rows: [row] } = await pool.query(
    `SELECT r.rev, r.snapshot, r.status_at, r.note, r.created_at, u.email AS created_by_email
       FROM content_revisions r LEFT JOIN users u ON u.id = r.created_by
      WHERE r.content_id = $1 AND r.rev = $2`,
    [contentId, rev],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '리비전을 찾을 수 없습니다.');
  return { revision: row };
}

// 복원 = 과거 rev 의 스냅숏을 새 rev 로 다시 저장한다 — 이력을 지우거나 되감지 않는다.
// 스냅숏도 저장 시와 같은 검증을 다시 통과해야 한다(규칙이 그새 엄격해졌으면 422 로 알려준다).
export async function restoreRevision(actor, contentId, rev) {
  return withTx(async (client) => {
    const row = await lockLessonRow(client, contentId);
    const { rows: [r] } = await client.query(
      `SELECT snapshot FROM content_revisions WHERE content_id = $1 AND rev = $2`,
      [contentId, rev],
    );
    if (!r) throw new HttpError(404, 'NOT_FOUND', '리비전을 찾을 수 없습니다.');
    const p = normalizeLessonPayload(r.snapshot);
    const newRev = await applyLessonSave(client, actor, row, p, {
      action: 'restore', note: `복원 ← rev ${rev}`,
    });
    const result = await getContentInTx(client, contentId);
    result.restored = { from_rev: rev, to_rev: newRev };
    return result;
  });
}

// 트랜잭션 안에서 쓰는 상세 재조회 — 커밋 전 행을 같은 커넥션으로 읽어야 한다.
async function getContentInTx(client, contentId) {
  const { rows: [c] } = await client.query(
    `SELECT ${CONTENT_COLS}, u.email AS created_by_email
       FROM content_items c LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = $1`,
    [contentId],
  );
  const { rows: [d] } = await client.query(
    `SELECT kind, subtitle, est_minutes, passage, vocab, faq, position
       FROM lesson_details WHERE content_id = $1`,
    [contentId],
  );
  const { rows: items } = await client.query(
    `SELECT position, stem, options, answer, explanation, skill_code
       FROM lesson_items WHERE content_id = $1 ORDER BY position`,
    [contentId],
  );
  const content = contentDto(c);
  content.detail = d ?? null;
  content.items = items;
  content.question_count = items.length;
  content.current_rev = await latestRev(client, contentId);
  return { content };
}
