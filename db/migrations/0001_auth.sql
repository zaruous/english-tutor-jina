CREATE TABLE IF NOT EXISTS public.users (
  id            BIGSERIAL   PRIMARY KEY,
  email         TEXT        NOT NULL,
  display_name  TEXT        NOT NULL DEFAULT '',
  password_hash TEXT        NOT NULL,   -- 'scrypt$N=16384,r=8,p=1,len=64$<salt_b64url>$<hash_b64url>'
  tz            TEXT        NOT NULL DEFAULT 'Asia/Seoul',
  is_dev        BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT users_email_key      UNIQUE (email),
  CONSTRAINT users_email_lower_ck CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_shape_ck CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash   BYTEA       NOT NULL,   -- sha256(쿠키 원문). 원문은 DB에 저장하지 않음
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent   TEXT,
  ip           INET,
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT auth_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_sessions_exp_ck CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx    ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON public.auth_sessions (expires_at);
