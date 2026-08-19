import { pool } from './pool.js';

// withTx(fn) — 커넥션 1개에서 BEGIN/COMMIT/ROLLBACK.
// 트랜잭션 안에서 CLI 등 느린 I/O를 기다리지 말 것(pool.max=8이 물린다).
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* 커넥션이 죽은 경우 */ }
    throw err;
  } finally {
    client.release();
  }
}
