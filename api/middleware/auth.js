import { config } from '../config.js';
import { parseCookies, serializeCookie } from '../lib/cookies.js';
import { HttpError } from '../lib/errors.js';
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
  if (!resolved && config.devAutologin) {
    const dev = await devLogin({ userAgent: req.headers['user-agent'], ip: req.socket.remoteAddress });
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
