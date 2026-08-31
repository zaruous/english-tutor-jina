-- 메모: 0010 주석의 source='quiz' 는 오기 — 퀴즈 단어는 vocab_words.source='ai' 로 저장된다(vocab_words_source_ck 허용값). 적용된 0010 은 체크섬 때문에 고치지 않는다.
-- 0011_lesson_qa.sql — 레슨 Jina Q&A (docs/plan/07-topic-sections-ai-generation-toeic.md Phase 1)
--
-- lesson_qa_sessions: POST /api/lessons/:id/qa 의 CLI resume 핸들. 회화의
-- conversation_sessions.provider_ref / provider_ref_provider(0009) 와 같은 패턴이지만, 세션 키를
-- user + lesson + attempt + provider 로 격리한다 — 재도전(새 attempt)이나 다른 학습자의 문맥이 섞이지 않는다.
-- 제출 전(attempt 없음) 질문은 stateless 라 행을 만들지 않는다. Q&A 본문은 저장하지 않는다(파생/일시 데이터).
--
-- user_lesson_attempts.skill_code: 약점 분류 코드 선반영(Phase 1). 값 채우기는 후속 — 당장은 전부 NULL.

ALTER TABLE public.user_lesson_attempts
  ADD COLUMN IF NOT EXISTS skill_code TEXT;

COMMENT ON COLUMN public.user_lesson_attempts.skill_code IS
  '약점 분류 코드 (예: inference|detail|vocab). Phase 1 선반영 — NULL 허용, 채우기는 후속';

CREATE TABLE IF NOT EXISTS public.lesson_qa_sessions (
  id           BIGSERIAL   PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES public.users(id)                ON DELETE CASCADE,
  lesson_id    BIGINT      NOT NULL REFERENCES public.lessons(id)              ON DELETE CASCADE,
  attempt_id   BIGINT      NOT NULL REFERENCES public.user_lesson_attempts(id) ON DELETE CASCADE,
  provider     TEXT        NOT NULL,            -- claude | agy | codex | cursor (ollama 는 stateless 라 행 없음)
  provider_ref TEXT        NOT NULL,            -- CLI resume 핸들 (claude session_id / codex thread_id / …)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_qa_sessions_key_uq UNIQUE (user_id, lesson_id, attempt_id, provider)
);

COMMENT ON TABLE public.lesson_qa_sessions IS
  '레슨 Q&A(lesson_qa task)의 CLI 세션 resume 핸들. 키 = user+lesson+attempt+provider. 제출 전 질문은 stateless';
