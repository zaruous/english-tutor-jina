import { config } from '../config.js';
import { clientIp } from '../lib/client-ip.js';
import { parseCookies, serializeCookie } from '../lib/cookies.js';
import { HttpError } from '../lib/errors.js';
import { atLeast, loadRoles } from '../lib/roles.js';
import { devLogin, resolveSession } from '../services/auth.service.js';

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', serializeCookie(config.cookieName, token, {
    maxAgeSec: config.sessionTtlDays * 24 * 3600,
    secure: config.cookieSecure,
  }));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', serializeCookie(config.cookieName, '', {
    maxAgeSec: 0, secure: config.cookieSecure,
  }));
}

// 쿠키 → 세션 → req 컨텍스트. DEV_AUTOLOGIN=1 이면 쿠키가 없거나 무효일 때
// 시드 계정으로 실제 세션을 발급하고 쿠키까지 심는다.
export async function optionalUser(req, res) {
  const token = parseCookies(req)[config.cookieName];
  let resolved = await resolveSession(token);
  // X-Jina-No-Autologin: 1 — 클라이언트 opt-out(로그아웃 후). 이 헤더가 있으면
  // DEV_AUTOLOGIN이라도 dev 세션을 재발급하지 않는다 → 401 → 로그인 화면.
  if (!resolved && config.devAutologin && req.headers['x-jina-no-autologin'] !== '1') {
    const dev = await devLogin({ userAgent: req.headers['user-agent'], ip: clientIp(req) });
    if (dev) {
      setSessionCookie(res, dev.token);
      resolved = { user: dev.user, sessionId: dev.sessionId };
    }
  }
  return resolved; // { user, sessionId } | null
}

export async function requireUser(req, res) {
  const resolved = await optionalUser(req, res);
  if (!resolved) throw new HttpError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  return resolved;
}

export function requireRole(required) {
  return async function requireRoleMiddleware(req, res) {
    const ctx = await requireUser(req, res);
    await loadRoles();
    if (!atLeast(ctx.user.role, required)) {
      throw new HttpError(403, 'FORBIDDEN', '권한이 없습니다.');
    }
    return ctx;
  };
}

export const requireAdmin = requireRole('admin');
