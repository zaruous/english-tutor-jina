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
