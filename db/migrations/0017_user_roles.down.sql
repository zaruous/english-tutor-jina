-- 0017_user_roles.down.sql — roles · user_audit_log · users.role/is_active 제거

DROP TABLE IF EXISTS user_audit_log;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_fk;
DROP INDEX IF EXISTS users_role_idx;
ALTER TABLE users DROP COLUMN IF EXISTS role, DROP COLUMN IF EXISTS is_active;
DROP TABLE IF EXISTS roles;
