-- 0018_content_public_ck.sql — status×visibility CHECK 를 확정안(후보 A)으로 교체 (플랜 11 Phase 1 선결)
--
-- baseline(0001) 이 넣은 CHECK (status = 'published' OR visibility = 'private') 는
-- 플랜 11 열린 질문 7 이 기각한 초안이다: archived + public 행이 저장되지 않아
-- 공개 콘텐츠를 내리는(published → archived) UPDATE 자체가 실패하고, 강제로 private 으로
-- 내리면 그 레슨을 푼 다른 학습자의 오답 노트에서 레슨이 사라진다(resolvable 무력화).
-- 확정안은 archived 가 이전 가시성을 보존한다 — draft·review 의 오발행 방지는 그대로다.

ALTER TABLE content_items DROP CONSTRAINT content_items_public_ck;
ALTER TABLE content_items ADD CONSTRAINT content_items_public_ck
  CHECK (status IN ('published', 'archived') OR visibility = 'private');

ALTER TABLE topics DROP CONSTRAINT topics_public_ck;
ALTER TABLE topics ADD CONSTRAINT topics_public_ck
  CHECK (status IN ('published', 'archived') OR visibility = 'private');
