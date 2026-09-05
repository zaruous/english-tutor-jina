-- 0018_content_public_ck.down.sql — CHECK 를 baseline 초안 형태로 되돌린다.
-- archived + public 행이 이미 있으면 되돌리기가 실패한다 — 먼저 해당 행을 private 으로 바꿀 것.

ALTER TABLE content_items DROP CONSTRAINT content_items_public_ck;
ALTER TABLE content_items ADD CONSTRAINT content_items_public_ck
  CHECK (status = 'published' OR visibility = 'private');

ALTER TABLE topics DROP CONSTRAINT topics_public_ck;
ALTER TABLE topics ADD CONSTRAINT topics_public_ck
  CHECK (status = 'published' OR visibility = 'private');
