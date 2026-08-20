-- 0008_progress.sql — 학습 통계 탭 (docs/plan/04-progress.md Phase P1)
--
-- 계획서는 0007을 가정했으나 실측 결과 0007은 03-dashboard가 user_goals로 이미 선점했다.
-- 따라서 이 파일은 0008이며, user_goals는 재생성하지 않고 부족한 컬럼(target_test)만 덧붙인다.
-- (0007은 적용 완료 = 체크섬 대상이므로 수정 금지 — 고칠 것은 새 번호로.)
--
-- 이 탭의 유일한 신규 원본 데이터는 correction_reviews(첨삭 SRS 복습 로그)뿐이다.
-- 나머지 수치(스트릭·주간·스킬·예상 점수·최근 세션)는 전부 실시간 집계이므로 저장하지 않는다
-- (파생값 저장 금지 규범).

-- 첨삭 SRS 복습 로그 — vocab_reviews(0002_vocab.sql)와 1:1 동형.
-- corrections가 user_vocab_cards와 같은 SRS 컬럼 세트를 가진 이유가 이것 (srs.js 재사용).
CREATE TABLE IF NOT EXISTS public.correction_reviews (
  id                 BIGSERIAL    PRIMARY KEY,
  correction_id      BIGINT       NOT NULL REFERENCES public.corrections(id) ON DELETE CASCADE,
  user_id            BIGINT       NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  result             TEXT         NOT NULL,
  reviewed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  prev_interval_days INT          NOT NULL,
  prev_ease_factor   NUMERIC(4,2) NOT NULL,
  next_interval_days INT          NOT NULL,
  next_ease_factor   NUMERIC(4,2) NOT NULL,
  next_review        TIMESTAMPTZ  NOT NULL,
  elapsed_ms         INT,
  client_request_id  UUID,                                  -- 멱등키
  CONSTRAINT correction_reviews_result_ck CHECK (result IN ('again','hard','good','easy'))
);
CREATE INDEX IF NOT EXISTS correction_reviews_user_time_idx
  ON public.correction_reviews (user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS correction_reviews_correction_idx
  ON public.correction_reviews (correction_id, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS correction_reviews_reqid_uq
  ON public.correction_reviews (client_request_id) WHERE client_request_id IS NOT NULL;

-- 학습 목표에 시험 종류 추가 — 통계 탭 헤더("TOEIC 예상 점수")의 단일 소스.
-- 05-settings-auth가 이 컬럼의 편집 UI를 붙인다. users를 ALTER 하지 않는 이유는 0007 주석 참조.
ALTER TABLE public.user_goals
  ADD COLUMN IF NOT EXISTS target_test TEXT NOT NULL DEFAULT 'TOEIC';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_goals_test_ck') THEN
    ALTER TABLE public.user_goals
      ADD CONSTRAINT user_goals_test_ck CHECK (target_test IN ('TOEIC'));
  END IF;
END
$$;
