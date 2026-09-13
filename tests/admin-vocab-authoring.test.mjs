// 단어 세트 저작 API — 읽기·생성·수정 (플랜 14 Phase D · §1 D1·D2·D4~D7).
//
// tests/admin-authoring.test.mjs 의 하네스를 복제한다 — 라우트까지 통과시켜 역할 경계(learner 403)와 422 의 응답
// 모양(validation_errors)을 본다. 시드 세트(business-interview-core-20, published/public)를 고치는 테스트는
// 스냅샷을 떠서 되돌린다 — 재시드가 curated 행을 건너뛰어(플랜 13 결정 5) 시드 스크립트로는 원복이 안 된다.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { config } from '../api/config.js';
import { sendError } from '../api/lib/respond.js';
import { Router } from '../api/router.js';
import { registerAdminRoutes } from '../api/routes/admin.routes.js';
import {
  createVocabSet, normalizeVocabSetInput, readVocabSet, updateVocabSet,
} from '../api/services/admin-authoring.service.js';
import { saveGeneratedVocabSet, validateGeneratedVocabSet } from '../api/services/ai-job.service.js';
import { createSession } from '../api/services/auth.service.js';
import { addVocabSetToCards } from '../api/services/topic.service.js';
import { cleanupReviewFixtures, createReviewContent, createReviewUser } from '../scripts/lib/draft-review-fixtures.mjs';
import { closeDb, pool, setupDb } from './helpers/db.mjs';

const SEED_SLUG = 'business-interview-core-20';
const LESSON_SEED_SLUG = 'toeic-lc-short-conversation-1';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const tag = `uva-${Date.now()}`;
const users = {};
const tokens = {};
let seedId;
let lessonSeedId;
let snapshot;
const originalAutologin = config.devAutologin;

// 검증기를 통과하는 세트 한 벌(3단어 — 20 이 아닌 것은 화면 경고이고 서버는 막지 않는다).
const word = (w, meaning, extra = {}) => ({ word: w, pos: 'n.', ipa: '', meaning_ko: meaning, example_en: '', example_ko: '', difficulty: 3, ...extra });
const payload = (title = `${tag} Vocab`) => ({
  title, description: '회의 준비에 자주 쓰는 표현입니다.', difficulty: 2,
  words: [
    word(`${tag}-agenda`, '의제', { pos: 'n.', ipa: '/əˈdʒendə/', example_en: 'Please review the agenda.', example_ko: '의제를 검토해 주세요.', difficulty: 2 }),
    word(`${tag}-Postpone`, '연기하다', { pos: 'v.' }),
    word(`${tag}-minutes`, '회의록'),
  ],
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
const counts = async () => ({
  contents: await count('content_items'), details: await count('vocab_set_details'),
  pool: await count('vocab_words'), cards: await count('user_vocab_cards'),
});
const auditOf = async (id) => (await pool.query(
  `SELECT action, from_status, to_status, note, actor_id FROM content_audit_log WHERE content_id = $1 ORDER BY id`, [id],
)).rows;
const is = (status, code) => (err) => err.status === status && (!code || err.code === code);

async function snapshotVocabSet(id) {
  const { rows: [content] } = await pool.query(
    `SELECT title, description, difficulty, source, updated_by, updated_at::text AS updated_at FROM content_items WHERE id = $1`, [id],
  );
  const { rows: [detail] } = await pool.query(`SELECT words FROM vocab_set_details WHERE content_id = $1`, [id]);
  return { id, content, detail };
}

async function restoreVocabSet(s) {
  await pool.query(
    `UPDATE content_items SET title = $1, description = $2, difficulty = $3, source = $4, updated_by = $5, updated_at = $6::timestamptz WHERE id = $7`,
    [s.content.title, s.content.description, s.content.difficulty, s.content.source, s.content.updated_by, s.content.updated_at, s.id],
  );
  await pool.query(`UPDATE vocab_set_details SET words = $1::jsonb WHERE content_id = $2`, [JSON.stringify(s.detail.words), s.id]);
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
  assert.ok(row, `시드 단어 세트(${SEED_SLUG})가 없다 — db/content/vocab-sets.json 확인`);
  seedId = row.id;
  const { rows: [lesson] } = await pool.query(`SELECT id FROM content_items WHERE slug = $1`, [LESSON_SEED_SLUG]);
  lessonSeedId = lesson.id;
  snapshot = await snapshotVocabSet(seedId);
});

after(async () => {
  config.devAutologin = originalAutologin;
  try {
    if (snapshot) await restoreVocabSet(snapshot);
    await cleanupReviewFixtures(tag);
  } finally {
    await closeDb();
  }
});

describe('검증기 — validateGeneratedVocabSet (생성·저작 공용)', () => {
  it('저작(expectedCount 없음)은 1~50 · 빈 word/meaning_ko · lower(trim) 중복(뒤에 나온 쪽)을 문구 그대로 지목한다', () => {
    assert.deepEqual(validateGeneratedVocabSet(payload()), []);
    assert.deepEqual(validateGeneratedVocabSet({ title: '', words: [] }), ['title이 비어 있습니다.', 'words 는 1~50개여야 합니다.']);
    assert.deepEqual(validateGeneratedVocabSet({ title: 't', words: Array.from({ length: 51 }, (_, i) => word(`w${i}`, 'm')) }),
      ['words 는 1~50개여야 합니다.']);
    assert.deepEqual(validateGeneratedVocabSet({
      title: 't',
      words: [word('deadline', '마감'), word(' Deadline ', ''), word('', '뜻'), word('DEADLINE', '또 중복')],
    }), [
      'words[1].meaning_ko 가 비어 있습니다.', 'words[1].word 가 다른 단어와 중복됩니다.',
      'words[2].word 가 비어 있습니다.', 'words[3].word 가 다른 단어와 중복됩니다.',
    ]);
    // words 가 배열이 아니어도 던지지 않는다.
    assert.deepEqual(validateGeneratedVocabSet({ title: 't' }), ['words 는 1~50개여야 합니다.']);
  });

  it('생성(expectedCount 20)은 개수 문구가 다르다', () => {
    const words = (n) => Array.from({ length: n }, (_, i) => word(`w${i}`, `뜻 ${i}`));
    assert.deepEqual(validateGeneratedVocabSet({ title: 't', words: words(20) }, { expectedCount: 20 }), []);
    assert.deepEqual(validateGeneratedVocabSet({ title: 't', words: words(19) }, { expectedCount: 20 }), ['words 는 20개여야 합니다.']);
    assert.deepEqual(validateGeneratedVocabSet({ title: 't', words: words(3) }, { expectedCount: 20 }), ['words 는 20개여야 합니다.']);
  });

  it('생성 경로(saveGeneratedVocabSet)는 같은 검증기로 502 VALIDATION_FAILED 를 던지고 예전 문구를 유지한다', async () => {
    const job = { id: 0, user_id: users.author.id, input: { publish_target: 'catalog' } };
    const before = await counts();
    await assert.rejects(saveGeneratedVocabSet(job, payload()), (err) => is(502, 'VALIDATION_FAILED')(err)
      && err.message.includes('생성된 단어 세트는 중복 없는 단어 20개여야 합니다.')
      && err.message.includes('words 는 20개여야 합니다.')
      && err.extra.validation_errors.length === 1);
    assert.deepEqual(await counts(), before);
  });
});

describe('생성 — POST /api/admin/contents/vocab_set', () => {
  it('author 가 만들면 201 · { vocab_set } · draft/private/curated · description 저장 · 대소문자 보존 · 풀 무등록 · 감사 create 1행', async () => {
    const body = payload();
    const before = await counts();
    const { status, body: res } = await call('POST', '/api/admin/contents/vocab_set', {
      as: 'author', body: { ...body, status: 'published', visibility: 'public', source: 'seed' },
    });
    assert.equal(status, 201, JSON.stringify(res));
    assert.equal(res.ok, true);
    assert.ok(res.vocab_set && !('lesson' in res) && !('scenario' in res), '응답 키는 { vocab_set } 다');
    const set = res.vocab_set;
    assert.equal(set.type, 'vocab_set');
    assert.deepEqual([set.status, set.visibility, set.source], ['draft', 'private', 'curated']);
    assert.equal(set.created_by, users.author.id);
    assert.equal(set.description, body.description);
    assert.equal(set.difficulty, 2);
    assert.match(set.slug, SLUG_RE);
    assert.equal(set.slug, `${tag}-vocab`);
    assert.deepEqual(set.words, body.words);   // 7 키 전부 · 순서 · 대소문자(Postpone) 그대로
    assert.equal(set.words[1].word, `${tag}-Postpone`);
    assert.ok(set.created_at && set.updated_at && 'created_by_name' in set && 'updated_by_name' in set);

    const { rows: [db] } = await pool.query(
      `SELECT c.status, c.visibility, c.source, c.description, vd.words
         FROM content_items c JOIN vocab_set_details vd ON vd.content_id = c.id WHERE c.id = $1`, [set.id],
    );
    assert.deepEqual([db.status, db.visibility, db.source, db.description], ['draft', 'private', 'curated', body.description]);
    assert.deepEqual(db.words, body.words);
    // 풀(vocab_words)·카드는 건드리지 않는다 — 등록은 학습자 '담기' 의 일이다.
    assert.deepEqual(await counts(), { ...before, contents: before.contents + 1, details: before.details + 1 });
    assert.deepEqual(await auditOf(set.id), [{
      action: 'create', from_status: null, to_status: 'draft', note: '', actor_id: users.author.id,
    }]);
  });

  it('행의 선택 필드를 빼면 빈 문자열·난도 3 으로 채우고 모르는 키는 버린다 · difficulty·description 기본값', async () => {
    const { vocab_set: set } = await createVocabSet(users.reviewer, {
      title: `${tag} minimal`, words: [{ word: 'briefing', meaning_ko: '브리핑', synonyms: ['x'], id: 9 }],
    });
    assert.deepEqual(set.words, [{ word: 'briefing', pos: '', ipa: '', meaning_ko: '브리핑', example_en: '', example_ko: '', difficulty: 3 }]);
    assert.deepEqual([set.difficulty, set.description], [3, '']);
  });

  it('meaning_ko 빈 행 + lower 중복이면 422 + 문구 정확히, DB 는 변하지 않는다', async () => {
    const before = await counts();
    const body = payload();
    body.words[1] = word(`${tag}-AGENDA`, '');
    const { status, body: res } = await call('POST', '/api/admin/contents/vocab_set', { as: 'author', body });
    assert.equal(status, 422, JSON.stringify(res));
    assert.deepEqual(res, {
      ok: false, code: 'VALIDATION_FAILED', error: '검증에 걸린 항목이 2건 있습니다.',
      validation_errors: ['words[1].meaning_ko 가 비어 있습니다.', 'words[1].word 가 다른 단어와 중복됩니다.'],
    });
    assert.deepEqual(await counts(), before);
  });

  it('words 0개 · title 빈 값은 400 이 아니라 422 다', async () => {
    const { status, body } = await call('POST', '/api/admin/contents/vocab_set', {
      as: 'author', body: { title: '', words: [] },
    });
    assert.equal(status, 422, JSON.stringify(body));
    assert.deepEqual(body.validation_errors, ['title이 비어 있습니다.', 'words 는 1~50개여야 합니다.']);
    await assert.rejects(createVocabSet(users.author, { ...payload(), words: undefined }), (err) => is(422)(err)
      && err.extra.validation_errors.includes('words 는 1~50개여야 합니다.'));
  });

  it('형태가 깨진 본문은 400 이다', () => {
    const cases = [
      ['title 비문자열', (p) => { p.title = 42; }],
      ['description 501자', (p) => { p.description = 'a'.repeat(501); }],
      ['difficulty 범위 밖', (p) => { p.difficulty = 6; }],
      ['words 비배열', (p) => { p.words = { word: 'x' }; }],
      ['words 61개', (p) => { p.words = Array.from({ length: 61 }, (_, i) => word(`w${i}`, 'm')); }],
      ['행 비객체', (p) => { p.words[0] = 'agenda'; }],
      ['word 비문자열', (p) => { p.words[0].word = 1; }],
      ['word 65자', (p) => { p.words[0].word = 'a'.repeat(65); }],
      ['pos 17자', (p) => { p.words[0].pos = 'a'.repeat(17); }],
      ['ipa 65자', (p) => { p.words[0].ipa = 'a'.repeat(65); }],
      ['meaning_ko 201자', (p) => { p.words[0].meaning_ko = 'a'.repeat(201); }],
      ['example_en 401자', (p) => { p.words[0].example_en = 'a'.repeat(401); }],
      ['example_ko 401자', (p) => { p.words[0].example_ko = 'a'.repeat(401); }],
      ['행 difficulty 범위 밖', (p) => { p.words[0].difficulty = 0; }],
    ];
    for (const [label, mutate] of cases) {
      const p = payload();
      mutate(p);
      assert.throws(() => normalizeVocabSetInput(p), is(400, 'BAD_REQUEST'), label);
    }
    assert.throws(() => normalizeVocabSetInput(null), is(400));
    assert.throws(() => normalizeVocabSetInput([]), is(400));
    assert.deepEqual(Object.keys(normalizeVocabSetInput({ ...payload(), status: 'published' })).sort(),
      ['description', 'difficulty', 'title', 'words']);
  });

  it('slug 는 제목에서 만들고 충돌이면 -2, 한국어 제목은 vocab-set- 폴백이다', async () => {
    const a = await createVocabSet(users.author, payload(`${tag} Slug Test`));
    const b = await createVocabSet(users.author, payload(`${tag} Slug Test`));
    assert.equal(a.vocab_set.slug, `${tag}-slug-test`);
    assert.equal(b.vocab_set.slug, `${tag}-slug-test-2`);
    const ko = await createVocabSet(users.author, payload('회의 준비 단어'));
    assert.match(ko.vocab_set.slug, /^vocab-set-\d+$/);
  });
});

describe('읽기 — GET /api/admin/contents/vocab_set/:id', () => {
  it('200 이고 words 배열과 목록 메타를 싣는다', async () => {
    const { status, body } = await call('GET', `/api/admin/contents/vocab_set/${seedId}`, { as: 'author' });
    assert.equal(status, 200, JSON.stringify(body));
    const set = body.vocab_set;
    assert.equal(set.slug, SEED_SLUG);
    assert.equal(set.type, 'vocab_set');
    assert.ok(Array.isArray(set.words) && set.words.length === 20);
    assert.ok(set.words.every((w) => w.word && w.meaning_ko));
    for (const key of ['id', 'slug', 'title', 'description', 'difficulty', 'status', 'visibility', 'source',
      'created_at', 'updated_at', 'created_by', 'updated_by', 'created_by_name', 'updated_by_name']) {
      assert.ok(key in set, `read DTO 에 ${key} 가 없다`);
    }
  });

  it('다른 유형의 id(레슨) · 없는 id 는 404 · 형태가 깨진 id 는 400', async () => {
    for (const id of [lessonSeedId, 999999999]) {
      const read = await call('GET', `/api/admin/contents/vocab_set/${id}`, { as: 'admin' });
      assert.equal(read.status, 404, `GET ${id}: ${JSON.stringify(read.body)}`);
      assert.equal(read.body.code, 'NOT_FOUND');
      assert.equal(read.body.error, '단어 세트를 찾을 수 없습니다.');
      const patched = await call('PATCH', `/api/admin/contents/vocab_set/${id}`, { as: 'admin', body: payload() });
      assert.equal(patched.status, 404, `PATCH ${id}`);
    }
    assert.equal((await call('GET', '/api/admin/contents/vocab_set/abc', { as: 'admin' })).status, 400);
    await assert.rejects(readVocabSet(lessonSeedId), is(404, 'NOT_FOUND'));
  });
});

describe('수정 — PATCH /api/admin/contents/vocab_set/:id', () => {
  it('published 시드를 author 가 고치면 403 · 무변경 (검수 게이트 우회 방지)', async () => {
    const { vocab_set: before } = await readVocabSet(seedId);
    assert.deepEqual([before.status, before.visibility, before.source], ['published', 'public', 'seed']);
    const { status, body } = await call('PATCH', `/api/admin/contents/vocab_set/${seedId}`, { as: 'author', body: payload() });
    assert.equal(status, 403, JSON.stringify(body).slice(0, 200));
    assert.equal(body.code, 'FORBIDDEN');
    assert.deepEqual((await readVocabSet(seedId)).vocab_set, before);
  });

  it('reviewer 가 시드의 words 를 통째로 바꾸면 200 · source seed→curated · 감사 update · 학습자 카드 수 불변', async () => {
    // 학습자가 먼저 시드 세트를 담아 카드를 만든다 — words 교체가 카드(vocab_words 기준)를 건드리지 않아야 한다.
    const added = await addVocabSetToCards(users.learner, seedId);
    assert.equal(added.added, 20);
    const { vocab_set: current } = await readVocabSet(seedId);
    const body = {
      title: current.title, description: `${tag} 설명 수정`, difficulty: 4,
      words: [...current.words.slice(0, 5), word(`${tag}-stakeholder`, '이해관계자', { pos: 'n.' })],
    };
    const before = await counts();
    const { status, body: res } = await call('PATCH', `/api/admin/contents/vocab_set/${seedId}`, { as: 'reviewer', body });
    assert.equal(status, 200, JSON.stringify(res));
    const set = res.vocab_set;
    assert.equal(set.id, seedId);
    assert.equal(set.slug, SEED_SLUG);
    assert.deepEqual([set.source, set.status, set.visibility], ['curated', 'published', 'public']);
    assert.equal(set.updated_by, users.reviewer.id);
    assert.equal(set.description, `${tag} 설명 수정`);
    assert.equal(set.difficulty, 4);
    assert.equal(set.words.length, 6);
    assert.equal(set.words[5].word, `${tag}-stakeholder`);
    // 시드 행(pos·word·meaning_ko 세 필드)은 저장 모양(7 키)으로 채워져 돌아온다.
    assert.deepEqual(Object.keys(set.words[0]).sort(), ['difficulty', 'example_en', 'example_ko', 'ipa', 'meaning_ko', 'pos', 'word']);
    assert.equal(set.words[0].word, current.words[0].word);
    // 행 수·풀·카드 전부 그대로 — 새 세트를 만든 것도, 풀에 등록한 것도, 카드를 지운 것도 아니다.
    assert.deepEqual(await counts(), before);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM user_vocab_cards WHERE user_id = $1`, [users.learner.id])).rows[0].n, 20);
    assert.deepEqual((await auditOf(seedId)).at(-1), {
      action: 'update', from_status: 'published', to_status: 'published',
      note: 'source seed → curated', actor_id: users.reviewer.id,
    });
  });

  it('draft 세트는 author 도 고칠 수 있고 감사 note 는 비어 있다', async () => {
    const { vocab_set: created } = await createVocabSet(users.author, payload(`${tag} draft edit`));
    const { status, body } = await call('PATCH', `/api/admin/contents/vocab_set/${created.id}`, {
      as: 'author', body: { ...payload(`${tag} draft edited`), words: [word(`${tag}-only`, '하나')] },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.vocab_set.title, `${tag} draft edited`);
    assert.equal(body.vocab_set.words.length, 1);
    assert.deepEqual([body.vocab_set.status, body.vocab_set.source], ['draft', 'curated']);
    assert.deepEqual((await auditOf(created.id)).map((a) => [a.action, a.note]), [['create', ''], ['update', '']]);
  });

  it('ai 세트(review)를 고치면 source 는 ai 로 남고 status 도 그대로다', async () => {
    const ai = await createReviewContent(tag, users.author, { task: 'vocab_set' });
    const { vocab_set: set } = await updateVocabSet(users.author, ai.id, payload(`${tag} ai 수정`));
    assert.deepEqual([set.source, set.status, set.visibility], ['ai', 'review', 'private']);
    assert.equal(set.words.length, 3);
  });

  it('검증에 걸린 수정은 아무것도 바꾸지 않는다', async () => {
    const { vocab_set: current } = await readVocabSet(seedId);
    const body = payload();
    body.words[2] = word(`${tag}-agenda`, '중복');
    const { status, body: res } = await call('PATCH', `/api/admin/contents/vocab_set/${seedId}`, { as: 'reviewer', body });
    assert.equal(status, 422);
    assert.deepEqual(res.validation_errors, ['words[2].word 가 다른 단어와 중복됩니다.']);
    assert.deepEqual((await readVocabSet(seedId)).vocab_set, current);
  });
});

describe('권한', () => {
  it('learner 는 GET/POST/PATCH 전부 403 이고 아무것도 바꾸지 않는다 · 쿠키 없음은 401', async () => {
    const before = await counts();
    const { vocab_set: current } = await readVocabSet(seedId);
    const attempts = [
      ['GET', `/api/admin/contents/vocab_set/${seedId}`],
      ['POST', '/api/admin/contents/vocab_set', payload()],
      ['PATCH', `/api/admin/contents/vocab_set/${seedId}`, payload()],
    ];
    for (const [method, path, body] of attempts) {
      const r = await call(method, path, { as: 'learner', body });
      assert.equal(r.status, 403, `${method} ${path}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, 'FORBIDDEN');
    }
    assert.deepEqual(await counts(), before);
    assert.deepEqual((await readVocabSet(seedId)).vocab_set, current);
    assert.equal((await call('GET', `/api/admin/contents/vocab_set/${seedId}`)).status, 401);
  });
});
