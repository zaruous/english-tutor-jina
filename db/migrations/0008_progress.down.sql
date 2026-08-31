-- 0008_progress.down.sql
-- user_goals 자체는 0007 소유이므로 드롭하지 않는다 — 이 파일이 추가한 컬럼만 되돌린다
-- (CHECK 제약은 컬럼과 함께 사라진다).
DROP TABLE IF EXISTS public.correction_reviews;
ALTER TABLE public.user_goals DROP COLUMN IF EXISTS target_test;
