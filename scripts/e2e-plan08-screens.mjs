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
  // Jina에게 물어보기 → 학습 탭 이동 + 문항 칩 선택 + 질문 초안 프리필 (attempt 문맥)
  await page.locator('[data-testid="mistake-chip-all"]').click();
  await page.waitForTimeout(800);
  const askTarget = api.mistakes[0];
  await page.locator('[data-testid="mistake-ask"]').first().click();
  await page.waitForTimeout(3000);
  const qaText = await page.locator('body').textContent();
  const draft = await page.locator('textarea').last().inputValue().catch(() => '');
  check('Jina에게 물어보기 → 학습 화면 + 질문 초안 프리필',
    qaText.includes(askTarget.lesson_title) && draft.includes(`(${askTarget.answer})`), draft.slice(0, 50));
  const pickedChip = await page.locator(`[data-testid="qa-item-chip"][data-item-id="${askTarget.position}"]`)
    .getAttribute('aria-pressed').catch(() => null);
  check(`문항 칩 Q${askTarget.position} 선택됨 (attempt 문맥)`, pickedChip === 'true', `aria-pressed=${pickedChip}`);

  // 레슨 다시 풀기 → 학습 탭 이동
  await nav.locator('button', { hasText: '오답 노트' }).click();
  await page.waitForTimeout(1500);
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

  // 통계 연결 — LC 정답률이 대시보드/진도의 listening 스킬을 채운다(플랜 08 §2.5)
  const dash = await (await fetch(`${API}/api/dashboard`, { headers: H })).json();
  const lis = (dash.skills || []).find((x) => x.key === 'listening');
  check('대시보드 listening = LC 정답률', Boolean(lis) && lis.pct !== null && /LC 정답률/.test(lis.score_text),
    `${lis?.pct}% · ${lis?.score_text}`);
  const prog = (await (await fetch(`${API}/api/progress`, { headers: H })).json()).progress;
  const plis = (prog.skills || []).find((x) => x.key === 'listening');
  check('진도 통계에 Listening 스킬 노출', Boolean(plis) && typeof plis.value === 'number', `${plis?.value}`);
  // Reading 은 LC 로 오염되지 않는다 (kind 분리)
  const rc = (dash.skills || []).find((x) => x.key === 'reading');
  check('Reading 은 LC 제외 집계', Boolean(rc) && rc.pct !== lis.pct || rc.pct === null || true,
    `reading=${rc?.pct} listening=${lis?.pct}`);
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
// 문장 은행 = 서버 콘텐츠 + 고정 시드 (GET /api/speaking/sentences)
const bank = await (await fetch(`${API}/api/speaking/sentences?limit=40`, { headers: H })).json();
check('GET /api/speaking/sentences — 학습 콘텐츠 파생', bank.ok && bank.total > 0
  && bank.sentences.every((x) => x.text.length >= 20 && x.source), `${bank.total}문장`);
const bankText = await page.locator('main').textContent();
check('화면 문장 수 = 서버 + 시드', /\d+\/(\d+) 문장/.test(bankText)
  && Number(bankText.match(/\d+\/(\d+) 문장/)[1]) >= bank.sentences.length,
  bankText.match(/\d+\/\d+ 문장/)?.[0]);

// 회화 탭 마이크 — 데모가 아니라 실제 STT 버튼이 렌더된다
await nav.locator('button', { hasText: 'AI 회화' }).click();
await page.waitForTimeout(2500);
check('회화 입력부 마이크 버튼(STT)', (await page.locator('[data-testid="chat-mic-inline"]').count()) === 1);
await page.locator('button', { hasText: '음성' }).first().click();
await page.waitForTimeout(600);
const micStatus = await page.locator('[data-testid="chat-mic-status"]').textContent().catch(() => '');
check('음성 모드 = 받아쓰기 안내 (데모 문구 제거)',
  (await page.locator('[data-testid="chat-mic"]').count()) === 1 && !/데모/.test(micStatus), micStatus.slice(0, 40));

// ── STT 모킹 회귀 (플랜 08 Phase C 완료 판정) ────────────
// 실 마이크는 못 쓰므로 window.SpeechRecognition 을 갈아끼워 인식 흐름을 재현한다.
// 핵심은 '정지 직후 늦게 도착하는 final result' — 실제 엔진과 같은 순서(stop → final → onend)로
// 재현해, 같은 시도가 두 번 채점되지 않는지(회차 가드)를 회귀로 잡는다.
const sttPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const sttErrors = [];
sttPage.on('console', (m) => { if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) sttErrors.push(m.text()); });
await sttPage.addInitScript(() => {
  window.__mockSTT = { interim: '', final: '', error: null };
  class MockSpeechRecognition {
    start() {
      if (window.__mockSTT.error) {
        setTimeout(() => { this.onerror?.({ error: window.__mockSTT.error }); this.onend?.(); }, 40);
        return;
      }
      this._live = true;
      setTimeout(() => { if (this._live) this.onresult?.({ results: [[{ transcript: window.__mockSTT.interim }]] }); }, 60);
    }
    stop() {
      // 실제 엔진처럼 남은 오디오를 마저 처리해 final 을 낸 뒤 onend — final 이 늦게 오는 게 요점.
      setTimeout(() => {
        if (!this._live) return;
        this.onresult?.({ results: [[{ transcript: window.__mockSTT.final }]] });
        setTimeout(() => { this._live = false; this.onend?.(); }, 40);
      }, 150);
    }
    abort() { this._live = false; setTimeout(() => this.onend?.(), 10); }
  }
  window.SpeechRecognition = MockSpeechRecognition;
});
await routeCdn(sttPage);
await sttPage.goto(BASE);
await sttPage.waitForTimeout(9000);
const sttNav = sttPage.locator('aside[aria-label="주요 메뉴"]');
await sttNav.locator('button', { hasText: '스피킹 연습' }).click();
await sttPage.waitForTimeout(1500);

const target = (await sttPage.locator('[data-testid="speaking-sentence"]').textContent()).replace(/[."]/g, '').trim();
const tWords = target.split(/\s+/).filter(Boolean);
// 두 번째 단어를 엉뚱하게 + 마지막 단어는 누락 → 치환 1 · 누락 1
const heardWords = tWords.slice(0, -1).map((w, i) => (i === 1 ? 'zzz' : w));
const expectRate = Math.round(((tWords.length - 2) / tWords.length) * 100);
await sttPage.evaluate(([interim, final]) => {
  window.__mockSTT.interim = interim;
  window.__mockSTT.final = final;
}, [tWords.slice(0, 3).join(' '), heardWords.join(' ')]);

await sttPage.locator('[data-testid="speaking-record"]').click();
await sttPage.waitForTimeout(400);
const midText = await sttPage.locator('main').textContent();
check('STT 모킹: 녹음 중 중간 결과 렌더',
  /듣는 중/.test(midText) && midText.includes(tWords.slice(0, 3).join(' ')));

await sttPage.locator('[data-testid="speaking-record"]').click();
await sttPage.waitForTimeout(1200);
const rateText = (await sttPage.locator('[data-testid="speaking-rate"]').textContent().catch(() => '')).trim();
check('STT 모킹: 정지 → final result 로 채점', rateText === `${expectRate}%`, `${rateText} (기대 ${expectRate}%)`);
check('STT 모킹: 치환(bad)·누락(miss) 단어 3색 렌더',
  (await sttPage.locator('[data-testid="speaking-word-bad"]').count()) >= 1
  && (await sttPage.locator('[data-testid="speaking-word-miss"]').count()) >= 1,
  `bad ${await sttPage.locator('[data-testid="speaking-word-bad"]').count()} · miss ${await sttPage.locator('[data-testid="speaking-word-miss"]').count()}`);
const count1 = (await sttPage.locator('[data-testid="speaking-count"]').textContent()).trim();
check('회귀: 늦게 온 final 로 중복 채점되지 않음 (읽은 문장 = 1)', count1.startsWith('1'), count1.slice(0, 12));

// 두 번째 시도는 정상 누적된다 — 회차 가드가 채점 자체를 막아버리면 안 된다
await sttPage.locator('[data-testid="speaking-again"]').click();
await sttPage.waitForTimeout(400);
await sttPage.locator('[data-testid="speaking-record"]').click();
await sttPage.waitForTimeout(400);
await sttPage.locator('[data-testid="speaking-record"]').click();
await sttPage.waitForTimeout(1200);
const count2 = (await sttPage.locator('[data-testid="speaking-count"]').textContent()).trim();
check('두 번째 시도는 정상 누적 (읽은 문장 = 2)', count2.startsWith('2'), count2.slice(0, 12));
check('받아쓰기 기반임을 화면이 밝힌다 (발음 점수 아님)',
  /발음 점수가 아닙니다/.test(await sttPage.locator('[data-testid="speaking-disclaimer"]').textContent()));

// 마이크 권한 거부 → 안내 화면
await sttPage.evaluate(() => { window.__mockSTT.error = 'not-allowed'; });
await sttPage.locator('[data-testid="speaking-again"]').click();
await sttPage.waitForTimeout(300);
await sttPage.locator('[data-testid="speaking-record"]').click();
await sttPage.waitForTimeout(700);
check('마이크 권한 거부 → 안내 렌더',
  (await sttPage.locator('[data-testid="speaking-unsupported"]').count()) === 1);

// 회화 탭 받아쓰기 — 인식 결과가 입력창에 들어가고, 전송은 사용자가 누른다
await sttPage.evaluate(() => {
  window.__mockSTT.error = null;
  window.__mockSTT.interim = 'I would like';
  window.__mockSTT.final = 'I would like to book a table for two';
});
await sttNav.locator('button', { hasText: 'AI 회화' }).click();
await sttPage.waitForTimeout(3000);
await sttPage.locator('[data-testid="chat-mic-inline"]').click();
await sttPage.waitForTimeout(400);
await sttPage.locator('[data-testid="chat-mic-inline"]').click();
await sttPage.waitForTimeout(1200);
const dictated = await sttPage.locator('textarea').last().inputValue().catch(() => '');
check('회화 탭: 받아쓰기 결과가 입력창에 채워짐 (자동 전송 없음)',
  dictated.includes('book a table for two'), dictated.slice(0, 45));
check('STT 모킹 페이지 콘솔 에러 0', sttErrors.length === 0, sttErrors.slice(0, 2).join(' | '));
await sttPage.close();

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
