// 대시보드 라우트 — 엔드포인트 1개. 대시보드는 항상 전체를 그리므로 쪼개면 왕복만 는다.
// 인증/CSRF/CORS/캔버스 READONLY는 기존 미들웨어가 처리한다 (재구현 0).
// GET 전용 + AI 호출 0건이라 CLI 프록시·트랜잭션이 없다.
import { sendJson } from '../lib/respond.js';
import { requireUser } from '../middleware/auth.js';
import { getDashboard } from '../services/dashboard.service.js';

export function registerDashboardRoutes(router) {
  router.get('/api/dashboard', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await getDashboard(user)) });
  });
}
