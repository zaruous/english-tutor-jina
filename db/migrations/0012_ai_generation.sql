-- 0012_ai_generation.sql — docs/plan/07 Phase 2
-- AI 생성 요청은 ai_jobs에 먼저 기록하고 API 프로세스의 워커가 최대 2건을 실행한다.
-- 생성 결과는 lesson_drafts에서 검증 이력을 남긴 뒤, 검증을 통과한 것만 private 레슨으로 게시한다.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

DO $$ BEGIN
  ALTER TABLE public.lessons
    ADD CONSTRAINT lessons_source_ck CHECK (source IN ('seed', 'ai'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.lessons
    ADD CONSTRAINT lessons_visibility_ck CHECK (visibility IN ('public', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.lesson_items
  ADD COLUMN IF NOT EXISTS skill_code TEXT;

DO $$ BEGIN
  ALTER TABLE public.lesson_items
    ADD CONSTRAINT lesson_items_skill_ck
    CHECK (skill_code IS NULL OR skill_code IN ('grammar', 'vocab', 'detail', 'inference', 'main_idea'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 기존 Part 7 문항도 이후 attempt부터 약점 코드가 채워지도록 규칙 기반 값을 선반영한다.
UPDATE public.lesson_items
   SET skill_code = CASE
     WHEN lower(stem) LIKE '%closest in meaning%' THEN 'vocab'
     WHEN lower(stem) LIKE '%purpose%' OR lower(stem) LIKE '%main%' THEN 'main_idea'
     WHEN lower(stem) LIKE '%imply%' OR lower(stem) LIKE '%infer%' THEN 'inference'
     ELSE 'detail'
   END
 WHERE skill_code IS NULL;

CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id                BIGSERIAL   PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
  CONSTRAINT ai_jobs_task_ck CHECK (task IN ('lesson_gen', 'scenario_gen', 'vocab_set')),
  CONSTRAINT ai_jobs_status_ck CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  CONSTRAINT ai_jobs_input_ck CHECK (jsonb_typeof(input) = 'object'),
  CONSTRAINT ai_jobs_result_ck CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  CONSTRAINT ai_jobs_attempts_ck CHECK (attempts BETWEEN 0 AND 10),
  CONSTRAINT ai_jobs_user_request_uq UNIQUE (user_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS ai_jobs_queue_idx
  ON public.ai_jobs (created_at, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS ai_jobs_user_recent_idx
  ON public.ai_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_jobs_user_hash_idx
  ON public.ai_jobs (user_id, task, request_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lesson_drafts (
  id                  BIGSERIAL   PRIMARY KEY,
  user_id             BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id              BIGINT      NOT NULL UNIQUE REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  payload             JSONB       NOT NULL,
  validation_errors   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  review_status       TEXT        NOT NULL DEFAULT 'draft',
  published_lesson_id BIGINT      UNIQUE REFERENCES public.lessons(id) ON DELETE SET NULL,
  provider            TEXT,
  model               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_drafts_payload_ck CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT lesson_drafts_errors_ck CHECK (jsonb_typeof(validation_errors) = 'array'),
  CONSTRAINT lesson_drafts_review_ck CHECK (review_status IN ('draft', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS lesson_drafts_user_idx
  ON public.lesson_drafts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lesson_reports (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lesson_id   BIGINT      NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  details     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_reports_reason_ck CHECK (reason IN ('incorrect_answer', 'ambiguous', 'language', 'other')),
  CONSTRAINT lesson_reports_details_ck CHECK (details IS NULL OR length(details) <= 1000),
  CONSTRAINT lesson_reports_user_lesson_uq UNIQUE (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS lesson_reports_lesson_idx
  ON public.lesson_reports (lesson_id, created_at DESC);

