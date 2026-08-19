-- 0004_conversation.sql — 회화 세션/메시지/첨삭 영속화 (docs/plan/01-conversation.md Phase C1)
-- 파생값(message_count/avg_score)은 저장하지 않는다 — 매 요청 서브쿼리 계산 (패턴 ②).
CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL DEFAULT '새 회화',
  scenario        JSONB,                -- 표시 메타 {tag, level, title, description} — 프롬프트 주입 없음(v1)
  status          TEXT        NOT NULL DEFAULT 'active',
  provider_ref    TEXT,                 -- CLI resume ID 예약 컬럼 (v1 stateless — 미사용)
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,          -- 메시지 저장 트랜잭션이 갱신 (목록 정렬용 — 파생값 아님)
  ended_at        TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_sessions_status_ck   CHECK (status IN ('active','ended')),
  CONSTRAINT conversation_sessions_title_ck    CHECK (length(title) BETWEEN 1 AND 80),
  CONSTRAINT conversation_sessions_scenario_ck CHECK (scenario IS NULL OR jsonb_typeof(scenario) = 'object'),
  CONSTRAINT conversation_sessions_ended_ck    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS conversation_sessions_user_recent_idx
  ON public.conversation_sessions (user_id, COALESCE(last_message_at, started_at) DESC);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id                BIGSERIAL   PRIMARY KEY,
  session_id        BIGINT      NOT NULL REFERENCES public.conversation_sessions(id) ON DELETE CASCADE,
  user_id           BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  -- 소유권 필터 중복 보관
  role              TEXT        NOT NULL,
  content           TEXT        NOT NULL,      -- user: 입력 원문 / assistant: reply_en
  content_ko        TEXT,                      -- assistant 전용: reply_ko
  corrections       JSONB,                     -- assistant 전용: [{original, corrected, reason, type}] (직전 user 발화 채점)
  scores            JSONB,                     -- assistant 전용: {grammar, fluency, vocabulary}
  suggestion        TEXT,                      -- assistant 전용
  degraded          BOOLEAN     NOT NULL DEFAULT false,   -- 스키마 위반 강등 응답 표식
  provider          TEXT,                      -- 'claude'|'agy'|'codex'|'cursor'|'ollama'
  model             TEXT,
  latency_ms        INT,
  client_request_id UUID,                      -- 멱등키 (user 행에만 세팅)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_role_ck    CHECK (role IN ('user','assistant')),
  CONSTRAINT conversation_messages_len_ck     CHECK (length(content) BETWEEN 1 AND 8000),
  CONSTRAINT conversation_messages_corr_ck    CHECK (corrections IS NULL OR jsonb_typeof(corrections) = 'array'),
  CONSTRAINT conversation_messages_scores_ck  CHECK (scores IS NULL OR jsonb_typeof(scores) = 'object')
);
CREATE INDEX IF NOT EXISTS conversation_messages_session_idx
  ON public.conversation_messages (session_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_reqid_uq
  ON public.conversation_messages (client_request_id) WHERE client_request_id IS NOT NULL;

-- 누적 첨삭 — SRS 컬럼 세트는 user_vocab_cards(0002_vocab.sql)와 동일. srs.js 재사용 전제.
CREATE TABLE IF NOT EXISTS public.corrections (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          BIGINT       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id       BIGINT       REFERENCES public.conversation_sessions(id) ON DELETE SET NULL,
  message_id       BIGINT       REFERENCES public.conversation_messages(id) ON DELETE SET NULL,  -- 채점 대상 user 메시지
  original         TEXT         NOT NULL,
  corrected        TEXT         NOT NULL,
  reason           TEXT,
  type             TEXT         NOT NULL,
  dedup_key        TEXT         GENERATED ALWAYS AS (lower(btrim(original)) || ' → ' || lower(btrim(corrected))) STORED,
  seen_count       INT          NOT NULL DEFAULT 1,      -- 같은 실수 재발 횟수
  -- ── SRS 컬럼 세트 (user_vocab_cards와 1:1) ──
  next_review      TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- 신규 첨삭은 즉시 due
  interval_days    INT          NOT NULL DEFAULT 1,
  ease_factor      NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  review_count     INT          NOT NULL DEFAULT 0,
  fail_count       INT          NOT NULL DEFAULT 0,
  last_result      TEXT,
  last_reviewed_at TIMESTAMPTZ,
  suspended        BOOLEAN      NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT corrections_type_ck        CHECK (type IN ('grammar','usage','spelling')),
  CONSTRAINT corrections_len_ck         CHECK (length(original) BETWEEN 1 AND 500 AND length(corrected) BETWEEN 1 AND 500),
  CONSTRAINT corrections_interval_ck    CHECK (interval_days BETWEEN 0 AND 3650),
  CONSTRAINT corrections_ef_ck          CHECK (ease_factor BETWEEN 1.30 AND 3.00),
  CONSTRAINT corrections_counts_ck      CHECK (review_count >= 0 AND fail_count >= 0 AND fail_count <= review_count),
  CONSTRAINT corrections_last_result_ck CHECK (last_result IS NULL OR last_result IN ('again','hard','good','easy')),
  CONSTRAINT corrections_seen_ck        CHECK (seen_count >= 1),
  CONSTRAINT corrections_user_dedup_uq  UNIQUE (user_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS corrections_due_idx
  ON public.corrections (user_id, next_review) WHERE suspended = false;
CREATE INDEX IF NOT EXISTS corrections_user_created_idx
  ON public.corrections (user_id, created_at DESC);
