// node --test 프리로드(--import). 테스트는 기본적으로 메모리 PGlite 에서 돈다 —
// DB·서버·AI provider 없이 도는 것이 플랜 10.7 Phase 1 의 완료 판정이다.
// DB_DRIVER 를 이미 준 경우(npm run test:pg)는 존중한다 — 같은 테스트를 두 드라이버로 돌려
// 어댑터 동등성을 확인하기 위한 경로다.
process.env.DB_DRIVER ||= 'pglite';
// 테스트는 항상 메모리 DB 다. .env 의 PGLITE_DATA_DIR(개발용 파일 DB)을 그대로 물려받으면
// 테스트가 개발 데이터를 건드리고, API 서버가 떠 있으면 잠금 충돌로 죽는다.
process.env.PGLITE_DATA_DIR = '';
