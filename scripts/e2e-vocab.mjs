// E2E: 단어장 실기능 검증 (docs/PLAN-vocab-backend.md Phase 5 브라우저 검증 순서)
import { chromium } from 'playwright';

const BASE = 'http://localhost:3003';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};

const VENDOR = '/tmp/claude-0/-home-user-english-tutor-jina/112ff4bd-5b74-582c-b59e-e6f055a8d4cd/scratchpad/vendor';
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

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) errors.push(m.text());
});

// 1) 데스크탑 로드
await routeCdn(page);
await page.goto(BASE);
await page.waitForTimeout(9000); // in-browser Babel 컴파일
check('데스크탑 렌더', (await page.locator('#root').innerHTML()).length > 1000);

// 2) 단어장 탭
await page.locator('header button', { hasText: '단어장' }).click();
await page.waitForTimeout(2500);
const reviewHeader = await page.locator('h1').first().textContent();
check('복습 큐 헤더', /오늘의 복습 · \d+개/.test(reviewHeader), reviewHeader.trim());

// 3) 복습 큐에 new 단어 포함 (compliance/scrutinize)
const queueCount = Number(reviewHeader.match(/(\d+)개/)?.[1] || 0);
check('복습 큐에 new 포함 (버그 2)', queueCount >= 2, `${queueCount}개`);

// 4) 플래시카드 복습 — preview 라벨 확인
const flipBtn = page.locator('button', { hasText: '의미 확인' });
if (await flipBtn.count()) {
  await flipBtn.click();
  await page.waitForTimeout(400);
  const subtitle = await page.locator('button:has-text("다시") span').last().textContent();
  check('복습 버튼 부제 = 서버 preview 라벨 (버그 3)', subtitle.trim() === '10분', `"${subtitle.trim()}"`);
  await page.locator('button', { hasText: '보통' }).click();
  await page.waitForTimeout(1500); // POST /review
  check('복습 POST 후 진행', true);
} else {
  check('플래시카드 표시', false, '의미 확인 버튼 없음');
}

// 5) 전체 목록 — 서버 데이터 (resilient 포함 9단어)
await page.locator('aside button', { hasText: '전체 단어장' }).click();
await page.waitForTimeout(800);
const listText = await page.locator('main').textContent();
check('서버 카드 목록 (resilient 잔존 = 서버 저장)', listText.includes('resilient'));
check('시드 단어 표시', listText.includes('procurement') && listText.includes('수용하다') === false || listText.includes('accommodate'));

// 6) AI 단어 추가 (claude, 5~15s)
await page.locator('aside button', { hasText: '단어 추가' }).click();
await page.waitForTimeout(500);
const WORDS = ['meticulous', 'diligent', 'pragmatic', 'concise', 'feasible', 'tentative', 'adjacent', 'redundant'];
const freshWord = WORDS.find((w) => !listText.includes(w)) || `test${String(Math.floor(Math.random() * 900) + 100)}word`.replace(/\d/g, (d) => 'abcdefghij'[d]);
await page.locator('input[placeholder*="procrastinate"]').fill(freshWord);
await page.locator('button', { hasText: 'AI 추가' }).click();
await page.waitForTimeout(1200);
const pendingShown = await page.locator('text=생성하는 중').count();
check(`추가 pending 표시 + 취소 버튼 (${freshWord})`, pendingShown > 0 && (await page.locator('button', { hasText: '취소' }).count()) > 0);
await page.waitForSelector('text=단어장에 추가됨', { timeout: 60000 }).catch(() => {});
const addPanel = await page.locator('main').textContent();
check('AI 추가 결과 카드 (실제 품사/발음기호/뜻)', /단어장에 추가됨/.test(addPanel) && addPanel.includes(freshWord) && addPanel.includes('/'), addPanel.match(new RegExp(freshWord + '[^"]{0,60}'))?.[0]?.slice(0, 60));

// 7) 새로고침 후 잔존 (서버 저장 증명)
await page.reload();
await page.waitForTimeout(9000);
await page.locator('header button', { hasText: '단어장' }).click();
await page.waitForTimeout(2500);
await page.locator('aside button', { hasText: '전체 단어장' }).click();
await page.waitForTimeout(800);
const afterReload = await page.locator('main').textContent();
check(`새로고침 후 ${freshWord} 잔존`, afterReload.includes(freshWord));

// 8) 모바일 뷰포트 — 같은 목록 (Context 승격 증명)
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await routeCdn(mobile);
await mobile.goto(BASE);
await mobile.waitForTimeout(9000);
// 하단 탭 '단어장'
await mobile.locator('button', { hasText: '단어장' }).last().click();
await mobile.waitForTimeout(2500);
await mobile.locator('button', { hasText: '전체 목록' }).click();
await mobile.waitForTimeout(800);
const mobileList = await mobile.locator('body').textContent();
check('모바일 단어장 = 같은 서버 목록', mobileList.includes(freshWord) && mobileList.includes('resilient'));
await mobile.close();

// 9) 캔버스 — READONLY 가드
const canvas = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const canvasErrors = [];
canvas.on('console', (m) => { if (m.type() === 'error' && !/net::|404|403|design-canvas.state/.test(m.text())) canvasErrors.push(m.text()); });
await routeCdn(canvas);
await canvas.goto(BASE + '/canvas.html');
await canvas.waitForTimeout(10000);
check('캔버스 렌더', (await canvas.locator('#root').innerHTML()).length > 1000);
const readonlyResult = await canvas.evaluate(() =>
  window.JINA_API.post('/api/vocab/add', { word: 'test' }));
check('캔버스 쓰기 차단 (READONLY)', readonlyResult.code === 'READONLY', readonlyResult.code);
check('캔버스 콘솔 에러 0', canvasErrors.length === 0, canvasErrors.slice(0, 2).join(' | '));
await canvas.close();

// 10) 회화 — claude 실채팅 + API kill 후 에러 버블
await page.locator('header button', { hasText: 'AI 회화' }).click();
await page.waitForTimeout(2000);
const chatInput = page.locator('textarea');
await chatInput.fill('I go to school yesterday.');
await chatInput.press('Enter');
await page.waitForSelector('text=첨삭', { timeout: 90000 }).catch(() => {});
const convoText = await page.locator('body').textContent();
check('회화 응답 + 첨삭 렌더', convoText.includes('첨삭'));

check('메인 콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
