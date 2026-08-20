import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';

const sha256 = (text) => createHash('sha256').update(text).digest();

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
  const normalized = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);
  try {
    const { rows: [user] } = await pool.query(
      `INSERT INTO public.users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, tz, is_dev, created_at`,
      [normalized, displayName || '', passwordHash],
    );
    return user;
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'CONFLICT', '이미 가입된 이메일입니다.');
    throw err;
  }
}

export async function login({ email, password, userAgent, ip }) {
  const normalized = email.toLowerCase().trim();
  checkRateLimit(normalized, ip || '');
  const { rows: [user] } = await pool.query(
    `SELECT id, email, display_name, password_hash, tz, is_dev FROM public.users WHERE email = $1`,
    [normalized],
  );
  // 사용자가 없어도 더미 해시로 verify 1회 → 이메일 존재 여부의 타이밍 차이 축소
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');

  const session = await createSession(user.id, { userAgent, ip });
  await pool.query(`UPDATE public.users SET last_login_at = now() WHERE id = $1`, [user.id]);
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, ...session };
}

// 쿠키에는 32바이트 랜덤 토큰 원문, DB에는 sha256(토큰)만 저장.
export async function createSession(userId, { userAgent, ip } = {}) {
  const token = randomBytes(32).toString('base64url');
  const { rows: [row] } = await pool.query(
    `INSERT INTO public.auth_sessions (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, now() + ($3 || ' days')::interval, $4, $5)
     RETURNING id, expires_at`,
    [userId, sha256(token), String(config.sessionTtlDays), userAgent || null, ip || null],
  );
  return { token, sessionId: row.id, expiresAt: row.expires_at };
}

export async function resolveSession(token) {
  if (!token) return null;
  const { rows: [row] } = await pool.query(
    `SELECT s.id AS session_id, u.id, u.email, u.display_name, u.tz, u.is_dev
       FROM public.auth_sessions s
       JOIN public.users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row) return null;
  pool.query(`UPDATE public.auth_sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id])
    .catch(() => {});
  const { session_id, ...user } = row;
  return { user, sessionId: session_id };
}

export async function logout(token) {
  if (!token) return;
  await pool.query(
    `UPDATE public.auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(token)],
  );
}

// DEV_AUTOLOGIN 전용: 시드 계정으로 실제 세션 발급
export async function devLogin({ userAgent, ip } = {}) {
  const { rows: [user] } = await pool.query(
    `SELECT id, email, display_name, tz, is_dev FROM public.users WHERE email = $1 AND is_dev = true`,
    [config.devUserEmail],
  );
  if (!user) return null; // 시드 전이면 자동로그인 불가 — 401로 흘려보냄
  const session = await createSession(user.id, { userAgent, ip });
  return { user, ...session };
}

// 표시 이름 변경 (PATCH /api/me). 반환 모양은 resolveSession의 user DTO와 동일 —
// 프론트 스토어가 user를 그대로 교체할 수 있다.
export async function updateProfile(userId, { displayName }) {
  const { rows: [user] } = await pool.query(
    `UPDATE public.users SET display_name = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, email, display_name, tz, is_dev`,
    [displayName, userId],
  );
  if (!user) throw new HttpError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
  return user;
}
