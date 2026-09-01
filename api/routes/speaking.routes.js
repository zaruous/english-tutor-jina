import { posInt } from '../lib/validate.js';
import { sendJson } from '../lib/respond.js';
import { requireUser } from '../middleware/auth.js';
import * as speaking from '../services/speaking.service.js';

export function registerSpeakingRoutes(router) {
  // 읽기 연습 문장 은행 — 기존 콘텐츠 파생(플랜 08 Phase C). 비면 화면이 고정 시드로 폴백한다.
  router.get('/api/speaking/sentences', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const limit = posInt(query.get('limit') || undefined, 'limit', { optional: true, max: 40 }) ?? 20;
    sendJson(res, 200, { ok: true, ...(await speaking.listSpeakingSentences(user, { limit })) });
  });
}
