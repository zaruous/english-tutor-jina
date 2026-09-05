// 플랜 13 Phase B — 관리자 토픽 API (생성·구성·전이·공개) 를 라우트 층까지 포함해 검증한다.
//
// 서비스 함수만 부르면 201/403 같은 상태 코드와 requireRole('author') 경계가 검증에서 빠진다. 그래서
// api/server.js 를 띄우는 대신 Router + registerAdminTopicRoutes 만으로 임시 포트(0)에 작은 서버를 세우고
// 실제 HTTP 로 친다. 세션은 auth.service.createSession 으로 직접 발급한다(로그인 경로는 여기 관심사가 아니다).
// CSRF 헤더 검사(requireCsrfHeader)와 CORS 는 server.js 층의 일이라 이 서버에는 없다.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, it } from 'node:test';
import { config } from '../api/config.js';
import { sendError, sendJson } from '../api/lib/respond.js';
import { Router } from '../api/router.js';
import { registerAdminTopicRoutes } from '../api/routes/admin-topics.routes.js';
import { createSession } from '../api/services/auth.service.js';
import { listTopics as learnerListTopics } from '../api/services/topic.service.js';
import { ELIGIBLE_THRESHOLDS } from '../api/services/admin-topic.service.js';
import { createReviewUser } from '../scripts/lib/draft-review-fixtures.mjs';
import { closeDb, pool, setupDb } from './helpers/db.mjs';

const tag = `utp-${Date.now()}`;
const users = {};
const cookies = {};
let server;
let base;
// 시드 콘텐츠 id — 레슨 3 · 시나리오 1 · 단어 세트 1(20단어) 이면 임계치를 정확히 채운다.
const seed = {};

before(async () => {
  await setupDb();
  for (const role of ['learner', 'author', 'reviewer', 'admin']) {
    users[role] = await createReviewUser(tag, role);
    const { token } = await createSession(users[role].id, { userAgent: 'test' });
    cookies[role] = `${config.cookieName}=${token}`;
  }
  const { rows } = await pool.query(
    `SELECT id, slug FROM content_items WHERE slug = ANY($1::text[])`,
    [['toeic-part7-set23', 'toeic-part7-set24', 'business-interview-part5-grammar',
      'business-interview-star', 'business-interview-core-20']],
  );
  for (const r of rows) seed[r.slug] = r.id;
  assert.equal(rows.length, 5, '시드 콘텐츠 5건이 있어야 한다');

  const router = new Router();
  registerAdminTopicRoutes(router);
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const matched = router.match(req.method, url.pathname);
      if (!matched) { sendJson(res, 404, { ok: false, code: 'NOT_FOUND' }); return; }
      await matched.handler(req, res, { params: matched.params, query: url.searchParams });
    } catch (err) {
      sendError(res, err);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  // 계정을 지우면 created_by 가 NULL 이 되어 토픽을 못 찾으므로 토픽을 먼저 지운다.
  await pool.query(
    `DELETE FROM topics WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)`, [`${tag}-%@test.dev`],
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${tag}-%@test.dev`]);
  await closeDb();
});

async function api(role, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { cookie: cookies[role], 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const lessons = () => ['toeic-part7-set23', 'toeic-part7-set24', 'business-interview-part5-grammar'].map((s) => seed[s]);
const fullSet = () => [
  ...lessons().map((id, i) => ({ content_id: id, position: i + 1 })),
  { content_id: seed['business-interview-star'], position: 10 },
  { content_id: seed['business-interview-core-20'], position: 20 },
];

async function createTopic(role = 'author', body = {}) {
  const res = await api(role, 'POST', '/api/admin/topics', { label_ko: `${tag} 토픽`, description: '검증용', ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.topic;
}

it('author 생성은 201 draft/private 이고 learner 는 403 이다', async () => {
  const topic = await createTopic('author', { label_ko: '한글만 있는 라벨' });
  assert.equal(topic.status, 'draft');
  assert.equal(topic.visibility, 'private');
  assert.equal(topic.created_by, users.author.id);
  assert.equal(topic.updated_by, users.author.id);
  assert.equal(topic.content_count, 0);
  assert.equal(topic.eligible, false);
  // 한글 라벨은 slug 재료가 없어 'topic' 계열로 떨어진다.
  assert.match(topic.slug, /^topic(-\d+)?$/);

  const denied = await api('learner', 'POST', '/api/admin/topics', { label_ko: 'x' });
  assert.equal(denied.status, 403);
  assert.equal((await api('learner', 'GET', '/api/admin/topics')).status, 403);
  assert.equal((await api('learner', 'GET', `/api/admin/topics/${topic.id}`)).status, 403);
});

it('slug 는 label 로 만들고 충돌하면 -2 를 붙이며, 사용자가 준 slug 는 중복이면 409 · 형식 오류면 400 이다', async () => {
  const label = `${tag} Business Meeting Basics`;
  const first = await createTopic('author', { label_ko: label });
  assert.equal(first.slug, `${tag}-business-meeting-basics`);
  const second = await createTopic('author', { label_ko: label });
  assert.equal(second.slug, `${tag}-business-meeting-basics-2`);
  const third = await createTopic('author', { label_ko: label });
  assert.equal(third.slug, `${tag}-business-meeting-basics-3`);

  const explicit = await createTopic('author', { slug: `${tag}-explicit` });
  assert.equal(explicit.slug, `${tag}-explicit`);
  const dup = await api('author', 'POST', '/api/admin/topics', { label_ko: 'dup', slug: `${tag}-explicit` });
  assert.equal(dup.status, 409);
  const bad = await api('author', 'POST', '/api/admin/topics', { label_ko: 'bad', slug: 'Not A Slug' });
  assert.equal(bad.status, 400);
  const noLabel = await api('author', 'POST', '/api/admin/topics', { slug: `${tag}-nolabel` });
  assert.equal(noLabel.status, 400);
});

it('PATCH 는 label_ko/description 만 고치고 updated_by 를 남긴다', async () => {
  const topic = await createTopic('author');
  const res = await api('reviewer', 'PATCH', `/api/admin/topics/${topic.id}`, { label_ko: `${tag} 수정됨`, description: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.topic.label_ko, `${tag} 수정됨`);
  assert.equal(res.body.topic.description, '');
  assert.equal(res.body.topic.updated_by, users.reviewer.id);
  assert.equal(res.body.topic.status, 'draft', 'PATCH 는 상태를 건드리지 않는다');
  assert.equal((await api('author', 'PATCH', `/api/admin/topics/${topic.id}`, {})).status, 400);
  assert.equal((await api('author', 'PATCH', `/api/admin/topics/999999`, { label_ko: 'x' })).status, 404);
  assert.equal((await api('author', 'GET', `/api/admin/topics/999999`)).status, 404);
});

it('PUT contents 는 일괄 교체다 — position 순 · 재PUT 으로 제거 · 중복 400 · 없는 id 404', async () => {
  const topic = await createTopic('author');
  const put = await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, {
    contents: [
      { content_id: seed['business-interview-star'], position: 5 },
      { content_id: seed['toeic-part7-set24'], position: 1 },
      { content_id: seed['toeic-part7-set23'], position: 3 },
    ],
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.deepEqual(put.body.contents.map((c) => c.content_id),
    [seed['toeic-part7-set24'], seed['toeic-part7-set23'], seed['business-interview-star']]);
  assert.equal(put.body.topic.content_count, 3);
  assert.equal(put.body.topic.updated_by, users.author.id);

  const detail = await api('author', 'GET', `/api/admin/topics/${topic.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.contents.map((c) => [c.content_id, c.position]),
    [[seed['toeic-part7-set24'], 1], [seed['toeic-part7-set23'], 3], [seed['business-interview-star'], 5]]);
  for (const c of detail.body.contents) {
    for (const key of ['type', 'title', 'status', 'visibility', 'slug']) assert.ok(key in c, key);
  }

  // 하나를 빼고 다시 PUT → 빠진 것은 DB 에서도 사라진다.
  const again = await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, {
    contents: [{ content_id: seed['toeic-part7-set23'], position: 1 }, { content_id: seed['business-interview-star'], position: 2 }],
  });
  assert.equal(again.status, 200);
  const { rows } = await pool.query(
    `SELECT content_id FROM topic_contents WHERE topic_id = $1 ORDER BY position`, [topic.id]);
  assert.deepEqual(rows.map((r) => r.content_id), [seed['toeic-part7-set23'], seed['business-interview-star']]);

  // position 생략 → 배열 순서.
  const implicit = await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, {
    contents: [{ content_id: seed['business-interview-star'] }, { content_id: seed['toeic-part7-set23'] }],
  });
  assert.deepEqual(implicit.body.contents.map((c) => [c.content_id, c.position]),
    [[seed['business-interview-star'], 1], [seed['toeic-part7-set23'], 2]]);

  const dup = await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, {
    contents: [{ content_id: seed['toeic-part7-set23'], position: 1 }, { content_id: seed['toeic-part7-set23'], position: 2 }],
  });
  assert.equal(dup.status, 400);
  const missing = await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, {
    contents: [{ content_id: 99999999, position: 1 }],
  });
  assert.equal(missing.status, 404);
  assert.equal((await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: 'x' })).status, 400);
  assert.equal((await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: [{ content_id: 0 }] })).status, 400);
  // 실패한 PUT 은 기존 구성을 건드리지 않는다.
  const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM topic_contents WHERE topic_id = $1`, [topic.id]);
  assert.equal(n, 2);

  // 빈 배열은 전부 비운다. learner 는 403.
  assert.equal((await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: [] })).body.topic.content_count, 0);
  assert.equal((await api('learner', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: [] })).status, 403);
});

it('eligible 은 학습자 topic.service.topicDto 와 같은 값이다 (레슨 3 · 시나리오 1 · 단어 20)', async () => {
  const topic = await createTopic('author', { label_ko: `${tag} eligible` });
  // 임계치 미달(레슨 2) — false.
  const partial = await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: fullSet().slice(1) });
  assert.equal(partial.body.topic.lesson_count, 2);
  assert.equal(partial.body.topic.eligible, false);
  // 정확히 채움 — true.
  const full = await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: fullSet() });
  assert.equal(full.body.topic.lesson_count, ELIGIBLE_THRESHOLDS.lesson);
  assert.equal(full.body.topic.scenario_count, ELIGIBLE_THRESHOLDS.scenario);
  assert.equal(full.body.topic.vocab_count, ELIGIBLE_THRESHOLDS.vocab);
  assert.equal(full.body.topic.content_count, 5);
  assert.equal(full.body.topic.eligible, true);

  // 학습자 경로와 비교하려면 토픽이 discoverable 이어야 한다 — reviewer 가 공개한다.
  assert.equal((await api('reviewer', 'POST', `/api/admin/topics/${topic.id}/status`, { to: 'published' })).status, 200);
  assert.equal((await api('reviewer', 'POST', `/api/admin/topics/${topic.id}/visibility`, { to: 'public' })).status, 200);

  const compare = async () => {
    const admin = (await api('admin', 'GET', `/api/admin/topics/${topic.id}`)).body.topic;
    const learner = (await learnerListTopics(users.learner)).find((t) => t.id === topic.id);
    assert.ok(learner, '공개된 토픽은 학습자 목록에 있어야 한다');
    for (const key of ['lesson_count', 'scenario_count', 'vocab_count', 'eligible']) {
      assert.equal(admin[key], learner[key], key);
    }
    return admin.eligible;
  };
  assert.equal(await compare(), true);
  // 레슨 하나를 빼면 두 경로가 함께 false 로 떨어진다.
  await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: fullSet().slice(1) });
  assert.equal(await compare(), false);

  // 목록도 같은 행 모양 + 임계치를 실어 준다.
  const list = await api('author', 'GET', `/api/admin/topics?q=${encodeURIComponent(tag)}`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.thresholds, ELIGIBLE_THRESHOLDS);
  assert.deepEqual(list.body.statuses, ['draft', 'review', 'published', 'archived']);
  const row = list.body.topics.find((t) => t.id === topic.id);
  assert.equal(row.eligible, false);
  assert.equal(row.status, 'published');
  assert.ok(list.body.total >= 1);
});

it('상태 전이는 전이표를 따른다 — author draft→published 403 · reviewer 200 · published→draft 409', async () => {
  const topic = await createTopic('author');
  const path = `/api/admin/topics/${topic.id}/status`;
  const forbidden = await api('author', 'POST', path, { to: 'published' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.code, 'FORBIDDEN');
  // author 는 draft → review 까지.
  const toReview = await api('author', 'POST', path, { to: 'review', note: '검수 요청' });
  assert.equal(toReview.status, 200);
  assert.equal(toReview.body.topic.status, 'review');
  assert.equal(toReview.body.audit_logged, false, '토픽 감사 테이블이 없음을 응답이 명시한다');
  assert.equal((await api('author', 'POST', path, { to: 'published' })).status, 403);
  const published = await api('reviewer', 'POST', path, { to: 'published' });
  assert.equal(published.status, 200);
  assert.equal(published.body.topic.status, 'published');
  assert.equal(published.body.topic.visibility, 'private', '전이는 가시성을 건드리지 않는다');
  assert.equal(published.body.topic.updated_by, users.reviewer.id);
  const conflict = await api('admin', 'POST', path, { to: 'draft' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'CONFLICT');
  // 같은 상태 재전송도 409(전이표에 없는 조합).
  assert.equal((await api('admin', 'POST', path, { to: 'published' })).status, 409);
  // learner 는 상태를 보기 전에 403 — 표에 없는 전이라도 라우트 경계가 먼저다.
  assert.equal((await api('learner', 'POST', path, { to: 'archived' })).status, 403);
  assert.equal((await api('admin', 'POST', path, { to: 'nope' })).status, 400);
  assert.equal((await api('admin', 'POST', `/api/admin/topics/999999/status`, { to: 'review' })).status, 404);
});

it('공개 여닫기 — draft→public 409 · author 403 · published 200 · 같은 값 409 · archived 는 public 유지', async (t) => {
  const topic = await createTopic('author');
  const vis = `/api/admin/topics/${topic.id}/visibility`;
  const status = `/api/admin/topics/${topic.id}/status`;
  // 상태를 먼저 본다: draft 를 public 으로 올리는 것은 누가 해도 409.
  assert.equal((await api('admin', 'POST', vis, { to: 'public' })).status, 409);
  assert.equal((await api('reviewer', 'POST', status, { to: 'published' })).status, 200);
  // 전이가 있고 권한만 없으면 403.
  assert.equal((await api('author', 'POST', vis, { to: 'public' })).status, 403);
  const opened = await api('reviewer', 'POST', vis, { to: 'public' });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.topic.visibility, 'public');
  assert.equal(opened.body.audit_logged, false);
  assert.equal((await api('reviewer', 'POST', vis, { to: 'public' })).status, 409, '이미 public');
  assert.equal((await api('reviewer', 'POST', vis, { to: 'nope' })).status, 400);

  // published+public → archived: topics_public_ck 가 0019(후보 A)로 교체돼 있어야 통과한다.
  const { rows: [ck] } = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'topics_public_ck'`);
  if (!ck || !/archived/.test(ck.def)) {
    t.skip('0019_topics_archived_public 미적용 — archived+public 케이스는 건너뛴다');
    return;
  }
  const archived = await api('reviewer', 'POST', status, { to: 'archived' });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.equal(archived.body.topic.status, 'archived');
  assert.equal(archived.body.topic.visibility, 'public', '내려도 가시성은 그대로다(후보 A)');
  // 내린 토픽은 학습자 목록(discoverable)에서 빠진다.
  assert.equal((await learnerListTopics(users.learner)).some((x) => x.id === topic.id), false);
  // 다시 올리면 원래 보이던 대로 돌아온다.
  assert.equal((await api('reviewer', 'POST', status, { to: 'published' })).status, 200);
  assert.equal((await learnerListTopics(users.learner)).some((x) => x.id === topic.id), true);
});

it('학습자 listTopics 는 draft 토픽을 보여주지 않는다 — 만든 사람에게도', async () => {
  const topic = await createTopic('author', { label_ko: `${tag} 초안` });
  await api('author', 'PUT', `/api/admin/topics/${topic.id}/contents`, { contents: fullSet() });
  for (const who of ['learner', 'author', 'admin']) {
    assert.equal((await learnerListTopics(users[who])).some((x) => x.id === topic.id), false, who);
  }
  // 관리 목록에는 있다.
  const list = await api('author', 'GET', `/api/admin/topics?q=${encodeURIComponent(`${tag} 초안`)}`);
  assert.equal(list.body.topics.length, 1);
  assert.equal(list.body.topics[0].id, topic.id);
  assert.equal(list.body.topics[0].eligible, true, '초안이어도 구성 집계는 계산된다(배지 재료)');
});
