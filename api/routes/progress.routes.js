// 학습 통계 라우트 — 집계 GET 1개 + 첨삭 SRS 복습 POST 1개.
// 인증/CSRF/CORS/캔버스 READONLY는 기존 미들웨어가 처리한다 (재구현 0).
//
// 경로 충돌 없음: /api/progress는 신규 프리픽스이고, /api/corrections/:id/review는
// 01이 만든 GET /api/corrections와 메서드·깊이가 다르다.
import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { posInt, str, UUID_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import { reviewCorrection } from '../services/corrections.service.js';
import { getProgress } from '../services/progress.service.js';

export function registerProgressRoutes(router) {
  router.get('/api/progress', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, progress: await getProgress(user) });
  });

  router.post('/api/corrections/:correction_id/review', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const correctionId = posInt(params.correction_id, 'correction_id');
    const body = await readJson(req);
    const clientRequestId = str(body.client_request_id, 'client_request_id',
      { max: 36, optional: true, pattern: UUID_RE });
    const elapsedMs = posInt(body.elapsed_ms, 'elapsed_ms', { optional: true, max: 3600000 });
    // result 검증(400)은 서비스가 SRS_RESULTS로 수행 — 허용 목록이 srs.js 한 곳에만 있게.
    sendJson(res, 200, {
      ok: true,
      ...(await reviewCorrection(user, correctionId, { result: body.result, clientRequestId, elapsedMs })),
    });
  });
}
