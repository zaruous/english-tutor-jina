import { askAI } from '../ai/ask.js';
import { defaultProviderId } from '../ai/registry.js';
import { readJson } from '../lib/body.js';
import { HttpError } from '../lib/errors.js';
import { sendJson, sendNoContent } from '../lib/respond.js';
import { posInt, str, UUID_RE, WORD_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as vocab from '../services/vocab.service.js';

export function registerVocabRoutes(router) {
  router.get('/api/vocab', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const status = query.get('status') || undefined;
    if (status && !['new', 'due', 'learned'].includes(status)) {
      throw new HttpError(400, 'BAD_REQUEST', 'status는 new/due/learned 중 하나여야 합니다.');
    }
    const q = str(query.get('q'), 'q', { max: 64, optional: true });
    sendJson(res, 200, { ok: true, ...(await vocab.listCards(user, { status, q })) });
  });

  router.get('/api/vocab/due', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await vocab.dueCards(user)) });
  });

  router.get('/api/vocab/stats', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await vocab.stats(user)) });
  });

  router.post('/api/vocab/add', async (req, res) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    const word = str(body.word, 'word', { min: 1, max: 64, pattern: WORD_RE });

    // AI 먼저, DB 나중 — 트랜잭션 안에서 CLI를 기다리면 커넥션이 물린다.
    // 이미 사전에 있으면 CLI 생략.
    const existing = await vocab.findWordEntry(word);
    let entry = null;
    if (!existing) {
      const abort = new AbortController();
      res.on('close', () => { if (!res.writableEnded) abort.abort(); });
      const ai = await askAI({
        task: 'vocab_entry',
        providerId: body.provider || defaultProviderId(),
        model: str(body.model, 'model', { max: 100, optional: true }) ?? null,
        userMessage: word,
        ollamaUrl: body.provider === 'ollama'
          ? str(body.ollamaUrl, 'ollamaUrl', { max: 200, optional: true })
          : undefined,
        signal: abort.signal,
      }); // SCHEMA_VIOLATION 등은 그대로 위로 — 쓰레기 카드를 저장하지 않는다
      entry = ai.data;
      if (!entry.word) entry.word = word;
    }

    const result = await vocab.addCardFromEntry(user, { word, entry, source: 'ai' });
    sendJson(res, result.duplicate ? 200 : 201, { ok: true, ...result });
  });

  router.post('/api/vocab/:card_id/review', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const cardId = posInt(params.card_id, 'card_id');
    const body = await readJson(req);
    const clientRequestId = str(body.client_request_id, 'client_request_id',
      { max: 36, optional: true, pattern: UUID_RE });
    const elapsedMs = body.elapsed_ms === undefined ? undefined
      : posInt(body.elapsed_ms, 'elapsed_ms', { optional: true, max: 3_600_000 });
    const result = await vocab.review(user, cardId, {
      result: body.result, clientRequestId, elapsedMs,
    });
    sendJson(res, 200, { ok: true, ...result });
  });

  router.patch('/api/vocab/:card_id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const cardId = posInt(params.card_id, 'card_id');
    const body = await readJson(req);
    if (body.examples !== undefined && body.examples !== null) {
      if (!Array.isArray(body.examples) || body.examples.length > 5
          || body.examples.some((e) => typeof e !== 'string' || e.length > 500)) {
        throw new HttpError(400, 'BAD_REQUEST', 'examples는 문자열 배열(최대 5개)이어야 합니다.');
      }
    }
    const card = await vocab.patchCard(user, cardId, {
      meaning_ko: body.meaning_ko === undefined ? undefined
        : (body.meaning_ko === null ? null : str(body.meaning_ko, 'meaning_ko', { max: 200 })),
      examples: body.examples,
      suspended: body.suspended,
      reset: Boolean(body.reset),
    });
    sendJson(res, 200, { ok: true, card });
  });

  router.delete('/api/vocab/:card_id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    await vocab.deleteCard(user, posInt(params.card_id, 'card_id'));
    sendNoContent(res);
  });
}
