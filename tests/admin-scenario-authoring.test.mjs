// 회화 시나리오 저작 API — 읽기·생성·수정 (플랜 14 Phase D · §1 D1~D3·D5·D7).
//
// tests/admin-authoring.test.mjs 의 하네스를 복제한다 — 라우트까지 통과시켜 역할 경계(learner 403)와 422 의 응답
// 모양(validation_errors)을 본다. 시드 시나리오(business-interview-star, published/public)를 고치는 테스트는
// 스냅샷을 떠서 되돌린다 — 재시드가 curated 행을 건너뛰어(플랜 13 결정 5) 시드 스크립트로는 원복이 안 된다.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { config } from '../api/config.js';
import { sendError } from '../api/lib/respond.js';
import { Router } from '../api/router.js';
import { registerAdminRoutes } from '../api/routes/admin.routes.js';
import {
  createScenario, normalizeScenarioInput, readScenario, updateScenario,
} from '../api/services/admin-authoring.service.js';
import { saveGeneratedScenario, validateGeneratedScenario } from '../api/services/ai-job.service.js';
import { createSession } from '../api/services/auth.service.js';
import { listScenarios } from '../api/services/topic.service.js';
import { cleanupReviewFixtures, createReviewContent, createReviewUser } from '../scripts/lib/draft-review-fixtures.mjs';
import { closeDb, pool, setupDb } from './helpers/db.mjs';

const SEED_SLUG = 'business-interview-star';
const LESSON_SEED_SLUG = 'toeic-lc-short-conversation-1';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const tag = `usa-${Date.now()}`;
const users = {};
const tokens = {};
let seedId;
let lessonSeedId;
let snapshot;
const originalAutologin = config.devAutologin;

// 검증기를 통과하는 회화 한 벌. 테스트마다 한 군데씩 깨뜨려 422 를 본다.
const payload = (title = `${tag} Scenario`) => ({
  title, description: '회의실 예약을 요청하고 확인하는 연습입니다.', tag: 'OFFICE', difficulty: 2,
  system_prompt: 'You are a friendly office manager. Help the learner reserve a meeting room.',
  opening_message: 'Hi! Which day would you like to book the meeting room for?',
  objectives: ['날짜와 시간을 요청한다', '예약을 확인한다', '변경을 요청한다'],
});

const router = new Router();
registerAdminRoutes(router);

async function call(method, path, { as, body } = {}) {
  const url = new URL(path, 'http://localhost');
  const matched = router.match(method, url.pathname);
  assert.ok(matched, `라우트가 없다: ${method} ${path}`);
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = path;
  req.headers = { host: 'localhost', ...(as ? { cookie: `${config.cookieName}=${tokens[as]}` } : {}) };
  const res = {
    writableEnded: false, statusCode: 0, body: null,
    setHeader() {},
    writeHead(status) { this.statusCode = status; },
    end(payload) { this.body = payload ? JSON.parse(payload) : null; this.writableEnded = true; },
  };
  try {
    await matched.handler(req, res, { params: matched.params, query: url.searchParams });
  } catch (err) {
    sendError(res, err);
  }
  return { status: res.statusCode, body: res.body };
}

const count = async (table) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const counts = async () => ({ contents: await count('content_items'), details: await count('scenario_details') });
const auditOf = async (id) => (await pool.query(
  `SELECT action, from_status, to_status, note, actor_id FROM content_audit_log WHERE content_id = $1 ORDER BY id`, [id],
)).rows;
const is = (status, code) => (err) => err.status === status && (!code || err.code === code);

async function snapshotScenario(id) {
  const { rows: [content] } = await pool.query(
    `SELECT title, description, difficulty, source, updated_by, updated_at::text AS updated_at FROM content_items WHERE id = $1`, [id],
  );
  const { rows: [detail] } = await pool.query(
    `SELECT tag, level, system_prompt, opening_message, objectives FROM scenario_details WHERE content_id = $1`, [id],
  );
  return { id, content, detail };
}

async function restoreScenario(s) {
  await pool.query(
    `UPDATE content_items SET title = $1, description = $2, difficulty = $3, source = $4, updated_by = $5, updated_at = $6::timestamptz WHERE id = $7`,
    [s.content.title, s.content.description, s.content.difficulty, s.content.source, s.content.updated_by, s.content.updated_at, s.id],
  );
  await pool.query(
    `UPDATE scenario_details SET tag = $1, level = $2, system_prompt = $3, opening_message = $4, objectives = $5::jsonb WHERE content_id = $6`,
    [s.detail.tag, s.detail.level, s.detail.system_prompt, s.detail.opening_message, JSON.stringify(s.detail.objectives), s.id],
  );
  await pool.query(
    `DELETE FROM content_audit_log WHERE content_id = $1 AND actor_id IN (SELECT id FROM users WHERE email LIKE $2)`,
    [s.id, `${tag}-%@test.dev`],
  );
}

before(async () => {
  await setupDb();
  config.devAutologin = false;
  for (const role of ['learner', 'author', 'reviewer', 'admin']) {
    users[role] = await createReviewUser(tag, role);
    tokens[role] = (await createSession(users[role].id, { userAgent: 'test' })).token;
  }
  const { rows: [row] } = await pool.query(`SELECT id FROM content_items WHERE slug = $1`, [SEED_SLUG]);
  assert.ok(row, `시드 시나리오(${SEED_SLUG})가 없다 — db/content/scenarios.json 확인`);
  seedId = row.id;
  const { rows: [lesson] } = await pool.query(`SELECT id FROM content_items WHERE slug = $1`, [LESSON_SEED_SLUG]);
  lessonSeedId = lesson.id;
  snapshot = await snapshotScenario(seedId);
});

after(async () => {
  config.devAutologin = originalAutologin;
  try {
    if (snapshot) await restoreScenario(snapshot);
    await cleanupReviewFixtures(tag);
  } finally {
    await closeDb();
  }
});

describe('검증기 — validateGeneratedScenario (생성·저작 공용)', () => {
  it('통과하는 본문은 오류 0 이고 문구는 플랜 14 §3 표 그대로다', () => {
    assert.deepEqual(validateGeneratedScenario(payload()), []);
    assert.deepEqual(validateGeneratedScenario({
      title: '  ', system_prompt: '', opening_message: null, objectives: ['a'],
    }), [
      'title이 비어 있습니다.', 'system_prompt 가 비어 있습니다.', 'opening_message 가 비어 있습니다.',
      'objectives 는 2~5개여야 합니다.',
    ]);
    assert.deepEqual(validateGeneratedScenario({ ...payload(), objectives: ['첫째', '  ', '셋째', '', '다섯', '여섯'] }), [
      'objectives 는 2~5개여야 합니다.', 'objectives[1] 이 비어 있습니다.', 'objectives[3] 이 비어 있습니다.',
    ]);
    // objectives 가 배열이 아니어도 던지지 않고 개수 오류로 답한다 — 생성 경로가 TypeError 로 죽지 않게.
    assert.deepEqual(validateGeneratedScenario({ ...payload(), objectives: undefined }), ['objectives 는 2~5개여야 합니다.']);
  });

  it('생성 경로(saveGeneratedScenario)는 같은 검증기로 502 VALIDATION_FAILED 를 던지고 예전 문구를 유지한다', async () => {
    const job = { id: 0, user_id: users.author.id, input: { difficulty: 3, publish_target: 'catalog' } };
    const before = await counts();
    await assert.rejects(saveGeneratedScenario(job, { ...payload(), objectives: ['하나'] }), (err) => is(502, 'VALIDATION_FAILED')(err)
      && err.message.includes('생성된 회화 시나리오의 필수 내용이 부족합니다.')
      && err.message.includes('objectives 는 2~5개여야 합니다.')
      && err.extra.validation_errors.length === 1);
    assert.deepEqual(await counts(), before);
  });
});

describe('생성 — POST /api/admin/contents/scenario', () => {
  it('author 가 만들면 201 · { scenario } · draft/private/curated · description 저장 · level=difficulty · 감사 create 1행', async () => {
    const body = payload();
    const before = await counts();
    const { status, body: res } = await call('POST', '/api/admin/contents/scenario', {
      as: 'author', body: { ...body, status: 'published', visibility: 'public', source: 'seed', level: 5 },
    });
    assert.equal(status, 201, JSON.stringify(res));
    assert.equal(res.ok, true);
    assert.ok(res.scenario && !('lesson' in res) && !('vocab_set' in res), '응답 키는 { scenario } 다');
    const { scenario } = res;
    assert.equal(scenario.type, 'scenario');
    assert.deepEqual([scenario.status, scenario.visibility, scenario.source], ['draft', 'private', 'curated']);
    assert.equal(scenario.created_by, users.author.id);
    assert.equal(scenario.title, body.title);
    assert.equal(scenario.description, body.description);
    assert.equal(scenario.tag, 'OFFICE');
    assert.equal(scenario.difficulty, 2);
    assert.equal(scenario.level, 2);   // 폼 필드 하나 → 두 컬럼 (본문의 level:5 는 읽지 않는다)
    assert.equal(scenario.system_prompt, body.system_prompt);
    assert.equal(scenario.opening_message, body.opening_message);
    assert.deepEqual(scenario.objectives, body.objectives);
    assert.match(scenario.slug, SLUG_RE);
    assert.equal(scenario.slug, `${tag}-scenario`);
    assert.ok(scenario.created_at && scenario.updated_at && 'created_by_name' in scenario && 'updated_by_name' in scenario);

    const { rows: [db] } = await pool.query(
      `SELECT c.status, c.visibility, c.source, c.description, c.difficulty, sd.level, sd.objectives
         FROM content_items c JOIN scenario_details sd ON sd.content_id = c.id WHERE c.id = $1`, [scenario.id],
    );
    assert.deepEqual([db.status, db.visibility, db.source, db.description, db.difficulty, db.level],
      ['draft', 'private', 'curated', body.description, 2, 2]);
    assert.deepEqual(db.objectives, body.objectives);
    assert.deepEqual(await counts(), { contents: before.contents + 1, details: before.details + 1 });
    assert.deepEqual(await auditOf(scenario.id), [{
      action: 'create', from_status: null, to_status: 'draft', note: '', actor_id: users.author.id,
    }]);
  });

  it('tag 를 비우면 AI 회화 · difficulty 를 빼면 3 · description 을 빼면 빈 문자열', async () => {
    const body = payload(`${tag} defaults`);
    delete body.tag; delete body.difficulty; delete body.description;
    const { scenario } = await createScenario(users.reviewer, body);
    assert.deepEqual([scenario.tag, scenario.difficulty, scenario.level, scenario.description], ['AI 회화', 3, 3, '']);
  });

  it('objectives 1개면 422 + validation_errors 정확히 한 줄이고 DB 는 변하지 않는다', async () => {
    const before = await counts();
    const { status, body } = await call('POST', '/api/admin/contents/scenario', {
      as: 'author', body: { ...payload(), objectives: ['하나만'] },
    });
    assert.equal(status, 422, JSON.stringify(body));
    assert.deepEqual(body, {
      ok: false, code: 'VALIDATION_FAILED', error: '검증에 걸린 항목이 1건 있습니다.',
      validation_errors: ['objectives 는 2~5개여야 합니다.'],
    });
    assert.deepEqual(await counts(), before);
  });

  it('title·system_prompt·opening_message 가 비면 400 이 아니라 422 로 한 번에 돌려준다 · objectives[N] 접두', async () => {
    const { status, body } = await call('POST', '/api/admin/contents/scenario', {
      as: 'author', body: { ...payload(''), system_prompt: '   ', opening_message: '', objectives: ['하나', ''] },
    });
    assert.equal(status, 422, JSON.stringify(body));
    assert.deepEqual(body.validation_errors, [
      'title이 비어 있습니다.', 'system_prompt 가 비어 있습니다.', 'opening_message 가 비어 있습니다.',
      'objectives[1] 이 비어 있습니다.',
    ]);
  });

  it('형태가 깨진 본문은 400 이다', () => {
    const cases = [
      ['title 비문자열', (p) => { p.title = 42; }],
      ['title 201자', (p) => { p.title = 'a'.repeat(201); }],
      ['description 501자', (p) => { p.description = 'a'.repeat(501); }],
      ['tag 61자', (p) => { p.tag = 'a'.repeat(61); }],
      ['difficulty 범위 밖', (p) => { p.difficulty = 6; }],
      ['difficulty 0', (p) => { p.difficulty = 0; }],
      ['system_prompt 비문자열', (p) => { p.system_prompt = ['x']; }],
      ['system_prompt 4001자', (p) => { p.system_prompt = 'a'.repeat(4001); }],
      ['opening_message 1001자', (p) => { p.opening_message = 'a'.repeat(1001); }],
      ['objectives 비배열', (p) => { p.objectives = 'a, b'; }],
      ['objectives 11개', (p) => { p.objectives = Array.from({ length: 11 }, (_, i) => `목표 ${i}`); }],
      ['objectives 원소 비문자열', (p) => { p.objectives = ['a', { text: 'b' }]; }],
      ['objectives 원소 201자', (p) => { p.objectives = ['a', 'b'.repeat(201)]; }],
    ];
    for (const [label, mutate] of cases) {
      const p = payload();
      mutate(p);
      assert.throws(() => normalizeScenarioInput(p), is(400, 'BAD_REQUEST'), label);
    }
    assert.throws(() => normalizeScenarioInput(null), is(400));
    assert.throws(() => normalizeScenarioInput([]), is(400));
    // 모르는 키는 버린다.
    assert.deepEqual(Object.keys(normalizeScenarioInput({ ...payload(), level: 5, status: 'published' })).sort(),
      ['description', 'difficulty', 'objectives', 'opening_message', 'system_prompt', 'tag', 'title']);
  });

  it('slug 는 제목에서 만들고 충돌이면 -2, 한국어 제목은 scenario- 폴백이다', async () => {
    const a = await createScenario(users.author, payload(`${tag} Slug Test`));
    const b = await createScenario(users.author, payload(`${tag} Slug Test`));
    assert.equal(a.scenario.slug, `${tag}-slug-test`);
    assert.equal(b.scenario.slug, `${tag}-slug-test-2`);
    const ko = await createScenario(users.author, payload('회의실 예약 회화'));
    assert.match(ko.scenario.slug, /^scenario-\d+$/);
  });
});

describe('읽기 — GET /api/admin/contents/scenario/:id', () => {
  it('200 이고 system_prompt·objectives·tag·level 을 싣는다 — 학습자 listScenarios 는 system_prompt 를 싣지 않는다', async () => {
    const { status, body } = await call('GET', `/api/admin/contents/scenario/${seedId}`, { as: 'author' });
    assert.equal(status, 200, JSON.stringify(body));
    const { scenario } = body;
    assert.equal(scenario.slug, SEED_SLUG);
    assert.equal(scenario.type, 'scenario');
    assert.ok(scenario.system_prompt.length > 10);
    assert.ok(scenario.opening_message.length > 0);
    assert.ok(Array.isArray(scenario.objectives) && scenario.objectives.length >= 2);
    assert.equal(typeof scenario.tag, 'string');
    assert.ok(scenario.level >= 1 && scenario.level <= 5);
    for (const key of ['id', 'slug', 'title', 'description', 'difficulty', 'status', 'visibility', 'source',
      'created_at', 'updated_at', 'created_by', 'updated_by', 'created_by_name', 'updated_by_name']) {
      assert.ok(key in scenario, `read DTO 에 ${key} 가 없다`);
    }
    const visible = (await listScenarios(users.learner)).find((s) => s.id === seedId);
    assert.ok(visible, '시드 시나리오는 학습자에게 보인다');
    assert.equal('system_prompt' in visible, false);
  });

  it('다른 유형의 id(레슨) · 없는 id 는 404 · 형태가 깨진 id 는 400', async () => {
    for (const id of [lessonSeedId, 999999999]) {
      const read = await call('GET', `/api/admin/contents/scenario/${id}`, { as: 'admin' });
      assert.equal(read.status, 404, `GET ${id}: ${JSON.stringify(read.body)}`);
      assert.equal(read.body.code, 'NOT_FOUND');
      assert.equal(read.body.error, '시나리오를 찾을 수 없습니다.');
      const patched = await call('PATCH', `/api/admin/contents/scenario/${id}`, { as: 'admin', body: payload() });
      assert.equal(patched.status, 404, `PATCH ${id}`);
    }
    assert.equal((await call('GET', '/api/admin/contents/scenario/abc', { as: 'admin' })).status, 400);
    await assert.rejects(readScenario(lessonSeedId), is(404, 'NOT_FOUND'));
  });
});

describe('수정 — PATCH /api/admin/contents/scenario/:id', () => {
  it('published 시드를 author 가 고치면 403 · 무변경 (검수 게이트 우회 방지)', async () => {
    const { scenario: before } = await readScenario(seedId);
    assert.deepEqual([before.status, before.visibility, before.source], ['published', 'public', 'seed']);
    const { status, body } = await call('PATCH', `/api/admin/contents/scenario/${seedId}`, { as: 'author', body: payload() });
    assert.equal(status, 403, JSON.stringify(body).slice(0, 200));
    assert.equal(body.code, 'FORBIDDEN');
    assert.deepEqual((await readScenario(seedId)).scenario, before);
  });

  it('reviewer 가 시드를 고치면 200 · source seed→curated · status/visibility 그대로 · level=difficulty · 감사 update', async () => {
    const { scenario: current } = await readScenario(seedId);
    const body = {
      title: current.title, description: `${tag} 설명 수정`, tag: current.tag, difficulty: 4,
      system_prompt: `${current.system_prompt} Keep answers under one minute.`,
      opening_message: current.opening_message,
      objectives: [...current.objectives.slice(0, 2), `${tag} 새 목표`],
    };
    const before = await counts();
    const { status, body: res } = await call('PATCH', `/api/admin/contents/scenario/${seedId}`, { as: 'reviewer', body });
    assert.equal(status, 200, JSON.stringify(res));
    const { scenario } = res;
    assert.equal(scenario.id, seedId);
    assert.equal(scenario.slug, SEED_SLUG);
    assert.deepEqual([scenario.source, scenario.status, scenario.visibility], ['curated', 'published', 'public']);
    assert.equal(scenario.updated_by, users.reviewer.id);
    assert.equal(scenario.description, `${tag} 설명 수정`);
    assert.deepEqual([scenario.difficulty, scenario.level], [4, 4]);
    assert.ok(scenario.system_prompt.endsWith('Keep answers under one minute.'));
    assert.deepEqual(scenario.objectives, body.objectives);
    assert.deepEqual(await counts(), before);
    assert.deepEqual((await auditOf(seedId)).at(-1), {
      action: 'update', from_status: 'published', to_status: 'published',
      note: 'source seed → curated', actor_id: users.reviewer.id,
    });
    // 학습자 목록은 고친 설명·목표를 본다(published+public) — system_prompt 는 여전히 없다.
    const visible = (await listScenarios(users.learner)).find((s) => s.id === seedId);
    assert.equal(visible.description, `${tag} 설명 수정`);
    assert.equal('system_prompt' in visible, false);
  });

  it('draft 시나리오는 author 도 고칠 수 있고 source(curated)·감사 note 는 비어 있다', async () => {
    const { scenario: created } = await createScenario(users.author, payload(`${tag} draft edit`));
    const { status, body } = await call('PATCH', `/api/admin/contents/scenario/${created.id}`, {
      as: 'author', body: { ...payload(`${tag} draft edited`), objectives: ['둘', '셋'] },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.scenario.title, `${tag} draft edited`);
    assert.deepEqual(body.scenario.objectives, ['둘', '셋']);
    assert.deepEqual([body.scenario.status, body.scenario.source], ['draft', 'curated']);
    assert.deepEqual((await auditOf(created.id)).map((a) => [a.action, a.note]), [['create', ''], ['update', '']]);
  });

  it('ai 시나리오(review)를 고치면 source 는 ai 로 남고 status 도 그대로다', async () => {
    const ai = await createReviewContent(tag, users.author, { task: 'scenario_gen' });
    const { scenario } = await updateScenario(users.author, ai.id, payload(`${tag} ai 수정`));
    assert.deepEqual([scenario.source, scenario.status, scenario.visibility], ['ai', 'review', 'private']);
    assert.equal(scenario.title, `${tag} ai 수정`);
  });

  it('검증에 걸린 수정은 아무것도 바꾸지 않는다', async () => {
    const { scenario: current } = await readScenario(seedId);
    const { status, body } = await call('PATCH', `/api/admin/contents/scenario/${seedId}`, {
      as: 'reviewer', body: { ...payload(), objectives: ['하나'] },
    });
    assert.equal(status, 422);
    assert.deepEqual(body.validation_errors, ['objectives 는 2~5개여야 합니다.']);
    assert.deepEqual((await readScenario(seedId)).scenario, current);
  });
});

describe('권한', () => {
  it('learner 는 GET/POST/PATCH 전부 403 이고 아무것도 바꾸지 않는다 · 쿠키 없음은 401', async () => {
    const before = await counts();
    const { scenario: current } = await readScenario(seedId);
    const attempts = [
      ['GET', `/api/admin/contents/scenario/${seedId}`],
      ['POST', '/api/admin/contents/scenario', payload()],
      ['PATCH', `/api/admin/contents/scenario/${seedId}`, payload()],
    ];
    for (const [method, path, body] of attempts) {
      const r = await call(method, path, { as: 'learner', body });
      assert.equal(r.status, 403, `${method} ${path}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, 'FORBIDDEN');
    }
    assert.deepEqual(await counts(), before);
    assert.deepEqual((await readScenario(seedId)).scenario, current);
    assert.equal((await call('GET', `/api/admin/contents/scenario/${seedId}`)).status, 401);
  });
});
