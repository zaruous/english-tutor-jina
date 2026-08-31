// pg.Pool 싱글턴.
// setTypeParser 2건이 없으면 BIGINT/NUMERIC이 문자열("1", "2.50")로 나가
// 프론트 비교·산술이 조용히 깨진다. pool.on('error')가 없으면 원격 호스트의
// 유휴 커넥션 단절이 uncaught exception으로 서버를 죽인다.
import pg from 'pg';
import { config } from '../config.js';

pg.types.setTypeParser(20, Number);   // BIGINT (int8)
pg.types.setTypeParser(1700, Number); // NUMERIC

export const pool = new pg.Pool({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  user: config.pg.user,
  password: config.pg.password,
  max: config.pg.max,
  options: `-c statement_timeout=${config.pg.statementTimeoutMs}`,
});

pool.on('error', (err) => {
  console.error('[pg] idle client error:', err.message);
});
