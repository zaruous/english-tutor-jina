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

// 퀴즈: 단어 중복 제거, 정답과 겹치는 오답 보기 제거 후 다른 단어의 뜻으로 3개 채움.
// 10개 미달이면 createQuiz 가 SCHEMA_VIOLATION 으로 거절한다 (불량 퀴즈 저장 금지).
export function normalizeVocabQuiz(data) {
  const seen = new Set();
  const words = (Array.isArray(data.words) ? data.words : []).map((w) => {
    const meaning = String(w.meaning_ko || '').trim().slice(0, 200);
    return {
      word: String(w.word || '').trim().slice(0, 64),
      pos: String(w.pos || '').trim().slice(0, 16),
      ipa: String(w.ipa || '').trim().slice(0, 64),
      meaning_ko: meaning,
      example_en: String(w.example_en || '').trim().slice(0, 300),
      example_ko: String(w.example_ko || '').trim().slice(0, 300),
      distractors_ko: (Array.isArray(w.distractors_ko) ? w.distractors_ko : [])
        .map((d) => String(d).trim().slice(0, 200))
        .filter((d, i, arr) => d && d !== meaning && arr.indexOf(d) === i)
        .slice(0, 3),
      difficulty: clampInt(w.difficulty, 1, 5),
    };
  }).filter((w) => {
    const key = w.word.toLowerCase();
    if (!w.word || !w.meaning_ko || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const w of words) {
    let k = 0;
    while (w.distractors_ko.length < 3 && k < words.length) {
      const alt = words[k++].meaning_ko;
      if (alt !== w.meaning_ko && !w.distractors_ko.includes(alt)) w.distractors_ko.push(alt);
    }
  }
  return {
    topic_title: String(data.topic_title || '오늘의 단어').trim().slice(0, 40),
    topic_ko: String(data.topic_ko || '').trim().slice(0, 200),
    words,
  };
}

// 레슨 Q&A: answer 2000자, 인용 quote 300자 최대 3개(빈 인용 제거).
// quote 가 실제 지문의 부분문자열인지는 lesson.service.verifyCitations 가 지문 텍스트를 들고 검증한다.
export function normalizeLessonQa(data) {
  return {
    answer: String(data.answer || '').trim().slice(0, 2000),
    citations: (Array.isArray(data.citations) ? data.citations : [])
      .map((c) => ({ quote: String(c?.quote || '').trim().slice(0, 300) }))
      .filter((c) => c.quote)
      .slice(0, 3),
  };
}

export function normalizeLessonGen(data) {
  const items = (Array.isArray(data.items) ? data.items : []).slice(0, 10).map((item) => ({
    stem: String(item?.stem || '').trim().slice(0, 1000),
    options: (Array.isArray(item?.options) ? item.options : []).slice(0, 4).map((o) => ({
      id: String(o?.id || '').trim().toUpperCase().slice(0, 1),
      text: String(o?.text || '').trim().slice(0, 500),
    })),
    answer: String(item?.answer || '').trim().toUpperCase().slice(0, 1),
    explanation: String(item?.explanation || '').trim().slice(0, 1500),
    skill_code: ['grammar', 'vocab', 'detail', 'inference', 'main_idea'].includes(item?.skill_code)
      ? item.skill_code : 'grammar',
  }));
  return {
    title: String(data.title || 'TOEIC Part 5 — AI 레슨').trim().slice(0, 120),
    subtitle: String(data.subtitle || '').trim().slice(0, 160),
    items,
  };
}

export function normalizeScenarioGen(data) {
  return {
    title: String(data.title || '').trim().slice(0, 120),
    tag: String(data.tag || 'AI 회화').trim().slice(0, 60),
    description: String(data.description || '').trim().slice(0, 500),
    system_prompt: String(data.system_prompt || '').trim().slice(0, 4000),
    opening_message: String(data.opening_message || '').trim().slice(0, 1000),
    objectives: (Array.isArray(data.objectives) ? data.objectives : [])
      .map((x) => String(x || '').trim().slice(0, 200)).filter(Boolean).slice(0, 5),
  };
}

export function normalizeVocabSet(data) {
  const seen = new Set();
  const words = (Array.isArray(data.words) ? data.words : []).map((w) => ({
    word: String(w?.word || '').trim().toLowerCase().slice(0, 64),
    pos: String(w?.pos || '').trim().slice(0, 16),
    ipa: String(w?.ipa || '').trim().slice(0, 64),
    meaning_ko: String(w?.meaning_ko || '').trim().slice(0, 200),
    example_en: String(w?.example_en || '').trim().slice(0, 400),
    example_ko: String(w?.example_ko || '').trim().slice(0, 400),
    difficulty: clampInt(w?.difficulty, 1, 5),
  })).filter((w) => {
    if (!w.word || !w.meaning_ko || seen.has(w.word)) return false;
    seen.add(w.word);
    return true;
  }).slice(0, 20);
  return {
    title: String(data.title || '').trim().slice(0, 120),
    description: String(data.description || '').trim().slice(0, 500),
    words,
  };
}

export const NORMALIZERS = {
  tutor: normalizeTutor,
  vocab_entry: normalizeVocabEntry,
  vocab_quiz: normalizeVocabQuiz,
  lesson_qa: normalizeLessonQa,
  lesson_gen: normalizeLessonGen,
  scenario_gen: normalizeScenarioGen,
  vocab_set: normalizeVocabSet,
};
