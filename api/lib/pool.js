// pg.Pool 표면(query · connect · end)의 단일 진입점.
// 실제 구현은 db.js 의 DB_DRIVER 어댑터 — 호출부는 어느 드라이버인지 알지 못한다.
export { pool } from './db.js';
