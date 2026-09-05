// E2E: 관리자 · 콘텐츠 목록/상태 전이(플랜 11 Phase 2) + 레슨 에디터(플랜 13 Phase A).
// npm run dev 가 떠 있는 상태에서 실행. HTTP + 브라우저만 쓴다 — DB 직접 접근이 없어
// DB_DRIVER=pglite 로 띄운 서버(단일 프로세스 잠금)에서도 그대로 돈다.
//
// 흐름: learner 403 → 목록 렌더 → 새 레슨(검증 실패 422 렌더 → 채워서 저장) →
//       검수 요청 → 승인 → 전체 공개 → 학습 API 노출 → 내리기(공개범위 유지·목록 제외) →
//       다시 올리기 → 에디터 수정 → 감사 로그 누적 단정.
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: BASE };
const ADMIN_ID = process.env.E2E_ADMIN || 'admin';
const ADMIN_PW = process.env.E2E_ADMIN_PW || '1234';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};

async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: H, body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  return { ok: body.ok, cookie, body };
}

async function api(cookie, method, path, payload) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { ...H, Cookie: cookie },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

const admin = await login(ADMIN_ID, ADMIN_PW);
if (!admin.ok) {
  console.error('admin 로그인 실패 — .env ADMIN_USERNAME/PASSWORD 또는 E2E_ADMIN/E2E_ADMIN_PW 확인:', admin.body);
  process.exit(1);
}

// 0) 권한 경계 — learner 는 콘텐츠 API 전부 403
const learnerEmail = `e2e-contents-${Date.now()}@test.dev`;
await fetch(`${API}/api/auth/signup`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ email: learnerEmail, password: 'e2e-pass-1234', display_name: 'E2E' }),
});
const learner = await login(learnerEmail, 'e2e-pass-1234');
const l1 = await api(learner.cookie, 'GET', '/api/admin/contents');
check('learner 의 콘텐츠 목록은 403', l1.status === 403 && l1.body.code === 'FORBIDDEN');
const l2 = await api(learner.cookie, 'POST', '/api/admin/contents/lesson', { title: 'x' });
check('learner 의 레슨 생성은 403', l2.status === 403);

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{
  name: admin.cookie.split('=')[0], value: admin.cookie.split('=')[1].split(';')[0],
  domain: new URL(BASE).hostname, path: '/',
}]);
const page = await ctx.newPage();
await routeCdn(page);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });

// 1) 목록 렌더
await page.waitForSelector('[data-testid="content-row"]', { timeout: 20000 });
const rowCount = await page.locator('[data-testid="content-row"]').count();
check('콘텐츠 목록 렌더', rowCount >= 1, `${rowCount}행`);

// 2) 새 레슨 — 빈 문항 저장은 서버 422 + 오류 렌더
await page.click('[data-testid="lesson-new"]');
await page.waitForSelector('[data-testid="lesson-title"]');
const TITLE = `E2E 저작 레슨 ${Date.now()}`;
await page.fill('[data-testid="lesson-title"]', TITLE);
await page.click('[data-testid="lesson-save"]');
await page.waitForSelector('[data-testid="lesson-validation-errors"]', { timeout: 10000 });
check('빈 문항 저장 → 422 검증 오류 렌더', true);

// 3) 채워서 저장 → 초안 행
await page.fill('textarea[placeholder="문제 (stem)"]', 'The proposal ___ by the board yesterday.');
const options = ['approve', 'was approved', 'approving', 'approves'];
for (let i = 0; i < 4; i += 1) await page.fill(`input[placeholder="보기 ${'ABCD'[i]}"]`, options[i]);
await page.click('button[title="정답으로 지정"] >> nth=1'); // B
await page.fill('textarea[placeholder*="해설"]', '정답은 (B) — 어제 일어난 수동태입니다.');
await page.click('[data-testid="lesson-save"]');
await page.waitForSelector(`[data-testid="content-row"]:has-text("${TITLE}")`, { timeout: 10000 });
const newRow = page.locator(`[data-testid="content-row"]:has-text("${TITLE}")`);
check('저장 → 목록에 초안 행', (await newRow.innerText()).includes('초안'));

// 4) 전이 + 공개
async function rowAction(label) {
  await newRow.locator('[data-testid="content-kebab"]').click();
  await page.click(`[data-testid="content-kebab-menu"] button:has-text("${label}")`);
  await page.waitForTimeout(600);
}
await rowAction('검수 요청');
check('draft → review', (await newRow.innerText()).includes('검토'));
await rowAction('승인 → 발행');
check('review → published', (await newRow.innerText()).includes('공개'));
await rowAction('전체 공개로 전환');
check('visibility → public', (await newRow.innerText()).includes('전체 공개'));

const pubList = await api(learner.cookie, 'GET', '/api/lessons');
check('학습자 목록에 노출 (published+public)',
  Boolean(pubList.body.lessons?.some((l) => l.title === TITLE)));

// 5) 내리기 — 공개범위 유지 · 학습 목록 제외 (0018 확정 CHECK 의 검증)
await rowAction('내리기');
const archivedText = await newRow.innerText();
check('published → archived (공개범위 유지)',
  archivedText.includes('내림') && archivedText.includes('전체 공개'));
const archList = await api(learner.cookie, 'GET', '/api/lessons');
check('archived 는 학습자 목록에서 제외', !archList.body.lessons?.some((l) => l.title === TITLE));
await rowAction('다시 올리기');
check('archived → published 복귀', (await newRow.innerText()).includes('공개'));

// 6) 수정 — 에디터가 기존 값을 채우고 저장이 반영된다
await newRow.locator('[data-testid="content-kebab"]').click();
await page.click('[data-testid="content-kebab-menu"] button:has-text("수정")');
await page.waitForSelector('[data-testid="lesson-title"]');
check('에디터가 기존 제목 로드', (await page.inputValue('[data-testid="lesson-title"]')) === TITLE);
await page.fill('[data-testid="lesson-title"]', `${TITLE} (수정)`);
await page.click('[data-testid="lesson-save"]');
await page.waitForSelector(`[data-testid="content-row"]:has-text("${TITLE} (수정)")`, { timeout: 10000 });
check('수정 저장 → 목록 제목 갱신', true);

// 7) 리비전 이력 — 에디터의 이력 패널에서 rev 1(생성 시점)로 복원하면 제목이 돌아온다
await newRow.locator('[data-testid="content-kebab"]').click();
await page.click('[data-testid="content-kebab-menu"] button:has-text("수정")');
await page.waitForSelector('[data-testid="lesson-history"]');
await page.click('[data-testid="lesson-history"]');
await page.waitForSelector('[data-testid="revision-row"]', { timeout: 10000 });
const revRows = await page.locator('[data-testid="revision-row"]').count();
check('이력 패널 — 생성·수정 리비전 표시', revRows >= 2, `${revRows}개`);
page.once('dialog', (d) => d.accept());
await page.click('[data-testid="revision-restore-1"]');
await page.waitForFunction(
  (t) => document.querySelector('[data-testid="lesson-title"]')?.value === t,
  TITLE, { timeout: 10000 },
);
check('rev 1 복원 → 에디터 제목 원복', true);
// 복원 직후 패널이 재조회 중일 수 있다 — 행 수가 늘어날 때까지 기다린다
await page.waitForFunction(
  (n) => document.querySelectorAll('[data-testid="revision-row"]').length === n,
  revRows + 1, { timeout: 10000 },
);
check('복원이 새 리비전으로 쌓인다 (되감기 없음)', true, `${revRows + 1}개`);
await page.click('button:has-text("← 목록")');
await page.waitForSelector(`[data-testid="content-row"]:has-text("${TITLE}")`, { timeout: 10000 });

// 8) 감사 로그 누적 — 승인 행에 rev 스탬프 포함
const list = await api(admin.cookie, 'GET', `/api/admin/contents?q=${encodeURIComponent(TITLE)}`);
const created = list.body.contents?.[0];
const detail = await api(admin.cookie, 'GET', `/api/admin/contents/${created.id}`);
const auditRows = detail.body.content.recent_audit;
const actions = auditRows.map((a) => a.action);
check('감사 로그 누적 (status/restore)',
  actions.includes('status_change') && actions.includes('restore'), actions.join(','));
const full = await api(admin.cookie, 'GET', `/api/admin/contents/${created.id}/revisions`);
check('리비전 API — current_rev 일치',
  full.body.current_rev === detail.body.content.current_rev, `rev ${full.body.current_rev}`);

await browser.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} 통과`);
process.exit(fail ? 1 : 0);
