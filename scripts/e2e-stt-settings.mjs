// E2E: 설정 → 음성 인식(STT) 모드 + 스피킹 화면의 두 모드 (플랜 10 Phase 2)
//
// 사이드카(OpenPronounce)는 CI·리뷰 환경에 없으므로 /api/speaking/assess* 와 /api/speaking/sidecar/* 는
// page.route 로 모킹한다 — 이 스위트가 단정하는 것은 "서버 상태에 화면이 어떻게 반응하는가"다:
//   1. 설정 패널: 기본 browser · openpronounce 선택 시 jina_settings_v1.sttMode 저장 · 새로고침 후 유지
//   2. 사이드카 상태별 버튼: 미설치 → [서버에 설치] · 설치됨/꺼짐 → [시작] · 켜짐 → [중지] · production → 안내만
//   3. 설치 버튼 → POST /api/speaking/sidecar/install 호출 · 설치 중 로그 꼬리 렌더
//   4. 스피킹: openpronounce + 사이드카 연결 → MediaRecorder(모킹) 녹음 → assess 응답으로 발음 점수·단어 색·IPA 힌트
//   5. 스피킹: openpronounce 인데 사이드카 다운 → 받아쓰기 폴백 배지 + 기존 STT 경로
//   6. 스피킹: browser 모드 — disclaimer 문구 + STT(모킹) 채점·3색·중복 채점 없음 (플랜 08 Phase C 회귀)
// 사용: `npm run dev` 상태에서 `node scripts/e2e-stt-settings.mjs`. E2E_BASE / E2E_API 로 대상 지정.
import { chromium } from 'playwright';
import { launchOptions, routeCdn } from './e2e-env.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:3003';
const API = process.env.E2E_API || 'http://localhost:3004';
const BOOT_MS = Number(process.env.E2E_BOOT_MS || 9000);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 서버 상태 시나리오 (모킹 응답) ─────────────────────────────
const sidecarBase = { can_manage: true, platform: 'linux', installed: false, pid: null, espeak_library: null, install: { state: 'idle', log_tail: [] } };
const scenarios = {
  notInstalled: { ok: true, available: false, backend: 'openpronounce', detail: '사이드카 미설치 (설정 → 음성 인식에서 설치)', url: 'http://localhost:8000', sidecar: { ...sidecarBase } },
  installing:   { ok: true, available: false, backend: 'openpronounce', detail: '설치 진행 중', url: 'http://localhost:8000', sidecar: { ...sidecarBase, install: { state: 'installing', started_at: Date.now(), log_tail: ['$ bash install-python.sh', '  Python 3.11 (python3)', '  torch (CPU 휠) 설치 중… 수백 MB 라 몇 분 걸립니다'] } } },
  stopped:      { ok: true, available: false, backend: 'openpronounce', detail: '사이드카 꺼져 있음 (설정 → 음성 인식에서 시작)', url: 'http://localhost:8000', sidecar: { ...sidecarBase, installed: true } },
  running:      { ok: true, available: true, backend: 'openpronounce', detail: 'tts=piper', url: 'http://localhost:8000', sidecar: { ...sidecarBase, installed: true, pid: 4242 } },
  production:   { ok: true, available: false, backend: 'openpronounce', detail: '사이드카 미설치', url: 'http://localhost:8000', sidecar: { ...sidecarBase, can_manage: false } },
};
// 정규화 계약 그대로의 평가 응답 — vendor 가 틀린 단어
const assessOk = {
  ok: true, available: true, backend: 'openpronounce', pron_score: 71, accuracy: 71, fluency: null, completeness: 90, prosody: null,
  transcript: 'I WOULD RECOMMEND THE NEW BENDER BECAUSE THEIR PRICING IS MORE COMPETITIVE',
  words: [],
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/net::|404|favicon/.test(m.text())) errors.push(m.text()); });
await routeCdn(page);

// 모킹 스위치 — 테스트 중 시나리오를 바꾼다
let scenario = 'notInstalled';
const calls = { install: 0, start: 0, stop: 0, assess: 0 };
await page.route(`${API}/api/speaking/assess/status**`, (route) => route.fulfill({ json: scenarios[scenario] }));
await page.route(`${API}/api/speaking/sidecar/**`, (route) => {
  const what = route.request().url().split('/').pop();
  calls[what] = (calls[what] || 0) + 1;
  if (what === 'install') scenario = 'installing';
  if (what === 'start') scenario = 'running';
  if (what === 'stop') scenario = 'stopped';
  return route.fulfill({ status: what === 'install' ? 202 : 200, json: { ok: true } });
});
await page.route(`${API}/api/speaking/assess`, async (route) => {
  calls.assess += 1;
  const body = route.request().postDataBuffer()?.toString('latin1') || '';
  const m = /name="reference_text"\r\n\r\n([^\r]+)/.exec(body);
  const text = m ? m[1] : '';
  const hasAudio = /name="audio"; filename="clip\.(webm|m4a)"/.test(body);
  const words = text.replace(/[."]/g, '').split(/\s+/).filter(Boolean).map((w, i) => (
    i === 5 ? { word: w, score: 38, expected_ipa: 'vɛndɚ', heard_ipa: 'bɛndɚ', phonemes: [] }
      : i === 8 ? { word: w, score: 72, expected_ipa: null, heard_ipa: null, phonemes: [] }
        : { word: w, score: 100, expected_ipa: null, heard_ipa: null, phonemes: [] }));
  if (!hasAudio) return route.fulfill({ status: 400, json: { ok: false, code: 'BAD_REQUEST', error: 'audio 파일이 필요합니다.' } });
  return route.fulfill({ json: { ...assessOk, reference_text: text, words } });
});

// MediaRecorder · getUserMedia 모킹 — 실 마이크가 없다. stop() 뒤에 dataavailable → onstop 순서를 지킨다(플랜 10 §7).
await page.addInitScript(() => {
  class MockMediaRecorder {
    static isTypeSupported(t) { return t.startsWith('audio/webm'); }
    constructor(stream, opts) { this.stream = stream; this.mimeType = opts?.mimeType || 'audio/webm'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      setTimeout(() => { this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) }); setTimeout(() => this.onstop?.(), 30); }, 60);
    }
  }
  window.MediaRecorder = MockMediaRecorder;
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }, configurable: true });
  // browser 모드 회귀용 STT 모킹 — 실제 엔진처럼 stop() 뒤에 final result → onend 순서
  window.__mockSTT = { interim: '', final: '' };
  class MockSpeechRecognition {
    start() { this._live = true; setTimeout(() => { if (this._live) this.onresult?.({ results: [[{ transcript: window.__mockSTT.interim }]] }); }, 60); }
    stop() { setTimeout(() => { if (!this._live) return; this.onresult?.({ results: [[{ transcript: window.__mockSTT.final }]] }); setTimeout(() => { this._live = false; this.onend?.(); }, 40); }, 150); }
    abort() { this._live = false; setTimeout(() => this.onend?.(), 10); }
  }
  window.SpeechRecognition = MockSpeechRecognition;
});

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(BOOT_MS);
check('앱 부팅', (await page.locator('#root').innerHTML()).length > 3000);

const openSettings = async () => { await page.locator('[data-testid="user-chip"]').first().click(); await page.waitForTimeout(400); };
const closeSettings = async () => { await page.keyboard.press('Escape'); await page.mouse.click(10, 500); await page.waitForTimeout(300); };
const statusText = async () => (await page.locator('[data-testid="stt-sidecar-status"]').textContent().catch(() => '')).trim();

// ── 1) 설정 패널: 기본 browser ──
await openSettings();
check('STT 섹션 렌더 — 두 옵션', (await page.locator('[data-testid="stt-mode-browser"]').count()) === 1 && (await page.locator('[data-testid="stt-mode-openpronounce"]').count()) === 1);
check('기본 모드 = browser (사이드카 패널 숨김)', (await page.locator('[data-testid="stt-sidecar-panel"]').count()) === 0
  && (await page.evaluate(() => window.__JINA_STT_MODE)) === 'browser');

// ── 2) openpronounce 선택 → 저장 · 미설치 상태 → [서버에 설치] ──
await page.locator('[data-testid="stt-mode-openpronounce"]').click();
await page.waitForTimeout(700);
const saved = await page.evaluate(() => JSON.parse(localStorage.jina_settings_v1 || '{}').sttMode);
check('jina_settings_v1.sttMode = openpronounce', saved === 'openpronounce', String(saved));
check('미설치 → 상태 문구 + [서버에 설치]', /설치되지 않음/.test(await statusText()) && (await page.locator('[data-testid="stt-sidecar-install"]').count()) === 1, await statusText());

// ── 3) 설치 버튼 → POST install → 설치 중 로그 ──
await page.locator('[data-testid="stt-sidecar-install"]').click();
await page.waitForTimeout(900);
check('POST /api/speaking/sidecar/install 1회', calls.install === 1, String(calls.install));
check('설치 중 → 상태 문구 + 로그 꼬리 렌더', /설치 중/.test(await statusText()) && /torch/.test(await page.locator('[data-testid="stt-install-log"]').textContent().catch(() => '')), await statusText());
check('설치 중에는 설치 버튼 숨김', (await page.locator('[data-testid="stt-sidecar-install"]').count()) === 0);

// 설치 완료(꺼짐) → [시작]; 폴링(2.5s)이 새 시나리오를 집어온다
scenario = 'stopped';
await page.waitForTimeout(3200);
check('설치됨·꺼짐 → [시작] 버튼', /꺼져 있음/.test(await statusText()) && (await page.locator('[data-testid="stt-sidecar-start"]').count()) === 1, await statusText());
await page.locator('[data-testid="stt-sidecar-start"]').click();
await page.waitForTimeout(900);
check('POST start → 연결됨 + [중지] 버튼', calls.start === 1 && /연결됨/.test(await statusText()) && (await page.locator('[data-testid="stt-sidecar-stop"]').count()) === 1, await statusText());

// production 서버 → 버튼 대신 안내
scenario = 'production';
await page.locator('[data-testid="stt-sidecar-panel"] button[title="다시 확인"]').click();
await page.waitForTimeout(500);
check('can_manage=false → 설치·시작 버튼 없음 + 안내', (await page.locator('[data-testid="stt-sidecar-install"], [data-testid="stt-sidecar-start"], [data-testid="stt-sidecar-stop"]').count()) === 0
  && /production/.test(await page.locator('[data-testid="stt-sidecar-panel"]').textContent()));

// ── 새로고침 후 모드 유지 ──
scenario = 'running';
await closeSettings();
await page.reload();
await page.waitForTimeout(BOOT_MS);
check('새로고침 후 sttMode 유지', (await page.evaluate(() => window.__JINA_STT_MODE)) === 'openpronounce');

// ── 4) 스피킹 — 발음 평가 모드 ──
const nav = page.locator('aside[aria-label="주요 메뉴"]');
await nav.locator('button', { hasText: '스피킹 연습' }).click();
await page.waitForTimeout(1500);
check('스피킹 배지 = 발음 평가 (OpenPronounce)', /발음 평가/.test(await page.locator('[data-testid="speaking-mode-badge"]').textContent()) && (await page.locator('[data-testid="speaking-mode-fallback"]').count()) === 0);
check('발음 평가 모드 disclaimer (캘리브레이션 경고)', /캘리브레이션되지 않은/.test(await page.locator('[data-testid="speaking-disclaimer"]').textContent()));
await page.locator('[data-testid="speaking-record"]').click();
await page.waitForTimeout(300);
check('녹음 중 문구', /녹음 중/.test(await page.locator('main').textContent()));
await page.locator('[data-testid="speaking-record"]').click();
await page.waitForTimeout(1500);
check('POST /api/speaking/assess 1회 (multipart: reference_text + audio)', calls.assess === 1, String(calls.assess));
const score = (await page.locator('[data-testid="speaking-pron-score"]').textContent().catch(() => '')).trim();
check('발음 점수 렌더 (71)', score === '71', score);
check('단어별 3단 색 — low(vendor) 1 · mid 1 · ok 나머지',
  (await page.locator('[data-testid="speaking-word-pron-low"]').count()) === 1 && (await page.locator('[data-testid="speaking-word-pron-mid"]').count()) === 1
  && (await page.locator('[data-testid="speaking-word-pron-ok"]').count()) >= 5,
  `low ${await page.locator('[data-testid="speaking-word-pron-low"]').count()} mid ${await page.locator('[data-testid="speaking-word-pron-mid"]').count()}`);
check('힌트에 기대/들림 IPA', /vɛndɚ/.test(await page.locator('[data-testid="speaking-hint"]').textContent()) && /bɛndɚ/.test(await page.locator('[data-testid="speaking-hint"]').textContent()));
check('세션 평균 = 발음 점수 (일치율과 섞지 않음)', /발음 점수/.test(await page.locator('[data-testid="speaking-avg"]').textContent()) && /71/.test(await page.locator('[data-testid="speaking-avg"]').textContent()));
check('읽은 문장 = 1 (중복 채점 없음)', (await page.locator('[data-testid="speaking-count"]').textContent()).trim().startsWith('1'));

// ── 5) 사이드카 다운 → 폴백 배지 + 받아쓰기 경로 ──
scenario = 'stopped';
await page.locator('[data-testid="speaking-again"]').click();
// 모드 재확인은 sttMode 변화에만 반응한다 → 설정에서 browser→openpronounce 로 토글해 재조회를 유발
await openSettings();
await page.locator('[data-testid="stt-mode-browser"]').click();
await page.waitForTimeout(200);
await page.locator('[data-testid="stt-mode-openpronounce"]').click();
await page.waitForTimeout(600);
await closeSettings();
check('사이드카 다운 → 폴백 안내 + 받아쓰기 배지', (await page.locator('[data-testid="speaking-mode-fallback"]').count()) === 1
  && /받아쓰기/.test(await page.locator('[data-testid="speaking-mode-badge"]').textContent()));
check('폴백 상태의 disclaimer = 받아쓰기 문구(발음 점수 아님)', /발음 점수가 아닙니다/.test(await page.locator('[data-testid="speaking-disclaimer"]').textContent()));

// ── 6) browser 모드 회귀 ──
await openSettings();
await page.locator('[data-testid="stt-mode-browser"]').click();
await page.waitForTimeout(300);
await closeSettings();
check('browser 모드 배지 + 폴백 안내 없음', /받아쓰기/.test(await page.locator('[data-testid="speaking-mode-badge"]').textContent()) && (await page.locator('[data-testid="speaking-mode-fallback"]').count()) === 0);
// browser 모드 채점 회귀 — 두 번째 단어 치환 + 마지막 단어 누락 → 일치율·3색·중복 채점 없음 (플랜 08 Phase C 단정과 동일)
const target = (await page.locator('[data-testid="speaking-sentence"]').textContent()).replace(/[."]/g, '').trim();
const tWords = target.split(/\s+/).filter(Boolean);
const heard = tWords.slice(0, -1).map((w, i) => (i === 1 ? 'zzz' : w));
await page.evaluate(([interim, final]) => { window.__mockSTT.interim = interim; window.__mockSTT.final = final; }, [tWords.slice(0, 3).join(' '), heard.join(' ')]);
await page.locator('[data-testid="speaking-record"]').click();
await page.waitForTimeout(400);
check('browser 모드: 듣는 중 중간 결과', /듣는 중/.test(await page.locator('main').textContent()));
await page.locator('[data-testid="speaking-record"]').click();
await page.waitForTimeout(1200);
const expectRate = Math.round(((tWords.length - 2) / tWords.length) * 100);
check('browser 모드: 받아쓰기 일치율 채점', (await page.locator('[data-testid="speaking-rate"]').textContent().catch(() => '')).trim() === `${expectRate}%`, `기대 ${expectRate}%`);
check('browser 모드: bad·miss 3색 + 읽은 문장 1 (중복 채점 없음)',
  (await page.locator('[data-testid="speaking-word-bad"]').count()) >= 1 && (await page.locator('[data-testid="speaking-word-miss"]').count()) >= 1
  && (await page.locator('[data-testid="speaking-count"]').textContent()).trim().startsWith('1'));
check('browser 모드 세션 평균 = 일치율 (발음 점수와 섞지 않음)', /일치율/.test(await page.locator('[data-testid="speaking-avg"]').textContent()) && new RegExp(`${expectRate}%`).test(await page.locator('[data-testid="speaking-avg"]').textContent()));
check('콘솔 에러 0', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과${failed ? ` · 실패 ${failed}` : ''}`);
process.exitCode = failed ? 1 : 0;
