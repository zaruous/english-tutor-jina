-- 0018_content_archived_public.sql — content_items_public_ck 를 확정안(후보 A)으로 교체 (플랜 11 Phase 1 선결)
--
-- 무엇을 바꾸나
--   전: CHECK (status = 'published' OR visibility = 'private')
--   후: CHECK (status IN ('published','archived') OR visibility = 'private')
--
-- 왜 바꾸나 — baseline 에 들어간 쪽이 결정이 아니라 **기각된 초안**이기 때문이다.
--   근거: docs/plan/11-content-lifecycle-admin.md §6 열린질문 7 (후보 A 로 확정, 2026-09-03)
--         + §2 결정 2(archived 는 이력에 남고 새 시도만 막는다)
--   0001_baseline.sql 이 초안 문구를 그대로 옮겨 담았고, 그 아래에서는 `archived + public` 행이
--   아예 저장되지 않는다. 그래서 두 가지가 깨진다:
--     (1) 공개된 콘텐츠를 내리는 정상 전이(published+public → archived)가 CHECK 위반으로 실패한다.
--     (2) 그것을 피하려고 가시성까지 private 으로 함께 내리면, 그 레슨을 이미 푼 **작성자가 아닌**
--         학습자의 오답 노트·통계·Q&A 에서 레슨이 통째로 사라진다. 결정 2 의 가시성 헬퍼
--         resolvable(status IN ('published','archived') AND (visibility='public' OR created_by=<나>))
--         이 통째로 무력화된다 — archived 는 "새 학습을 막는 것"이지 "이미 한 학습의 근거를 지우는 것"이 아니다.
--   좁힌 형태는 draft·review 의 오발행 방지(공개 상태가 아닌데 public)는 그대로 유지한다.
--
-- 왜 baseline 을 안 고치나 — 0001 은 이미 적용되어 SHA-256 체크섬이 고정됐다. 손대면 러너가 즉시 실패한다.
--   그래서 새 번호로 같은 이름의 제약을 교체한다. **이 파일을 되돌려 초안으로 돌아가지 말 것.**
--
-- 멱등 — ADD CONSTRAINT 에는 IF NOT EXISTS 가 없으므로 DROP IF EXISTS 를 앞세워 짝으로 멱등하게 만든다.
--   새 제약은 옛 제약의 완화형이라 기존 행은 전부 통과한다(ADD 시 검증 실패 없음).

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_public_ck;

ALTER TABLE content_items
  ADD CONSTRAINT content_items_public_ck
  CHECK (status IN ('published', 'archived') OR visibility = 'private');
