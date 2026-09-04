-- 0001_baseline.sql — 전용 스키마 baseline (플랜 10.7 Phase 2)
--
-- 기존 0001~0016 을 대체한다. 데이터 이동 마이그레이션이 아니다 — 새 DB 를 만들고
-- 콘텐츠는 db/content/*.json 에서 db/seeds/content.mjs 가 다시 넣는다.
--
-- 식별자에 스키마 접두를 쓰지 않는다. 러너(db/migrate.mjs)가 적용 전에
-- search_path 를 DB_SCHEMA 하나로 고정하므로, 스키마 이름이 SQL 에 박히지 않는다.
--
-- 가장 큰 변화: 콘텐츠 3테이블(lessons·conversation_scenarios·vocab_sets)이
-- content_items 하나로 합쳐지고 타입별 detail 테이블이 1:1 로 붙는다. 가시성 조건과
-- 감사·토픽 구성은 content_items 만 본다.

-- ── 사용자 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL   PRIMARY KEY,
  email         TEXT        NOT NULL,
  display_name  TEXT        NOT NULL DEFAULT '',
  password_hash TEXT        NOT NULL,   -- 'scrypt$N=16384,r=8,p=1,len=64$<salt_b64url>$<hash_b64url>'
  tz            TEXT        NOT NULL DEFAULT 'Asia/Seoul',
  is_dev        BOOLEAN     NOT NULL DEFAULT false,
  is_admin      BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT users_email_key      UNIQUE (email),
  CONSTRAINT users_email_lower_ck CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_shape_ck CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
CREATE INDEX IF NOT EXISTS users_is_admin_idx ON users (is_admin) WHERE is_admin;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   BYTEA       NOT NULL,   -- sha256(쿠키 원문). 원문은 저장하지 않는다
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent   TEXT,
  ip           INET,
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT auth_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_sessions_exp_ck CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx    ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at);

-- ── 콘텐츠 카탈로그 ───────────────────────────────────────────────────
-- 가시성·감사·토픽 구성이 전부 이 테이블만 본다. 타입별 컬럼은 detail 로 내려간다.
CREATE TABLE IF NOT EXISTS content_items (
  id          BIGSERIAL   PRIMARY KEY,
  type        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  difficulty  SMALLINT    NOT NULL DEFAULT 3,
  status      TEXT        NOT NULL DEFAULT 'draft',
  visibility  TEXT        NOT NULL DEFAULT 'private',
  source      TEXT        NOT NULL DEFAULT 'seed',
  created_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  updated_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_items_slug_key   UNIQUE (slug),
  CONSTRAINT content_items_type_ck    CHECK (type IN ('lesson','scenario','vocab_set','speaking_set')),
  CONSTRAINT content_items_slug_ck    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT content_items_title_ck   CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT content_items_status_ck  CHECK (status IN ('draft','review','published','archived')),
  CONSTRAINT content_items_vis_ck     CHECK (visibility IN ('public','private')),
  CONSTRAINT content_items_source_ck  CHECK (source IN ('seed','ai','curated')),
  CONSTRAINT content_items_diff_ck    CHECK (difficulty BETWEEN 1 AND 5),
  -- 공개 상태가 아닌데 public 은 저장되지 않는다 (플랜 11 결정 2)
  CONSTRAINT content_items_public_ck  CHECK (status = 'published' OR visibility = 'private')
);
CREATE INDEX IF NOT EXISTS content_items_catalog_idx ON content_items (type, status, visibility);
CREATE INDEX IF NOT EXISTS content_items_owner_idx   ON content_items (created_by) WHERE created_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS lesson_details (
  content_id  BIGINT   PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  kind        TEXT     NOT NULL DEFAULT 'toeic_part7',
  subtitle    TEXT     NOT NULL DEFAULT '',
  est_minutes SMALLINT NOT NULL DEFAULT 6,
  passage     JSONB    NOT NULL,                      -- {type,from,to,cc,date,subject,body}
  vocab       JSONB    NOT NULL DEFAULT '[]'::jsonb,  -- [{word,ipa,pos,meaning,ex}] 표시용
  faq         JSONB    NOT NULL DEFAULT '[]'::jsonb,  -- Jina 패널 추천 질문
  position    INT      NOT NULL DEFAULT 0,            -- 목록/'다음 지문' 순서
  CONSTRAINT lesson_details_kind_ck    CHECK (kind IN ('toeic_part5','toeic_part7','toeic_lc')),
  CONSTRAINT lesson_details_passage_ck CHECK (jsonb_typeof(passage) = 'object'),
  CONSTRAINT lesson_details_vocab_ck   CHECK (jsonb_typeof(vocab) = 'array'),
  CONSTRAINT lesson_details_faq_ck     CHECK (jsonb_typeof(faq) = 'array'),
  CONSTRAINT lesson_details_est_ck     CHECK (est_minutes BETWEEN 1 AND 180)
);
CREATE INDEX IF NOT EXISTS lesson_details_position_idx ON lesson_details (position, content_id);
CREATE INDEX IF NOT EXISTS lesson_details_kind_idx     ON lesson_details (kind);

CREATE TABLE IF NOT EXISTS scenario_details (
  content_id      BIGINT   PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  tag             TEXT     NOT NULL DEFAULT 'AI 회화',
  level           SMALLINT NOT NULL DEFAULT 3,
  system_prompt   TEXT     NOT NULL DEFAULT '',
  opening_message TEXT     NOT NULL DEFAULT '',
  objectives      JSONB    NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT scenario_details_level_ck      CHECK (level BETWEEN 1 AND 5),
  CONSTRAINT scenario_details_objectives_ck CHECK (jsonb_typeof(objectives) = 'array')
);

CREATE TABLE IF NOT EXISTS vocab_set_details (
  content_id BIGINT PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  words      JSONB  NOT NULL,
  CONSTRAINT vocab_set_details_words_ck CHECK (jsonb_typeof(words) = 'array')
);

-- 문항 — 정답(answer)/해설(explanation)은 이 테이블에만 있고 GET DTO 는 컬럼 나열로 제외한다.
CREATE TABLE IF NOT EXISTS lesson_items (
  id          BIGSERIAL   PRIMARY KEY,
  content_id  BIGINT      NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  position    SMALLINT    NOT NULL,                   -- 화면의 q.n (1부터)
  stem        TEXT        NOT NULL,
  options     JSONB       NOT NULL,                   -- [{id:'A',text:'…'}] ★correct 플래그 없음
  answer      TEXT        NOT NULL,
  explanation TEXT        NOT NULL DEFAULT '',
  skill_code  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_items_content_pos_uq UNIQUE (content_id, position),
  CONSTRAINT lesson_items_position_ck    CHECK (position BETWEEN 1 AND 50),
  CONSTRAINT lesson_items_answer_ck      CHECK (answer ~ '^[A-Z]$'),
  CONSTRAINT lesson_items_options_ck     CHECK (jsonb_typeof(options) = 'array'
                                           AND jsonb_array_length(options) BETWEEN 2 AND 6),
  CONSTRAINT lesson_items_skill_ck       CHECK (skill_code IS NULL
                                           OR skill_code IN ('grammar','vocab','detail','inference','main_idea'))
);
CREATE INDEX IF NOT EXISTS lesson_items_content_idx ON lesson_items (content_id, position);

-- ── 토픽 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topics (
  id          BIGSERIAL   PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  label_ko    TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'draft',
  visibility  TEXT        NOT NULL DEFAULT 'private',
  created_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  updated_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT topics_slug_ck   CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT topics_label_ck  CHECK (length(label_ko) BETWEEN 1 AND 80),
  CONSTRAINT topics_status_ck CHECK (status IN ('draft','review','published','archived')),
  CONSTRAINT topics_vis_ck    CHECK (visibility IN ('public','private')),
  CONSTRAINT topics_public_ck CHECK (status = 'published' OR visibility = 'private')
);

-- 배타 FK·부분 UNIQUE 3개·num_nonnulls CHECK 가 단일 FK 하나로 줄었다.
CREATE TABLE IF NOT EXISTS topic_contents (
  id         BIGSERIAL   PRIMARY KEY,
  topic_id   BIGINT      NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  content_id BIGINT      NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  position   INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT topic_contents_uq UNIQUE (topic_id, content_id)
);
CREATE INDEX IF NOT EXISTS topic_contents_order_idx   ON topic_contents (topic_id, position, id);
CREATE INDEX IF NOT EXISTS topic_contents_content_idx ON topic_contents (content_id);

-- ── 단어 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vocab_words (
  id         BIGSERIAL   PRIMARY KEY,
  word       TEXT        NOT NULL,
  word_key   TEXT        GENERATED ALWAYS AS (lower(btrim(word))) STORED,
  lang       TEXT        NOT NULL DEFAULT 'en',
  pos        TEXT,
  ipa        TEXT,
  meaning_ko TEXT        NOT NULL,
  examples   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  difficulty SMALLINT    NOT NULL DEFAULT 3,
  source     TEXT        NOT NULL DEFAULT 'seed',
  created_by BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vocab_words_difficulty_ck CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT vocab_words_examples_ck   CHECK (jsonb_typeof(examples)='array' AND jsonb_array_length(examples) <= 5),
  CONSTRAINT vocab_words_word_len_ck   CHECK (length(btrim(word)) BETWEEN 1 AND 64),
  CONSTRAINT vocab_words_lang_ck       CHECK (lang IN ('en')),
  CONSTRAINT vocab_words_source_ck     CHECK (source IN ('seed','ai','manual','lesson','conversation'))
);
CREATE UNIQUE INDEX IF NOT EXISTS vocab_words_key_lang_uq    ON vocab_words (word_key, lang);
CREATE INDEX        IF NOT EXISTS vocab_words_key_prefix_idx ON vocab_words (word_key text_pattern_ops);

CREATE TABLE IF NOT EXISTS user_vocab_cards (
  id                  BIGSERIAL    PRIMARY KEY,
  user_id             BIGINT       NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  word_id             BIGINT       NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
  added_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  next_review         TIMESTAMPTZ  NOT NULL DEFAULT now(),   -- 신규 카드는 즉시 due
  interval_days       INT          NOT NULL DEFAULT 1,
  ease_factor         NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  review_count        INT          NOT NULL DEFAULT 0,
  fail_count          INT          NOT NULL DEFAULT 0,
  last_result         TEXT,
  last_reviewed_at    TIMESTAMPTZ,
  suspended           BOOLEAN      NOT NULL DEFAULT false,
  meaning_ko_override TEXT,
  examples_override   JSONB,       -- 공유 사전을 침범하지 않는 개인 수정
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT user_vocab_cards_user_word_uq UNIQUE (user_id, word_id),
  CONSTRAINT uvc_interval_ck    CHECK (interval_days BETWEEN 0 AND 3650),
  CONSTRAINT uvc_ef_ck          CHECK (ease_factor BETWEEN 1.30 AND 3.00),
  CONSTRAINT uvc_counts_ck      CHECK (review_count >= 0 AND fail_count >= 0 AND fail_count <= review_count),
  CONSTRAINT uvc_last_result_ck CHECK (last_result IS NULL OR last_result IN ('again','hard','good','easy'))
);
CREATE INDEX IF NOT EXISTS user_vocab_cards_due_idx   ON user_vocab_cards (user_id, next_review) WHERE suspended = false;
CREATE INDEX IF NOT EXISTS user_vocab_cards_added_idx ON user_vocab_cards (user_id, added_at DESC);
CREATE INDEX IF NOT EXISTS user_vocab_cards_word_idx  ON user_vocab_cards (word_id);

CREATE TABLE IF NOT EXISTS vocab_reviews (
  id                 BIGSERIAL    PRIMARY KEY,
  card_id            BIGINT       NOT NULL REFERENCES user_vocab_cards(id) ON DELETE CASCADE,
  user_id            BIGINT       NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  word_id            BIGINT       NOT NULL REFERENCES vocab_words(id)      ON DELETE CASCADE,
  result             TEXT         NOT NULL,
  reviewed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  prev_interval_days INT          NOT NULL,
  prev_ease_factor   NUMERIC(4,2) NOT NULL,
  next_interval_days INT          NOT NULL,
  next_ease_factor   NUMERIC(4,2) NOT NULL,
  next_review        TIMESTAMPTZ  NOT NULL,
  elapsed_ms         INT,
  client_request_id  UUID,
  CONSTRAINT vocab_reviews_result_ck CHECK (result IN ('again','hard','good','easy'))
);
CREATE INDEX IF NOT EXISTS vocab_reviews_user_time_idx ON vocab_reviews (user_id, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS vocab_reviews_reqid_uq ON vocab_reviews (client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS vocab_quizzes (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT         NOT NULL,
  keyword      TEXT,
  topic_title  TEXT         NOT NULL,
  topic_ko     TEXT,
  words        JSONB        NOT NULL,
  answers      JSONB,
  score        SMALLINT,
  provider     TEXT,
  model        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT vocab_quizzes_kind_ck  CHECK (kind IN ('random','news','game','blog','keyword')),
  CONSTRAINT vocab_quizzes_score_ck CHECK (score IS NULL OR score BETWEEN 0 AND 10)
);
CREATE INDEX IF NOT EXISTS vocab_quizzes_user_created_idx ON vocab_quizzes (user_id, created_at DESC);

-- ── 회화 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id                    BIGSERIAL   PRIMARY KEY,
  user_id               BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id           BIGINT      REFERENCES content_items(id) ON DELETE SET NULL,
  title                 TEXT        NOT NULL DEFAULT '새 회화',
  scenario              JSONB,                -- 표시 메타 {tag, level, title, description} 스냅숏
  status                TEXT        NOT NULL DEFAULT 'active',
  provider_ref          TEXT,                 -- CLI resume 핸들. NULL 이면 다음 턴은 히스토리 재전송
  provider_ref_provider TEXT,                 -- provider_ref 가 속한 provider (ollama 는 stateless 라 NULL)
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at       TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_sessions_status_ck   CHECK (status IN ('active','ended')),
  CONSTRAINT conversation_sessions_title_ck    CHECK (length(title) BETWEEN 1 AND 80),
  CONSTRAINT conversation_sessions_scenario_ck CHECK (scenario IS NULL OR jsonb_typeof(scenario) = 'object'),
  CONSTRAINT conversation_sessions_ended_ck    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS conversation_sessions_user_recent_idx
  ON conversation_sessions (user_id, COALESCE(last_message_at, started_at) DESC);
CREATE INDEX IF NOT EXISTS conversation_sessions_user_scenario_idx
  ON conversation_sessions (user_id, scenario_id) WHERE scenario_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id                BIGSERIAL   PRIMARY KEY,
  session_id        BIGINT      NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  user_id           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 소유권 필터 중복 보관
  role              TEXT        NOT NULL,
  content           TEXT        NOT NULL,
  content_ko        TEXT,
  corrections       JSONB,
  scores            JSONB,
  suggestion        TEXT,
  degraded          BOOLEAN     NOT NULL DEFAULT false,
  provider          TEXT,
  model             TEXT,
  latency_ms        INT,
  client_request_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_role_ck   CHECK (role IN ('user','assistant')),
  CONSTRAINT conversation_messages_len_ck    CHECK (length(content) BETWEEN 1 AND 8000),
  CONSTRAINT conversation_messages_corr_ck   CHECK (corrections IS NULL OR jsonb_typeof(corrections) = 'array'),
  CONSTRAINT conversation_messages_scores_ck CHECK (scores IS NULL OR jsonb_typeof(scores) = 'object')
);
CREATE INDEX IF NOT EXISTS conversation_messages_session_idx ON conversation_messages (session_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_reqid_uq
  ON conversation_messages (client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS corrections (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id       BIGINT       REFERENCES conversation_sessions(id) ON DELETE SET NULL,
  message_id       BIGINT       REFERENCES conversation_messages(id) ON DELETE SET NULL,
  original         TEXT         NOT NULL,
  corrected        TEXT         NOT NULL,
  reason           TEXT,
  type             TEXT         NOT NULL,
  dedup_key        TEXT         GENERATED ALWAYS AS (lower(btrim(original)) || ' → ' || lower(btrim(corrected))) STORED,
  seen_count       INT          NOT NULL DEFAULT 1,
  next_review      TIMESTAMPTZ  NOT NULL DEFAULT now(),
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
CREATE INDEX IF NOT EXISTS corrections_due_idx          ON corrections (user_id, next_review) WHERE suspended = false;
CREATE INDEX IF NOT EXISTS corrections_user_created_idx ON corrections (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS correction_reviews (
  id                 BIGSERIAL    PRIMARY KEY,
  correction_id      BIGINT       NOT NULL REFERENCES corrections(id) ON DELETE CASCADE,
  user_id            BIGINT       NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  result             TEXT         NOT NULL,
  reviewed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  prev_interval_days INT          NOT NULL,
  prev_ease_factor   NUMERIC(4,2) NOT NULL,
  next_interval_days INT          NOT NULL,
  next_ease_factor   NUMERIC(4,2) NOT NULL,
  next_review        TIMESTAMPTZ  NOT NULL,
  elapsed_ms         INT,
  client_request_id  UUID,
  CONSTRAINT correction_reviews_result_ck CHECK (result IN ('again','hard','good','easy'))
);
CREATE INDEX IF NOT EXISTS correction_reviews_user_time_idx  ON correction_reviews (user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS correction_reviews_correction_idx ON correction_reviews (correction_id, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS correction_reviews_reqid_uq
  ON correction_reviews (client_request_id) WHERE client_request_id IS NOT NULL;

-- ── 학습 기록 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_lesson_attempts (
  id                BIGSERIAL   PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  content_id        BIGINT      NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  answers           JSONB       NOT NULL,   -- {"1":"B","2":"C"} (position 문자열 → 옵션 id)
  correct_count     SMALLINT    NOT NULL,   -- 채점 시점 사실 기록
  total_count       SMALLINT    NOT NULL,
  elapsed_ms        INT,
  client_request_id UUID,
  skill_code        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ula_answers_ck CHECK (jsonb_typeof(answers) = 'object'),
  CONSTRAINT ula_counts_ck  CHECK (correct_count >= 0 AND total_count >= 1 AND correct_count <= total_count)
);
CREATE INDEX IF NOT EXISTS ula_user_content_idx ON user_lesson_attempts (user_id, content_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ula_user_time_idx    ON user_lesson_attempts (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ula_reqid_uq  ON user_lesson_attempts (client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lesson_qa_sessions (
  id           BIGSERIAL   PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id)                ON DELETE CASCADE,
  content_id   BIGINT      NOT NULL REFERENCES content_items(id)        ON DELETE CASCADE,
  attempt_id   BIGINT      NOT NULL REFERENCES user_lesson_attempts(id) ON DELETE CASCADE,
  provider     TEXT        NOT NULL,
  provider_ref TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_qa_sessions_key_uq UNIQUE (user_id, content_id, attempt_id, provider)
);

CREATE TABLE IF NOT EXISTS lesson_reports (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  content_id BIGINT      NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  reason     TEXT        NOT NULL,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_reports_reason_ck       CHECK (reason IN ('incorrect_answer','ambiguous','language','other')),
  CONSTRAINT lesson_reports_details_ck      CHECK (details IS NULL OR length(details) <= 1000),
  CONSTRAINT lesson_reports_user_content_uq UNIQUE (user_id, content_id)
);
CREATE INDEX IF NOT EXISTS lesson_reports_content_idx ON lesson_reports (content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_goals (
  user_id       BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_test   TEXT        NOT NULL DEFAULT 'TOEIC',
  target_score  SMALLINT    NOT NULL DEFAULT 900,
  exam_date     DATE,                              -- null 허용 → D-day 배지 숨김
  daily_minutes SMALLINT    NOT NULL DEFAULT 35,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_goals_target_ck CHECK (target_score BETWEEN 10 AND 990),
  CONSTRAINT user_goals_daily_ck  CHECK (daily_minutes BETWEEN 5 AND 600),
  CONSTRAINT user_goals_test_ck   CHECK (target_test IN ('TOEIC'))
);

-- ── AI 생성 파이프라인 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_jobs (
  id                BIGSERIAL   PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task              TEXT        NOT NULL,
  input             JSONB       NOT NULL,
  request_hash      TEXT        NOT NULL,
  client_request_id UUID        NOT NULL,
  provider          TEXT        NOT NULL,
  model             TEXT,
  status            TEXT        NOT NULL DEFAULT 'queued',
  result            JSONB,
  error_code        TEXT,
  error_message     TEXT,
  attempts          SMALLINT    NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_jobs_task_ck        CHECK (task IN ('lesson_gen','scenario_gen','vocab_set')),
  CONSTRAINT ai_jobs_status_ck      CHECK (status IN ('queued','running','succeeded','failed')),
  CONSTRAINT ai_jobs_input_ck       CHECK (jsonb_typeof(input) = 'object'),
  CONSTRAINT ai_jobs_result_ck      CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  CONSTRAINT ai_jobs_attempts_ck    CHECK (attempts BETWEEN 0 AND 10),
  CONSTRAINT ai_jobs_user_request_uq UNIQUE (user_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS ai_jobs_queue_idx       ON ai_jobs (created_at, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS ai_jobs_user_recent_idx ON ai_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_jobs_user_hash_idx   ON ai_jobs (user_id, task, request_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS lesson_drafts (
  id                   BIGSERIAL   PRIMARY KEY,
  user_id              BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id               BIGINT      NOT NULL UNIQUE REFERENCES ai_jobs(id) ON DELETE CASCADE,
  payload              JSONB       NOT NULL,
  validation_errors    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  review_status        TEXT        NOT NULL DEFAULT 'draft',
  published_content_id BIGINT      UNIQUE REFERENCES content_items(id) ON DELETE SET NULL,
  provider             TEXT,
  model                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_drafts_payload_ck CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT lesson_drafts_errors_ck  CHECK (jsonb_typeof(validation_errors) = 'array'),
  CONSTRAINT lesson_drafts_review_ck  CHECK (review_status IN ('draft','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS lesson_drafts_user_idx ON lesson_drafts (user_id, created_at DESC);

-- 콘텐츠 상태 전이 감사 로그. 다형성이 아니라 진짜 FK 다 (플랜 11 이 이 위에서 시작한다).
CREATE TABLE IF NOT EXISTS content_audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  content_id  BIGINT      NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  actor_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_audit_log_action_ck CHECK (action IN ('create','update','status_change','visibility_change','delete'))
);
CREATE INDEX IF NOT EXISTS content_audit_log_content_idx ON content_audit_log (content_id, created_at DESC);
