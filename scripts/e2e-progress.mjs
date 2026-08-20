// E2E: 학습 통계 탭 (docs/plan/04-progress.md Phase P4)
// 서버 집계(GET /api/progress)가 데스크탑·모바일에 같은 수치로 렌더되는지,
// 첨삭 SRS 복습(POST /api/corrections/:id/review)이 새로고침 후에도 남는지,
// 캔버스(Provider 부재)가 fallback으로 무에러 렌더되는지 확인한다.
// 기대값은 하드코딩하지 않고 서버 DTO를 fetch해 대조한다.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3003';
const API = 'http://localhost:3004';
const VENDOR = '/tmp/claude-0/-home-user-english-tutor-jina/112ff4bd-5b74-582c-b59e-e6f055a8d4cd/scratchpad/vendor';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 이 컨테이너는 unpkg CDN이 차단되어 있어 로컬 파일로 라우팅한다 (리포 무수정)
async function routeCdn(page) {
  await page.route('**://unpkg.com/**', (route) => {
    const url = route.request().url();
    const file = url.includes('react-dom') ? 'react-dom.development.js'
      : url.includes('/react@') ? 'react.development.js'
      : url.includes('babel') ? 'babel.min.js' : null;
    if (!file) return route.abort();
    return route.fulfill({ path: `${VENDOR}/${file}`, contentType: 'application/javascript' });
  });
}

const errorSink = (page, sink, extraIgnore = '') => {
  page.on('pageerror', (e) => sink.push('PAGEERROR: ' + String(e).slice(0, 200)));
  page.on('console', (m) => {
    const re = new RegExp(`net::|404|403|favicon${extraIgnore}`);
    if (m.type() === 'error' && !re.test(m.text())) sink.push(m.text().slice(0, 200));
  });
};

// 통계 탭으로 이동 — 데스크탑 TopNav는 '학습 통계', 모바일 하단 내비는 '통계' (main.jsx/app-nav.jsx)
async function gotoProgress(page, { mobile = false } = {}) {
  const tab = page.getByRole('button', { name: mobile ? '통계' : '학습 통계', exact: true }).first();
  await tab.click({ timeout: 10000 });
  await page.waitForTimeout(1500);
}

// ── 서버 DTO 먼저 ──
const cookieRes = await fetch(`${API}/api/auth/me`);
const cookie = (cookieRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
const prog = (await (await fetch(`${API}/api/progress`, { headers: { cookie } })).json());
check('GET /api/progress ok', prog.ok === true);
const p = prog.progress || {};
check('DTO 필드 = mock 필드명', ['user', 'skills', 'weekly', 'monthly_scores', 'weeks_to_target',
  'corrections_due', 'recent_sessions'].every((k) => p[k] !== undefined));
check('monthly_scores 빈 배열 · weeks_to_target null (v1 계약)',
  Array.isArray(p.monthly_scores) && p.monthly_scores.length === 0 && p.weeks_to_target === null);
check('BIGINT/NUMERIC 파서 — streak/total_minutes/due가 number',
  typeof p.user.streak === 'number' && typeof p.user.total_minutes === 'number'
  && p.corrections_due.every((c) => typeof c.id === 'number'));

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });

// ── 1) 데스크탑 ──
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const deskErrors = [];
errorSink(desk, deskErrors);
await routeCdn(desk);
await desk.goto(BASE);
await desk.waitForTimeout(9000); // in-browser Babel 컴파일
await gotoProgress(desk);
let deskText = await desk.locator('#root').textContent();

check('데스크탑 통계 렌더', (await desk.locator('#root').innerHTML()).length > 5000);
// 2) mock 아님 증명 — 구현 전 고정값이 본문에 없어야 한다
check('mock 리터럴 제거 (1840분 / 243단어 / 48세션)',
  !/1840|243개|48회/.test(deskText));
check('연속 학습이 mock 24일이 아님 = 서버 streak',
  deskText.includes(`${p.user.streak}일 🔥`), `${p.user.streak}일`);
check('예상 점수 = 서버 값',
  p.user.current_score == null ? deskText.includes('—') : deskText.includes(String(p.user.current_score)),
  String(p.user.current_score));
check('목표 점수 = 서버 값', deskText.includes(String(p.user.target_score)), String(p.user.target_score));
// 3) 사이드바 첨삭 배지 == corrections_due.length (서버 단일 소스)
const badgeOf = async (page) => Number(await page.evaluate(async () => {
  const r = await window.JINA_API.get('/api/progress');
  return r.ok ? r.progress.corrections_due.length : -1;
}));
check('page.evaluate JINA_API == 화면 배지', (await badgeOf(desk)) === p.corrections_due.length
  && deskText.includes(`${p.corrections_due.length}개 대기`), `${p.corrections_due.length}개`);
check('스킬 = 서버 배열 (Listening 없음)',
  p.skills.every((s) => deskText.includes(s.label)) && !deskText.includes('Listening'),
  p.skills.map((s) => s.key).join(','));
// 4) 월별 추이 빈 상태 (Math.min(...[])·0나눗셈 크래시 방지 증명)
check('월별 추이 빈 상태 문구', deskText.includes('월별 추이는 데이터가 쌓이면 표시돼요'));
check('데스크탑 콘솔 에러 0 (빈 배열 크래시 없음)', deskErrors.length === 0, deskErrors.slice(0, 2).join(' | '));

// 5) '지금 복습 시작' → SRS 버튼 4개 + 부제는 서버 preview 라벨
if (p.corrections_due.length > 0) {
  await desk.getByText('지금 복습 시작', { exact: true }).first().click();
  await desk.waitForTimeout(500);
  deskText = await desk.locator('#root').textContent();
  const labels = ['다시', '어려움', '보통', '쉬움'];
  check('SRS 버튼 4개 표시', labels.every((l) => deskText.includes(l)));
  const againLabel = p.corrections_due[0].preview.again.label;
  const againSub = await desk.locator('button', { hasText: '다시' }).first().textContent();
  check(`'다시' 부제 == 서버 preview 라벨 (${againLabel})`, againSub.includes(againLabel), againSub.trim());

  // 6) '보통' 클릭 → 카드 소멸 + 배지 감소
  const target = p.corrections_due[0];
  await desk.locator('button', { hasText: '보통' }).first().click();
  await desk.waitForTimeout(2500); // 낙관적 반영 + debounce refresh
  deskText = await desk.locator('#root').textContent();
  check('복습한 첨삭 카드 소멸', !deskText.includes(target.original), target.original);
  check('배지 감소', deskText.includes(`${p.corrections_due.length - 1}개 대기`),
    `${p.corrections_due.length} → ${p.corrections_due.length - 1}`);

  // 7) 새로고침 후에도 유지 (서버 저장 증명)
  await desk.reload();
  await desk.waitForTimeout(9000);
  await gotoProgress(desk);
  deskText = await desk.locator('#root').textContent();
  check('새로고침 후 배지 유지 = 서버 저장',
    deskText.includes(`${p.corrections_due.length - 1}개 대기`));
} else {
  check('첨삭 없음 → 빈 상태', (await desk.locator('#root').textContent()).includes('복습할 첨삭이 없어요'));
}
// 7b) API 불가 → write-through 캐시 + 에러 배너 (빈 화면 금지 증명).
// 서버를 죽이지 않고 이 페이지의 /api/progress 요청만 끊는다.
await desk.route('**/api/progress', (route) => route.abort());
await desk.reload();
await desk.waitForTimeout(9000);
await gotoProgress(desk);
const offlineText = await desk.locator('#root').textContent();
check('API 불가 시 캐시 렌더 (빈 화면 아님)', offlineText.includes('연속 학습'));
check('API 불가 시 에러 배너', /API 서버에 연결할 수 없습니다|npm run api/.test(offlineText));
await desk.unroute('**/api/progress');
await desk.close();

// ── 8) 모바일 (같은 스토어 → 같은 수치) ──
const after = (await (await fetch(`${API}/api/progress`, { headers: { cookie } })).json()).progress;
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mobErrors = [];
errorSink(mob, mobErrors);
await routeCdn(mob);
await mob.goto(BASE);
await mob.waitForTimeout(9000);
await gotoProgress(mob, { mobile: true });
const mobText = await mob.locator('body').textContent();
check('모바일 통계 렌더', (await mob.locator('#root').innerHTML()).length > 3000);
check('모바일 streak == 데스크탑/서버 값', mobText.includes(String(after.user.streak)));
check('모바일 첨삭 배지 == 서버 due', mobText.includes(`${after.corrections_due.length}개`),
  `${after.corrections_due.length}개`);
check('모바일 단어 수 = 서버 값', mobText.includes(`${after.user.words_learned}개`));
check('모바일 콘솔 에러 0', mobErrors.length === 0, mobErrors.slice(0, 2).join(' | '));
await mob.close();

// ── 9) 캔버스 (Provider 부재 → fallback + READONLY) ──
const canvas = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const canvasErrors = [];
errorSink(canvas, canvasErrors, '|design-canvas\\.state');
await routeCdn(canvas);
await canvas.goto(BASE + '/canvas.html');
await canvas.waitForTimeout(10000);
const canvasText = await canvas.locator('#root').textContent();
check('캔버스 렌더 (fallback)', (await canvas.locator('#root').innerHTML()).length > 5000);
check('캔버스 통계 아트보드 = mock 수치(24)', /24/.test(canvasText));
const ro = await canvas.evaluate(async () => {
  const r = await window.JINA_API.post('/api/corrections/1/review', { result: 'good' });
  return r.code;
});
check('캔버스 복습 시도 → READONLY', ro === 'READONLY', String(ro));
check('캔버스 콘솔 에러 0', canvasErrors.length === 0, canvasErrors.slice(0, 2).join(' | '));
await canvas.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
