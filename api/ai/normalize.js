// 스키마 검증 후에도 방어적으로 값을 다듬는다.
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

export function normalizeTutor(data) {
  const out = {
    reply_en: String(data.reply_en || '').slice(0, 4000),
    reply_ko: data.reply_ko == null ? null : String(data.reply_ko).slice(0, 2000),
    corrections: (Array.isArray(data.corrections) ? data.corrections : []).slice(0, 8).map((c) => ({
      original: String(c.original || '').slice(0, 500),
      corrected: String(c.corrected || '').slice(0, 500),
      reason: String(c.reason || '').slice(0, 500),
      type: ['grammar', 'usage', 'spelling'].includes(c.type) ? c.type : 'usage',
    })),
    scores: data.scores == null ? null : {
      grammar: clampInt(data.scores.grammar, 0, 100),
      fluency: clampInt(data.scores.fluency, 0, 100),
      vocabulary: clampInt(data.scores.vocabulary, 0, 100),
    },
    suggestion: data.suggestion == null ? null : String(data.suggestion).slice(0, 1000),
  };
  return out;
}

export function normalizeVocabEntry(data) {
  const examples = (Array.isArray(data.examples) ? data.examples : [])
    .map((e) => String(e).slice(0, 240)).filter(Boolean).slice(0, 2);
  while (examples.length < 2 && examples.length > 0) examples.push(examples[0]);
  return {
    word: String(data.word || '').trim().slice(0, 64),
    pos: String(data.pos || '').trim().slice(0, 16),
    ipa: String(data.ipa || '').trim().slice(0, 64),
    meaning_ko: String(data.meaning_ko || '').trim().slice(0, 200),
    examples,
    difficulty: clampInt(data.difficulty, 1, 5),
  };
}

export const NORMALIZERS = { tutor: normalizeTutor, vocab_entry: normalizeVocabEntry };
