// 스피킹 읽기 연습 문장 은행 (플랜 08 Phase C) — 새 테이블 없이 기존 콘텐츠를 재사용한다.
//  - LC 스크립트 줄: 실제 발화 문장이라 읽기 연습에 가장 적합(화자 라벨은 떼고 문장만).
//  - 회화 시나리오 opening_message: 자연스러운 영어 첫 질문.
//  - 레슨 vocab 예문: 문장 형태인 것만(시드 데이터에는 구 조각도 섞여 있다).
// 문장이 없으면 빈 배열을 주고, 화면이 고정 시드 20문장으로 폴백한다.
import { pool } from '../lib/pool.js';

const MAX_SENTENCES = 40;

// 읽기 연습에 쓸 만한 문장인가 — 4단어 이상, 알파벳으로 시작, 200자 이하.
function usableSentence(text) {
  const t = String(text || '').trim();
  if (t.length < 20 || t.length > 200) return null;
  if (!/^[A-Z]/.test(t)) return null;
  if (t.split(/\s+/).length < 4) return null;
  if (/[<>{}]/.test(t)) return null;
  return t;
}

export async function listSpeakingSentences(user, { limit = 20 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), MAX_SENTENCES);
  const [lc, scenarios, vocab] = await Promise.all([
    pool.query(
      `SELECT l.title, jsonb_array_elements_text(l.passage -> 'body') AS line
         FROM public.lessons l
        WHERE l.kind = 'toeic_lc' AND l.published
          AND (l.visibility = 'public' OR l.created_by = $1)
          AND jsonb_typeof(l.passage -> 'body') = 'array'`,
      [user.id],
    ),
    pool.query(
      `SELECT title, opening_message
         FROM public.conversation_scenarios
        WHERE visibility = 'public' OR created_by = $1`,
      [user.id],
    ),
    pool.query(
      `SELECT l.title, jsonb_array_elements(l.vocab) ->> 'ex' AS ex
         FROM public.lessons l
        WHERE l.published AND (l.visibility = 'public' OR l.created_by = $1)
          AND jsonb_typeof(l.vocab) = 'array'`,
      [user.id],
    ),
  ]);

  const out = [];
  const seen = new Set();
  const push = (raw, source, tag) => {
    const text = usableSentence(raw);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text, source, tag });
  };

  // 화자 라벨("M: ")은 떼고 대사만 읽는다.
  for (const r of lc.rows) push(String(r.line || '').replace(/^[MW]:\s*/, ''), 'listening', r.title);
  for (const r of scenarios.rows) push(r.opening_message, 'scenario', r.title);
  for (const r of vocab.rows) push(r.ex, 'lesson', r.title);

  return { sentences: out.slice(0, cap), total: out.length };
}
