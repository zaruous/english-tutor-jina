-- 0016_admin_account.sql — 기본 관리자 계정용 플래그
-- users.is_admin 은 is_dev 와 같은 결의 "계정 종류" 표시다. 권한 체크가 아니라
-- 부팅 시 자동 프로비저닝(ensureAdminAccount)이 손대도 되는 행을 특정하기 위한 것 —
-- 같은 이메일로 만들어진 일반 사용자의 비밀번호를 .env 값으로 덮어쓰지 않게 한다.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS users_is_admin_idx ON public.users (is_admin) WHERE is_admin;
