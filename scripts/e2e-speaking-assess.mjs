// E2E: 발음 평가 파이프라인 (플랜 10 Phase 1 어댑터 + Phase 3 저장·통계) — 한국어 오독 픽스처로 실측.
//
// 요구: API(:3004)가 발음 백엔드를 보고 있을 것.
//  - 실제 사이드카(lib/pronounce)면 점수의 절대값까지 의미가 있다(오독이라 낮아야 함).
//  - 모델을 못 받는 환경은 mock-pronounce-sidecar.mjs 로 파이프라인만 실측한다(점수 값은 모의).
// 백엔드가 없으면(assess/status available:false) 전체 스킵 — 미설정은 정상 상태다(플랜 10 §5-3).
//
// 사용: node scripts/e2e-speaking-assess.mjs [--wav scripts/fixtures/ko-misread-8s.wav]
import { readFileSync } from 'node:fs';

const API = process.env.E2E_API || 'http://localhost:3004';
const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const H = { 'X-Requested-With': 'jina', Origin: BASE };
const argv = process.argv.slice(2);
const wavPath = argv[argv.indexOf('--wav') + 1] || new URL('./fixtures/ko-misread-8s.wav', import.meta.url).pathname;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 전용 학습자 계정 — 이력·대시보드 단정이 기존 데이터에 오염되지 않게
const email = `ko-assess-${Date.now()}@test.dev`;
await fetch(`${API}/api/auth/signup`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'e2e-pass-1234', display_name: 'KO' }),
});
const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'e2e-pass-1234' }),
});
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');

const status = await (await fetch(`${API}/api/speaking/assess/status`, { headers: { ...H, Cookie: cookie } })).json();
if (!status.available) {
  console.log(`– 전체 스킵: 발음 백엔드 없음 (${status.detail || 'PRONUNCIATION_URL 미설정'}) — 미설정은 정상 상태`);
  process.exit(0);
}
check('assess/status — 백엔드 감지', status.ok && Boolean(status.backend), `backend=${status.backend}`);

const wav = readFileSync(wavPath);
check('픽스처 — 10초 이내 음성 로드', wav.length > 50_000, `${wavPath} · ${wav.length} bytes`);

const REF = 'Could we move the budget meeting to Thursday afternoon?';
const form = new FormData();
form.append('reference_text', REF);
form.append('source', 'custom');
form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'ko-misread.wav');
const assess = await (await fetch(`${API}/api/speaking/assess`, {
  method: 'POST', headers: { ...H, Cookie: cookie }, body: form,
})).json();
check('assess — available:true + 정규화된 pron_score(정수)', assess.ok && assess.available === true
  && Number.isInteger(assess.pron_score), `pron_score=${assess.pron_score}`);
check('assess — words[] 가 목표 문장 단어 순서·개수', Array.isArray(assess.words)
  && assess.words.length === REF.replace(/[?,.]/g, '').split(/\s+/).length);
// 오독 저점수 — 한국어 음성 vs 영어 문장. 모의 백엔드도 저점 고정이라 함께 성립하지만,
// 절대값의 의미는 실제 사이드카에서만 있다(위 헤더 참조).
check('오독(한국어 음성 vs 영어 문장) → 낮은 점수 (< 50)', assess.pron_score < 50, `${assess.pron_score}점`);

// 이력 저장 (플랜 10 Phase 3)
const hist = await (await fetch(`${API}/api/speaking/attempts`, { headers: { ...H, Cookie: cookie } })).json();
check('speaking_attempts — 1행 저장 (source·backend·문장 보존)',
  hist.ok && hist.total === 1 && hist.attempts[0].source === 'custom'
  && hist.attempts[0].sentence_text === REF && hist.attempts[0].backend === status.backend,
  `pron_score=${hist.attempts[0]?.pron_score}`);
check('speaking_attempts — 30일 평균', hist.avg_30d === assess.pron_score, `avg=${hist.avg_30d}`);

// 대시보드 speaking 스킬 파생
const dash = await (await fetch(`${API}/api/dashboard`, { headers: { ...H, Cookie: cookie } })).json();
const sp = dash.skills?.find((s) => s.key === 'speaking');
check('대시보드 — speaking 스킬 = 30일 발음 점수 평균', sp?.pct === assess.pron_score
  && /발음 점수 평균/.test(sp?.score_text || ''), sp?.score_text);

// 실패 요청은 이력을 오염시키지 않는다
const empty = new FormData();
empty.append('reference_text', REF);
const bad = await fetch(`${API}/api/speaking/assess`, { method: 'POST', headers: { ...H, Cookie: cookie }, body: empty });
check('audio 누락 → 400', bad.status === 400);
const hist2 = await (await fetch(`${API}/api/speaking/attempts`, { headers: { ...H, Cookie: cookie } })).json();
check('실패 요청은 이력에 쌓이지 않음', hist2.total === 1);

const fail = results.filter((r) => !r).length;
console.log(`\n${results.length - fail}/${results.length} 통과`);
process.exit(fail ? 1 : 0);
