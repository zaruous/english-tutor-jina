// db/seeds/dev.mjs — 개발 계정 + 단어장 카드 8장
//
// SQL 마이그레이션이 아니라 별도 시드인 이유:
//  - scrypt 해시는 런타임 생성이 필요 (SQL 불가)
//  - 개발 계정이 마이그레이션에 섞이면 프로덕션에 딸려 감
// 카드 타임스탬프는 now() 기준 상대 시각 — 고정값이면 며칠 뒤 전부 due로 몰려
// "In 3 days" 상태를 재현할 수 없다. 배분: due 3 / learned 3 / new 2.
import 'dotenv/config';
import pg from 'pg';
import { hashPassword } from '../../api/services/password.js';

const DEV_EMAIL = process.env.DEV_USER_EMAIL || 'jina@dev.local';
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD;
if (!DEV_PASSWORD) {
  console.error('DEV_USER_PASSWORD 가 .env에 없습니다.');
  process.exit(1);
}
const TZ = process.env.APP_TZ || 'Asia/Seoul';

// { word, 상태, interval_days, ease_factor, review_count, fail_count, next_review 오프셋(일) }
// 오프셋 null = 즉시 due(신규), 음수 = 이미 지난 복습(연체 due), 양수 = 미래(learned)
const CARDS = [
  { word: 'accommodate', interval: 1, ef: 2.5, reviews: 3, fails: 1, offsetDays: 0,   last: 'good' },
  { word: 'facilitate',  interval: 3, ef: 2.6, reviews: 5, fails: 0, offsetDays: 0,   last: 'good' },
  { word: 'procurement', interval: 1, ef: 2.3, reviews: 2, fails: 2, offsetDays: -1,  last: 'again' },
  { word: 'discrepancy', interval: 3, ef: 2.8, reviews: 7, fails: 1, offsetDays: 3,   last: 'good' },
  { word: 'reimburse',   interval: 5, ef: 2.7, reviews: 9, fails: 0, offsetDays: 5,   last: 'easy' },
  { word: 'allocate',    interval: 7, ef: 3.0, reviews: 12, fails: 0, offsetDays: 7,  last: 'easy' },
  { word: 'compliance',  interval: 1, ef: 2.5, reviews: 0, fails: 0, offsetDays: null, last: null },
  { word: 'scrutinize',  interval: 1, ef: 2.5, reviews: 0, fails: 0, offsetDays: null, last: null },
];

const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
await client.connect();
try {
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const { rows: [user] } = await client.query(
    `INSERT INTO public.users (email, display_name, password_hash, tz, is_dev)
     VALUES ($1, '수민 (dev)', $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_dev = true
     RETURNING id`,
    [DEV_EMAIL, passwordHash, TZ],
  );

  for (const c of CARDS) {
    const { rows: [word] } = await client.query(
      `SELECT id FROM public.vocab_words WHERE word_key = lower(btrim($1)) AND lang = 'en'`,
      [c.word],
    );
    if (!word) throw new Error(`vocab_words에 없는 시드 단어: ${c.word} — 먼저 npm run db:migrate`);
    await client.query(
      `INSERT INTO public.user_vocab_cards
         (user_id, word_id, next_review, interval_days, ease_factor,
          review_count, fail_count, last_result, last_reviewed_at)
       VALUES ($1, $2,
               CASE WHEN $3::int IS NULL THEN now()
                    ELSE (date_trunc('day', now() AT TIME ZONE $8) + ($3 || ' days')::interval) AT TIME ZONE $8
               END,
               $4, $5, $6, $7,
               $9,
               CASE WHEN $6::int > 0 THEN now() - interval '1 day' ELSE NULL END)
       ON CONFLICT (user_id, word_id) DO UPDATE SET
         next_review = EXCLUDED.next_review, interval_days = EXCLUDED.interval_days,
         ease_factor = EXCLUDED.ease_factor, review_count = EXCLUDED.review_count,
         fail_count = EXCLUDED.fail_count, last_result = EXCLUDED.last_result,
         last_reviewed_at = EXCLUDED.last_reviewed_at, updated_at = now()`,
      [user.id, word.id, c.offsetDays, c.interval, c.ef, c.reviews, c.fails, TZ, c.last],
    );
  }

  // ── 회화 시드 (docs/plan/01-conversation.md Phase C1) ─────────────────
  // 자연키가 없어 ON CONFLICT 불가 — 제목으로 SELECT 후 없을 때만 INSERT (재실행 안전).
  // 타임스탬프는 전부 now() 상대시각.
  async function ensureSession({ title, scenario, status, startedAtSql, lastMessageAtSql, endedAtSql }) {
    const { rows: [existing] } = await client.query(
      `SELECT id FROM public.conversation_sessions WHERE user_id = $1 AND title = $2`,
      [user.id, title],
    );
    if (existing) return { id: existing.id, created: false };
    const { rows: [s] } = await client.query(
      `INSERT INTO public.conversation_sessions
         (user_id, title, scenario, status, started_at, last_message_at, ended_at)
       VALUES ($1, $2, $3::jsonb, $4, ${startedAtSql}, ${lastMessageAtSql}, ${endedAtSql})
       RETURNING id`,
      [user.id, title, scenario ? JSON.stringify(scenario) : null, status],
    );
    return { id: s.id, created: true };
  }

  const s1 = await ensureSession({
    title: '비즈니스 미팅',
    scenario: {
      tag: 'TOEIC SPEAKING · Q11',
      level: '★★★☆☆',
      title: '비즈니스 미팅 · 신규 거래처 추천',
      description: '상사가 사무용품 신규 거래처를 추천해달라고 요청했어요. 동료에게 전화로 의견을 전달하세요.',
    },
    status: 'active',
    startedAtSql: `now() - interval '2 hours'`,
    lastMessageAtSql: `now() - interval '5 minutes'`,
    endedAtSql: 'NULL',
  });
  const s2 = await ensureSession({
    title: '카페에서 주문하기',
    scenario: null,
    status: 'ended',
    startedAtSql: `now() - interval '1 day' - interval '1 hour'`,
    lastMessageAtSql: `now() - interval '1 day'`,
    endedAtSql: `now() - interval '1 day'`,
  });

  const CORR1 = { original: 'should to go with', corrected: 'should go with',
    reason: 'should 뒤에는 to 없이 동사원형이 와요.', type: 'grammar' };
  const CORR2 = { original: 'have good prices', corrected: 'offer competitive pricing',
    reason: '비즈니스 상황에선 competitive pricing이 더 격식 있어요.', type: 'usage' };

  let firstUserMsgId = null;
  if (s1.created) {
    // 세션 1 메시지 4개 — id 순서 = 대화 순서. created_at도 순서대로.
    const insertMsg = async (fields, createdAtSql) => {
      const { rows: [m] } = await client.query(
        `INSERT INTO public.conversation_messages
           (session_id, user_id, role, content, content_ko, corrections, scores,
            suggestion, provider, client_request_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, ${createdAtSql})
         RETURNING id`,
        [s1.id, user.id, fields.role, fields.content, fields.content_ko ?? null,
         fields.corrections ? JSON.stringify(fields.corrections) : null,
         fields.scores ? JSON.stringify(fields.scores) : null,
         fields.suggestion ?? null, fields.provider ?? null, fields.client_request_id ?? null],
      );
      return m.id;
    };
    firstUserMsgId = await insertMsg({
      role: 'user',
      content: 'Hi Mark, I think we should to go with OfficeMart for our supplies. They have good prices and offer next-day delivery.',
      client_request_id: '11111111-1111-4111-8111-111111111111', // 고정 UUID — 멱등 replay 시연용
    }, `now() - interval '110 minutes'`);
    await insertMsg({
      role: 'assistant',
      content: "Nice try! Let's polish that sentence a bit. OfficeMart sounds like a solid choice — can you tell Mark one more reason why?",
      content_ko: '좋은 시도예요! 문장을 조금 다듬어 볼게요. 근거를 하나 더 말해볼까요?',
      corrections: [CORR1, CORR2],
      scores: { grammar: 74, fluency: 88, vocabulary: 81 },
      suggestion: '근거를 한 가지 더 추가해보세요.',
      provider: 'claude',
    }, `now() - interval '109 minutes'`);
    await insertMsg({
      role: 'user',
      content: 'Sure! They also offer next-day delivery, which saves our team a lot of time.',
    }, `now() - interval '6 minutes'`);
    await insertMsg({
      role: 'assistant',
      content: 'Excellent! That extra detail makes your recommendation much more convincing.',
      content_ko: '훌륭해요! 추가 근거 덕분에 추천이 훨씬 설득력 있어졌어요.',
      corrections: [],
      scores: { grammar: 80, fluency: 90, vocabulary: 83 }, // 점수 2회 — FeedbackPane ↑델타 검증용
      provider: 'claude',
    }, `now() - interval '5 minutes'`);
  }

  if (s2.created) {
    await client.query(
      `INSERT INTO public.conversation_messages (session_id, user_id, role, content, created_at)
       VALUES ($1, $2, 'user', 'Can I get a iced americano, please?', now() - interval '1 day' - interval '10 minutes'),
              ($1, $2, 'assistant', 'Almost perfect! Just say "an iced americano" — iced starts with a vowel sound.', now() - interval '1 day')`,
      [s2.id, user.id],
    );
  }

  // corrections 3행 — due 2 + 미래 1. 재실행 안전(ON CONFLICT ... DO UPDATE로 시드값 복원).
  // 미래 1건은 make_interval(days => $n::int) — ($n || ' days')::interval에 같은 파라미터 재사용 금지(42804).
  const upsertCorrection = (c, { sessionId = null, messageId = null, seenCount = 1, nextReviewSql, extraParams = [] }) =>
    client.query(
      `INSERT INTO public.corrections
         (user_id, session_id, message_id, original, corrected, reason, type, seen_count, next_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${nextReviewSql})
       ON CONFLICT (user_id, dedup_key) DO UPDATE SET
         seen_count = EXCLUDED.seen_count, next_review = EXCLUDED.next_review,
         reason = EXCLUDED.reason, updated_at = now()`,
      [user.id, sessionId, messageId, c.original, c.corrected, c.reason, c.type, seenCount, ...extraParams],
    );
  await upsertCorrection(CORR1, {
    sessionId: s1.id, messageId: firstUserMsgId,
    nextReviewSql: `now() - interval '1 hour'`,
  });
  await upsertCorrection(CORR2, {
    sessionId: s1.id, messageId: firstUserMsgId,
    nextReviewSql: `now()`,
  });
  await upsertCorrection(
    { original: 'I go to school yesterday', corrected: 'I went to school yesterday',
      reason: '과거의 일에는 과거 시제를 써요.', type: 'grammar' },
    { sessionId: s1.id, seenCount: 2, extraParams: [TZ],
      nextReviewSql: `(date_trunc('day', now() AT TIME ZONE $9) + make_interval(days => 3)) AT TIME ZONE $9` },
  );

  // ── 학습(lesson) attempt 시드 1건 (docs/plan/02-lesson.md Phase 1) ────
  // 멱등: 고정 client_request_id + ula_reqid_uq (partial unique index라 WHERE 절까지 명시).
  // 타임스탬프는 make_interval — ($n || ' days')::interval 텍스트 연결 금지(42804).
  // 결과: 시드 직후 진도 = 1/2 (set23 시도됨, set24 미시도).
  await client.query(
    `INSERT INTO public.user_lesson_attempts
       (user_id, lesson_id, answers, correct_count, total_count, elapsed_ms, client_request_id, created_at)
     SELECT $1, l.id, '{"1":"B","2":"A","3":"B"}'::jsonb, 2, 3, 214000,
            '11111111-1111-4111-8111-111111111111'::uuid,
            now() - make_interval(days => 1)
       FROM public.lessons l WHERE l.slug = 'toeic-part7-set23'
     ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING`,
    [user.id],
  );

  const { rows: [counts] } = await client.query(
    `SELECT count(*) FILTER (WHERE review_count = 0)                          AS new,
            count(*) FILTER (WHERE review_count > 0 AND next_review <= now()) AS due,
            count(*) FILTER (WHERE review_count > 0 AND next_review >  now()) AS learned
       FROM public.user_vocab_cards WHERE user_id = $1`,
    [user.id],
  );
  console.log(`시드 완료 — user #${user.id} (${DEV_EMAIL}), 카드: due ${counts.due} / learned ${counts.learned} / new ${counts.new}`);
} finally {
  await client.end();
}
