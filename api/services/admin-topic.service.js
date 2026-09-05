// 관리자 토픽 서비스 — 생성 · 수정 · 구성(콘텐츠 일괄 교체) · 상태 전이 · 공개 여닫기 (플랜 13 Phase B · §3 API 표면).
//
// ── 학습자 topic.service 와 갈리는 지점 ──────────────────────────────────────
// **토픽 자체에는 content-scope 의 가시성 헬퍼를 걸지 않는다.** 관리 화면은 draft·review 토픽을 보러 오는
// 화면이고(admin-content.service 머리말과 같은 이유), 경계는 가시성이 아니라 라우트의 requireRole('author') 다.
// 소유(자기가 만든 토픽만 보인다) 개념도 v1 에 넣지 않는다 — 토픽 구성은 본질적으로 남이 만든 콘텐츠를
// 붙이는 일이고, 시드 토픽은 created_by 가 NULL 이라 소유로 거르면 누구에게도 안 보인다.
//
// ── 집계 3종(lesson_count/scenario_count/vocab_count)과 eligible 은 학습자 쪽과 **같은 SQL·같은 임계치**다 ──
// topic.service.js 의 TOPIC_SUMMARY 는 "학습자에게 지금 보이는" 콘텐츠(discoverable)만 세고, topicDto 가
// 그 위에서 임계치(레슨 3 · 시나리오 1 · 단어 20)를 판정한다. 관리 화면의 eligible 배지가 답해야 하는 질문은
// "학습자가 이 토픽을 열면 완성된 토픽으로 보이는가" 이므로 같은 값을 내야 한다 — 관리 화면과 학습 화면이
// 다른 수를 말하면 관리자는 어느 쪽을 믿을지 알 수 없다. topicDto 가 export 되어 있지 않고 topic.service.js 는
// 이 작업의 배정 밖이라 import 하지 못해 같은 조각을 여기 다시 적는다(임계치를 바꾸는 날 두 파일을 함께 고친다).
// $1 은 topic.service 와 같이 **호출자(actor)의 user_id** 다 — 자기 private 콘텐츠는 자기 집계에는 든다.
// 붙인 콘텐츠 전체 수는 content_count 로 따로 준다 — 초안(draft·review)을 붙여 두면 content_count 에는 들고
// lesson_count 에는 안 드는데, 화면이 그 차이를 "붙였지만 아직 학습자에게 안 보인다" 로 설명할 수 있어야 한다.
//
// ── 감사 로그를 남기지 않는다 (이번 범위) ────────────────────────────────────
// content_audit_log.content_id 는 content_items 를 가리키는 진짜 FK 라 토픽 전이를 거기 적을 수 없다.
// 토픽용 감사 테이블(topic_audit_log)은 마이그레이션이 필요해 이 Phase 에 넣지 않았다. 그래서 상태·가시성
// 변경 응답이 `audit_logged: false` 를 **명시**한다 — 콘텐츠 전이 응답과 모양이 비슷해 "감사가 남았겠지" 로
// 읽히는 것을 막기 위해서다. 테이블이 생기면 changeStatus/setVisibility 두 곳에 INSERT 를 더한다.
import { ELIGIBLE_THRESHOLDS, isEligible, topicCountCols } from '../lib/topic-eligible.js';
import { CONTENT_STATUSES, assertSetVisibility, assertTransition } from '../lib/content-status.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { loadRoles } from '../lib/roles.js';
import { withTx } from '../lib/tx.js';

// topics_slug_ck 와 같은 정규식. 라우트가 사용자 입력 slug 를 이것으로 먼저 거른다(400) —
// DB 까지 가면 23514 가 400 "값이 허용 범위를 벗어났습니다." 로 뭉개져 무엇이 틀렸는지 알 수 없다.
export const TOPIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// topics_label_ck 의 상한(1~80). 같은 이유로 라우트가 먼저 본다.
export const TOPIC_LABEL_MAX = 80;
// 한 토픽에 붙일 수 있는 콘텐츠 상한. 상한이 없으면 PUT 한 번으로 topic_contents 를 임의 크기로 키울 수 있다.
export const TOPIC_CONTENTS_MAX = 200;
// eligible 임계치·집계는 api/lib/topic-eligible.js 가 단일 소스다(학습 API 와 같은 값). 화면이 "1/3" 배지를
// 그리려면 임계치를 알아야 하는데 그것을 화면에 다시 하드코딩하지 않도록 목록 응답에 실어 준다.
export { ELIGIBLE_THRESHOLDS };


// 목록 행 · 상세 · 각 변경 응답이 **같은 모양**이어야 한다 — 관리 UI 가 변경 뒤 목록의 그 행을 통째로 갈아끼운다.
const TOPIC_SOURCE = `
  topics t
  LEFT JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users uu ON uu.id = t.updated_by`;

const TOPIC_COLS = `
  t.id, t.slug, t.label_ko, t.description, t.status, t.visibility,
  t.created_at, t.updated_at, t.created_by, t.updated_by,
  COALESCE(NULLIF(btrim(cu.display_name), ''), cu.email) AS created_by_name,
  COALESCE(NULLIF(btrim(uu.display_name), ''), uu.email) AS updated_by_name,
  (SELECT count(*)::int FROM topic_contents tc WHERE tc.topic_id = t.id) AS content_count,
  ${topicCountCols('t', '$1')}`;

function topicDto(row) {
  return {
    ...row,
    eligible: isEligible(row),
  };
}

async function fetchTopic(client, actor, topicId) {
  const { rows: [row] } = await client.query(
    `SELECT ${TOPIC_COLS} FROM ${TOPIC_SOURCE} WHERE t.id = $2`, [actor.id, topicId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
  return topicDto(row);
}

// 구성 목록 — 상태 무관하게 붙어 있는 것 전부다(플랜 13 화면 미리보기: 구성은 상태와 무관, 공개는 각 콘텐츠의
// 전이로). status/visibility 를 함께 실어 화면이 '검토' 배지를 그릴 수 있게 한다.
async function fetchContents(client, topicId) {
  const { rows } = await client.query(
    `SELECT tc.content_id, tc.position, c.type, c.slug, c.title, c.status, c.visibility, c.source
       FROM topic_contents tc
       JOIN content_items c ON c.id = tc.content_id
      WHERE tc.topic_id = $1
      ORDER BY tc.position, tc.id`,
    [topicId],
  );
  return rows;
}

// 행을 잠근다 — 판정(assertTransition)과 UPDATE 사이, 또는 구성 DELETE 와 INSERT 사이에 다른 요청이 끼면
// 전이표를 통과하지 않은 조합이나 반쪽 구성이 저장된다.
async function lockTopic(client, topicId) {
  const { rows: [row] } = await client.query(
    `SELECT id, status, visibility, created_by FROM topics WHERE id = $1 FOR UPDATE`, [topicId],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
  return row;
}

export async function listTopics(actor, { q, limit = 50, offset = 0 } = {}) {
  const like = q ? `%${q}%` : null;
  // count 쿼리는 actor 를 쓰지 않는다 — 쓰지 않는 바인딩을 넘기면 PG 가 "bind message supplies N parameters" 로 거부한다.
  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM topics t
      WHERE ${like ? '(t.label_ko ILIKE $1 OR t.slug ILIKE $1)' : 'TRUE'}`,
    like ? [like] : [],
  );
  const params = [actor.id];
  let where = 'TRUE';
  if (like) {
    params.push(like);
    where = `(t.label_ko ILIKE $${params.length} OR t.slug ILIKE $${params.length})`;
  }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT ${TOPIC_COLS}
       FROM ${TOPIC_SOURCE}
      WHERE ${where}
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    topics: rows.map(topicDto),
    total,
    // 상태 4종과 임계치를 서버가 준다 — 화면이 다시 하드코딩하면 규칙이 두 곳에 산다.
    statuses: CONTENT_STATUSES,
    thresholds: ELIGIBLE_THRESHOLDS,
  };
}

export async function getTopic(actor, topicId) {
  const topic = await fetchTopic(pool, actor, topicId);
  return { topic, contents: await fetchContents(pool, topicId) };
}

// label → slug. 한글 라벨은 [a-z0-9] 가 하나도 안 남아 'topic' 으로 떨어지고 uniqueSlug 가 -2, -3 을 붙인다 —
// 한글 slug 를 로마자화하지 않는 이유는 topics_slug_ck 가 [a-z0-9-] 만 허용하고, 라벨은 언제든 고칠 수 있는
// 표시용 값인 반면 slug 는 URL 에 박히는 값이라 관리자가 원하면 명시적으로 넘기는 편이 낫기 때문이다.
function slugify(label) {
  const base = String(label).normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'topic';
}

// base, base-2, base-3 … 중 비어 있는 첫 번째. slug 는 [a-z0-9-] 뿐이라 LIKE 와일드카드(% _)가 섞일 일이 없다.
// 조회와 INSERT 사이의 경합(같은 라벨 동시 생성)은 topics.slug UNIQUE(23505)가 잡고 fromPgError 가 409 로 낸다.
async function uniqueSlug(client, base) {
  const { rows } = await client.query(
    `SELECT slug FROM topics WHERE slug = $1 OR slug LIKE $1 || '-%'`, [base],
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// 생성은 항상 draft/private 이다(플랜 13 결정 1 · 플랜 11 결정 1). 공개는 changeStatus/setVisibility 의 전이로만.
export async function createTopic(actor, { slug, label_ko, description = '' }) {
  return withTx(async (client) => {
    let finalSlug = slug;
    if (finalSlug) {
      // 사용자가 준 slug 는 대신 바꾸지 않는다 — URL 로 쓰려고 정한 값에 -2 가 붙으면 그 사실을 모른 채 쓰게 된다.
      const { rows: [dup] } = await client.query(`SELECT 1 FROM topics WHERE slug = $1`, [finalSlug]);
      if (dup) throw new HttpError(409, 'CONFLICT', `slug '${finalSlug}' 는 이미 있습니다.`, { slug: finalSlug });
    } else {
      finalSlug = await uniqueSlug(client, slugify(label_ko));
    }
    const { rows: [row] } = await client.query(
      `INSERT INTO topics (slug, label_ko, description, status, visibility, created_by, updated_by)
       VALUES ($1, $2, $3, 'draft', 'private', $4, $4)
       RETURNING id`,
      [finalSlug, label_ko, description, actor.id],
    );
    return { topic: await fetchTopic(client, actor, row.id), contents: [] };
  });
}

// label_ko/description 만 고친다. slug 는 URL 에 박히는 값이라 이 API 로 바꾸지 않고, status/visibility 는
// 전이 API 로만 간다 — PATCH 에 섞어 두면 전이표를 우회하는 길이 생긴다.
export async function updateTopic(actor, topicId, { label_ko, description } = {}) {
  if (label_ko === undefined && description === undefined) {
    throw new HttpError(400, 'BAD_REQUEST', 'label_ko 또는 description 중 하나는 있어야 합니다.');
  }
  return withTx(async (client) => {
    await lockTopic(client, topicId);
    await client.query(
      `UPDATE topics
          SET label_ko = COALESCE($1, label_ko), description = COALESCE($2, description),
              updated_at = now(), updated_by = $3
        WHERE id = $4`,
      [label_ko ?? null, description ?? null, actor.id, topicId],
    );
    return { topic: await fetchTopic(client, actor, topicId) };
  });
}

// PUT 본문의 contents 를 정규화한다. 배열 형태 오류는 전부 400 이다 — 어느 항목이 왜 틀렸는지 index 로 짚어 준다.
// position 을 생략하면 배열 순서(1..n)를 쓴다. 같은 position 이 둘 이상이어도 막지 않는다 —
// topic_contents 에 (topic_id, position) UNIQUE 가 없고 정렬은 position, id 로 안정적이다.
function normalizeContents(contents) {
  if (!Array.isArray(contents)) {
    throw new HttpError(400, 'BAD_REQUEST', 'contents 는 배열이어야 합니다.');
  }
  if (contents.length > TOPIC_CONTENTS_MAX) {
    throw new HttpError(400, 'BAD_REQUEST', `contents 는 최대 ${TOPIC_CONTENTS_MAX}개까지입니다.`);
  }
  const seen = new Set();
  return contents.map((entry, index) => {
    const contentId = Number(entry?.content_id);
    if (!Number.isInteger(contentId) || contentId < 1) {
      throw new HttpError(400, 'BAD_REQUEST', `contents[${index}].content_id 는 양의 정수여야 합니다.`);
    }
    if (seen.has(contentId)) {
      throw new HttpError(400, 'BAD_REQUEST', `content_id ${contentId} 가 중복됩니다.`, { content_id: contentId });
    }
    seen.add(contentId);
    const position = entry.position === undefined || entry.position === null ? index + 1 : Number(entry.position);
    if (!Number.isInteger(position) || position < 0 || position > 1_000_000) {
      throw new HttpError(400, 'BAD_REQUEST', `contents[${index}].position 은 0 이상의 정수여야 합니다.`);
    }
    return { content_id: contentId, position };
  });
}

// 구성 **일괄 교체** — 기존 topic_contents 를 지우고 다시 넣는다(트랜잭션). 차집합을 계산해 부분 갱신하면
// 순서 바꾸기·빼기·넣기가 각각 다른 코드 경로가 되고, 화면이 보낸 배열이 곧 저장된 상태라는 단순함이 깨진다.
// 콘텐츠의 status 는 보지 않는다 — draft 도 붙일 수 있다. 공개는 각 콘텐츠의 전이로 따로 가고,
// 학습자 쿼리(topic.service)가 discoverable 로 거르므로 초안이 붙어 있어도 학습자에게 새지 않는다.
export async function replaceContents(actor, topicId, contents) {
  const normalized = normalizeContents(contents);
  return withTx(async (client) => {
    await lockTopic(client, topicId);
    if (normalized.length) {
      // FK 위반(23503)을 그대로 흘리면 fromPgError 가 "참조 대상이 없습니다." 로만 말한다 — 어느 id 인지 짚어 준다.
      const ids = normalized.map((c) => c.content_id);
      const { rows } = await client.query(
        `SELECT id FROM content_items WHERE id = ANY($1::bigint[])`, [ids],
      );
      const found = new Set(rows.map((r) => Number(r.id)));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length) {
        throw new HttpError(404, 'NOT_FOUND', `없는 콘텐츠입니다: ${missing.join(', ')}`, { missing });
      }
    }
    await client.query(`DELETE FROM topic_contents WHERE topic_id = $1`, [topicId]);
    // 한 줄씩 넣는다 — 배열 순서가 id 순서가 되어 같은 position 안에서도 화면이 보낸 순서가 보존된다.
    for (const c of normalized) {
      await client.query(
        `INSERT INTO topic_contents (topic_id, content_id, position) VALUES ($1, $2, $3)`,
        [topicId, c.content_id, c.position],
      );
    }
    await client.query(
      `UPDATE topics SET updated_at = now(), updated_by = $1 WHERE id = $2`, [actor.id, topicId],
    );
    return { topic: await fetchTopic(client, actor, topicId), contents: await fetchContents(client, topicId) };
  });
}

// 상태 전이 — content_items 와 같은 4상태 축이라 전이표(assertTransition)를 그대로 쓴다. 역할 판정도 거기서
// 한다(draft→review 는 author, →published 는 reviewer). 가시성은 건드리지 않는다(플랜 11 열린 질문 7 후보 A).
// published+public → archived 가 DB CHECK 를 통과하려면 0019_topics_archived_public.sql 이 적용돼 있어야 한다.
// `note` 는 콘텐츠 전이 API 와 본문 모양을 맞추기 위해 받지만 **저장되지 않는다**(머리말: 감사 테이블 없음).
export async function changeStatus(actor, topicId, { to, note: _note = '' } = {}) {
  await loadRoles();
  return withTx(async (client) => {
    const row = await lockTopic(client, topicId);
    assertTransition(row.status, to, actor.role);
    await client.query(
      `UPDATE topics SET status = $1, updated_at = now(), updated_by = $2 WHERE id = $3`,
      [to, actor.id, topicId],
    );
    return { topic: await fetchTopic(client, actor, topicId), audit_logged: false };
  });
}

// 공개 여닫기 — visibility 한 컬럼만 바뀐다. draft·review → public 은 canSetVisibility 가 409 로 먼저 막는다
// (DB 의 topics_public_ck 23514 를 그대로 흘리면 의미 없는 400 이 된다).
export async function setVisibility(actor, topicId, { to } = {}) {
  await loadRoles();
  return withTx(async (client) => {
    const row = await lockTopic(client, topicId);
    if (row.visibility === to) {
      throw new HttpError(409, 'CONFLICT', `이미 ${to} 입니다.`, { visibility: to });
    }
    assertSetVisibility(row.status, to, actor.role);
    await client.query(
      `UPDATE topics SET visibility = $1, updated_at = now(), updated_by = $2 WHERE id = $3`,
      [to, actor.id, topicId],
    );
    return { topic: await fetchTopic(client, actor, topicId), audit_logged: false };
  });
}
