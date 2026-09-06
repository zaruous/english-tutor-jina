-- 0019_content_revisions.down.sql — 리비전 이력 제거.
-- 'restore' 행이 이미 쌓였다면 CHECK 원복이 실패한다 — 먼저 해당 행을 지울 것.

DROP TABLE IF EXISTS content_revisions;
ALTER TABLE content_audit_log DROP COLUMN IF EXISTS rev;
ALTER TABLE content_audit_log DROP CONSTRAINT content_audit_log_action_ck;
ALTER TABLE content_audit_log ADD CONSTRAINT content_audit_log_action_ck
  CHECK (action IN ('create','update','status_change','visibility_change','delete'));
