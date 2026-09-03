-- 0002_common_codes.down.sql
-- 0002_common_codes.sql 을 되돌린다.
-- 데이터 손실: 관리 화면에서 추가·수정한 기준정보가 전부 사라진다(시드 외의 코드).

SET search_path = app;

DROP TABLE IF EXISTS app.codes CASCADE;
DROP TABLE IF EXISTS app.code_groups CASCADE;
