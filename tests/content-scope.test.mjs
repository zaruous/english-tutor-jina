// 가시성 헬퍼 (플랜 11 §2 결정 2 · Phase 1).
//
// 두 가지를 단정한다.
//  1. 헬퍼가 만드는 문자열 자체 — 다른 그룹이 이 조각을 27곳에 박으므로 모양이 계약이다.
//  2. 그 문자열이 **실제 SQL 로 돌아가는지**. 조건 문자열은 문법 오류가 나도 단위 테스트에서는
//     조용하다 — pglite 에 붙여 돌려야 오타가 드러난다. 픽스처를 심어 discoverable 이
//     archived 를 빼고 resolvable 이 그것을 남기는지(= 상위집합)까지 여기서 본다.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { discoverable, resolvable } from '../api/lib/content-scope.js';
import { closeDb, createUser, dropUser, pool, setupDb } from './helpers/db.mjs';

// slug 는 UNIQUE 이고 CHECK(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)가 걸려 있다.
// DB_DRIVER=pg 로 같은 테스트를 여러 번 돌려도 충돌하지 않도록 실행마다 다른 접두사를 쓴다.
const RUN = randomUUID().slice(0, 8);
const PREFIX = `scope-${RUN}`;

let me;
let other;

describe('content-scope — 조건 문자열', () => {
  it('discoverable 은 published 만 받는다', () => {
    assert.equal(
      discoverable('c', '$1'),
      `c.status = 'published' AND (c.visibility = 'public' OR c.created_by = $1)`,
    );
  });

  it('resolvable 은 archived 를 함께 받는다', () => {
    assert.equal(
      resolvable('l', '$2'),
      `l.status IN ('published', 'archived') AND (l.visibility = 'public' OR l.created_by = $2)`,
    );
  });

  it('가시성 조각(소유자 예외)은 두 헬퍼가 글자 그대로 같다', () => {
    // 이 둘이 갈라지면 "목록에는 보이는데 오답 노트에서는 사라지는" 콘텐츠가 생긴다.
    const vis = `(t.visibility = 'public' OR t.created_by = $1)`;
    assert.ok(discoverable('t', '$1').endsWith(vis));
    assert.ok(resolvable('t', '$1').endsWith(vis));
  });

  it('alias 가 식별자 형태가 아니면 던진다', () => {
    // alias 는 바인딩할 수 없어 SQL 에 그대로 박힌다 — 여기서 막지 않으면 주입 경로가 된다.
    for (const bad of ['c; DROP TABLE users', 'C', '1c', 'c.d', '', ' c', null, undefined, 1]) {
      assert.throws(() => discoverable(bad, '$1'), /alias/, `alias=${String(bad)}`);
      assert.throws(() => resolvable(bad, '$1'), /alias/, `alias=${String(bad)}`);
    }
  });

  it('userParam 이 $n 형태가 아니면 던진다', () => {
    for (const bad of ['1', '$', '$a', '$1 OR 1=1', 'user.id', '', null, 42]) {
      assert.throws(() => discoverable('c', bad), /userParam/, `userParam=${String(bad)}`);
      assert.throws(() => resolvable('c', bad), /userParam/, `userParam=${String(bad)}`);
    }
  });

  it('밑줄·숫자가 섞인 alias 와 두 자리 파라미터는 받는다', () => {
    assert.match(discoverable('_ci2', '$12'), /^_ci2\.status/);
    assert.match(resolvable('c_i', '$10'), /c_i\.created_by = \$10\)$/);
  });
});

describe('content-scope — 실제 SQL', () => {
  before(async () => {
    await setupDb();
    me = await createUser();
    other = await createUser();
    // 픽스처 6행. status 축과 소유자 축을 교차시킨다.
    // `arch-pub`(archived + public + 남의 소유)이 이 픽스처의 핵심이다 — 플랜 §4 Phase 1 검증 2 가
    // 요구하는 행이고, 저장되는 것 자체가 0018_content_archived_public.sql(열린 질문 7 후보 A)의
    // 첫 단정이다. baseline 의 옛 CHECK 아래에서는 이 INSERT 가 거부되어 resolvable 을 아예 못 봤다.
    const rows = [
      // slug 꼬리, status, visibility, created_by
      ['pub', 'published', 'public', null],        // 시드형 공개 → 둘 다 보인다
      ['mine', 'published', 'private', 'me'],      // 내 비공개 발행물 → 둘 다 보인다
      ['arch', 'archived', 'private', 'me'],       // 내가 만든 내려간 것 → resolvable 만
      ['arch-pub', 'archived', 'public', 'other'], // 남이 만든, 내려간 공개 콘텐츠 → resolvable 만
      ['draft', 'draft', 'private', 'me'],         // 초안 → 어느 쪽에도 안 보인다
      ['others', 'published', 'private', 'other'], // 남의 비공개 → 어느 쪽에도 안 보인다
    ];
    for (const [tail, status, visibility, owner] of rows) {
      await pool.query(
        `INSERT INTO content_items (type, slug, title, status, visibility, created_by)
         VALUES ('lesson', $1, $2, $3, $4, $5)`,
        [`${PREFIX}-${tail}`, `scope fixture ${tail}`, status, visibility,
          owner === 'me' ? me.id : owner === 'other' ? other.id : null],
      );
    }
  });

  after(async () => {
    await pool.query(`DELETE FROM content_items WHERE slug LIKE $1`, [`${PREFIX}-%`]);
    await dropUser(me.id);
    await dropUser(other.id);
    await closeDb();
  });

  // 픽스처만 세도록 slug 접두사로 좁힌다. 별칭 ci · 파라미터 $2 로 두어
  // "별칭이 c 가 아니고 자리표시자가 $1 이 아니어도 도는가" 까지 같은 쿼리로 확인한다.
  const countWith = async (cond) => {
    const { rows: [row] } = await pool.query(
      `SELECT count(*)::int AS n FROM content_items ci WHERE ci.slug LIKE $1 AND ${cond}`,
      [`${PREFIX}-%`, me.id],
    );
    return row.n;
  };

  it('discoverable 은 published + (공개 | 내 것) 만 센다', async () => {
    assert.equal(await countWith(discoverable('ci', '$2')), 2); // pub, mine
  });

  it('resolvable 은 여기에 archived 를 더한다', async () => {
    assert.equal(await countWith(resolvable('ci', '$2')), 4);   // pub, mine, arch, arch-pub
  });

  it('내려간(archived) 콘텐츠는 discoverable 에서만 빠진다', async () => {
    const { rows } = await pool.query(
      `SELECT ci.slug FROM content_items ci
        WHERE ci.slug LIKE $1 AND ${resolvable('ci', '$2')}
          AND NOT (${discoverable('ci', '$2')})
        ORDER BY ci.slug`,
      [`${PREFIX}-%`, me.id],
    );
    // 이 한 줄이 결정 2 의 검증이다 — 내린 것은 "이미 한 것의 근거" 로만 남는다.
    assert.deepEqual(rows.map((r) => r.slug), [`${PREFIX}-arch`, `${PREFIX}-arch-pub`]);
  });

  it('남이 만든 archived + public 도 나에게 resolvable 이다 (오답 노트가 살아 있다)', async () => {
    // 작성자가 아닌 학습자 기준. 여기가 무너지면 관리자가 콘텐츠를 내리는 순간
    // 그 레슨을 이미 푼 사람의 오답 노트·통계에서 레슨이 통째로 사라진다.
    const { rows: [row] } = await pool.query(
      `SELECT count(*)::int AS n FROM content_items ci
        WHERE ci.slug = $2 AND ${resolvable('ci', '$1')}`,
      [me.id, `${PREFIX}-arch-pub`],
    );
    assert.equal(row.n, 1);
    const { rows: [gone] } = await pool.query(
      `SELECT count(*)::int AS n FROM content_items ci
        WHERE ci.slug = $2 AND ${discoverable('ci', '$1')}`,
      [me.id, `${PREFIX}-arch-pub`],
    );
    assert.equal(gone.n, 0, '내린 콘텐츠가 목록·추천에 남으면 안 된다');
  });

  it('draft 와 남의 비공개는 어느 쪽에도 안 보인다', async () => {
    const { rows } = await pool.query(
      `SELECT ci.slug FROM content_items ci
        WHERE ci.slug LIKE $1 AND NOT (${resolvable('ci', '$2')}) ORDER BY ci.slug`,
      [`${PREFIX}-%`, me.id],
    );
    assert.deepEqual(rows.map((r) => r.slug), [`${PREFIX}-draft`, `${PREFIX}-others`]);
  });

  it('테이블 전체에서도 resolvable 은 discoverable 의 상위집합이다', async () => {
    // 시드 콘텐츠까지 포함한 전수 비교. 건수가 뒤집히면 조건이 어딘가에서 갈라진 것이다.
    const { rows: [row] } = await pool.query(
      `SELECT (SELECT count(*)::int FROM content_items c WHERE ${discoverable('c', '$1')}) AS d,
              (SELECT count(*)::int FROM content_items c WHERE ${resolvable('c', '$1')})   AS r`,
      [me.id],
    );
    assert.ok(row.d > 0, `시드 콘텐츠가 없으면 이 단정이 공허하다 (d=${row.d})`);
    assert.ok(row.r >= row.d, `resolvable(${row.r}) >= discoverable(${row.d})`);
  });

  it('topics 에도 같은 조각이 그대로 붙는다', async () => {
    // 헬퍼는 content_items 전용이 아니다 — status·visibility·created_by 3열을 가진
    // 테이블이면 같은 규칙이 통한다(topics 가 그렇다). 문법만 확인한다.
    const { rows: [row] } = await pool.query(
      `SELECT count(*)::int AS n FROM topics t WHERE ${discoverable('t', '$1')}`,
      [me.id],
    );
    assert.equal(typeof row.n, 'number');
  });
});
