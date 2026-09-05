-- 0019_topics_archived_public.sql — topics_public_ck 를 확정안(후보 A)으로 교체 (플랜 13 Phase B 선결)
--
-- 무엇을 바꾸나
--   전: CHECK (status = 'published' OR visibility = 'private')
--   후: CHECK (status IN ('published','archived') OR visibility = 'private')
--
-- 왜 바꾸나 — 0018 이 content_items 에서 고친 것과 **같은 초안이 topics 에도 남아 있기 때문**이다.
--   근거: docs/plan/11-content-lifecycle-admin.md §6 열린질문 7 (후보 A 로 확정, 2026-09-03)
--   0001_baseline.sql 은 content_items 와 topics 두 테이블에 같은 문구의 CHECK 를 넣었는데,
--   0018 은 플랜 11 의 범위(콘텐츠 전이)만 보고 content_items 쪽만 교체했다. topics 는 그때까지
--   내리는(archived) 경로가 없어 드러나지 않았을 뿐, 같은 기각안이다.
--   플랜 13 Phase B 가 토픽을 만들고 공개하고 내리는 경로를 열면 두 가지가 깨진다:
--     (1) 공개된 토픽을 내리는 정상 전이(published+public → archived)가 CHECK 위반(23514)으로 실패한다.
--         토픽 전이는 content-status.js 의 assertTransition 을 그대로 쓰므로 표에서는 허용인데 DB 가 거부한다.
--     (2) 그것을 피하려고 가시성까지 private 으로 함께 내리면, 그 토픽으로 학습을 진행한 학습자의
--         주제별 진행률·통계에서 토픽이 통째로 사라진다. 결정 2 의 resolvable
--         (status IN ('published','archived') AND (visibility='public' OR created_by=<나>)) 이 토픽에서도 무력화된다.
--         archived 는 "새 학습을 막는 것"이지 "이미 한 학습의 근거를 지우는 것"이 아니다.
--   좁힌 형태는 draft·review 의 오발행 방지(공개 상태가 아닌데 public)는 그대로 유지한다.
--
-- 왜 baseline 을 안 고치나 — 0001 은 이미 적용되어 SHA-256 체크섬이 고정됐다. 손대면 러너가 즉시 실패한다.
--   그래서 새 번호로 같은 이름의 제약을 교체한다. **이 파일을 되돌려 초안으로 돌아가지 말 것.**
--
-- 멱등 — ADD CONSTRAINT 에는 IF NOT EXISTS 가 없으므로 DROP IF EXISTS 를 앞세워 짝으로 멱등하게 만든다.
--   새 제약은 옛 제약의 완화형이라 기존 행은 전부 통과한다(ADD 시 검증 실패 없음).

ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_public_ck;

ALTER TABLE topics
  ADD CONSTRAINT topics_public_ck
  CHECK (status IN ('published', 'archived') OR visibility = 'private');
