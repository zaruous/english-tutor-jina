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

const isProduction = process.env.NODE_ENV === 'production';
const devAutologin = process.env.DEV_AUTOLOGIN === '1';
if (isProduction && devAutologin) {
  throw new Error('NODE_ENV=production 에서 DEV_AUTOLOGIN=1 은 허용되지 않습니다.');
}

export const config = {
  isProduction,
  apiPort: int('API_PORT', 3004),
  allowedOrigins: (process.env.API_ALLOWED_ORIGINS || 'http://localhost:3003,http://127.0.0.1:3003')
    .split(',').map((s) => s.trim()).filter(Boolean),
  appTz: process.env.APP_TZ || 'Asia/Seoul',

  pg: {
    host: required('PGHOST'),
    port: int('PGPORT', 5432),
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: required('PGPASSWORD'),
    max: int('PG_POOL_MAX', 8),
    statementTimeoutMs: int('PG_STATEMENT_TIMEOUT_MS', 5000),
  },

  cookieName: process.env.COOKIE_NAME || 'jina_sid',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionTtlDays: int('SESSION_TTL_DAYS', 30),

  devAutologin,
  devUserEmail: process.env.DEV_USER_EMAIL || 'jina@dev.local',
  devUserPassword: process.env.DEV_USER_PASSWORD || '',

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
};

export function logBootConfig() {
  const { pg } = config;
  console.log(`[api] postgres://${pg.user}:***@${pg.host}:${pg.port}/${pg.database} (pool ${pg.max})`);
  console.log(`[api] origins: ${config.allowedOrigins.join(', ')}`);
  console.log(`[api] ai: default=${config.ai.defaultProvider} concurrency=${config.ai.maxConcurrency}`);
  if (config.devAutologin) {
    console.log('┌──────────────────────────────────────────────────────────┐');
    console.log(`│ ⚠ DEV_AUTOLOGIN=1 — 쿠키 없는 요청에 ${config.devUserEmail} 세션 자동 발급 │`);
    console.log('└──────────────────────────────────────────────────────────┘');
  }
}
