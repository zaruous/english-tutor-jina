-- 0010_vocab_quizzes.sql — 단어장 '오늘의 단어' AI 퀴즈 (docs/plan/06-vocab-daily-quiz.md)
-- 퀴즈 1행 = AI가 주제(kind/keyword)에 맞춰 만든 10단어 세트(words JSONB, 사전 정보 + 오답 보기 3개).
-- 채점(answers/score)은 서버가 하고, 단어장 추가는 words 의 사전 정보를 그대로 vocab_words/user_vocab_cards 에
-- 넣는다(AI 재호출 없음, source='ai'). "오늘의 퀴즈" = APP_TZ 기준 오늘 만든 가장 최근 행.

CREATE TABLE IF NOT EXISTS public.vocab_quizzes (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind         TEXT         NOT NULL,            -- random | news | game | blog | keyword
  keyword      TEXT,                             -- kind='keyword' 일 때 사용자 입력, 그 외 NULL
  topic_title  TEXT         NOT NULL,            -- AI가 정한 짧은 한국어 주제 제목
  topic_ko     TEXT,                             -- 주제 한 줄 설명
  words        JSONB        NOT NULL,            -- [{word,pos,ipa,meaning_ko,example_en,example_ko,distractors_ko[3],difficulty}] x10
  answers      JSONB,                            -- 완료 시 [{index,choice,correct}]
  score        SMALLINT,                         -- 정답 수 (0~10)
  provider     TEXT,
  model        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT vocab_quizzes_kind_ck  CHECK (kind IN ('random', 'news', 'game', 'blog', 'keyword')),
  CONSTRAINT vocab_quizzes_score_ck CHECK (score IS NULL OR score BETWEEN 0 AND 10)
);

-- "오늘의 퀴즈" 조회: 사용자별 최신순
CREATE INDEX IF NOT EXISTS vocab_quizzes_user_created_idx
  ON public.vocab_quizzes (user_id, created_at DESC);
