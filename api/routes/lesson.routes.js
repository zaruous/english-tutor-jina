import { askAI } from '../ai/ask.js';
import { defaultProviderId } from '../ai/registry.js';
import { config } from '../config.js';
import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { oneOf, posInt, str, UUID_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as lessons from '../services/lesson.service.js';

// CSRF/CORS/캔버스 READONLY 403은 api/server.js가 전역 처리 — 여기선 재구현하지 않는다.
// ★ router 는 등록순 first-match — GET /api/lessons/recommended 는 /api/lessons/:id 보다 먼저 등록한다.
export function registerLessonRoutes(router) {
  // ?kind=<lessons.kind>&status=<new|attempted> — 둘 다 선택. status 는 attempt_count 파생값 기준, 다른 값은 400.
  router.get('/api/lessons', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const kind = str(query.get('kind'), 'kind', { max: 40, optional: true });
    const status = oneOf(query.get('status') || undefined, 'status', lessons.LESSON_STATUS_FILTERS, { optional: true });
    sendJson(res, 200, { ok: true, ...(await lessons.listLessons(user, { kind, status })) });
  });

  // 추천 ≤ 3건 + reason_code(not_started | retry_low_score | next_in_series). 대시보드 '시험대비'와 같은 함수.
  // 오답 노트 (플랜 08 Phase A) — 파생 조회. /api/lessons/:id 보다 먼저 등록할 필요는 없으나
  // 경로가 다르므로 목록 라우트 옆에 둔다.
  router.get('/api/mistakes', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const skill = str(query.get('skill'), 'skill', { max: 40, optional: true });
    const lessonId = posInt(query.get('lesson_id') || undefined, 'lesson_id', { optional: true });
    sendJson(res, 200, { ok: true, ...(await lessons.listMistakes(user, { skill, lessonId })) });
  });

  router.get('/api/lessons/recommended', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const limit = posInt(query.get('limit'), 'limit', { optional: true, max: 3 }) ?? 3;
    sendJson(res, 200, { ok: true, lessons: await lessons.recommendLessons(user, { limit }) });
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

  router.post('/api/lessons/:id/reports', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const lessonId = posInt(params.id, 'id');
    const body = await readJson(req);
    const reason = oneOf(body.reason, 'reason', ['incorrect_answer', 'ambiguous', 'language', 'other']);
    const details = str(body.details, 'details', { max: 1000, optional: true }) ?? null;
    sendJson(res, 201, { ok: true, report: await lessons.reportLesson(user, lessonId, { reason, details }) });
  });

  // Jina Q&A — 클라이언트는 question(+attempt_id/item_id)만 보내고 학습 자료는 서버가 조립한다.
  // 정답·해설은 어떤 경로로도 프롬프트·응답에 실리지 않는다(lesson.service.prepareQa 가 SELECT 컬럼을 제한).
  //  - attempt_id 없음 → 'pre_submit': 지문만, stateless(sessionRef 없음, history []).
  //  - attempt_id 있음 → 소유권·레슨 일치 검증(403) → 'post_submit': 지문 + 문항 + 학습자의 답, CLI 세션 resume.
  //  - dry_run:true (production 제외) → AI 호출 없이 서버가 조립한 컨텍스트만 반환(검증용).
  router.post('/api/lessons/:id/qa', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const lessonId = posInt(params.id, 'id');
    const body = await readJson(req);
    const question = str(body.question, 'question', { min: 1, max: 500 });
    const attemptId = body.attempt_id === undefined || body.attempt_id === null
      ? undefined : posInt(body.attempt_id, 'attempt_id');
    const itemId = body.item_id === undefined || body.item_id === null
      ? undefined : posInt(body.item_id, 'item_id', { max: 50 }); // = lesson_items.position
    // Q&A 본문은 저장하지 않으므로 멱등 replay 는 없다 — 형식만 검증해 잘못된 클라이언트를 빨리 드러낸다
    str(body.client_request_id, 'client_request_id', { max: 36, optional: true, pattern: UUID_RE });
    const providerId = body.provider || defaultProviderId();
    const model = str(body.model, 'model', { max: 100, optional: true }) ?? null;

    const { mode, context, passageText, attempt } = await lessons.prepareQa(user, lessonId, { attemptId, itemId });

    if (body.dry_run === true && !config.isProduction) {
      sendJson(res, 200, { ok: true, dry_run: true, mode, context });
      return;
    }

    // 제출 후에만 같은 provider 의 CLI 세션을 이어간다(askAI 가 히스토리를 생략). 제출 전은 stateless.
    const sessionRef = mode === 'post_submit'
      ? await lessons.findQaSessionRef(user, lessonId, attempt.id, providerId)
      : null;

    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const ai = await askAI({
      task: 'lesson_qa',
      providerId, model,
      history: [],
      context,
      userMessage: question, // LEARNER_INPUT 블록으로 감싸진다 — 학습 자료(context)는 서버 작성이라 감싸지 않음
      sessionRef,
      ollamaUrl: body.provider === 'ollama'
        ? str(body.ollamaUrl, 'ollamaUrl', { max: 200, optional: true })
        : undefined,
      signal: abort.signal,
    }); // 실패(502/503/504)는 그대로 위로 — 저장할 것이 없어 재전송 안전

    if (mode === 'post_submit') {
      // resume 폴백으로 새 세션이 열렸으면 새 핸들로 교체된다
      await lessons.saveQaSessionRef(user, lessonId, attempt.id, ai.provider, ai.sessionRef);
    }
    const { citations, dropped } = lessons.verifyCitations(ai.data.citations, passageText);
    sendJson(res, 200, {
      ok: true,
      mode,
      answer: ai.data.answer,
      citations,
      citations_dropped: dropped,
      resumed: ai.meta?.resumed ?? false,
      provider: ai.provider,
      meta: {
        durationMs: ai.meta?.durationMs,
        queuedMs: ai.meta?.queuedMs,
        resume_fallback: ai.meta?.resume_fallback ?? false,
      },
    });
  });
}
