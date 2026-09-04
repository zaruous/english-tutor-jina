// 관리자 사용자·역할 관리 (플랜 11 Phase 3) — 0017 마이그레이션과 역할 서비스.
// 스키마가 baseline + 0017 로 나뉘어 있어, 이 파일이 둘이 합쳐진 결과 위에서 도는지도 함께 본다.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closeDb, pool } from './helpers/db.mjs';

after(() => closeDb());

test('0017 이 roles · user_audit_log · users.role/is_active 를 만든다', async () => {
  await setupDb();
  const { rows: roles } = await pool.query(`SELECT code, rank FROM roles ORDER BY rank`);
  assert.deepEqual(roles.map((r) => r.code), ['learner', 'author', 'reviewer', 'admin']);

  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('role','is_active') ORDER BY column_name`);
  assert.deepEqual(cols.map((c) => c.column_name), ['is_active', 'role']);

  const { rows: [log] } = await pool.query(
    `SELECT count(*)::int AS cnt FROM user_audit_log`);
  assert.equal(log.cnt, 0);
});

test('auth.service 의 signup → login → resolveSession 이 새 스키마에서 돈다', async () => {
  await setupDb();
  const { signup, login, resolveSession, logout } = await import('../api/services/auth.service.js');
  const email = `merge-check-${Date.now()}@jina.test`;
  const u = await signup({ email, password: 'pw-12345678', displayName: '병합확인' });
  assert.equal(u.role, 'learner');
  assert.equal(u.can_admin, false);

  const s = await login({ email, password: 'pw-12345678', userAgent: 'test', ip: '127.0.0.1' });
  assert.equal(s.user.email, email);
  assert.equal(s.user.password_hash, undefined, 'password_hash 가 DTO 로 새면 안 된다');

  const resolved = await resolveSession(s.token);
  assert.equal(resolved.user.email, email);
  await logout(s.token);
  assert.equal(await resolveSession(s.token), null);
});

test('admin-user.service 목록·역할변경·감사로그가 돈다', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-user.service.js');
  const { signup } = await import('../api/services/auth.service.js');
  const actor = await signup({ email: `mc-admin-${Date.now()}@jina.test`, password: 'pw-12345678' });
  await pool.query(`UPDATE users SET role = 'admin', is_admin = true WHERE id = $1`, [actor.id]);
  const target = await signup({ email: `mc-t-${Date.now()}@jina.test`, password: 'pw-12345678' });

  const list = await svc.listUsers(actor.id, { q: 'mc-' });
  assert.ok(list.total >= 2, `total=${list.total}`);

  const changed = await svc.changeRole(actor.id, target.id, { to: 'author', note: '병합 검증' });
  assert.equal(changed.user.role, 'author');

  const { rows: [audit] } = await pool.query(
    `SELECT action, from_role, to_role FROM user_audit_log WHERE target_user_id = $1`, [target.id]);
  assert.deepEqual(audit, { action: 'role_change', from_role: 'learner', to_role: 'author' });
});
