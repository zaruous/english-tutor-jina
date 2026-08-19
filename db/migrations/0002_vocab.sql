CREATE TABLE IF NOT EXISTS public.vocab_words (
  id          BIGSERIAL   PRIMARY KEY,
  word        TEXT        NOT NULL,
  word_key    TEXT        GENERATED ALWAYS AS (lower(btrim(word))) STORED,
  lang        TEXT        NOT NULL DEFAULT 'en',
  pos         TEXT,
  ipa         TEXT,
  meaning_ko  TEXT        NOT NULL,
  examples    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  difficulty  SMALLINT    NOT NULL DEFAULT 3,
  source      TEXT        NOT NULL DEFAULT 'seed',
  created_by  BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vocab_words_difficulty_ck CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT vocab_words_examples_ck   CHECK (jsonb_typeof(examples)='array' AND jsonb_array_length(examples) <= 5),
  CONSTRAINT vocab_words_word_len_ck   CHECK (length(btrim(word)) BETWEEN 1 AND 64),
  CONSTRAINT vocab_words_lang_ck       CHECK (lang IN ('en')),
  CONSTRAINT vocab_words_source_ck     CHECK (source IN ('seed','ai','manual','lesson','conversation'))
);
CREATE UNIQUE INDEX IF NOT EXISTS vocab_words_key_lang_uq ON public.vocab_words (word_key, lang);
CREATE INDEX IF NOT EXISTS vocab_words_key_prefix_idx ON public.vocab_words (word_key text_pattern_ops);

CREATE TABLE IF NOT EXISTS public.user_vocab_cards (
  id                  BIGSERIAL    PRIMARY KEY,
  user_id             BIGINT       NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  word_id             BIGINT       NOT NULL REFERENCES public.vocab_words(id) ON DELETE CASCADE,
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
  examples_override   JSONB,   -- 공유 사전을 침범하지 않는 개인 수정
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT user_vocab_cards_user_word_uq UNIQUE (user_id, word_id),
  CONSTRAINT uvc_interval_ck    CHECK (interval_days BETWEEN 0 AND 3650),
  CONSTRAINT uvc_ef_ck          CHECK (ease_factor BETWEEN 1.30 AND 3.00),
  CONSTRAINT uvc_counts_ck      CHECK (review_count >= 0 AND fail_count >= 0 AND fail_count <= review_count),
  CONSTRAINT uvc_last_result_ck CHECK (last_result IS NULL OR last_result IN ('again','hard','good','easy'))
);
CREATE INDEX IF NOT EXISTS user_vocab_cards_due_idx   ON public.user_vocab_cards (user_id, next_review) WHERE suspended = false;
CREATE INDEX IF NOT EXISTS user_vocab_cards_added_idx ON public.user_vocab_cards (user_id, added_at DESC);
CREATE INDEX IF NOT EXISTS user_vocab_cards_word_idx  ON public.user_vocab_cards (word_id);

CREATE TABLE IF NOT EXISTS public.vocab_reviews (
  id                 BIGSERIAL    PRIMARY KEY,
  card_id            BIGINT       NOT NULL REFERENCES public.user_vocab_cards(id) ON DELETE CASCADE,
  user_id            BIGINT       NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  word_id            BIGINT       NOT NULL REFERENCES public.vocab_words(id)      ON DELETE CASCADE,
  result             TEXT         NOT NULL,
  reviewed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  prev_interval_days INT          NOT NULL,
  prev_ease_factor   NUMERIC(4,2) NOT NULL,
  next_interval_days INT          NOT NULL,
  next_ease_factor   NUMERIC(4,2) NOT NULL,
  next_review        TIMESTAMPTZ  NOT NULL,
  elapsed_ms         INT,
  client_request_id  UUID,                                  -- 멱등키
  CONSTRAINT vocab_reviews_result_ck CHECK (result IN ('again','hard','good','easy'))
);
CREATE INDEX IF NOT EXISTS vocab_reviews_user_time_idx ON public.vocab_reviews (user_id, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS vocab_reviews_reqid_uq ON public.vocab_reviews (client_request_id) WHERE client_request_id IS NOT NULL;
