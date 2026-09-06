import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { bool, oneOf, posInt, str } from '../lib/validate.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import * as adminContents from '../services/admin-content.service.js';
import * as adminTopics from '../services/admin-topic.service.js';
import * as adminUsers from '../services/admin-user.service.js';

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

  // ── 콘텐츠 관리 (플랜 11 Phase 2 · 플랜 13 Phase A) ─────────────────────
  // 전 경로 최소 author. 전이의 역할 판정은 라우트가 아니라 canTransition(단일 소스)이 한다 —
  // 같은 엔드포인트라도 to 에 따라 필요한 역할이 다르다(draft→review 는 author, →published 는 reviewer).

  router.get('/api/admin/contents', async (req, res, { query }) => {
    const { user } = await requireRole('author')(req, res);
    const type = str(query.get('type') || '', 'type', { optional: true, max: 40 });
    const status = str(query.get('status') || '', 'status', { optional: true, max: 40 });
    const q = str(query.get('q') || '', 'q', { optional: true, max: 200 });
    const limit = Math.min(posInt(query.get('limit') || '100', 'limit') || 100, 200);
    const offsetRaw = Number(query.get('offset') ?? 0);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    sendJson(res, 200, { ok: true, ...(await adminContents.listContents(user, { type, status, q, limit, offset })) });
  });

  // 생성 라우트가 :id 라우트보다 먼저 — 라우터는 등록순 first-match 다.
  router.post('/api/admin/contents/lesson', async (req, res) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    sendJson(res, 201, { ok: true, ...(await adminContents.createLesson(user, body)) });
  });

  router.patch('/api/admin/contents/lesson/:id', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    const contentId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await adminContents.updateLesson(user, contentId, body)) });
  });

  router.get('/api/admin/contents/:id', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const contentId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await adminContents.getContent(user, contentId)) });
  });

  // 리비전 이력 (0019) — 목록·스냅숏·복원. 복원은 새 rev 를 만든다(이력 되감기 없음).
  router.get('/api/admin/contents/:id/revisions', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const contentId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await adminContents.listRevisions(user, contentId)) });
  });

  router.get('/api/admin/contents/:id/revisions/:rev', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const contentId = posInt(params.id, 'id');
    const rev = posInt(params.rev, 'rev');
    sendJson(res, 200, { ok: true, ...(await adminContents.getRevision(user, contentId, rev)) });
  });

  router.post('/api/admin/contents/:id/revisions/:rev/restore', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const contentId = posInt(params.id, 'id');
    const rev = posInt(params.rev, 'rev');
    sendJson(res, 200, { ok: true, ...(await adminContents.restoreRevision(user, contentId, rev)) });
  });

  router.post('/api/admin/contents/:id/status', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    const to = str(body.to, 'to', { min: 1, max: 40 });
    const note = str(body.note, 'note', { optional: true, max: 500 });
    const contentId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await adminContents.transitionStatus(user, contentId, { to, note })) });
  });

  // ── 토픽 생성·구성 (플랜 13 Phase B) — 전 경로 author+, 전이·공개의 역할 판정은
  // 콘텐츠와 같은 규칙(canTransition · reviewer)이 한다.
  router.get('/api/admin/topics', async (req, res) => {
    await requireRole('author')(req, res);
    sendJson(res, 200, { ok: true, ...(await adminTopics.listTopicsAdmin()) });
  });

  router.post('/api/admin/topics', async (req, res) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    sendJson(res, 201, { ok: true, ...(await adminTopics.createTopic(user, body)) });
  });

  router.get('/api/admin/topics/:id', async (req, res, { params }) => {
    await requireRole('author')(req, res);
    sendJson(res, 200, { ok: true, ...(await adminTopics.getTopicAdmin(posInt(params.id, 'id'))) });
  });

  router.patch('/api/admin/topics/:id', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, ...(await adminTopics.updateTopic(user, posInt(params.id, 'id'), body)) });
  });

  // 구성·순서 일괄 저장 — 배열 순서가 곧 position
  router.add('PUT', '/api/admin/topics/:id/contents', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    sendJson(res, 200, {
      ok: true,
      ...(await adminTopics.setTopicContents(user, posInt(params.id, 'id'), body.contents)),
    });
  });

  router.post('/api/admin/topics/:id/status', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    const to = str(body.to, 'to', { min: 1, max: 40 });
    sendJson(res, 200, { ok: true, ...(await adminTopics.setTopicStatus(user, posInt(params.id, 'id'), { to })) });
  });

  router.post('/api/admin/topics/:id/visibility', async (req, res, { params }) => {
    const { user } = await requireRole('reviewer')(req, res);
    const body = await readJson(req);
    const to = oneOf(body.to, 'to', ['public', 'private']);
    sendJson(res, 200, { ok: true, ...(await adminTopics.setTopicVisibility(user, posInt(params.id, 'id'), { to })) });
  });

  // ── AI 초안 검수 (플랜 12) — 큐 = status='review' 행. 승인/반려의 역할 판정은
  // transitionStatus(canTransition)가 한다 — reviewer 미만이면 403.
  router.get('/api/admin/drafts', async (req, res) => {
    await requireRole('author')(req, res);
    sendJson(res, 200, { ok: true, ...(await adminContents.listReviewQueue()) });
  });

  router.post('/api/admin/drafts/:id/approve', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    const note = str(body.note, 'note', { optional: true, max: 500 });
    const publishPublic = body.publish_public === true;
    const contentId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await adminContents.approveDraft(user, contentId, { note, publishPublic })) });
  });

  router.post('/api/admin/drafts/:id/reject', async (req, res, { params }) => {
    const { user } = await requireRole('author')(req, res);
    const body = await readJson(req);
    const note = str(body.note, 'note', { min: 1, max: 500 }); // 반려 사유는 필수 — 감사 로그에 남는다
    const contentId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await adminContents.rejectDraft(user, contentId, { note })) });
  });

  router.post('/api/admin/contents/:id/visibility', async (req, res, { params }) => {
    const { user } = await requireRole('reviewer')(req, res);
    const body = await readJson(req);
    const to = oneOf(body.to, 'to', ['public', 'private']);
    const contentId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await adminContents.setVisibility(user, contentId, { to })) });
  });
}
