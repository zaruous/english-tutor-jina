-- 0020_speaking_attempts.sql — 발음 평가 결과 저장 (플랜 10 Phase 3)
--
-- 서버 평가(POST /api/speaking/assess)가 성공했을 때만 1행 쌓인다 — v1 받아쓰기 일치율
-- (브라우저 STT)은 발음 점수가 아니므로 저장하지 않는다. 오디오 원본은 저장하지 않는다
-- (플랜 10 §5.2 — 폐기가 기본, 점수·단어별 분석만 남긴다).

CREATE TABLE IF NOT EXISTS speaking_attempts (
  id            BIGSERIAL   PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sentence_text TEXT        NOT NULL,
  source        TEXT,                    -- 문장 출처 태그 (listening|scenario|lesson|custom …)
  backend       TEXT        NOT NULL,    -- openpronounce | speechace
  pron_score    SMALLINT,
  accuracy      SMALLINT,
  fluency       SMALLINT,
  completeness  SMALLINT,
  prosody       SMALLINT,
  words         JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{word, score, expected_ipa, heard_ipa, phonemes}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT speaking_attempts_text_ck    CHECK (length(sentence_text) BETWEEN 1 AND 300),
  CONSTRAINT speaking_attempts_backend_ck CHECK (backend IN ('openpronounce', 'speechace')),
  CONSTRAINT speaking_attempts_words_ck   CHECK (jsonb_typeof(words) = 'array'),
  CONSTRAINT speaking_attempts_scores_ck  CHECK (
    (pron_score   IS NULL OR pron_score   BETWEEN 0 AND 100) AND
    (accuracy     IS NULL OR accuracy     BETWEEN 0 AND 100) AND
    (fluency      IS NULL OR fluency      BETWEEN 0 AND 100) AND
    (completeness IS NULL OR completeness BETWEEN 0 AND 100) AND
    (prosody      IS NULL OR prosody      BETWEEN 0 AND 100)
  )
);
CREATE INDEX IF NOT EXISTS speaking_attempts_user_time_idx ON speaking_attempts (user_id, created_at DESC);
