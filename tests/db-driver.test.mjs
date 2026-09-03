// 드라이버 어댑터 계약 — 이 파일이 통과해야 나머지 테스트의 결과를 믿을 수 있다.
// pg 와 pglite 에서 같은 단정이 돌아야 한다(npm test / npm run test:pg).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { withTx } from '../api/lib/tx.js';
import { closeDb, pool, setupDb } from './helpers/db.mjs';

before(async () => { await setupDb(); });
after(async () => { await closeDb(); });

describe('db 어댑터', () => {
  it('BIGINT 와 NUMERIC 이 문자열이 아니라 number 로 온다', async () => {
    const { rows: [r] } = await pool.query(`SELECT 9::bigint AS big, 2.50::numeric AS num`);
    assert.equal(typeof r.big, 'number', 'BIGINT');
    assert.equal(typeof r.num, 'number', 'NUMERIC');
    assert.equal(r.num, 2.5);
  });

  it('SELECT 의 rowCount 는 행 수, DML 의 rowCount 는 영향 행 수다', async () => {
    await pool.exec(`CREATE TEMP TABLE t_rowcount (id int)`);
    const ins = await pool.query(`INSERT INTO t_rowcount VALUES (1), (2), (3)`);
    assert.equal(ins.rowCount, 3, 'INSERT');
    const sel = await pool.query(`SELECT * FROM t_rowcount`);
    assert.equal(sel.rowCount, 3, 'SELECT');
    const del = await pool.query(`DELETE FROM t_rowcount WHERE id = 99`);
    assert.equal(del.rowCount, 0, '한 행도 지우지 않은 DELETE');
    await pool.exec(`DROP TABLE t_rowcount`);
  });

  it('withTx 는 예외에서 되돌린다', async () => {
    await pool.exec(`CREATE TEMP TABLE t_tx (id int)`);
    await assert.rejects(withTx(async (client) => {
      await client.query(`INSERT INTO t_tx VALUES (1)`);
      throw new Error('boom');
    }), /boom/);
    const { rows } = await pool.query(`SELECT * FROM t_tx`);
    assert.equal(rows.length, 0, '롤백되지 않았다');
    await pool.exec(`DROP TABLE t_tx`);
  });

  it('withTx 가 겹쳐도 서로의 트랜잭션을 덮어쓰지 않는다', async () => {
    // pglite 는 커넥션이 하나뿐이라 어댑터가 직렬화하지 않으면 두 BEGIN 이 뒤엉킨다.
    await pool.exec(`CREATE TABLE IF NOT EXISTS t_serial (tag text)`);
    await pool.query(`DELETE FROM t_serial`);
    const ok = withTx(async (client) => {
      await client.query(`INSERT INTO t_serial VALUES ('keep')`);
    });
    const fail = withTx(async (client) => {
      await client.query(`INSERT INTO t_serial VALUES ('drop')`);
      throw new Error('rollback me');
    });
    await Promise.allSettled([ok, fail]);
    const { rows } = await pool.query(`SELECT tag FROM t_serial ORDER BY tag`);
    assert.deepEqual(rows.map((r) => r.tag), ['keep'], '실패한 트랜잭션이 성공한 쪽을 끌고 갔다');
    await pool.exec(`DROP TABLE t_serial`);
  });

  it('advisory lock 을 트랜잭션 안에서 잡을 수 있다 (ai_jobs 중복 방지가 이 위에 있다)', async () => {
    const held = await withTx(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['jina_test']);
      const { rows: [r] } = await client.query(
        `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'`,
      );
      return r.n;
    });
    assert.ok(held >= 1, '트랜잭션 안에서 advisory lock 이 잡히지 않았다');
  });

  it('APP_TZ 기준 일자 경계 계산이 동작한다 (대시보드·통계 집계의 토대)', async () => {
    const { rows: [r] } = await pool.query(
      `SELECT (timestamptz '2026-09-03 15:30:00+00' AT TIME ZONE $1)::date AS d`, ['Asia/Seoul'],
    );
    // 2026-09-04 00:30 KST → 서울 기준으로는 이미 다음 날이다.
    assert.equal(new Date(r.d).toISOString().slice(0, 10), '2026-09-04');
  });
});
