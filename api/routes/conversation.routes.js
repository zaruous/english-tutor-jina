// 회화 라우트 — 인증/CSRF/CORS/캔버스 READONLY는 기존 미들웨어가 처리한다 (재구현 0).
// POST /:id/messages 가 이 계획의 심장: 서버가 askAI를 호출하고 user+assistant+corrections를
// 트랜잭션 하나로 저장해 부분 저장/위조 표면을 없앤다 (2-call 설계 금지 근거는 계획서 참조).
import { askAI } from '../ai/ask.js';
import { defaultProviderId } from '../ai/registry.js';
import { readJson } from '../lib/body.js';
import { sendJson, sendNoContent } from '../lib/respond.js';
import { posInt, str, UUID_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as convo from '../services/conversation.service.js';

export function registerConversationRoutes(router) {
  router.get('/api/conversations', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await convo.listSessions(user)) });
  });

  router.post('/api/conversations', async (req, res) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    const title = str(body.title, 'title', { min: 1, max: 80, optional: true });
    const scenarioId = body.scenario_id === undefined || body.scenario_id === null
      ? undefined : posInt(body.scenario_id, 'scenario_id');
    let scenario;
    if (body.scenario !== undefined && body.scenario !== null) {
      if (typeof body.scenario !== 'object' || Array.isArray(body.scenario)) {
        sendJson(res, 400, { ok: false, code: 'BAD_REQUEST', error: 'scenario는 객체여야 합니다.' });
        return;
      }
      scenario = body.scenario;
    }
    sendJson(res, 201, { ok: true, ...(await convo.createSession(user, { title, scenario, scenarioId })) });
  });

  router.get('/api/conversations/:session_id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const sessionId = posInt(params.session_id, 'session_id');
    sendJson(res, 200, { ok: true, ...(await convo.getSessionWithMessages(user, sessionId)) });
  });

  // 서버 저장 흐름: 멱등 replay → 세션/소유권 → DB 히스토리 → AI(트랜잭션 밖) → 원자 저장.
  router.post('/api/conversations/:session_id/messages', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const sessionId = posInt(params.session_id, 'session_id');
    const body = await readJson(req);
    const text = str(body.text, 'text', { min: 1, max: 2000 }); // LIMITS.userMessage와 일치
    const clientRequestId = str(body.client_request_id, 'client_request_id',
      { max: 36, optional: true, pattern: UUID_RE });

    // 멱등 replay (트랜잭션 밖 SELECT)
    const replayed = await convo.findReplay(user, sessionId, clientRequestId);
    if (replayed) {
      sendJson(res, 200, { ok: true, provider: replayed.assistant_message?.provider ?? null, ...replayed });
      return;
    }

    const session = await convo.loadSessionForSend(user, sessionId); // 404 / 409 SESSION_ENDED
    const history = await convo.loadHistory(sessionId); // DB가 단일 소스 — 첫 턴·resume 폴백용
    const providerId = body.provider || defaultProviderId();
    // 같은 provider 의 CLI 세션 핸들이 있으면 resume(askAI 가 히스토리를 생략). provider 가 바뀌면 히스토리로 새 세션.
    const sessionRef = session.provider_ref && session.provider_ref_provider === providerId
      ? session.provider_ref : null;

    // AI 호출 — ★트랜잭션 밖★. 요청이 끊기면 CLI 프로세스까지 죽인다 (ai.routes.js와 동일).
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const ai = await askAI({
      userId: user.id, // 사용자당 동기 요청 1건 — 초과분은 429 (플랜 10.5 S7)
      task: 'tutor',
      providerId,
      model: str(body.model, 'model', { max: 100, optional: true }) ?? null,
      history,
      sessionRef,
      userMessage: text,
      context: session.scenario_system_prompt
        ? `[역할극 지시]\n${session.scenario_system_prompt}`
        : null,
      signal: abort.signal,
    }); // 실패(502/503/504)는 그대로 위로 — 아무것도 저장되지 않음 (재전송 안전)

    const saved = await convo.saveExchange(user, sessionId, { text, clientRequestId, ai });
    sendJson(res, 200, {
      ok: true,
      provider: ai.provider,
      ...(ai.degraded ? { degraded: true } : {}),
      ...saved,
      meta: {
        queuedMs: ai.meta?.queuedMs, durationMs: ai.meta?.durationMs,
        resumed: ai.meta?.resumed ?? false,               // CLI 세션 이어붙임(히스토리 생략)
        resume_fallback: ai.meta?.resume_fallback ?? false, // resume 실패 → 히스토리 재전송으로 처리됨
      },
    });
  });

  router.patch('/api/conversations/:session_id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const sessionId = posInt(params.session_id, 'session_id');
    const body = await readJson(req);
    const title = str(body.title, 'title', { min: 1, max: 80, optional: true });
    sendJson(res, 200, {
      ok: true,
      ...(await convo.patchSession(user, sessionId, { title, ended: body.ended === true })),
    });
  });

  router.delete('/api/conversations/:session_id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    await convo.deleteSession(user, posInt(params.session_id, 'session_id'));
    sendNoContent(res);
  });

  router.get('/api/corrections', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const due = query.get('due') === '1';
    const limit = posInt(query.get('limit'), 'limit', { optional: true, max: 200 }) ?? 50;
    sendJson(res, 200, { ok: true, ...(await convo.listCorrections(user, { due, limit })) });
  });
}
