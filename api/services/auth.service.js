import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { atLeast, loadRoles } from '../lib/roles.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';

const sha256 = (text) => createHash('sha256').update(text).digest();

export function toAuthUser(row) {
  if (!row) return null;
  const role = row.role || (row.is_admin ? 'admin' : 'learner');
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    tz: row.tz,
    is_dev: row.is_dev,
    is_admin: Boolean(row.is_admin) || role === 'admin',
    role,
    can_author: atLeast(role, 'author'),
    can_review: atLeast(role, 'reviewer'),
    can_admin: atLeast(role, 'admin'),
  };
}

// 로그인 입력값 정규화. '@' 가 없으면 사용자명으로 보고 관리자 별칭만 이메일로 바꾼다 —
// DB users.email 에 이메일 형태 CHECK 가 걸려 있어 'admin' 은 저장할 수 없기 때문이다.
// 일반 사용자는 지금도 이메일 로그인만 지원한다(치환 대상이 아니면 그대로 흘려보낸다).
export function resolveLoginId(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value.includes('@') && value === config.admin.username) return config.admin.email;
  return value;
}

// 이메일+IP 인메모리 레이트리밋: 1분 10회
const attempts = new Map();
function checkRateLimit(email, ip) {
  const key = `${email}|${ip}`;
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (attempts.get(key) || []).filter((t) => t > windowStart);
  if (list.length >= 10) throw new HttpError(429, 'RATE_LIMITED', '시도가 너무 잦습니다. 1분 후 다시 시도하세요.');
  list.push(now);
  attempts.set(key, list);
  if (attempts.size > 10_000) attempts.clear(); // 메모리 상한(개발용 서버)
}

export async function signup({ email, password, displayName }) {
  await loadRoles();
  const normalized = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);
  try {
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, tz, is_dev, is_admin, role, is_active`,
      [normalized, displayName || '', passwordHash],
    );
    return toAuthUser(user);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'CONFLICT', '이미 가입된 이메일입니다.');
    throw err;
  }
}

export async function login({ email, password, userAgent, ip }) {
  await loadRoles();
  const normalized = resolveLoginId(email);
  checkRateLimit(normalized, ip || '');
  const { rows: [user] } = await pool.query(
    `SELECT id, email, display_name, password_hash, tz, is_dev, is_admin, role, is_active
       FROM users WHERE email = $1`,
    [normalized],
  );
  // 사용자가 없어도 더미 해시로 verify 1회 → 이메일 존재 여부의 타이밍 차이 축소
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
  if (!user.is_active) throw new HttpError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');

  const session = await createSession(user.id, { userAgent, ip });
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
  return { user: toAuthUser(user), ...session };
}

// 쿠키에는 32바이트 랜덤 토큰 원문, DB에는 sha256(토큰)만 저장.
export async function createSession(userId, { userAgent, ip } = {}) {
  const token = randomBytes(32).toString('base64url');
  const { rows: [row] } = await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, now() + ($3 || ' days')::interval, $4, $5)
     RETURNING id, expires_at`,
    [userId, sha256(token), String(config.sessionTtlDays), userAgent || null, ip || null],
  );
  return { token, sessionId: row.id, expiresAt: row.expires_at };
}

export async function resolveSession(token) {
  if (!token) return null;
  await loadRoles();
  const { rows: [row] } = await pool.query(
    `SELECT s.id AS session_id, u.id, u.email, u.display_name, u.tz, u.is_dev, u.is_admin,
            u.role, u.is_active
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.is_active`,
    [sha256(token)],
  );
  if (!row) return null;
  pool.query(`UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id])
    .catch(() => {});
  const { session_id, ...userRow } = row;
  return { user: toAuthUser(userRow), sessionId: session_id };
}

export async function logout(token) {
  if (!token) return;
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(token)],
  );
}

// DEV_AUTOLOGIN 전용: 시드 계정으로 실제 세션 발급
export async function devLogin({ userAgent, ip } = {}) {
  await loadRoles();
  const { rows: [user] } = await pool.query(
    `SELECT id, email, display_name, tz, is_dev, is_admin, role, is_active
       FROM users WHERE email = $1 AND is_dev = true AND is_active`,
    [config.devUserEmail],
  );
  if (!user) return null; // 시드 전이면 자동로그인 불가 — 401로 흘려보냄

  // 세션 누적 방지: 쿠키 없는 요청마다 새 세션을 발급하면 auth_sessions 가 무한히 자란다.
  // (관리 화면의 '활성 세션' 이 758 까지 갔던 원인 — 정리 정책이 없었다.)
  // dev 계정은 사람 한 명이 쓰는 시드 계정이므로, 새 세션을 만들기 전에 오래된 것을 접는다.
  // 최근 것 몇 개는 남긴다 — 여러 탭·기기에서 동시에 열어 둘 수 있어야 한다.
  const DEV_SESSION_KEEP = 5;
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
        AND id NOT IN (
          SELECT id FROM auth_sessions
           WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
           ORDER BY last_seen_at DESC
           LIMIT $2
        )`,
    [user.id, DEV_SESSION_KEEP],
  );

  const session = await createSession(user.id, { userAgent, ip });
  return { user: toAuthUser(user), ...session };
}

// 표시 이름 변경 (PATCH /api/me). 반환 모양은 resolveSession의 user DTO와 동일 —
// 프론트 스토어가 user를 그대로 교체할 수 있다.
export async function updateProfile(userId, { displayName }) {
  await loadRoles();
  const { rows: [user] } = await pool.query(
    `UPDATE users SET display_name = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, email, display_name, tz, is_dev, is_admin, role, is_active`,
    [displayName, userId],
  );
  if (!user) throw new HttpError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
  return toAuthUser(user);
}

// 기본 관리자 계정 보장 — API 서버 부팅 시 1회 호출한다(api/server.js).
// .env 의 ADMIN_* 가 단일 소스라 비밀번호를 바꾸고 재기동하면 그대로 반영된다.
// 같은 이메일이 이미 일반 계정으로 쓰이고 있으면 건드리지 않는다 — 남의 계정을
// 기본 비밀번호로 덮어쓰는 사고를 막는다(is_admin 컬럼이 있는 이유).
export async function ensureAdminAccount() {
  if (!config.admin.autoProvision) return null;
  const { email, password, displayName } = config.admin;

  const { rows: [existing] } = await pool.query(
    `SELECT id, is_admin FROM users WHERE email = $1`, [email],
  );
  if (existing && !existing.is_admin) {
    console.warn(`[api] ${email} 은 이미 일반 계정이라 관리자 프로비저닝을 건너뜁니다 — .env ADMIN_EMAIL 을 바꾸세요.`);
    return null;
  }

  const passwordHash = await hashPassword(password);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, tz, is_admin, role)
     VALUES ($1, $2, $3, $4, true, 'admin')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_admin = true, role = 'admin', updated_at = now()
     RETURNING id, email, display_name, tz, is_dev, is_admin, role, is_active`,
    [email, displayName, passwordHash, config.appTz],
  );
  await loadRoles();
  return { user: toAuthUser(user), created: !existing };
}
