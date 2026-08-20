// api/server.js — API 서버 엔트리 (node:http, 기본 3004)
// 정적 서버(server.js:3003)와 프로세스 분리. Express 없음.
import http from 'node:http';
import { config, logBootConfig } from './config.js';
import { applyCors, requireCsrfHeader } from './lib/cors.js';
import { HttpError } from './lib/errors.js';
import { requestLogger } from './lib/logger.js';
import { sendError, sendJson } from './lib/respond.js';
import { Router } from './router.js';
import { registerAiRoutes } from './routes/ai.routes.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerHealthRoutes } from './routes/health.routes.js';
import { registerVocabRoutes } from './routes/vocab.routes.js';
import { registerConversationRoutes } from './routes/conversation.routes.js';
import { registerLessonRoutes } from './routes/lesson.routes.js';
import { registerDashboardRoutes } from './routes/dashboard.routes.js';
import { registerProgressRoutes } from './routes/progress.routes.js';
import { warmProviderHealth } from './ai/registry.js';

const router = new Router();
registerHealthRoutes(router);
registerAuthRoutes(router);
registerAiRoutes(router);
registerVocabRoutes(router);
registerConversationRoutes(router);
registerLessonRoutes(router);
registerDashboardRoutes(router);
registerProgressRoutes(router);

const server = http.createServer(async (req, res) => {
  requestLogger(req, res);
  try {
    if (applyCors(req, res)) return; // 프리플라이트 처리 완료

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const matched = router.match(req.method, url.pathname);
    if (!matched) {
      sendJson(res, 404, { ok: false, code: 'NOT_FOUND', error: '없는 경로입니다.' });
      return;
    }

    requireCsrfHeader(req);

    // 캔버스 쓰기 차단 2중화의 서버측: X-Jina-Mode: canvas 의 non-GET은 403
    if (req.method !== 'GET' && req.headers['x-jina-mode'] === 'canvas'
        && url.pathname !== '/api/ai/chat') { // chat은 부수효과 없음 — 캔버스 라이브 데모 허용
      throw new HttpError(403, 'READONLY', '캔버스에서는 저장이 비활성화되어 있습니다.');
    }

    await matched.handler(req, res, { params: matched.params, query: url.searchParams });
  } catch (err) {
    sendError(res, err);
  }
});

server.listen(config.apiPort, () => {
  logBootConfig();
  console.log(`[api] listening on http://localhost:${config.apiPort}`);
  warmProviderHealth(); // 부팅 시 헬스 캐시 1회 워밍 (비동기, 실패 무해)
});
