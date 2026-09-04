import { pool } from './pool.js';

let roleRankCache = null;

export async function loadRoles() {
  if (roleRankCache) return roleRankCache;
  const { rows } = await pool.query(
    `SELECT code, rank, name, description FROM roles ORDER BY rank`,
  );
  roleRankCache = Object.fromEntries(rows.map((r) => [r.code, r.rank]));
  return roleRankCache;
}

export function rankOf(code) {
  if (!roleRankCache) throw new Error('loadRoles() must be called before rankOf');
  return roleRankCache[code] ?? 0;
}

export function atLeast(userRole, required) {
  if (!roleRankCache) throw new Error('loadRoles() must be called before atLeast');
  return (roleRankCache[userRole] ?? 0) >= (roleRankCache[required] ?? Infinity);
}

export function invalidateRoleCache() {
  roleRankCache = null;
}
