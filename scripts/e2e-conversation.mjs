// E2E: AI 회화 영속화 검증 (docs/plan/01-conversation.md Phase C5)
// scripts/e2e-vocab.mjs를 본떠 작성 — 동일 vendor CDN 라우팅 + Babel 컴파일 대기.
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};


const browser = await chromium.launch(launchOptions);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) errors.push(m.text());
});

// 1) 데스크탑 렌더 → AI 회화 탭
await routeCdn(page);
await page.goto(BASE);
await page.waitForTimeout(9000); // in-browser Babel 컴파일
check('데스크탑 렌더', (await page.locator('#root').innerHTML()).length > 1000);
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: 'AI 회화' }).click();
await page.waitForTimeout(2500);

// 2) 사이드바 시드 세션
const sidebarText = await page.locator('aside[aria-label="회화 세션"]').textContent();
check('사이드바 시드 세션 (비즈니스 미팅 + 카페에서 주문하기)',
  sidebarText.includes('비즈니스 미팅') && sidebarText.includes('카페에서 주문하기'));

// 3) '비즈니스 미팅' 클릭 → 저장된 메시지 로드
await page.locator('aside button', { hasText: '비즈니스 미팅' }).click();
await page.waitForTimeout(2000);
const bodyText = await page.locator('body').textContent();
check('저장된 메시지 로드 (OfficeMart + 첨삭 2개 렌더)',
  bodyText.includes('OfficeMart') && bodyText.includes('첨삭 (2)'));

// 4) FeedbackPane 실데이터 — /100 옆 점수 숫자 + 오늘의 단어(vocab due 카드)
const feedback = await page.locator('aside').last().textContent();
const scoreMatch = feedback.match(/(\d+)\/ 100/);
// 기대값은 고정 리터럴이 아니라 서버 DTO에서 재계산 — 스토어 computeLastScored와 같은 산식:
// 위에서 클릭한 '비즈니스 미팅' 세션의 마지막 scored assistant 메시지 점수 평균(반올림)
const hdr = { headers: { Origin: BASE } };
const srvSessions = (await (await fetch(`${API}/api/conversations`, hdr)).json()).sessions;
const autoSession = srvSessions.find((sess) => sess.title === '비즈니스 미팅') || null; // 위에서 클릭한 세션
let expectedScore = null;
if (autoSession) {
  const { messages: srvMsgs } = await (await fetch(`${API}/api/conversations/${autoSession.id}`, hdr)).json();
  const lastScored = [...srvMsgs].reverse().find((m) => m.role === 'assistant' && m.scores);
  const vals = lastScored ? Object.values(lastScored.scores).filter((v) => typeof v === 'number') : [];
  expectedScore = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}
check(`FeedbackPane 점수 = 서버 파생값 (세션 #${autoSession?.id} 마지막 scored 평균 ${expectedScore})`,
  expectedScore !== null && scoreMatch !== null && Number(scoreMatch[1]) === expectedScore, scoreMatch ? scoreMatch[1] : '점수 없음');
check('FeedbackPane 오늘의 단어 (vocab due 카드)', feedback.includes('오늘의 단어'));

// 5) 새 회화 시작 → 전송 → 첨삭 렌더 (claude 5~15s)
await page.locator('aside button', { hasText: '새 회화 시작' }).click();
await page.waitForTimeout(800);
const chatInput = page.locator('textarea');
await chatInput.fill('I go to school yesterday.');
await chatInput.press('Enter');
await page.waitForFunction(
  () => /첨삭 \([1-9]/.test(document.body.innerText),
  null, { timeout: 90000 },
).catch(() => {});
const afterSend = await page.locator('body').textContent();
check('새 회화 전송 → 첨삭 포함 응답', /첨삭 \([1-9]/.test(afterSend));

// 6) 사이드바 자동 제목 세션
const sidebar2 = await page.locator('aside[aria-label="회화 세션"]').textContent();
check('사이드바 자동 제목 세션 (I go to school…)', sidebar2.includes('I go to school'));

// 7) 새로고침 → 세션/메시지 잔존 (서버 저장 증명)
await page.reload();
await page.waitForTimeout(9000);
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: 'AI 회화' }).click();
await page.waitForTimeout(2500);
await page.locator('aside button', { hasText: 'I go to school' }).first().click();
await page.waitForTimeout(2000);
const afterReload = await page.locator('body').textContent();
check('새로고침 후 메시지 잔존', afterReload.includes('I go to school yesterday.') && /첨삭 \([1-9]/.test(afterReload));

// 8) 모바일 뷰포트 — 같은 최근 세션 이어짐 (Context 승격 증명)
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await routeCdn(mobile);
await mobile.goto(BASE);
await mobile.waitForTimeout(9000);
await mobile.locator('button', { hasText: 'AI 회화' }).last().click();
await mobile.waitForTimeout(2500);
const mobileText = await mobile.locator('body').textContent();
check('모바일 = 같은 최근 세션 메시지', mobileText.includes('I go to school yesterday.'));
await mobile.close();

// 9) 캔버스 — READONLY 가드 + 라이브 chat 데모 허용
const canvas = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const canvasErrors = [];
// 400은 아래 chat 허용 프로브(빈 body → BAD_REQUEST)가 의도적으로 유발한다
canvas.on('console', (m) => { if (m.type() === 'error' && !/net::|404|403|400|design-canvas.state/.test(m.text())) canvasErrors.push(m.text()); });
await routeCdn(canvas);
await canvas.goto(BASE + '/canvas.html');
await canvas.waitForTimeout(10000);
check('캔버스 렌더', (await canvas.locator('#root').innerHTML()).length > 1000);
const readonlyResult = await canvas.evaluate(() =>
  window.JINA_API.post('/api/conversations', {}));
check('캔버스 회화 저장 차단 (READONLY)', readonlyResult.code === 'READONLY', readonlyResult.code);
// /api/ai/chat 은 캔버스에서도 통과해야 한다 — 빈 body로 400(BAD_REQUEST)이 오면
// 클라/서버 READONLY 가드를 둘 다 지나 라우트까지 도달했다는 증명 (실제 CLI 호출 없이 빠름).
const chatAllowed = await canvas.evaluate(() =>
  window.JINA_API.post('/api/ai/chat', {}));
check('캔버스 라이브 chat 데모 허용 (/api/ai/chat READONLY 아님)',
  chatAllowed.code !== 'READONLY', chatAllowed.code);
check('캔버스 콘솔 에러 0', canvasErrors.length === 0, canvasErrors.slice(0, 2).join(' | '));
await canvas.close();

// 10) 멱등/에러는 API 레벨에서 검증됨(Phase C2 curl) — 브라우저는 콘솔 에러 0만
check('메인 콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
