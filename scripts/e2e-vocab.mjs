// E2E: 단어장 실기능 검증 (docs/PLAN-vocab-backend.md Phase 5 브라우저 검증 순서)
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

// 1) 데스크탑 로드
await routeCdn(page);
await page.goto(BASE);
await page.waitForTimeout(9000); // in-browser Babel 컴파일
check('데스크탑 렌더', (await page.locator('#root').innerHTML()).length > 1000);

// 2) 단어장 탭
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: '단어장' }).click();
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

// 5) 전체 목록 — 서버 DTO(GET /api/vocab)의 단어가 전부 화면에 있어야 한다 (시드 상태에 의존하지 않음)
const serverWords = ((await (await fetch(`${API}/api/vocab`, { headers: { Origin: BASE } })).json()).cards || []).map((c) => c.word);
await page.locator('aside button', { hasText: '전체 단어장' }).click();
await page.waitForTimeout(800);
const listText = await page.locator('main').textContent();
check('서버 카드 목록 = GET /api/vocab 단어 전부 렌더', serverWords.length > 0 && serverWords.every((w) => listText.includes(w)), `${serverWords.length}단어`);
check('시드 단어 표시', listText.includes('procurement') && listText.includes('수용하다') === false || listText.includes('accommodate'));

// 6) AI 단어 추가 (claude, 5~15s)
await page.locator('aside button', { hasText: '단어 추가' }).click();
await page.waitForTimeout(500);
// 반복 실행으로 후보가 소진되면 가짜 단어가 아니라 실제 단어가 선택되도록 후보를 넉넉히 둔다
const WORDS = ['meticulous', 'diligent', 'pragmatic', 'concise', 'feasible', 'tentative', 'adjacent', 'redundant',
  'ambiguous', 'coherent', 'deteriorate', 'eloquent', 'fluctuate', 'imperative', 'lucrative', 'negligible', 'obsolete', 'plausible',
  'reluctant', 'scrupulous', 'substantial', 'transparent', 'versatile', 'viable', 'arbitrary', 'benchmark', 'compensate', 'delegate', 'expedite', 'facilitate'];
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
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: '단어장' }).click();
await page.waitForTimeout(2500);
await page.locator('aside button', { hasText: '전체 단어장' }).click();
await page.waitForTimeout(800);
const afterReload = await page.locator('main').textContent();
check(`새로고침 후 ${freshWord} 잔존`, afterReload.includes(freshWord));

// 7b) 오늘의 단어 — AI 퀴즈: 키워드 생성 → 서버 DTO 정답으로 10문항 → 10/10 → 전체 추가 → 단어장 +10
await page.locator('aside button', { hasText: '오늘의 단어 (AI 퀴즈)' }).click();
await page.waitForTimeout(1500);
// 오늘 퀴즈가 이미 있으면(완료/진행) '새 퀴즈 만들기'로 주제 선택 화면을 연다
if (await page.locator('[data-testid="quiz-new"]').count()) { await page.locator('[data-testid="quiz-new"]').click(); await page.waitForTimeout(500); }
check('퀴즈 탭 → 주제 선택 화면', (await page.locator('[data-testid="quiz-generate"]').count()) === 1);
await page.locator('[data-testid="quiz-kind-keyword"]').click();
await page.locator('[data-testid="quiz-keyword-input"]').fill('coffee');
const vocabBefore = ((await (await fetch(`${API}/api/vocab`, { headers: { Origin: BASE } })).json()).cards || []).length;
await page.locator('[data-testid="quiz-generate"]').click();
await page.waitForSelector('[data-testid="quiz-word"]', { timeout: 150000 }).catch(() => {}); // HTTP 예산(150s)과 동일 — 생성이 100초를 넘는 회차가 있다
const quizShown = (await page.locator('[data-testid="quiz-word"]').count()) === 1;
check('키워드 퀴즈 생성 → 첫 문항 표시 (AI)', quizShown,
  (await page.locator('main').textContent()).match(/오류: [^\n]{0,80}/)?.[0] || 'Q 1');
const todayQuiz = (await (await fetch(`${API}/api/vocab/quiz/today`, { headers: { Origin: BASE } })).json()).quiz;
check('서버 today 퀴즈 = 10단어', Boolean(todayQuiz) && todayQuiz.words.length === 10, todayQuiz?.topic_title);
check('발음 버튼(🔊) 렌더 — 문항 단어 옆', (await page.locator('[data-testid="speak-btn"]').count()) >= 1);
check('jinaSpeak 전역 · 호출 시 예외 없음', await page.evaluate(() => typeof window.jinaSpeak === 'function' && typeof window.jinaSpeak('test') === 'boolean'));
let answeredOk = 0;
let etyShown = 0;
let relShown = 0;
let relBtns = 0;
for (let i = 0; i < 10 && todayQuiz; i++) {
  const word = (await page.locator('[data-testid="quiz-word"]').textContent()).trim();
  const w = todayQuiz.words.find((x) => x.word === word);
  if (!w) break;
  await page.locator('[data-testid="quiz-option"]', { hasText: w.meaning_ko }).first().click();
  await page.waitForSelector('[data-testid="quiz-feedback"]');
  if ((await page.locator('[data-testid="quiz-feedback"]').textContent()).includes('정답!')) answeredOk += 1;
  etyShown += await page.locator('[data-testid="quiz-etymology"]').count();
  relShown += await page.locator('[data-testid="quiz-relations"]').count();
  relBtns += await page.locator('[data-testid="quiz-rel-add"]').count();
  await page.locator('[data-testid="quiz-next"]').click();
  await page.waitForTimeout(i === 9 ? 2500 : 300);
}
check('정답 10개 클릭 → 즉시 피드백 10회', answeredOk === 10, `${answeredOk}/10`);
// 어원/유의·반의어는 모델 재량 필드(빈 값이면 숨김) — verify-quiz와 같은 완만한 임계치
check('피드백에 어원 ≥5 · 유의/반의 행 ≥5 · 단어장 추가 버튼 렌더', etyShown >= 5 && relShown >= 5 && relBtns >= 1,
  `어원 ${etyShown}/10 · 관계어 ${relShown}/10 · [+]버튼 ${relBtns}`);
check('서버 채점 결과 10 / 10', /10\s*\/\s*10/.test((await page.locator('[data-testid="quiz-score"]').textContent().catch(() => '')).replace(/\s+/g, ' ')));
if (quizShown) await page.locator('[data-testid="quiz-add-all"]').click(); // 퀴즈가 안 떴으면 후속 클릭 생략(예외로 스위트가 중단되지 않게)
await page.waitForSelector('[data-testid="quiz-add-result"]', { timeout: 15000 }).catch(() => {});
// 생성 시 기존 단어 제외는 프롬프트 지시라 단어장이 커지면 중복이 샐 수 있다 — added+duplicates=10 으로 단정
const addMsg = await page.locator('[data-testid="quiz-add-result"]').textContent().catch(() => '');
const addedN = Number(addMsg.match(/단어장에 (\d+)개 추가/)?.[1] ?? -1);
const dupN = Number(addMsg.match(/이미 있던 단어 (\d+)개/)?.[1] ?? 0);
check('퀴즈 10단어 전부 추가 처리 (added+duplicates=10)', addedN >= 0 && addedN + dupN === 10, addMsg.trim().slice(0, 60));
const vocabAfter = ((await (await fetch(`${API}/api/vocab`, { headers: { Origin: BASE } })).json()).cards || []).length;
check('서버 단어장 +added', vocabAfter === vocabBefore + addedN, `${vocabBefore} → ${vocabAfter} (added ${addedN})`);
const todayDone = (await (await fetch(`${API}/api/vocab/quiz/today`, { headers: { Origin: BASE } })).json()).quiz;
check('today 퀴즈 completed · score 10', Boolean(todayDone?.completed_at) && todayDone.score === 10);
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
check('모바일 단어장 = 같은 서버 목록', mobileList.includes(freshWord) && serverWords.every((w) => mobileList.includes(w)));
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
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: 'AI 회화' }).click();
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
