-- 0019_content_revisions.sql — 콘텐츠 본문 이력 (플랜 11 열린 질문 3 해소)
--
-- 모델: 저장 1번 = 리비전 1행. rev N 은 N번째 저장 직후의 전체 편집본(snapshot)이고,
-- 현재 본문은 항상 최신 rev 와 같다. 복원도 과거 rev 를 새 rev 로 다시 저장하는 것이라
-- 이력이 지워지거나 갈라지지 않는다(append-only).
--
-- 승인관리와의 결합: content_audit_log 에 rev 를 스탬프해 "그 전이가 일어난 시점의 본문이
-- 어느 버전이었는지"를 남긴다 — 승인(status_change review→published) 행의 rev 가 곧
-- 검수자가 승인한 본문이다.

CREATE TABLE IF NOT EXISTS content_revisions (
  id         BIGSERIAL   PRIMARY KEY,
  content_id BIGINT      NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  rev        INT         NOT NULL,               -- 콘텐츠별 1부터 증가
  snapshot   JSONB       NOT NULL,               -- 에디터 페이로드 그대로 {kind,title,…,items}
  status_at  TEXT,                               -- 저장 시점의 status (참고 표시용)
  note       TEXT        NOT NULL DEFAULT '',    -- '생성' | '수정' | '복원 ← rev N' 등
  created_by BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_revisions_uq          UNIQUE (content_id, rev),
  CONSTRAINT content_revisions_rev_ck      CHECK (rev >= 1),
  CONSTRAINT content_revisions_snapshot_ck CHECK (jsonb_typeof(snapshot) = 'object')
);
CREATE INDEX IF NOT EXISTS content_revisions_content_idx ON content_revisions (content_id, rev DESC);

-- 감사 로그 ↔ 리비전 연결 + 'restore' 액션 허용
ALTER TABLE content_audit_log ADD COLUMN IF NOT EXISTS rev INT;
ALTER TABLE content_audit_log DROP CONSTRAINT content_audit_log_action_ck;
ALTER TABLE content_audit_log ADD CONSTRAINT content_audit_log_action_ck
  CHECK (action IN ('create','update','status_change','visibility_change','restore','delete'));
