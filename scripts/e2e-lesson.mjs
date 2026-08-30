// E2E: TOEIC 학습 탭 영속화 검증 (docs/plan/02-lesson.md Phase 4)
// scripts/e2e-vocab.mjs를 본떠 작성 — 동일 vendor CDN 라우팅 + Babel 컴파일 대기.
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';
import { pool } from '../api/lib/pool.js';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};


// 진도(1/2 → 2/2)는 attempts 집계 파생값이라 이 스크립트가 attempt를 만들며 값이 변한다.
// 재실행 가능하게 하려고 dev 시드 attempt(고정 client_request_id) 외의 시도를 지운다.
const SEED_REQ_ID = '11111111-1111-4111-8111-111111111111';
const wiped = await pool.query(
  `DELETE FROM public.user_lesson_attempts WHERE client_request_id IS DISTINCT FROM $1::uuid`,
  [SEED_REQ_ID],
);
await pool.end();
console.log(`· 진도 초기화: 시드 외 attempt ${wiped.rowCount}건 삭제 (기대 진도 1/2)`);

// 진도 배지 텍스트 ("진도" 라벨의 부모 텍스트 = "진도1/2")
const progressBadge = (p) => p.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === '진도');
  return el ? el.parentElement.textContent.replace(/\s+/g, '') : null;
});
// 모바일 헤더 진도 (PART 7 pill 옆 n/m)
const mobileProgress = (p) => p.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find((s) => /^\d+\/\d+$/.test(s.textContent.trim()));
  return el ? el.textContent.trim() : null;
});

const browser = await chromium.launch(launchOptions);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) errors.push(m.text());
});

// 1) 데스크탑 로드 → 학습 탭 → 서버 콘텐츠 렌더
await routeCdn(page);
await page.goto(BASE);
await page.waitForTimeout(9000); // in-browser Babel 컴파일
check('데스크탑 렌더', (await page.locator('#root').innerHTML()).length > 1000);
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: 'TOEIC 학습' }).click();
await page.waitForTimeout(2500);
const lessonText = await page.locator('body').textContent();
check('학습 탭 서버 콘텐츠 렌더 (Set 23 + 지문 본문)',
  lessonText.includes('Set 23') && lessonText.includes('Bright Mornings'));

// 2) ★정답 비노출 — GET /api/lessons/1 응답 원문에 answer/correct/explanation 없음
const detailRaw = await page.evaluate(() => fetch(window.JINA_API.base + '/api/lessons/1', {
  credentials: 'include', headers: { 'X-Requested-With': 'jina' },
}).then((r) => r.text()));
const leaks = ['"answer"', '"correct"', '"explanation"'].filter((k) => detailRaw.includes(k));
check('GET /api/lessons/1 에 정답·해설 비노출', leaks.length === 0, leaks.join(',') || '누출 0');

// 3) 진도 배지 = attempts 집계 파생값 (dev 시드 1건 → 1/2)
const badge1 = await progressBadge(page);
check('진도 배지 1/2 (dev 시드 attempt 집계)', badge1 === '진도1/2', String(badge1));

// 4) 3문항 답변(오답 1개 섞기: 1→B, 2→A, 3→B) → 채점하기 → 서버 채점 결과
for (const t of ['To outline next steps for an upcoming campaign',
                 'It has been postponed by one week',
                 'obstacles']) {
  await page.locator('button', { hasText: t }).first().click();
  await page.waitForTimeout(200);
}
await page.locator('button', { hasText: '채점하기' }).click();
await page.waitForFunction(() => /\/ 3 정답/.test(document.body.innerText), null, { timeout: 20000 })
  .catch(() => {});
const graded = await page.locator('body').innerText();
check('서버 채점 결과 2 / 3 정답', /2\s*\/\s*3 정답/.test(graded),
  graded.match(/\d\s*\/\s*3 정답/)?.[0]);
check('2번 문항 서버 해설(move up) 렌더', graded.includes('move up'));

// 5) 다른 탭 왕복(리마운트) 후에도 답/결과 유지 — 스토어 생존
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: '단어장' }).click();
await page.waitForTimeout(1500);
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: 'TOEIC 학습' }).click();
await page.waitForTimeout(1500);
const afterRemount = await page.locator('body').innerText();
check('탭 왕복 리마운트 후 답/결과 유지 (스토어 생존)',
  /2\s*\/\s*3 정답/.test(afterRemount) && afterRemount.includes('move up'));

// 6) '다음 지문' → Set 24 → set24 고유 해설 (★해설 버그 해소)
await page.locator('button', { hasText: '다음 지문' }).click();
await page.waitForTimeout(2500);
const set24 = await page.locator('body').innerText();
check('다음 지문 → Set 24 렌더 (subtitle/지문 교체)',
  set24.includes('Set 24') && set24.includes('Elevator B'));
for (const t of ['To inform staff about temporary elevator unavailability',
                 'Call extension 4400 by Wednesday afternoon',
                 'By Friday at noon']) {
  await page.locator('button', { hasText: t }).first().click();
  await page.waitForTimeout(200);
}
await page.locator('button', { hasText: '채점하기' }).click();
await page.waitForFunction(() => /\/ 3 정답/.test(document.body.innerText), null, { timeout: 20000 })
  .catch(() => {});
const graded24 = await page.locator('body').innerText();
check('set24 서버 채점 3 / 3 정답', /3\s*\/\s*3 정답/.test(graded24),
  graded24.match(/\d\s*\/\s*3 정답/)?.[0]);
// '늦어도 ~까지'는 set24 Q3 해설에만 있는 문구 (faq의 "no later than"과 겹치지 않게 판정)
check('★set24 고유 해설(늦어도 ~까지) — 해설 버그 해소',
  graded24.includes('늦어도') && !graded24.includes('move up'));
check('Jina 패널 추천 질문 = 서버 lessons.faq (set24 전용 문구)',
  graded24.includes('"no later than"은 어떤 뉘앙스인가요?'));

// 7) 새로고침 → 진도 2/2 (attempt 서버 저장 증명)
await page.reload();
await page.waitForTimeout(9000);
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: 'TOEIC 학습' }).click();
await page.waitForTimeout(2500);
const badge2 = await progressBadge(page);
check('새로고침 후 진도 2/2 (서버 저장)', badge2 === '진도2/2', String(badge2));

// 8) 모바일 뷰포트 — 헤더 진도가 데스크탑과 동일 (파생값 서버 단일 소스)
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await routeCdn(mobile);
await mobile.goto(BASE);
await mobile.waitForTimeout(9000);
await mobile.locator('button', { hasText: '학습' }).last().click();
await mobile.waitForTimeout(2500);
const mobileText = await mobile.locator('body').innerText();
const mobileBadge = await mobileProgress(mobile);
check('모바일 진도 = 데스크탑과 동일 값', mobileBadge === '2/2', String(mobileBadge));
check('모바일 헤더 subtitle = 서버 DTO', mobileText.includes('Set 23 · 비즈니스 이메일'));
await mobile.close();

// 9) 캔버스 — 서버 저장 차단(READONLY) + 화면은 fallback 로컬 채점으로 동작
const canvas = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const canvasErrors = [];
canvas.on('console', (m) => { if (m.type() === 'error' && !/net::|404|403|design-canvas.state/.test(m.text())) canvasErrors.push(m.text()); });
await routeCdn(canvas);
await canvas.goto(BASE + '/canvas.html');
await canvas.waitForTimeout(10000);
check('캔버스 렌더', (await canvas.locator('#root').innerHTML()).length > 1000);
const canvasText = await canvas.locator('body').innerText();
check('캔버스 학습 화면 렌더 (Provider 부재 fallback)',
  canvasText.includes('Set 23') && canvasText.includes('Bright Mornings'));
const readonly = await canvas.evaluate(() => window.JINA_API.post('/api/lessons/1/attempts',
  { answers: { 1: 'B', 2: 'C', 3: 'B' } }));
check('캔버스 채점 저장 차단 (READONLY)', readonly.code === 'READONLY', readonly.code);
for (const t of ['To outline next steps for an upcoming campaign',
                 'It has been moved one week earlier',
                 'obstacles']) {
  await canvas.locator('button', { hasText: t }).first().click();
  await canvas.waitForTimeout(200);
}
await canvas.locator('button', { hasText: '채점하기' }).first().click();
await canvas.waitForTimeout(1000);
const canvasGraded = await canvas.locator('body').innerText();
check('캔버스 fallback 로컬 채점 3 / 3 정답', /3\s*\/\s*3 정답/.test(canvasGraded),
  canvasGraded.match(/\d\s*\/\s*3 정답/)?.[0]);
check('캔버스 콘솔 에러 0', canvasErrors.length === 0, canvasErrors.slice(0, 2).join(' | '));
await canvas.close();

// 10) 콘솔 에러 0
check('메인 콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
