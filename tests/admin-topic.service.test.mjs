// 토픽 생성·구성·순서 (플랜 13 Phase B) + eligible 격하(플랜 11 결정 3) + 발음 이력(플랜 10 Phase 3).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closeDb, createUser, pool } from './helpers/db.mjs';

after(() => closeDb());

async function userWithRole(role) {
  const user = await createUser();
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [user.id, role]);
  return { ...user, role };
}

test('토픽 — 생성(draft)→구성→발행(reviewer)→공개 → 학습자 목록에 eligible=false 로 노출', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-topic.service.js');
  const learnerTopics = await import('../api/services/topic.service.js');
  const author = await userWithRole('author');
  const reviewer = await userWithRole('reviewer');
  const learner = await createUser();

  const { topic } = await svc.createTopic(author, { label_ko: '출장 영어', description: '공항·호텔' });
  assert.equal(topic.status, 'draft');
  assert.equal(topic.visibility, 'private');

  // draft 토픽은 학습자 목록에 없다 (노출은 status 축이 결정)
  const before = await learnerTopics.listTopics(learner);
  assert.ok(!before.some((t) => t.id === topic.id));

  // 시드 콘텐츠 3개를 순서대로 붙인다 — 배열 순서 = position
  const { rows: seeds } = await pool.query(
    `SELECT id, type FROM content_items WHERE source = 'seed' ORDER BY id LIMIT 3`);
  const ids = seeds.map((s) => s.id);
  const { topic: composed } = await svc.setTopicContents(author, topic.id, ids);
  assert.deepEqual(composed.contents.map((c) => c.content_id), ids);

  // 순서 뒤집어 재저장 — 일괄 교체
  const reversed = [...ids].reverse();
  const { topic: reordered } = await svc.setTopicContents(author, topic.id, reversed);
  assert.deepEqual(reordered.contents.map((c) => c.content_id), reversed);

  // 발행은 reviewer 부터 — 콘텐츠와 같은 전이표
  await assert.rejects(svc.setTopicStatus(author, topic.id, { to: 'published' }), (e) => e.status === 403);
  // draft 토픽은 공개(public)도 불가 — 0018 확정 CHECK 와 같은 규칙
  await assert.rejects(svc.setTopicVisibility(reviewer, topic.id, { to: 'public' }), (e) => e.status === 409);

  await svc.setTopicStatus(reviewer, topic.id, { to: 'published' });
  const { topic: opened } = await svc.setTopicVisibility(reviewer, topic.id, { to: 'public' });
  assert.equal(opened.visibility, 'public');

  // eligible 은 필터가 아니라 배지 — 임계치 미달이어도 학습자 목록에 뜬다(플랜 11 결정 3)
  const listed = (await learnerTopics.listTopics(learner)).find((t) => t.id === topic.id);
  assert.ok(listed, 'published+public 토픽이 학습자 목록에 없다');
  assert.equal(listed.eligible, false);

  // 잘못된 구성 입력 — 중복 400, 없는 콘텐츠는 FK 위반(23503 — HTTP 계층의 fromPgError 가 404 로 매핑)
  await assert.rejects(svc.setTopicContents(author, topic.id, [ids[0], ids[0]]), (e) => e.status === 400);
  await assert.rejects(svc.setTopicContents(author, topic.id, [999999]),
    (e) => e.code === '23503' || e.status === 404);
});

test('발음 이력 — 저장 → 목록·30일 평균 → 대시보드 speaking 스킬', async () => {
  await setupDb();
  const speaking = await import('../api/services/speaking.service.js');
  const dashboard = await import('../api/services/dashboard.service.js');
  const user = await createUser();

  await speaking.saveSpeakingAttempt(user.id, {
    sentenceText: 'Could you send the file by noon?', source: 'listening', backend: 'openpronounce',
    result: { pron_score: 85, accuracy: 85, completeness: 90, words: [{ word: 'file', score: 80 }] },
  });
  await speaking.saveSpeakingAttempt(user.id, {
    sentenceText: 'The meeting was postponed until Monday.', source: 'lesson', backend: 'openpronounce',
    result: { pron_score: 95, accuracy: 95, words: [] },
  });

  const hist = await speaking.listSpeakingAttempts(user, { limit: 10 });
  assert.equal(hist.total, 2);
  assert.equal(hist.avg_30d, 90);
  assert.equal(hist.attempts[0].pron_score, 95, '최신순 정렬이 아니다');
  assert.equal(hist.attempts[1].source, 'listening');

  const dash = await dashboard.getDashboard(user);
  const speakingSkill = dash.skills.find((s) => s.key === 'speaking');
  assert.equal(speakingSkill.pct, 90);
  assert.match(speakingSkill.score_text, /발음 점수 평균 90점/);
});
