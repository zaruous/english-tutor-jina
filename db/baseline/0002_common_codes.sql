-- 0002_common_codes.sql — 기준정보(공통 코드) 관리
--
-- 플랜: docs/plan/10.7-db-rebaseline.md §3.5
--
-- 왜 필요한가 (실측 2026-09-03): 지금 열거값이 **두 곳으로 갈라져 있다.**
--   · 허용값은 DB CHECK 에      — lesson_items_skill_ck, corrections_type_ck, lessons_kind_ck …
--   · 한글 라벨·색은 클라이언트에 — src/screens/mistakes.jsx:9 SKILL_LABELS,
--                                  src/screens/conversation-desktop.jsx:152 CORRECTION_TYPE_META
--   mistakes.jsx 주석이 "값은 lesson_items_skill_ck 가 허용하는 5종" 이라고 적어 둔 것이
--   두 곳을 사람이 손으로 맞추고 있다는 증거다. 코드를 하나 늘리면 두 파일을 고쳐야 한다.
--
-- 경계 (중요): 이 테이블은 **긴 꼬리**만 담는다.
--   · 전용 테이블로 남기는 것 — 다른 테이블이 FK 로 참조하거나(roles, content_statuses),
--     값에 동작이 딸려 있는 것(roles.rank 서열 비교, content_transitions 전이 규칙).
--     여기로 옮기면 진짜 FK 를 잃는다 = 명백한 후퇴.
--   · 여기로 오는 것 — 화면 라벨·필터 칩·드롭다운. 코드가 늘어도 로직이 안 바뀌는 것.

SET search_path = app;

-- =====================================================================
-- 1. 테이블
-- =====================================================================

CREATE TABLE app.code_groups (
  group_code TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE app.codes (
  group_code  TEXT     NOT NULL REFERENCES app.code_groups(group_code) ON UPDATE CASCADE,
  code        TEXT     NOT NULL,
  name        TEXT     NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  parent_code TEXT,
  color       TEXT,
  icon        TEXT,
  is_system   BOOLEAN  NOT NULL DEFAULT false,
  PRIMARY KEY (group_code, code),
  -- 같은 그룹 안에서만 계층을 만든다. parent_code 가 NULL 이면 MATCH SIMPLE 규칙상 검사하지 않는다.
  CONSTRAINT codes_parent_fk FOREIGN KEY (group_code, parent_code)
    REFERENCES app.codes(group_code, code) ON UPDATE CASCADE,
  CONSTRAINT codes_parent_self_ck CHECK (parent_code IS NULL OR parent_code <> code)
);

-- 공통 컬럼 (0001 §3 과 같은 세트). 이 파일에서 만든 두 테이블에만 붙인다.
DO $$
DECLARE t TEXT; i INT;
BEGIN
  FOREACH t IN ARRAY ARRAY['code_groups','codes'] LOOP
    EXECUTE format('ALTER TABLE app.%I ADD COLUMN description TEXT NOT NULL DEFAULT %L', t, '');
    FOR i IN 1..10 LOOP
      EXECUTE format('ALTER TABLE app.%I ADD COLUMN cmf_%s TEXT', t, i);
    END LOOP;
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

CREATE INDEX codes_group_sort_idx ON app.codes (group_code, sort_order, code)
  WHERE is_active AND NOT is_deleted;

-- 다른 테이블과 달리 code 값에는 부분 UNIQUE 를 걸지 않는다(PK 가 이미 (group_code, code)).
-- 지운 코드의 값을 재사용하지 못하는 것이 **의도**다 — 과거 이력이 그 문자열을 가리키고 있어서,
-- 같은 코드에 다른 뜻을 붙이면 지난 데이터의 의미가 조용히 바뀐다.


-- =====================================================================
-- 2. 기준정보 — 지금 CHECK 와 클라이언트에 흩어져 있는 값들
-- =====================================================================

INSERT INTO app.code_groups (group_code, name, is_system, description) VALUES
  ('SKILL_CODE',   '문항 스킬 분류', true,
   '오답 노트 필터·약점 분석. lesson_items.skill_code / user_lesson_attempts.skill_code 가 쓴다. color = 테마 토큰 이름.'),
  ('CORRECTION_TYPE', '회화 첨삭 유형', true,
   'corrections.type. color = 테마 토큰 이름(문법은 error, 나머지는 warning).'),
  ('LESSON_KIND',  '레슨 종류', true,
   'lessons.kind. 화면 라우팅이 값에 의존하므로 임의로 늘리지 말 것.'),
  ('REVIEW_RESULT','복습 평가', true,
   'SRS 평가 버튼. vocab_reviews.result / correction_reviews.result.'),
  ('REPORT_REASON','문항 신고 사유', false,
   'lesson_reports.reason. 화면 드롭다운 전용이라 자유롭게 늘려도 된다.'),
  ('DIFFICULTY',   '난이도', false,
   'content_items.difficulty(1~5)의 표시 라벨.');

INSERT INTO app.codes (group_code, code, name, sort_order, color, is_system, description) VALUES
  -- 지금 src/screens/mistakes.jsx:9 SKILL_LABELS 에 박혀 있는 5종 + 미분류
  ('SKILL_CODE', 'grammar',   '문법',     10, 'accent',  true, ''),
  ('SKILL_CODE', 'vocab',     '어휘',     20, 'success', true, ''),
  ('SKILL_CODE', 'detail',    '세부사항', 30, 'warning', true, ''),
  ('SKILL_CODE', 'inference', '추론',     40, 'accent2', true, ''),
  ('SKILL_CODE', 'main_idea', '주제',     50, 'success', true, ''),
  ('SKILL_CODE', 'unknown',   '미분류',   90, NULL,      true,
   'skill_code 가 NULL 인 문항의 표시용. DB 에 저장되는 값이 아니다.'),

  -- src/screens/conversation-desktop.jsx:152 CORRECTION_TYPE_META
  ('CORRECTION_TYPE', 'grammar',  '문법 오류',        10, 'error',   true, ''),
  ('CORRECTION_TYPE', 'usage',    '자연스러운 표현',  20, 'warning', true, ''),
  ('CORRECTION_TYPE', 'spelling', '철자',             30, 'warning', true, ''),

  ('LESSON_KIND', 'toeic_part5', 'Part 5 · 단문 공란', 10, NULL, true, ''),
  ('LESSON_KIND', 'toeic_part7', 'Part 7 · 독해',      20, NULL, true, ''),
  ('LESSON_KIND', 'toeic_lc',    'LC · 듣기',          30, NULL, true, ''),

  ('REVIEW_RESULT', 'again', '다시',  10, 'error',   true, ''),
  ('REVIEW_RESULT', 'hard',  '어려움', 20, 'warning', true, ''),
  ('REVIEW_RESULT', 'good',  '보통',  30, 'success', true, ''),
  ('REVIEW_RESULT', 'easy',  '쉬움',  40, 'success', true, ''),

  ('REPORT_REASON', 'incorrect_answer', '정답이 틀림',   10, NULL, false, ''),
  ('REPORT_REASON', 'ambiguous',        '문제가 모호함', 20, NULL, false, ''),
  ('REPORT_REASON', 'language',         '표현이 어색함', 30, NULL, false, ''),
  ('REPORT_REASON', 'other',            '기타',          90, NULL, false, ''),

  ('DIFFICULTY', '1', '입문', 10, NULL, false, ''),
  ('DIFFICULTY', '2', '초급', 20, NULL, false, ''),
  ('DIFFICULTY', '3', '중급', 30, NULL, false, ''),
  ('DIFFICULTY', '4', '중상', 40, NULL, false, ''),
  ('DIFFICULTY', '5', '고급', 50, NULL, false, '');


-- =====================================================================
-- 3. COMMENT ON
-- =====================================================================

COMMENT ON TABLE  app.code_groups            IS '기준정보 그룹. 화면 라벨·필터에 쓰는 긴 꼬리 열거값을 담는다. FK 대상이거나 동작이 딸린 값(roles·content_statuses)은 여기 두지 않는다.';
COMMENT ON COLUMN app.code_groups.group_code IS '대문자 스네이크. 소비하는 컬럼 이름과 맞춘다(SKILL_CODE ↔ skill_code).';
COMMENT ON COLUMN app.code_groups.is_system  IS 'true 면 코드값이 소스에 박혀 있어 관리 화면에서 지울 수 없다. 라벨·정렬·색만 고칠 수 있다.';
COMMENT ON COLUMN app.code_groups.description IS '이 그룹이 cmf_* 슬롯을 쓴다면 그 뜻을 여기 적는다 — 슬롯 의미는 그룹마다 다르므로 COMMENT 로는 못 적는다.';

COMMENT ON TABLE  app.codes             IS '기준정보 항목. (group_code, code) 가 PK 이고 지운 코드의 값은 재사용하지 않는다 — 과거 이력이 그 문자열을 가리키고 있다.';
COMMENT ON COLUMN app.codes.name        IS '화면에 그대로 나가는 라벨. 지금 클라이언트에 하드코딩된 SKILL_LABELS·CORRECTION_TYPE_META 를 대체한다.';
COMMENT ON COLUMN app.codes.color       IS '테마 토큰 **이름**(accent·success·warning·error…). hex 를 넣으면 4개 테마 전환이 깨진다.';
COMMENT ON COLUMN app.codes.icon        IS 'src/shared/icons.jsx 의 키. 없으면 NULL.';
COMMENT ON COLUMN app.codes.parent_code IS '같은 그룹 안의 상위 코드. 계층이 필요 없으면 NULL.';
COMMENT ON COLUMN app.codes.is_system   IS 'true 면 이 값이 쿼리·CHECK 에 등장한다. 관리 화면에서 삭제 금지.';
