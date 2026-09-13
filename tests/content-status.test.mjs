// 상태 전이 단일 소스 (플랜 11 §2 결정 7 · §4 Phase 1 검증 3).
//
// 기대값을 `TRANSITIONS` 에서 끌어오면 표를 표로 검증하는 동어반복이 된다. 그래서 이 파일은
// **플랜 문서의 표를 손으로 다시 적어** 두고 그것과 대조한다 — 표가 조용히 바뀌면 여기가 깨진다.
//
// 역할 비교가 `roles` 테이블 서열을 읽으므로 setupDb() → loadRoles() 가 선행이다
// (content-status.js 는 동기 모듈이고 그 await 를 호출자에게 맡긴다).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  CONTENT_STATUSES, TRANSITIONS,
  assertSetVisibility, assertTransition, canSetVisibility, canTransition,
} from '../api/lib/content-status.js';
import { HttpError } from '../api/lib/errors.js';
import { loadRoles } from '../api/lib/roles.js';
import { closeDb, setupDb } from './helpers/db.mjs';

// 플랜 11 §2 결정 7 의 표를 그대로 옮긴 것. 여기 없는 조합은 전부 금지(409).
const ALLOWED = {
  'draft→review': 'author',
  'draft→published': 'reviewer',
  'review→published': 'reviewer',
  'review→draft': 'reviewer',
  'published→archived': 'reviewer',
  'archived→published': 'reviewer',
};
// 0017_user_roles.sql 의 서열. DB 와 어긋나면 그 자체가 결함이므로 아래에서 대조한다.
const RANK = { learner: 10, author: 20, reviewer: 30, admin: 40 };
const ROLES = Object.keys(RANK);

before(async () => {
  await setupDb();
  await loadRoles();
});
after(() => closeDb());

describe('content-status — 전이 매트릭스 (상태 4 × 상태 4 × 역할 4)', () => {
  it('역할 서열이 roles 테이블과 같다', async () => {
    const ranks = await loadRoles();
    assert.deepEqual(ranks, RANK);
  });

  it('64개 조합 전부가 표대로 판정된다', () => {
    for (const from of CONTENT_STATUSES) {
      for (const to of CONTENT_STATUSES) {
        const required = ALLOWED[`${from}→${to}`];
        for (const role of ROLES) {
          const got = canTransition(from, to, role);
          const label = `${role}: ${from} → ${to}`;
          if (!required) {
            // 금지 전이 — 역할과 무관하게 CONFLICT. minRole 을 붙이지 않는다
            // (역할을 올려도 되는 일이 아니라서 붙이면 거짓 안내가 된다).
            assert.deepEqual(got, { ok: false, reason: 'CONFLICT' }, label);
          } else if (RANK[role] < RANK[required]) {
            assert.deepEqual(got, { ok: false, reason: 'FORBIDDEN', minRole: required }, label);
          } else {
            assert.deepEqual(got, { ok: true }, label);
          }
        }
      }
    }
  });

  it('from === to 는 멱등 no-op 이 아니라 409 다', () => {
    // 통과시키면 content_audit_log 에 "published → published" 가 쌓인다.
    for (const s of CONTENT_STATUSES) {
      assert.deepEqual(canTransition(s, s, 'admin'), { ok: false, reason: 'CONFLICT' }, s);
    }
  });

  it('author 는 검수 요청까지만 한다', () => {
    assert.deepEqual(canTransition('draft', 'review', 'author'), { ok: true });
    assert.deepEqual(canTransition('review', 'published', 'author'),
      { ok: false, reason: 'FORBIDDEN', minRole: 'reviewer' });
    assert.deepEqual(canTransition('published', 'archived', 'author'),
      { ok: false, reason: 'FORBIDDEN', minRole: 'reviewer' });
  });

  it('reviewer 는 승인·반려·발행·내림·재발행을 전부 한다', () => {
    for (const key of Object.keys(ALLOWED)) {
      const [from, to] = key.split('→');
      assert.deepEqual(canTransition(from, to, 'reviewer'), { ok: true }, key);
      assert.deepEqual(canTransition(from, to, 'admin'), { ok: true }, key);
    }
  });

  it('learner 는 아무 전이도 못 한다 (되는 전이는 403, 없는 전이는 409)', () => {
    assert.deepEqual(canTransition('draft', 'review', 'learner'),
      { ok: false, reason: 'FORBIDDEN', minRole: 'author' });
    assert.deepEqual(canTransition('published', 'draft', 'learner'),
      { ok: false, reason: 'CONFLICT' });
  });

  it('published → draft 는 역할과 무관하게 CONFLICT 다 (archived 를 거친다)', () => {
    for (const role of ROLES) {
      assert.deepEqual(canTransition('published', 'draft', role), { ok: false, reason: 'CONFLICT' }, role);
    }
  });

  it('상태가 아닌 값·프로토타입 키는 CONFLICT 로 떨어진다', () => {
    for (const bad of ['constructor', 'toString', '__proto__', 'PUBLISHED', '', null, undefined, 1]) {
      assert.deepEqual(canTransition(bad, 'published', 'admin'), { ok: false, reason: 'CONFLICT' }, `from=${String(bad)}`);
      assert.deepEqual(canTransition('draft', bad, 'admin'), { ok: false, reason: 'CONFLICT' }, `to=${String(bad)}`);
    }
  });

  it('알 수 없는 역할은 FORBIDDEN (되는 전이 위에서만)', () => {
    assert.deepEqual(canTransition('draft', 'review', 'ghost'),
      { ok: false, reason: 'FORBIDDEN', minRole: 'author' });
  });

  it('TRANSITIONS 는 얼어 있다 — 표를 런타임에 늘릴 수 없다', () => {
    assert.ok(Object.isFrozen(TRANSITIONS));
    assert.ok(Object.isFrozen(TRANSITIONS.draft));
    assert.throws(() => { TRANSITIONS.published.draft = 'learner'; }, TypeError);
  });
});

describe('content-status — assertTransition 의 상태코드 분리', () => {
  const thrown = (fn) => {
    try { fn(); } catch (err) { return err; }
    return null;
  };

  it('성공이면 조용히 반환한다', () => {
    assert.equal(assertTransition('draft', 'review', 'author'), undefined);
  });

  it('역할 부족은 403 FORBIDDEN', () => {
    const err = thrown(() => assertTransition('review', 'published', 'author'));
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'FORBIDDEN');
    assert.equal(err.extra.min_role, 'reviewer');
    assert.match(err.message, /reviewer/);
  });

  it('금지 전이는 409 CONFLICT (역할 문제가 아니라 상태 문제)', () => {
    const err = thrown(() => assertTransition('published', 'draft', 'admin'));
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 409);
    assert.equal(err.code, 'CONFLICT');
    assert.equal(err.extra.min_role, undefined);
  });

  it('금지 전이는 역할이 모자라도 409 다 — 상태를 먼저 본다', () => {
    // learner 가 published → draft 를 눌러도 403 이 아니다. 403 이면 "역할을 올리면 된다" 는
    // 거짓 안내가 되고, 관리 UI 가 버튼을 비활성 대신 숨기게 된다.
    const err = thrown(() => assertTransition('published', 'draft', 'learner'));
    assert.equal(err.status, 409);
  });
});

describe('content-status — canSetVisibility', () => {
  it('reviewer 이상만 공개 범위를 건드린다', () => {
    assert.deepEqual(canSetVisibility('published', 'public', 'reviewer'), { ok: true });
    assert.deepEqual(canSetVisibility('published', 'public', 'admin'), { ok: true });
    assert.deepEqual(canSetVisibility('published', 'public', 'author'),
      { ok: false, reason: 'FORBIDDEN', minRole: 'reviewer' });
    assert.deepEqual(canSetVisibility('published', 'private', 'learner'),
      { ok: false, reason: 'FORBIDDEN', minRole: 'reviewer' });
  });

  it('public 은 published·archived 에서만 허용된다 (content_items_public_ck 와 같은 집합)', () => {
    assert.deepEqual(canSetVisibility('published', 'public', 'admin'), { ok: true });
    // archived + public 이 허용이라는 것이 resolvable 이 살아 있다는 뜻이다 —
    // 내린 콘텐츠가 강제로 private 이 되면 남의 오답 노트에서 그 레슨이 사라진다.
    assert.deepEqual(canSetVisibility('archived', 'public', 'admin'), { ok: true });
    assert.deepEqual(canSetVisibility('draft', 'public', 'admin'), { ok: false, reason: 'CONFLICT' });
    assert.deepEqual(canSetVisibility('review', 'public', 'admin'), { ok: false, reason: 'CONFLICT' });
  });

  it('private 으로 내리는 것은 어느 상태에서든 상태 문제가 아니다', () => {
    for (const s of CONTENT_STATUSES) {
      assert.deepEqual(canSetVisibility(s, 'private', 'reviewer'), { ok: true }, s);
    }
  });

  it('알 수 없는 상태·가시성은 CONFLICT', () => {
    assert.deepEqual(canSetVisibility('published', 'secret', 'admin'), { ok: false, reason: 'CONFLICT' });
    assert.deepEqual(canSetVisibility('deleted', 'public', 'admin'), { ok: false, reason: 'CONFLICT' });
  });

  it('assertSetVisibility 도 403/409 를 같은 규칙으로 나눈다', () => {
    assert.equal(assertSetVisibility('published', 'public', 'reviewer'), undefined);
    assert.throws(() => assertSetVisibility('published', 'public', 'author'),
      (e) => e.status === 403 && e.code === 'FORBIDDEN');
    assert.throws(() => assertSetVisibility('draft', 'public', 'admin'),
      (e) => e.status === 409 && e.code === 'CONFLICT');
    // 상태를 먼저 본다 — 역할까지 모자라도 409.
    assert.throws(() => assertSetVisibility('draft', 'public', 'learner'),
      (e) => e.status === 409);
  });
});
