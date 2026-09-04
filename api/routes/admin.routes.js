import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { bool, posInt, str } from '../lib/validate.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
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

  // Phase 2 콘텐츠 관리 전 — author+ 즉시 반영 검증용 최소 엔드포인트
  router.get('/api/admin/contents', async (req, res) => {
    await requireRole('author')(req, res);
    sendJson(res, 200, { ok: true, contents: [] });
  });
}
