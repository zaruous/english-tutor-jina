// DB 드라이버 어댑터 — DB_DRIVER=pg | pglite (플랜 10.7 Phase 1). 스키마는 바꾸지 않는다.
//
// 호출부(약 110곳)는 지금까지처럼 pool.query / withTx 만 쓴다. 이 파일이 pg.Pool 이
// 노출하던 표면(query · connect · end)을 두 드라이버에서 같은 모양으로 맞춘다.
//
//  pg     — 운영·통합 검증. 지금까지 pool.js 가 하던 일 그대로.
//  pglite — 테스트. PostgreSQL 자체의 WASM 빌드라 SQL 을 한 줄도 바꾸지 않는다.
//
// pglite 가 pg 와 다른 3건을 이 파일이 흡수한다:
//   1. NUMERIC(oid 1700)이 문자열("2.50")로 온다 → parsers 주입. BIGINT(20)는 이미 number 지만
//      드라이버 업그레이드로 바뀌어도 조용히 깨지지 않게 함께 고정한다.
//   2. 결과에 rowCount 가 없다 → affectedRows(DML) / rows.length(SELECT)로 채운다.
//   3. connect() 가 없다(단일 커넥션) → 트랜잭션을 순번 대기로 직렬화한다.
//
// 흡수하지 못하는 한계는 docs/RISKS.md R12 — 커넥션 경합(advisory lock 은 동작하지만 경합이 없다)과
// statement_timeout(WASM 단일 스레드라 적용되어도 질의를 중단시키지 못한다)은 DB_DRIVER=pg 로만 검증된다.
import pg from 'pg';
import { config } from '../config.js';

const { driver, schema, pgliteDataDir } = config.db;
const timeoutMs = config.pg.statementTimeoutMs;

// 두 드라이버 모두 세션 설정으로 통일한다(플랜 10.7 §6). 스키마 이름은 식별자라 바인딩할 수 없으므로
// config.js 에서 이미 형태를 강제하지만, SQL 을 만드는 이 자리에서 한 번 더 막는다.
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
  throw new Error(`DB_SCHEMA=${schema} 는 식별자 형태가 아닙니다.`);
}

function createPgPool() {
  // setTypeParser 2건이 없으면 BIGINT/NUMERIC이 문자열("1", "2.50")로 나가
  // 프론트 비교·산술이 조용히 깨진다.
  pg.types.setTypeParser(20, Number);   // BIGINT (int8)
  pg.types.setTypeParser(1700, Number); // NUMERIC

  const pool = new pg.Pool({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    max: config.pg.max,
    options: `-c statement_timeout=${timeoutMs} -c search_path=${schema}`,
  });

  // 이것이 없으면 원격 호스트의 유휴 커넥션 단절이 uncaught exception 으로 서버를 죽인다.
  pool.on('error', (err) => {
    console.error('[pg] idle client error:', err.message);
  });

  // 여러 문장이 든 SQL(마이그레이션 파일)용 — pg 는 파라미터 없는 query 가 곧 simple protocol 이다.
  pool.exec = (sql) => pool.query(sql);
  return pool;
}

function createPgliteAdapter() {
  const PARSERS = { 20: Number, 1700: Number };
  let ready = null;

  async function instance() {
    if (!ready) {
      ready = (async () => {
        const { PGlite } = await import('@electric-sql/pglite');
        const db = await PGlite.create(pgliteDataDir || undefined);
        await db.exec(`SET search_path TO ${schema}; SET statement_timeout = ${timeoutMs};`);
        return db;
      })();
    }
    return ready;
  }

  async function query(sql, params) {
    const db = await instance();
    const res = await db.query(sql, params ?? [], { parsers: PARSERS });
    const rows = res.rows ?? [];
    return { rows, rowCount: res.affectedRows || rows.length, fields: res.fields };
  }

  // 단일 커넥션이라 트랜잭션이 겹치면 BEGIN 이 서로를 덮어쓴다. release 될 때까지 다음 차례를 재운다.
  let tail = Promise.resolve();

  return {
    query,
    exec: async (sql) => { await (await instance()).exec(sql); },
    async connect() {
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      const previous = tail;
      tail = tail.then(() => held);
      await previous;
      return { query, release: () => release() };
    },
    async end() {
      if (!ready) return;
      const db = await ready;
      ready = null;
      await db.close();
    },
  };
}

export const pool = driver === 'pglite' ? createPgliteAdapter() : createPgPool();
