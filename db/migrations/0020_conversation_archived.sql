-- 0020_conversation_archived.sql — 회화 세션 보관(사이드바 숨김, 데이터 유지)
--
-- archived_at IS NULL  → 최근 세션 목록에 표시
-- archived_at IS NOT NULL → 보관됨 (첨삭·통계는 그대로)

ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversation_sessions_user_active_idx
  ON conversation_sessions (user_id, COALESCE(last_message_at, started_at) DESC)
  WHERE archived_at IS NULL;
