-- 0018_content_archived_public.down.sql — content_items_public_ck 를 baseline 의 초안으로 되돌린다
--
-- 경고 — 이 되돌리기는 데이터가 있으면 실패한다.
--   되돌린 CHECK 는 `archived + public` 을 금지하므로, up 이후에 만들어진 그런 행이 하나라도 남아 있으면
--   ADD CONSTRAINT 의 검증 단계에서 23514 로 실패하고 트랜잭션 전체가 롤백된다.
--   억지로 통과시키려면 그 행들을 private 으로 내려야 하는데, 그 순간 작성자가 아닌 학습자의
--   오답 노트·통계에서 해당 콘텐츠가 사라진다(플랜 11 결정 2 의 resolvable 이 무력화된다).
--   즉 이 down 은 "0018 을 적용한 직후 되돌리는" 경우에만 안전하다.
--
-- 되돌린 뒤의 상태는 기각된 초안(열린질문 7)이다. 운영에서 쓸 일이 없어야 정상이다.

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_public_ck;

ALTER TABLE content_items
  ADD CONSTRAINT content_items_public_ck
  CHECK (status = 'published' OR visibility = 'private');
