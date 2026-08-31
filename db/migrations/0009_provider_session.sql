-- 0009_provider_session.sql — 회화 세션의 CLI resume 핸들 (v1 stateless → 하이브리드)
-- provider_ref(0004에서 예약)는 provider별 세션 id(claude session_id / codex thread_id /
-- agy conversation_id / cursor chat id)를 담는다. 어느 provider의 핸들인지 알아야 재사용할 수
-- 있으므로 provider 컬럼을 짝으로 둔다.
-- 히스토리는 여전히 DB가 단일 소스 — resume 실패(세션 파일 없음·다른 머신)나 provider 전환 시
-- 서버가 히스토리 재전송(새 세션)으로 폴백한다. 기존 행은 NULL → 다음 턴에 히스토리로 시작해 핸들을 채운다.

ALTER TABLE public.conversation_sessions
  ADD COLUMN IF NOT EXISTS provider_ref_provider TEXT;

COMMENT ON COLUMN public.conversation_sessions.provider_ref IS
  'CLI resume 핸들 (provider_ref_provider 의 세션 id). NULL 이면 다음 턴은 히스토리 재전송으로 시작';
COMMENT ON COLUMN public.conversation_sessions.provider_ref_provider IS
  'provider_ref 가 속한 provider id (claude|agy|codex|cursor). ollama 는 stateless 라 NULL';
