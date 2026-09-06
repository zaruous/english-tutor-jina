// 스피킹 읽기 연습 문장 은행 (플랜 08 Phase C) — 새 테이블 없이 기존 콘텐츠를 재사용한다.
//  - LC 스크립트 줄: 실제 발화 문장이라 읽기 연습에 가장 적합(화자 라벨은 떼고 문장만).
//  - 회화 시나리오 opening_message: 자연스러운 영어 첫 질문.
//  - 레슨 vocab 예문: 문장 형태인 것만(시드 데이터에는 구 조각도 섞여 있다).
// 문장이 없으면 빈 배열을 주고, 화면이 고정 시드 20문장으로 폴백한다.
import { discoverable } from '../lib/content-scope.js';
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
      `SELECT c.title, jsonb_array_elements(d.passage -> 'body') ->> 'text' AS line
         FROM content_items c
         JOIN lesson_details d ON d.content_id = c.id
        WHERE d.kind = 'toeic_lc' AND c.type = 'lesson' AND ${discoverable('c')}
          AND jsonb_typeof(d.passage -> 'body') = 'array'`,
      [user.id],
    ),
    pool.query(
      `SELECT c.title, sd.opening_message
         FROM content_items c
         JOIN scenario_details sd ON sd.content_id = c.id
        WHERE c.type = 'scenario' AND ${discoverable('c')}`,
      [user.id],
    ),
    pool.query(
      `SELECT c.title, jsonb_array_elements(d.vocab) ->> 'ex' AS ex
         FROM content_items c
         JOIN lesson_details d ON d.content_id = c.id
        WHERE c.type = 'lesson' AND ${discoverable('c')}
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

// ── 발음 평가 이력 (플랜 10 Phase 3) ─────────────────────────────────────────
// 서버 평가가 성공했을 때만 저장한다 — 받아쓰기 일치율(브라우저 STT)은 발음 점수가 아니다.

export async function saveSpeakingAttempt(userId, { sentenceText, source, backend, result }) {
  await pool.query(
    `INSERT INTO speaking_attempts
       (user_id, sentence_text, source, backend, pron_score, accuracy, fluency, completeness, prosody, words)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [userId, sentenceText, source ?? null, backend,
     result.pron_score ?? null, result.accuracy ?? null, result.fluency ?? null,
     result.completeness ?? null, result.prosody ?? null,
     JSON.stringify(result.words ?? [])],
  );
}

// 최근 시도 + 30일 평균 — 스피킹 화면 하단 추이와 대시보드 speaking 스킬이 같은 값을 본다.
export async function listSpeakingAttempts(user, { limit = 20 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const { rows } = await pool.query(
    `SELECT id, sentence_text, source, backend, pron_score, accuracy, fluency, completeness, prosody, created_at
       FROM speaking_attempts
      WHERE user_id = $1 AND pron_score IS NOT NULL
      ORDER BY created_at DESC, id DESC LIMIT $2`,
    [user.id, cap],
  );
  const { rows: [avg] } = await pool.query(
    `SELECT round(avg(pron_score) FILTER (WHERE created_at > now() - interval '30 days'))::int AS d30,
            round(avg(pron_score))::int AS dall,
            count(*)::int AS total
       FROM speaking_attempts WHERE user_id = $1 AND pron_score IS NOT NULL`,
    [user.id],
  );
  return { attempts: rows, avg_30d: avg.d30 ?? null, avg_all: avg.dall ?? null, total: avg.total };
}
