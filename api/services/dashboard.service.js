// 대시보드 서비스 — 읽기 전용 집계. AI 호출 0건 (docs/plan/03-dashboard.md Phase 2).
//
// 규범 ②(파생값 서버 단일 소스)를 가장 강하게 적용한 탭이다: 스트릭·주간 학습량·정확도·
// 예상 점수·추천은 **저장하지 않고 매 요청 계산**한다. 적재 테이블(daily_progress)이 없는
// 이유는 계획서 "v1이 daily_progress 적재를 안 하는 이유" 참조 — 쓰기 훅 3곳 드리프트 위험.
//
// 신규 원본 데이터는 user_goals(목표 점수/시험일) 1개뿐. 나머지는 전부
// vocab_reviews / user_lesson_attempts / conversation_messages 실시간 집계다.
//
// 테이블 부재 가드: 이 탭은 회화(0004)·학습(0005)이 만드는 테이블을 집계하므로
// 어떤 구현 순서에서도 500이 나지 않게 to_regclass로 존재하는 블록만 UNION 한다.
// 부재 소스의 카드는 정의된 빈 상태(null)를 내려보낸다 — null = "기록 없음", 0 = "전부 틀림".
import { pool } from '../lib/pool.js';
import { fetchStats } from './vocab.service.js';

// ── 테이블 존재 가드 (60초 캐시) ───────────────────────────────────────
let tablesCache = { at: 0, val: null };
async function presentTables() {
  if (tablesCache.val && Date.now() - tablesCache.at < 60_000) return tablesCache.val;
  const { rows: [r] } = await pool.query(`SELECT
    to_regclass('public.lessons')               IS NOT NULL AS lessons,
    to_regclass('public.user_lesson_attempts')  IS NOT NULL AS attempts,
    to_regclass('public.conversation_sessions') IS NOT NULL AS conv_sessions,
    to_regclass('public.conversation_messages') IS NOT NULL AS conv_messages,
    to_regclass('public.corrections')           IS NOT NULL AS corrections,
    to_regclass('public.user_goals')            IS NOT NULL AS goals`);
  r.conversation = r.conv_sessions && r.conv_messages; // 둘 다 있어야 조인 가능
  r.lesson = r.lessons && r.attempts;
  tablesCache = { at: Date.now(), val: r };
  return r;
}

// ── 활동 이벤트 (ACTIVITY_MINUTES) ────────────────────────────────────
// 파라미터는 $1=user_id, $2=tz 고정이므로 문자열 조립에 인젝션 표면이 없다.
// 기간 연산은 make_interval / 리터럴 interval 만 — ($n || ' days')::interval 금지(42804).
const ACT_VOCAB = `
    SELECT (reviewed_at AT TIME ZONE $2)::date AS day,
           LEAST(COALESCE(elapsed_ms, 10000), 120000) / 60000.0 AS minutes
      FROM public.vocab_reviews WHERE user_id = $1`;
const ACT_LESSON = `
    SELECT (ua.created_at AT TIME ZONE $2)::date AS day,
           LEAST(COALESCE(ua.elapsed_ms, l.est_minutes * 60000), 1800000) / 60000.0 AS minutes
      FROM public.user_lesson_attempts ua
      JOIN public.lessons l ON l.id = ua.lesson_id
     WHERE ua.user_id = $1`;
const ACT_CONV = `
    SELECT (m.created_at AT TIME ZONE $2)::date AS day, 0.5 AS minutes
      FROM public.conversation_messages m
      JOIN public.conversation_sessions s ON s.id = m.session_id
     WHERE s.user_id = $1 AND m.role = 'user'`;

function activitySql(t) {
  const blocks = [ACT_VOCAB]; // vocab_reviews는 0002 — 항상 존재
  if (t.lesson) blocks.push(ACT_LESSON);
  if (t.conversation) blocks.push(ACT_CONV);
  return blocks.join('\n    UNION ALL');
}

const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일']; // isodow 1..7

// ── 개별 집계 ──────────────────────────────────────────────────────────

// 오늘부터 역방향 연속 활동일. 오늘 활동이 없으면 어제를 앵커로 삼는다
// (자정을 넘겼을 뿐 스트릭이 끊긴 게 아니다).
async function fetchStreak(t, params) {
  const { rows: [r] } = await pool.query(
    `WITH act AS (SELECT DISTINCT a.day AS d FROM (${activitySql(t)}) a),
     anchor AS (
       SELECT CASE WHEN EXISTS (SELECT 1 FROM act WHERE d = (now() AT TIME ZONE $2)::date)
                   THEN (now() AT TIME ZONE $2)::date
                   ELSE (now() AT TIME ZONE $2)::date - 1 END AS a)
     SELECT count(*)::int AS streak
       FROM (SELECT d, (row_number() OVER (ORDER BY d DESC) - 1)::int AS off
               FROM act, anchor WHERE d <= anchor.a) t, anchor
      WHERE t.d = anchor.a - t.off`,
    params,
  );
  return r?.streak ?? 0;
}

// 이번 주 월~일 항상 7칸 (generate_series). 미래 날짜는 0분.
async function fetchWeekly(t, params) {
  const { rows } = await pool.query(
    `SELECT to_char(d.date, 'YYYY-MM-DD') AS date,
            extract(isodow from d.date)::int AS isodow,
            (d.date = (now() AT TIME ZONE $2)::date) AS today,
            COALESCE(round(sum(m.minutes)), 0)::int AS minutes
       FROM (SELECT (date_trunc('week', now() AT TIME ZONE $2)::date + g)::date AS date
               FROM generate_series(0, 6) g) d
       LEFT JOIN (${activitySql(t)}) m ON m.day = d.date
      GROUP BY d.date ORDER BY d.date`,
    params,
  );
  return rows.map((r) => ({
    date: r.date,
    dow: DOW_LABELS[r.isodow - 1],
    minutes: r.minutes,
    today: r.today,
  }));
}

// 지난주(월~일) 합계 — week_change_pct의 분모.
async function fetchLastWeekMinutes(t, params) {
  const { rows: [r] } = await pool.query(
    `SELECT COALESCE(round(sum(m.minutes)), 0)::int AS minutes
       FROM (${activitySql(t)}) m
      WHERE m.day >= date_trunc('week', now() AT TIME ZONE $2)::date - 7
        AND m.day <  date_trunc('week', now() AT TIME ZONE $2)::date`,
    params,
  );
  return r?.minutes ?? 0;
}

// 복습 정답률 — result <> 'again' 이 pass. 30일 창 / 직전 30일 창 / 전체 기간.
async function fetchReviewAccuracy(params) {
  const { rows: [r] } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE reviewed_at > now() - interval '30 days' AND result <> 'again')::int AS pass_30,
       count(*) FILTER (WHERE reviewed_at > now() - interval '30 days')::int                      AS total_30,
       count(*) FILTER (WHERE reviewed_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'
                          AND result <> 'again')::int                                             AS pass_prev,
       count(*) FILTER (WHERE reviewed_at BETWEEN now() - interval '60 days' AND now() - interval '30 days')::int
                                                                                                  AS total_prev,
       count(*) FILTER (WHERE result <> 'again')::int AS pass_all,
       count(*)::int                                 AS total_all
       FROM public.vocab_reviews WHERE user_id = $1`,
    [params[0]],
  );
  return r;
}

// 레슨 정답률 — correct_count/total_count 합산. 같은 3개 창.
async function fetchLessonAccuracy(t, params) {
  if (!t.lesson) {
    return { pass_30: 0, total_30: 0, pass_prev: 0, total_prev: 0, pass_all: 0, total_all: 0 };
  }
  const { rows: [r] } = await pool.query(
    `SELECT
       COALESCE(sum(correct_count) FILTER (WHERE created_at > now() - interval '30 days'), 0)::int AS pass_30,
       COALESCE(sum(total_count)   FILTER (WHERE created_at > now() - interval '30 days'), 0)::int AS total_30,
       COALESCE(sum(correct_count) FILTER (WHERE created_at BETWEEN now() - interval '60 days'
                                                              AND now() - interval '30 days'), 0)::int AS pass_prev,
       COALESCE(sum(total_count)   FILTER (WHERE created_at BETWEEN now() - interval '60 days'
                                                              AND now() - interval '30 days'), 0)::int AS total_prev,
       COALESCE(sum(correct_count), 0)::int AS pass_all,
       COALESCE(sum(total_count), 0)::int   AS total_all
       FROM public.user_lesson_attempts WHERE user_id = $1`,
    [params[0]],
  );
  return r;
}

// 목표: 행이 없으면 INSERT 없이 기본값만 합성한다 (GET은 무부작용).
async function fetchGoal(t, params) {
  if (!t.goals) return { target_score: 900, exam_date: null, d_day: null };
  const { rows: [r] } = await pool.query(
    `SELECT target_score,
            to_char(exam_date, 'YYYY-MM-DD') AS exam_date,
            (exam_date - (now() AT TIME ZONE $2)::date)::int AS d_day
       FROM public.user_goals WHERE user_id = $1`,
    params,
  );
  if (!r) return { target_score: 900, exam_date: null, d_day: null };
  return { target_score: r.target_score, exam_date: r.exam_date, d_day: r.d_day };
}

// 최근 레슨 점수 2건 — 최신 점수 + 직전 대비 델타.
async function fetchLastLessonScores(t, params) {
  if (!t.lesson) return { score: null, delta: null };
  const { rows } = await pool.query(
    `SELECT round(correct_count::numeric / total_count * 100)::int AS score
       FROM public.user_lesson_attempts WHERE user_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 2`,
    [params[0]],
  );
  if (rows.length === 0) return { score: null, delta: null };
  return {
    score: rows[0].score,
    delta: rows.length > 1 ? rows[0].score - rows[1].score : null,
  };
}

// 추천 레슨: 미시도 → 최저 정답 순. 추천 카드와 오늘의 학습(학습 항목)의 단일 소스.
async function fetchRecommendedLesson(t, params) {
  if (!t.lesson) return null;
  const { rows: [r] } = await pool.query(
    `SELECT l.id, l.title, l.subtitle, l.est_minutes,
            (SELECT count(*)::int FROM public.lesson_items i WHERE i.lesson_id = l.id) AS question_count
       FROM public.lessons l
       LEFT JOIN LATERAL (SELECT count(*)::int AS cnt, max(correct_count)::int AS best
                            FROM public.user_lesson_attempts ua
                           WHERE ua.user_id = $1 AND ua.lesson_id = l.id) a ON true
      WHERE l.published
      ORDER BY COALESCE(a.cnt, 0) ASC, a.best ASC NULLS FIRST, l.position, l.id
      LIMIT 1`,
    [params[0]],
  );
  return r || null;
}

// 오늘(유저 TZ) 활동 플래그 — today_plan의 done 판정.
async function fetchTodayFlags(t, params) {
  const parts = [
    `(SELECT count(*)::int FROM public.vocab_reviews
       WHERE user_id = $1 AND (reviewed_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)
       AS vocab_reviews`,
  ];
  parts.push(t.lesson
    ? `EXISTS (SELECT 1 FROM public.user_lesson_attempts
                WHERE user_id = $1 AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)
       AS lesson_done`
    : `false AS lesson_done`);
  parts.push(t.conversation
    ? `EXISTS (SELECT 1 FROM public.conversation_messages m
                JOIN public.conversation_sessions s ON s.id = m.session_id
               WHERE s.user_id = $1 AND m.role = 'user'
                 AND (m.created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)
       AS conversation_done`
    : `false AS conversation_done`);
  const { rows: [r] } = await pool.query(`SELECT ${parts.join(', ')}`, params);
  return r;
}

// 최근 첨삭 1건 + 전체 건수. 실제 스키마 컬럼은 explanation이 아니라 reason이다
// (db/migrations/0004_conversation.sql \d corrections 실측) — DTO에서 explanation으로 매핑한다.
// 01의 스키마가 바뀌면 이 쿼리 한 곳만 고치면 된다.
async function fetchRecentCorrection(t, params) {
  if (!t.corrections) return null;
  const { rows: [r] } = await pool.query(
    `SELECT original, corrected, reason, created_at,
            (SELECT count(*)::int FROM public.corrections c2 WHERE c2.user_id = $1) AS total_count
       FROM public.corrections WHERE user_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [params[0]],
  );
  if (!r) return null;
  return {
    original: r.original,
    corrected: r.corrected,
    explanation: r.reason,
    created_at: r.created_at,
    total_count: r.total_count,
  };
}

// ── 산식 헬퍼 ─────────────────────────────────────────────────────────
const pooledPct = (pass, total) => (total > 0 ? Math.round((pass / total) * 100) : null);

// v1 휴리스틱: 실제 TOEIC 환산표가 아니다. 풀링 정답률(0..1)을 200~990에 선형 사상하고
// 5점 단위로 맞춘다 (acc 0 → 200, acc 1 → 990). 채점 이력이 3문항 미만이면 null.
function predictScore(acc, qTotal) {
  if (qTotal < 3 || acc === null) return null;
  return 5 * Math.round((200 + 790 * acc) / 5);
}

// ── 엔드포인트 본체 ───────────────────────────────────────────────────
// 트랜잭션 없음 — 읽기 전용이고 스냅샷 일관성이 크리티컬하지 않다. 풀 커넥션을 물지 않는다.
export async function getDashboard(user) {
  const t = await presentTables();
  const params = [user.id, user.tz];

  const [
    streakDays, weeklyDays, lastWeekMinutes, rAcc, qAcc,
    goal, lastLesson, recLesson, todayFlags, recentCorrection, vocabStats,
  ] = await Promise.all([
    fetchStreak(t, params),
    fetchWeekly(t, params),
    fetchLastWeekMinutes(t, params),
    fetchReviewAccuracy(params),
    fetchLessonAccuracy(t, params),
    fetchGoal(t, params),
    fetchLastLessonScores(t, params),
    fetchRecommendedLesson(t, params),
    fetchTodayFlags(t, params),
    fetchRecentCorrection(t, params),
    fetchStats(user.id), // vocab.service.js 재사용 — due 집계 중복 구현 금지
  ]);

  const weekMinutes = weeklyDays.reduce((sum, d) => sum + d.minutes, 0);
  const weekChangePct = lastWeekMinutes > 0
    ? Math.round(((weekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100)
    : null;

  // 풀링 정확도 — 복습(pass=result<>'again') + 레슨(correct/total)을 한 분수로 합친다.
  const pass30 = rAcc.pass_30 + qAcc.pass_30;
  const total30 = rAcc.total_30 + qAcc.total_30;
  const accuracyPct = pooledPct(pass30, total30);
  const prevPct = pooledPct(rAcc.pass_prev + qAcc.pass_prev, rAcc.total_prev + qAcc.total_prev);
  const accuracyChange = accuracyPct !== null && prevPct !== null ? accuracyPct - prevPct : null;

  const predictedScore = predictScore(
    total30 > 0 ? pass30 / total30 : null,
    qAcc.total_30,
  );

  // 복습 큐 = suspended=false AND next_review<=now() (new 포함) — 단어장 탭과 같은 정의.
  // stats.due(review_count>0) + stats.new 로 재구현 없이 얻는다.
  const queue = vocabStats.due + vocabStats.new;

  // ── today_plan (파생 3항목, 저장 안 함. 테이블 부재 항목은 배열에서 제외) ──
  const items = [];
  if (t.conversation) {
    items.push({
      key: 'conversation',
      title: 'Jina와 회화',
      sub: todayFlags.conversation_done ? '오늘 대화 완료' : '오늘 아직 대화 없음',
      mins: 8,
      done: todayFlags.conversation_done,
      nav: 'conversation',
    });
  }
  if (t.lesson) {
    items.push({
      key: 'lesson',
      title: recLesson?.title || 'TOEIC 학습',
      sub: recLesson?.subtitle || '학습 세트를 풀어보세요',
      mins: recLesson?.est_minutes ?? 6,
      done: todayFlags.lesson_done,
      nav: 'lesson',
    });
  }
  items.push({
    key: 'vocab',
    title: '단어 복습',
    sub: `${queue}개 · SRS`,
    mins: Math.max(5, Math.ceil(queue * 0.5)),
    done: queue === 0 && todayFlags.vocab_reviews > 0,
    nav: 'vocabulary',
  });
  const doneCount = items.filter((it) => it.done).length;

  // ── skills: 고정 4행. listening/speaking은 v1에 데이터 소스가 없다 → pct null ──
  const lessonPct = pooledPct(qAcc.pass_30, qAcc.total_30) ?? pooledPct(qAcc.pass_all, qAcc.total_all);
  const reviewPct = pooledPct(rAcc.pass_30, rAcc.total_30) ?? pooledPct(rAcc.pass_all, rAcc.total_all);
  const skills = [
    { key: 'listening', label: 'Listening', pct: null, score_text: '데이터 없음' },
    { key: 'reading', label: 'Reading', pct: lessonPct,
      score_text: lessonPct === null ? '데이터 없음' : `레슨 정답률 ${lessonPct}%` },
    { key: 'speaking', label: 'Speaking', pct: null, score_text: '데이터 없음' },
    { key: 'vocab', label: 'Vocabulary', pct: reviewPct,
      score_text: reviewPct === null ? '데이터 없음' : `복습 정답률 ${reviewPct}%` },
  ];

  // ── recommendations: 규칙 기반, AI 호출 없음. mock의 "매칭 %"는 근거가 없어 폐기 ──
  const recommendations = [];
  if (queue > 0) {
    recommendations.push({
      tag: '단어',
      title: `복습 대기 ${queue}개`,
      sub: `SRS 큐 비우기 · 약 ${Math.max(5, Math.ceil(queue * 0.5))}분`,
      nav: 'vocabulary',
    });
  }
  if (recLesson) {
    recommendations.push({
      tag: '시험대비',
      title: recLesson.subtitle || recLesson.title,
      sub: `${recLesson.question_count}문항 · 약 ${recLesson.est_minutes}분`,
      nav: 'lesson',
    });
  }
  recommendations.push({
    tag: '회화', title: 'Jina와 8분 회화', sub: '첨삭을 받아보세요', nav: 'conversation',
  });

  return {
    user: { display_name: user.display_name },
    stats: {
      streak_days: streakDays,
      week_minutes: weekMinutes,
      week_change_pct: weekChangePct,
      predicted_score: predictedScore,
      accuracy_pct: accuracyPct,
      accuracy_change: accuracyChange,
    },
    goal: {
      target_score: goal.target_score,
      exam_max: 990,
      exam_date: goal.exam_date,
      d_day: goal.d_day,
      predicted_score: predictedScore,
      last_lesson_score: lastLesson.score,
      last_lesson_delta: lastLesson.delta,
    },
    today_plan: { done: doneCount, total: items.length, items },
    skills,
    weekly: { total_minutes: weekMinutes, days: weeklyDays },
    recent_correction: recentCorrection,
    recommendations,
  };
}
