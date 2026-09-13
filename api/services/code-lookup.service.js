import { HttpError } from '../lib/errors.js';
import { assertCodeLookupKey } from '../lib/code-lookup.js';
import { pool } from '../lib/pool.js';
import { atLeast, loadRoles } from '../lib/roles.js';

export async function listCodeItems(user, key) {
  const meta = assertCodeLookupKey(key);
  await loadRoles();
  if (meta.requireRole && !atLeast(user.role, meta.requireRole)) {
    throw new HttpError(403, 'FORBIDDEN', '권한이 없습니다.');
  }
  const { rows } = await pool.query(meta.listSql);
  return { key, items: rows };
}
