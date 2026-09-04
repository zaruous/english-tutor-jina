import { askAI } from '../ai/ask.js';
import { defaultProviderId, providerHealth, providerMeta } from '../ai/registry.js';
import { config } from '../config.js';
import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { atLeast, loadRoles } from '../lib/roles.js';
import { str } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';

export function registerAiRoutes(router) {
  // 채팅 프록시. 요청이 끊기면(탭 닫기/Enter 연타 취소) CLI 프로세스까지 죽인다 —
  // 이게 없으면 고아 프로세스가 세마포어 슬롯을 물고 앉아 앱이 잠긴다.
  router.post('/api/ai/chat', async (req, res) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);

    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    const result = await askAI({
      userId: user.id, // 사용자당 동기 요청 1건 — 초과분은 429 (플랜 10.5 S7)
      task: body.task === 'vocab_entry' ? 'vocab_entry' : 'tutor',
      providerId: body.provider || defaultProviderId(),
      model: str(body.model, 'model', { max: 100, optional: true }) ?? null,
      history: Array.isArray(body.history) ? body.history : [],
      userMessage: body.userMessage,
      sessionRef: str(body.conversationId, 'conversationId', { max: 200, optional: true }) ?? null,
      signal: abort.signal,
    });
    sendJson(res, 200, { ...result, conversationId: result.sessionRef ?? null });
  });

  // TTL 60s 캐시만 읽는다. ?force=1 로 무효화 — 단 관리자만. (플랜 10.5 S3)
  // 무인증이던 시절 `?force=1` 은 CLI 4종(claude·agy·codex·cursor)에 spawn 을 거는 4.5초짜리
  // 경로였다(캐시 응답 11ms — 약 400배). 쿠키 없이 반복 호출하면 그대로 부하 경로가 된다.
  router.get('/api/ai/health', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    // force 는 관리자일 때만 반영한다. 일반 사용자에게는 400 을 주지 않고 조용히 캐시를 돌려준다 —
    // 응답의 `cached` 필드로 클라이언트가 "프로브가 강제되지 않았다" 를 구분할 수 있다.
    // requireAdmin 을 쓰면 403 을 throw 해 캐시 읽기까지 막히므로 여기서는 술어로만 판정한다.
    // 역할 조회는 force 를 실제로 요청했을 때만 한다 — 이 라우트는 앱을 열 때마다 불리는데,
    // 흔한 경로(force 없음)까지 roles 테이블에 묶으면 장애 범위만 넓어진다.
    let force = query.get('force') === '1';
    if (force) {
      await loadRoles(); // atLeast 는 loadRoles() 를 먼저 부르지 않으면 throw 한다(lib/roles.js)
      force = atLeast(user.role, 'admin');
    }
    const health = await providerHealth({ force });
    sendJson(res, 200, { ok: true, ...health, default: defaultProviderId() });
  });

  // health 와 같은 이유로 로그인 게이트를 건다 — providerMeta() 는 캐시(10분)가 식으면
  // `agy models` CLI 를 spawn 하고, health 와 달리 inflight 코얼레싱이 없어 동시 N건이면 N번 스폰된다.
  // 응답의 ollamaUrl 은 서버 설정을 읽기 전용으로 알려주는 값이다(클라이언트가 화면에 표시한다).
  router.get('/api/ai/providers', async (req, res) => {
    await requireUser(req, res);
    const providers = await providerMeta();
    sendJson(res, 200, {
      ok: true,
      default: defaultProviderId(),
      ollamaUrl: config.ai.ollamaUrl,
      providers,
    });
  });
}
