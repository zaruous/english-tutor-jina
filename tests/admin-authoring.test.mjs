// 레슨 저작 API — 읽기·생성·수정 (플랜 13 Phase A · 설계 검토 D2·D3·D6).
//
// 라우트까지 통과시킨다 — 역할 경계(learner 403)와 422 의 응답 모양(validation_errors)은 서비스가 아니라
// 라우트의 일이라 서비스만 부르면 검증되지 않는다. 서버를 띄우지 않고 Router.match → handler 를 server.js 와
// 같은 순서로 직접 부른다(요청은 Readable, 응답은 writeHead/end 를 받는 객체). 세션은 진짜다 —
// createSession 이 발급한 토큰을 쿠키로 싣는다.
//
// 시드 LC 레슨을 고치는 테스트는 pg 드라이버(npm run test:pg)에서 실 DB 를 건드리므로 스냅샷을 떠서 되돌린다.
// 재시드는 curated 행을 건너뛰게 되어(플랜 13 결정 5) 시드 스크립트로는 원복이 되지 않기 때문이다.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { config } from '../api/config.js';
import { sendError } from '../api/lib/respond.js';
import { Router } from '../api/router.js';
import { registerAdminRoutes } from '../api/routes/admin.routes.js';
import {
  createLesson, normalizeLessonInput, readLesson, updateLesson,
} from '../api/services/admin-authoring.service.js';
import { createSession } from '../api/services/auth.service.js';
import { getLesson as learnerGetLesson } from '../api/services/lesson.service.js';
import {
  cleanupReviewFixtures, createReviewContent, createReviewUser,
} from '../scripts/lib/draft-review-fixtures.mjs';
import { closeDb, pool, setupDb } from './helpers/db.mjs';

const SEED_SLUG = 'toeic-lc-short-conversation-1';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const tag = `uau-${Date.now()}`;
const users = {};
const tokens = {};
let seedId;
let snapshot;
const originalAutologin = config.devAutologin;

// 검증기를 통과하는 LC 한 벌. 테스트마다 한 군데씩 깨뜨려 422 를 본다.
const lcPayload = (title = `${tag} LC`) => ({
  title, subtitle: '회의실 예약', difficulty: 3, kind: 'toeic_lc', est_minutes: 4,
  passage: {
    body: [
      { speaker: 'M', text: 'Could I reserve the conference room for tomorrow morning?' },
      { speaker: 'W', text: 'The large room is available after ten in the morning.' },
      { speaker: 'M', text: 'Please reserve it for the weekly planning meeting.' },
      { speaker: 'W', text: 'I will send you a confirmation email right away.' },
    ],
  },
  faq: ['이 대화의 핵심 표현을 정리해 주세요'],
  items: [1, 2, 3].map((n) => ({
    stem: `Question ${n}: What does the man ask for?`,
    options: [
      { id: 'A', text: 'A room reservation' }, { id: 'B', text: 'A lunch order' },
      { id: 'C', text: 'A parking permit' }, { id: 'D', text: 'A new laptop' },
    ],
    answer: 'A', explanation: '(A) 남자가 회의실 예약을 요청한다.', skill_code: 'detail',
  })),
});

const router = new Router();
registerAdminRoutes(router);

// server.js 의 디스패치와 같은 순서 — match → handler → 실패는 sendError.
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
  contents: await count('content_items'), details: await count('lesson_details'), items: await count('lesson_items'),
});
const auditOf = async (id) => (await pool.query(
  `SELECT action, from_status, to_status, note, actor_id FROM content_audit_log WHERE content_id = $1 ORDER BY id`, [id],
)).rows;
const is = (status, code) => (err) => err.status === status && (!code || err.code === code);

async function snapshotLesson(id) {
  const { rows: [content] } = await pool.query(
    `SELECT title, difficulty, source, updated_by, updated_at::text AS updated_at FROM content_items WHERE id = $1`, [id],
  );
  const { rows: [detail] } = await pool.query(
    `SELECT kind, subtitle, est_minutes, passage, vocab, faq FROM lesson_details WHERE content_id = $1`, [id],
  );
  const { rows: items } = await pool.query(
    `SELECT position, stem, options, answer, explanation, skill_code FROM lesson_items WHERE content_id = $1 ORDER BY position`, [id],
  );
  return { id, content, detail, items };
}

async function restoreLesson(s) {
  await pool.query(
    `UPDATE content_items SET title = $1, difficulty = $2, source = $3, updated_by = $4, updated_at = $5::timestamptz WHERE id = $6`,
    [s.content.title, s.content.difficulty, s.content.source, s.content.updated_by, s.content.updated_at, s.id],
  );
  await pool.query(
    `UPDATE lesson_details SET kind = $1, subtitle = $2, est_minutes = $3, passage = $4::jsonb, vocab = $5::jsonb, faq = $6::jsonb
      WHERE content_id = $7`,
    [s.detail.kind, s.detail.subtitle, s.detail.est_minutes, JSON.stringify(s.detail.passage),
      JSON.stringify(s.detail.vocab), JSON.stringify(s.detail.faq), s.id],
  );
  await pool.query(`DELETE FROM lesson_items WHERE content_id = $1`, [s.id]);
  for (const it of s.items) {
    await pool.query(
      `INSERT INTO lesson_items (content_id, position, stem, options, answer, explanation, skill_code)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [s.id, it.position, it.stem, JSON.stringify(it.options), it.answer, it.explanation, it.skill_code],
    );
  }
  await pool.query(
    `DELETE FROM content_audit_log WHERE content_id = $1 AND actor_id IN (SELECT id FROM users WHERE email LIKE $2)`,
    [s.id, `${tag}-%@test.dev`],
  );
}

before(async () => {
  await setupDb();
  // DEV_AUTOLOGIN 이 켜져 있으면 쿠키 없는 요청이 시드 계정으로 로그인된다 — 401 단정이 실 DB 에서 뒤집힌다.
  config.devAutologin = false;
  for (const role of ['learner', 'author', 'reviewer', 'admin']) {
    users[role] = await createReviewUser(tag, role);
    tokens[role] = (await createSession(users[role].id, { userAgent: 'test' })).token;
  }
  const { rows: [row] } = await pool.query(`SELECT id FROM content_items WHERE slug = $1`, [SEED_SLUG]);
  assert.ok(row, `시드 LC 레슨(${SEED_SLUG})이 없다 — db/content/lessons.json 확인`);
  seedId = row.id;
  snapshot = await snapshotLesson(seedId);
});

after(async () => {
  config.devAutologin = originalAutologin;
  try {
    if (snapshot) await restoreLesson(snapshot);
    await cleanupReviewFixtures(tag);
  } finally {
    await closeDb();
  }
});

describe('생성 — POST /api/admin/contents/lesson', () => {
  it('author 가 LC 를 만들면 201 이고 draft/private/curated 로 저장되며 스크립트는 객체 배열 그대로다', async () => {
    const payload = lcPayload();
    // 본문의 status/visibility 는 읽지 않는다(결정 1) — 보내도 draft/private 이어야 한다.
    const before = await counts();
    const { status, body } = await call('POST', '/api/admin/contents/lesson', {
      as: 'author', body: { ...payload, status: 'published', visibility: 'public', source: 'seed' },
    });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.ok, true);
    const { lesson } = body;
    assert.equal(lesson.type, 'lesson');
    assert.equal(lesson.status, 'draft');
    assert.equal(lesson.visibility, 'private');
    assert.equal(lesson.source, 'curated');
    assert.equal(lesson.created_by, users.author.id);
    assert.equal(lesson.kind, 'toeic_lc');
    assert.match(lesson.slug, SLUG_RE);
    assert.deepEqual(lesson.passage, { type: 'LISTENING', subject: 'Short Conversation', body: payload.passage.body });
    assert.deepEqual(lesson.items.map((i) => i.position), [1, 2, 3]);
    assert.deepEqual(lesson.items.map((i) => i.answer), ['A', 'A', 'A']);

    const { rows: [db] } = await pool.query(
      `SELECT c.status, c.visibility, c.source, c.created_by, d.passage, d.est_minutes
         FROM content_items c JOIN lesson_details d ON d.content_id = c.id WHERE c.id = $1`, [lesson.id],
    );
    assert.deepEqual(db.passage.body, payload.passage.body);
    assert.equal(db.est_minutes, 4);
    assert.deepEqual([db.status, db.visibility, db.source, db.created_by], ['draft', 'private', 'curated', users.author.id]);
    const after = await counts();
    assert.deepEqual(after, { contents: before.contents + 1, details: before.details + 1, items: before.items + 3 });
    assert.deepEqual(await auditOf(lesson.id), [{
      action: 'create', from_status: null, to_status: 'draft', note: '', actor_id: users.author.id,
    }]);
  });

  it('reviewer·admin 도 만들 수 있다 — 경계는 author 이상이다', async () => {
    for (const role of ['reviewer', 'admin']) {
      const { status, body } = await call('POST', '/api/admin/contents/lesson', {
        as: role, body: lcPayload(`${tag} ${role}`),
      });
      assert.equal(status, 201, `${role}: ${JSON.stringify(body)}`);
      assert.equal(body.lesson.created_by, users[role].id);
    }
  });

  it('대사에 M: 라벨이 남으면 422 + validation_errors 로 거부되고 DB 는 변하지 않는다', async () => {
    const payload = lcPayload();
    payload.passage.body[2].text = 'M: Please reserve it for the weekly planning meeting.';
    const before = await counts();
    const { status, body } = await call('POST', '/api/admin/contents/lesson', { as: 'author', body: payload });
    assert.equal(status, 422, JSON.stringify(body));
    assert.equal(body.ok, false);
    assert.equal(body.code, 'VALIDATION_FAILED');
    assert.ok(Array.isArray(body.validation_errors));
    assert.ok(body.validation_errors.some((e) => e.includes('script[2].text') && e.includes('화자 라벨')),
      JSON.stringify(body.validation_errors));
    assert.deepEqual(await counts(), before);
  });

  it('화자 토글이 비었으면 그 줄이 지목된다 — 목업의 3번 줄', async () => {
    const payload = lcPayload();
    payload.passage.body[2].speaker = '';
    await assert.rejects(createLesson(users.author, payload), (err) => is(422, 'VALIDATION_FAILED')(err)
      && err.extra.validation_errors.some((e) => e.includes('script[2].speaker')));
  });

  it('해설이 정답 id 를 가리키지 않으면 422 다', async () => {
    const payload = lcPayload();
    payload.items[1].explanation = '남자가 회의실 예약을 요청한다.';
    await assert.rejects(createLesson(users.author, payload), (err) => is(422, 'VALIDATION_FAILED')(err)
      && err.extra.validation_errors.some((e) => e.includes('items[1].explanation') && e.includes('(A)')));
  });

  it('title 이 비면 400 이 아니라 검증기의 422 다 — 화면이 다른 오류와 함께 한 번에 그린다', async () => {
    const payload = lcPayload('');
    payload.items[0].explanation = '정답 표기 없음';
    await assert.rejects(createLesson(users.author, payload), (err) => is(422)(err)
      && err.extra.validation_errors.includes('title이 비어 있습니다.')
      && err.extra.validation_errors.some((e) => e.includes('items[0].explanation')));
  });

  it('slug 는 제목에서 만들고 충돌이면 -2 를 붙이며 한국어 제목은 lesson- 폴백이다', async () => {
    const a = await createLesson(users.author, lcPayload(`${tag} Slug Test`));
    const b = await createLesson(users.author, lcPayload(`${tag} Slug Test`));
    assert.equal(a.lesson.slug, `${tag}-slug-test`);
    assert.equal(b.lesson.slug, `${tag}-slug-test-2`);
    const ko = await createLesson(users.author, lcPayload('회의 일정 조율'));
    assert.match(ko.lesson.slug, /^lesson-\d+$/);
    // 새 레슨은 목록 끝에 붙는다(saveGeneratedLesson 과 같은 max+1).
    assert.ok(b.lesson.position > a.lesson.position);
  });

  it('형태가 깨진 본문은 400 이다 — 내용 규칙이 아니라 화면이 만들 수 없는 요청', () => {
    const cases = [
      ['kind 허용값 밖', (p) => { p.kind = 'toeic_part9'; }],
      ['items 비배열', (p) => { p.items = {}; }],
      ['items 0개', (p) => { p.items = []; }],
      ['passage 비객체', (p) => { p.passage = 'M: hi'; }],
      ['passage.body 비배열', (p) => { p.passage.body = 'M: hi'; }],
      ['LC 줄이 문자열', (p) => { p.passage.body[0] = 'M: Could I reserve the room?'; }],
      ['skill_code 허용값 밖', (p) => { p.items[0].skill_code = 'listening'; }],
      ['title 비문자열', (p) => { p.title = 42; }],
      ['difficulty 범위 밖', (p) => { p.difficulty = 9; }],
      ['faq 원소 비문자열', (p) => { p.faq = [{ q: 1 }]; }],
    ];
    for (const [label, mutate] of cases) {
      const p = lcPayload();
      mutate(p);
      assert.throws(() => normalizeLessonInput(p), is(400, 'BAD_REQUEST'), label);
    }
    assert.throws(() => normalizeLessonInput(null), is(400));
    assert.throws(() => normalizeLessonInput([]), is(400));
  });

  it('RC 는 문단 문자열 배열이고 빈 지문은 400 이다 · 이메일 헤더는 보존된다', () => {
    const rc = lcPayload();
    rc.kind = 'toeic_part7';
    rc.passage = { type: 'EMAIL', from: 'Daniel Park', to: 'All', cc: '', date: 'May 26', subject: 'Kickoff', body: ['Dear team,', '  ', 'Thanks.'] };
    const out = normalizeLessonInput(rc);
    assert.deepEqual(out.passage, { type: 'EMAIL', from: 'Daniel Park', to: 'All', date: 'May 26', subject: 'Kickoff', body: ['Dear team,', 'Thanks.'] });
    rc.passage.body = ['   '];
    assert.throws(() => normalizeLessonInput(rc), is(400));
    rc.passage.body = [{ speaker: 'M', text: 'not a paragraph' }];
    assert.throws(() => normalizeLessonInput(rc), is(400));
    // Part 5 는 type/subject 를 비워 보내면 생성 경로와 같은 라벨을 채운다.
    const p5 = lcPayload();
    p5.kind = 'toeic_part5';
    p5.passage = { body: ['Choose the best word.'] };
    assert.deepEqual(normalizeLessonInput(p5).passage, { type: 'PART 5', subject: 'Incomplete Sentences', body: ['Choose the best word.'] });
  });

  it(':type 이 lesson 이 아니면 400 이다', async () => {
    const { status, body } = await call('POST', '/api/admin/contents/scenario', { as: 'admin', body: lcPayload() });
    assert.equal(status, 400);
    assert.equal(body.code, 'BAD_REQUEST');
    assert.equal((await call('GET', `/api/admin/contents/vocab_set/${seedId}`, { as: 'admin' })).status, 400);
  });
});

describe('수정 — PATCH /api/admin/contents/lesson/:id', () => {
  it('시드 LC 를 고치면 source 는 curated, status/visibility 는 그대로, 문항은 1..n 으로 재부여된다', async () => {
    const { lesson: current } = await readLesson(seedId);
    assert.deepEqual([current.source, current.status, current.visibility], ['seed', 'published', 'public']);
    assert.equal(current.items.length, 3);

    // 플랜 13 Phase A 완료 판정의 편집 — 대사 한 줄과 문항을 고친다. 2번 문항을 빼고 새 문항을 끝에 붙여 재부여를 본다.
    const newLine = 'Do you have a minute? I would like to move our weekly team meeting.';
    const body = {
      title: current.title, subtitle: current.subtitle, difficulty: current.difficulty,
      kind: current.kind, est_minutes: current.est_minutes, vocab: current.vocab, faq: current.faq,
      passage: {
        ...current.passage,
        body: current.passage.body.map((line, i) => (i === 0 ? { ...line, text: newLine } : line)),
      },
      items: [current.items[0], current.items[2], {
        stem: `${tag}: Where will the meeting most likely be held?`,
        options: [
          { id: 'A', text: 'In a cafe' }, { id: 'B', text: 'At a client site' },
          { id: 'C', text: 'Online' }, { id: 'D', text: 'In the office' },
        ],
        answer: 'D', explanation: '(D) 남자가 "Most people are in the office by nine" 라고 말한다.', skill_code: 'inference',
      }],
    };
    const before = await counts();
    const { status, body: res } = await call('PATCH', `/api/admin/contents/lesson/${seedId}`, { as: 'reviewer', body });
    assert.equal(status, 200, JSON.stringify(res));
    const { lesson } = res;
    assert.equal(lesson.id, seedId);
    assert.equal(lesson.slug, SEED_SLUG);
    assert.deepEqual([lesson.source, lesson.status, lesson.visibility], ['curated', 'published', 'public']);
    assert.equal(lesson.updated_by, users.reviewer.id);   // published 편집은 reviewer 가 했다
    assert.deepEqual(lesson.items.map((i) => i.position), [1, 2, 3]);
    assert.equal(lesson.items[0].stem, current.items[0].stem);
    assert.equal(lesson.items[1].stem, current.items[2].stem);
    assert.equal(lesson.items[2].answer, 'D');
    assert.equal(lesson.passage.body[0].text, newLine);
    assert.equal(lesson.passage.body[0].speaker, current.passage.body[0].speaker);
    // 행 수는 그대로다 — 새 레슨을 만든 것이 아니라 제자리에서 갈아 끼웠다.
    assert.deepEqual(await counts(), before);

    // 학습자 화면은 고친 내용을 본다(published+public) — 정답은 여전히 없다.
    const learner = await learnerGetLesson(users.learner, seedId);
    assert.equal(learner.lesson.passage.body[0].text, newLine);
    assert.equal(learner.lesson.items.length, 3);
    assert.equal(JSON.stringify(learner.lesson).includes('"answer"'), false);

    const audit = await auditOf(seedId);
    assert.deepEqual(audit.at(-1), {
      action: 'update', from_status: 'published', to_status: 'published',
      note: 'source seed → curated', actor_id: users.reviewer.id,
    });
  });

  it('ai 레슨을 고치면 source 는 ai 로 남고 review 상태도 그대로다', async () => {
    const ai = await createReviewContent(tag, users.author);
    const { lesson } = await updateLesson(users.author, ai.id, lcPayload(`${tag} ai 수정`));
    assert.deepEqual([lesson.source, lesson.status, lesson.visibility], ['ai', 'review', 'private']);
    assert.equal(lesson.title, `${tag} ai 수정`);
    assert.equal((await auditOf(ai.id)).at(-1).note, '');
  });

  it('검증에 걸린 수정은 문항을 하나도 지우지 않는다', async () => {
    const { lesson: current } = await readLesson(seedId);
    const body = {
      title: current.title, kind: current.kind, passage: current.passage,
      items: current.items.map((it) => ({ ...it, explanation: '정답 표기를 지운 해설' })),
    };
    const { status, body: res } = await call('PATCH', `/api/admin/contents/lesson/${seedId}`, { as: 'author', body });
    assert.equal(status, 422);
    assert.equal(res.validation_errors.length, current.items.length);
    const { lesson: after } = await readLesson(seedId);
    assert.deepEqual(after.items, current.items);
    // Date 는 참조가 달라 equal 이 아니라 deepEqual(시각 비교)이다.
    assert.deepEqual(after.updated_at, current.updated_at);
  });

  it('author 는 published 레슨 본문을 제자리에서 고칠 수 없다 — 403 · 무변경 (검수 게이트 우회 방지)', async () => {
    const { lesson: before } = await readLesson(seedId);
    assert.equal(before.status, 'published');
    const { status, body: res } = await call('PATCH', `/api/admin/contents/lesson/${seedId}`, { as: 'author', body: lcPayload() });
    assert.equal(status, 403, JSON.stringify(res).slice(0, 200));
    assert.equal(res.code, 'FORBIDDEN');
    const { lesson: after } = await readLesson(seedId);
    assert.deepEqual([after.title, after.source, after.items.length], [before.title, before.source, before.items.length]);
  });

  it('문항 INSERT 가 중간에 실패하면 DELETE 까지 롤백된다', async (t) => {
    const { lesson: current } = await readLesson(seedId);
    const connect = pool.connect.bind(pool);
    t.mock.method(pool, 'connect', async () => {
      const client = await connect();
      return {
        release: () => client.release(),
        query: (sql, values) => {
          if (sql.includes('INSERT INTO lesson_items') && values[1] === 2) throw new Error('검증용 문항 저장 실패');
          return client.query(sql, values);
        },
      };
    });
    await assert.rejects(updateLesson(users.reviewer, seedId, lcPayload()), /검증용/);
    t.mock.restoreAll();
    const { lesson: after } = await readLesson(seedId);
    assert.deepEqual(after.items, current.items);
    assert.equal(after.title, current.title);
  });

  it('없는 id · 다른 유형의 id 는 404 다', async () => {
    const scenario = await createReviewContent(tag, users.author, { task: 'scenario_gen' });
    for (const id of [scenario.id, 999999999]) {
      const patched = await call('PATCH', `/api/admin/contents/lesson/${id}`, { as: 'admin', body: lcPayload() });
      assert.equal(patched.status, 404, `PATCH ${id}`);
      assert.equal(patched.body.code, 'NOT_FOUND');
      const read = await call('GET', `/api/admin/contents/lesson/${id}`, { as: 'admin' });
      assert.equal(read.status, 404, `GET ${id}`);
    }
    assert.equal((await call('GET', '/api/admin/contents/lesson/abc', { as: 'admin' })).status, 400);
  });
});

describe('권한과 상세', () => {
  it('learner 는 GET/POST/PATCH 전부 403 이고 아무것도 바꾸지 않는다 · 쿠키 없음은 401', async () => {
    const before = await counts();
    const { lesson: current } = await readLesson(seedId);
    const attempts = [
      ['GET', `/api/admin/contents/lesson/${seedId}`],
      ['POST', '/api/admin/contents/lesson', lcPayload()],
      ['PATCH', `/api/admin/contents/lesson/${seedId}`, lcPayload()],
    ];
    for (const [method, path, body] of attempts) {
      const r = await call(method, path, { as: 'learner', body });
      assert.equal(r.status, 403, `${method} ${path}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, 'FORBIDDEN');
    }
    assert.deepEqual(await counts(), before);
    assert.deepEqual((await readLesson(seedId)).lesson, current);
    const anon = await call('GET', `/api/admin/contents/lesson/${seedId}`);
    assert.equal(anon.status, 401);
  });

  it('GET 상세는 answer·explanation·skill_code 를 싣고 학습자 getLesson 은 싣지 않는다', async () => {
    const { status, body } = await call('GET', `/api/admin/contents/lesson/${seedId}`, { as: 'author' });
    assert.equal(status, 200);
    const { lesson } = body;
    assert.equal(lesson.slug, SEED_SLUG);
    assert.equal(lesson.kind, 'toeic_lc');
    assert.ok(Array.isArray(lesson.passage.body) && typeof lesson.passage.body[0].speaker === 'string');
    assert.ok(lesson.items.length >= 1);
    for (const item of lesson.items) {
      assert.match(item.answer, /^[A-D]$/);
      assert.ok(item.explanation.includes(`(${item.answer})`));
      assert.ok('skill_code' in item);
      assert.equal(item.options.length, 4);
    }
    assert.ok(lesson.created_at && lesson.updated_at);

    const learner = await learnerGetLesson(users.learner, seedId);
    assert.equal(learner.lesson.items.length, lesson.items.length);
    for (const item of learner.lesson.items) {
      assert.deepEqual(Object.keys(item).sort(), ['options', 'position', 'stem']);
    }
    assert.equal(JSON.stringify(learner.lesson).includes('"explanation"'), false);
  });
});
