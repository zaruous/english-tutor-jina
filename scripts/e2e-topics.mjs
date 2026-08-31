// E2E: 주제별 학습 (docs/plan/07 Phase 3) — 임계치 노출 규칙 · 진행률 파생값 · 토픽 → 레슨/회화/단어 연결.
// scripts/e2e-lesson.mjs 를 본떠 작성 — 동일 vendor CDN 라우팅 + Babel 컴파일 대기.
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';
import { pool } from '../api/lib/pool.js';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: BASE };
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};
const getJson = async (p) => (await fetch(API + p, { headers: H })).json();

// ── A. API 계약 — 임계치 · 배타 FK · 진행률 파생값 ──
const topics = await getJson('/api/topics');
check('GET /api/topics — eligible 토픽 1개 이상', topics.ok && topics.topics.length >= 1,
  topics.topics?.map((t) => t.slug).join(','));
const T = topics.topics.find((t) => t.slug === 'business-interview') || topics.topics[0];
check('비즈니스 면접 토픽 — 임계치 충족(레슨≥3·회화≥1·단어≥20)',
  T && T.lesson_count >= 3 && T.scenario_count >= 1 && T.vocab_count >= 20 && T.eligible === true,
  T && `${T.lesson_count}/${T.scenario_count}/${T.vocab_count}`);

// 임계치 미만 토픽은 기본 목록에서 숨김 — 빈 임시 토픽을 넣어 검증
await pool.query(`DELETE FROM public.topics WHERE slug = 'e2e-temp-topic'`);
await pool.query(
  `INSERT INTO public.topics (slug, label_ko, description) VALUES ('e2e-temp-topic', '임시 검증 토픽', 'e2e')`);
try {
  const hidden = await getJson('/api/topics');
  check('임계치 미만 토픽 — 기본 목록에서 숨김',
    hidden.ok && !hidden.topics.some((t) => t.slug === 'e2e-temp-topic'));
  const all = await getJson('/api/topics?all=1');
  const temp = all.topics?.find((t) => t.slug === 'e2e-temp-topic');
  check('?all=1 — 임계치 미만 토픽 노출 · eligible=false', Boolean(temp) && temp.eligible === false);
} finally {
  await pool.query(`DELETE FROM public.topics WHERE slug = 'e2e-temp-topic'`);
}

// 배타 FK — topic_contents 전 행이 대상 정확히 1개 (CHECK 가 보장하지만 데이터로도 단정)
const { rows: [fk] } = await pool.query(
  `SELECT count(*)::int AS bad FROM public.topic_contents
    WHERE num_nonnulls(lesson_id, scenario_id, vocab_set_id) <> 1`);
check('topic_contents — 배타 FK 위반 0건', fk.bad === 0);

// 토픽 상세 + 진행률 — done ≤ total, percent = 합산 공식, 콘텐츠 카운트가 요약과 일치
const detail = await getJson(`/api/topics/${T.id}`);
check('GET /api/topics/:id — 레슨/시나리오/단어세트 로드',
  detail.ok && detail.lessons.length === T.lesson_count && detail.scenarios.length === T.scenario_count
  && detail.vocab_sets.length >= 1);
const P = detail.progress || {};
const done = (P.lesson?.done ?? -1) + (P.conversation?.done ?? -1) + (P.vocabulary?.done ?? -1);
const total = (P.lesson?.total ?? 0) + (P.conversation?.total ?? 0) + (P.vocabulary?.total ?? 0);
const boundsOk = ['lesson', 'conversation', 'vocabulary'].every(
  (k) => P[k] && P[k].done >= 0 && P[k].done <= P[k].total);
check('토픽 진행률 — done ≤ total · percent 공식 일치',
  boundsOk && P.percent === (total ? Math.round((done / total) * 100) : 0),
  `${done}/${total} → ${P.percent}%`);

// 진행률(독해) = user_lesson_attempts 집계와 일치 (파생값 저장 금지 규범)
const { rows: [lp] } = await pool.query(
  `SELECT count(DISTINCT a.lesson_id)::int AS done
     FROM public.user_lesson_attempts a
     JOIN public.topic_contents tc ON tc.lesson_id = a.lesson_id AND tc.topic_id = $2
     JOIN public.users u ON u.id = a.user_id AND u.email = $1`,
  [process.env.DEV_USER_EMAIL || 'jina@dev.local', T.id]);
check('토픽 독해 진행률 = attempts 집계', P.lesson.done === lp.done, `${P.lesson.done} = ${lp.done}`);

// 시나리오 목록 API — topic_id 필터
const scen = await getJson(`/api/scenarios?topic_id=${T.id}`);
check('GET /api/scenarios?topic_id — 토픽 시나리오만', scen.ok && scen.scenarios.length === T.scenario_count);

// 진행률 분모 = 가시성 규칙 — 비소유자 계정에는 남의 private 생성물이 분모에 들어가면 안 된다.
// (dev 계정은 AI 생성물의 소유자라 필터 유무가 안 드러난다 — 새 계정으로 검증)
const guestEmail = `e2e-topics-${Date.now()}@test.dev`;
const signupRes = await fetch(`${API}/api/auth/signup`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ email: guestEmail, password: 'e2e-pass-1234', display_name: '토픽검증' }),
});
const guestCookie = (signupRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
const GH = { ...H, Cookie: guestCookie };
const guestDetail = await (await fetch(`${API}/api/topics/${T.id}`, { headers: GH })).json();
const gp = guestDetail.progress || {};
check('비소유자 진행률 분모 = 보이는 목록 수 (private 생성물 제외)',
  guestDetail.ok === true
  && gp.lesson?.total === guestDetail.lessons.length
  && gp.conversation?.total === guestDetail.scenarios.length,
  `레슨 ${gp.lesson?.total}=${guestDetail.lessons?.length} · 회화 ${gp.conversation?.total}=${guestDetail.scenarios?.length}`);
const guestWords = new Set((guestDetail.vocab_sets || []).flatMap((s) => (s.words || []).map((w) => String(w.word).toLowerCase())));
check('비소유자 단어 분모 = 보이는 세트의 중복 제거 단어 수',
  gp.vocabulary?.total === guestWords.size, `${gp.vocabulary?.total} = ${guestWords.size}`);
await pool.query(`DELETE FROM public.users WHERE email = $1`, [guestEmail]);

// 단어 세트 담기 — 멱등(두 번째 호출은 전부 duplicates)
const setId = detail.vocab_sets[0].id;
const add1 = await (await fetch(`${API}/api/vocab-sets/${setId}/add`, { method: 'POST', headers: H, body: '{}' })).json();
check('POST /api/vocab-sets/:id/add — added+duplicates = 세트 단어 수',
  add1.ok && add1.total === (detail.vocab_sets[0].words || []).length, `${add1.added}+${add1.duplicates}`);
const add2 = await (await fetch(`${API}/api/vocab-sets/${setId}/add`, { method: 'POST', headers: H, body: '{}' })).json();
check('재담기 — added 0 · 전부 duplicates', add2.ok && add2.added === 0 && add2.duplicates === add1.total);

// ── B. 데스크탑 UI ──
const browser = await chromium.launch(launchOptions);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) errors.push(m.text());
});
await routeCdn(page);
await page.goto(BASE);
await page.waitForTimeout(9000); // in-browser Babel 컴파일

// 대시보드 진입 카드 + 사이드바 항목 (eligible 토픽이 있을 때만 노출)
check('대시보드 — 주제별 학습 진입 카드', (await page.locator('[data-testid="dashboard-topic-entry"]').count()) === 1);
const navItem = page.locator('aside[aria-label="주요 메뉴"] button', { hasText: '주제별 학습' });
check('사이드바 — 주제별 학습 항목 노출', (await navItem.count()) === 1);

await navItem.click();
await page.waitForTimeout(2500);
const topicsText = await page.locator('body').innerText();
check('토픽 화면 — 토픽명·진행률 렌더',
  topicsText.includes(T.label_ko) && topicsText.includes('전체 진행률')
  && (await page.locator('[data-testid="topic-row"]').count()) === topics.topics.length);
check('토픽 화면 — 회화/독해/단어 섹션',
  topicsText.includes('1. AI 회화') && topicsText.includes('2. TOEIC 독해') && topicsText.includes('3. 핵심 단어'));
check('토픽 화면 — 레슨 행 수 = 서버 상세',
  (await page.locator('[data-testid="topic-open-lesson"]').count()) === detail.lessons.length);

// 레슨 열기 → 학습 화면 전환 (토픽 레슨이 현재 레슨으로 선택됨)
await page.locator('[data-testid="topic-open-lesson"]').first().click();
await page.waitForTimeout(2500);
check('토픽 레슨 열기 → 학습 화면에 해당 레슨 렌더',
  (await page.locator('body').innerText()).includes(detail.lessons[0].title));

// 회화 시작 → 세션 생성(AI 호출 없음) + 오프닝 메시지 렌더
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: '주제별 학습' }).click();
await page.waitForTimeout(2000);
const S = detail.scenarios[0];
await page.locator('[data-testid="topic-start-scenario"]').first().click();
await page.waitForTimeout(3000);
const convoText = await page.locator('body').innerText();
check('회화 시작 → 회화 화면 + 시나리오 제목/오프닝 메시지',
  convoText.includes(S.title) && (!S.opening_message || convoText.includes(S.opening_message.slice(0, 30))));

// 단어 담기 버튼 → 알림 렌더
await page.locator('aside[aria-label="주요 메뉴"] button', { hasText: '주제별 학습' }).click();
await page.waitForTimeout(2000);
await page.locator('[data-testid="topic-add-vocab-set"]').first().click();
await page.waitForTimeout(2000);
check('20단어 담기 → 결과 알림 렌더', /\d+개 추가 · \d+개는 이미 학습 중/.test(await page.locator('body').innerText()));

// ── C. 모바일 UI ──
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await routeCdn(mobile);
await mobile.goto(BASE);
await mobile.waitForTimeout(9000);
check('모바일 탭바 — 주제 탭 노출', (await mobile.locator('button', { hasText: '주제' }).count()) >= 1);
await mobile.locator('button', { hasText: '주제' }).last().click();
await mobile.waitForTimeout(2500);
check('모바일 토픽 화면 렌더', (await mobile.locator('body').innerText()).includes(T.label_ko));
await mobile.close();

check('메인 콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
await pool.end();
const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
process.exit(failed.length ? 1 : 0);
