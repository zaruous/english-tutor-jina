// api/config.js — env 읽기 + 검증 + 마스킹 로그
import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`.env에 ${name} 이 없습니다.`);
  return v;
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`.env ${name}=${v} 는 정수가 아닙니다.`);
  return n;
}

// DB_DRIVER — 실행 방식만 둘로 둔다(플랜 10.7). 방언은 하나(PostgreSQL)다.
//   pg     운영·통합 검증. PGHOST 등이 필요하다.
//   pglite 테스트. WASM PostgreSQL — 접속 정보가 없어도 뜬다.
const dbDriver = (process.env.DB_DRIVER || 'pg').trim();
if (dbDriver !== 'pg' && dbDriver !== 'pglite') {
  throw new Error(`.env DB_DRIVER=${dbDriver} 는 pg | pglite 중 하나여야 합니다.`);
}
// 전용 스키마 (플랜 10.7 Phase 2). 쿼리는 접두를 쓰지 않고 어댑터가 search_path 를 고정한다.
const dbSchema = (process.env.DB_SCHEMA || 'jina').trim();
if (!/^[a-z_][a-z0-9_]*$/.test(dbSchema)) {
  throw new Error(`.env DB_SCHEMA=${dbSchema} 는 소문자 식별자여야 합니다.`);
}

// pglite 는 접속 정보를 쓰지 않는다 — 테스트가 .env 없이 돌게 하는 것이 Phase 1 의 목적이다.
function requiredForPg(name) {
  return dbDriver === 'pg' ? required(name) : (process.env[name] || null);
}

const isProduction = process.env.NODE_ENV === 'production';
const devAutologin = process.env.DEV_AUTOLOGIN === '1';
if (isProduction && devAutologin) {
  throw new Error('NODE_ENV=production 에서 DEV_AUTOLOGIN=1 은 허용되지 않습니다.');
}

// 기본 관리자 계정 — 부팅 시 .env 값으로 upsert 된다(api/services/auth.service.js).
// 개발 기본값은 admin / 1234 이고, 그대로 production 에 올라가는 사고를 막기 위해
// production 에서는 8자 이상을 요구한다(끄려면 ADMIN_AUTO_PROVISION=0).
const adminAutoProvision = (process.env.ADMIN_AUTO_PROVISION ?? '1') !== '0';
const adminPassword = process.env.ADMIN_PASSWORD || '1234';
if (isProduction && adminAutoProvision && adminPassword.length < 8) {
  throw new Error(
    'NODE_ENV=production 에서는 ADMIN_PASSWORD 를 8자 이상으로 바꾸거나 ADMIN_AUTO_PROVISION=0 으로 꺼야 합니다.',
  );
}

export const config = {
  isProduction,
  apiPort: int('API_PORT', 3004),
  allowedOrigins: (process.env.API_ALLOWED_ORIGINS || 'http://localhost:3003,http://127.0.0.1:3003')
    .split(',').map((s) => s.trim()).filter(Boolean),
  appTz: process.env.APP_TZ || 'Asia/Seoul',

  db: {
    driver: dbDriver,
    schema: dbSchema,
    // 비우면 메모리(프로세스마다 새 DB), 경로를 주면 파일 영속. pglite 전용.
    pgliteDataDir: process.env.PGLITE_DATA_DIR || null,
  },

  pg: {
    host: requiredForPg('PGHOST'),
    port: int('PGPORT', 5432),
    database: requiredForPg('PGDATABASE'),
    user: requiredForPg('PGUSER'),
    password: requiredForPg('PGPASSWORD'),
    max: int('PG_POOL_MAX', 8),
    statementTimeoutMs: int('PG_STATEMENT_TIMEOUT_MS', 5000),
  },

  cookieName: process.env.COOKIE_NAME || 'jina_sid',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionTtlDays: int('SESSION_TTL_DAYS', 30),

  // 1인 운영은 자가 승인을 허용한다. 검수와 일반 전이 API 가 같은 설정을 읽는다.
  requireSeparateReviewer: process.env.REQUIRE_SEPARATE_REVIEWER === '1',

  devAutologin,
  devUserEmail: process.env.DEV_USER_EMAIL || 'jina@dev.local',
  devUserPassword: process.env.DEV_USER_PASSWORD || '',

  // username 은 로그인 폼에 '@' 없이 입력했을 때 email 로 치환하는 별칭이다.
  // DB users.email 에 CHECK(이메일 형태)가 걸려 있어 'admin' 자체는 저장할 수 없다.
  admin: {
    autoProvision: adminAutoProvision,
    username: (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
    email: (process.env.ADMIN_EMAIL || 'admin@jina.local').trim().toLowerCase(),
    password: adminPassword,
    displayName: process.env.ADMIN_DISPLAY_NAME || '관리자',
  },

  ai: {
    defaultProvider: process.env.AI_PROVIDER || 'claude',
    maxConcurrency: int('AI_MAX_CONCURRENCY', 2),
    queueMax: int('AI_QUEUE_MAX', 8),
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    models: {
      ollama: process.env.OLLAMA_MODEL || 'gemma4:e2b',
      claude: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
      agy: process.env.AGY_MODEL || 'gemini-3.7-flash-medium',
      cursor: process.env.CURSOR_MODEL || 'gpt-5',
      codex: process.env.CODEX_MODEL || null,
    },
  },

  // 발음 평가(플랜 10). 아무것도 설정하지 않은 상태가 정상 — 스피킹 화면은 v1 받아쓰기 모드로 동작한다.
  pronunciation: {
    backend: process.env.PRONUNCIATION_BACKEND || null,           // 'openpronounce' | 'speechace' | 미설정=자동
    url: process.env.PRONUNCIATION_URL || null,                    // lib/pronounce 사이드카 (예: http://localhost:8000)
    speechaceUrl: process.env.SPEECHACE_URL || 'https://api.speechace.co',
    speechaceKey: process.env.SPEECHACE_KEY || null,
    speechaceDialect: process.env.SPEECHACE_DIALECT || 'en-us',
    timeoutMs: int('PRONUNCIATION_TIMEOUT_MS', 60_000),            // CPU 추론 + 첫 호출 모델 로딩을 감안
    maxAudioBytes: int('PRONUNCIATION_MAX_AUDIO_BYTES', 8 * 1024 * 1024),
  },
};

export function logBootConfig() {
  const { pg, db } = config;
  if (db.driver === 'pglite') {
    console.log(`[api] pglite (WASM PostgreSQL) ${db.pgliteDataDir || '메모리'} schema=${db.schema}`);
  } else {
    console.log(`[api] postgres://${pg.user}:***@${pg.host}:${pg.port}/${pg.database} (pool ${pg.max}, schema ${db.schema})`);
  }
  console.log(`[api] origins: ${config.allowedOrigins.join(', ')}`);
  console.log(`[api] ai: default=${config.ai.defaultProvider} concurrency=${config.ai.maxConcurrency}`);
  const p = config.pronunciation;
  const pronBackend = p.backend || (p.url ? 'openpronounce' : p.speechaceKey ? 'speechace' : 'openpronounce');
  console.log(`[api] pronunciation: ${pronBackend}${pronBackend === 'openpronounce' ? ` ${p.url || 'http://localhost:8000 (기본)'} — 사이드카 미기동 시 받아쓰기 폴백` : ''}`);
  if (config.admin.autoProvision) {
    console.log(`[api] admin: ${config.admin.username} (${config.admin.email}) — .env ADMIN_* 기준 부팅 시 동기화`);
  }
  if (config.devAutologin) {
    console.log('┌──────────────────────────────────────────────────────────┐');
    console.log(`│ ⚠ DEV_AUTOLOGIN=1 — 쿠키 없는 요청에 ${config.devUserEmail} 세션 자동 발급 │`);
    console.log('└──────────────────────────────────────────────────────────┘');
  }
}
