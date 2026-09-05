import { readJson } from '../lib/body.js';
import { CONTENT_STATUSES, VISIBILITIES } from '../lib/content-status.js';
import { sendJson } from '../lib/respond.js';
import { bool, oneOf, posInt, str } from '../lib/validate.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import * as adminContents from '../services/admin-content.service.js';
import * as adminUsers from '../services/admin-user.service.js';

// 콘텐츠 3경로의 **최소** 역할. 그 위는 라우트가 판정하지 않는다 —
// 전이에 필요한 역할은 `to` 마다 다르고(draft→review 는 author, →published 는 reviewer)
// 그 판정은 전이표(content-status.js)가 한다. 라우트가 역할을 한 번 더 적으면 규칙이 두 곳이 된다.
const requireAuthor = requireRole('author');

export function registerAdminRoutes(router) {
  router.get('/api/admin/users', async (req, res, { query }) => {
    const { user } = await requireAdmin(req, res);
    const q = str(query.get('q') || '', 'q', { optional: true, max: 200 });
    const role = str(query.get('role') || '', 'role', { optional: true, max: 40 });
    const limit = Math.min(posInt(query.get('limit') || '50', 'limit') || 50, 200);
    const offsetRaw = Number(query.get('offset') ?? 0);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    sendJson(res, 200, { ok: true, ...(await adminUsers.listUsers(user.id, { q, role, limit, offset })) });
  });

  router.patch('/api/admin/users/:id/role', async (req, res, { params }) => {
    const { user } = await requireAdmin(req, res);
    const body = await readJson(req);
    const to = str(body.to, 'to', { min: 1, max: 40 });
    const note = str(body.note, 'note', { optional: true, max: 500 });
    const targetId = posInt(params.id, 'id');
    sendJson(res, 200, {
      ok: true,
      ...(await adminUsers.changeRole(user.id, targetId, { to, note })),
    });
  });

  router.patch('/api/admin/users/:id/active', async (req, res, { params }) => {
    const { user } = await requireAdmin(req, res);
    const body = await readJson(req);
    const to = bool(body.to, 'to');
    const note = str(body.note, 'note', { optional: true, max: 500 });
    const targetId = posInt(params.id, 'id');
    sendJson(res, 200, {
      ok: true,
      ...(await adminUsers.setActive(user.id, targetId, { to, note })),
    });
  });

  router.post('/api/admin/users/:id/sessions/revoke', async (req, res, { params }) => {
    const { user } = await requireAdmin(req, res);
    const targetId = posInt(params.id, 'id');
    sendJson(res, 200, {
      ok: true,
      ...(await adminUsers.revokeSessions(user.id, targetId)),
    });
  });

  // 콘텐츠 목록 — 관리 화면은 draft·review 까지 봐야 하므로 content-scope 의 가시성 헬퍼를 쓰지 않는다.
  // 경계는 가시성이 아니라 역할이다(서비스 머리말 참조).
  router.get('/api/admin/contents', async (req, res, { query }) => {
    const { user } = await requireAuthor(req, res);
    const type = oneOf(query.get('type') || undefined, 'type', adminContents.CONTENT_TYPES, { optional: true });
    const status = oneOf(query.get('status') || undefined, 'status', CONTENT_STATUSES, { optional: true });
    const q = str(query.get('q') || '', 'q', { optional: true, max: 200 });
    const limit = Math.min(posInt(query.get('limit') || '50', 'limit') || 50, 200);
    const offsetRaw = Number(query.get('offset') ?? 0);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    sendJson(res, 200, {
      ok: true,
      ...(await adminContents.listContents(user, { type, status, q, limit, offset })),
    });
  });

  // 큐 조회와 검수도 author 가 진입하고 실제 승인·반려 권한은 전이표가 판정한다.
  router.get('/api/admin/drafts', async (req, res, { query }) => {
    const { user } = await requireAuthor(req, res);
    const type = oneOf(query.get('type') || undefined, 'type', adminContents.CONTENT_TYPES, { optional: true });
    const q = str(query.get('q') || '', 'q', { optional: true, max: 200 });
    const limit = Math.min(posInt(query.get('limit') || '50', 'limit'), 200);
    const rawOffset = Number(query.get('offset') ?? 0);
    const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    sendJson(res, 200, { ok: true, ...(await adminContents.listDrafts(user, { type, q, limit, offset })) });
  });

  router.post('/api/admin/drafts/:id/approve', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const note = str(body.note, 'note', { optional: true, max: 500 }) ?? '';
    const publish = body.publish === undefined ? false : bool(body.publish, 'publish');
    sendJson(res, 200, {
      ok: true, ...(await adminContents.approveDraft(user, posInt(params.id, 'id'), { note, publish })),
    });
  });

  router.post('/api/admin/drafts/:id/reject', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const note = str(body.note, 'note', { min: 1, max: 500 });
    sendJson(res, 200, {
      ok: true, ...(await adminContents.rejectDraft(user, posInt(params.id, 'id'), { note })),
    });
  });

  // 상태 전이. `:type` 은 여기서 형태만 보고(허용값 밖이면 400), 행의 type 과 다른지는
  // 서비스가 잠근 행에서 확인해 404 를 낸다 — 다른 유형의 id 로 조작하는 것을 막는다.
  router.post('/api/admin/contents/:type/:id/status', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const type = oneOf(params.type, 'type', adminContents.CONTENT_TYPES);
    const contentId = posInt(params.id, 'id');
    const to = oneOf(body.to, 'to', CONTENT_STATUSES);
    const note = str(body.note, 'note', { optional: true, max: 500 }) ?? '';
    sendJson(res, 200, {
      ok: true,
      ...(await adminContents.changeStatus(user, type, contentId, { to, note })),
    });
  });

  // 공개 여닫기. 최소 역할은 reviewer 지만 그 판정도 라우트가 아니라 canSetVisibility 가 한다 —
  // 상태에 따라 아예 불가능한 조합(draft → public)이 있어서 403 과 409 를 갈라야 하기 때문이다.
  router.post('/api/admin/contents/:type/:id/visibility', async (req, res, { params }) => {
    const { user } = await requireAuthor(req, res);
    const body = await readJson(req);
    const type = oneOf(params.type, 'type', adminContents.CONTENT_TYPES);
    const contentId = posInt(params.id, 'id');
    const to = oneOf(body.to, 'to', VISIBILITIES);
    const note = str(body.note, 'note', { optional: true, max: 500 }) ?? '';
    sendJson(res, 200, {
      ok: true,
      ...(await adminContents.setVisibility(user, type, contentId, { to, note })),
    });
  });
}
