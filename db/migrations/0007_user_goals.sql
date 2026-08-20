-- 0007_user_goals.sql — 대시보드 탭 (docs/plan/03-dashboard.md Phase 1)
-- 대시보드의 유일한 신규 테이블. 나머지 수치(스트릭/주간/정확도/예상점수/추천)는
-- vocab_reviews / user_lesson_attempts / conversation_messages 실시간 집계이므로
-- 저장하지 않는다 (파생값 저장 금지 규범). daily_progress 적재는 v2 후속.
-- 행이 없는 사용자는 서비스가 {target_score:900, exam_date:null}을 INSERT 없이 합성한다.

CREATE TABLE IF NOT EXISTS public.user_goals (
  user_id       BIGINT      PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  target_score  SMALLINT    NOT NULL DEFAULT 900,
  exam_date     DATE,                              -- null 허용 → D-day 배지 숨김
  daily_minutes SMALLINT    NOT NULL DEFAULT 35,   -- 후속(오늘의 학습 목표 게이지)용, v1 미사용
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_goals_target_ck  CHECK (target_score BETWEEN 10 AND 990),
  CONSTRAINT user_goals_daily_ck   CHECK (daily_minutes BETWEEN 5 AND 600)
);

-- 인덱스 불필요: PK(user_id) 단건 조회뿐.
