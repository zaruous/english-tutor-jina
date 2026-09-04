// 학습 통계 서비스 — 읽기 전용 집계. AI 호출 0건 (docs/plan/04-progress.md Phase P2).
//
// 계약: 응답 DTO의 필드명은 구현 전 progress.jsx의 mock 객체(PROGRESS_DATA)와 **같다**.
// 필드명을 유지하면 하위 JSX(SkillBar/ProgressWeeklyChart/SessionRow/CorrectionCard)가 무수정이다.
//
// 규범 ②(파생값 서버 단일 소스): 스트릭·주간·스킬·예상 점수는 저장하지 않고 매 요청 계산한다.
// 표시 문자열(weekly[].day='월', recent_sessions[].date='오늘', skills[].color)은 서버가
// 만들지 않는다 — 클라이언트 스토어 매퍼(src/shared/progress-store.jsx)의 몫이다.
//
// 소스가 없는 항목은 정직하게 빈 값으로 내린다:
//  - monthly_scores: 점수 스냅샷 이력 테이블이 없다 → 항상 []
//  - weeks_to_target: 스냅샷 없이는 기울기를 못 낸다 → 항상 null (mock의 "약 8주" 리터럴 대체)
//  - skills의 Listening: LC 레슨(kind='toeic_lc') 정답률. 시도가 없으면 배열에서 제외 (JSX는 map이라 안전)
import { resolvable } from '../lib/content-scope.js';
import { pool } from '../lib/pool.js';
import { listCorrections } from './conversation.service.js';

// ── 테이블 존재 가드 (60초 캐시) ───────────────────────────────────────
// 이 탭은 회화(0004)·학습(0005)·첨삭 복습(0008)이 만든 테이블을 집계한다.
// 어떤 구현/롤백 순서에서도 500이 나지 않게 존재하는 블록만 UNION 한다.
let tablesCache = { at: 0, val: null };
async function presentTables() {
  if (tablesCache.val && Date.now() - tablesCache.at < 60_000) return tablesCache.val;
  const { rows: [r] } = await pool.query(`SELECT
    to_regclass('conversation_sessions') IS NOT NULL AS conv_sessions,
    to_regclass('conversation_messages') IS NOT NULL AS conv_messages,
    to_regclass('corrections')           IS NOT NULL AS corrections,
    to_regclass('correction_reviews')    IS NOT NULL AS correction_reviews,
    to_regclass('content_items')         IS NOT NULL AS lessons,
    to_regclass('user_lesson_attempts')  IS NOT NULL AS attempts,
    to_regclass('user_goals')            IS NOT NULL AS goals`);
  r.conversation = r.conv_sessions && r.conv_messages; // 둘 다 있어야 조인 가능
  r.lesson = r.lessons && r.attempts;
  tablesCache = { at: Date.now(), val: r };
  return r;
}

// ── 활동 원장 ─────────────────────────────────────────────────────────
// total_minutes / sessions_done / streak / weekly 의 공통 소스. 쿼리 1개로 일별 rows를 받아
// JS에서 파생한다 — 같은 정의가 4곳에서 갈라지는 드리프트를 구조적으로 막는다.
// 파라미터는 $1=user_id, $2=tz 고정이라 문자열 조립에 인젝션 표면이 없다.
// 기간 연산은 make_interval / 리터럴 interval 만 — ($n || ' days')::interval 금지(42804).
const ACT_CONV = `
    SELECT (s.started_at AT TIME ZONE $2)::date AS day,
           GREATEST(1, CEIL(EXTRACT(EPOCH FROM (s.last_message_at - s.started_at)) / 60))::int AS minutes,
           1 AS sessions
      FROM conversation_sessions s
     WHERE s.user_id = $1 AND s.last_message_at IS NOT NULL`;
const ACT_LESSON = `
    SELECT (ua.created_at AT TIME ZONE $2)::date AS day,
           GREATEST(1, CEIL(COALESCE(ua.elapsed_ms, 0) / 60000.0))::int AS minutes,
           1 AS sessions
      FROM user_lesson_attempts ua WHERE ua.user_id = $1`;
const ACT_VOCAB = `
    SELECT (r.reviewed_at AT TIME ZONE $2)::date AS day,
           CEIL(COALESCE(r.elapsed_ms, 0) / 60000.0)::int AS minutes,
           0 AS sessions
      FROM vocab_reviews r WHERE r.user_id = $1`;
const ACT_CORR = `
    SELECT (cr.reviewed_at AT TIME ZONE $2)::date AS day,
           CEIL(COALESCE(cr.elapsed_ms, 0) / 60000.0)::int AS minutes,
           0 AS sessions
      FROM correction_reviews cr WHERE cr.user_id = $1`;

function activitySql(t) {
  const blocks = [ACT_VOCAB]; // vocab_reviews는 0002 — 항상 존재
  if (t.lesson) blocks.push(ACT_LESSON);
  if (t.conversation) blocks.push(ACT_CONV);
  if (t.correction_reviews) blocks.push(ACT_CORR);
  return blocks.join('\n    UNION ALL');
}

async function fetchActivity(t, params) {
  const { rows } = await pool.query(
    `SELECT to_char(a.day, 'YYYY-MM-DD') AS day,
            sum(a.minutes)::int  AS minutes,
            sum(a.sessions)::int AS sessions
       FROM (${activitySql(t)}) a
      GROUP BY a.day ORDER BY a.day`,
    params,
  );
  return rows;
}

// 기준일(사용자 TZ) — now()::date(서버 TZ)와 섞으면 자정 부근에서 streak/weekly가 하루 어긋난다.
// ($1은 tz — user_id를 참조하지 않는 쿼리에 미사용 파라미터를 넘기면 42P18(타입 추론 불가)이 난다)
async function fetchAnchorDates(params) {
  const { rows: [r] } = await pool.query(
    `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD')                   AS today,
            to_char((now() AT TIME ZONE $1)::date - 1, 'YYYY-MM-DD')               AS yesterday,
            to_char(date_trunc('week', now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS week_start`,
    [params[1]],
  );
  return r;
}

// 일별 정확도 — weekly에 머지한다. 회화 점수(JSONB 값 평균) + 레슨 정답률을 같은 날짜 버킷으로.
async function fetchDailyAccuracy(t, params) {
  const blocks = [];
  if (t.conversation) {
    blocks.push(`
      SELECT (m.created_at AT TIME ZONE $2)::date AS day, avg(v.value::numeric) AS pct
        FROM conversation_messages m, LATERAL jsonb_each_text(m.scores) v
       WHERE m.user_id = $1 AND m.scores IS NOT NULL GROUP BY 1`);
  }
  if (t.lesson) {
    blocks.push(`
      SELECT (ua.created_at AT TIME ZONE $2)::date AS day,
             avg(ua.correct_count::numeric / ua.total_count * 100) AS pct
        FROM user_lesson_attempts ua WHERE ua.user_id = $1 GROUP BY 1`);
  }
  if (blocks.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT to_char(t.day, 'YYYY-MM-DD') AS day, round(avg(t.pct))::int AS accuracy
       FROM (${blocks.join('\n      UNION ALL')}) t GROUP BY t.day`,
    params,
  );
  return rows;
}

// ── 스킬 ──────────────────────────────────────────────────────────────
// value = 최근 7일 평균, 없으면 전체 평균, 그래도 없으면 스킬 제외.
// delta = (최근 7일 − 직전 7일), 직전 창이 비면 0.
const SKILL_ORDER = ['grammar', 'fluency', 'vocabulary', 'reading', 'listening'];
const SKILL_LABEL = {
  grammar: 'Grammar', fluency: 'Fluency', vocabulary: 'Vocabulary',
  reading: 'Reading', listening: 'Listening',
};

async function fetchConversationSkills(t, params) {
  if (!t.conversation) return [];
  const { rows } = await pool.query(
    `SELECT v.key,
            round(avg(v.value::numeric) FILTER (WHERE m.created_at >  now() - interval '7 days'))::int  AS cur,
            round(avg(v.value::numeric) FILTER (WHERE m.created_at <= now() - interval '7 days'
                                            AND m.created_at >  now() - interval '14 days'))::int      AS prev,
            round(avg(v.value::numeric))::int                                                          AS alltime
       FROM conversation_messages m, LATERAL jsonb_each_text(m.scores) v
      WHERE m.user_id = $1 AND m.scores IS NOT NULL
      GROUP BY v.key`,
    [params[0]],
  );
  return rows;
}

// 레슨 기반 스킬 — kind 로 갈라 집계한다. Reading = Part 5/7, Listening = LC(플랜 08 §2.5).
// 창(7일/직전 7일/전체) 규칙은 회화 스킬과 동일해 toSkill 이 그대로 처리한다.
// 여기에는 가시성 조건을 걸지 않는다(플랜 11 §3 표의 경계). 이 값은 "사용자가 실제로 푼 문항의
// 정답률" 이고 소스는 본인의 attempt 다 — 콘텐츠의 생명주기가 바뀌었다고 과거에 푼 실력이
// 달라지지 않는다. 조건을 걸면 관리자가 콘텐츠를 비공개로 돌리는 순간 스킬 막대가 소급해 흔들린다.
// 같은 이유로 활동 원장(ACT_LESSON)·일별 정확도·최근 세션도 무필터다. 예외는 예상 점수
// (fetchScoreInputs) 하나 — 그쪽은 "시드 문항으로 재는 환산 점수" 라 콘텐츠 범위가 정의의 일부다.
async function fetchLessonSkill(t, params, kinds) {
  if (!t.lesson) return null;
  const { rows: [r] } = await pool.query(
    `SELECT round(avg(pct) FILTER (WHERE created_at >  now() - interval '7 days'))::int AS cur,
            round(avg(pct) FILTER (WHERE created_at <= now() - interval '7 days'
                               AND created_at >  now() - interval '14 days'))::int      AS prev,
            round(avg(pct))::int                                                        AS alltime
       FROM (SELECT ua.created_at, ua.correct_count::numeric / ua.total_count * 100 AS pct
               FROM user_lesson_attempts ua
               JOIN lesson_details l ON l.content_id = ua.content_id AND l.kind = ANY($2::text[])
              WHERE ua.user_id = $1) r`,
    [params[0], kinds],
  );
  return r || null;
}

function toSkill(key, row) {
  if (!row) return null;
  const value = row.cur ?? row.alltime;
  if (value === null || value === undefined) return null;
  const delta = row.cur !== null && row.prev !== null ? row.cur - row.prev : 0;
  return { key, label: SKILL_LABEL[key] || key, value, delta };
}

// ── 예상 점수 ─────────────────────────────────────────────────────────
// v1 산식 (파생값 단일 소스 — 계수를 바꿀 곳은 이 함수 하나뿐):
//   conv   = 최근 30일 conversation_messages.scores 전체 값 평균 (없으면 전체 기간, 그래도 없으면 null)
//   lesson = 최근 30일 레슨 정답률 평균×100 (동일 폴백)
//   acc    = 둘 다 있으면 0.6*conv + 0.4*lesson, 하나면 그 값, 둘 다 null이면 → null
//   score  = clamp(round((400 + acc*4.5) / 5) * 5, 10, 990)   // acc 71 → 720, 5점 단위
// 정밀 예측이 아니라 결정적·설명가능·데이터가 늘면 움직이는 placeholder다.
// 03-dashboard가 예상 점수를 이 정의로 통일하게 되면 이 함수를 import 한다 (산식 2벌 금지).
export function estimateToeicScore(conv, lesson) {
  const acc = conv !== null && lesson !== null ? 0.6 * conv + 0.4 * lesson
    : conv !== null ? conv
    : lesson !== null ? lesson
    : null;
  if (acc === null) return null;
  const raw = Math.round((400 + acc * 4.5) / 5) * 5;
  return Math.max(10, Math.min(990, raw));
}

async function fetchScoreInputs(t, params) {
  const out = { conv: null, lesson: null };
  if (t.conversation) {
    const { rows: [r] } = await pool.query(
      `SELECT avg(v.value::numeric) FILTER (WHERE m.created_at > now() - interval '30 days') AS d30,
              avg(v.value::numeric)                                                          AS dall
         FROM conversation_messages m, LATERAL jsonb_each_text(m.scores) v
        WHERE m.user_id = $1 AND m.scores IS NOT NULL`,
      [params[0]],
    );
    out.conv = r?.d30 ?? r?.dall ?? null;
  }
  if (t.lesson) {
    // source = 'seed' 는 유지한다. 예상 점수는 난도가 보정된 시드 문항으로만 재는 값이고
    // (플랜 07 열린 질문 1 → 08-31 채택), AI 생성 문항 정답률이 섞이면 같은 실력에도 점수가 흔들린다.
    // 여기에 resolvable 을 **더한다** — "이미 푼 것의 집계" 이므로 관리자가 내린(archived) 레슨의
    // 점수는 남아야 하고(discoverable 이면 과거 점수가 통째로 증발한다), 대신 아직 공개되지 않은
    // draft·review 나 남의 비공개 콘텐츠는 애초에 이 사용자의 점수 근거가 될 수 없다.
    const { rows: [r] } = await pool.query(
      `SELECT avg(pct) FILTER (WHERE created_at > now() - interval '30 days') AS d30,
              avg(pct)                                                        AS dall
         FROM (SELECT ua.created_at, ua.correct_count::numeric / ua.total_count * 100 AS pct
                 FROM user_lesson_attempts ua
                 JOIN content_items l ON l.id = ua.content_id AND l.source = 'seed'
                                     AND ${resolvable('l', '$1')}
                WHERE ua.user_id = $1) r`,
      [params[0]],
    );
    out.lesson = r?.d30 ?? r?.dall ?? null;
  }
  return out;
}

// ── 나머지 단건 집계 ──────────────────────────────────────────────────

// 목표: 행이 없으면 INSERT 없이 기본값을 합성한다 (GET은 무부작용).
async function fetchGoal(t, params) {
  const fallback = { target_test: 'TOEIC', target_score: 900 };
  if (!t.goals) return fallback;
  const { rows: [r] } = await pool.query(
    `SELECT COALESCE(target_test, 'TOEIC') AS target_test, target_score
       FROM user_goals WHERE user_id = $1`,
    [params[0]],
  );
  return r || fallback;
}

async function fetchWordsLearned(params) {
  const { rows: [r] } = await pool.query(
    `SELECT count(*)::int AS n FROM user_vocab_cards
      WHERE user_id = $1 AND NOT suspended AND review_count > 0`,
    [params[0]],
  );
  return r?.n ?? 0;
}

// 최근 세션 8개 — 회화 세션과 레슨 시도의 UNION.
// id는 "{kind}-{pk}" 문자열: 두 테이블의 정수 PK가 충돌하므로 key={s.id}를 안전하게 만든다.
async function fetchRecentSessions(t, params) {
  const blocks = [];
  if (t.conversation) {
    blocks.push(`
    SELECT 'conversation' AS kind, s.id AS pk, s.title AS title,
           COALESCE(s.last_message_at, s.started_at) AS at,
           GREATEST(1, CEIL(EXTRACT(EPOCH FROM (s.last_message_at - s.started_at)) / 60))::int AS duration,
           (SELECT round(avg(v.value::numeric))::int
              FROM conversation_messages m, LATERAL jsonb_each_text(m.scores) v
             WHERE m.session_id = s.id AND m.scores IS NOT NULL) AS score,
           (SELECT count(*)::int FROM corrections c WHERE c.session_id = s.id) AS corrections
      FROM conversation_sessions s
     WHERE s.user_id = $1 AND s.last_message_at IS NOT NULL`);
  }
  if (t.lesson) {
    blocks.push(`
    SELECT 'lesson' AS kind, ua.id AS pk,
           NULLIF(l.subtitle, '') AS title, ua.created_at AS at,
           GREATEST(1, CEIL(COALESCE(ua.elapsed_ms, 0) / 60000.0))::int AS duration,
           round(ua.correct_count::numeric / ua.total_count * 100)::int AS score,
           0 AS corrections
      FROM user_lesson_attempts ua
      JOIN lesson_details l ON l.content_id = ua.content_id
     WHERE ua.user_id = $1`);
  }
  if (blocks.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT * FROM (${blocks.join('\n    UNION ALL')}) t ORDER BY t.at DESC LIMIT 8`,
    [params[0]],
  );
  return rows.map((r) => ({
    id: `${r.kind}-${r.pk}`,
    kind: r.kind,
    title: r.title || (r.kind === 'lesson' ? '학습 세트' : '회화'),
    at: r.at,
    duration: r.duration,
    score: r.score, // null 가능 (scores 없는 degraded 세션) — 프론트에 null 가드가 있다
    corrections: r.corrections,
  }));
}

// ── 엔드포인트 본체 ───────────────────────────────────────────────────
// 트랜잭션 없음 — 읽기 전용이고 스냅샷 일관성이 크리티컬하지 않다.
export async function getProgress(user) {
  const t = await presentTables();
  const params = [user.id, user.tz];

  const [
    anchors, activity, dailyAccuracy, convSkills, reading, listening,
    scoreInputs, goal, wordsLearned, recentSessions, correctionsDue,
  ] = await Promise.all([
    fetchAnchorDates(params),
    fetchActivity(t, params),
    fetchDailyAccuracy(t, params),
    fetchConversationSkills(t, params),
    fetchLessonSkill(t, params, ['toeic_part5', 'toeic_part7']),
    fetchLessonSkill(t, params, ['toeic_lc']),
    fetchScoreInputs(t, params),
    fetchGoal(t, params),
    fetchWordsLearned(params),
    fetchRecentSessions(t, params),
    t.corrections
      ? listCorrections(user, { due: true, limit: 20 }) // 01의 SELECT/DTO 재사용 — 중복 정의 금지
      : Promise.resolve({ corrections: [] }),
  ]);

  // total_minutes / sessions_done
  const totalMinutes = activity.reduce((s, r) => s + r.minutes, 0);
  const sessionsDone = activity.reduce((s, r) => s + r.sessions, 0);

  // streak — 오늘이 활동일이면 오늘부터, 아니면 어제부터 역방향 연속 run.
  // (오늘 아직 공부 안 했다고 streak을 0으로 만들지 않는다 — Anki 관행)
  const activeDays = new Set(activity.filter((r) => r.minutes > 0 || r.sessions > 0).map((r) => r.day));
  let streak = 0;
  let cursor = activeDays.has(anchors.today) ? anchors.today
    : activeDays.has(anchors.yesterday) ? anchors.yesterday
    : null;
  while (cursor && activeDays.has(cursor)) {
    streak += 1;
    const d = new Date(`${cursor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }

  // weekly — 이번 주 월~일 7행 고정(0 채움). 표시 라벨('월')은 클라 포맷터의 몫.
  const actByDay = new Map(activity.map((r) => [r.day, r]));
  const accByDay = new Map(dailyAccuracy.map((r) => [r.day, r.accuracy]));
  const weekly = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(`${anchors.week_start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const a = actByDay.get(key);
    weekly.push({
      date: key,
      minutes: a?.minutes ?? 0,
      sessions: a?.sessions ?? 0,
      accuracy: accByDay.has(key) ? accByDay.get(key) : null,
    });
  }

  // skills — 시도가 없는 스킬은 toSkill 이 null 을 내 배열에서 빠진다. color는 스토어 매퍼가 부착한다.
  const convByKey = new Map(convSkills.map((r) => [r.key, r]));
  const lessonSkills = { reading, listening };
  const skills = SKILL_ORDER
    .map((key) => toSkill(key, key in lessonSkills ? lessonSkills[key] : convByKey.get(key)))
    .filter(Boolean);

  const currentScore = estimateToeicScore(
    scoreInputs.conv === null ? null : Number(scoreInputs.conv),
    scoreInputs.lesson === null ? null : Number(scoreInputs.lesson),
  );

  return {
    user: {
      name: user.display_name,
      target_test: goal.target_test,
      target_score: goal.target_score,
      current_score: currentScore,
      streak,
      total_minutes: totalMinutes,
      sessions_done: sessionsDone,
      words_learned: wordsLearned,
    },
    skills,
    weekly,
    monthly_scores: [],  // 점수 스냅샷 이력 테이블 미도입 — 계약만 확정 (후속에서 서버만 바꾼다)
    weeks_to_target: null, // 스냅샷 없이는 기울기 계산 불가 → 프론트가 해당 절을 생략한다
    corrections_due: correctionsDue.corrections,
    recent_sessions: recentSessions,
  };
}
