// 보안 강화 검증 (docs/plan/10.5-security-hardening.md §4)
//
// 플랜 10.5 가 닫으려는 구멍이 실제로 닫혔는지 **행동으로** 확인한다 — 표의 라인 번호가 아니라
// 요청을 보내고 상태코드·부작용 0 을 단정한다.
//
//  S1 사이드카 관리 라우트(시작·중지)가 관리자 전용인가.
//     learner 쿠키 → 403 FORBIDDEN 이고 lib/pronounce/.sidecar.pid 가 **새로 생기지 않아야** 한다.
//     admin 쿠키 → 권한은 통과해야 한다. 미설치면 409 CONFLICT 가 정답이다(그것이 "권한은 지났다"는 증거).
//     설치(install)는 부르지 않는다 — 방어가 없을 때 2.4GB 다운로드가 시작되어 검증이 사고가 된다.
//  S2 SSRF — 본문의 ollamaUrl 을 서버가 fetch 대상 주소로 쓰지 않는가.
//     공격자 리스너를 로컬에 띄우고 AI 라우트 5곳에 그 주소를 실어 보낸 뒤 **리스너 히트 0건**을 단정한다.
//     ★ AI provider 가 없어도 통과해야 한다. Ollama 미기동이면 503 이 정상이고, 이 항목이 보는 것은
//       "응답이 성공했는가"가 아니라 "공격자 주소로 아무것도 나가지 않았는가"다. 다만 라우트가 400/404 로
//       일찍 튕기면 검증이 공허해지므로 "최소 1개 라우트가 AI 계층까지 도달했다"를 함께 단정한다.
//  S3 GET /api/ai/health 인증 — 쿠키 없으면 401, 비관리자의 ?force=1 은 무시되어 checkedAt 이 그대로여야 한다.
//  S4 정적 서버가 경로를 **정규화한 뒤** deny 검사하는가. raw path(`..`·백슬래시·%2e%2e)로 403,
//     정상 자원 5개는 200(회귀). fetch 는 `..` 을 미리 접어버리므로 node:http 로 경로를 그대로 보낸다.
//  S5 정적 응답에 `Access-Control-Allow-Origin: *` 가 남아 있지 않은가.
//  S6 로그인 레이트리밋 키에 클라이언트 IP 가 살아 있는가.
//     반드시 **정적 서버(프록시) 경유**로 때린다 — API 에 직접 붙으면 프록시가 붙이는 X-Forwarded-For 가 없다.
//
// 전제: `npm run dev`(정적 3003 + API 3004)가 떠 있어야 한다. 대상은 E2E_BASE/E2E_API 로 바꾼다.
// 부작용: learner 계정 1개를 DB 에 직접 만들고(scripts/e2e-admin-users.mjs 선례) finally 에서 지운다.
//        users 를 참조하는 FK 가 전부 ON DELETE CASCADE 라 세션·회화·단어카드까지 함께 사라진다.
//        DB_DRIVER=pglite + 파일 DB 면 API 서버가 그 디렉터리를 잠그고 있어 이 스크립트가 뜨지 않는다(pg 로 검증).
// 실행: node scripts/verify-security.mjs
import http from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../api/config.js';
import { pool } from '../api/lib/pool.js';
import { hashPassword } from '../api/services/password.js';

const BASE = process.env.E2E_BASE || `http://localhost:${process.env.PORT || 3003}`;
const API = process.env.E2E_API || `http://localhost:${process.env.API_PORT || 3004}`;
// SSRF 리스너 기본 포트. 이미 쓰이고 있으면 임의 포트로 물러난다(검증 자체는 계속돼야 한다).
const SSRF_PORT = Number(process.env.VERIFY_SSRF_PORT) || 14993;
// AI 라우트는 성공하면 최대 30분을 문다(ask.js HTTP_BUDGET_MS). 우리가 볼 것은 리스너 히트뿐이라
// 짧게 끊는다 — 끊긴 요청은 서버가 CLI 까지 죽인다(라우트의 res.on('close') → abort).
const AI_TIMEOUT_MS = 8000;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PID_FILE = path.join(REPO_ROOT, 'lib', 'pronounce', '.sidecar.pid');

const TAG = `verify-sec-${Date.now()}`;
const LEARNER_EMAIL = `${TAG}-learner@test.dev`;
const LEARNER_PASS = 'verify-sec-1234';
// S6 전용 — 실패 경로만 필요하므로 존재하지 않는 계정을 쓴다. 레이트리밋은 인메모리 1분 창이라
// 이 이메일은 검증 후 1분간 막힌다. 실계정에 그 부작용을 남기지 않으려고 매 실행 새 주소를 만든다.
const RL_EMAIL = `${TAG}-ratelimit@test.dev`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};
let skipped = 0;
const skip = (name, why) => { skipped += 1; console.log(`– ${name} (스킵: ${why})`); };

// ── HTTP 헬퍼 ────────────────────────────────────────────────
// 변경 요청은 X-Requested-With: jina 가 없으면 403(api/lib/cors.js requireCsrfHeader).
// 쿠키를 주지 않으면 X-Jina-No-Autologin 을 자동으로 붙인다 — DEV_AUTOLOGIN=1 이면 쿠키 없는 요청에
// dev 세션이 발급되고 그 계정은 **admin** 이다(db/seeds/dev.mjs). 그걸 모르고 "쿠키 없음 = 익명"으로
// 단정하면 권한 검증이 통째로 거짓 통과한다.
async function req(pathname, { base = API, method = 'GET', cookie, body, headers = {}, timeoutMs = 15_000 } = {}) {
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
    const res = await fetch(`${base}${pathname}`, init);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, resHeaders: res.headers, ...data };
  } catch (err) {
    const aborted = err?.name === 'AbortError' || err?.name === 'TimeoutError';
    return { status: 0, aborted, error: String(err?.message || err) };
  }
}

// URL 파서를 거치지 않고 요청 라인에 경로를 **그대로** 싣는다 — `curl --path-as-is` 상당.
// fetch/URL 은 `/x/../a` 를 `/a` 로 접어버려서 S4 를 검증할 수 없다.
function rawRequest(base, rawPath, { method = 'GET' } = {}) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const r = http.request({ host: u.hostname, port: u.port, path: rawPath, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    r.on('error', reject);
    r.setTimeout(10_000, () => r.destroy(new Error('timeout')));
    r.end();
  });
}

// keep-alive 로 살아 있는 소켓이 있으면 close 콜백이 영원히 오지 않는다 — 먼저 끊는다.
async function closeServer(srv) {
  srv.closeAllConnections?.();
  await new Promise((resolve) => srv.close(resolve));
}

async function loginCookie(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ') || null;
}

// ── 준비 ─────────────────────────────────────────────────────
const alive = await req('/api/health');
if (alive.status !== 200) {
  console.error(`✖ ${API} 에 연결할 수 없습니다 (status=${alive.status} ${alive.error || ''}) — npm run dev 를 먼저 실행하세요.`);
  process.exit(1);
}

// learner 계정은 스크립트가 직접 만든다.
// db/seeds/dev.mjs 가 dev 계정에 role='admin' 을 주므로 **DEV_AUTOLOGIN 세션은 admin 이다** —
// 권한 경계 검증에 자동로그인 쿠키를 쓰면 403 이 나올 리가 없어 검증이 통째로 무의미해진다.
const passwordHash = await hashPassword(LEARNER_PASS);
const { rows: [learner] } = await pool.query(
  `INSERT INTO users (email, display_name, password_hash, role, is_admin)
   VALUES ($1, $2, $3, 'learner', false)
   RETURNING id, email, role`,
  [LEARNER_EMAIL, 'VerifySec', passwordHash],
);

let listener = null;
try {
  const learnerCookie = await loginCookie(LEARNER_EMAIL, LEARNER_PASS);
  check('준비: learner 계정 생성·로그인 (role=learner)',
    learner.role === 'learner' && Boolean(learnerCookie), `${learner.email} #${learner.id}`);
  const adminCookie = await loginCookie(config.admin.email, config.admin.password);
  check('준비: admin 로그인 (.env ADMIN_EMAIL/ADMIN_PASSWORD)',
    Boolean(adminCookie), adminCookie ? config.admin.email : `${config.admin.email} 로그인 실패`);
  const me = await req('/api/auth/me', { cookie: learnerCookie });
  check('준비: learner 세션이 실제로 비관리자',
    me.status === 200 && me.user?.role === 'learner' && me.user?.is_admin === false && me.user?.can_admin === false,
    `role=${me.user?.role} is_admin=${me.user?.is_admin}`);

  // ── S1 사이드카 관리 = 관리자 전용 ────────────────────────
  console.log('\n[S1] 사이드카 관리 라우트 권한');
  const pidBefore = existsSync(PID_FILE);
  const s1Start = await req('/api/speaking/sidecar/start', { method: 'POST', cookie: learnerCookie, body: {} });
  check('S1 learner POST /api/speaking/sidecar/start → 403 FORBIDDEN',
    s1Start.status === 403 && s1Start.code === 'FORBIDDEN', `${s1Start.status} ${s1Start.code ?? '-'}`);
  const pidAfter = existsSync(PID_FILE);
  check('S1 learner 요청으로 .sidecar.pid 가 새로 생기지 않음',
    !(!pidBefore && pidAfter), `before=${pidBefore} after=${pidAfter}`);
  const s1Stop = await req('/api/speaking/sidecar/stop', { method: 'POST', cookie: learnerCookie, body: {} });
  check('S1 learner POST /api/speaking/sidecar/stop → 403 FORBIDDEN',
    s1Stop.status === 403 && s1Stop.code === 'FORBIDDEN', `${s1Stop.status} ${s1Stop.code ?? '-'}`);
  skip('S1 learner install', '방어가 없으면 pip 설치(2.4GB)가 실제로 시작된다 — 부작용이 커서 부르지 않는다');

  if (!adminCookie) {
    skip('S1 admin 권한 통과', 'admin 로그인 실패 (.env ADMIN_* 확인)');
  } else {
    const s1Admin = await req('/api/speaking/sidecar/start', { method: 'POST', cookie: adminCookie, body: {} });
    // 미설치 409 CONFLICT · 설치돼 있으면 200 · production 이면 403 READONLY(권한이 아니라 장소 문제).
    // 어느 쪽이든 "403 FORBIDDEN 이 아니다"가 권한을 통과했다는 증거다.
    check('S1 admin 같은 요청은 권한 통과 (403 FORBIDDEN 아님 — 미설치면 409 CONFLICT)',
      !(s1Admin.status === 403 && s1Admin.code === 'FORBIDDEN'),
      `${s1Admin.status} ${s1Admin.code ?? (s1Admin.started ? 'started' : 'ok')}`);
    // 우리가 띄운 것만 정리한다 — 이미 돌고 있던 사이드카(started:false)는 개발자 것이므로 건드리지 않는다.
    if (s1Admin.status === 200 && s1Admin.started === true) {
      const stopped = await req('/api/speaking/sidecar/stop', { method: 'POST', cookie: adminCookie, body: {} });
      console.log(`  정리: 검증이 띄운 사이드카 중지 (stopped=${stopped.stopped})`);
    }
  }

  // ── S2 SSRF — 클라이언트 ollamaUrl 을 서버가 쓰지 않는다 ──
  console.log('\n[S2] 클라이언트 ollamaUrl → 서버측 요청(SSRF)');
  const hits = [];
  listener = http.createServer((r, res) => {
    hits.push(`${r.method} ${r.url}`);
    // 서버가 여기까지 왔다면 Ollama 처럼 대답해 준다 — 그래야 "실패해서 안 온 것"과 구분된다.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'ssrf', message: { role: 'assistant', content: '{}' }, done: true }));
  });
  let ssrfPort = SSRF_PORT;
  try {
    await new Promise((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(SSRF_PORT, '127.0.0.1', resolve);
    });
  } catch {
    listener.removeAllListeners('error');
    await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
    ssrfPort = listener.address().port;
    console.log(`  ${SSRF_PORT} 사용 중 — 임의 포트 ${ssrfPort} 로 대체`);
  }
  const EVIL = `http://127.0.0.1:${ssrfPort}`;
  const ai = (extra) => ({ provider: 'ollama', ollamaUrl: EVIL, ...extra });

  const ssrfTargets = [];
  ssrfTargets.push({
    name: 'POST /api/ai/chat',
    send: () => req('/api/ai/chat', {
      method: 'POST', cookie: learnerCookie, timeoutMs: AI_TIMEOUT_MS,
      body: ai({ userMessage: 'hello' }),
    }),
  });
  const convo = await req('/api/conversations', {
    method: 'POST', cookie: learnerCookie, body: { title: 'verify-security' },
  });
  const sessionId = convo.session?.id ?? null;
  if (sessionId) {
    ssrfTargets.push({
      name: 'POST /api/conversations/:id/messages',
      send: () => req(`/api/conversations/${sessionId}/messages`, {
        method: 'POST', cookie: learnerCookie, timeoutMs: AI_TIMEOUT_MS,
        body: ai({ text: 'hello' }),
      }),
    });
  }
  const lessonList = await req('/api/lessons', { cookie: learnerCookie });
  const lessonId = lessonList.lessons?.[0]?.id ?? null;
  if (lessonId) {
    ssrfTargets.push({
      name: 'POST /api/lessons/:id/qa',
      send: () => req(`/api/lessons/${lessonId}/qa`, {
        method: 'POST', cookie: learnerCookie, timeoutMs: AI_TIMEOUT_MS,
        body: ai({ question: 'What is this passage about?' }),
      }),
    });
  }
  ssrfTargets.push({
    name: 'POST /api/vocab/add',
    // 사전에 없는 단어라야 AI 경로로 들어간다(있으면 CLI 를 건너뛴다).
    send: () => req('/api/vocab/add', {
      method: 'POST', cookie: learnerCookie, timeoutMs: AI_TIMEOUT_MS,
      body: ai({ word: 'zzverifysecurityword' }),
    }),
  });
  ssrfTargets.push({
    name: 'POST /api/vocab/quiz',
    send: () => req('/api/vocab/quiz', {
      method: 'POST', cookie: learnerCookie, timeoutMs: AI_TIMEOUT_MS,
      body: ai({ kind: 'random' }),
    }),
  });
  if (!sessionId) skip('S2 POST /api/conversations/:id/messages', `세션 생성 실패 (${convo.status} ${convo.code ?? ''})`);
  if (!lessonId) skip('S2 POST /api/lessons/:id/qa', '레슨이 하나도 없음 — npm run db:seed:content');

  // AI 계층까지 갔다는 신호: 200 · 5xx(provider 다운 등) · 우리가 끊음(abort). 400/403/404 는 그 앞에서 튕긴 것.
  const reachedAi = (r) => r.aborted === true || r.status === 200 || r.status >= 500;
  let reachedCount = 0;
  for (const target of ssrfTargets) {
    const r = await target.send();
    if (reachedAi(r)) reachedCount += 1;
    console.log(`  ${target.name} → ${r.aborted ? `abort(${AI_TIMEOUT_MS}ms)` : `${r.status} ${r.code ?? 'ok'}`}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500)); // 늦게 도착하는 히트까지 받아본다
  check(`S2 공격자 리스너 히트 0건 (${ssrfTargets.length}개 라우트 · ${EVIL})`,
    hits.length === 0, hits.length ? hits.slice(0, 3).join(' | ') : '히트 없음');
  check('S2 최소 1개 라우트가 실제로 AI 계층까지 도달 (검증이 공허하지 않다는 증거)',
    reachedCount >= 1, `${reachedCount}/${ssrfTargets.length}`);
  await closeServer(listener);
  listener = null;

  // ── S3 /api/ai/health 인증 · force 는 관리자만 ─────────────
  console.log('\n[S3] GET /api/ai/health 인증 · force');
  const anon = await req('/api/ai/health?force=1', { headers: { 'X-Jina-No-Autologin': '1' } });
  check('S3 쿠키 없이(X-Jina-No-Autologin) /api/ai/health?force=1 → 401',
    anon.status === 401 && anon.code === 'UNAUTHORIZED', `${anon.status} ${anon.code ?? '-'}`);
  const h1 = await req('/api/ai/health?force=1', { cookie: learnerCookie });
  const h2 = await req('/api/ai/health?force=1', { cookie: learnerCookie });
  check('S3 learner 는 health 읽기 가능 (200)', h1.status === 200 && h2.status === 200,
    `${h1.status}/${h2.status}`);
  check('S3 비관리자의 force=1 은 무시 — 연속 2회 checkedAt 동일 (프로브 강제 없음)',
    Number.isFinite(h1.checkedAt) && h1.checkedAt === h2.checkedAt,
    `${h1.checkedAt} vs ${h2.checkedAt}`);

  // ── S4 정적 서버 경로 정규화 후 deny ──────────────────────
  console.log('\n[S4] 정적 서버 경로 정규화');
  const denied = [
    ['/x/../api/config.js', 'path.join 이 접은 뒤 서버 소스가 노출되던 경로'],
    ['/api\\config.js', '백슬래시 — 윈도우 경로 구분자'],
    ['/%2e%2e/api/config.js', '퍼센트 인코딩된 ..'],
    ['/x/../.git/config', '루트 점 디렉터리'],
  ];
  for (const [raw, why] of denied) {
    let r;
    try { r = await rawRequest(BASE, raw); } catch (e) { r = { status: 0, body: String(e.message) }; }
    check(`S4 raw path ${raw} → 403 (${why})`, r.status === 403, `${r.status}`);
  }
  const allowed = ['/index.html', '/canvas.html', '/admin.html', '/src/main.jsx', '/config.js'];
  for (const p of allowed) {
    let r;
    try { r = await rawRequest(BASE, p); } catch (e) { r = { status: 0, body: String(e.message) }; }
    check(`S4 회귀 ${p} → 200`, r.status === 200 && r.body.length > 0, `${r.status} ${r.body.length}B`);
  }

  // ── S5 정적 응답의 CORS 전면 개방 제거 ────────────────────
  console.log('\n[S5] 정적 응답 CORS');
  const idx = await rawRequest(BASE, '/index.html');
  check('S5 GET /index.html 에 access-control-allow-origin 헤더 부재',
    idx.headers['access-control-allow-origin'] === undefined,
    idx.headers['access-control-allow-origin'] ?? '(없음)');

  // ── S6 레이트리밋 키에 클라이언트 IP ──────────────────────
  // 반드시 마지막에 둔다 — 인메모리 1분 창이라 여기서 쓴 이메일은 1분간 막힌다.
  //
  // 두 "클라이언트"를 만드는 방법이 핵심이다. 플랜 §5 대로 프록시가 X-Forwarded-For 를 **덮어쓰면**
  // 우리가 보낸 헤더 값은 버려지고 소켓 주소가 실린다. 그래서 헤더 값만 바꾸는 것으로는 부족하고,
  // 같은 루프백의 서로 다른 주소(127.0.0.1 · ::1)로 붙어 소켓 주소 자체를 다르게 만든다.
  //  - 프록시가 덮어쓰는 구현: XFF 가 127.0.0.1 vs ::1 로 갈린다.
  //  - 클라이언트 XFF 를 그대로 흘리는 구현: 아래 헤더 값 두 개로 갈린다.
  //  - 수정 전(XFF 없음): 둘 다 127.0.0.1 → 두 번째 클라이언트가 429 → 이 항목이 실패한다(의도된 탐지).
  console.log('\n[S6] 로그인 레이트리밋 · 클라이언트 IP (프록시 경유)');
  const staticPort = new URL(BASE).port || '80';
  const V4 = `http://127.0.0.1:${staticPort}`;
  const V6 = `http://[::1]:${staticPort}`;
  const failLogin = (base, xff) => req('/api/auth/login', {
    base, method: 'POST',
    headers: { 'X-Forwarded-For': xff },
    body: { email: RL_EMAIL, password: 'wrong-password-for-verify' },
  });

  const codes = [];
  for (let i = 0; i < 11; i += 1) codes.push((await failLogin(V4, '203.0.113.10')).status);
  check('S6 프록시 경유 실패 로그인 10회까지 401',
    codes.slice(0, 10).every((s) => s === 401), codes.slice(0, 10).join(','));
  check('S6 11회째 429 (레이트리밋 동작)', codes[10] === 429, String(codes[10]));

  let v6ok = false;
  try { v6ok = (await rawRequest(V6, '/index.html')).status === 200; } catch { v6ok = false; }
  if (!v6ok) {
    skip('S6 다른 클라이언트 IP 는 별도 카운터', `${V6} 에 붙을 수 없음 (IPv6 루프백 미지원)`);
  } else {
    const other = await failLogin(V6, '203.0.113.20');
    check('S6 다른 클라이언트 IP 의 첫 실패는 401 (키에 IP 가 살아 있음 — 429 면 IP 축이 죽은 것)',
      other.status === 401, `${other.status} ${other.code ?? '-'}`);
  }
} finally {
  if (listener) await closeServer(listener);
  // 정리 — learner 계정과 그에 딸린 모든 것(세션·회화·단어카드는 ON DELETE CASCADE).
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}%`]);
  await pool.end().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n총 ${results.length}개 중 ${results.length - failed.length}개 통과`
  + `${failed.length ? ` · 실패 ${failed.length}` : ''}${skipped ? ` · 스킵 ${skipped}` : ''}`);
if (failed.length) console.log(failed.map((r) => `  ✖ ${r.name}`).join('\n'));
process.exitCode = failed.length ? 1 : 0;
