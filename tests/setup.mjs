// node --test 프리로드(--import). 테스트는 기본적으로 메모리 PGlite 에서 돈다 —
// DB·서버·AI provider 없이 도는 것이 플랜 10.7 Phase 1 의 완료 판정이다.
// DB_DRIVER 를 이미 준 경우(npm run test:pg)는 존중한다 — 같은 테스트를 두 드라이버로 돌려
// 어댑터 동등성을 확인하기 위한 경로다.
process.env.DB_DRIVER ||= 'pglite';
