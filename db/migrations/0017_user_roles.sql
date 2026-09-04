-- 0017_user_roles.sql — users.role 서열 · roles 기준정보 · user_audit_log (플랜 11 Phase 3)
-- common:exempt user_audit_log — append-only 감사 로그(created_at/by 만)

CREATE TABLE IF NOT EXISTS roles (
  code        TEXT     PRIMARY KEY,
  rank        SMALLINT NOT NULL UNIQUE,
  name        TEXT     NOT NULL,
  description TEXT     NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO roles (code, rank, name, description) VALUES
  ('learner',  10, '학습자', '학습만 한다. 관리 API 는 전부 403.'),
  ('author',   20, '저작자', '콘텐츠 생성·수정, 검수 요청(draft → review).'),
  ('reviewer', 30, '검수자', '저작자 권한에 더해 승인·반려·공개·내림.'),
  ('admin',    40, '관리자', '검수자 권한에 더해 시스템 조작과 역할 부여.')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'learner',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
UPDATE users SET role = 'admin' WHERE is_admin AND role = 'learner';
ALTER TABLE users
  ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES roles(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role) WHERE role <> 'learner';

CREATE TABLE IF NOT EXISTS user_audit_log (
  id             BIGSERIAL   PRIMARY KEY,
  target_user_id BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action         TEXT        NOT NULL,
  from_role      TEXT        REFERENCES roles(code) ON UPDATE CASCADE,
  to_role        TEXT        REFERENCES roles(code) ON UPDATE CASCADE,
  description    TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT user_audit_action_ck
    CHECK (action IN ('role_change','session_revoke','disable','enable','delete'))
);
CREATE INDEX IF NOT EXISTS user_audit_target_idx
  ON user_audit_log (target_user_id, created_at DESC);
