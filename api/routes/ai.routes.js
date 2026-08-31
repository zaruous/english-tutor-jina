import { askAI } from '../ai/ask.js';
import { defaultProviderId, providerHealth, providerMeta } from '../ai/registry.js';
import { config } from '../config.js';
import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { str } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';

export function registerAiRoutes(router) {
  // 채팅 프록시. 요청이 끊기면(탭 닫기/Enter 연타 취소) CLI 프로세스까지 죽인다 —
  // 이게 없으면 고아 프로세스가 세마포어 슬롯을 물고 앉아 앱이 잠긴다.
  router.post('/api/ai/chat', async (req, res) => {
    await requireUser(req, res);
    const body = await readJson(req);

    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    const result = await askAI({
      task: body.task === 'vocab_entry' ? 'vocab_entry' : 'tutor',
      providerId: body.provider || defaultProviderId(),
      model: str(body.model, 'model', { max: 100, optional: true }) ?? null,
      history: Array.isArray(body.history) ? body.history : [],
      userMessage: body.userMessage,
      sessionRef: str(body.conversationId, 'conversationId', { max: 200, optional: true }) ?? null,
      ollamaUrl: body.provider === 'ollama'
        ? str(body.ollamaUrl, 'ollamaUrl', { max: 200, optional: true })
        : undefined,
      signal: abort.signal,
    });
    sendJson(res, 200, { ...result, conversationId: result.sessionRef ?? null });
  });

  // TTL 60s 캐시만 읽는다. ?force=1 로 무효화.
  router.get('/api/ai/health', async (req, res, { query }) => {
    const health = await providerHealth({ force: query.get('force') === '1' });
    sendJson(res, 200, { ok: true, ...health, default: defaultProviderId() });
  });

  router.get('/api/ai/providers', async (req, res) => {
    const providers = await providerMeta();
    sendJson(res, 200, {
      ok: true,
      default: defaultProviderId(),
      ollamaUrl: config.ai.ollamaUrl,
      providers,
    });
  });
}
