-- 0016 롤백 — 관리자 플래그 제거 (계정 행 자체는 남긴다)
DROP INDEX IF EXISTS public.users_is_admin_idx;
ALTER TABLE public.users DROP COLUMN IF EXISTS is_admin;
