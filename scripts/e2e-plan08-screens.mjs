// E2E: 플랜 08 세 화면(오답 노트·리스닝·스피킹)의 렌더·상호작용 검증 (화면부 구현분)
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const H = { Origin: BASE, 'X-Requested-With': 'jina' };
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch(launchOptions);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) errors.push(m.text());
});
await routeCdn(page);
await page.goto(BASE);
await page.waitForTimeout(9000);
const nav = page.locator('aside[aria-label="주요 메뉴"]');
check('데스크탑 렌더', (await page.locator('#root').innerHTML()).length > 1000);
check('사이드바 3항목 활성화 (준비 중 배지 없음)',
  (await nav.locator('text=준비 중').count()) === 0);

// ── 오답 노트 ──────────────────────────────────────────
const api = await (await fetch(`${API}/api/mistakes`, { headers: H })).json();
check('GET /api/mistakes ok', api.ok === true && Array.isArray(api.mistakes),
  `미극복 ${api.total} · 극복 ${api.overcome}`);
await nav.locator('button', { hasText: '오답 노트' }).click();
await page.waitForTimeout(1500);
const mCards = await page.locator('[data-testid="mistake-card"]').count();
check('오답 노트 화면 = 서버 목록 개수', mCards === api.mistakes.length, `카드 ${mCards} / API ${api.mistakes.length}`);
if (api.mistakes.length) {
  // 사이드바도 .jina-root 라서 화면 본문은 카드 자체에서 읽는다
  const body = await page.locator('[data-testid="mistake-card"]').first().textContent();
  const m = api.mistakes[0];
  check('오답 카드에 문항·내 답·정답·해설 렌더',
    body.includes(m.stem) && body.includes(m.my_answer_text) && body.includes(m.answer_text)
    && (!m.explanation || body.includes(m.explanation.slice(0, 20))));
  check('skill_code 배지 + 필터 칩', (await page.locator('[data-testid="mistake-skill"]').count()) >= 1
    && (await page.locator('[data-testid="mistake-chip-all"]').count()) === 1);
  // 필터: 첫 skill 칩을 눌러 서버 필터 결과와 일치하는지
  const skill = api.by_skill[0].skill_code;
  await page.locator(`[data-testid="mistake-chip-${skill}"]`).click();
  await page.waitForTimeout(1200);
  const filtered = await (await fetch(`${API}/api/mistakes?skill=${skill}`, { headers: H })).json();
  check(`필터 '${skill}' = 서버 결과 일치`,
    (await page.locator('[data-testid="mistake-card"]').count()) === filtered.mistakes.length,
    `${filtered.mistakes.length}건`);
  // 레슨 다시 풀기 → 학습 탭 이동
  await page.locator('[data-testid="mistake-chip-all"]').click();
  await page.waitForTimeout(800);
  await page.locator('[data-testid="mistake-retake"]').first().click();
  await page.waitForTimeout(2500);
  check('레슨 다시 풀기 → TOEIC 학습 화면 이동',
    (await page.locator('body').textContent()).includes(api.mistakes[0].lesson_title));
} else {
  check('오답 0건 → 빈 상태 렌더', (await page.locator('[data-testid="mistakes-empty"]').count()) === 1);
}

// ── 리스닝 ────────────────────────────────────────────
await nav.locator('button', { hasText: '리스닝' }).click();
await page.waitForTimeout(1800);
const lcList = await (await fetch(`${API}/api/lessons?kind=toeic_lc`, { headers: H })).json();
const lcCount = (lcList.lessons || []).length;
if (lcCount === 0) {
  check('LC 콘텐츠 0 → 빈 상태 렌더 (재생/속도 UI는 준비됨)',
    (await page.locator('[data-testid="listening-empty"]').count()) === 1);
} else {
  check('LC 재생 카드 · 속도 칩 · 잠금 카드',
    (await page.locator('[data-testid="lc-play"]').count()) === 1
    && (await page.locator('[data-testid="lc-rate-1"]').count()) === 1
    && (await page.locator('[data-testid="lc-locked"]').count()) === 1);
  // 스크립트 원문(서버 detail 의 passage.body)이 제출 전에는 화면에 렌더되지 않아야 한다
  const detail = (await (await fetch(`${API}/api/lessons/${lcList.lessons[0].id}`, { headers: H })).json()).lesson;
  const lines = detail.passage?.body || [];
  const bodyText = await page.locator('body').textContent();
  check('미제출 화면에 스크립트 텍스트 미렌더 (잠금)',
    lines.length > 0 && lines.every((l) => !bodyText.includes(l.slice(3, 40))),
    `${lines.length}줄`);
  await page.locator('[data-testid="lc-play"]').click();
  await page.waitForTimeout(500);
  check('재생 횟수 증가', /재생\s*1회/.test(await page.locator('main').textContent().catch(() => '')) 
    || /재생\s*1회/.test(await page.locator('body').textContent()));
  check('채점 버튼은 미답변 시 비활성', await page.locator('[data-testid="lc-submit"]').isDisabled());
  // 문항 전부 답하고 채점 → 스크립트 공개
  const qCount = await page.locator('[data-testid="lc-question"]').count();
  for (let i = 0; i < qCount; i++) {
    await page.locator('[data-testid="lc-question"]').nth(i).locator('[data-testid="lc-option"]').first().click();
  }
  await page.waitForTimeout(300);
  await page.locator('[data-testid="lc-submit"]').click();
  await page.waitForSelector('[data-testid="lc-script"]', { timeout: 15000 }).catch(() => {});
  const after = await page.locator('body').textContent();
  check('채점 후 스크립트 공개 + 정답 수 표시',
    (await page.locator('[data-testid="lc-script"]').count()) === 1
    && lines.every((l) => after.includes(l.slice(3, 30)))
    && /\d+\s*\/\s*\d+\s*정답/.test(after));
  check('세트 전환 칩', (await page.locator('[data-testid="lc-set"]').count()) === lcCount);
}

// ── 스피킹 ────────────────────────────────────────────
await nav.locator('button', { hasText: '스피킹 연습' }).click();
await page.waitForTimeout(1200);
check('스피킹 문장 카드 렌더', (await page.locator('[data-testid="speaking-sentence"]').count()) === 1);
check('발음 듣기(🔊) 버튼', (await page.locator('[data-testid="speak-btn"]').count()) >= 1);
// 매칭 로직 단정 — STT 없이 순수 함수로 (브라우저 SpeechRecognition 미지원 환경 대비)
const match = await page.evaluate(() => window.jinaMatchWords(
  ['I', 'would', 'recommend', 'the', 'new', 'vendor', 'because', 'their', 'pricing', 'is', 'more', 'competitive'],
  ['I', 'would', 'recommend', 'the', 'new', 'bender', 'because', 'their', 'pricing', 'is', 'competitive'],
));
check('단어 매칭: 치환(bad) · 누락(miss) · 일치율',
  match.rate === 83 && match.words[5].status === 'bad' && match.words[5].heard === 'bender'
  && match.words[10].status === 'miss',
  `rate=${match.rate} vendor→${match.words[5].heard} more=${match.words[10].status}`);
const supported = await page.evaluate(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
if (supported) {
  check('STT 지원 브라우저 → 녹음 버튼 렌더', (await page.locator('[data-testid="speaking-record"]').count()) === 1);
} else {
  check('STT 미지원 브라우저 → 안내 렌더 (듣기는 유지)',
    (await page.locator('[data-testid="speaking-unsupported"]').count()) === 1);
}
await page.locator('[data-testid="speaking-record"], [data-testid="speaking-unsupported"]').first().waitFor({ timeout: 3000 }).catch(() => {});

// ── 모바일 변형 (창을 좁히면 같은 페이지의 모바일 화면) ──
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mobileErrors = [];
mobile.on('console', (m) => { if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) mobileErrors.push(m.text()); });
await routeCdn(mobile);
await mobile.goto(BASE);
await mobile.waitForTimeout(9000);
check('모바일 하단 탭에 3항목 미노출 (데스크탑 전용)',
  !(await mobile.locator('nav, footer').last().textContent().catch(() => '')).includes('오답'));
await mobile.close();

// ── 캔버스 회귀 ────────────────────────────────────────
const canvas = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const canvasErrors = [];
canvas.on('console', (m) => { if (m.type() === 'error' && !/net::|404|403|design-canvas.state/.test(m.text())) canvasErrors.push(m.text()); });
await routeCdn(canvas);
await canvas.goto(`${BASE}/canvas.html`);
await canvas.waitForTimeout(10000);
check('캔버스 렌더 (신규 스크립트 로드 후에도)', (await canvas.locator('#root').innerHTML()).length > 1000);
check('캔버스 콘솔 에러 0', canvasErrors.length === 0, canvasErrors.slice(0, 2).join(' | '));
await canvas.close();

check('메인 콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | '));
check('모바일 콘솔 에러 0', mobileErrors.length === 0, mobileErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과${failed ? ` · 실패 ${failed}` : ''}`);
process.exit(failed ? 1 : 0);
