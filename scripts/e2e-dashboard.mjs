// E2E: 대시보드 탭 (docs/plan/03-dashboard.md 검증 절차)
// 서버 집계(GET /api/dashboard)가 데스크탑·모바일에 같은 수치로 렌더되는지,
// 캔버스(Provider 부재)가 fallback으로 무에러 렌더되는지 확인한다.
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};


// 서버 DTO를 먼저 받아 화면 수치와 대조한다 (하드코딩 기대값 금지)
const cookieRes = await fetch(`${API}/api/auth/me`);
const cookie = (cookieRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
const dash = await (await fetch(`${API}/api/dashboard`, { headers: { cookie } })).json();
check('GET /api/dashboard ok', dash.ok === true);
check('집계 필드 존재', ['stats', 'goal', 'today_plan', 'skills', 'weekly', 'recommendations']
  .every((k) => dash[k] !== undefined));

const browser = await chromium.launch(launchOptions);

// ── 데스크탑 ──
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const deskErrors = [];
desk.on('pageerror', (e) => deskErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
desk.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|403|favicon/.test(m.text())) deskErrors.push(m.text().slice(0, 200));
});
await routeCdn(desk);
await desk.goto(BASE);
await desk.waitForTimeout(9000); // in-browser Babel 컴파일
const deskText = await desk.locator('#root').textContent();

check('데스크탑 렌더', (await desk.locator('#root').innerHTML()).length > 5000);
check('스트릭 = 서버 값', deskText.includes(String(dash.stats.streak_days)), `${dash.stats.streak_days}일`);
check('예상 점수 = 서버 값', dash.stats.predicted_score == null || deskText.includes(String(dash.stats.predicted_score)), String(dash.stats.predicted_score));
check('목표 점수 = 서버 값', deskText.includes(String(dash.goal.target_score)), String(dash.goal.target_score));
check('오늘의 학습 진도 = 서버 값', deskText.includes(`${dash.today_plan.done}/${dash.today_plan.total}`), `${dash.today_plan.done}/${dash.today_plan.total}`);
check('오늘의 학습 항목 렌더', dash.today_plan.items.every((it) => deskText.includes(it.title)));
check('추천 항목 렌더', deskText.includes(dash.recommendations[0].title), dash.recommendations[0].title);
check('주간 차트 7칸', dash.weekly.days.length === 7);
if (dash.recent_correction) {
  check('첨삭 카드 = 서버 값', deskText.includes(dash.recent_correction.corrected));
}
// 데이터 없는 스킬은 "데이터 없음" 빈 상태로 (하드코딩 92/76/64/58 제거 확인)
const emptySkill = dash.skills.find((s) => s.pct == null);
if (emptySkill) check('스킬 빈 상태 처리', deskText.includes('데이터 없음'));
// ── 좌측 사이드바(1차 내비) — 모든 데스크탑 페이지 공통. 클릭이 실제 이동인지, 현재 항목 표시, 준비 중 항목 비활성 ──
const nav = desk.locator('aside[aria-label="주요 메뉴"]');
check('사이드바 렌더 (주요 메뉴)', (await nav.count()) === 1);
check('사이드바 현재 페이지 aria-current=page', ((await nav.locator('button[aria-current="page"]').textContent()) || '').includes('대시보드'));
// 플랜 08 세 화면(스피킹·리스닝·오답 노트) 구현으로 soon 항목은 남아있지 않다 —
// 배지가 다시 생기면(새 soon 항목 추가) 그 항목이 비활성인지까지 확인한다.
const soonBtns = nav.locator('button:has-text("준비 중")');
const soonCount = await soonBtns.count();
check('준비 중 메뉴가 있으면 비활성 (없으면 통과)',
  soonCount === 0 || (await soonBtns.first().isDisabled()), `준비 중 ${soonCount}개`);
check('플랜 08 3항목 활성화 (클릭 가능)',
  !(await nav.locator('button', { hasText: '스피킹 연습' }).isDisabled())
  && !(await nav.locator('button', { hasText: '리스닝' }).isDisabled())
  && !(await nav.locator('button', { hasText: '오답 노트' }).isDisabled()));
await nav.locator('button', { hasText: 'AI 회화' }).click();
await desk.waitForTimeout(2500);
check('사이드바 AI 회화 클릭 → 회화 화면', (await desk.locator('body').textContent()).includes('새 회화 시작'));
check('이동 후 사이드바 유지 + 활성 항목 갱신', ((await nav.locator('button[aria-current="page"]').textContent()) || '').includes('AI 회화'));
await nav.locator('button', { hasText: '대시보드' }).click();
await desk.waitForTimeout(2500);
check('사이드바 대시보드 클릭 → 복귀', (await desk.locator('body').textContent()).includes('오늘의 학습'));
// 로고(Jina) 클릭 = 홈. 다른 페이지(단어장)로 간 뒤 로고를 눌러 대시보드로 돌아오는지
await nav.locator('button', { hasText: '단어장' }).click();
await desk.waitForTimeout(2500);
check('사이드바 단어장 클릭 → 단어장 화면', (await desk.locator('body').textContent()).includes('전체 단어장'));
await nav.locator('button[aria-label="홈(대시보드)으로"]').click();
await desk.waitForTimeout(2500);
check('로고(Jina) 클릭 → 홈(대시보드) 복귀', (await desk.locator('body').textContent()).includes('오늘의 학습')
  && ((await nav.locator('button[aria-current="page"]').textContent()) || '').includes('대시보드'));
// 대시보드 카드의 이동 버튼(onNavigate 전달 확인) — 첨삭 카드 '회화' 버튼이 있으면 눌러 본다
const corrBtn = desk.locator('button', { hasText: '회화 탭' }).first();
if (await corrBtn.count()) {
  await corrBtn.click();
  await desk.waitForTimeout(2000);
  check('첨삭 카드 → 회화 이동', (await desk.locator('body').textContent()).includes('새 회화 시작'));
  await nav.locator('button', { hasText: '대시보드' }).click();
  await desk.waitForTimeout(2000);
}
check('데스크탑 콘솔 에러 0', deskErrors.length === 0, deskErrors.slice(0, 2).join(' | '));
await desk.close();

// ── 모바일 (같은 스토어 → 같은 수치) ──
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mobErrors = [];
mob.on('pageerror', (e) => mobErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
mob.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|403|favicon/.test(m.text())) mobErrors.push(m.text().slice(0, 200));
});
await routeCdn(mob);
await mob.goto(BASE);
await mob.waitForTimeout(9000);
const mobText = await mob.locator('body').textContent();

check('모바일 렌더', (await mob.locator('#root').innerHTML()).length > 3000);
check('모바일 스트릭 = 서버 값', mobText.includes(String(dash.stats.streak_days)));
check('모바일 목표 = 서버 값', mobText.includes(String(dash.goal.target_score)));
check('모바일 진도 = 서버 값', mobText.includes(`${dash.today_plan.done}/${dash.today_plan.total} 완료`));
check('모바일 추천 = 서버 값', mobText.includes(dash.recommendations[0].title));
check('모바일 mock 리터럴 제거', !/Shadowing — TED|4\.2h|2\/4 완료|5월 26일/.test(mobText));
check('모바일 콘솔 에러 0', mobErrors.length === 0, mobErrors.slice(0, 2).join(' | '));
await mob.close();

// ── 캔버스 (Provider 부재 → fallback) ──
const canvas = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const canvasErrors = [];
canvas.on('pageerror', (e) => canvasErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
canvas.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|403|design-canvas\.state/.test(m.text())) canvasErrors.push(m.text().slice(0, 200));
});
await routeCdn(canvas);
await canvas.goto(BASE + '/canvas.html');
await canvas.waitForTimeout(10000);
check('캔버스 렌더 (fallback)', (await canvas.locator('#root').innerHTML()).length > 5000);
check('캔버스 콘솔 에러 0', canvasErrors.length === 0, canvasErrors.slice(0, 2).join(' | '));
await canvas.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
