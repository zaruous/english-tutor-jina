-- 0017_user_roles.down.sql — roles · user_audit_log · users.role/is_active 제거

DROP TABLE IF EXISTS public.user_audit_log;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_fk;
DROP INDEX IF EXISTS public.users_role_idx;
ALTER TABLE public.users DROP COLUMN IF EXISTS role, DROP COLUMN IF EXISTS is_active;
DROP TABLE IF EXISTS public.roles;
