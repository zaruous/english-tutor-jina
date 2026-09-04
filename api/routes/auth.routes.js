import { config } from '../config.js';
import { readJson } from '../lib/body.js';
import { clientIp } from '../lib/client-ip.js';
import { parseCookies } from '../lib/cookies.js';
import { sendJson } from '../lib/respond.js';
import { EMAIL_RE, str } from '../lib/validate.js';
import { clearSessionCookie, requireUser, setSessionCookie } from '../middleware/auth.js';
import * as auth from '../services/auth.service.js';

export function registerAuthRoutes(router) {
  router.post('/api/auth/signup', async (req, res) => {
    const body = await readJson(req);
    const email = str(body.email, 'email', { min: 3, max: 254, pattern: EMAIL_RE });
    const password = str(body.password, 'password', { min: 8, max: 200 });
    const displayName = str(body.display_name, 'display_name', { max: 60, optional: true });
    const user = await auth.signup({ email, password, displayName });
    const session = await auth.createSession(user.id, {
      userAgent: req.headers['user-agent'], ip: clientIp(req),
    });
    setSessionCookie(res, session.token);
    sendJson(res, 201, { ok: true, user });
  });

  router.post('/api/auth/login', async (req, res) => {
    const body = await readJson(req);
    const email = str(body.email, 'email', { min: 3, max: 254 });
    const password = str(body.password, 'password', { min: 1, max: 200 });
    const { user, token } = await auth.login({
      email, password,
      // 레이트리밋 키가 `이메일|IP` 다 — 프록시 뒤에서 remoteAddress 를 그대로 쓰면
      // 전원이 127.0.0.1 로 뭉쳐 IP 축이 사라진다(플랜 10.5 S6).
      userAgent: req.headers['user-agent'], ip: clientIp(req),
    });
    setSessionCookie(res, token);
    sendJson(res, 200, { ok: true, user });
  });

  router.post('/api/auth/logout', async (req, res) => {
    await auth.logout(parseCookies(req)[config.cookieName]);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, user });
  });

  // 리소스 = 나 자신. /api/auth/* 는 세션 수명주기 전용으로 남긴다.
  // CSRF는 전역 requireCsrfHeader가 PATCH를 이미 검사한다.
  router.patch('/api/me', async (req, res) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    const displayName = str(body.display_name, 'display_name', { min: 1, max: 60 });
    const updated = await auth.updateProfile(user.id, { displayName });
    sendJson(res, 200, { ok: true, user: updated });
  });
}
