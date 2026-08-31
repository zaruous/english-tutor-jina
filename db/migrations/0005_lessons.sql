-- 0005_lessons.sql — TOEIC 학습 탭 영속화 (docs/plan/02-lesson.md Phase 1)
-- lessons: 지문/표시용 어휘/FAQ (사용자 무관 콘텐츠)
-- lesson_items: 문항 — 정답(answer)/해설(explanation)은 이 테이블에만 존재,
--               GET DTO에서는 컬럼 나열로 구조적으로 제외된다.
-- user_lesson_attempts: 채점 이벤트의 사실 기록 (progress.done/total은 매 요청 집계)

CREATE TABLE IF NOT EXISTS public.lessons (
  id           BIGSERIAL   PRIMARY KEY,
  slug         TEXT        NOT NULL,                       -- 'toeic-part7-set23' (mock id 이관)
  kind         TEXT        NOT NULL DEFAULT 'toeic_part7',
  title        TEXT        NOT NULL,                       -- 'TOEIC Part 7 — 단일 지문'
  subtitle     TEXT        NOT NULL DEFAULT '',            -- 'Set 23 · 비즈니스 이메일'
  difficulty   SMALLINT    NOT NULL DEFAULT 3,
  est_minutes  SMALLINT    NOT NULL DEFAULT 6,
  passage      JSONB       NOT NULL,                       -- {type,from,to,cc,date,subject,body:[]}
  vocab        JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{word,ipa,pos,meaning,ex}] 표시용
  faq          JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- Jina 패널 추천 질문 (문자열 배열)
  position     INT         NOT NULL DEFAULT 0,             -- 목록/'다음 지문' 순서
  published    BOOLEAN     NOT NULL DEFAULT true,
  created_by   BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lessons_slug_key      UNIQUE (slug),
  CONSTRAINT lessons_kind_ck       CHECK (kind IN ('toeic_part5','toeic_part7')),
  CONSTRAINT lessons_difficulty_ck CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT lessons_passage_ck    CHECK (jsonb_typeof(passage) = 'object'),
  CONSTRAINT lessons_vocab_ck      CHECK (jsonb_typeof(vocab) = 'array'),
  CONSTRAINT lessons_faq_ck        CHECK (jsonb_typeof(faq) = 'array')
);
CREATE INDEX IF NOT EXISTS lessons_position_idx ON public.lessons (position, id) WHERE published;

CREATE TABLE IF NOT EXISTS public.lesson_items (
  id          BIGSERIAL   PRIMARY KEY,
  lesson_id   BIGINT      NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  position    SMALLINT    NOT NULL,                        -- 화면의 q.n (1부터)
  stem        TEXT        NOT NULL,
  options     JSONB       NOT NULL,                        -- [{id:'A',text:'…'}] ★correct 플래그 없음
  answer      TEXT        NOT NULL,                        -- 정답 옵션 id. GET DTO 제외, 채점 응답에만
  explanation TEXT        NOT NULL DEFAULT '',             -- Jina 해설 (아이템 데이터로 이관 = 해설 버그 해소)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_items_lesson_pos_uq UNIQUE (lesson_id, position),
  CONSTRAINT lesson_items_position_ck   CHECK (position BETWEEN 1 AND 50),
  CONSTRAINT lesson_items_answer_ck     CHECK (answer ~ '^[A-Z]$'),
  CONSTRAINT lesson_items_options_ck    CHECK (jsonb_typeof(options) = 'array'
                                          AND jsonb_array_length(options) BETWEEN 2 AND 6)
);
CREATE INDEX IF NOT EXISTS lesson_items_lesson_idx ON public.lesson_items (lesson_id, position);

CREATE TABLE IF NOT EXISTS public.user_lesson_attempts (
  id                BIGSERIAL   PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  lesson_id         BIGINT      NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  answers           JSONB       NOT NULL,   -- {"1":"B","2":"C","3":"B"} (position 문자열 → 옵션 id)
  correct_count     SMALLINT    NOT NULL,   -- 채점 시점 사실 기록 (vocab_reviews의 prev/next와 같은 성격)
  total_count       SMALLINT    NOT NULL,
  elapsed_ms        INT,
  client_request_id UUID,                   -- 멱등키 (vocab_reviews 패턴)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ula_answers_ck CHECK (jsonb_typeof(answers) = 'object'),
  CONSTRAINT ula_counts_ck  CHECK (correct_count >= 0 AND total_count >= 1
                              AND correct_count <= total_count)
);
CREATE INDEX IF NOT EXISTS ula_user_lesson_idx ON public.user_lesson_attempts (user_id, lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ula_user_time_idx   ON public.user_lesson_attempts (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ula_reqid_uq ON public.user_lesson_attempts (client_request_id)
  WHERE client_request_id IS NOT NULL;
