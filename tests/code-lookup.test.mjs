import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closeDb, pool } from './helpers/db.mjs';

after(() => closeDb());

test('GET /api/codes/roles 가 roles 기준정보를 반환한다', async () => {
  await setupDb();
  const { signup } = await import('../api/services/auth.service.js');
  const { listCodeItems } = await import('../api/services/code-lookup.service.js');

  const admin = await signup({ email: `codes-admin-${Date.now()}@jina.test`, password: 'pw-12345678' });
  await pool.query(`UPDATE users SET role = 'admin', is_admin = true WHERE id = $1`, [admin.id]);
  const actor = { ...admin, role: 'admin' };

  const res = await listCodeItems(actor, 'roles');
  assert.equal(res.key, 'roles');
  assert.deepEqual(res.items.map((r) => r.code), ['learner', 'author', 'reviewer', 'admin']);
  assert.ok(res.items.every((r) => r.name && typeof r.description === 'string'));
});

test('알 수 없는 code key 는 400 이다', async () => {
  await setupDb();
  const { signup } = await import('../api/services/auth.service.js');
  const { listCodeItems } = await import('../api/services/code-lookup.service.js');
  const admin = await signup({ email: `codes-bad-${Date.now()}@jina.test`, password: 'pw-12345678' });
  await pool.query(`UPDATE users SET role = 'admin', is_admin = true WHERE id = $1`, [admin.id]);

  await assert.rejects(() => listCodeItems(admin, 'nope'), (err) => err.status === 400);
});
