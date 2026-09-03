-- 0001_baseline.sql — 전용 DB `jina_eng` / 전용 스키마 `app` 의 기반 스키마
--
-- 플랜: docs/plan/10.7-db-rebaseline.md §3.1 · §3.3 · §3.4
-- 전제: 옛 DB `jina` 는 열지 않는다. 이 파일은 빈 DB 에서 한 번에 돈다.
--
-- ⚠ 미완성 — 이 파일은 **사용자 · 권한 · 콘텐츠 승인** 영역만 담는다.
--   학습 콘텐츠 detail(lesson/scenario/vocab_set), 진도, 회화, ai_jobs, topics 는
--   10.7 Phase 2 에서 이 파일 뒤에 이어 쓴다. 그전까지 앱은 이 스키마로 부팅되지 않는다.
--   완료 목록은 db/baseline/README.md 의 체크리스트.
--
-- 규약 (10.7 §3.4):
--   · 모든 테이블 = 고유 컬럼 + 공통 컬럼 세트. 공통 세트는 §2 의 DO 루프가 **한 곳에서** 붙인다.
--   · description 컬럼(행 설명) + COMMENT ON(스키마 문서) 둘 다 단다.
--   · soft delete 이므로 UNIQUE 는 `WHERE NOT is_deleted` 부분 인덱스로 건다.
--   · 확장 슬롯 cmf_1~cmf_10. 쓰기 시작하면 그 자리에서 COMMENT ON COLUMN 을 단다.

-- =====================================================================
-- 1. 스키마 · 공용 함수
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS app;
SET search_path = app;

-- updated_at 은 앱이 아니라 트리거가 채운다 — 쿼리마다 `updated_at = now()` 를 흩뿌리지 않기 위해서.
CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

COMMENT ON FUNCTION app.set_updated_at() IS
  '공통 컬럼 updated_at 자동 갱신. 공통 컬럼을 가진 모든 테이블에 BEFORE UPDATE 로 붙는다.';


-- =====================================================================
-- 2. 테이블 — 고유 컬럼만. 공통 컬럼은 §3 에서 일괄로 붙인다.
-- =====================================================================

-- ── 권한 ──────────────────────────────────────────────────────────────
-- 서열형. 등급을 늘리는 것이 CHECK 수정이 아니라 INSERT 가 되게 한다.
CREATE TABLE app.roles (
  code TEXT     PRIMARY KEY,
  rank SMALLINT NOT NULL,
  name TEXT     NOT NULL
);

-- ── 사용자 ────────────────────────────────────────────────────────────
CREATE TABLE app.users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT      NOT NULL,
  display_name  TEXT      NOT NULL DEFAULT '',
  password_hash TEXT      NOT NULL,
  tz            TEXT      NOT NULL DEFAULT 'Asia/Seoul',
  role          TEXT      NOT NULL DEFAULT 'learner',
  is_dev        BOOLEAN   NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  CONSTRAINT users_email_lower_ck CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_shape_ck CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- 세션. 공통 컬럼을 붙이지 않는다 — 수명이 짧고 revoked_at 이 이미 소프트 폐기다.
-- common:exempt auth_sessions  (db/verify.mjs 가 읽는 면제 선언. 이유 없이 늘리지 말 것)
CREATE TABLE app.auth_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      BIGINT      NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash   BYTEA       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent   TEXT,
  ip           INET,
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT auth_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_sessions_exp_ck         CHECK (expires_at > created_at)
);

-- ── 콘텐츠 상태 · 전이 (승인 관리의 뼈대) ──────────────────────────────
CREATE TABLE app.content_statuses (
  code TEXT     PRIMARY KEY,
  rank SMALLINT NOT NULL,
  name TEXT     NOT NULL
);

-- 허용된 전이 allowlist. 행이 없는 조합은 금지이며 409 로 거절한다.
CREATE TABLE app.content_transitions (
  from_status TEXT NOT NULL REFERENCES app.content_statuses(code) ON UPDATE CASCADE,
  to_status   TEXT NOT NULL REFERENCES app.content_statuses(code) ON UPDATE CASCADE,
  min_role    TEXT NOT NULL REFERENCES app.roles(code)            ON UPDATE CASCADE,
  label       TEXT NOT NULL,
  PRIMARY KEY (from_status, to_status),
  CONSTRAINT content_transitions_self_ck CHECK (from_status <> to_status)
);

-- ── 콘텐츠 ────────────────────────────────────────────────────────────
CREATE TABLE app.content_items (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT      NOT NULL,
  slug       TEXT      NOT NULL,
  title      TEXT      NOT NULL,
  difficulty SMALLINT  NOT NULL DEFAULT 3,
  status     TEXT      NOT NULL DEFAULT 'draft'
                       REFERENCES app.content_statuses(code) ON UPDATE CASCADE,
  visibility TEXT      NOT NULL DEFAULT 'private',
  source     TEXT      NOT NULL DEFAULT 'seed',
  CONSTRAINT content_items_type_ck   CHECK (type IN ('lesson','scenario','vocab_set','speaking_set')),
  CONSTRAINT content_items_vis_ck    CHECK (visibility IN ('public','private')),
  CONSTRAINT content_items_source_ck CHECK (source IN ('seed','ai','curated')),
  CONSTRAINT content_items_diff_ck   CHECK (difficulty BETWEEN 1 AND 5),
  -- draft·review 는 public 이 될 수 없다(오발행 방지). archived 는 이전 가시성을 유지해야
  -- 내린 콘텐츠가 오답 노트·통계에 남는다 — 11 열린 질문 7 → 후보 A.
  CONSTRAINT content_items_pub_ck    CHECK (status IN ('published','archived') OR visibility = 'private')
);

-- ── 감사 (append-only) ────────────────────────────────────────────────
-- 수정·삭제 컬럼을 두지 않는다. 고쳐지는 감사 기록은 감사 기록이 아니다.
CREATE TABLE app.content_audit_log (
  id              BIGSERIAL   PRIMARY KEY,
  content_id      BIGINT      NOT NULL REFERENCES app.content_items(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,
  from_status     TEXT        REFERENCES app.content_statuses(code) ON UPDATE CASCADE,
  to_status       TEXT        REFERENCES app.content_statuses(code) ON UPDATE CASCADE,
  from_visibility TEXT,
  to_visibility   TEXT,
  self_review     BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_audit_action_ck
    CHECK (action IN ('create','update','status_change','visibility_change','delete'))
);

CREATE TABLE app.user_audit_log (
  id             BIGSERIAL   PRIMARY KEY,
  target_user_id BIGINT      NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  action         TEXT        NOT NULL,
  from_role      TEXT        REFERENCES app.roles(code) ON UPDATE CASCADE,
  to_role        TEXT        REFERENCES app.roles(code) ON UPDATE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_audit_action_ck
    CHECK (action IN ('role_change','session_revoke','disable','enable','delete'))
);


-- =====================================================================
-- 3. 공통 컬럼 — 한 곳에서 붙인다. 테이블마다 손으로 쓰면 반드시 어긋난다.
-- =====================================================================

DO $$
DECLARE
  -- 전체 세트: description · 사용/삭제 여부 · 생성/수정/삭제 이력 · cmf_1~10
  full_set TEXT[] := ARRAY['roles','users','content_statuses','content_transitions','content_items'];
  -- append-only 로그: description · 행위자(created_by) · cmf_1~10 만
  log_set  TEXT[] := ARRAY['content_audit_log','user_audit_log'];
  t TEXT;
  i INT;
BEGIN
  FOREACH t IN ARRAY full_set || log_set LOOP
    EXECUTE format('ALTER TABLE app.%I ADD COLUMN description TEXT NOT NULL DEFAULT %L', t, '');
    FOR i IN 1..10 LOOP
      EXECUTE format('ALTER TABLE app.%I ADD COLUMN cmf_%s TEXT', t, i);
    END LOOP;
  END LOOP;

  FOREACH t IN ARRAY log_set LOOP
    -- 로그의 created_at 은 테이블 정의에 이미 있다. 행위자만 붙인다.
    EXECUTE format(
      'ALTER TABLE app.%I ADD COLUMN created_by BIGINT REFERENCES app.users(id) ON DELETE SET NULL', t);
  END LOOP;

  FOREACH t IN ARRAY full_set LOOP
    EXECUTE format($f$
      ALTER TABLE app.%1$I
        ADD COLUMN is_active  BOOLEAN     NOT NULL DEFAULT true,
        ADD COLUMN is_deleted BOOLEAN     NOT NULL DEFAULT false,
        ADD COLUMN deleted_at TIMESTAMPTZ,
        ADD COLUMN deleted_by BIGINT      REFERENCES app.users(id) ON DELETE SET NULL,
        ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN created_by BIGINT      REFERENCES app.users(id) ON DELETE SET NULL,
        ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN updated_by BIGINT      REFERENCES app.users(id) ON DELETE SET NULL,
        ADD CONSTRAINT %2$I CHECK (is_deleted = (deleted_at IS NOT NULL))
    $f$, t, t || '_del_ck');

    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()',
      'trg_' || t || '_updated', t);
  END LOOP;
END $$;

-- users.role 은 공통 컬럼이 다 붙은 뒤에 FK 를 건다(roles 가 먼저 존재해야 하는 순환 회피).
ALTER TABLE app.users
  ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES app.roles(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;


-- =====================================================================
-- 4. 인덱스 — soft delete 때문에 UNIQUE 는 전부 부분 인덱스다.
-- =====================================================================

CREATE UNIQUE INDEX roles_rank_uq         ON app.roles (rank)          WHERE NOT is_deleted;
CREATE UNIQUE INDEX content_statuses_rank_uq ON app.content_statuses (rank) WHERE NOT is_deleted;

-- 삭제된 행이 이메일·slug 를 계속 붙들면 같은 값으로 다시 만들 수 없다.
CREATE UNIQUE INDEX users_email_uq        ON app.users (email)         WHERE NOT is_deleted;
CREATE UNIQUE INDEX content_items_slug_uq ON app.content_items (slug)  WHERE NOT is_deleted;

CREATE INDEX users_role_idx ON app.users (role) WHERE role <> 'learner' AND NOT is_deleted;

CREATE INDEX content_items_live_idx  ON app.content_items (type, id)
  WHERE status = 'published' AND is_active AND NOT is_deleted;
CREATE INDEX content_items_queue_idx ON app.content_items (updated_at DESC)
  WHERE status = 'review' AND NOT is_deleted;

CREATE INDEX auth_sessions_user_idx    ON app.auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_idx ON app.auth_sessions (expires_at);

CREATE INDEX content_audit_target_idx ON app.content_audit_log (content_id, created_at DESC);
CREATE INDEX user_audit_target_idx    ON app.user_audit_log (target_user_id, created_at DESC);


-- =====================================================================
-- 5. 조회 데이터 — 규칙이 코드가 아니라 데이터로 산다.
-- =====================================================================

INSERT INTO app.roles (code, rank, name, description) VALUES
  ('learner',  10, '학습자', '학습만 한다. 관리 API 는 전부 403.'),
  ('author',   20, '저작자', '콘텐츠 생성·수정, 검수 요청(draft → review).'),
  ('reviewer', 30, '검수자', '저작자 권한에 더해 승인·반려·공개·내림.'),
  ('admin',    40, '관리자', '검수자 권한에 더해 시스템 조작(사이드카·health force)과 역할 부여.');

INSERT INTO app.content_statuses (code, rank, name, description) VALUES
  ('draft',     10, '초안', '작성 중. 어떤 학습 API 에도 나오지 않는다.'),
  ('review',    20, '검토', '검수 대기. 학습 API 에 나오지 않는다.'),
  ('published', 30, '공개', '학습자에게 노출된다(visibility 가 public 일 때).'),
  ('archived',  40, '내림', '새 시도는 막지만 이미 푼 사용자의 오답 노트·통계에는 남는다.');

INSERT INTO app.content_transitions (from_status, to_status, min_role, label, description) VALUES
  ('draft',     'review',    'author',   '검수 요청', '저작자가 스스로 올린다.'),
  ('review',    'published', 'reviewer', '승인',      'visibility 는 건드리지 않는다. 공개는 별도 조작.'),
  ('review',    'draft',     'reviewer', '반려',      '사유는 content_audit_log.description 에 남긴다.'),
  ('draft',     'published', 'reviewer', '바로 공개', '검수를 생략하는 경로. author 는 할 수 없다.'),
  ('published', 'archived',  'reviewer', '내림',      'visibility 를 보존하므로 되올리면 그대로 돌아온다.'),
  ('archived',  'published', 'reviewer', '다시 공개', '');
-- published → draft 는 일부러 넣지 않는다. 되돌리려면 archived 를 거친다.


-- =====================================================================
-- 6. COMMENT ON — \d+ 와 obj_description() 으로 읽힌다. 스키마가 곧 문서다.
-- =====================================================================

COMMENT ON SCHEMA app IS 'Jina English Tutor 전용 스키마. db:reset 은 이 스키마만 통째로 드롭한다.';

COMMENT ON TABLE  app.roles             IS '권한 등급 정의. 서열형이라 상위 등급이 하위 등급을 포함한다.';
COMMENT ON COLUMN app.roles.rank        IS '서열값. 클수록 상위. 권한 검사는 rank 비교 한 줄로 끝난다. 사이에 끼울 수 있도록 10 단위로 띄운다.';
COMMENT ON COLUMN app.roles.description IS '관리 화면 역할 드롭다운에 그대로 노출되는 설명. 문구를 코드에 박지 않는다.';

COMMENT ON TABLE  app.users           IS '앱 사용자. 권한은 role 한 축이고 is_admin 불리언은 없다.';
COMMENT ON COLUMN app.users.role      IS 'roles.code. resolveSession 이 요청마다 JOIN 해 읽으므로 변경이 다음 요청부터 적용된다 — 세션 토큰에 싣지 말 것.';
COMMENT ON COLUMN app.users.is_active IS '사용 여부. false 면 로그인·세션 해석이 즉시 막힌다. 언제 누가 껐는지는 user_audit_log.';
COMMENT ON COLUMN app.users.is_dev    IS 'DEV_AUTOLOGIN 대상 시드 계정 표시. 권한과 무관하다(권한은 role).';

COMMENT ON TABLE  app.auth_sessions            IS '로그인 세션. 공통 컬럼을 붙이지 않는다 — 수명이 짧고 revoked_at 이 이미 소프트 폐기다.';
COMMENT ON COLUMN app.auth_sessions.token_hash IS 'sha256(쿠키 원문). 원문은 저장하지 않는다.';

COMMENT ON TABLE  app.content_statuses      IS '콘텐츠 생명주기 상태. 화면 라벨·설명의 단일 소스이며, 조회 가시성 규칙은 여기가 아니라 api/lib/content-scope.js 가 갖는다.';
COMMENT ON COLUMN app.content_statuses.rank IS '관리 목록 정렬용. 권한 rank 와 무관하다.';

COMMENT ON TABLE  app.content_transitions          IS '허용된 상태 전이 allowlist. 행이 없는 조합은 금지이며 409 로 거절한다. canTransition(from,to,role) 이 이 표를 읽는다.';
COMMENT ON COLUMN app.content_transitions.min_role IS '이 전이에 필요한 최소 역할(roles.code). 미만이면 403 — 상태 문제인 409 와 구분한다.';
COMMENT ON COLUMN app.content_transitions.label    IS '관리 화면 [▾] 메뉴에 그대로 쓰는 문구.';

COMMENT ON TABLE  app.content_items            IS '콘텐츠 4종의 공통 상위. 가시성·감사·토픽 구성이 전부 이 테이블만 본다. 종류별 본문은 *_details 에 있다(10.7 Phase 2).';
COMMENT ON COLUMN app.content_items.type       IS '종류. detail 테이블과 1:1 로 묶이므로 조회 테이블이 아니라 CHECK 로 둔다(코드가 알아야 하는 값).';
COMMENT ON COLUMN app.content_items.status     IS '생명주기(작성자·관리자 관점). 승인 상태의 단일 소스 — lesson_drafts.review_status 는 쓰지 않는다.';
COMMENT ON COLUMN app.content_items.visibility IS '누가 볼 수 있나(public 전체 / private 만든 사람). status 와 별개 축이고 내려도 보존된다.';

COMMENT ON TABLE  app.content_audit_log             IS 'append-only. 상태·가시성 전이와 저작 행위를 남긴다. 수정·삭제 컬럼을 두지 않는다 — 고쳐지는 감사 기록은 감사 기록이 아니다.';
COMMENT ON COLUMN app.content_audit_log.created_by  IS '행위자. ON DELETE SET NULL — 계정을 지워도 기록은 남는다.';
COMMENT ON COLUMN app.content_audit_log.self_review IS '만든 사람이 스스로 승인했는지. 1인 운영에서는 참이 정상이며, REQUIRE_SEPARATE_REVIEWER 를 켜면 애초에 403 이 된다.';
COMMENT ON COLUMN app.content_audit_log.description IS '반려 사유 등 자유 기술.';

COMMENT ON TABLE  app.user_audit_log IS 'append-only. 역할 변경·세션 강제 종료·계정 사용중지/삭제. content_audit_log 와 나눈 이유는 그쪽 content_id 가 content_items 를 향한 진짜 FK 라서다.';
