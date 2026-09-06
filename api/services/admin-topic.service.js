// 관리자 토픽 서비스 — 생성 · 구성(콘텐츠 붙이기/순서) · 상태 전이 (플랜 13 Phase B).
//
// 규범:
//  - 새 토픽은 draft + private 으로 태어난다. 학습자 노출은 status(published)가 결정하고,
//    eligible 임계치는 경고 배지용 필드일 뿐 저장·공개를 막지 않는다(플랜 11 결정 3).
//  - 구성은 콘텐츠 상태와 무관하게 짜둔다 — 학습자 화면 쪽 쿼리(topic.service)가
//    discoverable 로 걸러서 보여줄 것만 보여준다.
//  - 전이 규칙은 콘텐츠와 같은 표(content-status.js)를 쓴다. 단, content_audit_log 는
//    content_items 를 향한 진짜 FK 라 토픽을 기록할 수 없다 — 토픽 감사 로그는 v1 범위 밖(문서화).
import { assertTransition } from '../lib/content-status.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { loadRoles } from '../lib/roles.js';
import { withTx } from '../lib/tx.js';

const MAX_TOPIC_CONTENTS = 100;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// 관리 화면용 카운트 — 학습자용(topic.service)과 달리 가시성 필터 없이 '붙어 있는 것'을 센다.
// eligible 배지는 학습자 임계치(레슨3·회화1·단어20)를 그대로 계산해 경고로만 보여준다.
const ADMIN_TOPIC_SUMMARY = `
  SELECT t.id, t.slug, t.label_ko, t.description, t.status, t.visibility,
         t.created_by, t.created_at, t.updated_at,
         (SELECT count(*)::int FROM topic_contents tc
            JOIN content_items c ON c.id = tc.content_id
           WHERE tc.topic_id = t.id AND c.type = 'lesson') AS lesson_count,
         (SELECT count(*)::int FROM topic_contents tc
            JOIN content_items c ON c.id = tc.content_id
           WHERE tc.topic_id = t.id AND c.type = 'scenario') AS scenario_count,
         (SELECT COALESCE(sum(jsonb_array_length(vd.words)), 0)::int FROM topic_contents tc
            JOIN content_items c ON c.id = tc.content_id
            JOIN vocab_set_details vd ON vd.content_id = c.id
           WHERE tc.topic_id = t.id AND c.type = 'vocab_set') AS vocab_count
    FROM topics t`;

function topicAdminDto(row) {
  return {
    id: row.id,
    slug: row.slug,
    label_ko: row.label_ko,
    description: row.description,
    status: row.status,
    visibility: row.visibility,
    lesson_count: row.lesson_count,
    scenario_count: row.scenario_count,
    vocab_count: row.vocab_count,
    eligible: row.lesson_count >= 3 && row.scenario_count >= 1 && row.vocab_count >= 20,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listTopicsAdmin() {
  const { rows } = await pool.query(`${ADMIN_TOPIC_SUMMARY} ORDER BY t.created_at, t.id`);
  return { topics: rows.map(topicAdminDto) };
}

export async function getTopicAdmin(topicId) {
  const { rows: [row] } = await pool.query(
    `SELECT * FROM (${ADMIN_TOPIC_SUMMARY}) q WHERE q.id = $1`, [topicId]);
  if (!row) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
  const { rows: contents } = await pool.query(
    `SELECT tc.content_id, tc.position, c.type, c.slug, c.title, c.status, c.visibility, c.source,
            d.kind,
            (SELECT count(*)::int FROM lesson_items i WHERE i.content_id = c.id) AS question_count
       FROM topic_contents tc
       JOIN content_items c ON c.id = tc.content_id
       LEFT JOIN lesson_details d ON d.content_id = c.id
      WHERE tc.topic_id = $1
      ORDER BY tc.position, tc.id`,
    [topicId],
  );
  return { topic: { ...topicAdminDto(row), contents } };
}

function normalizeTopicFields({ label_ko: labelKo, description, slug }, { requireLabel }) {
  const out = {};
  if (labelKo !== undefined || requireLabel) {
    const label = typeof labelKo === 'string' ? labelKo.trim() : '';
    if (label.length < 1 || label.length > 80) {
      throw new HttpError(400, 'BAD_REQUEST', 'label_ko 는 1~80자여야 합니다.');
    }
    out.labelKo = label;
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > 500) {
      throw new HttpError(400, 'BAD_REQUEST', 'description 은 500자 이하 문자열이어야 합니다.');
    }
    out.description = description.trim();
  }
  if (slug !== undefined) {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.length > 80) {
      throw new HttpError(400, 'BAD_REQUEST', 'slug 는 소문자-하이픈 형식이어야 합니다.');
    }
    out.slug = slug;
  }
  return out;
}

export async function createTopic(actor, payload) {
  const p = normalizeTopicFields(payload ?? {}, { requireLabel: true });
  const slug = p.slug || `topic-${Date.now()}`;
  const { rows: [row] } = await pool.query(
    `INSERT INTO topics (slug, label_ko, description, status, visibility, created_by, updated_by)
     VALUES ($1, $2, $3, 'draft', 'private', $4, $4)
     RETURNING id`,
    [slug, p.labelKo, p.description ?? '', actor.id],
  );
  return getTopicAdmin(row.id);
}

export async function updateTopic(actor, topicId, payload) {
  const p = normalizeTopicFields(payload ?? {}, { requireLabel: false });
  if (p.labelKo === undefined && p.description === undefined) {
    throw new HttpError(400, 'BAD_REQUEST', '변경할 내용이 없습니다.');
  }
  const { rowCount } = await pool.query(
    `UPDATE topics
        SET label_ko = COALESCE($2, label_ko),
            description = COALESCE($3, description),
            updated_by = $4, updated_at = now()
      WHERE id = $1`,
    [topicId, p.labelKo ?? null, p.description ?? null, actor.id],
  );
  if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
  return getTopicAdmin(topicId);
}

// 구성·순서 일괄 저장 — 배열 순서가 곧 position. FK 는 DB 가 지킨다(없는 콘텐츠 → 404).
export async function setTopicContents(actor, topicId, contentIds) {
  if (!Array.isArray(contentIds) || contentIds.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new HttpError(400, 'BAD_REQUEST', 'contents 는 content_id 정수 배열이어야 합니다.');
  }
  if (contentIds.length > MAX_TOPIC_CONTENTS) {
    throw new HttpError(400, 'BAD_REQUEST', `구성은 최대 ${MAX_TOPIC_CONTENTS}개입니다.`);
  }
  if (new Set(contentIds).size !== contentIds.length) {
    throw new HttpError(400, 'BAD_REQUEST', '같은 콘텐츠를 두 번 붙일 수 없습니다.');
  }
  await withTx(async (client) => {
    const { rows: [topic] } = await client.query(
      `SELECT id FROM topics WHERE id = $1 FOR UPDATE`, [topicId]);
    if (!topic) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
    await client.query(`DELETE FROM topic_contents WHERE topic_id = $1`, [topicId]);
    for (let i = 0; i < contentIds.length; i += 1) {
      await client.query(
        `INSERT INTO topic_contents (topic_id, content_id, position) VALUES ($1, $2, $3)`,
        [topicId, contentIds[i], i],
      );
    }
    await client.query(
      `UPDATE topics SET updated_by = $2, updated_at = now() WHERE id = $1`, [topicId, actor.id]);
  });
  return getTopicAdmin(topicId);
}

// 상태 전이 — 콘텐츠와 같은 전이표(canTransition). 감사 로그는 v1 없음(파일 머리 주석).
export async function setTopicStatus(actor, topicId, { to }) {
  await loadRoles();
  return withTx(async (client) => {
    const { rows: [row] } = await client.query(
      `SELECT id, status FROM topics WHERE id = $1 FOR UPDATE`, [topicId]);
    if (!row) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
    assertTransition(row.status, to, actor.role);
    await client.query(
      `UPDATE topics SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1`,
      [topicId, to, actor.id],
    );
    return getTopicAdmin(topicId);
  });
}

export async function setTopicVisibility(actor, topicId, { to }) {
  if (!['public', 'private'].includes(to)) {
    throw new HttpError(400, 'BAD_REQUEST', 'to 는 public/private 중 하나여야 합니다.');
  }
  return withTx(async (client) => {
    const { rows: [row] } = await client.query(
      `SELECT id, status, visibility FROM topics WHERE id = $1 FOR UPDATE`, [topicId]);
    if (!row) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
    if (row.visibility === to) throw new HttpError(409, 'CONFLICT', `이미 ${to} 상태입니다.`);
    if (to === 'public' && !['published', 'archived'].includes(row.status)) {
      throw new HttpError(409, 'CONFLICT', `${row.status} 상태의 토픽은 공개할 수 없습니다.`);
    }
    await client.query(
      `UPDATE topics SET visibility = $2, updated_by = $3, updated_at = now() WHERE id = $1`,
      [topicId, to, actor.id],
    );
    return getTopicAdmin(topicId);
  });
}
