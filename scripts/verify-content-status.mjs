// 콘텐츠 상태 축 · 가시성 헬퍼 2종 · 전이 권한 검증 (docs/plan/11-content-lifecycle-admin.md §4 Phase 1)
//
// ── 이 스크립트가 따로 있어야 하는 이유 ──────────────────────────────────────
// **무회귀만으로는 아무것도 증명하지 못한다.** 시드 콘텐츠(레슨 7 · 시나리오 1 · 단어세트 1 · 토픽 1)는
// 전부 `status='published'` + `visibility='public'` 이다. 그래서 discoverable/resolvable 이
// `status` 를 통째로 무시하도록 잘못 구현돼도 "헬퍼 도입 전후 목록이 같다" 는 그대로 통과한다.
// 통과하는 버그를 잡으려면 시드에 없는 상태를 **직접 심어야** 한다 — 이 스크립트의 절반이 그 픽스처다.
//
// 그리고 음성(negative) 픽스처만 심으면 반대쪽으로 거짓 통과한다: 헬퍼가 항상 false 를 돌려줘
// **모든 것을 숨겨도** "0건" 단정은 전부 통과하기 때문이다. 그래서 같은 자리에 양성 대조군
// (F4 — published + private + 내 소유)을 하나 섞는다. 음성 4 + 양성 1 이 같은 집계를 통과해야
// "헬퍼가 실제로 판정하고 있다" 가 성립한다.
//
// ── 세 묶음 (플랜 §4 Phase 1) ────────────────────────────────────────────────
//  1 무회귀  — 학습 API 5종이 시드 상태에서 **서로 모순되지 않는** 값을 준다.
//              절대 건수는 하드코딩하지 않는다(시드가 바뀌면 깨지는 단정은 검증이 아니라 족쇄다).
//              대신 불변식을 본다: 목록 건수 = 진행률 분모, 추천 ⊆ 목록, 토픽 분모 = 토픽 집계.
//  2 픽스처  — draft(private, **내 소유**) / archived(public, **남의 소유**) 등 5행을 DB 에 직접 심고
//              두 헬퍼가 갈리는 지점을 단정한다. `archived` 레슨의 기존 attempt 가
//              **오답 노트·통계에는 남고 목록·추천·분모에서는 빠지는 것** — 이 한 줄이 결정 2 의 검증이다.
//  3 권한    — canTransition/canSetVisibility 순수 함수 매트릭스(서버 없이 도는 절) +
//              전이 API 가 이미 있으면 403(역할)과 409(상태)의 구분까지.
//
// ── 전제 ─────────────────────────────────────────────────────────────────────
// `npm run dev`(정적 3003 + API 3004)가 떠 있어야 한다. 대상은 E2E_BASE/E2E_API 로 바꾼다.
// AI provider 불필요 · 브라우저 불필요.
// 마이그레이션 `0018_content_archived_public.sql` 이 적용돼 있어야 한다 —
// baseline 의 `content_items_public_ck` 는 열린질문 7 이 **기각한 초안**이라 `archived + public` 을
// 저장하지 못하고, 그러면 결정 2 의 핵심 픽스처를 심을 수조차 없다. 그 상황을 아래 2-0 이 잡아낸다.
//
// ── 부작용과 정리 ────────────────────────────────────────────────────────────
// 계정 4개(learner·author·reviewer·admin) · content_items 6행 · topics 1행 · attempt 2건을
// DB 에 직접 만든다(scripts/e2e-admin-users.mjs · verify-security.mjs 의 DB 직접 접근 선례).
// 전부 TAG 를 slug/email 에 박아 두고 finally 에서 지운다 — content_items 를 지우면
// lesson_details·lesson_items·topic_contents·user_lesson_attempts 가 CASCADE 로 함께 사라지고,
// users 를 지우면 세션이 함께 사라진다. **content_items.created_by 는 ON DELETE SET NULL 이라
// 계정만 지우면 콘텐츠가 고아로 남는다** — 그래서 콘텐츠를 먼저 지운다.
//
// 실행: node scripts/verify-content-status.mjs  (= npm run verify:content-status)
import { config } from '../api/config.js';
import { canSetVisibility, canTransition } from '../api/lib/content-status.js';
import { pool } from '../api/lib/pool.js';
import { loadRoles } from '../api/lib/roles.js';
import { hashPassword } from '../api/services/password.js';

const BASE = process.env.E2E_BASE || `http://localhost:${process.env.PORT || 3003}`;
const API = process.env.E2E_API || `http://localhost:${process.env.API_PORT || 3004}`;

// slug CHECK(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)를 만족하는 형태여야 한다 — 소문자·숫자·하이픈만.
// content_items.slug 는 UNIQUE 라 태그를 slug 에 박는 것이 곧 정리 키다.
const TAG = `vcs-${Date.now()}`;
const PASS = 'verify-content-1234';
const EMAILS = {
  learner: `${TAG}-learner@test.dev`,
  author: `${TAG}-author@test.dev`,
  reviewer: `${TAG}-reviewer@test.dev`,
  admin: `${TAG}-admin@test.dev`,
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};
let skipped = 0;
const skip = (name, why) => { skipped += 1; console.log(`– ${name} (스킵: ${why})`); };
const section = (title) => console.log(`\n${title}`);

// ── HTTP 헬퍼 ────────────────────────────────────────────────────────────────
// 변경 요청은 X-Requested-With: jina 가 없으면 403(api/lib/cors.js requireCsrfHeader).
// 쿠키를 주지 않으면 X-Jina-No-Autologin 을 자동으로 붙인다 — DEV_AUTOLOGIN=1 이면 쿠키 없는 요청에
// dev 세션이 발급되고 **그 계정은 role='admin' 이다**(db/seeds/dev.mjs). 그걸 모르고 권한 검증에 쓰면
// 403 이 나올 리가 없어 3번 묶음이 통째로 거짓 통과한다.
async function req(pathname, { method = 'GET', cookie, body, headers = {}, timeoutMs = 20_000 } = {}) {
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'jina',
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : { 'X-Jina-No-Autologin': '1' }),
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const res = await fetch(`${API}${pathname}`, init);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  } catch (err) {
    return { status: 0, error: String(err?.message || err) };
  }
}

async function loginCookie(email) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: BASE },
    body: JSON.stringify({ email, password: PASS }),
  });
  if (res.status !== 200) return null;
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ') || null;
}

// ── DB 픽스처 헬퍼 (읽기 API 로는 만들 수 없는 상태를 직접 심는다) ────────────
async function createUser(email, role) {
  const passwordHash = await hashPassword(PASS);
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, role, is_admin)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, role`,
    [email, `VCS-${role}`, passwordHash, role, role === 'admin'],
  );
  return u;
}

// status/visibility 를 **명시하지 않는 호출**도 있다(기본값 검증). 그래서 undefined 를 그대로
// 넘겨 컬럼 목록에서 빼는 형태로 만든다 — DEFAULT 가 실제로 무엇인지가 이 스크립트의 단정 대상이다.
async function insertContent({ type, name, title, status, visibility, createdBy, source = 'curated' }) {
  const cols = ['type', 'slug', 'title', 'description', 'source'];
  const vals = [type, `${TAG}-${name}`, title, '플랜 11 Phase 1 검증 픽스처', source];
  if (status !== undefined) { cols.push('status'); vals.push(status); }
  if (visibility !== undefined) { cols.push('visibility'); vals.push(visibility); }
  if (createdBy !== undefined) { cols.push('created_by'); vals.push(createdBy); }
  const holes = vals.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: [row] } = await pool.query(
    `INSERT INTO content_items (${cols.join(', ')}) VALUES (${holes})
     RETURNING id, slug, status, visibility, created_by`,
    vals,
  );
  return row;
}

// 레슨 픽스처 = content_items + lesson_details + lesson_items 2문항.
// 문항이 있어야 오답 노트(MISTAKES_SQL)가 조인을 탄다 — 문항 없는 레슨은 archived 를 심어도
// resolvable 검증이 성립하지 않는다(오답이 만들어지지 않으므로 "남았다"를 말할 수 없다).
// position 은 시드보다 뒤로 밀어 둔다(목록 정렬이 d.position 순이라 앞에 끼면 회귀 진단이 헷갈린다).
async function insertLesson(opts) {
  const row = await insertContent({ type: 'lesson', ...opts });
  await pool.query(
    `INSERT INTO lesson_details (content_id, kind, subtitle, est_minutes, passage, position)
     VALUES ($1, 'toeic_part7', $2, 5, $3::jsonb, 900)`,
    [row.id, opts.title, JSON.stringify({ type: 'email', body: 'Verification fixture passage.' })],
  );
  const options = JSON.stringify([{ id: 'A', text: 'alpha' }, { id: 'B', text: 'bravo' }]);
  await pool.query(
    `INSERT INTO lesson_items (content_id, position, stem, options, answer, explanation, skill_code)
     VALUES ($1, 1, 'fixture question 1', $2::jsonb, 'A', '', 'grammar'),
            ($1, 2, 'fixture question 2', $2::jsonb, 'A', '', 'vocab')`,
    [row.id, options],
  );
  return row;
}

// 두 문항 모두 정답이 'A' 인 픽스처 레슨에 대한 시도. answers 와 correct_count 를 일치시켜 둔다 —
// 오답 노트는 answers 를 읽고 정답률 집계는 correct_count/total_count 를 읽으므로, 둘이 어긋나면
// 어느 쪽이 틀렸는지 진단할 수 없는 검증이 된다.
//   { '1': 'B', '2': 'A' } → 1번 오답 · 2번 정답 → correct 1 / total 2
//   { '1': 'B', '2': 'B' } → 둘 다 오답            → correct 0 / total 2
async function insertAttempt(userId, contentId, answers, correct) {
  const { rows: [a] } = await pool.query(
    `INSERT INTO user_lesson_attempts (user_id, content_id, answers, correct_count, total_count, elapsed_ms)
     VALUES ($1, $2, $3::jsonb, $4, 2, 60000)
     RETURNING id`,
    [userId, contentId, JSON.stringify(answers), correct],
  );
  return a.id;
}

async function attachToTopic(topicId, contentId, position) {
  await pool.query(
    `INSERT INTO topic_contents (topic_id, content_id, position) VALUES ($1, $2, $3)`,
    [topicId, contentId, position],
  );
}

async function statusOf(contentId) {
  const { rows: [r] } = await pool.query(
    `SELECT status, visibility FROM content_items WHERE id = $1`, [contentId],
  );
  return r || { status: null, visibility: null };
}

async function auditCount(contentId) {
  const { rows: [r] } = await pool.query(
    `SELECT count(*)::int AS n FROM content_audit_log WHERE content_id = $1`, [contentId],
  );
  return r.n;
}

// 학습 API 5종의 스냅샷. 절대 건수를 비교하지 않고 **픽스처 투입 전후의 차이**를 본다 —
// 시드가 바뀌어도 안 깨지고, 그러면서도 "0건" 을 하드코딩보다 강하게 단정할 수 있다.
async function snapshot(cookie, topicId) {
  const [lessons, rec, topics, mistakes, progress, dashboard] = await Promise.all([
    req('/api/lessons', { cookie }),
    req('/api/lessons/recommended', { cookie }),
    req('/api/topics', { cookie }),
    req('/api/mistakes', { cookie }),
    req('/api/progress', { cookie }),
    req('/api/dashboard', { cookie }),
  ]);
  const detail = topicId ? await req(`/api/topics/${topicId}`, { cookie }) : null;
  const scenarios = await req('/api/scenarios', { cookie });
  return {
    lessons, rec, topics, mistakes, progress, dashboard, detail, scenarios,
    lessonIds: (lessons.lessons || []).map((l) => l.id).sort((a, b) => a - b),
    lessonTotal: lessons.progress?.total ?? null,
    recIds: (rec.lessons || []).map((l) => l.id).sort((a, b) => a - b),
    topicIds: (topics.topics || []).map((t) => t.id).sort((a, b) => a - b),
    scenarioIds: (scenarios.scenarios || []).map((s) => s.id).sort((a, b) => a - b),
    // 오답은 (레슨, 문항 위치) 로 식별한다 — item_id 는 픽스처를 다시 만들면 바뀐다.
    mistakeKeys: (mistakes.mistakes || []).map((m) => `${m.lesson_id}:${m.position}`),
    recentIds: (progress.progress?.recent_sessions || []).map((s) => s.id),
    topicCounts: detail?.topic
      ? { lesson: detail.topic.lesson_count, scenario: detail.topic.scenario_count, vocab: detail.topic.vocab_count }
      : null,
    topicDenoms: detail?.progress
      ? {
        lesson: detail.progress.lesson.total,
        conversation: detail.progress.conversation.total,
        vocabulary: detail.progress.vocabulary.total,
      }
      : null,
    topicLessonIds: (detail?.lessons || []).map((l) => l.id).sort((a, b) => a - b),
    topicScenarioIds: (detail?.scenarios || []).map((s) => s.id).sort((a, b) => a - b),
    topicVocabIds: (detail?.vocab_sets || []).map((v) => v.id).sort((a, b) => a - b),
  };
}

const sameIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ── 준비 ─────────────────────────────────────────────────────────────────────
const alive = await req('/api/health');
if (alive.status !== 200) {
  console.error(`✖ ${API} 에 연결할 수 없습니다 (status=${alive.status} ${alive.error || ''})`
    + ` — npm run dev 를 먼저 실행하세요.`);
  process.exit(1);
}

let learner;
let author;
try {
  learner = await createUser(EMAILS.learner, 'learner');
  author = await createUser(EMAILS.author, 'author');
  await createUser(EMAILS.reviewer, 'reviewer');
  await createUser(EMAILS.admin, 'admin');

  const cookies = {
    learner: await loginCookie(EMAILS.learner),
    author: await loginCookie(EMAILS.author),
    reviewer: await loginCookie(EMAILS.reviewer),
    admin: await loginCookie(EMAILS.admin),
  };
  check('준비: 계정 4개(learner·author·reviewer·admin) 생성·로그인',
    Object.values(cookies).every(Boolean), Object.keys(cookies).join(' '));
  const me = await req('/api/auth/me', { cookie: cookies.learner });
  check('준비: learner 세션이 실제로 비관리자 (자동로그인 admin 세션을 잡지 않았다)',
    me.status === 200 && me.user?.role === 'learner' && me.user?.can_author === false,
    `role=${me.user?.role} can_author=${me.user?.can_author}`);

  // ══ 1. 무회귀 ══════════════════════════════════════════════════════════════
  // 절대 건수를 박지 않는다. 대신 **서로를 검산하는 불변식**만 본다 —
  // 헬퍼가 어느 한 쿼리에만 적용되면 이 등식들이 먼저 깨진다.
  section('[1] 무회귀 — 학습 API 5종의 불변식 (시드 상태)');
  const topicsFirst = await req('/api/topics', { cookie: cookies.learner });
  const topicId = topicsFirst.topics?.[0]?.id ?? null;
  if (!topicId) skip('1-4 토픽 상세 불변식', '토픽이 하나도 없음 — npm run db:seed:content');

  const before = await snapshot(cookies.learner, topicId);

  check('1-1 GET /api/lessons 200 · 레슨 ≥ 1건',
    before.lessons.status === 200 && before.lessonIds.length >= 1,
    `${before.lessons.status} ${before.lessonIds.length}건`);
  // 목록과 진행률 분모는 같은 규칙(discoverable)이어야 한다. 한쪽만 헬퍼를 타면 여기서 갈린다.
  check('1-2 목록 건수 = 진행률 분모 (progress.total) — 목록과 분모가 같은 규칙',
    before.lessonTotal === before.lessonIds.length,
    `total=${before.lessonTotal} list=${before.lessonIds.length}`);
  check('1-3 추천 ⊆ 목록 · 1~3건 (추천이 목록에 없는 레슨을 권하지 않는다)',
    before.rec.status === 200 && before.recIds.length >= 1 && before.recIds.length <= 3
      && before.recIds.every((id) => before.lessonIds.includes(id)),
    `추천 ${before.recIds.length}건`);
  if (topicId) {
    check('1-4 토픽 상세: 진행률 분모 = 토픽 집계 (lesson_count · scenario_count)',
      before.detail?.status === 200
        && before.topicDenoms?.lesson === before.topicCounts?.lesson
        && before.topicDenoms?.conversation === before.topicCounts?.scenario,
      `lesson ${before.topicDenoms?.lesson}/${before.topicCounts?.lesson}`
      + ` scenario ${before.topicDenoms?.conversation}/${before.topicCounts?.scenario}`);
  }
  check('1-5 GET /api/mistakes 200 · total = 배열 길이',
    before.mistakes.status === 200 && before.mistakes.total === (before.mistakes.mistakes || []).length,
    `total=${before.mistakes.total}`);
  check('1-6 GET /api/progress · /api/dashboard 200 (집계가 조인 변경으로 죽지 않았다)',
    before.progress.status === 200 && Boolean(before.progress.progress?.user)
      && before.dashboard.status === 200 && Boolean(before.dashboard.stats),
    `progress=${before.progress.status} dashboard=${before.dashboard.status}`);

  // ══ 2. 음성 픽스처 + 양성 대조군 ═══════════════════════════════════════════
  section('[2] 픽스처 — status/visibility 두 축이 실제로 판정에 쓰이는가');

  // 2-0 CHECK 제약 자체가 확정안인가. 이것이 아니면 아래 archived 픽스처를 심을 수 없다.
  //     `archived + public` 이 저장되는 것 자체가 열린질문 7 확정안(0018)의 첫 단정이다 —
  //     기각안(초안) CHECK 였다면 이 INSERT 가 23514 로 거부되어 결정 2 의 검증을 아예 못 한다.
  let archived = null;
  try {
    // source='seed' 인 이유: 정답률·예상 점수 집계(dashboard fetchLessonAccuracy ·
    // progress fetchScoreInputs)가 `source = 'seed' AND resolvable(...)` 로 좁혀져 있다.
    // curated 로 심으면 source 조건에서 먼저 걸러져 resolvable 이 판정에 쓰이는지를 볼 수 없다.
    archived = await insertLesson({
      name: 'f2-archived-public', title: 'VCS 내려진 공개 레슨',
      status: 'archived', visibility: 'public', createdBy: author.id, source: 'seed',
    });
    check('2-0 archived + public INSERT 성공 (열린질문 7 확정안 = 0018 적용됨)',
      archived.status === 'archived' && archived.visibility === 'public',
      `#${archived.id} ${archived.status}/${archived.visibility}`);
  } catch (err) {
    check('2-0 archived + public INSERT 성공 (열린질문 7 확정안 = 0018 적용됨)', false,
      err.code === '23514'
        ? 'content_items_public_ck 가 아직 기각안(초안)이다 — 0018_content_archived_public.sql 미적용'
        : String(err.message));
  }

  // 2-1 CHECK 가 draft/review 의 오발행은 여전히 막는가(확정안이 초안보다 넓지만 무제한은 아니다).
  let reviewPublicOk = false;
  let reviewPublicCode = '(예외 없음)';
  try {
    await insertContent({
      type: 'lesson', name: 'f-review-public', title: 'VCS 검토중 공개 시도',
      status: 'review', visibility: 'public', createdBy: author.id,
    });
  } catch (err) {
    reviewPublicOk = err.code === '23514';
    reviewPublicCode = `${err.code} ${err.constraint || ''}`.trim();
  }
  check('2-1 review + public INSERT → CHECK 위반(23514) — 공개 상태가 아닌데 public 은 저장 불가',
    reviewPublicOk, reviewPublicCode);

  // 2-2 기본값. status 를 안 쓰는 저작 경로가 생기면 콘텐츠가 조용히 draft 로 들어가
  //     사용자가 자기 생성물을 못 보게 된다(플랜 §3 ai-job 행의 "기본값 함정").
  const defaults = await insertContent({
    type: 'lesson', name: 'f-defaults', title: 'VCS 기본값', createdBy: author.id,
  });
  check('2-2 status·visibility 생략 INSERT → draft / private (기본값)',
    defaults.status === 'draft' && defaults.visibility === 'private',
    `${defaults.status}/${defaults.visibility}`);

  // ── 가시성 픽스처 5행 ──────────────────────────────────────────────────────
  //  F1 draft   · private · **내 소유**  → 소유자 예외를 통과하므로 배제 사유는 오직 status 다.
  //                                       남의 것으로 심으면 visibility 에 걸려 status 를 검증하지 못한다.
  //  F2 archived· public  · 남의 소유    → 목록·추천·분모 ✗ / 오답 노트·통계 ✓  (결정 2 의 핵심)
  //  F3 published· private· 남의 소유    → status 는 통과, visibility 로 배제 (다른 축이 살아 있는가)
  //  F4 published· private· **내 소유**  → **양성 대조군.** 보여야 한다.
  //                                       이것이 없으면 헬퍼가 전부 false 여도 위 셋이 통과한다.
  //  F5 draft scenario · F6 draft vocab_set · F7 draft topic → 타입별로 같은 배제가 도는가
  const draft = await insertLesson({
    name: 'f1-draft-mine', title: 'VCS 초안 레슨(내 소유)',
    status: 'draft', visibility: 'private', createdBy: learner.id, source: 'seed',
  });
  const otherPrivate = await insertLesson({
    name: 'f3-published-private-other', title: 'VCS 남의 비공개 레슨',
    status: 'published', visibility: 'private', createdBy: author.id,
  });
  const minePrivate = await insertLesson({
    name: 'f4-published-private-mine', title: 'VCS 내 비공개 레슨',
    status: 'published', visibility: 'private', createdBy: learner.id,
  });
  const draftScenario = await insertContent({
    type: 'scenario', name: 'f5-draft-scenario', title: 'VCS 초안 시나리오',
    status: 'draft', visibility: 'private', createdBy: learner.id,
  });
  await pool.query(
    `INSERT INTO scenario_details (content_id, tag, level, system_prompt, opening_message)
     VALUES ($1, 'VCS', 3, 'fixture', 'hello')`, [draftScenario.id],
  );
  const draftVocab = await insertContent({
    type: 'vocab_set', name: 'f6-draft-vocab', title: 'VCS 초안 단어세트',
    status: 'draft', visibility: 'private', createdBy: learner.id,
  });
  // 단어 25개 — 임계치(20)를 넘겨 둔다. 집계에 섞이면 vocab_count 가 눈에 띄게 튄다.
  await pool.query(
    `INSERT INTO vocab_set_details (content_id, words) VALUES ($1, $2::jsonb)`,
    [draftVocab.id, JSON.stringify(
      Array.from({ length: 25 }, (_, i) => ({ word: `${TAG}word${i + 1}`, meaning_ko: '검증용' })),
    )],
  );
  const { rows: [draftTopic] } = await pool.query(
    `INSERT INTO topics (slug, label_ko, description, status, visibility, created_by)
     VALUES ($1, 'VCS 초안 토픽', '검증 픽스처', 'draft', 'private', $2)
     RETURNING id`,
    [`${TAG}-f7-draft-topic`, learner.id],
  );

  // 시드 토픽에 픽스처를 붙인다 — 토픽 집계·상세·진행률 분모가 같은 헬퍼를 타는지 한 번에 본다.
  // 붙인 6행 중 보여야 하는 것은 F4 하나뿐이다. topic_contents 는 content_id FK 가 CASCADE 라
  // 콘텐츠를 지우면 함께 사라진다(별도 정리 불필요).
  if (topicId) {
    let pos = 900;
    for (const id of [draft.id, archived?.id, otherPrivate.id, minePrivate.id,
      draftScenario.id, draftVocab.id]) {
      if (id) await attachToTopic(topicId, id, pos++);
    }
  }

  // attempt 2건 — "이미 한 것" 을 만든다. 이것이 없으면 resolvable 을 검증할 수 없다.
  // 두 시도의 정답 수를 **다르게** 둔 것이 핵심이다(archived 1/2 · draft 0/2). 같게 두면
  // 정답률 집계가 셋 중 무엇을 했는지(제대로 걸렀는지 · draft 를 흘렸는지 · archived 를 버렸는지)
  // 숫자 하나로 구분할 수 없다 — 아래 2-12/2-14 가 그 세 값을 갈라 읽는다.
  const draftAttempt = await insertAttempt(learner.id, draft.id, { 1: 'B', 2: 'B' }, 0);
  const archivedAttempt = archived
    ? await insertAttempt(learner.id, archived.id, { 1: 'B', 2: 'A' }, 1)
    : null;

  const after = await snapshot(cookies.learner, topicId);

  // ── 목록·추천·분모: discoverable ──────────────────────────────────────────
  const expectedList = [...before.lessonIds, minePrivate.id].sort((a, b) => a - b);
  check('2-3 목록 = 기존 ∪ {F4 내 비공개 published} — 소유자 예외는 살아 있고 나머지는 배제',
    sameIds(after.lessonIds, expectedList)
    && !after.lessonIds.includes(draft.id)
    && !after.lessonIds.includes(otherPrivate.id)
    && (!archived || !after.lessonIds.includes(archived.id)),
    `${before.lessonIds.length} → ${after.lessonIds.length} (+F4 #${minePrivate.id})`);
  check('2-4 진행률 분모도 같은 규칙 — total 이 목록과 같이 +1',
    after.lessonTotal === before.lessonTotal + 1 && after.lessonTotal === after.lessonIds.length,
    `${before.lessonTotal} → ${after.lessonTotal}`);
  check('2-5 추천에 draft·archived·남의 private 이 끼지 않는다',
    after.rec.status === 200
    && after.recIds.every((id) => id !== draft.id && id !== otherPrivate.id && id !== archived?.id),
    `추천 ${after.recIds.length}건`);
  check('2-6 초안 시나리오는 /api/scenarios 에 없다',
    sameIds(after.scenarioIds, before.scenarioIds) && !after.scenarioIds.includes(draftScenario.id),
    `${before.scenarioIds.length} → ${after.scenarioIds.length}`);
  check('2-7 초안 토픽은 /api/topics 에 없다 (내 소유여도 status 로 배제)',
    sameIds(after.topicIds, before.topicIds) && !after.topicIds.includes(draftTopic.id),
    `${before.topicIds.length} → ${after.topicIds.length}`);

  if (topicId) {
    check('2-8 토픽 집계: 레슨 +1(F4 만) · 시나리오 +0 · 단어 +0 — 음성 4 · 양성 1 이 같은 쿼리를 통과',
      after.topicCounts?.lesson === before.topicCounts?.lesson + 1
      && after.topicCounts?.scenario === before.topicCounts?.scenario
      && after.topicCounts?.vocab === before.topicCounts?.vocab,
      `lesson ${before.topicCounts?.lesson}→${after.topicCounts?.lesson}`
      + ` scenario ${before.topicCounts?.scenario}→${after.topicCounts?.scenario}`
      + ` vocab ${before.topicCounts?.vocab}→${after.topicCounts?.vocab}`);
    check('2-9 토픽 진행률 분모도 같은 값 (CTE 가 목록과 다른 규칙을 쓰지 않는다)',
      after.topicDenoms?.lesson === after.topicCounts?.lesson
      && after.topicDenoms?.conversation === after.topicCounts?.scenario
      && after.topicDenoms?.vocabulary === after.topicCounts?.vocab,
      `분모 lesson=${after.topicDenoms?.lesson} conv=${after.topicDenoms?.conversation}`
      + ` vocab=${after.topicDenoms?.vocabulary}`);
    check('2-10 토픽 상세 목록에도 F4 만 늘고 draft·archived·남의 private 은 없다',
      after.topicLessonIds.includes(minePrivate.id)
      && !after.topicLessonIds.includes(draft.id)
      && !after.topicLessonIds.includes(otherPrivate.id)
      && (!archived || !after.topicLessonIds.includes(archived.id))
      && !after.topicScenarioIds.includes(draftScenario.id)
      && !after.topicVocabIds.includes(draftVocab.id),
      `lessons ${after.topicLessonIds.length} scenarios ${after.topicScenarioIds.length}`
      + ` sets ${after.topicVocabIds.length}`);
  }

  // ── 오답 노트·통계: resolvable ★ 결정 2 의 검증 ────────────────────────────
  // 여기가 이 하네스의 존재 이유다. archived 를 오답 노트 조인에서 떨어뜨리면
  // **사용자가 이미 낸 오답이 통째로 사라진다.** 반대로 draft 까지 받아 주면
  // 아직 공개되지도 않은 콘텐츠가 사용자의 기록에 나타난다.
  if (archived) {
    check('2-11 ★ archived 레슨의 오답이 오답 노트에 남는다 (resolvable — 결정 2)',
      after.mistakeKeys.includes(`${archived.id}:1`),
      `오답 ${before.mistakeKeys.length} → ${after.mistakeKeys.length}`);

    // 통계 쪽 단정은 **정답률 한 숫자**로 읽는다. 새 계정이라 기준선이 null 이고, 픽스처 두 건이
    // 만들 수 있는 값은 셋뿐이라 숫자 하나가 곧 진단이다(dashboard.service fetchLessonAccuracy):
    //   50  = archived 1/2 만 셌다            → resolvable. 정답.
    //   25  = draft 0/2 까지 함께 셌다 (1/4)  → 조건이 아예 없다.
    //   null= archived 를 버렸다 (0/0)        → discoverable 을 잘못 걸었다. 사용자의 과거 점수가 증발한다.
    // 픽스처를 source='seed' 로 심은 이유가 이 집계에 닿기 위해서다.
    const acc = after.dashboard.stats?.accuracy_pct ?? null;
    check('2-12 ★ archived 레슨의 점수가 통계에 남는다 (null 이면 discoverable 을 잘못 걸었다)',
      acc !== null, `accuracy_pct ${before.dashboard.stats?.accuracy_pct ?? 'null'} → ${acc ?? 'null'}`);
    check('2-14 draft 레슨의 점수는 통계에 섞이지 않는다 (25 면 draft 누수 · 50 이 정답)',
      acc === 50, `accuracy_pct=${acc ?? 'null'} (archived 1/2 · draft 0/2)`);
  } else {
    skip('2-11/2-12/2-14 archived 의 오답·통계 잔존', 'archived + public 픽스처를 심지 못했다 (2-0 참조)');
  }
  check('2-13 draft 레슨의 오답은 오답 노트에 없다 (resolvable 은 published·archived 뿐)',
    !after.mistakeKeys.includes(`${draft.id}:1`),
    `draft #${draft.id} — lesson.service.js MISTAKES_SQL 의 content_items 조인`);
  check('2-15 오답 노트 증가분이 archived 1건뿐 (draft 가 함께 새지 않았다)',
    after.mistakeKeys.length === before.mistakeKeys.length + (archived ? 1 : 0),
    `${before.mistakeKeys.length} → ${after.mistakeKeys.length}`);
  // 활동 원장(streak·주간 학습량)과 recent_sessions 는 **일부러 단정하지 않는다.**
  // 그쪽은 "며칠 공부했나" 를 세는 자리라 콘텐츠 생명주기와 무관하고, 가시성을 걸면 관리자가
  // 콘텐츠를 내리는 순간 지난주 스트릭이 소급해 끊긴다(progress.service·dashboard.service 의
  // ACT_LESSON 주석에 그 경계가 적혀 있다). 아래 두 값은 참고용으로만 찍는다.
  console.log(`  참고: recent_sessions 에 draft=${after.recentIds.includes(`lesson-${draftAttempt}`)}`
    + ` archived=${archivedAttempt ? after.recentIds.includes(`lesson-${archivedAttempt}`) : '-'}`
    + ' (활동 원장은 의도적 무필터 — 단정 대상 아님)');

  // ══ 3. 권한 — 역할 × 전이 매트릭스 ═════════════════════════════════════════
  // 3-A 는 **서버 없이 도는 절**이다. 전이 API 가 아직 없어도 규칙 자체는 여기서 전부 검증된다.
  // atLeast() 는 loadRoles() 가 캐시를 채우기 전에 부르면 throw 한다(api/lib/roles.js).
  section('[3-A] canTransition / canSetVisibility 순수 함수 매트릭스 (서버 불필요)');
  await loadRoles();

  const ROLES = ['learner', 'author', 'reviewer', 'admin'];
  const RANK = { learner: 1, author: 2, reviewer: 3, admin: 4 };
  const STATUSES = ['draft', 'review', 'published', 'archived'];
  // 플랜 §2 결정 7 의 표를 **손으로 옮겨 적는다.** 검증 대상 모듈의 TRANSITIONS 를 그대로
  // 읽어 오면 "모듈이 자기 자신과 같다" 를 확인할 뿐이라 아무것도 검증하지 못한다.
  const ALLOWED = {
    'draft>review': 'author',
    'draft>published': 'reviewer',
    'review>published': 'reviewer',
    'review>draft': 'reviewer',
    'published>archived': 'reviewer',
    'archived>published': 'reviewer',
  };

  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const min = ALLOWED[`${from}>${to}`];
      const bad = [];
      for (const role of ROLES) {
        const v = canTransition(from, to, role);
        if (!min) {
          // 표에 없는 조합 = 금지 전이. from === to(멱등 재전송)도 여기다.
          // 역할과 **무관하게** CONFLICT 여야 한다 — admin 이라고 뚫리면 안 된다.
          if (!(v.ok === false && v.reason === 'CONFLICT')) bad.push(`${role}:${v.reason || 'ok'}`);
        } else if (RANK[role] >= RANK[min]) {
          if (v.ok !== true) bad.push(`${role}:${v.reason}`);
        } else if (!(v.ok === false && v.reason === 'FORBIDDEN' && v.minRole === min)) {
          bad.push(`${role}:${v.reason}/${v.minRole ?? '-'}`);
        }
      }
      check(`3-A ${from} → ${to} · ${min ? `${min}+ 허용` : '금지(409)'} — 역할 4종 전부`,
        bad.length === 0, bad.join(' ') || (min ? `min=${min}` : 'CONFLICT'));
    }
  }

  // 표를 통째로 도는 위 루프가 이미 덮지만, 플랜이 이름을 붙여 못박은 세 줄은 따로 남긴다 —
  // 실패했을 때 "어느 규칙이 깨졌나" 가 로그 한 줄로 읽혀야 한다.
  const pubToDraftAdmin = canTransition('published', 'draft', 'admin');
  check('3-A ★ published → draft 는 admin 도 409 CONFLICT (권한이 아니라 상태 문제)',
    pubToDraftAdmin.ok === false && pubToDraftAdmin.reason === 'CONFLICT',
    `${pubToDraftAdmin.reason}`);
  const authorApprove = canTransition('review', 'published', 'author');
  check('3-A ★ author 의 review → published 는 403 FORBIDDEN + minRole=reviewer (역할을 올리면 되는 일)',
    authorApprove.ok === false && authorApprove.reason === 'FORBIDDEN' && authorApprove.minRole === 'reviewer',
    `${authorApprove.reason}/${authorApprove.minRole}`);
  const samePublished = canTransition('published', 'published', 'admin');
  check('3-A ★ from === to 재전송은 no-op 이 아니라 409 (감사 로그에 빈 행을 쌓지 않는다)',
    samePublished.ok === false && samePublished.reason === 'CONFLICT', `${samePublished.reason}`);

  // 가시성 — 최소 reviewer, 그리고 content_items_public_ck 를 거스르지 않아야 한다.
  // draft/review 를 public 으로 올리는 것은 역할이 아무리 높아도 CONFLICT 다(DB 가 23514 로 막을 일을
  // 애플리케이션이 먼저, 읽을 수 있는 말로 막는다).
  for (const status of STATUSES) {
    for (const to of ['public', 'private']) {
      const dbAllows = to === 'private' || status === 'published' || status === 'archived';
      const bad = [];
      for (const role of ROLES) {
        const v = canSetVisibility(status, to, role);
        if (!dbAllows) {
          if (!(v.ok === false && v.reason === 'CONFLICT')) bad.push(`${role}:${v.reason || 'ok'}`);
        } else if (RANK[role] >= RANK.reviewer) {
          if (v.ok !== true) bad.push(`${role}:${v.reason}`);
        } else if (!(v.ok === false && v.reason === 'FORBIDDEN' && v.minRole === 'reviewer')) {
          bad.push(`${role}:${v.reason}/${v.minRole ?? '-'}`);
        }
      }
      check(`3-A visibility ${status} → ${to} · ${dbAllows ? 'reviewer+ 허용' : '금지(409)'}`,
        bad.length === 0, bad.join(' ') || (dbAllows ? 'reviewer+' : 'CONFLICT'));
    }
  }

  // ── 3-B 권한 경계 (지금 있는 라우트) ───────────────────────────────────────
  section('[3-B] /api/admin/* 권한 경계 · 콘텐츠 축과 시스템 축의 분리');
  const learnerUsers = await req('/api/admin/users', { cookie: cookies.learner });
  const learnerContents = await req('/api/admin/contents', { cookie: cookies.learner });
  const learnerRole = await req(`/api/admin/users/${learner.id}/role`,
    { method: 'PATCH', cookie: cookies.learner, body: { to: 'admin' } });
  const learnerRevoke = await req(`/api/admin/users/${learner.id}/sessions/revoke`,
    { method: 'POST', cookie: cookies.learner, body: {} });
  check('3-B learner 는 /api/admin/* 전부 403 FORBIDDEN (users · contents · role · sessions)',
    [learnerUsers, learnerContents, learnerRole, learnerRevoke]
      .every((r) => r.status === 403 && r.code === 'FORBIDDEN'),
    [learnerUsers, learnerContents, learnerRole, learnerRevoke].map((r) => r.status).join(','));

  const authorContents = await req('/api/admin/contents', { cookie: cookies.author });
  const authorUsers = await req('/api/admin/users', { cookie: cookies.author });
  check('3-B author 는 콘텐츠 네임스페이스 200 · 사용자 관리 403 (서열이 두 경로를 다르게 연다)',
    authorContents.status === 200 && authorUsers.status === 403,
    `contents=${authorContents.status} users=${authorUsers.status}`);

  // 시스템 축 — 사이드카는 role 서열의 admin 만 연다. reviewer 가 403 이어야 "축이 갈렸다" 가 증명된다
  // (콘텐츠 승인 권한과 서버에서 프로세스를 띄우는 권한은 위험도가 다르다 — 결정 6).
  // admin 요청은 실제로 사이드카를 띄울 수 있다. verify-security.mjs 와 같은 규칙으로,
  // **우리가 띄운 것만**(started === true) 되돌린다 — 이미 돌던 것은 개발자 것이라 건드리지 않는다.
  const reviewerSidecar = await req('/api/speaking/sidecar/start',
    { method: 'POST', cookie: cookies.reviewer, body: {} });
  check('3-B reviewer 의 사이드카 시작 → 403 FORBIDDEN (콘텐츠 축으로는 시스템을 못 연다)',
    reviewerSidecar.status === 403 && reviewerSidecar.code === 'FORBIDDEN',
    `${reviewerSidecar.status} ${reviewerSidecar.code ?? '-'}`);
  const adminSidecar = await req('/api/speaking/sidecar/start',
    { method: 'POST', cookie: cookies.admin, body: {} });
  // 미설치 409 CONFLICT · 설치돼 있으면 200 · production 이면 403 READONLY(권한이 아니라 장소 문제).
  // 어느 쪽이든 "403 FORBIDDEN 이 아니다" 가 권한을 통과했다는 증거다.
  check('3-B admin 은 같은 요청에서 권한 통과 (403 FORBIDDEN 아님 — 미설치면 409)',
    !(adminSidecar.status === 403 && adminSidecar.code === 'FORBIDDEN'),
    `${adminSidecar.status} ${adminSidecar.code ?? (adminSidecar.started ? 'started' : 'ok')}`);
  if (adminSidecar.status === 200 && adminSidecar.started === true) {
    const stopped = await req('/api/speaking/sidecar/stop', { method: 'POST', cookie: cookies.admin, body: {} });
    console.log(`  정리: 검증이 띄운 사이드카 중지 (stopped=${stopped.stopped})`);
  }

  // ── 3-C 전이 API (플랜 Phase 2 산출물 — 없으면 스킵) ───────────────────────
  // 엔드포인트: POST /api/admin/contents/:type/:id/status { to, note }
  //             POST /api/admin/contents/:type/:id/visibility { to }
  // 라우터는 등록되지 않은 경로에 404 '없는 경로입니다.' 를 준다(api/server.js). learner 로 먼저
  // 두드려 보는 이유가 그것이다 — 라우트가 있으면 requireRole 이 먼저 걸려 403 이 나오므로
  // 404 는 "아직 없다" 로만 읽힌다. 하네스가 여기서 죽으면 안 된다.
  section('[3-C] 전이 API — 역할 × 전이 매트릭스 (Phase 2 산출물)');
  const walker = await insertLesson({
    name: 'ft-transition-walk', title: 'VCS 전이 대상',
    status: 'draft', visibility: 'private', createdBy: author.id,
  });
  const statusPath = `/api/admin/contents/lesson/${walker.id}/status`;
  const probe = await req(statusPath, { method: 'POST', cookie: cookies.learner, body: { to: 'review' } });

  if (probe.status === 404) {
    skip('3-C 전이 API 매트릭스 (7항목)',
      `POST ${statusPath} 미구현 — ${probe.error || 'NOT_FOUND'}.`
      + ' 규칙 자체는 3-A 가 순수 함수 수준에서 이미 단정했다');
  } else {
    check('3-C learner 의 전이 요청 → 403 FORBIDDEN (네임스페이스 가드가 먼저 선다)',
      probe.status === 403 && probe.code === 'FORBIDDEN', `${probe.status} ${probe.code ?? '-'}`);

    const auditBefore = await auditCount(walker.id);
    const post = (cookie, to, path = statusPath) => req(path, { method: 'POST', cookie, body: { to, note: 'vcs' } });

    const t1 = await post(cookies.author, 'review');
    const s1 = await statusOf(walker.id);
    // 200 만 보면 아무것도 안 하고 200 을 주는 스텁이 통과한다 — DB 를 함께 읽는 이유다.
    check('3-C author draft → review 200 · DB 가 실제로 review',
      t1.status === 200 && s1.status === 'review', `${t1.status} db=${s1.status}`);

    const t2 = await post(cookies.author, 'published');
    check('3-C author review → published 403 FORBIDDEN (승인은 reviewer 부터)',
      t2.status === 403 && t2.code === 'FORBIDDEN', `${t2.status} ${t2.code ?? '-'}`);

    const t3 = await post(cookies.reviewer, 'published');
    const s3 = await statusOf(walker.id);
    check('3-C reviewer review → published 200 · DB 가 실제로 published',
      t3.status === 200 && s3.status === 'published', `${t3.status} db=${s3.status}`);

    const t4 = await post(cookies.author, 'archived');
    check('3-C author published → archived 403 FORBIDDEN (내림도 reviewer 부터)',
      t4.status === 403 && t4.code === 'FORBIDDEN', `${t4.status} ${t4.code ?? '-'}`);

    const t5 = await post(cookies.reviewer, 'archived');
    const t6 = await post(cookies.reviewer, 'published');
    const s6 = await statusOf(walker.id);
    check('3-C reviewer 내림 → 다시 올림 200/200 · DB 가 published 로 복귀',
      t5.status === 200 && t6.status === 200 && s6.status === 'published',
      `${t5.status}/${t6.status} db=${s6.status}`);

    // 금지 전이는 **권한이 아니라 상태 문제**라 403 이 아니다. admin 으로 눌러도 409 여야
    // 관리 UI 가 "역할을 올리면 되는 일" 과 "지금 상태에서는 안 되는 일" 을 구분할 수 있다.
    const t7 = await post(cookies.admin, 'draft');
    const s7 = await statusOf(walker.id);
    check('3-C ★ admin published → draft 409 CONFLICT · 상태 불변 (403 이 아니다)',
      t7.status === 409 && t7.code === 'CONFLICT' && s7.status === 'published',
      `${t7.status} ${t7.code ?? '-'} db=${s7.status}`);

    const auditAfter = await auditCount(walker.id);
    check('3-C 성공한 전이 4건마다 content_audit_log 1행 (실패 전이는 남기지 않는다)',
      auditAfter - auditBefore === 4, `${auditBefore} → ${auditAfter}`);

    // 가시성은 별도 조작이다 — 내릴 때 가시성을 건드리지 않는 것이 열린질문 7 확정안의 전제라
    // 공개 여닫기 경로가 따로 있어야 한다.
    const visPath = `/api/admin/contents/lesson/${walker.id}/visibility`;
    const v1 = await req(visPath, { method: 'POST', cookie: cookies.author, body: { to: 'public' } });
    if (v1.status === 404) {
      skip('3-C 가시성 API (2항목)', `POST ${visPath} 미구현`);
    } else {
      check('3-C author 의 공개 전환 → 403 FORBIDDEN (가시성도 reviewer 부터)',
        v1.status === 403 && v1.code === 'FORBIDDEN', `${v1.status} ${v1.code ?? '-'}`);
      const v2 = await req(visPath, { method: 'POST', cookie: cookies.reviewer, body: { to: 'public' } });
      const sv = await statusOf(walker.id);
      check('3-C reviewer published → public 200 · DB 가 실제로 public',
        v2.status === 200 && sv.visibility === 'public', `${v2.status} db=${sv.visibility}`);
    }
  }
} finally {
  // 정리 — 콘텐츠 먼저, 계정 나중.
  // content_items.created_by 는 ON DELETE SET NULL 이라 계정만 지우면 픽스처 콘텐츠가 고아로
  // 남아 다음 실행의 무회귀 기준선을 오염시킨다. topic_contents·lesson_items·lesson_details·
  // user_lesson_attempts·content_audit_log 는 content_id FK 가 CASCADE 라 함께 사라진다.
  await pool.query(`DELETE FROM content_items WHERE slug LIKE $1`, [`${TAG}%`]);
  await pool.query(`DELETE FROM topics WHERE slug LIKE $1`, [`${TAG}%`]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}%`]);
  await pool.end().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`
  + `${failed.length ? ` · 실패 ${failed.length}` : ''}${skipped ? ` · 스킵 ${skipped}` : ''}`);
if (failed.length) console.log(failed.map((r) => `  ✖ ${r.name}`).join('\n'));
if (config.devAutologin) {
  console.log('참고: DEV_AUTOLOGIN=1 — 쿠키 없는 요청에는 X-Jina-No-Autologin 을 붙였다(dev 세션은 admin).');
}
process.exitCode = failed.length ? 1 : 0;
