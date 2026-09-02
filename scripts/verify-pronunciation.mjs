// 발음 평가 경로 검증 (플랜 10 Phase 1)
//
// A. 서버 없이 도는 단정 — 응답 정규화(두 백엔드 픽스처)·multipart 파서. 항상 실행된다.
// B. 실호출 — `npm run dev` + 사이드카(lib/pronounce) 또는 SPEECHACE_KEY 가 있을 때만.
//    백엔드가 없으면 B 는 "스킵"이고 실패가 아니다(플랜 10 §5-3: 미설정이 정상 상태).
//    픽스처 wav 2개(잘 읽은 것 · 틀리게 읽은 것)로 실호출해 **틀린 쪽 점수가 실제로 낮은지**까지 단정한다 —
//    §3.3 캘리브레이션 경고에 대한 최소 방어. 픽스처는 인자로 주거나(--good a.wav --bad b.wav),
//    없으면 espeak-ng 가 PATH 에 있을 때 합성한다(사이드카 네이티브 설치가 espeak-ng 를 요구하므로 대개 있다).
//
// 사용: node scripts/verify-pronunciation.mjs [--good good.wav] [--bad bad.wav] [--text "문장"]
//       E2E_API 로 대상 API 지정(기본 http://localhost:3004).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ipaSimilarity, normalizeOpenPronounce, normalizeSpeechace } from '../api/services/pronunciation-normalize.js';
import { readMultipart } from '../api/lib/body.js';

const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'X-Requested-With': 'jina', Origin: API.replace(/:(\d+)$/, (_, p) => `:${Number(p) - 1}`) };
const results = [];
const t = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };
const skip = (name, why) => console.log(`– ${name} (스킵: ${why})`);

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const TEXT = arg('--text') || 'I would recommend the new vendor because their pricing is more competitive.';
// 틀리게 읽은 픽스처의 대본 — 단어 여러 개를 **음향적으로 먼** 단어로 바꾼다.
// vendor→bender 같은 한 음소 차이(minimal pair)는 espeak 합성음의 노이즈 플로어에 묻힌다 —
// 올바른 낭독조차 vendor 가 MENDER 로 전사될 만큼 TTS 음질이 낮아, 실측에서 good=bad=78 동점이 났다.
// (실제 사람 음성은 문장 불일치 시 94→1 로 확실히 분리된다.) 아래 문장은 espeak 기준 실측 41 vs 78.
const WRONG_TEXT = 'I could recommend the new painter because their schedule is most expensive.';

// ── A. 순수 단정 ──────────────────────────────────────────────
console.log('\n[A] 정규화·파서 (서버 불필요)');
{
  // lib/pronounce/README 의 응답 예시 그대로
  const raw = {
    ok: true, backend: 'openpronounce', score: 59.0, transcript: 'HELL NO WHO ARE YOU',
    phoneme_error_rate: 0.31, word_error_rate: 0.4,
    errors: [{ word: 'hello', expected: 'həloʊ', actual: 'hɛlnoʊ', confidence: 0.89 }],
  };
  const n = normalizeOpenPronounce(raw, 'Hello, how are you?');
  t('openpronounce: 문장 점수 → pron_score·accuracy (정수)', n.pron_score === 59 && n.accuracy === 59);
  t('openpronounce: completeness = 1 - WER', n.completeness === 60, String(n.completeness));
  t('openpronounce: fluency·prosody 는 null (0 으로 뭉개지 않음)', n.fluency === null && n.prosody === null);
  t('openpronounce: words 는 목표 문장 순서·개수', n.words.length === 4 && n.words.map((w) => w.word).join(' ') === 'Hello, how are you?');
  const hello = n.words[0];
  t('openpronounce: 오류 단어에 IPA 두 줄 + 파생 점수 < 100', hello.expected_ipa === 'həloʊ' && hello.heard_ipa === 'hɛlnoʊ'
    && hello.score < 100 && hello.score > 0, `hello=${hello.score}`);
  t('openpronounce: 오류 없는 단어는 100', n.words.slice(1).every((w) => w.score === 100 && w.expected_ipa === null));
  t('ipaSimilarity: 동일=1 · 전부 다름=0 · 강세 기호 무시', ipaSimilarity('həloʊ', 'həloʊ') === 1
    && ipaSimilarity('ab', 'cd') === 0 && ipaSimilarity('ˈhəloʊ', 'həloʊ') === 1);
  const empty = normalizeOpenPronounce({ score: null, errors: null }, 'a b');
  t('openpronounce: 결손 필드 → null (throw 아님)', empty.pron_score === null && empty.completeness === null && empty.words.length === 2);

  const sa = {
    status: 'success',
    text_score: {
      quality_score: 81.4,
      speechace_score: { pronunciation: 80, fluency: 72.6 },
      word_score_list: [
        { word: 'hello', quality_score: 91, phone_score_list: [{ phone: 'hh', quality_score: 95 }, { phone: 'ah', quality_score: 88 }] },
        { word: 'world', quality_score: 55.5, phone_score_list: [{ phone: 'w', quality_score: 60 }, { phone: 'er', quality_score: 40 }] },
      ],
    },
  };
  const s = normalizeSpeechace(sa);
  t('speechace: pron_score=speechace_score.pronunciation · accuracy=quality_score', s.pron_score === 80 && s.accuracy === 81);
  t('speechace: fluency 반올림 정수', s.fluency === 73);
  t('speechace: words + phonemes {p, score}', s.words.length === 2 && s.words[1].score === 56
    && s.words[1].phonemes.length === 2 && s.words[1].phonemes[1].p === 'er' && s.words[1].phonemes[1].score === 40);
  const s2 = normalizeSpeechace({ status: 'success', text_score: { quality_score: 70 } });
  t('speechace: speechace_score 없으면 pron_score 는 quality_score 로', s2.pron_score === 70 && s2.fluency === null && s2.words.length === 0);
}
{
  // readMultipart — 정상 · 상한 초과(413) · 비 multipart(400)
  let lastErr = null; // 상한 초과 시 서버가 연결을 끊어 응답을 못 받으므로 핸들러가 받은 에러를 직접 본다
  const server = http.createServer(async (req, res) => {
    try {
      const fd = await readMultipart(req, { limit: 4096 });
      const f = fd.get('audio');
      res.end(JSON.stringify({ ok: true, text: fd.get('reference_text'), size: (await f.arrayBuffer()).byteLength, type: f.type }));
    } catch (e) { lastErr = e; res.statusCode = e.status || 500; res.end(JSON.stringify({ ok: false, code: e.code, status: e.status })); }
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const form = (bytes) => { const f = new FormData(); f.append('reference_text', TEXT); f.append('audio', new Blob([new Uint8Array(bytes)], { type: 'audio/webm' }), 'clip.webm'); return f; };
  const ok = await (await fetch(base, { method: 'POST', body: form(1000) })).json();
  t('readMultipart: 필드·파일 파싱', ok.ok && ok.text === TEXT && ok.size === 1000 && ok.type === 'audio/webm');
  lastErr = null;
  await fetch(base, { method: 'POST', body: form(20000) }).then((r) => r.text()).catch(() => {}); // 서버가 끊으면 fetch 자체가 실패한다
  await new Promise((r) => setTimeout(r, 100));
  t('readMultipart: 상한 초과 → HttpError 413 PROMPT_TOO_LONG', lastErr?.status === 413 && lastErr?.code === 'PROMPT_TOO_LONG',
    lastErr ? `${lastErr.status} ${lastErr.code}` : '핸들러가 에러를 받지 못함');
  const notMp = await (await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  t('readMultipart: multipart 아님 → 400', notMp.status === 400 && notMp.code === 'BAD_REQUEST');
  const broken = await (await fetch(base, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=zzz' }, body: 'garbage' })).json();
  t('readMultipart: 깨진 본문 → 400', broken.status === 400 && broken.code === 'BAD_REQUEST');
  server.close();
}

// ── B. 실호출 ─────────────────────────────────────────────────
console.log('\n[B] 실호출 (API + 백엔드)');
let status = null;
try { status = await (await fetch(`${API}/api/speaking/assess/status`, { headers: H })).json(); } catch { /* API 다운 */ }
if (!status) {
  skip('실호출 전체', `${API} 에 연결할 수 없음 — npm run dev 필요`);
} else {
  t('GET /api/speaking/assess/status — 형태 {available, backend}', status.ok === true && typeof status.available === 'boolean' && 'backend' in status,
    `available=${status.available} backend=${status.backend} · ${status.detail || ''}`);

  const post = async (fields) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, ...(Array.isArray(v) ? v : [v]));
    const r = await fetch(`${API}/api/speaking/assess`, { method: 'POST', headers: H, body: f });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const noText = await post({ audio: [new Blob([new Uint8Array(100)], { type: 'audio/wav' }), 'a.wav'] });
  t('reference_text 누락 → 400', noText.status === 400 && noText.body.code === 'BAD_REQUEST', noText.body.error);
  const noAudio = await post({ reference_text: TEXT });
  t('audio 누락 → 400', noAudio.status === 400 && noAudio.body.code === 'BAD_REQUEST', noAudio.body.error);
  const badText = await post({ reference_text: '<script>', audio: [new Blob([new Uint8Array(100)], { type: 'audio/wav' }), 'a.wav'] });
  t('reference_text 형식 검증 → 400', badText.status === 400 && badText.body.code === 'BAD_REQUEST');

  if (!status.available) {
    // 미설정이 정상 상태다 — 이 상태에서 POST 가 503 이 아니라 폴백 신호를 줘야 한다.
    const fb = await post({ reference_text: TEXT, audio: [new Blob([new Uint8Array(100)], { type: 'audio/wav' }), 'a.wav'] });
    t('백엔드 없음 → 200 { available:false } 폴백 신호 (503 아님)', fb.status === 200 && fb.body.ok === true && fb.body.available === false,
      `reason=${fb.body.reason}`);
    skip('픽스처 점수 비교', `백엔드 없음 (${status.detail || 'PRONUNCIATION_URL/SPEECHACE_KEY 미설정'})`);
  } else {
    // 픽스처 준비: 인자 → espeak-ng 합성 → 스킵
    let good = arg('--good');
    let bad = arg('--bad');
    let tmp = null;
    if (!good || !bad) {
      const espeak = ['espeak-ng', 'espeak'].find((bin) => { try { execFileSync(bin, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } });
      if (espeak) {
        tmp = mkdtempSync(join(tmpdir(), 'jina-pron-'));
        good = good || join(tmp, 'good.wav');
        bad = bad || join(tmp, 'bad.wav');
        execFileSync(espeak, ['-v', 'en-us', '-s', '150', '-w', good, TEXT]);
        execFileSync(espeak, ['-v', 'en-us', '-s', '150', '-w', bad, WRONG_TEXT]);
        console.log(`  픽스처 합성(${espeak}): ${good} · ${bad}`);
      }
    }
    if (!good || !bad || !existsSync(good) || !existsSync(bad)) {
      skip('픽스처 점수 비교', 'wav 픽스처 없음 — --good/--bad 로 주거나 espeak-ng 를 PATH 에 두세요');
    } else {
      const send = async (path) => {
        const started = Date.now();
        const r = await post({ reference_text: TEXT, audio: [new Blob([readFileSync(path)], { type: 'audio/wav' }), 'clip.wav'] });
        return { ...r, ms: Date.now() - started };
      };
      const g = await send(good);
      t(`잘 읽은 wav → 200 available:true (${g.ms}ms · backend=${g.body.backend})`, g.status === 200 && g.body.available === true,
        g.body.available === false ? `reason=${g.body.reason} ${g.body.detail || ''}` : `pron_score=${g.body.pron_score}`);
      if (g.body.available) {
        const words = TEXT.split(/\s+/).length;
        t('응답 계약: pron_score 정수 0~100 · words 배열', Number.isInteger(g.body.pron_score) && g.body.pron_score >= 0 && g.body.pron_score <= 100
          && Array.isArray(g.body.words) && g.body.words.length > 0, `words=${g.body.words?.length}/${words}`);
        t('words[] = {word, score, expected_ipa, heard_ipa, phonemes[]}', g.body.words.every((w) => typeof w.word === 'string'
          && (w.score === null || Number.isInteger(w.score)) && 'expected_ipa' in w && 'heard_ipa' in w && Array.isArray(w.phonemes)));
        const b = await send(bad);
        t(`틀리게 읽은 wav → 200 (${b.ms}ms)`, b.status === 200 && b.body.available === true, `pron_score=${b.body.pron_score}`);
        // 캘리브레이션 최소 방어 — 방향성만 단정한다(절대값은 백엔드마다 다르다).
        t('틀리게 읽은 쪽 점수가 실제로 낮다 (bad < good)', Number.isInteger(b.body.pron_score) && b.body.pron_score < g.body.pron_score,
          `good=${g.body.pron_score} bad=${b.body.pron_score}`);
        const lowWords = (b.body.words || []).filter((w) => Number.isInteger(w.score) && w.score < 100).map((w) => w.word);
        t('틀린 단어(vendor/pricing)가 단어 점수에 드러남', lowWords.some((w) => /vendor|pricing/i.test(w)), lowWords.join(', ') || '낮은 단어 0');
        if (g.ms > 15_000) console.log(`  ⚠ 지연 ${g.ms}ms — 플랜 10 §9-3(학습 흐름을 끊는 지연) 판단 자료`);
      }
    }
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과${failed ? ` · 실패 ${failed}` : ''}`);
process.exitCode = failed ? 1 : 0;
