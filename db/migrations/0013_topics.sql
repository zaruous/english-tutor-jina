-- 0013_topics.sql — docs/plan/07 Phase 3
-- 서로 다른 콘텐츠 테이블을 FK 없이 content_type/content_id로 가리키지 않는다.
-- 세 FK 중 정확히 하나만 채워지는 배타 FK 구조로 DB 무결성을 보장한다.

CREATE TABLE IF NOT EXISTS public.topics (
  id          BIGSERIAL   PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  label_ko    TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  visibility  TEXT        NOT NULL DEFAULT 'public',
  created_by  BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT topics_slug_ck CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT topics_label_ck CHECK (length(label_ko) BETWEEN 1 AND 80),
  CONSTRAINT topics_visibility_ck CHECK (visibility IN ('public', 'private'))
);

CREATE TABLE IF NOT EXISTS public.conversation_scenarios (
  id              BIGSERIAL   PRIMARY KEY,
  slug            TEXT        NOT NULL UNIQUE,
  title           TEXT        NOT NULL,
  tag             TEXT        NOT NULL DEFAULT 'AI 회화',
  level           SMALLINT    NOT NULL DEFAULT 3,
  description     TEXT        NOT NULL DEFAULT '',
  system_prompt   TEXT        NOT NULL DEFAULT '',
  opening_message TEXT        NOT NULL DEFAULT '',
  objectives      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  source          TEXT        NOT NULL DEFAULT 'seed',
  visibility      TEXT        NOT NULL DEFAULT 'public',
  created_by      BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_scenarios_level_ck CHECK (level BETWEEN 1 AND 5),
  CONSTRAINT conversation_scenarios_objectives_ck CHECK (jsonb_typeof(objectives) = 'array'),
  CONSTRAINT conversation_scenarios_source_ck CHECK (source IN ('seed', 'ai')),
  CONSTRAINT conversation_scenarios_visibility_ck CHECK (visibility IN ('public', 'private'))
);

CREATE TABLE IF NOT EXISTS public.vocab_sets (
  id          BIGSERIAL   PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  words       JSONB       NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'seed',
  visibility  TEXT        NOT NULL DEFAULT 'public',
  created_by  BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vocab_sets_words_ck CHECK (jsonb_typeof(words) = 'array'),
  CONSTRAINT vocab_sets_source_ck CHECK (source IN ('seed', 'ai')),
  CONSTRAINT vocab_sets_visibility_ck CHECK (visibility IN ('public', 'private'))
);

CREATE TABLE IF NOT EXISTS public.topic_contents (
  id          BIGSERIAL   PRIMARY KEY,
  topic_id    BIGINT      NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  lesson_id   BIGINT      REFERENCES public.lessons(id) ON DELETE CASCADE,
  scenario_id BIGINT      REFERENCES public.conversation_scenarios(id) ON DELETE CASCADE,
  vocab_set_id BIGINT     REFERENCES public.vocab_sets(id) ON DELETE CASCADE,
  position    INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT topic_contents_one_target_ck
    CHECK (num_nonnulls(lesson_id, scenario_id, vocab_set_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS topic_contents_lesson_uq
  ON public.topic_contents (topic_id, lesson_id) WHERE lesson_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS topic_contents_scenario_uq
  ON public.topic_contents (topic_id, scenario_id) WHERE scenario_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS topic_contents_vocab_set_uq
  ON public.topic_contents (topic_id, vocab_set_id) WHERE vocab_set_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS topic_contents_order_idx
  ON public.topic_contents (topic_id, position, id);

ALTER TABLE public.conversation_sessions
  ADD COLUMN IF NOT EXISTS scenario_id BIGINT REFERENCES public.conversation_scenarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversation_sessions_user_scenario_idx
  ON public.conversation_sessions (user_id, scenario_id) WHERE scenario_id IS NOT NULL;

