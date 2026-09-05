// 관리자 토픽 라우트 (플랜 13 Phase B). admin.routes.js 와 별도 파일인 이유는 두 파일을 다른 사람이 동시에
// 고치던 사정이지만, 토픽은 content_items 와 테이블·감사가 달라 한 파일로 합쳐도 서비스는 갈라져 있어야 한다.
import { readJson } from '../lib/body.js';
import { CONTENT_STATUSES, VISIBILITIES } from '../lib/content-status.js';
import { sendJson } from '../lib/respond.js';
import { oneOf, posInt, str } from '../lib/validate.js';
import { requireRole } from '../middleware/auth.js';
import * as adminTopics from '../services/admin-topic.service.js';

// 전 경로의 **최소** 역할은 author 다(플랜 13 결정 1 — 저작 권한은 author 이상. 플랜 §3 의 "전 경로 requireAdmin"
// 은 이 결정과 충돌해 결정 1 을 따른다). 그 위는 라우트가 판정하지 않는다 — 상태 변화가 있는 두 경로만
// 전이표(content-status.js)가 `to` 에 따라 역할을 가른다(11·12 와 같은 방식).
const requireAuthor = requireRole('author');

function pageArgs(query) {
  const limit = Math.min(posInt(query.get('limit') || '50', 'limit') || 50, 200);
  const offsetRaw = Number(query.get('offset') ?? 0);
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

export function registerAdminTopicRoutes(router) {
  // 전 상태 목록 — 학습자 GET /api/topics 와 달리 draft·review·archived 도 나온다.
  router.get('/api/admin/topics', async (req, res, { query }) => {
    const { user } = await requireAuthor(req, res);
    const q = str(query.get('q') || '', 'q', { optional: true, max: 200 });
    sendJson(res, 200, { ok: true, ...(await adminTopics.listTopics(user, { q, ...pageArgs(query) })) });
  });

  router.get('/api/admin/topics/:id', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    sendJson(res, 200, { ok: true, ...(await adminTopics.getTopic(user, posInt(params.id, 'id'))) });
  });

  // 생성 → 항상 draft/private. slug 는 생략하면 label 로 만든다(충돌 시 -2, -3 …).
  router.post('/api/admin/topics', async (req, res) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const slug = str(body.slug, 'slug', { optional: true, max: 80, pattern: adminTopics.TOPIC_SLUG_RE });
    const labelKo = str(body.label_ko, 'label_ko', { min: 1, max: adminTopics.TOPIC_LABEL_MAX });
    const description = str(body.description, 'description', { optional: true, max: 1000 }) ?? '';
    sendJson(res, 201, {
      ok: true,
      ...(await adminTopics.createTopic(user, { slug, label_ko: labelKo, description })),
    });
  });

  router.patch('/api/admin/topics/:id', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const labelKo = str(body.label_ko, 'label_ko', { optional: true, min: 1, max: adminTopics.TOPIC_LABEL_MAX });
    // description 은 빈 문자열로 지울 수 있어야 한다 — str() 은 '' 를 "없음" 으로 보므로 문자열이면 따로 받는다.
    let description;
    if (typeof body.description === 'string') {
      description = str(body.description, 'description', { optional: true, max: 1000 }) ?? '';
    } else if (body.description !== undefined && body.description !== null) {
      description = str(body.description, 'description'); // 문자열이 아니면 여기서 400
    }
    sendJson(res, 200, {
      ok: true,
      ...(await adminTopics.updateTopic(user, posInt(params.id, 'id'), { label_ko: labelKo, description })),
    });
  });

  // 구성·순서 일괄 교체. Router 에 put() 이 없어 add('PUT') 로 등록한다.
  // 배열 항목의 형태 검증(중복·양의 정수·상한)은 서비스의 normalizeContents 가 index 를 짚어 400 을 낸다.
  router.add('PUT', '/api/admin/topics/:id/contents', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    sendJson(res, 200, {
      ok: true,
      ...(await adminTopics.replaceContents(user, posInt(params.id, 'id'), body.contents)),
    });
  });

  // 상태 전이 — 역할은 전이표가 판정한다. note 는 콘텐츠 전이와 본문 모양을 맞추기 위해 받되 저장할 곳이
  // 없어(topic 감사 테이블 없음) 응답의 audit_logged:false 로 그 사실을 알린다.
  router.post('/api/admin/topics/:id/status', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const to = oneOf(body.to, 'to', CONTENT_STATUSES);
    const note = str(body.note, 'note', { optional: true, max: 500 }) ?? '';
    sendJson(res, 200, {
      ok: true,
      ...(await adminTopics.changeStatus(user, posInt(params.id, 'id'), { to, note })),
    });
  });

  // 공개 여닫기 — 최소 역할 reviewer 이지만 그 판정도 canSetVisibility 가 한다(403/409 를 갈라야 해서).
  router.post('/api/admin/topics/:id/visibility', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const to = oneOf(body.to, 'to', VISIBILITIES);
    sendJson(res, 200, {
      ok: true,
      ...(await adminTopics.setVisibility(user, posInt(params.id, 'id'), { to })),
    });
  });
}
