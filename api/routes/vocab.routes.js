import { askAI } from '../ai/ask.js';
import { renderQuizRequest } from '../ai/prompts.js';
import { defaultProviderId } from '../ai/registry.js';
import { readJson } from '../lib/body.js';
import { HttpError } from '../lib/errors.js';
import { sendJson, sendNoContent } from '../lib/respond.js';
import { oneOf, posInt, str, UUID_RE, WORD_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as vocab from '../services/vocab.service.js';
import * as quiz from '../services/vocab-quiz.service.js';

// 퀴즈 키워드: 한글/영문/숫자/공백/기본 문장부호 1~40자 (프롬프트에는 LEARNER_INPUT 블록으로 감싸 들어간다)
const KEYWORD_RE = /^[\p{L}\p{N} \-&.,'()]{1,40}$/u;

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

  // 전체 단어장(풀) 탐색 — 플랜 09 Phase 2. 읽기 전용 + 담기는 기존 POST /api/vocab/add 재사용.
  router.get('/api/vocab/pool', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const q = str(query.get('q'), 'q', { max: 64, optional: true });
    const source = oneOf(query.get('source') || undefined, 'source', vocab.POOL_SOURCES, { optional: true });
    const page = posInt(query.get('page') || undefined, 'page', { optional: true, max: 100_000 }) ?? 1;
    sendJson(res, 200, { ok: true, ...(await vocab.listPool(user, { q, source, page })) });
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

  // ── 오늘의 단어 (AI 퀴즈) — /api/vocab/:card_id 계열보다 먼저 등록 (라우터 first-match) ──
  // 생성: AI 먼저(트랜잭션 밖), 스키마 통과한 10단어만 저장. 실패(502/503/504)는 그대로 위로 — 아무것도 저장되지 않음.
  router.post('/api/vocab/quiz', async (req, res) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    const kind = oneOf(body.kind, 'kind', quiz.QUIZ_KINDS);
    const keyword = kind === 'keyword'
      ? str(body.keyword, 'keyword', { min: 1, max: 40, pattern: KEYWORD_RE })
      : null;
    const exclude = await quiz.existingWords(user);
    const providerId = body.provider || defaultProviderId();
    const model = str(body.model, 'model', { max: 100, optional: true }) ?? null;
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const ai = await askAI({
      task: 'vocab_quiz',
      providerId, model,
      userMessage: renderQuizRequest({ kind, keyword, exclude }),
      ollamaUrl: body.provider === 'ollama'
        ? str(body.ollamaUrl, 'ollamaUrl', { max: 200, optional: true })
        : undefined,
      signal: abort.signal,
    });
    const created = await quiz.createQuiz(user, {
      kind, keyword, data: ai.data, provider: ai.provider, model: ai.meta?.model ?? model,
    });
    // 플랜 09 Phase 1 — 생성 단어를 풀(vocab_words)에 자동 등록. 나만의 단어장(카드)은 불변.
    // createQuiz 트랜잭션 밖 — 등록이 실패해도 퀴즈 생성은 성공해야 한다(로그만).
    try {
      await vocab.registerPoolEntries(created.words, { source: 'ai', createdBy: user.id });
    } catch (e) {
      console.error('[vocab] 퀴즈 단어 풀 자동 등록 실패:', e.message);
    }
    sendJson(res, 201, { ok: true, quiz: created, meta: { durationMs: ai.meta?.durationMs } });
  });

  router.get('/api/vocab/quiz/today', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, quiz: await quiz.todayQuiz(user) });
  });

  router.get('/api/vocab/quiz/:quiz_id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const row = await quiz.getQuizRow(user, posInt(params.quiz_id, 'quiz_id'));
    sendJson(res, 200, { ok: true, quiz: quiz.quizDto(row) });
  });

  // 채점 — answers: [{index, choice}] 최대 10개. 정답 판정·점수·완료 시각은 서버가 기록한다.
  router.post('/api/vocab/quiz/:quiz_id/answer', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    if (!Array.isArray(body.answers) || body.answers.length === 0 || body.answers.length > quiz.QUIZ_SIZE) {
      throw new HttpError(400, 'BAD_REQUEST', `answers 는 1~${quiz.QUIZ_SIZE}개의 {index, choice} 배열이어야 합니다.`);
    }
    const graded = await quiz.answerQuiz(user, posInt(params.quiz_id, 'quiz_id'), body.answers);
    sendJson(res, 200, { ok: true, quiz: graded });
  });

  // 퀴즈 단어를 단어장에 — indexes 비면 10개 전부. AI 재호출 없음(퀴즈의 사전 정보 사용).
  router.post('/api/vocab/quiz/:quiz_id/add', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    if (body.indexes !== undefined && (!Array.isArray(body.indexes) || body.indexes.length > quiz.QUIZ_SIZE)) {
      throw new HttpError(400, 'BAD_REQUEST', 'indexes 는 정수 배열(최대 10개)이어야 합니다.');
    }
    const result = await quiz.addQuizWords(user, posInt(params.quiz_id, 'quiz_id'), body.indexes || []);
    sendJson(res, 200, { ok: true, ...result, stats: await vocab.stats(user).then((s) => s.stats) });
  });

  // 문항의 유의어/반의어 1개를 단어장에 — 저장된 퀴즈 데이터의 뜻·IPA 를 사용(AI 재호출 없음).
  router.post('/api/vocab/quiz/:quiz_id/related', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    const word = str(body.word, 'word', { min: 1, max: 40 });
    const result = await quiz.addRelatedWord(user, posInt(params.quiz_id, 'quiz_id'), { index: body.index, word });
    sendJson(res, 201, { ok: true, ...result });
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
