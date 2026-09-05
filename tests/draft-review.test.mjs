import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, it } from 'node:test';
import { config } from '../api/config.js';
import { invalidateRoleCache } from '../api/lib/roles.js';
import { normalizeJobInput, createJob, requestHash } from '../api/services/ai-job.service.js';
import { approveDraft, rejectDraft, listDrafts, changeStatus, SELF_REVIEW_TAG } from '../api/services/admin-content.service.js';
import { setupDb, closeDb, pool } from './helpers/db.mjs';
import { cleanupReviewFixtures, createReviewUser, createReviewContent, reviewAudit, reviewState } from '../scripts/lib/draft-review-fixtures.mjs';

const tag = `udr-${Date.now()}`;
const users = {};
const originalPolicy = config.requireSeparateReviewer;
before(async () => {
  await setupDb();
  config.requireSeparateReviewer = false;
  for (const role of ['learner', 'author', 'reviewer', 'admin']) users[role] = await createReviewUser(tag, role);
});
after(async () => {
  config.requireSeparateReviewer = originalPolicy;
  try { await cleanupReviewFixtures(tag); } finally { await closeDb(); }
});
const httpError = (status) => (error) => error.status === status;
const fixture = (options = {}, actor = users.admin) => createReviewContent(tag, actor, { name: randomUUID(), ...options });

it('세 작업의 기본값은 personal 이고 target 은 정규화 input 과 해시에 남는다', () => {
  for (const task of ['lesson_gen', 'scenario_gen', 'vocab_set']) {
    const input = { topic: '검수 검증' };
    const personal = normalizeJobInput(task, input);
    assert.equal(personal.publish_target, 'personal');
    assert.deepEqual(personal, normalizeJobInput(task, { ...input, publish_target: 'personal' }));
    assert.notEqual(requestHash(task, personal), requestHash(task, normalizeJobInput(task, { ...input, publish_target: 'catalog' })));
    for (const value of [null, '', 'public', 1, {}, ['catalog']]) {
      assert.throws(() => normalizeJobInput(task, { ...input, publish_target: value }), httpError(400));
    }
  }
});

it('서비스가 역할 캐시를 직접 채우고 learner catalog 는 작업을 만들지 않는다', async () => {
  invalidateRoleCache();
  await assert.rejects(createJob(users.learner, {
    task: 'lesson_gen', input: { publish_target: 'catalog' }, clientRequestId: randomUUID(), provider: 'ollama',
  }), httpError(400));
  const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM ai_jobs WHERE user_id = $1`, [users.learner.id]);
  assert.equal(n, 0);
});

it('author 생성에서 personal/catalog 는 다른 작업이고 같은 대상은 멱등 재사용한다', async () => {
  const args = { task: 'lesson_gen', input: { topic: tag }, clientRequestId: randomUUID(), provider: 'ollama' };
  const personal = await createJob(users.author, args);
  const catalog = await createJob(users.author, { ...args, clientRequestId: randomUUID(), input: { ...args.input, publish_target: 'catalog' } });
  assert.notEqual(personal.job.id, catalog.job.id);
  assert.equal(catalog.job.input.publish_target, 'catalog');
  const reused = await createJob(users.author, { ...args, clientRequestId: randomUUID(), input: catalog.job.input });
  assert.equal(reused.job.id, catalog.job.id);
  assert.equal(reused.reused, true);
  await assert.rejects(createJob(users.author, { ...args, input: catalog.job.input }), httpError(409));
});

for (const task of ['lesson_gen', 'scenario_gen', 'vocab_set']) {
  it(`${task} 저장은 personal=published, catalog=review 이고 모두 private 이다`, async () => {
    for (const target of ['personal', 'catalog']) {
      const row = await fixture({ task, target });
      const saved = await reviewState(row.id);
      assert.equal(saved.status, target === 'catalog' ? 'review' : 'published');
      assert.equal(saved.visibility, 'private');
      if (task === 'lesson_gen') assert.equal(saved.review_status, 'draft');
      if (task === 'vocab_set') {
        const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM vocab_words WHERE word LIKE $1`, [`${tag}-${row.input.topic.split(' ').slice(1).join(' ')}-%`]);
        assert.equal(n, target === 'catalog' ? 0 : 20);
      }
    }
  });
}

it('큐는 content_items.status 만 판정하고 세 유형의 결과·NULL 슬롯을 반환한다', async () => {
  const lesson = await fixture();
  await pool.query(`UPDATE lesson_drafts SET review_status = 'rejected', validation_errors = '["검증 경고"]' WHERE published_content_id = $1`, [lesson.id]);
  const result = await listDrafts(users.reviewer, { q: tag, limit: 200 });
  const row = result.drafts.find((d) => d.id === lesson.id);
  assert.equal(row.payload.items.length, 3);
  assert.deepEqual(row.validation_errors, ['검증 경고']);
  assert.equal(row.cross_check, null);
  assert.equal(row.can_approve, true);
  for (const type of ['scenario', 'vocab_set']) {
    const other = result.drafts.find((d) => d.type === type);
    assert.equal(other.payload, null);
    assert.equal(other.validation_errors, null);
    assert.ok(other.generated_content);
  }
  const page = await listDrafts(users.author, { q: tag, limit: 1, offset: 1 });
  assert.equal(page.total, result.total);
  assert.equal(page.drafts[0].id, result.drafts[1].id);
  assert.equal(page.drafts[0].can_approve, false);
  assert.equal(page.drafts[0].can_reject, false);
});

it('author 승인·반려는 403 이고 검수 상태와 감사는 변하지 않는다', async () => {
  const row = await fixture();
  await assert.rejects(approveDraft(users.author, row.id), httpError(403));
  await assert.rejects(rejectDraft(users.author, row.id, { note: '다시 작성' }), httpError(403));
  assert.equal((await reviewState(row.id)).status, 'review');
  assert.equal((await reviewAudit(row.id)).length, 0);
});

it('승인은 private 를 유지하고 부기·행위자·자가 승인 표식을 함께 기록한다', async () => {
  const row = await fixture();
  const result = await approveDraft(users.admin, row.id, { note: '검토 완료' });
  assert.equal(result.self_review, true);
  assert.deepEqual(await reviewState(row.id), { status: 'published', visibility: 'private', review_status: 'approved', updated_by: users.admin.id });
  const audit = await reviewAudit(row.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].note, `${SELF_REVIEW_TAG} 검토 완료`);
  assert.equal(audit[0].action, 'status_change');
});

it('반려는 행을 지우지 않고 draft/rejected 와 사유를 남긴다', async () => {
  const row = await fixture();
  const count = async () => (await pool.query(`SELECT count(*)::int AS n FROM content_items`)).rows[0].n;
  const before = await count();
  await assert.rejects(rejectDraft(users.reviewer, row.id, { note: '   ' }), httpError(400));
  await rejectDraft(users.reviewer, row.id, { note: '정답 근거 보완' });
  assert.equal(await count(), before);
  assert.equal((await reviewState(row.id)).review_status, 'rejected');
  assert.equal((await reviewState(row.id)).status, 'draft');
  assert.equal((await reviewAudit(row.id))[0].note, '정답 근거 보완');
  await assert.rejects(approveDraft(users.author, row.id), httpError(409));
});

it('승인과 공개는 status_change/visibility_change 두 행으로 남는다', async () => {
  const row = await fixture();
  await approveDraft(users.reviewer, row.id, { publish: true });
  assert.equal((await reviewState(row.id)).visibility, 'public');
  const audit = await reviewAudit(row.id);
  assert.deepEqual(audit.map((a) => [a.action, a.from_status, a.to_status]), [
    ['status_change', 'review', 'published'], ['visibility_change', 'private', 'public'],
  ]);
  await assert.rejects(approveDraft(users.reviewer, row.id), httpError(409));
  assert.equal((await reviewAudit(row.id)).length, 2);
});

it('공개 단계가 실패하면 승인·부기·감사도 전부 롤백한다', async (t) => {
  const row = await fixture();
  const connect = pool.connect.bind(pool);
  t.mock.method(pool, 'connect', async () => {
    const client = await connect();
    return {
      release: () => client.release(),
      query: (sql, values) => {
        if (sql.includes('INSERT INTO content_audit_log') && values[2] === 'visibility_change') {
          throw new Error('검증용 공개 감사 저장 실패');
        }
        return client.query(sql, values);
      },
    };
  });
  await assert.rejects(approveDraft(users.reviewer, row.id, { publish: true }), /검증용/);
  assert.equal((await reviewState(row.id)).status, 'review');
  assert.equal((await reviewState(row.id)).review_status, 'draft');
  assert.equal((await reviewAudit(row.id)).length, 0);
});

it('분리 검수 설정은 두 전이 API 와 큐의 버튼 권한에 동일하게 적용된다', async () => {
  const row = await fixture();
  config.requireSeparateReviewer = true;
  try {
    await assert.rejects(approveDraft(users.admin, row.id, { publish: true }), httpError(403));
    await assert.rejects(changeStatus(users.admin, 'lesson', row.id, { to: 'published' }), httpError(403));
    const queue = await listDrafts(users.admin, { q: row.input.topic.split(' ').slice(1).join(' ') });
    assert.equal(queue.require_separate_reviewer, true);
    assert.equal(queue.drafts[0].can_approve, false);
    assert.equal(queue.drafts[0].can_reject, true);
    assert.equal((await reviewAudit(row.id)).length, 0);
    await approveDraft(users.reviewer, row.id);
    assert.equal((await reviewState(row.id)).status, 'published');
  } finally { config.requireSeparateReviewer = false; }
});

it('기존 상태 API 로 검수해도 레슨 부기와 큐 상태가 함께 바뀐다', async () => {
  const row = await fixture();
  await changeStatus(users.reviewer, 'lesson', row.id, { to: 'draft', note: '반려' });
  assert.equal((await reviewState(row.id)).review_status, 'rejected');
  await changeStatus(users.author, 'lesson', row.id, { to: 'review' });
  await changeStatus(users.reviewer, 'lesson', row.id, { to: 'published' });
  assert.equal((await reviewState(row.id)).review_status, 'approved');
  assert.equal((await listDrafts(users.reviewer, { q: tag, limit: 200 })).drafts.some((d) => d.id === row.id), false);
});
