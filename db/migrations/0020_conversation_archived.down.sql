-- 0020_conversation_archived.down.sql

DROP INDEX IF EXISTS conversation_sessions_user_active_idx;

ALTER TABLE conversation_sessions DROP COLUMN IF EXISTS archived_at;
