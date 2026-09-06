// AI 초안 → 검수 → 카탈로그 공개 (플랜 12 Phase 1) — publish_target 분기와 검수 API.
// AI provider 없이 돈다: 워커의 저장 함수(saveGeneratedLesson)를 가짜 job/데이터로 직접 부른다.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setupDb, closeDb, createUser, pool } from './helpers/db.mjs';

after(() => closeDb());

async function userWithRole(role) {
  const user = await createUser();
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [user.id, role]);
  return { ...user, role };
}

function generatedLesson() {
  // part 5 는 문항 3개가 하한 — 서버 count 검증(intIn 3~10)과 맞춘다
  const item = (stem, opts) => ({
    stem,
    options: ['A', 'B', 'C', 'D'].map((id, i) => ({ id, text: opts[i] })),
    answer: 'B',
    explanation: '정답은 (B) — 문법.',
    skill_code: 'grammar',
  });
  return {
    title: 'AI 생성 검수 대상',
    subtitle: '테스트',
    items: [
      item('The invoice ___ before Friday.', ['pay', 'must be paid', 'paying', 'pays']),
      item('She ___ the report yesterday.', ['submit', 'submitted', 'submitting', 'submits']),
      item('The meeting was ___ until Monday.', ['postpone', 'postponed', 'postponing', 'postpones']),
    ],
  };
}

// ai_jobs 행을 직접 심는다 — 저장 함수는 job 행(user_id·id·input)만 필요하다.
async function insertJob(userId, publishTarget) {
  const svc = await import('../api/services/ai-job.service.js');
  const input = svc.normalizeJobInput('lesson_gen', {
    part: 5, count: 3, difficulty: 3, topic: '검수 테스트', publish_target: publishTarget,
  });
  const { rows: [job] } = await pool.query(
    `INSERT INTO ai_jobs (user_id, task, input, request_hash, client_request_id, provider, status)
     VALUES ($1, 'lesson_gen', $2::jsonb, $3, $4, 'claude', 'running')
     RETURNING *`,
    [userId, JSON.stringify(input), svc.requestHash('lesson_gen', input), randomUUID()],
  );
  return job;
}

test('publish_target — 정규화·해시 분리·catalog 권한(author 미만 400)', async () => {
  await setupDb();
  const svc = await import('../api/services/ai-job.service.js');

  const base = { part: 5, count: 3, difficulty: 3, topic: 'target 검증' };
  const personal = svc.normalizeJobInput('lesson_gen', base);
  const catalog = svc.normalizeJobInput('lesson_gen', { ...base, publish_target: 'catalog' });
  assert.equal(personal.publish_target, 'personal', '기본값은 personal');
  assert.equal(catalog.publish_target, 'catalog');
  // 같은 입력이라도 target 이 다르면 다른 job — 멱등 재사용으로 private 결과가 새면 안 된다
  assert.notEqual(
    svc.requestHash('lesson_gen', personal),
    svc.requestHash('lesson_gen', catalog),
  );
  assert.throws(
    () => svc.normalizeJobInput('lesson_gen', { ...base, publish_target: 'nope' }),
    (e) => e.status === 400,
  );

  // catalog 생성 요청은 author 이상
  const learner = await createUser();
  await assert.rejects(
    svc.createJob({ id: learner.id, can_author: false }, {
      task: 'lesson_gen', input: { ...base, publish_target: 'catalog' },
      clientRequestId: randomUUID(), provider: 'claude', model: null,
    }),
    (e) => e.status === 400,
  );
  const author = await userWithRole('author');
  const { job } = await (svc.createJob({ id: author.id, can_author: true }, {
    task: 'lesson_gen', input: { ...base, publish_target: 'catalog' },
    clientRequestId: randomUUID(), provider: 'claude', model: null,
  }));
  assert.equal(job.input.publish_target, 'catalog');
  assert.equal(job.status, 'queued');
});

test('워커 저장 분기 — personal 은 published+private, catalog 는 review+private', async () => {
  await setupDb();
  const svc = await import('../api/services/ai-job.service.js');
  const author = await userWithRole('author');

  const personalJob = await insertJob(author.id, 'personal');
  const saved1 = await svc.saveGeneratedLesson(personalJob, generatedLesson(), {});
  const { rows: [c1] } = await pool.query(
    `SELECT status, visibility FROM content_items WHERE id = $1`, [saved1.lesson_id]);
  assert.deepEqual(c1, { status: 'published', visibility: 'private' });

  const catalogJob = await insertJob(author.id, 'catalog');
  const saved2 = await svc.saveGeneratedLesson(catalogJob, generatedLesson(), {});
  const { rows: [c2] } = await pool.query(
    `SELECT status, visibility FROM content_items WHERE id = $1`, [saved2.lesson_id]);
  assert.deepEqual(c2, { status: 'review', visibility: 'private' });

  // review 초안은 학습 API 어디에도 없다
  const lessons = await import('../api/services/lesson.service.js');
  const list = await lessons.listLessons(author, {});
  assert.ok(!list.lessons.some((l) => l.id === saved2.lesson_id), 'review 초안이 학습 목록에 노출됨');
});

test('검수 큐 — review 행이 draft 메타와 함께 오르고, 승인/반려가 큐를 비운다', async () => {
  await setupDb();
  const aiSvc = await import('../api/services/ai-job.service.js');
  const adminSvc = await import('../api/services/admin-content.service.js');
  const author = await userWithRole('author');
  const reviewer = await userWithRole('reviewer');

  const jobA = await insertJob(author.id, 'catalog');
  const savedA = await aiSvc.saveGeneratedLesson(jobA, generatedLesson(), { model: 'test-model' });
  const jobB = await insertJob(author.id, 'catalog');
  const savedB = await aiSvc.saveGeneratedLesson(jobB, { ...generatedLesson(), title: '반려 대상' }, {});

  const { queue } = await adminSvc.listReviewQueue();
  const rowA = queue.find((c) => c.id === savedA.lesson_id);
  const rowB = queue.find((c) => c.id === savedB.lesson_id);
  assert.ok(rowA && rowB, '검수 큐에 catalog 초안이 없다');
  assert.equal(rowA.draft.provider, 'claude');
  assert.equal(rowA.cross_check, null, 'cross_check 슬롯(v1 null)이 없다');

  // 승인 + 함께 공개 → published + public, lesson_drafts.review_status 갱신(부가 기록)
  const { content: approved } = await adminSvc.approveDraft(reviewer, savedA.lesson_id, { publishPublic: true });
  assert.equal(approved.status, 'published');
  assert.equal(approved.visibility, 'public');
  const { rows: [dA] } = await pool.query(
    `SELECT review_status FROM lesson_drafts WHERE published_content_id = $1`, [savedA.lesson_id]);
  assert.equal(dA.review_status, 'approved');

  // 반려 → draft 로 되돌고 사유가 감사 로그에 남는다. 콘텐츠 행은 지워지지 않는다
  const { content: rejected } = await adminSvc.rejectDraft(reviewer, savedB.lesson_id, { note: '보기 C 어색' });
  assert.equal(rejected.status, 'draft');
  const { rows: [dB] } = await pool.query(
    `SELECT review_status FROM lesson_drafts WHERE published_content_id = $1`, [savedB.lesson_id]);
  assert.equal(dB.review_status, 'rejected');
  const { rows: [auditB] } = await pool.query(
    `SELECT note FROM content_audit_log
      WHERE content_id = $1 AND action = 'status_change' AND to_status = 'draft'`, [savedB.lesson_id]);
  assert.match(auditB.note, /보기 C 어색/);

  const { queue: afterQueue } = await adminSvc.listReviewQueue();
  assert.ok(!afterQueue.some((c) => c.id === savedA.lesson_id || c.id === savedB.lesson_id),
    '처리된 항목이 큐에 남아 있다');

  // 반려는 author 로는 못 한다 — review→draft 는 reviewer(전이표)
  const jobC = await insertJob(author.id, 'catalog');
  const savedC = await aiSvc.saveGeneratedLesson(jobC, { ...generatedLesson(), title: '권한 검증' }, {});
  await assert.rejects(
    adminSvc.rejectDraft(author, savedC.lesson_id, { note: 'x' }),
    (e) => e.status === 403,
  );
});
