// E2E: 관리자 · 저작 — 플랜 13 Phase A(LC 에디터)·B(토픽 구성) 완료 판정 + 검수 화면 회귀(R11).
// npm run dev 가 떠 있는 상태에서 실행. 브라우저(Playwright) + API + DB 세 층을 한 흐름으로 단정한다.
// 선례: scripts/e2e-admin-users.mjs(관리 화면 + DB 픽스처 + finally 정리) · scripts/verify-draft-review.mjs(검수 API).
//
// ── 계약이 없으면 죽지 않고 skip 한다 ──────────────────────────────────────
// 서버 API·화면은 다른 그룹이 만든다. 라우트가 없으면(404 '없는 경로입니다.') 그 묶음(A/B/C)을 통째로
// skip 으로 출력하고 다음 묶음으로 간다 — 일부만 붙은 상태에서 이 하네스가 예외로 죽으면 그때까지의
// 결과와 정리(finally)가 함께 사라진다. skip 은 실패가 아니지만 요약에 건수를 따로 찍는다.
//
// ── 시드 LC 를 진짜로 고친다 — 그래서 되돌린다 ─────────────────────────────
// Phase A 의 판정은 "기존(시드) 레슨을 열어 고쳐 저장하면 source 가 seed → curated 로 바뀐다"(결정 5)다.
// 복제본으로는 그 전이를 볼 수 없어 실제 시드 행을 고치고, 시작할 때 content_items·passage·lesson_items 를
// 통째로 보관해 finally 에서 원래 값으로 되돌린다(감사 로그의 테스트 행도 지운다).
//
// DEV_AUTOLOGIN 함정: 쿠키 없는 요청은 admin 세션을 자동 발급받는다. 비관리자 검증은 전부 픽스처 계정의
// 쿠키로 하고, 쿠키 없는 요청에는 X-Jina-No-Autologin: 1 을 붙여 거짓 통과를 막는다.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';
import { pool } from '../api/lib/pool.js';
import { hashPassword } from '../api/services/password.js';
import {
  cleanupReviewFixtures, createReviewContent, createReviewUser, reviewAudit, reviewState,
} from './lib/draft-review-fixtures.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: BASE, 'X-Jina-No-Autologin': '1' };
const TAG = `e2e-authoring-${Date.now()}`;
const PASS = 'e2e-authoring-1234';
const COOKIE_NAME = process.env.COOKIE_NAME || 'jina_sid';
const ART = 'docs/reviews/_artifacts';
// Phase A 의 대상. 시드 중 유일하게 짧은 대화(6줄 · 문항 3)라 화자 토글·정답 변경을 모두 볼 수 있다.
const SEED_LC_SLUG = 'toeic-lc-short-conversation-1';
// Phase B 의 재료 — 시드 시나리오·단어세트 1개씩. 레슨은 위 LC 1개만 붙여 eligible(레슨 3) 미달을 만든다.
const SEED_SCENARIO_SLUG = 'business-interview-star';
const SEED_VOCAB_SLUG = 'business-interview-core-20';
// in-browser Babel 컴파일 + /api/auth/me 를 기다리는 상한. 선례의 고정 9초 대기 대신 셀렉터를 기다린다.
const UI_TIMEOUT = 30000;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};
const skip = (name, why) => {
  results.push({ name, ok: null, detail: why });
  console.log(`○ skip ${name} — ${why}`);
};

const users = {};
const cookies = {};

async function req(path, { role, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: { ...H, ...(role ? { Cookie: cookies[role] } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}
const post = (path, role, body = {}) => req(path, { role, method: 'POST', body });

// 라우터의 미등록 경로 응답. 콘텐츠가 없을 때의 404('콘텐츠를 찾을 수 없습니다.')와 문구로 가른다 —
// 상태 코드만 보면 "구현이 없다" 와 "행이 없다" 가 같은 skip 으로 뭉개진다.
const routeMissing = (r) => r.status === 404 && /없는 경로/.test(String(r.error || ''));

async function login(role) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: H, body: JSON.stringify({ email: users[role].email, password: PASS }),
  });
  if (res.status !== 200) throw new Error(`${role} 로그인 실패 (${res.status})`);
  cookies[role] = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const me = await req('/api/auth/me', { role });
  if (me.user?.role !== role) throw new Error(`${role} 세션의 실제 역할이 ${me.user?.role} 이다 — 자동 로그인에 덮였는지 확인`);
}

// ── 브라우저 헬퍼 ──
// 화면마다 새 컨텍스트를 연다 — 역할별 쿠키가 섞이면 learner 검증이 author 세션으로 통과한다.
const consoleErrors = [];
const hScroll = [];
async function openAs(browser, role, hash) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cookieVal = cookies[role].split('=').slice(1).join('=');
  await ctx.addCookies([{ name: COOKIE_NAME, value: cookieVal, domain: new URL(BASE).hostname, path: '/' }]);
  const page = await ctx.newPage();
  // 422·403 은 이 하네스가 **의도적으로** 만든다 — Chromium 은 그것을 'Failed to load resource' 콘솔 에러로
  // 찍으므로 거른다. 남는 것은 스크립트 예외·React 경고만이다.
  page.on('console', (m) => {
    if (m.type() === 'error' && !/net::|Failed to load resource|favicon/.test(m.text())) {
      consoleErrors.push(`[${role} ${hash}] ${m.text().slice(0, 160)}`);
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${role} ${hash}] pageerror: ${String(e.message).slice(0, 160)}`));
  await routeCdn(page);
  await page.goto(`${BASE}/admin.html${hash}`);
  return { ctx, page };
}

async function waitFor(page, selector, timeout = UI_TIMEOUT) {
  return page.waitForSelector(selector, { timeout, state: 'attached' }).then(() => true).catch(() => false);
}

// 후보 셀렉터를 차례로 폴링해 처음 나타나는 것을 돌려준다. 다른 그룹이 붙이는 내부 testid(줄·토글·정답)는
// 이 하네스가 정하지 않았으므로 관용적인 후보를 여러 개 두고, 어느 것이 잡혔는지 detail 에 남긴다.
async function firstPresent(page, selectors, timeout = 8000) {
  const deadline = Date.now() + timeout;
  do {
    for (const sel of selectors) {
      const loc = page.locator(sel);
      if (await loc.count().catch(() => 0)) return { sel, loc };
    }
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  return null;
}

async function recordHScroll(page, name) {
  const w = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, view: window.innerWidth,
  }));
  if (w.doc > w.view || w.body > w.view) hScroll.push(`${name} doc=${w.doc} body=${w.body} view=${w.view}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${ART}/e2e-admin-authoring-${name}.png`, fullPage: true }).catch(() => {});
}

// 저장 클릭과 그 응답을 짝지어 잡는다 — 200/422 판정을 화면 문구가 아니라 HTTP 상태로 한다.
async function clickAndAwait(page, locator, urlPart, methods = ['PATCH', 'PUT', 'POST']) {
  const waiter = page.waitForResponse(
    (r) => r.url().includes(urlPart) && methods.includes(r.request().method()), { timeout: 20000 },
  ).catch(() => null);
  await locator.click();
  const res = await waiter;
  if (!res) return { status: 0, body: {} };
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

// ── DB 헬퍼 ──
async function contentIdBySlug(slug) {
  const { rows: [row] } = await pool.query(`SELECT id FROM content_items WHERE slug = $1`, [slug]);
  return row?.id ?? null;
}
async function lessonState(id) {
  const { rows: [row] } = await pool.query(
    `SELECT c.status, c.visibility, c.source, d.passage,
            (SELECT jsonb_agg(jsonb_build_object('position', li.position, 'answer', li.answer, 'explanation', li.explanation)
                    ORDER BY li.position) FROM lesson_items li WHERE li.content_id = c.id) AS items
       FROM content_items c JOIN lesson_details d ON d.content_id = c.id WHERE c.id = $1`, [id],
  );
  return row;
}

// ── 픽스처 ──
let seedLc = null;   // { id, row, passage, items } — finally 에서 되돌릴 원본
let topicId = null;  // Phase B 가 만든 토픽 — 실패해도 정리한다
let browser = null;
mkdirSync(ART, { recursive: true });

try {
  const health = await req('/api/health');
  if (health.status !== 200) throw new Error('서버·DB 준비 필요 — npm run dev 뒤 실행');

  const passwordHash = await hashPassword(PASS);
  for (const role of ['learner', 'author', 'reviewer']) {
    users[role] = await createReviewUser(TAG, role, passwordHash);
    await login(role);
  }

  // 시드 LC 원본 보관 — 되돌릴 대상은 content_items 의 축 3개(+수정자) · passage · 문항 전체다.
  const seedId = await contentIdBySlug(SEED_LC_SLUG);
  if (!seedId) throw new Error(`시드 LC(${SEED_LC_SLUG})가 없다 — npm run db:seed:content 뒤 실행`);
  {
    const { rows: [row] } = await pool.query(
      `SELECT source, status, visibility, updated_by, updated_at FROM content_items WHERE id = $1`, [seedId]);
    const { rows: [{ passage }] } = await pool.query(`SELECT passage FROM lesson_details WHERE content_id = $1`, [seedId]);
    const { rows: items } = await pool.query(
      `SELECT position, stem, options, answer, explanation, skill_code FROM lesson_items
        WHERE content_id = $1 ORDER BY position`, [seedId]);
    seedLc = { id: seedId, row, passage, items };
  }
  const scriptLen = Array.isArray(seedLc.passage?.body) ? seedLc.passage.body.length : 0;
  const origAnswer = seedLc.items[0]?.answer;
  // 정답을 원본과 다른 보기로 — 검증기는 explanation 이 "(새 정답)" 을 포함해야 통과시키므로 해설도 함께 고친다.
  const newAnswer = ['A', 'B', 'C', 'D'].find((id) => id !== origAnswer);
  // 대사 규칙(validateLcScript): 12자 이상 · 괄호 금지 · "M:" 라벨 금지. 하이픈·숫자만 섞는다.
  const newLine = `Do you have a minute? I would like to move our weekly meeting to Thursday ${Date.now()}`;

  browser = await chromium.launch(launchOptions);

  // ════════════════════════ A. LC 에디터 (Phase A) ════════════════════════
  const adminRead = await req(`/api/admin/contents/lesson/${seedLc.id}`, { role: 'author' });
  if (routeMissing(adminRead)) {
    skip('A GET /api/admin/contents/lesson/:id', '라우트 없음 — Phase A 서버 미구현');
  } else {
    // D2 — 에디터가 열 관리자 읽기는 정답·해설·skill_code 를 싣고, 학습자 DTO 는 그대로 좁아야 한다.
    const L = adminRead.lesson || adminRead.content || adminRead;
    const items = L.items || [];
    check('A0 관리자 읽기 200 · items 에 answer·explanation·skill_code',
      adminRead.status === 200 && items.length === seedLc.items.length
      && items.every((it) => 'answer' in it && 'explanation' in it && 'skill_code' in it),
      `status=${adminRead.status} items=${items.length}`);
    const learnerRead = await req(`/api/lessons/${seedLc.id}`, { role: 'learner' });
    const leaked = (learnerRead.lesson?.items || []).concat(learnerRead.lesson?.questions || [])
      .some((it) => 'answer' in it || 'explanation' in it);
    check('A0b 학습자 GET /api/lessons/:id 는 answer·explanation 을 싣지 않는다',
      learnerRead.status === 200 && !leaked, `status=${learnerRead.status} leaked=${leaked}`);

    // 시드 LC 는 published 다 — published 본문 편집은 reviewer 부터(updateLesson 검수 게이트). author 는 A2b 에서 403 을 본다.
    const { ctx, page } = await openAs(browser, 'reviewer', `#/edit/lesson/${seedLc.id}`);
    const hasEditor = await waitFor(page, '[data-testid="lc-editor"]');
    if (!hasEditor) {
      await shot(page, 'lc-editor-missing');
      skip('A1~A5 LC 에디터 화면', 'lc-editor 미렌더 — Phase A 화면 미구현');
    } else {
      // A1 — 줄 수 = passage.body 길이 · 줄마다 화자 토글이 M/W 중 하나.
      const lineHit = await firstPresent(page, ['[data-testid="lc-line"]', '[data-testid^="lc-line-"]']);
      const lineInfo = lineHit ? await page.evaluate((sel) => {
        // 줄 안에서 "지금 선택된 화자" 를 읽는 관용구들 — 눌린 버튼(aria-pressed) · select · radio · data-speaker.
        const pick = (el) => {
          const pressed = el.querySelector('[aria-pressed="true"]');
          if (pressed) return pressed.textContent.trim();
          const sel2 = el.querySelector('select');
          if (sel2) return sel2.value;
          const radio = el.querySelector('input[type="radio"]:checked');
          if (radio) return radio.value;
          const ds = el.querySelector('[data-speaker]');
          if (ds) return ds.dataset.speaker;
          return '';
        };
        return [...document.querySelectorAll(sel)].map(pick);
      }, lineHit.sel) : [];
      check('A1 lc-editor 렌더 · 줄 수 = passage.body 길이 · 화자 토글 M/W',
        lineInfo.length === scriptLen && scriptLen > 0 && lineInfo.every((s) => s === 'M' || s === 'W'),
        `lines=${lineInfo.length}/${scriptLen} speakers=${lineInfo.join('') || '(읽지 못함)'} via ${lineHit?.sel || '-'}`);
      await recordHScroll(page, 'lc-editor');
      await shot(page, 'lc-editor');

      // A2 — 대사 1줄 + 문항 1 정답(+해설) 수정 → 저장 200 → DB 반영 · source=curated · status 불변.
      let saved = { status: 0, body: {} };
      const firstLineTa = lineHit ? lineHit.loc.first().locator('textarea, input[type="text"]').first() : null;
      const saveBtn = page.locator('[data-testid="lc-save"]');
      if (firstLineTa && await firstLineTa.count()) {
        await firstLineTa.fill(newLine);
        const qHit = await firstPresent(page, ['[data-testid="lc-item-0"]', '[data-testid="lc-question"]', '[data-testid^="lc-question-"]', '[data-testid="lc-item"]'], 3000);
        const q = qHit ? qHit.loc.first() : page;
        // 정답 선택 — 보기별 버튼/라디오/select 중 있는 것. 어느 것도 없으면 detail 에 남기고 저장은 그대로 시도한다.
        let answerVia = '-';
        for (const [sel, act] of [
          [`[data-testid="lc-item-0-answer-${newAnswer}"]`, 'click'],
          [`[data-testid$="-answer-${newAnswer}"]`, 'click'],
          [`[data-testid="lc-answer-${newAnswer}"]`, 'click'],
          [`input[type="radio"][value="${newAnswer}"]`, 'check'],
          ['select[data-testid="lc-answer"], select[name="answer"]', 'select'],
          [`[data-option="${newAnswer}"], [data-option-id="${newAnswer}"]`, 'click'],
        ]) {
          const loc = q.locator(sel).first();
          if (!(await loc.count())) continue;
          if (act === 'select') await loc.selectOption(newAnswer);
          else if (act === 'check') await loc.check();
          else await loc.click();
          answerVia = sel;
          break;
        }
        let explVia = '-';
        for (const sel of ['[data-testid="lc-item-0-explanation"]', '[data-testid$="-explanation"]', '[data-testid="lc-explanation"]', 'textarea[name="explanation"]', 'input[name="explanation"]']) {
          const loc = q.locator(sel).first();
          if (!(await loc.count())) continue;
          await loc.fill(`(${newAnswer})가 정답 — ${TAG} 수정 해설`);
          explVia = sel;
          break;
        }
        saved = await clickAndAwait(page, saveBtn, `/api/admin/contents/lesson`);
        await page.waitForTimeout(500);
        const after = await lessonState(seedLc.id);
        const bodyText = after?.passage?.body?.[0]?.text;
        check('A2 대사 1줄 + 문항 1 정답 수정 → 200 · DB passage/answer 반영 · source=curated · status 불변',
          saved.status === 200 && bodyText === newLine && after?.items?.[0]?.answer === newAnswer
          && after?.source === 'curated' && after?.status === seedLc.row.status,
          `status=${saved.status} answer=${after?.items?.[0]?.answer}(→${newAnswer}) source=${seedLc.row.source}→${after?.source}`
          + ` answerVia=${answerVia} explVia=${explVia}${saved.body?.validation_errors ? ' errors=' + JSON.stringify(saved.body.validation_errors).slice(0, 200) : ''}`);

        // A3 — 라벨 포함 대사 → 422 · lc-errors 렌더 · DB 무변경(직전 저장값 그대로).
        const before3 = await lessonState(seedLc.id);
        await firstLineTa.fill(`M: ${newLine}`);
        const rejected = await clickAndAwait(page, saveBtn, `/api/admin/contents/lesson`);
        const errBox = await firstPresent(page, ['[data-testid="lc-errors"]'], 5000);
        const errText = errBox ? await errBox.loc.first().innerText().catch(() => '') : '';
        const after3 = await lessonState(seedLc.id);
        const authorPatch = await req(`/api/admin/contents/lesson/${seedLc.id}`, {
        role: 'author', method: 'PATCH',
        body: { title: L.title, kind: L.kind, passage: L.passage, vocab: L.vocab, faq: L.faq,
          items: items.map((it) => ({ stem: it.stem, options: it.options, answer: it.answer, explanation: it.explanation, skill_code: it.skill_code })) },
      });
      check('A2b author 는 published 레슨 본문을 제자리에서 못 고친다 → 403 (검수 게이트)',
        authorPatch.status === 403 && authorPatch.code === 'FORBIDDEN', `status=${authorPatch.status} code=${authorPatch.code}`);

      check('A3 "M: " 라벨 포함 저장 → 422 · lc-errors 라벨 메시지 · DB 무변경',
          rejected.status === 422 && Array.isArray(rejected.body?.validation_errors)
          && /라벨/.test(errText) && JSON.stringify(after3) === JSON.stringify(before3),
          `status=${rejected.status} errors=${rejected.body?.validation_errors?.length ?? '-'} ui="${errText.slice(0, 80).replace(/\n/g, ' ')}"`);
        await shot(page, 'lc-errors');
      } else {
        check('A2 대사 1줄 + 문항 1 정답 수정 → 200', false, 'lc-line 안에 textarea 를 찾지 못했다');
        check('A3 "M: " 라벨 포함 저장 → 422', false, 'A2 선행 실패');
      }
      await ctx.close();

      // A4 — reviewer 가 published→archived→published 왕복 → 학습자 GET /api/lessons/:id 에 고친 대사.
      //   가시성은 전이가 건드리지 않으므로(11 열린질문 7 후보 A) 왕복 뒤에도 public 이어야 학습자가 본다.
      const down = await post(`/api/admin/contents/lesson/${seedLc.id}/status`, 'reviewer', { to: 'archived', note: `${TAG} 왕복` });
      const up = await post(`/api/admin/contents/lesson/${seedLc.id}/status`, 'reviewer', { to: 'published', note: `${TAG} 왕복` });
      const learnerLesson = await req(`/api/lessons/${seedLc.id}`, { role: 'learner' });
      check('A4 reviewer 왕복(archived→published) 뒤 학습자 GET /api/lessons/:id 가 고친 대사',
        down.status === 200 && up.status === 200 && learnerLesson.status === 200
        && learnerLesson.lesson?.passage?.body?.[0]?.text === newLine
        && learnerLesson.lesson?.visibility === 'public',
        `down=${down.status} up=${up.status} learner=${learnerLesson.status} vis=${learnerLesson.lesson?.visibility}`);

      // A5 — learner 가 에디터 해시로 들어오면 폼이 아니라 403 안내.
      const l = await openAs(browser, 'learner', `#/edit/lesson/${seedLc.id}`);
      const forbidden = await firstPresent(l.page, [
        '[data-testid="lc-forbidden"]', '[data-testid="contents-forbidden"]', '[data-testid="contents-need-author"]',
      ], 20000);
      const formCount = await l.page.locator('[data-testid="lc-save"], [data-testid="lc-editor"] textarea').count();
      const bodyText5 = await l.page.locator('body').innerText().catch(() => '');
      check('A5 learner #/edit/lesson/:id → 403 안내 · 폼 미렌더',
        formCount === 0 && (Boolean(forbidden) || /403|권한|author|저작자/.test(bodyText5)),
        `form=${formCount} notice=${forbidden?.sel || '(텍스트 매치)'}`);
      await recordHScroll(l.page, 'lc-forbidden');
      await shot(l.page, 'lc-forbidden');
      await l.ctx.close();
    }
  }

  // ════════════════════════ B. 토픽 구성 (Phase B) ════════════════════════
  const topicsProbe = await req('/api/admin/topics', { role: 'author' });
  if (routeMissing(topicsProbe)) {
    skip('B GET /api/admin/topics', '라우트 없음 — Phase B 서버 미구현');
  } else {
    const label = `${TAG} 토픽`;
    const slug = `${TAG}-topic`;
    // B6 — author 가 화면에서 만든다. 라벨/slug 입력의 testid 는 후보를 차례로 본다.
    const { ctx, page } = await openAs(browser, 'author', '#/topics');
    const hasNew = await waitFor(page, '[data-testid="topic-new"]');
    let createdVia = 'ui';
    if (hasNew) {
      // 화면 생성은 불안정할 수 있다(리마운트 타이밍) — 실패해도 B6 만 실패로 남기고 아래 API 폴백으로 넘어간다.
      try {
        await page.locator('[data-testid="topic-new"]').first().click();
        const labelHit = await firstPresent(page, [
          '[data-testid="topic-label"]', 'input[name="label_ko"]', '[data-testid="topic-form"] input[type="text"]', 'input[placeholder*="제목"]',
        ], 8000);
        if (labelHit) {
          await labelHit.loc.first().fill(label, { timeout: 8000 });
          const slugHit = await firstPresent(page, ['[data-testid="topic-slug"]', 'input[name="slug"]'], 1500);
          if (slugHit) await slugHit.loc.first().fill(slug, { timeout: 4000 });
          const createBtn = await firstPresent(page, [
            '[data-testid="topic-meta-save"]', '[data-testid="topic-create"]', 'button:has-text("생성")', 'button:has-text("만들기")', '[data-testid="topic-save"]',
          ], 3000);
          if (createBtn) await clickAndAwait(page, createBtn.loc.first(), '/api/admin/topics', ['POST']);
          await page.waitForTimeout(800);
        }
      } catch (e) {
        createdVia = `ui-error(${String(e.message || e).split(String.fromCharCode(10))[0].slice(0, 60)})`;
      }
    }
    let { rows: topicRows } = await pool.query(
      `SELECT id, slug, status, visibility FROM topics WHERE label_ko = $1 OR slug LIKE $2`, [label, `${TAG}%`]);
    check('B6 author #/topics → topic-new → 라벨 입력 → 생성 → DB topics 1행(draft)',
      topicRows.length === 1 && topicRows[0].status === 'draft',
      `rows=${topicRows.length} status=${topicRows[0]?.status ?? '-'} topic-new=${hasNew}`);
    await recordHScroll(page, 'topics');
    await shot(page, 'topics');
    await ctx.close();
    if (!topicRows.length) {
      // 화면 생성이 실패해도 7~9 를 계속 볼 수 있게 API 로 만든다 — 6 은 이미 실패로 기록됐다.
      const made = await post('/api/admin/topics', 'author', { label_ko: label, slug, description: 'e2e' });
      createdVia = `api(${made.status})`;
      ({ rows: topicRows } = await pool.query(`SELECT id, slug, status, visibility FROM topics WHERE slug = $1`, [slug]));
    }
    topicId = topicRows[0]?.id ?? null;

    if (!topicId) {
      skip('B7~B9 토픽 구성·공개·권한', `토픽을 만들지 못했다 (${createdVia})`);
    } else {
      // B7 — 시드 LC 1 + 시나리오 1 + 단어세트 1 붙이기 → 상세 contents 3건 position 순 · eligible=false.
      //   본문은 admin-topic.service.replaceContents 의 계약({contents:[{content_id,position}]}) 그대로다.
      //   붙이기는 화면이 아니라 API 로 한다 — 구성 화면의 검색·선택 UI 는 이 하네스가 testid 를 정하지 않았다.
      const scenarioId = await contentIdBySlug(SEED_SCENARIO_SLUG);
      const vocabId = await contentIdBySlug(SEED_VOCAB_SLUG);
      const wanted = [seedLc.id, scenarioId, vocabId].filter(Boolean);
      const put = await req(`/api/admin/topics/${topicId}/contents`, {
        role: 'author', method: 'PUT',
        body: { contents: wanted.map((content_id, i) => ({ content_id, position: i + 1 })) },
      });
      const detail = await req(`/api/admin/topics/${topicId}`, { role: 'author' });
      const contents = detail.contents || [];
      const positions = contents.map((c) => Number(c.position));
      const ordered = positions.every((p, i) => i === 0 || p >= positions[i - 1]);
      const ids = new Set(contents.map((c) => Number(c.content_id)));
      check('B7 PUT /api/admin/topics/:id/contents 3건 → 상세 contents 3건 position 순 · eligible=false',
        put.status === 200 && wanted.length === 3 && contents.length === 3 && ordered
        && wanted.every((id) => ids.has(id)) && detail.topic?.eligible === false,
        `put=${put.status} contents=${contents.length} positions=${positions.join(',')} eligible=${detail.topic?.eligible}`);

      // B7b — 관리 화면의 eligible 경고 배지(레슨 1/3). 구성 화면 해시는 후보를 차례로 연다.
      let badge = null;
      let badgePage = null;
      for (const hash of [`#/topics/${topicId}`, `#/edit/topic/${topicId}`, '#/topics']) {
        const opened = await openAs(browser, 'author', hash);
        await waitFor(opened.page, '[data-testid^="topic-"]', 20000);
        badge = await firstPresent(opened.page, [
          '[data-testid="topic-eligible-warn"]', '[data-testid="content-eligible-warn"]', 'text=/미달/',
        ], 5000);
        if (badge) { badgePage = opened; break; }
        await recordHScroll(opened.page, `topic-${hash}`);
        await opened.ctx.close();
      }
      const badgeText = badge ? await badge.loc.first().innerText().catch(() => '') : '';
      check('B7b 관리 화면에 eligible 미달 배지 노출(레슨 1/3)',
        Boolean(badge), badge ? `${badge.sel} "${badgeText.slice(0, 60).replace(/\n/g, ' ')}"` : '배지 후보 셀렉터 모두 없음');
      if (badgePage) {
        await recordHScroll(badgePage.page, 'topic-composer');
        await shot(badgePage.page, 'topic-composer');
        await badgePage.ctx.close();
      }

      // B8 — reviewer 가 draft→published + public. 전이는 콘텐츠와 같은 전이표(D5)를 재사용하는
      //   …/status · …/visibility 다. 그 뒤 학습자 목록에 **eligible 미달인데도** 노출된다(11 결정 3).
      const pub = await post(`/api/admin/topics/${topicId}/status`, 'reviewer', { to: 'published', note: `${TAG} 공개` });
      const vis = await post(`/api/admin/topics/${topicId}/visibility`, 'reviewer', { to: 'public' });
      const learnerTopics = await req('/api/topics', { role: 'learner' });
      const mine = (learnerTopics.topics || []).find((t) => t.id === topicId);
      const learnerDetail = await req(`/api/topics/${topicId}`, { role: 'learner' });
      check('B8 reviewer 공개(published+public) → 학습자 GET /api/topics 노출(eligible 미달) · 진행률 percent 존재',
        pub.status === 200 && vis.status === 200 && Boolean(mine) && mine.eligible === false
        && learnerDetail.status === 200 && typeof learnerDetail.progress?.percent === 'number',
        `status=${pub.status} vis=${vis.status} listed=${Boolean(mine)} eligible=${mine?.eligible} percent=${learnerDetail.progress?.percent}`);

      // B9 — learner 는 관리 토픽 API 에 못 들어온다.
      const denied = await req('/api/admin/topics', { role: 'learner' });
      check('B9 learner GET /api/admin/topics → 403', denied.status === 403 && denied.code === 'FORBIDDEN', `${denied.status} ${denied.code}`);
    }
  }

  // ════════════════════════ C. 검수 화면 회귀 (R11) ════════════════════════
  // review 상태 레슨을 author 가 만든 것으로 심는다 — reviewer 가 반려하므로 자가 검수 규칙에 걸리지 않는다.
  const draft = await createReviewContent(TAG, users.author, { task: 'lesson_gen', name: 'r11' });
  const stateBefore = await reviewState(draft.id);
  if (stateBefore?.status !== 'review') {
    skip('C10 검수 화면 반려', `픽스처가 review 가 아니다 (${stateBefore?.status})`);
  } else {
    const { ctx, page } = await openAs(browser, 'reviewer', '#/review');
    const itemSel = `[data-testid="review-queue-item"][data-content-id="${draft.id}"]`;
    // 큐는 한 페이지 50건이다 — 개발 DB 에 검토 대기가 많으면 픽스처가 2페이지로 밀리므로 제목(TAG)으로 좁힌다.
    if (await waitFor(page, '[data-testid="review-search"]')) {
      await page.locator('[data-testid="review-search"]').fill(TAG);
    }
    const hasItem = await waitFor(page, itemSel);
    let publishChecked = null;
    let rejected = { status: 0, body: {} };
    const note = `${TAG} 반려 사유 — 스크립트 3번 줄 재작성 필요`;
    if (hasItem) {
      await page.locator(itemSel).click();
      await waitFor(page, `[data-testid="review-detail"][data-content-id="${draft.id}"]`, 10000);
      publishChecked = await page.locator('[data-testid="review-publish"]').isChecked().catch(() => null);
      await page.locator('[data-testid="review-reject"]').click();
      await page.locator('[data-testid="review-reject-note"]').fill(note);
      await recordHScroll(page, 'review');
      await shot(page, 'review');
      rejected = await clickAndAwait(page, page.locator('[data-testid="review-reject-confirm"]'), `/api/admin/drafts/${draft.id}/reject`, ['POST']);
      await page.waitForTimeout(500);
    }
    const stateAfter = await reviewState(draft.id);
    const audit = await reviewAudit(draft.id);
    const auditRow = audit.find((a) => a.action === 'status_change' && a.to_status === 'draft' && a.note === note);
    check('C10 #/review → 항목 선택 → 공개 기본 off → 반려(사유) → DB draft · review_status=rejected · 감사 note',
      hasItem && publishChecked === false && rejected.status === 200
      && stateAfter?.status === 'draft' && stateAfter?.review_status === 'rejected' && Boolean(auditRow),
      `item=${hasItem} publish=${publishChecked} reject=${rejected.status} status=${stateAfter?.status} review=${stateAfter?.review_status} audit=${Boolean(auditRow)}`);
    await ctx.close();
  }

  // ════════════════════════ 공통 ════════════════════════
  check('공통 가로 스크롤 0', hScroll.length === 0, hScroll.join(' | '));
  check('공통 콘솔 에러 0', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (error) {
  // 셀렉터 타임아웃 같은 예외가 요약 없이 프로세스를 죽이면 어디까지 통과했는지 알 수 없다 — 실패 1건으로 기록하고 정리로 넘어간다.
  check('하네스 실행 오류 (예외로 중단)', false, String(error && (error.message || error)).split(String.fromCharCode(10))[0].replace(String.fromCharCode(13), '').slice(0, 200));
} finally {
  if (browser) await browser.close().catch(() => {});
  // 정리 순서가 중요하다: 감사 로그(테스트 행위자 기준) → 시드 복원 → 토픽 → 픽스처 콘텐츠/계정.
  // 계정을 먼저 지우면 actor_id 가 NULL 이 되어 테스트가 남긴 감사 행을 골라낼 수 없다.
  const failures = [];
  const run = async (label, fn) => { try { await fn(); } catch (e) { failures.push(`${label}: ${e.message}`); } };
  const actorIds = Object.values(users).map((u) => u.id).filter(Boolean);
  if (seedLc) {
    await run('감사 로그', () => actorIds.length && pool.query(
      `DELETE FROM content_audit_log WHERE content_id = $1 AND actor_id = ANY($2::bigint[])`, [seedLc.id, actorIds]));
    await run('시드 content_items', () => pool.query(
      `UPDATE content_items SET source = $2, status = $3, visibility = $4, updated_by = $5, updated_at = $6 WHERE id = $1`,
      [seedLc.id, seedLc.row.source, seedLc.row.status, seedLc.row.visibility, seedLc.row.updated_by, seedLc.row.updated_at]));
    await run('시드 passage', () => pool.query(
      `UPDATE lesson_details SET passage = $2::jsonb WHERE content_id = $1`, [seedLc.id, JSON.stringify(seedLc.passage)]));
    // updateLesson 은 문항을 DELETE 후 INSERT 로 통째로 갈아 끼운다(position 재부여) — 같은 방식으로 되돌려야
    // 문항 수가 달라진 경우에도 원본과 정확히 같아진다. 채점 기록(user_lesson_attempts)은 position 키라 영향 없다.
    await run('시드 문항', async () => {
      await pool.query(`DELETE FROM lesson_items WHERE content_id = $1`, [seedLc.id]);
      for (const it of seedLc.items) {
        await pool.query(
          `INSERT INTO lesson_items (content_id, position, stem, options, answer, explanation, skill_code)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
          [seedLc.id, it.position, it.stem, JSON.stringify(it.options), it.answer, it.explanation, it.skill_code]);
      }
    });
  }
  await run('토픽', () => pool.query(`DELETE FROM topics WHERE label_ko LIKE $1 OR slug LIKE $1`, [`${TAG}%`]));
  await run('태그 콘텐츠', () => pool.query(`DELETE FROM content_items WHERE slug LIKE $1`, [`${TAG}%`]));
  // 검수 픽스처(author 소유 레슨·job)와 계정 3개 — 픽스처 모듈의 정리 규칙을 그대로 쓴다.
  await run('검수 픽스처', () => cleanupReviewFixtures(TAG));
  if (failures.length) console.error(`정리 실패 — 수동 확인 필요:\n  ${failures.join('\n  ')}`);
  await pool.end().catch(() => {});
}

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length - skipped.length}개 통과 · ${failed.length}개 실패 · ${skipped.length}개 skip`);
if (skipped.length) console.log('skip 은 계약(라우트·화면)이 아직 없다는 뜻이다 — Phase 완료 판정에는 0 이어야 한다.');
process.exit(failed.length ? 1 : 0);
