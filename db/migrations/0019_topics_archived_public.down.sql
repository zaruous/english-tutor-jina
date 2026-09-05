-- 0019_topics_archived_public.down.sql — topics_public_ck 를 baseline 의 초안으로 되돌린다
--
-- 경고 — 이 되돌리기는 데이터가 있으면 실패한다.
--   되돌린 CHECK 는 `archived + public` 을 금지하므로, up 이후에 내린(archived) 공개 토픽이 하나라도 남아 있으면
--   ADD CONSTRAINT 의 검증 단계에서 23514 로 실패하고 트랜잭션 전체가 롤백된다.
--   억지로 통과시키려면 그 행들을 private 으로 내려야 하는데, 그 순간 작성자가 아닌 학습자의
--   주제별 진행률·통계에서 해당 토픽이 사라진다(플랜 11 결정 2 의 resolvable 이 무력화된다).
--   즉 이 down 은 "0019 를 적용한 직후 되돌리는" 경우에만 안전하다.
--
-- 되돌린 뒤의 상태는 기각된 초안(플랜 11 열린질문 7)이다. 운영에서 쓸 일이 없어야 정상이다.

ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_public_ck;

ALTER TABLE topics
  ADD CONSTRAINT topics_public_ck
  CHECK (status = 'published' OR visibility = 'private');
