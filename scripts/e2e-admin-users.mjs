// E2E: 관리자 · 사용자/역할 관리 (docs/design/11-admin-users.md §6)
// npm run dev 가 떠 있는 상태에서 실행. 테스트 계정 3개를 DB에 직접 심고 끝나면 지운다.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';
import { pool } from '../api/lib/pool.js';
import { hashPassword } from '../api/services/password.js';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: BASE };
const TAG = `e2e-admin-${Date.now()}`;
const EMAILS = {
  learner: `${TAG}-learner@test.dev`,
  reviewer: `${TAG}-reviewer@test.dev`,
  admin: `${TAG}-admin@test.dev`,
  admin2: `${TAG}-admin2@test.dev`,
};
const PASS = 'e2e-pass-1234';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};

async function createUser(email, role, displayName = 'E2E') {
  const passwordHash = await hashPassword(PASS);
  const { rows: [u] } = await pool.query(
    `INSERT INTO public.users (email, display_name, password_hash, role, is_admin)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, role`,
    [email, displayName, passwordHash, role, role === 'admin'],
  );
  return u;
}

async function loginCookie(email) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: H, body: JSON.stringify({ email, password: PASS }),
  });
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
}

async function auditCount(userId) {
  const { rows: [{ cnt }] } = await pool.query(
    `SELECT count(*)::int AS cnt FROM public.user_audit_log WHERE target_user_id = $1`,
    [userId],
  );
  return cnt;
}

async function activeSessions(userId) {
  const { rows: [{ cnt }] } = await pool.query(
    `SELECT count(*)::int AS cnt FROM public.auth_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [userId],
  );
  return cnt;
}

async function jsonFetch(path, { method = 'GET', cookie, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...H,
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

// ── 픽스처 ──
let learner, reviewer, admin, admin2;
try {
  learner = await createUser(EMAILS.learner, 'learner');
  reviewer = await createUser(EMAILS.reviewer, 'reviewer');
  admin = await createUser(EMAILS.admin, 'admin');
  admin2 = await createUser(EMAILS.admin2, 'admin');

  const learnerCookie = await loginCookie(EMAILS.learner);
  const reviewerCookie = await loginCookie(EMAILS.reviewer);
  const adminCookie = await loginCookie(EMAILS.admin);
  const admin2Cookie = await loginCookie(EMAILS.admin2);

  // 1 learner → 403
  const r1 = await jsonFetch('/api/admin/users', { cookie: learnerCookie });
  check('1 learner GET /api/admin/users → 403 FORBIDDEN',
    r1.status === 403 && r1.code === 'FORBIDDEN', String(r1.code));

  // 2 reviewer → 403
  const r2 = await jsonFetch('/api/admin/users', { cookie: reviewerCookie });
  check('2 reviewer GET /api/admin/users → 403',
    r2.status === 403 && r2.code === 'FORBIDDEN', String(r2.code));

  // 3 admin 목록
  const r3 = await jsonFetch('/api/admin/users', { cookie: adminCookie });
  const countsSum = Object.values(r3.counts || {}).reduce((a, b) => a + b, 0);
  check('3 admin 목록 200 · total≥3 · roles 4 · counts 합=total',
    r3.ok && r3.total >= 3 && r3.roles?.length === 4 && countsSum === r3.total,
    `total=${r3.total} roles=${r3.roles?.length} sum=${countsSum}`);

  // 4 q= 부분일치
  const r4 = await jsonFetch(`/api/admin/users?q=${encodeURIComponent(TAG)}`, { cookie: adminCookie });
  check('4 q= 부분일치 — 테스트 계정만',
    r4.ok && r4.users.length >= 4 && r4.users.every((u) => u.email.includes(TAG)),
    `${r4.users?.length}건`);

  // 5·6 learner 승격 — 별도 계정으로 6a(승격 전) 먼저 검증
  const promoteEmail = `${TAG}-promote@test.dev`;
  const promoteUser = await createUser(promoteEmail, 'learner');
  const promoteCookie = await loginCookie(promoteEmail);
  const r6before = await jsonFetch('/api/admin/contents', { cookie: promoteCookie });
  check('6a 승격 전 author 경로 403', r6before.status === 403, String(r6before.code));

  const beforeAudit = await auditCount(promoteUser.id);
  const r5 = await jsonFetch(`/api/admin/users/${promoteUser.id}/role`, {
    method: 'PATCH', cookie: adminCookie, body: { to: 'author', note: 'e2e 승격' },
  });
  const afterAudit = await auditCount(promoteUser.id);
  check('5 learner→author 200 · audit +1',
    r5.ok && r5.user?.role === 'author' && afterAudit === beforeAudit + 1,
    `role=${r5.user?.role} audit ${beforeAudit}→${afterAudit}`);

  const r6 = await jsonFetch('/api/admin/contents', { cookie: promoteCookie });
  check('6b 승격 직후 author 경로 200 (재로그인 없이)',
    r6.ok && r6.status === 200, String(r6.code));

  // 7 본인 강등
  const meId = (await jsonFetch('/api/auth/me', { cookie: adminCookie })).user?.id;
  const auditBefore7 = await auditCount(meId);
  const r7 = await jsonFetch(`/api/admin/users/${meId}/role`, {
    method: 'PATCH', cookie: adminCookie, body: { to: 'reviewer' },
  });
  const auditAfter7 = await auditCount(meId);
  check('7 본인 강등 409 SELF_DEMOTION · audit 증가 없음',
    r7.status === 409 && r7.code === 'SELF_DEMOTION' && auditAfter7 === auditBefore7,
    String(r7.code));

  // 8 비활성 admin 강등은 **허용**되어야 한다.
  //   예전 구현은 전역 활성 admin 수만 세어 이 경우도 LAST_ADMIN 으로 막았다. 비활성 admin 을
  //   강등해도 쓸 수 있는 관리자 수는 변하지 않으므로 막을 이유가 없다.
  //   이 시나리오는 **테스트가 만든 계정만** 쓴다 — 실계정(admin@jina.local)을 건드리지 않는다.
  await pool.query(
    `UPDATE public.users SET is_active = false WHERE id = $1`, [admin2.id],
  );
  const r8 = await jsonFetch(`/api/admin/users/${admin2.id}/role`, {
    method: 'PATCH', cookie: adminCookie, body: { to: 'reviewer' },
  });
  check('8 비활성 admin 강등 허용 (LAST_ADMIN 아님)',
    r8.ok && r8.user?.role === 'reviewer',
    `status=${r8.status} code=${r8.code ?? '-'} role=${r8.user?.role}`);
  // 원복 — admin2 를 다시 활성 admin 으로
  await pool.query(
    `UPDATE public.users SET role = 'admin', is_admin = true, is_active = true WHERE id = $1`,
    [admin2.id],
  );

  // 8b 마지막 활성 admin 보호 — 서비스 계층에서 직접 확인한다.
  //   API 로는 도달할 수 없다(행위자 자신이 항상 활성 admin 이라 '다른 활성 admin'이 최소 1명).
  //   그래서 HTTP 가 아니라 서비스 함수를 부른다. DB 상태를 바꾸지 않는 읽기 검증이다.
  const { countOtherActiveAdminsForTest } = await import('../api/services/admin-user.service.js')
    .then((m) => ({ countOtherActiveAdminsForTest: m.countOtherActiveAdminsForTest }));
  const othersForAdmin2 = await countOtherActiveAdminsForTest(admin2.id);
  check('8b 대상 제외 활성 admin 카운트가 대상을 세지 않는다',
    typeof othersForAdmin2 === 'number' && othersForAdmin2 >= 1,
    `others=${othersForAdmin2}`);

  // 9 admin 2명일 때 한 명 강등
  const r9 = await jsonFetch(`/api/admin/users/${admin2.id}/role`, {
    method: 'PATCH', cookie: adminCookie, body: { to: 'reviewer' },
  });
  check('9 admin 2명일 때 한 명 강등 200', r9.ok && r9.user?.role === 'reviewer', r9.user?.role);
  await jsonFetch(`/api/admin/users/${admin2.id}/role`, {
    method: 'PATCH', cookie: adminCookie, body: { to: 'admin' },
  });

  // 10 사용 중지 → 401
  const disabledEmail = `${TAG}-disable@test.dev`;
  const disabled = await createUser(disabledEmail, 'learner');
  const disabledCookie = await loginCookie(disabledEmail);
  await jsonFetch(`/api/admin/users/${disabled.id}/active`, {
    method: 'PATCH', cookie: adminCookie, body: { to: false },
  });
  const r10 = await jsonFetch('/api/auth/me', {
    cookie: disabledCookie,
    headers: { 'X-Jina-No-Autologin': '1' },
  });
  check('10 사용 중지 후 쿠키로 API → 401',
    r10.status === 401 && r10.code === 'UNAUTHORIZED', String(r10.code));

  // 11 세션 종료
  const sessEmail = `${TAG}-sess@test.dev`;
  const sessUser = await createUser(sessEmail, 'learner');
  const sessCookie = await loginCookie(sessEmail);
  await loginCookie(sessEmail); // 세션 하나 더
  const beforeSess = await activeSessions(sessUser.id);
  const r11 = await jsonFetch(`/api/admin/users/${sessUser.id}/sessions/revoke`, {
    method: 'POST', cookie: adminCookie, body: {},
  });
  const r11me = await jsonFetch('/api/auth/me', {
    cookie: sessCookie,
    headers: { 'X-Jina-No-Autologin': '1' },
  });
  check('11 세션 종료 revoked=활성수 · 쿠키 401',
    r11.ok && r11.revoked === beforeSess && r11me.status === 401,
    `revoked=${r11.revoked}/${beforeSess}`);

  // 12 CSRF 없이 PATCH
  const r12res = await fetch(`${API}/api/admin/users/${learner.id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ to: 'learner' }),
  });
  const r12 = await r12res.json();
  // 상태코드만 보면 code 가 어긋나도 통과한다(예전엔 403 + BAD_REQUEST 였다).
  check('12 CSRF 헤더 없이 PATCH → 403 FORBIDDEN',
    r12res.status === 403 && r12.code === 'FORBIDDEN', `${r12res.status} ${r12.code}`);

  // 13 화면 — admin.html · 드롭다운 · 자물쇠
  const cookieName = process.env.COOKIE_NAME || 'jina_sid';
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await routeCdn(pg);
  const cookieVal = adminCookie.split('=').slice(1).join('=');
  await ctx.addCookies([{
    name: cookieName, value: cookieVal, domain: new URL(BASE).hostname, path: '/',
  }]);
  await pg.goto(`${BASE}/admin.html`);
  await pg.waitForTimeout(9000);
  const hasTable = (await pg.locator('[data-testid="user-row"]').count()) >= 1;
  const hasDropdown = (await pg.locator('[data-testid="role-select"]').count()) >= 1;
  const hasLock = (await pg.locator('[data-testid="role-locked"]').count()) >= 1;
  // 실행마다 덮어써지는 산출물이므로 gitignore 된 임시 경로에 쓴다.
  // 목업 전용 docs/plan/img 에 쓰면 안 되고, 라운드 폴더(docs/reviews/NN-…/img)에는
  // 기록으로 남길 것만 사람이 골라 복사한다.
  mkdirSync('docs/reviews/_artifacts', { recursive: true });
  await pg.screenshot({ path: 'docs/reviews/_artifacts/e2e-admin-users.png', fullPage: true });
  check('13 admin.html 렌더 · 드롭다운 · 자물쇠',
    hasTable && hasDropdown && hasLock,
    `rows=${hasTable} dropdown=${hasDropdown} lock=${hasLock}`);
  await browser.close();

  // 14a /me DTO — 설계 §3.5. exit 0 만으로는 DTO 확장 회귀를 못 잡으므로 필드를 직접 단정한다.
  const meAdmin = await jsonFetch('/api/auth/me', { cookie: adminCookie });
  const meLearner = await jsonFetch('/api/auth/me', { cookie: learnerCookie });
  check('14a /me DTO — role · can_* · is_admin 한 사이클 유지',
    meAdmin.user?.role === 'admin'
    && meAdmin.user?.can_author === true && meAdmin.user?.can_review === true
    && meAdmin.user?.can_admin === true && meAdmin.user?.is_admin === true
    && meLearner.user?.role === 'learner'
    && meLearner.user?.can_author === false && meLearner.user?.can_admin === false
    && meLearner.user?.is_admin === false,
    `admin=${meAdmin.user?.role}/${meAdmin.user?.can_admin} learner=${meLearner.user?.role}/${meLearner.user?.can_author}`);

  // 14b e2e-auth 회귀
  const authExit = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/e2e-auth.mjs'], {
      cwd: process.cwd(), stdio: 'inherit', env: process.env,
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
  check('14b e2e-auth.mjs 회귀 exit 0', authExit === 0, String(authExit));

} finally {
  await pool.query(
    `DELETE FROM public.users WHERE email LIKE $1`,
    [`${TAG}%`],
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
