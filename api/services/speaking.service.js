// 스피킹 읽기 연습 문장 은행 (플랜 08 Phase C) — 새 테이블 없이 기존 콘텐츠를 재사용한다.
//  - LC 스크립트 줄: 실제 발화 문장이라 읽기 연습에 가장 적합(화자 라벨은 떼고 문장만).
//  - 회화 시나리오 opening_message: 자연스러운 영어 첫 질문.
//  - 레슨 vocab 예문: 문장 형태인 것만(시드 데이터에는 구 조각도 섞여 있다).
// 문장이 없으면 빈 배열을 주고, 화면이 고정 시드 20문장으로 폴백한다.
import { discoverable } from '../lib/content-scope.js';
import { pool } from '../lib/pool.js';

// 문장 은행은 "지금 읽기 연습할 것" 을 고르는 자리라 세 파생 쿼리 모두 discoverable 이다
// (플랜 11 §3 표). 조건만 헬퍼로 옮겼을 뿐 쿼리 자체는 그대로다 — 내린(archived) 콘텐츠의 문장이
// 계속 연습 목록에 뜨는 것을 막는 것이 이 교체의 전부다.
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
      `SELECT c.title, jsonb_array_elements(d.passage -> 'body') ->> 'text' AS line
         FROM content_items c
         JOIN lesson_details d ON d.content_id = c.id
        WHERE d.kind = 'toeic_lc' AND c.type = 'lesson' AND ${discoverable('c', '$1')}
          AND jsonb_typeof(d.passage -> 'body') = 'array'`,
      [user.id],
    ),
    pool.query(
      `SELECT c.title, sd.opening_message
         FROM content_items c
         JOIN scenario_details sd ON sd.content_id = c.id
        WHERE c.type = 'scenario' AND ${discoverable('c', '$1')}`,
      [user.id],
    ),
    pool.query(
      `SELECT c.title, jsonb_array_elements(d.vocab) ->> 'ex' AS ex
         FROM content_items c
         JOIN lesson_details d ON d.content_id = c.id
        WHERE c.type = 'lesson' AND ${discoverable('c', '$1')}
          AND jsonb_typeof(d.vocab) = 'array'`,
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

  // LC 스크립트는 [{speaker,text}] 구조라 text 만 온다 (플랜 10.7 §3.2).
  // 정규식은 구 포맷("M: …")이 섞여 들어와도 안전하도록 남겨 둔 방어선이다.
  for (const r of lc.rows) push(String(r.line || '').replace(/^[MW]:\s*/, ''), 'listening', r.title);
  for (const r of scenarios.rows) push(r.opening_message, 'scenario', r.title);
  for (const r of vocab.rows) push(r.ex, 'lesson', r.title);

  return { sentences: out.slice(0, cap), total: out.length };
}
