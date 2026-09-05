// 플랜 12 완료 판정 — 실제 AI 없이 저장 함수 + HTTP 인증/권한/학습 API 를 검증한다.
// 실행: npm run dev 후 npm run verify:draft-review. DB 접속 불가 시 node scripts/verify-isolated.mjs draft-review.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../api/lib/pool.js';
import { config } from '../api/config.js';
import { hashPassword } from '../api/services/password.js';
import { SELF_REVIEW_TAG } from '../api/services/admin-content.service.js';
import { cleanupReviewFixtures, createReviewUser, createReviewTopic, createReviewContent, reviewState, reviewAudit } from './lib/draft-review-fixtures.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const TAG = `vdr-${Date.now()}`;
const PASS = 'draft-review-1234';
const results = [];
const users = {};
const cookies = {};
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
}
async function req(path, { role, method = 'GET', body } = {}) {
  const response = await fetch(API + path, {
    method, signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: BASE,
      'X-Jina-No-Autologin': '1', ...(role ? { Cookie: cookies[role] } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, ...await response.json() };
}
const post = (path, role, body = {}) => req(path, { role, method: 'POST', body });
async function login(role) {
  const response = await fetch(API + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', 'X-Jina-No-Autologin': '1', Origin: BASE },
    body: JSON.stringify({ email: users[role].email, password: PASS }),
  });
  assert.equal(response.status, 200, `${role} 로그인`);
  cookies[role] = response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookies[role]);
  const me = await req('/api/auth/me', { role });
  check(`${role} 실제 인증 역할 확인`, me.user?.role === role);
}
async function learningSnapshot(role, topicId) {
  const paths = ['/api/lessons', '/api/lessons/recommended', '/api/topics', `/api/topics/${topicId}`,
    '/api/scenarios', '/api/speaking/sentences?limit=40', '/api/mistakes', '/api/progress', '/api/dashboard', `/api/vocab/pool?q=${TAG}`];
  const responses = await Promise.all(paths.map((path) => req(path, { role })));
  responses.forEach((r, i) => assert.equal(r.status, 200, `${role} ${paths[i]}`));
  const [lessons, recommended, topics, detail, scenarios, speaking, mistakes, progress, dashboard, vocab] = responses;
  return {
    lessons: lessons.lessons.map((l) => l.id), total: lessons.progress.total,
    recommended: recommended.lessons.map((l) => l.id),
    topic: topics.topics.find((t) => t.id === topicId),
    detail: { lessons: detail.lessons, scenarios: detail.scenarios, vocab_sets: detail.vocab_sets, progress: detail.progress },
    scenarios: scenarios.scenarios.map((s) => s.id), speaking: speaking.sentences,
    mistakes: mistakes.mistakes, progress: progress.progress, dashboard: dashboard.stats, vocab: vocab.words,
  };
}

try {
  assert.equal((await req('/api/health')).status, 200, '서버·DB 준비 필요');
  const passwordHash = await hashPassword(PASS);
  for (const role of ['learner', 'author', 'reviewer', 'admin']) {
    users[role] = await createReviewUser(TAG, role, passwordHash);
    await login(role);
  }
  check('미인증 큐 요청 401 (자동로그인 차단)', (await req('/api/admin/drafts')).status === 401);
  check('learner 큐 요청 403', (await req('/api/admin/drafts', { role: 'learner' })).status === 403);
  const topicId = await createReviewTopic(TAG, users.admin);
  const before = {};
  for (const role of ['admin', 'learner']) before[role] = await learningSnapshot(role, topicId);
  const rows = [];
  for (const task of ['lesson_gen', 'scenario_gen', 'vocab_set']) {
    const row = await createReviewContent(TAG, users.admin, { task, topicId });
    rows.push(row);
    // 종결 job 을 재사용하게 해 HTTP enqueue 의 검증·해시 경로까지 실행하되 AI 는 부르지 않는다.
    const generated = await post('/api/ai-jobs', 'admin', {
      task, input: row.input, client_request_id: randomUUID(), provider: 'ollama',
    });
    check(`admin ${task} catalog 요청 202 · 같은 종결 job 재사용`,
      generated.status === 202 && generated.reused && generated.job?.id === row.job.id && generated.job.input.publish_target === 'catalog');
    const stored = await reviewState(row.id);
    check(`${task} 워커 저장 결과 review/private`, stored.status === 'review' && stored.visibility === 'private');
  }
  for (const role of ['admin', 'learner']) {
    const after = await learningSnapshot(role, topicId);
    // 변동 시간·활동일 같은 무관한 집계는 제외하고 콘텐츠가 섞일 모든 컬렉션/분모를 대조한다.
    for (const key of ['lessons', 'total', 'recommended', 'topic', 'detail', 'scenarios', 'speaking', 'mistakes', 'vocab']) {
      check(`${role} review 비노출: ${key}`, JSON.stringify(after[key]) === JSON.stringify(before[role][key]));
    }
    check(`${role} review 비노출: 대시보드·진도`,
      !JSON.stringify(after.dashboard).includes(TAG) && !JSON.stringify(after.progress).includes(TAG));
    check(`${role} review 레슨 상세 404`, (await req(`/api/lessons/${rows[0].id}`, { role })).status === 404);
    check(`${role} review 레슨 제출 404`, (await post(`/api/lessons/${rows[0].id}/attempts`, role, {
      answers: { 1: 'A', 2: 'A', 3: 'A' }, client_request_id: randomUUID(),
    })).status === 404);
    check(`${role} review 회화 시작 404`, (await post('/api/conversations', role, { scenario_id: rows[1].id })).status === 404);
    check(`${role} review 단어 세트 담기 404`, (await post(`/api/vocab-sets/${rows[2].id}/add`, role)).status === 404);
  }
  const queue = await req(`/api/admin/drafts?q=${TAG}`, { role: 'author' });
  check('author 큐에 세 유형이 한 번씩 등장', queue.status === 200 && queue.total === 3 && new Set(queue.drafts.map((d) => d.type)).size === 3);
  const lessonQueue = queue.drafts.find((d) => d.id === rows[0].id);
  check('레슨 초안 연결 · payload · 검증 오류 · 교차 채점 슬롯',
    lessonQueue?.draft_id === rows[0].saved.draft_id && lessonQueue?.payload.items.length === 3
    && lessonQueue.validation_errors.length === 0 && lessonQueue.cross_check === null);
  check('시나리오·단어 payload/검증 기록 NULL · 실제 결과 제공', queue.drafts.filter((d) => d.type !== 'lesson').every((d) => d.payload === null && d.validation_errors === null && d.generated_content && d.cross_check === null));
  const page = await req(`/api/admin/drafts?q=${TAG}&limit=1&offset=1`, { role: 'reviewer' });
  check('큐 페이지네이션 · 전체 건수', page.total === 3 && page.drafts.length === 1 && page.drafts[0].id === queue.drafts[1].id);
  for (const task of ['lesson_gen', 'scenario_gen', 'vocab_set']) {
    const denied = await post('/api/ai-jobs', 'learner', { task, input: { topic: TAG, publish_target: 'catalog' }, client_request_id: randomUUID(), provider: 'ollama' });
    check(`learner ${task} catalog 요청 400`, denied.status === 400 && denied.code === 'BAD_REQUEST');
  }
  check('target 허용값 검증 400', (await post('/api/ai-jobs', 'admin', { task: 'lesson_gen', input: { publish_target: 'public' }, client_request_id: randomUUID(), provider: 'ollama' })).status === 400);
  check('author 승인 403', (await post(`/api/admin/drafts/${rows[0].id}/approve`, 'author')).status === 403);
  check('author 반려 403', (await post(`/api/admin/drafts/${rows[0].id}/reject`, 'author', { note: '검토' })).status === 403);
  check('공개 플래그 문자열 400', (await post(`/api/admin/drafts/${rows[0].id}/approve`, 'reviewer', { publish: 'false' })).status === 400);
  check('없는 콘텐츠 404', (await post('/api/admin/drafts/9007199254740991/approve', 'reviewer')).status === 404);
  for (const row of rows) {
    const approval = await post(`/api/admin/drafts/${row.id}/approve`, 'reviewer');
    const state = await reviewState(row.id);
    check(`${row.type} reviewer 승인 200 · published/private`, approval.status === 200 && state.status === 'published' && state.visibility === 'private');
    const owner = await req(`/api/topics/${topicId}`, { role: 'admin' });
    const learner = await req(`/api/topics/${topicId}`, { role: 'learner' });
    const key = row.type === 'lesson' ? 'lessons' : row.type === 'scenario' ? 'scenarios' : 'vocab_sets';
    check(`${row.type} 승인 후 작성자만 학습 목록에서 조회`, owner[key].some((c) => c.id === row.id) && !learner[key].some((c) => c.id === row.id));
    const published = await post(`/api/admin/contents/${row.type}/${row.id}/visibility`, 'reviewer', { to: 'public' });
    const publicTopic = await req(`/api/topics/${topicId}`, { role: 'learner' });
    check(`${row.type} 플랜 11 공개 전이 200 · learner 목록 노출`, published.status === 200 && publicTopic[key].some((c) => c.id === row.id));
  }
  check('레슨 승인 부기 approved', (await reviewState(rows[0].id)).review_status === 'approved');
  const publicLesson = await req(`/api/lessons/${rows[0].id}`, { role: 'learner' });
  check('공개 레슨 상세 200 · 정답 해설 미노출', publicLesson.status === 200 && !JSON.stringify(publicLesson).includes('"answer"') && !JSON.stringify(publicLesson).includes('"explanation"'));
  check('공개 단어 세트 학습 가능 · 풀 등록은 담을 때', (await post(`/api/vocab-sets/${rows[2].id}/add`, 'learner')).added === 20);

  const rejected = await createReviewContent(TAG, users.admin, { name: '반려' });
  const count = async () => (await pool.query(`SELECT count(*)::int AS n FROM content_items WHERE created_by = $1`, [users.admin.id])).rows[0].n;
  const previousCount = await count();
  check('빈 반려 사유 400', (await post(`/api/admin/drafts/${rejected.id}/reject`, 'reviewer', { note: '   ' })).status === 400);
  const rejection = await post(`/api/admin/drafts/${rejected.id}/reject`, 'reviewer', { note: '정답 근거를 보완해 주세요.' });
  const rejectedState = await reviewState(rejected.id);
  check('반려 200 · 행 수 불변 · draft/rejected', rejection.status === 200 && await count() === previousCount && rejectedState.status === 'draft' && rejectedState.review_status === 'rejected');
  check('반려 사유 감사 note 저장', (await reviewAudit(rejected.id))[0].note === '정답 근거를 보완해 주세요.');
  check('반려 뒤 재승인은 상태 우선 409', (await post(`/api/admin/drafts/${rejected.id}/approve`, 'author')).status === 409);
  check('반려된 레슨도 학습 상세 404', (await req(`/api/lessons/${rejected.id}`, { role: 'admin' })).status === 404);
  const combined = await createReviewContent(TAG, users.admin, { name: '동시 승인' });
  const races = await Promise.all([0, 1].map(() => post(`/api/admin/drafts/${combined.id}/approve`, 'reviewer', { publish: true })));
  check('동시 승인: 성공 200 한 건 · 충돌 409 한 건', races.map((r) => r.status).sort().join(',') === '200,409');
  const combinedAudit = await reviewAudit(combined.id);
  check('한 번에 승인·공개: 감사 정확히 2행 · public/approved',
    combinedAudit.length === 2 && combinedAudit[0].action === 'status_change' && combinedAudit[1].action === 'visibility_change'
    && (await reviewState(combined.id)).visibility === 'public' && (await reviewState(combined.id)).review_status === 'approved');
  const self = await createReviewContent(TAG, users.admin, { name: '자가 승인' });
  const selfResult = await post(`/api/admin/drafts/${self.id}/approve`, 'admin');
  check('자가 승인 정책 · 감사 표식', config.requireSeparateReviewer
    ? selfResult.status === 403 && (await reviewAudit(self.id)).length === 0
    : selfResult.status === 200 && selfResult.self_review && (await reviewAudit(self.id))[0].note.startsWith(SELF_REVIEW_TAG));
  const remaining = await req(`/api/admin/drafts?q=${TAG}`, { role: 'reviewer' });
  check('검수 완료 콘텐츠는 큐에서 제외', remaining.total === (config.requireSeparateReviewer ? 1 : 0));
} catch (error) {
  check('검증 실행 오류', false, error.stack || error.message);
} finally {
  try {
    await cleanupReviewFixtures(TAG);
    const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM users WHERE email LIKE $1`, [`${TAG}-%@test.dev`]);
    check('픽스처 계정·세션·작업 정리', n === 0);
  } catch (error) { check('픽스처 정리 오류', false, error.message); }
  await pool.end();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과 · 실패 ${failed} · AI 호출 0건`);
process.exitCode = failed ? 1 : 0;
