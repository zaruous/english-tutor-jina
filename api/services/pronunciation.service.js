// 발음 평가 서비스 — 어댑터 선택 + 응답 정규화 (플랜 10 §5·§6 Phase 1).
// AI_PROVIDER 가 CLI 프로바이더를 고르는 것과 같은 패턴: 백엔드 2개(openpronounce · speechace) 중
// 설정된 것을 쓰고, 아무것도 없으면 { available: false } — 미설정이 정상 상태다(503 아님).
// 사이드카가 꺼져 있는 것도 버그가 아니다 → 화면은 v1 받아쓰기 모드로 폴백한다.
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { normalizeOpenPronounce, normalizeSpeechace } from './pronunciation-normalize.js';

const pron = config.pronunciation;

// ── 백엔드 선택 ────────────────────────────────────────────────
// PRONUNCIATION_BACKEND 로 못 박을 수 있고, 없으면 설정된 순서(로컬 사이드카 우선)로 고른다.
function pickBackend() {
  if (pron.backend) return pron.backend;
  if (pron.url) return 'openpronounce';
  if (pron.speechaceKey) return 'speechace';
  return null;
}

// ── 사이드카 헬스 캐시 ─────────────────────────────────────────
// 화면이 모드 배지를 그릴 때마다 사이드카를 두드리지 않도록 30초 캐시. /health 는 모델을 건드리지 않아
// "떠 있음"만 알려준다 — 첫 평가는 그래도 체크포인트 다운로드로 느릴 수 있다(lib/pronounce/README).
const HEALTH_TTL_MS = 30_000;
let health = { at: 0, ok: null, detail: null };

async function sidecarHealth({ force = false } = {}) {
  if (!force && health.ok !== null && Date.now() - health.at < HEALTH_TTL_MS) return health;
  try {
    const res = await fetch(`${pron.url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(3000) });
    const body = res.ok ? await res.json().catch(() => ({})) : {};
    health = { at: Date.now(), ok: res.ok && body.ok !== false, detail: res.ok ? (body.tts ? `tts=${body.tts}` : 'ok') : `HTTP ${res.status}` };
  } catch (err) {
    health = { at: Date.now(), ok: false, detail: err.message };
  }
  return health;
}

// 현재 모드 — 화면 배지·verify 스크립트가 본다. { available, backend, detail }
export async function assessStatus() {
  const backend = pickBackend();
  if (!backend) return { available: false, backend: null, detail: 'PRONUNCIATION_URL 또는 SPEECHACE_KEY 미설정' };
  if (backend === 'openpronounce') {
    if (!pron.url) return { available: false, backend, detail: 'PRONUNCIATION_URL 미설정' };
    const h = await sidecarHealth();
    return { available: Boolean(h.ok), backend, detail: h.detail };
  }
  if (backend === 'speechace') {
    return pron.speechaceKey
      ? { available: true, backend, detail: `dialect=${pron.speechaceDialect}` }
      : { available: false, backend, detail: 'SPEECHACE_KEY 미설정' };
  }
  return { available: false, backend, detail: `알 수 없는 백엔드: ${backend}` };
}

// ── 어댑터 ─────────────────────────────────────────────────────
// 둘 다 (audio: Buffer, mime, filename, referenceText) → 공통 계약 | { available:false, reason }.
// 연결 실패·한도 초과는 폴백 신호(available:false)로, 백엔드가 살아 있는데 이상한 응답을 주면 502 로 구분한다.

async function assessOpenPronounce({ audio, mime, filename, referenceText }) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mime }), filename);
  form.append('expected_text', referenceText);
  form.append('lang', 'en');
  let res;
  try {
    res = await fetch(`${pron.url.replace(/\/$/, '')}/pronunciation`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(pron.timeoutMs),
    });
  } catch (err) {
    health = { at: Date.now(), ok: false, detail: err.message }; // 다음 status 조회가 바로 폴백을 알린다
    return { available: false, reason: err.name === 'TimeoutError' ? 'timeout' : 'unreachable', detail: err.message };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 400/413 은 우리 입력 문제 — 그대로 전달. 5xx 는 사이드카 내부 실패(모델 로딩 등) → 502.
    if (res.status === 400 || res.status === 413) throw new HttpError(res.status, 'BAD_REQUEST', `사이드카: ${text.slice(0, 200)}`);
    throw new HttpError(502, 'CLI_FAILED', `발음 평가 사이드카 ${res.status}: ${text.slice(0, 200)}`, { provider: 'openpronounce' });
  }
  const raw = await res.json();
  return { available: true, ...normalizeOpenPronounce(raw, referenceText) };
}

// ⚠ Speechace 계약(URL·필드명)은 공개 문서 기억으로 썼고 실호출로 확인하지 못했다 —
//   verify-pronunciation.mjs 가 첫 검증이다. 하루 5회 무료 한도(플랜 10 §3.2)를 넘기면 폴백 신호로 내린다.
async function assessSpeechace({ audio, mime, filename, referenceText, userId }) {
  const url = new URL('/api/scoring/text/v9/json', pron.speechaceUrl);
  url.searchParams.set('key', pron.speechaceKey);
  url.searchParams.set('dialect', pron.speechaceDialect);
  url.searchParams.set('user_id', String(userId ?? 'jina'));
  url.searchParams.set('include_fluency', '1');
  const form = new FormData();
  form.append('text', referenceText);
  form.append('user_audio_file', new Blob([audio], { type: mime }), filename);
  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(pron.timeoutMs) });
  } catch (err) {
    return { available: false, reason: err.name === 'TimeoutError' ? 'timeout' : 'unreachable', detail: err.message };
  }
  if (res.status === 429) return { available: false, reason: 'quota', detail: 'Speechace 일일 한도 초과' };
  const raw = await res.json().catch(() => null);
  if (!res.ok || !raw) {
    throw new HttpError(502, 'CLI_FAILED', `Speechace ${res.status}`, { provider: 'speechace' });
  }
  if (raw.status !== 'success') {
    const msg = `${raw.short_message || ''} ${raw.detail_message || ''}`.trim();
    if (/quota|limit|exceed/i.test(msg)) return { available: false, reason: 'quota', detail: msg };
    throw new HttpError(502, 'CLI_FAILED', `Speechace: ${msg.slice(0, 200) || raw.status}`, { provider: 'speechace' });
  }
  return { available: true, ...normalizeSpeechace(raw) };
}

// 라우트가 부르는 진입점. 오디오는 여기서 메모리로만 다루고 저장하지 않는다(플랜 10 §5-2).
export async function assess({ audio, mime, filename, referenceText, userId }) {
  const status = await assessStatus();
  if (!status.available) return { available: false, backend: status.backend, reason: 'unconfigured', detail: status.detail };
  const args = { audio, mime, filename, referenceText, userId };
  return status.backend === 'speechace' ? assessSpeechace(args) : assessOpenPronounce(args);
}
