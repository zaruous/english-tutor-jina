// 발음 평가 응답 정규화 — 순수 함수만 (config·pg 의존 0 → verify 스크립트가 서버 없이 단정할 수 있다).
// 백엔드가 달라도 화면은 한 모양만 본다(플랜 10 §5-2·§6 Phase 1):
//   { backend, pron_score, accuracy, fluency, completeness, prosody, transcript,
//     words: [{ word, score, expected_ipa, heard_ipa, phonemes: [{ p, score }] }] }
// 점수는 0~100 정수 또는 null(그 백엔드가 주지 않는 축). null 을 0 으로 뭉개지 않는다 —
// 화면이 "데이터 없음"과 "0점"을 구분해야 한다.

const clamp100 = (v) => {
  if (v === null || v === undefined || v === '') return null; // Number(null) 은 0 이다 — 결손을 0점으로 만들면 안 된다
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const normWord = (w) => String(w || '').toLowerCase().replace(/[^a-z0-9']/g, '');

// 두 IPA 문자열의 유사도(0~1) — 편집 거리 기반. OpenPronounce 는 틀린 단어에 점수를 주지 않고
// expected/actual 음소열만 주므로, 단어 점수는 여기서 파생한다(아래 normalizeOpenPronounce 주석 참조).
export function ipaSimilarity(a, b) {
  const s = Array.from(String(a || '').replace(/[\s/ˈˌ.]/g, ''));
  const t = Array.from(String(b || '').replace(/[\s/ˈˌ.]/g, ''));
  if (!s.length && !t.length) return 1;
  if (!s.length || !t.length) return 0;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[t.length] / Math.max(s.length, t.length);
}

// OpenPronounce 사이드카(lib/pronounce/server.py) 응답 → 공통 계약.
//  - score: 문장 점수 0~100 → pron_score·accuracy.
//  - completeness: 1 - word_error_rate. 받아쓰기가 얼마나 문장을 덮었는지라 '완성도'에 가장 가깝다.
//  - fluency·prosody: 이 백엔드는 주지 않는다 → null (prosody=true 의 f0 곡선은 점수가 아니다).
//  - words: 목표 문장 단어 순서대로. errors 에 없는 단어는 100, 있는 단어는 expected/actual IPA
//    유사도 × 100. 이 파생값은 "왜 이 점수인지"를 IPA 두 줄로 설명할 수 있다는 점에서만 정당하다 —
//    사람 채점과 캘리브레이션된 값이 아니므로(플랜 10 §3.3) verify-pronunciation 이 방향성만 단정한다.
export function normalizeOpenPronounce(raw, referenceText) {
  const targetWords = String(referenceText || '').split(/\s+/).filter(Boolean);
  const errors = Array.isArray(raw?.errors) ? raw.errors : [];
  const byWord = new Map();
  for (const e of errors) {
    const k = normWord(e?.word);
    if (k && !byWord.has(k)) byWord.set(k, e);
  }
  const words = targetWords.map((word) => {
    const e = byWord.get(normWord(word));
    if (!e) return { word, score: 100, expected_ipa: null, heard_ipa: null, phonemes: [] };
    return {
      word,
      score: clamp100(ipaSimilarity(e.expected, e.actual) * 100),
      expected_ipa: e.expected ?? null,
      heard_ipa: e.actual ?? null,
      phonemes: [], // 음소 단위 점수는 이 백엔드에 없다 — 화면은 IPA 두 줄로 대신한다
    };
  });
  const wer = Number(raw?.word_error_rate);
  const score = clamp100(raw?.score);
  return {
    backend: 'openpronounce',
    pron_score: score,
    accuracy: score,
    fluency: null,
    completeness: Number.isFinite(wer) ? clamp100((1 - wer) * 100) : null,
    prosody: null,
    transcript: raw?.transcript ?? null,
    words,
  };
}

// Speechace scoring/text 응답 → 공통 계약.
// ⚠ 이 계약은 공개 문서 기억으로 썼고 실호출로 확인하지 못했다(작성 환경에서 docs.speechace.com 차단).
//   verify-pronunciation.mjs 의 실호출이 이 함수의 첫 검증이다 — 필드 이름이 다르면 여기만 고친다.
//  - text_score.quality_score: 문장 발음 점수 0~100.
//  - text_score.word_score_list[]: { word, quality_score, phone_score_list[]: { phone, quality_score } }.
//  - text_score.speechace_score { pronunciation, fluency } — include_fluency=1 일 때. 없으면 null.
export function normalizeSpeechace(raw) {
  const ts = raw?.text_score || {};
  const list = Array.isArray(ts.word_score_list) ? ts.word_score_list : [];
  const words = list.map((w) => ({
    word: String(w?.word ?? ''),
    score: clamp100(w?.quality_score),
    expected_ipa: null, // Speechace 는 IPA 가 아니라 ARPAbet 음소 목록을 준다 → phonemes 로 전달
    heard_ipa: null,
    phonemes: (Array.isArray(w?.phone_score_list) ? w.phone_score_list : [])
      .map((p) => ({ p: String(p?.phone ?? ''), score: clamp100(p?.quality_score) })),
  }));
  const sa = ts.speechace_score || {};
  const score = clamp100(ts.quality_score);
  return {
    backend: 'speechace',
    pron_score: clamp100(sa.pronunciation) ?? score,
    accuracy: score,
    fluency: clamp100(sa.fluency),
    completeness: null,
    prosody: null,
    transcript: null,
    words,
  };
}
