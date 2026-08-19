import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { posInt, str, UUID_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as lessons from '../services/lesson.service.js';

// CSRF/CORS/캔버스 READONLY 403은 api/server.js가 전역 처리 — 여기선 재구현하지 않는다.
// ★ 후속 GET /api/lessons/recommended 구현 시 router가 등록순 first-match이므로
//   반드시 /api/lessons/:id 보다 먼저 register 할 것.
export function registerLessonRoutes(router) {
  router.get('/api/lessons', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await lessons.listLessons(user)) });
  });

  router.get('/api/lessons/:id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const lessonId = posInt(params.id, 'id');
    sendJson(res, 200, { ok: true, ...(await lessons.getLesson(user, lessonId)) });
  });

  router.post('/api/lessons/:id/attempts', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const lessonId = posInt(params.id, 'id');
    const body = await readJson(req);
    const clientRequestId = str(body.client_request_id, 'client_request_id',
      { max: 36, optional: true, pattern: UUID_RE });
    const elapsedMs = body.elapsed_ms === undefined ? undefined
      : posInt(body.elapsed_ms, 'elapsed_ms', { optional: true, max: 3_600_000 });
    const result = await lessons.submitAttempt(user, lessonId, {
      answers: body.answers, clientRequestId, elapsedMs,
    });
    sendJson(res, 200, { ok: true, ...result });
  });
}
