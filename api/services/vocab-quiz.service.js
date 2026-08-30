// vocab-quiz.service.js — 단어장 '오늘의 단어' AI 퀴즈 영속화 (docs/plan/06-vocab-daily-quiz.md)
// 퀴즈 1건 = AI가 만든 10단어 세트. 채점은 서버(answerQuiz)가 하고, 결과 단어는 addCardFromEntry 로
// 단어장에 들어간다(AI 재호출 없음). AI 호출은 라우트(트랜잭션 밖)에서 끝난 뒤 createQuiz 가 저장한다.
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { addCardFromEntry } from './vocab.service.js';

export const QUIZ_KINDS = ['random', 'news', 'game', 'blog', 'keyword'];
export const QUIZ_SIZE = 10;

// 보기 순서는 퀴즈 id + 문항 index 로 결정적 셔플 — 다시 열어도 같은 순서 (저장하지 않는 파생값)
function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffledOptions(quizId, index, w) {
  const opts = [w.meaning_ko, ...(w.distractors_ko || [])];
  return opts
    .map((o, i) => ({ o, k: hash(`${quizId}:${index}:${i}:${o}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.o);
}

export function quizDto(row) {
  const words = (row.words || []).map((w, index) => ({
    index,
    word: w.word, pos: w.pos, ipa: w.ipa, meaning_ko: w.meaning_ko,
    example_en: w.example_en, example_ko: w.example_ko, difficulty: w.difficulty,
    options: shuffledOptions(row.id, index, w),
  }));
  return {
    id: row.id, kind: row.kind, keyword: row.keyword,
    topic_title: row.topic_title, topic_ko: row.topic_ko,
    words, total: words.length,
    answers: row.answers || null, score: row.score,
    provider: row.provider, model: row.model,
    created_at: row.created_at, completed_at: row.completed_at,
  };
}

// 사용자가 이미 가진 단어 — 프롬프트의 제외 목록 (최근 추가순 60개)
export async function existingWords(user, limit = 60) {
  const { rows } = await pool.query(
    `SELECT w.word
       FROM public.user_vocab_cards c
       JOIN public.vocab_words w ON w.id = c.word_id
      WHERE c.user_id = $1
      ORDER BY c.added_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return rows.map((r) => r.word);
}

export async function createQuiz(user, { kind, keyword, data, provider, model }) {
  if (!Array.isArray(data.words) || data.words.length !== QUIZ_SIZE) {
    throw new HttpError(502, 'SCHEMA_VIOLATION',
      `모델이 단어 ${QUIZ_SIZE}개를 만들지 못했습니다 (${data.words?.length ?? 0}개).`, { provider });
  }
  const { rows: [row] } = await pool.query(
    `INSERT INTO public.vocab_quizzes
       (user_id, kind, keyword, topic_title, topic_ko, words, provider, model)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING *`,
    [user.id, kind, keyword ?? null, data.topic_title, data.topic_ko ?? null,
     JSON.stringify(data.words), provider ?? null, model ?? null],
  );
  return quizDto(row);
}

export async function getQuizRow(user, quizId, client = pool) {
  const { rows: [row] } = await client.query(
    `SELECT * FROM public.vocab_quizzes WHERE id = $1 AND user_id = $2`,
    [quizId, user.id],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', '퀴즈를 찾을 수 없습니다.');
  return row;
}

// 오늘(APP_TZ 기준) 만든 가장 최근 퀴즈 — 없으면 null (프론트는 주제 선택 화면)
export async function todayQuiz(user) {
  const { rows: [row] } = await pool.query(
    `SELECT * FROM public.vocab_quizzes
      WHERE user_id = $1
        AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
      ORDER BY created_at DESC
      LIMIT 1`,
    [user.id, config.appTz],
  );
  return row ? quizDto(row) : null;
}

// 채점 — answers: [{index, choice}] (choice 는 보기 문자열). 정답 판정은 서버가 한다.
export async function answerQuiz(user, quizId, answers) {
  const row = await getQuizRow(user, quizId);
  const words = row.words || [];
  const graded = [];
  for (const a of answers) {
    const idx = Number(a?.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= words.length) {
      throw new HttpError(400, 'BAD_REQUEST', 'answers[].index 가 범위를 벗어났습니다.');
    }
    if (typeof a.choice !== 'string' || a.choice.length > 200) {
      throw new HttpError(400, 'BAD_REQUEST', 'answers[].choice 는 문자열이어야 합니다.');
    }
    graded.push({ index: idx, choice: a.choice, correct: a.choice === words[idx].meaning_ko });
  }
  if (new Set(graded.map((g) => g.index)).size !== graded.length) {
    throw new HttpError(400, 'BAD_REQUEST', '같은 문항에 답이 두 번 있습니다.');
  }
  const score = graded.filter((g) => g.correct).length;
  const { rows: [updated] } = await pool.query(
    `UPDATE public.vocab_quizzes
        SET answers = $3::jsonb, score = $4, completed_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [quizId, user.id, JSON.stringify(graded), score],
  );
  return quizDto(updated);
}

// 퀴즈 단어를 단어장에 — indexes 가 비면 전부. 퀴즈의 사전 정보를 그대로 쓴다(AI 재호출 없음).
export async function addQuizWords(user, quizId, indexes) {
  const row = await getQuizRow(user, quizId);
  const words = row.words || [];
  const wanted = (Array.isArray(indexes) && indexes.length ? indexes : words.map((_, i) => i))
    .map(Number)
    .filter((i) => Number.isInteger(i) && i >= 0 && i < words.length);
  const cards = [];
  let added = 0;
  let duplicates = 0;
  for (const i of [...new Set(wanted)]) {
    const w = words[i];
    const entry = {
      word: w.word, pos: w.pos, ipa: w.ipa, meaning_ko: w.meaning_ko,
      examples: [w.example_en].filter(Boolean), difficulty: w.difficulty || 3,
    };
    const r = await addCardFromEntry(user, { word: w.word, entry, source: 'ai' }); // vocab_words_source_ck 허용값(seed|ai|manual|lesson|conversation) — 퀴즈 단어도 AI 생성 항목
    if (r.duplicate) duplicates += 1; else added += 1;
    cards.push(r.card);
  }
  return { added, duplicates, cards };
}
