// E2E: 설정 + 로그인 UI (docs/plan/05-settings-auth.md Phase 6)
// AppGate(부팅 시 GET /api/auth/me) · 로그인/회원가입 화면 · 계정 설정(PATCH /api/me) ·
// 설정 localStorage 지속성 · DEV_AUTOLOGIN opt-out(X-Jina-No-Autologin) ·
// 캔버스 무인증(요청 0건)을 확인한다.
// 기대값은 하드코딩하지 않고 서버 DTO/테마 토큰을 읽어 대조한다 (e2e-progress.mjs 규범).
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';

const BOOT_MS = 9000; // in-browser Babel 컴파일

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};


// 401은 이 문서의 설계된 경로다 — opt-out 상태의 GET /api/auth/me와 오답 로그인이
// 브라우저 네트워크 로그에 401을 남기는 것은 정상 동작이므로 무시 목록에 넣는다.
const errorSink = (page, sink, extraIgnore = '') => {
  page.on('pageerror', (e) => sink.push('PAGEERROR: ' + String(e).slice(0, 200)));
  page.on('console', (m) => {
    const re = new RegExp(`net::|404|403|401|favicon${extraIgnore}`);
    if (m.type() === 'error' && !re.test(m.text())) sink.push(m.text().slice(0, 200));
  });
};

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const rootText = (page) => page.locator('#root').textContent();
// 사용자 칩 클릭 = 설정 열기(계정 섹션이 패널 맨 위). 대시보드 본문에도 <header>가 있어
// 'header button'은 TopNav만 가리키지 않는다 — testid로 잡는다.
const openSettings = async (page) => {
  if (await page.locator('[data-testid=account-logout]').count()) return; // 이미 열려 있음
  await page.locator('[data-testid=user-chip]').click({ timeout: 10000 });
  await page.waitForTimeout(600);
};
const chipText = (page) => page.locator('[data-testid=user-chip]').textContent();
const onLoginScreen = async (page) => (await page.locator('[data-testid=login-submit]').count()) > 0;

// ── 서버 DTO 먼저 (하드코딩 기대값 금지) ──
const meRes = await fetch(`${API}/api/auth/me`);
const cookie = (meRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
const me = await meRes.json();
check('GET /api/auth/me — autologin 세션 발급', me.ok === true && me.user?.is_dev === true);
check('user DTO 5필드 · 비밀번호/토큰 미노출',
  ['id', 'email', 'display_name', 'tz', 'is_dev'].every((k) => me.user[k] !== undefined)
  && !('password_hash' in me.user) && !('token' in me.user));
const DEV_NAME = me.user.display_name;
const DEV_EMAIL = me.user.email;

const optout = await (await fetch(`${API}/api/auth/me`, { headers: { 'X-Jina-No-Autologin': '1' } })).json();
check('X-Jina-No-Autologin: 1 → autologin 건너뛰고 401', optout.ok === false && optout.code === 'UNAUTHORIZED',
  String(optout.code));

const pf = await fetch(`${API}/api/auth/me`, {
  method: 'OPTIONS',
  headers: {
    Origin: BASE, 'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'x-jina-no-autologin',
  },
});
check('프리플라이트 Allow-Headers에 X-Jina-No-Autologin',
  /x-jina-no-autologin/i.test(pf.headers.get('access-control-allow-headers') || ''),
  pf.headers.get('access-control-allow-headers') || '(없음)');

const patchBad = await (await fetch(`${API}/api/me`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', cookie },
  body: JSON.stringify({ display_name: '' }),
})).json();
check('PATCH /api/me 빈 이름 → 400', patchBad.ok === false && patchBad.code === 'BAD_REQUEST', String(patchBad.code));

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
errorSink(page, errors);
await routeCdn(page);

// ── 1) autologin 부팅 → 로그인 화면 없이 앱 진입 ──
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(BOOT_MS);
check('autologin 부팅 = 로그인 화면 아님', !(await onLoginScreen(page)));
check('앱 렌더 (대시보드)', (await page.locator('#root').innerHTML()).length > 5000);
check('TopNav 사용자 칩 == 서버 display_name', (await chipText(page)).includes(DEV_NAME.split(' ')[0]),
  await chipText(page));
check('부팅 콘솔 에러 0', errors.length === 0, errors.slice(0, 2).join(' | '));

// ── 2) 설정 지속성 (테마) ──
await openSettings(page);
const ivoryName = await page.evaluate(() => window.JINA_THEMES.ivory.name);
await page.getByText(ivoryName, { exact: true }).first().click();
await page.waitForTimeout(500);
const saved = await page.evaluate(() => JSON.parse(localStorage.jina_settings_v1 || '{}'));
check('jina_settings_v1에 테마 저장', saved.themeName === 'ivory', JSON.stringify(saved.themeName));
check('jina_settings_v1에 aiConfig 저장', Boolean(saved.aiConfig?.provider), saved.aiConfig?.provider);
await page.reload();
await page.waitForTimeout(BOOT_MS);
const bgAfter = await page.evaluate(() => ({
  bg: getComputedStyle(document.querySelector('#root > div')).backgroundColor,
  expected: window.JINA_THEMES.ivory.bg,
}));
check('새로고침 후 테마 유지 (배경 == ivory 토큰)', bgAfter.bg === hexToRgb(bgAfter.expected),
  `${bgAfter.bg} vs ${hexToRgb(bgAfter.expected)}`);

// ── 3) 표시 이름 변경 (PATCH /api/me) ──
await openSettings(page);
await page.locator('[data-testid=account-name-input]').fill('지나E2E');
await page.locator('[data-testid=account-name-save]').click();
await page.waitForTimeout(1200);
check('저장 즉시 TopNav 칩 갱신', (await chipText(page)).includes('지나E2E'), await chipText(page));
const serverName = (await (await fetch(`${API}/api/auth/me`, { headers: { cookie } })).json()).user.display_name;
check('서버 display_name도 변경 (PATCH 반영)', serverName === '지나E2E', serverName);
await page.reload();
await page.waitForTimeout(BOOT_MS);
check('새로고침 후에도 유지 = 서버 저장', (await chipText(page)).includes('지나E2E'), await chipText(page));
// 원복
await openSettings(page);
await page.locator('[data-testid=account-name-input]').fill(DEV_NAME);
await page.locator('[data-testid=account-name-save]').click();
await page.waitForTimeout(1200);
check('원복 성공', (await chipText(page)).includes(DEV_NAME.split(' ')[0]), await chipText(page));

// ── 4) 로그아웃 → 로그인 화면 ──
await openSettings(page);
await page.locator('[data-testid=account-logout]').click();
await page.waitForTimeout(1200);
check('로그아웃 → 로그인 화면', await onLoginScreen(page));
let text = await rootText(page);
check('로그인 폼 필드 (이메일/비밀번호)',
  text.includes('이메일') && text.includes('비밀번호')
  && (await page.locator('#jina-login-email').count()) === 1);
check('DEV에서 "개발 계정으로 계속" 노출',
  (await page.locator('[data-testid=dev-continue]').count()) === 1
  && (await page.evaluate(() => window.JINA_CONFIG?.devAutologin === true)));

// ── 5) ★ opt-out 지속 — 새로고침해도 로그인 화면 ──
await page.reload();
await page.waitForTimeout(BOOT_MS);
check('새로고침 후에도 로그인 화면 (autologin 차단 지속)', await onLoginScreen(page),
  await page.evaluate(() => localStorage.jina_auth_optout || '(플래그 없음)'));

// ── 6) 잘못된 비밀번호 ──
await page.locator('#jina-login-email').fill(DEV_EMAIL);
await page.locator('input[type=password]').fill('wrongpass!');
await page.locator('[data-testid=login-submit]').click();
await page.waitForTimeout(1500);
const loginErr = await page.locator('[data-testid=login-error]').textContent();
check('로그인 실패 → 서버 메시지 그대로', loginErr.includes('이메일 또는 비밀번호가 올바르지 않습니다'), loginErr.trim());
check('실패 후에도 로그인 화면 유지 (크래시 없음)', await onLoginScreen(page) && errors.length === 0,
  errors.slice(0, 2).join(' | '));

// ── 7) 회원가입 + 사용자 분리 ──
const rand = Math.random().toString(36).slice(2, 8);
const NEW_EMAIL = `e2e-${rand}@test.dev`;
await page.locator('[data-testid=tab-signup]').click();
await page.locator('#jina-login-email').fill(NEW_EMAIL);
await page.locator('input[type=password]').fill('password123');
await page.locator('#jina-login-name').fill('E2E');
await page.locator('[data-testid=login-submit]').click();
await page.waitForTimeout(2500);
check('회원가입 → 앱 진입', !(await onLoginScreen(page)) && (await chipText(page)).includes('E2E'),
  await chipText(page).catch(() => '(칩 없음)'));
await page.getByRole('button', { name: '단어장', exact: true }).first().click();
await page.waitForTimeout(1500);
const newTotal = await page.evaluate(async () => {
  const r = await window.JINA_API.get('/api/vocab');
  return r.ok ? r.stats.total : -1;
});
text = await rootText(page);
check('신규 계정 단어장 0장 (user_id 분리)', newTotal === 0 && text.includes('0 단어 보유'), `total=${newTotal}`);

// ── 8) 로그아웃 → 같은 계정 재로그인 ──
await openSettings(page);
await page.locator('[data-testid=account-logout]').click();
await page.waitForTimeout(1200);
await page.locator('#jina-login-email').fill(NEW_EMAIL);
await page.locator('input[type=password]').fill('password123');
await page.locator('[data-testid=login-submit]').click();
await page.waitForTimeout(2500);
check('재로그인 성공', !(await onLoginScreen(page)) && (await chipText(page)).includes('E2E'),
  await chipText(page).catch(() => '(칩 없음)'));

// ── 9) dev 계정 복귀 ("개발 계정으로 계속") ──
await openSettings(page);
await page.locator('[data-testid=account-logout]').click();
await page.waitForTimeout(1200);
await page.locator('[data-testid=dev-continue]').click();
await page.waitForTimeout(2500);
check('개발 계정으로 계속 → dev 세션', (await chipText(page)).includes(DEV_NAME.split(' ')[0]),
  await chipText(page).catch(() => '(칩 없음)'));
check('opt-out 플래그 해제', await page.evaluate(() => localStorage.jina_auth_optout == null));
await page.getByRole('button', { name: '단어장', exact: true }).first().click();
await page.waitForTimeout(1500);
const devTotal = await page.evaluate(async () => {
  const r = await window.JINA_API.get('/api/vocab');
  return r.ok ? r.stats.total : -1;
});
text = await rootText(page);
check('dev 계정 시드 카드 표시 (== 서버 stats.total)',
  devTotal > 0 && text.includes(`${devTotal} 단어 보유`), `total=${devTotal}`);

// ── 10) offline 화면 (로그인 화면이 아님) ──
await page.route('**/api/auth/me**', (r) => r.abort());
await page.evaluate(() => localStorage.removeItem('jina_auth_optout'));
await page.reload();
await page.waitForTimeout(BOOT_MS);
text = await rootText(page);
check('API 불가 → offline 화면 (로그인 폼 아님)',
  text.includes('API 서버에 연결할 수 없습니다') && !(await onLoginScreen(page)));
check('offline 화면에 힌트 + 다시 시도 버튼',
  /npm run api/.test(text) && (await page.locator('button', { hasText: '다시 시도' }).count()) === 1);
await page.unroute('**/api/auth/me**');
await page.locator('button', { hasText: '다시 시도' }).click();
await page.waitForTimeout(2000);
check('다시 시도 → 앱 복귀', !(await onLoginScreen(page)) && (await chipText(page)).includes(DEV_NAME.split(' ')[0]),
  await chipText(page).catch(() => '(칩 없음)'));
check('전체 시나리오 콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.close();

// ── 11) 모바일 390px 로그인 화면 ──
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mobErrors = [];
errorSink(mob, mobErrors);
await routeCdn(mob);
await mob.goto(BASE);
await mob.evaluate(() => localStorage.setItem('jina_auth_optout', '1'));
await mob.reload();
await mob.waitForTimeout(BOOT_MS);
check('모바일 390px 로그인 화면 렌더', (await mob.locator('[data-testid=login-submit]').count()) === 1);
const cardBox = await mob.locator('[data-testid=login-submit]').boundingBox();
check('로그인 카드가 390px 안에 들어옴', cardBox && cardBox.x >= 0 && cardBox.x + cardBox.width <= 390,
  cardBox ? `x=${Math.round(cardBox.x)} w=${Math.round(cardBox.width)}` : '(없음)');
check('모바일 콘솔 에러 0', mobErrors.length === 0, mobErrors.slice(0, 2).join(' | '));
await mob.close();

// ── 12) 캔버스 무인증 (auth 요청 0건) ──
const canvas = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const canvasErrors = [];
const authReqs = [];
errorSink(canvas, canvasErrors, '|design-canvas\\.state');
canvas.on('request', (r) => { if (/\/api\/auth\//.test(r.url()) || /\/api\/me/.test(r.url())) authReqs.push(r.url()); });
await routeCdn(canvas);
await canvas.goto(BASE + '/canvas.html');
await canvas.waitForTimeout(10000);
check('캔버스 렌더 정상 (fallback)', (await canvas.locator('#root').innerHTML()).length > 5000);
check('캔버스 /api/auth/* 요청 0건', authReqs.length === 0, authReqs.slice(0, 2).join(' | '));
const guest = await canvas.evaluate(() => {
  const s = window.useAuth ? 'exists' : 'missing';
  return { s, hasProvider: typeof window.AuthProvider === 'function' };
});
check('캔버스도 auth-store 로드 (useAuth/AuthProvider 전역)', guest.s === 'exists' && guest.hasProvider);
const ro = await canvas.evaluate(() => window.JINA_API.patch('/api/me', { display_name: 'x' }).then((r) => r.code));
check('캔버스 PATCH /api/me → READONLY', ro === 'READONLY', String(ro));
check('캔버스 콘솔 에러 0', canvasErrors.length === 0, canvasErrors.slice(0, 2).join(' | '));
await canvas.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
