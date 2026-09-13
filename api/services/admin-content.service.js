// 관리자 콘텐츠 서비스 — 목록 · 상태 전이 · 공개 여닫기 (플랜 11 Phase 2 · §5 API 표면).
//
// ── 이 파일이 학습 쪽 서비스와 갈리는 한 지점 ────────────────────────────────
// **content-scope 의 두 헬퍼(discoverable/resolvable)를 쓰지 않는다.** 두 헬퍼는 "학습자가
// 무엇을 볼 수 있는가" 를 정하는데, 관리 화면은 정확히 그 바깥(draft·review)을 보러 오는 화면이다.
// 여기에 discoverable 을 걸면 방금 만든 초안이 관리 목록에서 사라져 저작이 시작조차 못 한다.
// 대신 접근 자체를 라우트의 `requireRole('author')` 가 막는다 — 가시성이 아니라 역할이 경계다.
//
// ── 누가 무엇을 보는가 — v1 은 author 이상이면 전부 본다 ─────────────────────
// 콘텐츠 소유(자기가 만든 것만 보인다) 개념을 v1 에 넣지 않는다. 이유 셋:
//   (1) 지금 `created_by` 는 시드 콘텐츠가 NULL 이고 AI 생성물만 사용자를 가리킨다.
//       소유로 거르면 카탈로그의 대부분인 시드 콘텐츠가 **누구에게도** 안 보인다.
//   (2) 넓게 보여 줘도 할 수 있는 일은 전이표가 이미 묶는다 — author 는 `draft → review` 까지고
//       남의 콘텐츠를 발행할 수 없다(content-status.js). 목록 가시성으로 권한을 흉내 낼 필요가 없다.
//   (3) 검수 큐(12)와 토픽 구성(13)은 본질적으로 남이 만든 것을 봐야 하는 화면이다.
//       지금 소유 필터를 넣으면 두 플랜이 곧바로 그것을 뜯어내야 한다.
// 소유 개념이 필요해지는 날 붙을 자리는 `buildFilters` 의 WHERE 한 줄이다.
import { config } from '../config.js';
import { CONTENT_STATUSES, assertSetVisibility, assertTransition, canTransition } from '../lib/content-status.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { loadRoles } from '../lib/roles.js';
import { withTx } from '../lib/tx.js';

// `content_items_type_ck` 와 같은 집합이어야 한다. content-status.js 가 상태·가시성만 들고
// 타입은 들고 있지 않아 여기서 정의한다(타입은 전이 규칙과 무관하다). 라우트의 `:type` 검증이 이것을 쓴다.
export const CONTENT_TYPES = Object.freeze(['lesson', 'scenario', 'vocab_set', 'speaking_set']);

// 자가 승인 표식 (결정 9). `content_audit_log` 에 self_review 컬럼이 없어서 `note` 앞에 붙인다.
//   - `action` 을 새로 나누지 않는 이유: `content_audit_log_action_ck` 가 5종으로 고정돼 있어
//     값을 늘리려면 마이그레이션이 필요하고, 무엇보다 "action='status_change' = 상태 전이 1건" 이라는
//     불변식이 깨진다. 감사 로그를 훑는 쪽(12 의 검수 큐)이 전이를 셀 때 두 값을 다 알아야 한다.
//   - `note` 앞(뒤가 아니라)에 붙이는 이유: 사유가 길어 잘려도 표식은 살아남는다.
// 상수로 내보내는 이유는 판정을 문자열 리터럴로 두 곳에 쓰지 않기 위해서다 — 12 와 관리 UI 가 이것을 본다.
export const SELF_REVIEW_TAG = '[self_review]';

// 문항 수 — 타입마다 세는 대상이 다르다. 시나리오·스피킹 세트는 "문항" 이라 부를 것이 없어 NULL 이고
// 화면은 그것을 '—' 로 그린다(0 으로 뭉개면 "문항이 없는 레슨" 과 구분되지 않는다).
const ITEM_COUNT = `
  CASE c.type
    WHEN 'lesson'    THEN (SELECT count(*)::int FROM lesson_items li WHERE li.content_id = c.id)
    WHEN 'vocab_set' THEN (SELECT jsonb_array_length(vd.words) FROM vocab_set_details vd WHERE vd.content_id = c.id)
    ELSE NULL
  END`;

// 목록 행과 전이 응답 행이 **같은 모양**이어야 한다 — 관리 UI 가 전이 후 목록의 그 행을 통째로 갈아끼운다.
// 그래서 컬럼 정의를 한 곳에 두고 fetchContent 가 같은 것을 쓴다.
const LIST_SOURCE = `
  content_items c
  LEFT JOIN users cu ON cu.id = c.created_by
  LEFT JOIN users uu ON uu.id = c.updated_by`;

const LIST_COLS = `
  c.id, c.type, c.slug, c.title, c.description, c.difficulty,
  c.status, c.visibility, c.source,
  c.created_at, c.updated_at, c.created_by, c.updated_by,
  COALESCE(NULLIF(btrim(cu.display_name), ''), cu.email) AS created_by_name,
  COALESCE(NULLIF(btrim(uu.display_name), ''), uu.email) AS updated_by_name,
  ${ITEM_COUNT} AS item_count,
  (SELECT count(*)::int FROM topic_contents tc WHERE tc.content_id = c.id) AS topic_count`;

// 목록 필터 — status 는 여기 넣지 않는다. 상태 칩의 건수를 "이 칩을 누르면 몇 건" 으로 세려면
// 지금 걸린 status 자신은 빼고 집계해야 하기 때문이다(아래 counts 참조).
function buildFilters({ type, q }, params) {
  const where = ['1=1'];
  if (type) {
    params.push(type);
    where.push(`c.type = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(c.title ILIKE $${params.length} OR c.slug ILIKE $${params.length})`);
  }
  return where;
}

async function fetchContent(client, contentId) {
  const { rows: [row] } = await client.query(
    `SELECT ${LIST_COLS} FROM ${LIST_SOURCE} WHERE c.id = $1`, [contentId],
  );
  return row;
}

// 행을 잠그고 타입까지 확인한다.
//   - `FOR UPDATE` — 판정(assertTransition)과 UPDATE 사이에 다른 요청이 같은 행의 status 를 바꾸면
//     전이표를 통과하지 않은 조합이 저장된다. 잠그지 않으면 그 경합이 감사 로그에도 남지 않는다.
//   - 타입 불일치를 404 로 **뭉갠다** — "id 는 있는데 타입이 다르다" 를 알려 주면 다른 유형의 id 를
//     훑어 존재 여부를 알아내는 통로가 된다. 없는 것과 같은 답을 준다.
async function lockContent(client, type, contentId) {
  const { rows: [row] } = await client.query(
    `SELECT id, type, status, visibility, created_by
       FROM content_items WHERE id = $1 FOR UPDATE`,
    [contentId],
  );
  if (!row || (type && row.type !== type)) {
    throw new HttpError(404, 'NOT_FOUND', '콘텐츠를 찾을 수 없습니다.');
  }
  return row;
}

// 감사 로그 1행. 전이마다 반드시 남긴다 — 빠지면 "누가 언제 내렸는지" 가 영영 사라진다.
// `from_status`/`to_status` 는 이름이 status 지만 가시성 변경에서는 public/private 이 들어간다.
// 컬럼이 그것뿐이고(제약 없는 TEXT), `action` 이 둘을 구분하므로 값을 버리는 것보다 낫다.
async function writeAudit(client, { contentId, actorId, action, from, to, note }) {
  await client.query(
    `INSERT INTO content_audit_log (content_id, actor_id, action, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [contentId, actorId, action, from ?? null, to ?? null, note || ''],
  );
}

export async function listContents(actor, { type, status, q, limit = 50, offset = 0 } = {}) {
  const baseParams = [];
  const baseWhere = buildFilters({ type, q }, baseParams).join(' AND ');

  // 상태 칩 건수 — status 필터를 **빼고** 센다. 칩이 말해야 하는 것은 "지금 몇 건 보이나" 가 아니라
  // "이 칩을 누르면 몇 건인가" 이고, 그래야 0건인 상태도 0 으로 보인다("없다" 도 정보다).
  const { rows: countRows } = await pool.query(
    `SELECT c.status, count(*)::int AS cnt FROM content_items c WHERE ${baseWhere} GROUP BY c.status`,
    baseParams,
  );
  // 4종 키를 서버가 채운다 — GROUP BY 는 0건인 상태의 행을 아예 내놓지 않아 화면에서 칩이 통째로 사라진다.
  const counts = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, 0]));
  for (const row of countRows) counts[row.status] = row.cnt;

  const params = baseParams.slice();
  let whereSql = baseWhere;
  if (status) {
    params.push(status);
    whereSql += ` AND c.status = $${params.length}`;
  }

  // total 은 status 까지 건 뒤의 건수다 — 화면이 "N건 중 M건 표시" 로 잘림을 알린다.
  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM content_items c WHERE ${whereSql}`, params,
  );

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT ${LIST_COLS}
       FROM ${LIST_SOURCE}
      WHERE ${whereSql}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  // 최근 감사 3건 — 목업 오른쪽 아래의 "전이마다 1행" 표시다. 목록과 같은 응답에 실어
  // 화면이 요청을 하나 더 보내지 않게 한다(전이 직후 새로고침으로 방금 남긴 줄이 바로 보인다).
  const { rows: recentAudit } = await pool.query(
    `SELECT a.id, a.content_id, a.action, a.from_status, a.to_status, a.note, a.created_at,
            a.actor_id, ci.type AS content_type, ci.title AS content_title,
            COALESCE(NULLIF(btrim(au.display_name), ''), au.email) AS actor_name
       FROM content_audit_log a
       JOIN content_items ci ON ci.id = a.content_id
       LEFT JOIN users au ON au.id = a.actor_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 3`,
  );

  return {
    contents: rows,
    total,
    counts,
    // 상태·타입 목록을 서버가 준다 — 화면이 4종을 다시 하드코딩하면 상태 축이 두 곳에 살게 된다.
    statuses: CONTENT_STATUSES,
    types: CONTENT_TYPES,
    recent_audit: recentAudit,
  };
}

// 상태 전이. 역할 판정은 라우트가 아니라 전이표(`assertTransition`)가 한다 —
// 같은 엔드포인트라도 `to` 에 따라 필요한 역할이 다르다(draft→review 는 author, →published 는 reviewer).
//
// **가시성은 건드리지 않는다**(열린 질문 7 확정안). archived 로 내려도 visibility 는 그대로라
// 되올리면 원래 보이던 사람에게 그대로 돌아온다. 공개 여닫기는 setVisibility 로 따로 간다.
// (published+public → archived 가 DB CHECK 를 통과하려면 `0018_content_archived_public.sql` 이
//  적용돼 있어야 한다. 적용 뒤에는 draft·review 가 public 일 수 없으므로 전이로 23514 가 나올 경로가 없다.)
// 두 API 가 트랜잭션 안의 같은 함수를 호출한다. 검수 전용 API 가 changeStatus 를 다시 호출하면
// 별도 트랜잭션이 열려 승인만 커밋되고 공개가 실패할 수 있다.
async function transitionContent(client, actor, row, { to, note = '' }) {
  assertTransition(row.status, to, actor.role);
  const selfReview = to === 'published' && row.created_by !== null && row.created_by === actor.id;
  if (selfReview && config.requireSeparateReviewer) {
    throw new HttpError(403, 'FORBIDDEN',
      '본인이 만든 콘텐츠는 본인이 승인할 수 없습니다. 다른 검수자에게 요청하세요.',
      { self_review: true });
  }
  await client.query(
    `UPDATE content_items SET status = $1, updated_at = now(), updated_by = $2 WHERE id = $3`,
    [to, actor.id, row.id],
  );
  // 생명주기 판정은 content_items.status 만 읽는다. review_status 는 생성 산출물의 검수 결과를
  // 남기는 부기다. 일반 전이 API 로 검수해도 함께 기록하지만 큐·권한·가시성의 조건으로 읽지 않는다.
  if (row.type === 'lesson' && row.status === 'review' && ['published', 'draft'].includes(to)) {
    await client.query(
      `UPDATE lesson_drafts SET review_status = $1, updated_at = now() WHERE published_content_id = $2`,
      [to === 'published' ? 'approved' : 'rejected', row.id],
    );
  }
  await writeAudit(client, {
    contentId: row.id, actorId: actor.id, action: 'status_change', from: row.status, to,
    note: selfReview ? `${SELF_REVIEW_TAG} ${note}`.trim() : note,
  });
  row.status = to;
  return selfReview;
}

export async function changeStatus(actor, type, contentId, { to, note = '' } = {}) {
  await loadRoles();
  return withTx(async (client) => {
    const row = await lockContent(client, type, contentId);
    const selfReview = await transitionContent(client, actor, row, { to, note });
    return { content: await fetchContent(client, row.id), self_review: selfReview };
  });
}

// 공개 여닫기. 상태는 바뀌지 않는다 — 이 조작은 `visibility` 한 컬럼만 건드린다.
// draft·review 를 public 으로 올리려는 요청은 `canSetVisibility` 가 409 로 먼저 막는다.
// DB 의 `content_items_public_ck`(23514)를 그대로 흘리면 fromPgError 가
// 400 "값이 허용 범위를 벗어났습니다." 로 바꿔 내보내는데 사용자에게 아무 의미가 없다.
async function changeVisibility(client, actor, row, { to, note = '' }) {
  if (row.visibility === to) {
    throw new HttpError(409, 'CONFLICT', `이미 ${to} 입니다.`, { visibility: to });
  }
  assertSetVisibility(row.status, to, actor.role);
  await client.query(
    `UPDATE content_items SET visibility = $1, updated_at = now(), updated_by = $2 WHERE id = $3`,
    [to, actor.id, row.id],
  );
  await writeAudit(client, {
    contentId: row.id, actorId: actor.id, action: 'visibility_change',
    from: row.visibility, to, note,
  });
  row.visibility = to;
}

export async function setVisibility(actor, type, contentId, { to, note = '' } = {}) {
  await loadRoles();
  return withTx(async (client) => {
    const row = await lockContent(client, type, contentId);
    await changeVisibility(client, actor, row, { to, note });
    return { content: await fetchContent(client, row.id) };
  });
}

// 검수 대상의 id 는 content_items.id 다 — 세 종류가 같은 키를 쓰고 레슨 초안만 선택적으로 붙는다.
// payload/validation_errors 는 레슨 생성 기록 그대로, 나머지 유형은 NULL 이다.
// generated_content 는 초안 행이 없는 시나리오·단어와 수기 레슨도 상세를 렌더할 수 있게 한다.
export async function listDrafts(actor, { type, q, limit = 50, offset = 0 } = {}) {
  await loadRoles();
  const params = [];
  const where = [...buildFilters({ type, q }, params), "c.status = 'review'"].join(' AND ');
  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM content_items c WHERE ${where}`, params,
  );
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT ${LIST_COLS}, ld.id AS draft_id, ld.job_id, ld.payload, ld.validation_errors,
            ld.provider, ld.model, d.kind,
            CASE c.type
              WHEN 'lesson' THEN COALESCE(ld.payload,
                to_jsonb(d) || jsonb_build_object('items',
                  (SELECT COALESCE(jsonb_agg(to_jsonb(li) ORDER BY li.position), '[]'::jsonb)
                   FROM lesson_items li WHERE li.content_id = c.id)))
              WHEN 'scenario' THEN to_jsonb(sd)
              WHEN 'vocab_set' THEN to_jsonb(vd)
              ELSE NULL
            END AS generated_content
       FROM ${LIST_SOURCE}
       LEFT JOIN lesson_drafts ld ON ld.published_content_id = c.id AND c.type = 'lesson'
       LEFT JOIN lesson_details d ON d.content_id = c.id
       LEFT JOIN scenario_details sd ON sd.content_id = c.id
       LEFT JOIN vocab_set_details vd ON vd.content_id = c.id
      WHERE ${where}
      ORDER BY c.updated_at, c.id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    drafts: rows.map((row) => {
      const selfReview = row.created_by !== null && row.created_by === actor.id;
      return {
        ...row, cross_check: null, self_review: selfReview,
        can_approve: canTransition(row.status, 'published', actor.role).ok
          && !(selfReview && config.requireSeparateReviewer),
        can_reject: canTransition(row.status, 'draft', actor.role).ok,
      };
    }),
    total, require_separate_reviewer: config.requireSeparateReviewer,
  };
}

async function reviewDraft(actor, contentId, { to, note, publish = false }) {
  await loadRoles();
  return withTx(async (client) => {
    const row = await lockContent(client, null, contentId);
    // 일반 전이표에는 draft→published 도 있지만 검수 버튼은 review 에서만 유효하다.
    // 낡은 큐·동시 승인·반려 뒤 재클릭은 역할 검사보다 먼저 409 로 끝내야 중복 감사가 생기지 않는다.
    if (row.status !== 'review') {
      throw new HttpError(409, 'CONFLICT', '검토 대기 중인 콘텐츠만 승인하거나 반려할 수 있습니다.',
        { from: row.status, to });
    }
    const selfReview = await transitionContent(client, actor, row, { to, note });
    if (publish) await changeVisibility(client, actor, row, { to: 'public', note });
    return { content: await fetchContent(client, row.id), self_review: selfReview };
  });
}

export async function approveDraft(actor, contentId, { note = '', publish = false } = {}) {
  if (typeof publish !== 'boolean') {
    throw new HttpError(400, 'BAD_REQUEST', 'publish 는 true/false 여야 합니다.');
  }
  return reviewDraft(actor, contentId, { to: 'published', note, publish });
}

export async function rejectDraft(actor, contentId, { note } = {}) {
  if (typeof note !== 'string' || !note.trim() || note.trim().length > 500) {
    throw new HttpError(400, 'BAD_REQUEST', '반려 사유를 1~500자로 입력해 주세요.');
  }
  return reviewDraft(actor, contentId, { to: 'draft', note: note.trim() });
}
