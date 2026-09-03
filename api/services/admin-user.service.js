import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { loadRoles, rankOf } from '../lib/roles.js';

const USER_SELECT = `
  u.id, u.email, u.display_name, u.role, u.is_active, u.is_dev,
  u.created_at, u.last_login_at,
  COALESCE(s.cnt, 0)::int AS active_sessions
`;

const SESSION_COUNT_JOIN = `
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt
      FROM public.auth_sessions s
     WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()
  ) s ON true
`;

function isDemotion(fromRole, toRole) {
  return rankOf(toRole) < rankOf(fromRole);
}

// 대상을 제외한 '활성' admin 수. 대상 자신을 세면 안 된다 —
// 비활성 admin 을 강등해도 쓸 수 있는 관리자 수는 변하지 않는데 예전 구현은 그것까지 막았다.
// FOR UPDATE 는 판정과 UPDATE 사이에 다른 트랜잭션이 admin 을 줄이는 경합을 막는다.
// (count(*) 에는 FOR UPDATE 를 붙일 수 없다 — 0A000. 그래서 행을 가져와 센다.)
async function countOtherActiveAdmins(client, excludeUserId) {
  const { rows } = await client.query(
    `SELECT id FROM public.users
      WHERE role = 'admin' AND is_active AND id <> $1 FOR UPDATE`,
    [excludeUserId],
  );
  return rows.length;
}

// 테스트 전용 노출 — e2e 가 실계정을 건드리지 않고 카운트 의미만 검증할 수 있게 한다.
export async function countOtherActiveAdminsForTest(excludeUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const n = await countOtherActiveAdmins(client, excludeUserId);
    await client.query('ROLLBACK');   // 잠금만 잡았다 풀고 아무것도 바꾸지 않는다
    return n;
  } finally {
    client.release();
  }
}

// 마지막 '활성' 관리자만 보호한다. 비활성 admin 은 이미 쓸 수 없으므로 보호 대상이 아니다.
function isLastActiveAdmin(target, otherActiveAdmins) {
  return target.role === 'admin' && target.is_active && otherActiveAdmins < 1;
}

function computeCanChangeRole(actorId, row, activeAdminCount) {
  if (row.id === actorId) return { can_change_role: false, role_lock_reason: 'self' };
  // 활성 admin 이 이 사람 하나뿐일 때만 잠근다. 비활성 admin 은 잠그지 않는다.
  if (row.role === 'admin' && row.is_active && activeAdminCount <= 1) {
    return { can_change_role: false, role_lock_reason: 'last_admin' };
  }
  return { can_change_role: true, role_lock_reason: null };
}

function mapUserRow(row, actorId, adminCount) {
  const locks = computeCanChangeRole(actorId, row, adminCount);
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    is_active: row.is_active,
    is_dev: row.is_dev,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
    active_sessions: row.active_sessions,
    is_self: row.id === actorId,
    ...locks,
  };
}

async function fetchUserById(client, userId, actorId, adminCount) {
  const { rows: [row] } = await client.query(
    `SELECT ${USER_SELECT}
       FROM public.users u
       ${SESSION_COUNT_JOIN}
      WHERE u.id = $1`,
    [userId],
  );
  if (!row) return null;
  return mapUserRow(row, actorId, adminCount);
}

async function assertRoleExists(client, code) {
  const { rows: [role] } = await client.query(
    `SELECT code FROM public.roles WHERE code = $1`, [code],
  );
  if (!role) throw new HttpError(400, 'BAD_REQUEST', '유효하지 않은 역할입니다.');
}

async function writeAudit(client, { targetUserId, action, fromRole, toRole, description, createdBy }) {
  await client.query(
    `INSERT INTO public.user_audit_log
       (target_user_id, action, from_role, to_role, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [targetUserId, action, fromRole ?? null, toRole ?? null, description || '', createdBy],
  );
}

export async function listUsers(actorId, { q, role, limit = 50, offset = 0 } = {}) {
  await loadRoles();
  const params = [];
  const where = ['1=1'];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.email ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  const whereSql = where.join(' AND ');

  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM public.users u WHERE ${whereSql}`,
    params,
  );

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT ${USER_SELECT}
       FROM public.users u
       ${SESSION_COUNT_JOIN}
      WHERE ${whereSql}
      ORDER BY u.id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const adminCount = (await pool.query(
    `SELECT count(*)::int AS cnt FROM public.users WHERE role = 'admin' AND is_active`,
  )).rows[0].cnt;

  const { rows: roles } = await pool.query(
    `SELECT code, rank, name, description FROM public.roles ORDER BY rank`,
  );
  const { rows: countRows } = await pool.query(
    `SELECT role, count(*)::int AS cnt FROM public.users GROUP BY role`,
  );
  const counts = Object.fromEntries(countRows.map((r) => [r.role, r.cnt]));
  for (const r of roles) {
    if (counts[r.code] === undefined) counts[r.code] = 0;
  }

  const { rows: recent_audit } = await pool.query(
    `SELECT a.id, a.target_user_id, a.action, a.from_role, a.to_role, a.description,
            a.created_at, a.created_by, u.email AS target_email
       FROM public.user_audit_log a
       JOIN public.users u ON u.id = a.target_user_id
      ORDER BY a.created_at DESC
      LIMIT 3`,
  );

  return {
    users: rows.map((row) => mapUserRow(row, actorId, adminCount)),
    total,
    roles,
    counts,
    recent_audit,
  };
}

export async function changeRole(actorId, targetId, { to, note = '' }) {
  await loadRoles();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertRoleExists(client, to);

    const { rows: [target] } = await client.query(
      `SELECT id, role, is_active FROM public.users WHERE id = $1 FOR UPDATE`,
      [targetId],
    );
    if (!target) throw new HttpError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
    if (target.role === to) {
      await client.query('ROLLBACK');
      const adminCount = (await pool.query(
        `SELECT count(*)::int AS cnt FROM public.users WHERE role = 'admin' AND is_active`,
      )).rows[0].cnt;
      const user = await fetchUserById(pool, targetId, actorId, adminCount);
      return { user };
    }

    const demoting = isDemotion(target.role, to);
    if (demoting && actorId === targetId) {
      throw new HttpError(409, 'SELF_DEMOTION', '본인의 역할을 낮출 수 없습니다.');
    }
    if (demoting && target.role === 'admin' && target.is_active) {
      const others = await countOtherActiveAdmins(client, targetId);
      if (isLastActiveAdmin(target, others)) {
        throw new HttpError(409, 'LAST_ADMIN', '마지막 활성 관리자의 역할을 낮출 수 없습니다.');
      }
    }

    await client.query(
      `UPDATE public.users SET role = $1, updated_at = now() WHERE id = $2`,
      [to, targetId],
    );
    await writeAudit(client, {
      targetUserId: targetId,
      action: 'role_change',
      fromRole: target.role,
      toRole: to,
      description: note,
      createdBy: actorId,
    });
    await client.query('COMMIT');

    const adminCount = (await pool.query(
      `SELECT count(*)::int AS cnt FROM public.users WHERE role = 'admin' AND is_active`,
    )).rows[0].cnt;
    const user = await fetchUserById(pool, targetId, actorId, adminCount);
    return { user };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setActive(actorId, targetId, { to, note = '' }) {
  await loadRoles();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [target] } = await client.query(
      `SELECT id, role, is_active FROM public.users WHERE id = $1 FOR UPDATE`,
      [targetId],
    );
    if (!target) throw new HttpError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
    if (target.is_active === to) {
      await client.query('ROLLBACK');
      const adminCount = (await pool.query(
        `SELECT count(*)::int AS cnt FROM public.users WHERE role = 'admin' AND is_active`,
      )).rows[0].cnt;
      const user = await fetchUserById(pool, targetId, actorId, adminCount);
      return { user };
    }

    if (to === false) {
      if (actorId === targetId) {
        throw new HttpError(409, 'SELF_DEMOTION', '본인 계정을 사용 중지할 수 없습니다.');
      }
      if (target.role === 'admin' && target.is_active) {
        const others = await countOtherActiveAdmins(client, targetId);
        if (isLastActiveAdmin(target, others)) {
          throw new HttpError(409, 'LAST_ADMIN', '마지막 활성 관리자를 사용 중지할 수 없습니다.');
        }
      }
    }

    await client.query(
      `UPDATE public.users SET is_active = $1, updated_at = now() WHERE id = $2`,
      [to, targetId],
    );
    await writeAudit(client, {
      targetUserId: targetId,
      action: to ? 'enable' : 'disable',
      fromRole: null,
      toRole: null,
      description: note,
      createdBy: actorId,
    });
    await client.query('COMMIT');

    const adminCount = (await pool.query(
      `SELECT count(*)::int AS cnt FROM public.users WHERE role = 'admin' AND is_active`,
    )).rows[0].cnt;
    const user = await fetchUserById(pool, targetId, actorId, adminCount);
    return { user };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeSessions(actorId, targetId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [target] } = await client.query(
      `SELECT id FROM public.users WHERE id = $1`, [targetId],
    );
    if (!target) throw new HttpError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');

    const { rows: revokedRows } = await client.query(
      `UPDATE public.auth_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        RETURNING id`,
      [targetId],
    );
    const revoked = revokedRows.length;

    await writeAudit(client, {
      targetUserId: targetId,
      action: 'session_revoke',
      fromRole: null,
      toRole: null,
      description: '',
      createdBy: actorId,
    });
    await client.query('COMMIT');
    return { revoked };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
