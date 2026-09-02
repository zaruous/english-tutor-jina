---
# status: draft | in_progress | done · phase.status: done | pending_verification | todo
plan: "03"
title: "대시보드 탭 (읽기 전용 집계 API + user_goals)"
status: done
created: 2026-08-19
updated: 2026-08-19
depends_on: ["PLAN-vocab-backend", "01", "02"]
migrations: ["0007_user_goals"]
phases:
  - { id: "1", name: "DB — user_goals + dev 시드", status: done }
  - { id: "2", name: "API — dashboard.service / dashboard.routes (실시간 집계)", status: done }
  - { id: "3", name: "프론트 컷오버 — dashboard-store.jsx / 데스크탑·모바일", status: done }
  - { id: "4", name: "자동 검증 — e2e-dashboard.mjs", status: done }
verify: ["scripts/e2e-dashboard.mjs"]
follow_ups:
  - "daily_progress 적재 테이블 (v1은 실시간 집계)"
  - "목표 편집 UI + PATCH /api/dashboard/goal"
---

# 03 — 대시보드 탭 (읽기 전용 집계 API + user_goals)

> 단어장(vocabulary) 탭에서 확립한 패턴을 대시보드 탭에 복제한다:
> ① `db/migrations/NNNN_*.sql` 마이그레이션 규범 ② DTO + 파생값 서버 단일 소스
> ③ Context 스토어(`vocab-store.jsx` 패턴). **④ CLI 프록시는 이번 탭에서 미적용** —
> 대시보드는 읽기 전용 집계라 AI 호출이 0건이다 (`api/ai/schemas.js`/`prompts.js` 무수정).
> 이 문서는 다음 세션의 구현 에이전트가 그대로 실행하는 실행 계획서다.
> 패턴 원본: `db/migrations/0002_vocab.sql`, `api/services/vocab.service.js`,
> `api/routes/vocab.routes.js`, `src/shared/vocab-store.jsx`, `scripts/e2e-vocab.mjs`.

## Context — 현황

`src/screens/dashboard-desktop.jsx`와 `src/screens/mobile.jsx`(MobileDashboard)는 **완전 무상태
UI 프로토타입**이다. `DashboardDesktop`(:611-643)은 props로 `{theme}`만 받고, 모든 수치가
리프 컴포넌트 안의 리터럴이다. state도, fetch도, Context도 없다 — 데이터 주입 시임(seam)이
아예 없으므로 이번 작업의 절반은 시임을 만드는 것이다(`useDashboard` 훅 직접 호출 방식).

| 하드코딩 | 위치 (2026-08-19 기준 실측 라인) |
|---|---|
| 연속 24일 / 주 4.2h / 예상 845 / 정확도 87%(+4%) | `StatStrip` :206-211 |
| 오늘의 학습 4항목(2/4 완료) + 날짜 "5월 26일 · 화요일" | `TodayPlan` items :244-249, 날짜 :254, 완료 :258-261 |
| 예상 845 / 목표 900 / D-42 / 지난 모의고사 825 ↑20 / "Part 5 +35점" | `GoalRing` :324(상수), :331(D-42), :346-348(링), :355, :365, :370-374, :376-379 |
| Listening 92 / Reading 76 / Speaking 64 / Writing 58 | `SkillCard` :388-393 |
| 첨삭 예문("If I would have known…") + "어제 19:42" + "24건" | `CorrectionsCard` :432, :440-466, :475 |
| 추천 3건(매칭 96% 등) | `RecommendCard` :485-489, 매칭% :515 |
| 주간 차트 월28/화45/…/일0 + "총 4시간 12분 · 평균보다 32% 많음" | `WeeklyChart` days :530-538, max :539, 문구 :545 |
| 헤더 스트릭 "24일 연속" | `TopBar` :596-598 |
| 사용자 "이수민 / 토익 목표 900" | `Sidebar` :106-117 (이름 :113, 목표 :114) |
| 인사말 "수민님" + 칩 "오늘 09:24" + 추천 문구 | `HeroCard` :159, :165-176 |
| (모바일) 날짜/이름 :17-19, 스트릭 :29, 링 0.94·845·900·↑20 :100-110, 미니 통계 4.2h/87% :117-120, "2/4 완료 · 13분 남음" :146, 링 0.5 :153, 플랜 4항목 :159-163, 첨삭 :204-209, 추천 2건 :222-225 | `MobileDashboard`(mobile.jsx :6-254) |

### 목표

1. `GET /api/dashboard` 하나로 대시보드 전체 데이터를 내린다 — **모든 산식은 서버, 저장하지
   않고 매 요청 계산** (단어장 `status` 규범과 동일).
2. 신규 테이블은 **`user_goals` 1개뿐** (목표 점수/시험일 — 집계 불가능한 유일한 원본 데이터).
   `daily_progress` 적재 테이블은 **v2 후속** — v1은 `vocab_reviews` /
   `user_lesson_attempts` / `conversation_messages` 실시간 집계.
3. `src/shared/dashboard-store.jsx` Context 스토어 — Provider 부재 시(캔버스) 데모 DTO fallback.
4. **테이블 부재 폴백**: 이 탭은 01(회화)·02(학습)이 만드는 테이블을 집계하므로 구현 순서상
   마지막이 정상이지만, 어떤 순서로 구현돼도 500이 나지 않게 `to_regclass` 가드로 존재하는
   테이블만 UNION 한다. 부재 시 해당 카드는 정의된 **빈 상태**를 렌더한다.

### 01/02 테이블 전제 (이 문서가 가정하는 계약)

| 출처 | 테이블 | 이 문서가 쓰는 컬럼 | 상태 |
|---|---|---|---|
| 단어장(완료) | `vocab_reviews` | `user_id, reviewed_at, result, elapsed_ms` | 실존 (0002) |
| 단어장(완료) | `user_vocab_cards` | due 집계 (`vocab.service.js fetchStats` 재사용) | 실존 |
| 02-lesson.md | `lessons`, `lesson_items`, `user_lesson_attempts` | `ua.user_id, ua.created_at, ua.correct_count, ua.total_count, ua.elapsed_ms`, `l.title, l.subtitle, l.est_minutes, l.published, l.position` | 문서 확정 (0004/0005) |
| 01-conversation.md (미작성) | `conversation_sessions(id, user_id)`, `conversation_messages(session_id, role, created_at)`, `corrections(user_id, original, corrected, explanation, created_at)` | 좌기 | **가정** — 01 문서 확정 시 컬럼명이 다르면 `dashboard.service.js`의 해당 SELECT 문자열 상수 한 곳만 수정 |

⛔ 기존 앱 소유 테이블(`study_sessions`, `session_messages`, `session_corrections`,
`vocabulary` 등 11개)은 이름이 비슷해도 **절대 집계에 쓰지 않는다** — 다른 앱의 데이터다.

### 단어장 구현에서 겪은 함정 → 이 문서에서의 적용

| 함정 | 적용 |
|---|---|
| PG 42804: 같은 파라미터를 `::int` 캐스트와 `\|\|` 텍스트 연결에 재사용 금지 | 기간 연산은 전부 `make_interval(days => $n::int)` 또는 리터럴 `interval '30 days'`. 시드의 시험일도 `(now() AT TIME ZONE $2)::date + 42` 정수 덧셈 |
| pg BIGINT/NUMERIC 문자열 반환 | `api/lib/pool.js`에 `setTypeParser(20/1700, Number)` **이미 적용됨** — 재작업 금지. 집계 `count/sum`은 습관대로 SQL에서 `::int` 캐스트 |
| 인증/CSRF/CORS/READONLY 미들웨어 이미 존재 | `requireUser`(api/middleware/auth.js) 사용. GET 전용 탭이라 CSRF/READONLY는 사실상 무관하지만 전역 처리(`api/server.js:34-41`)라 신경 쓸 것 없음 — **재구현 금지** |
| 시드 타임스탬프는 now() 상대시각 | `user_goals.exam_date = 오늘+42일` (상대) → D-42가 언제 시드해도 재현. 고정 날짜 금지 |
| 캔버스는 main.jsx를 안 탐 | `DashboardProvider`는 main.jsx 경로에만. `useDashboard`는 fallback 필수 — 캔버스 아트보드(app.jsx :94-99)가 Provider 없이 대시보드를 렌더한다. **새 `<script>`는 index.html/canvas.html 둘 다** |
| 기존 테이블 11개는 다른 앱 소유 | 신규 1개(`user_goals`)는 충돌 없음 — 확인 완료. 집계 쿼리도 기존 11개를 참조하지 않음 |
| 적용된 마이그레이션 수정 금지 | 신규 파일 번호는 **구현 시점에 `ls db/migrations` 최신 번호+1** (0004/0005는 02가, 그다음 번호대는 01이 사용할 예정). 아래에서는 `00XX_user_goals.sql`로 표기 — 구현 에이전트가 번호를 채운다. 0001~0003(및 그 사이 적용분) 절대 무수정 |

### v1이 daily_progress 적재를 안 하는 이유 (기록)

① 적재 테이블은 회화/학습/단어장 3곳에 쓰기 훅이 필요해 드리프트 위험(파생값 저장 금지
규범 위반)이고 ② 교차 테이블 SQL VIEW는 01/02 테이블이 아직 없는 DB에서 생성 자체가
실패한다. 실시간 집계는 유저당 행 수천 건 규모에서 인덱스(`vocab_reviews_user_time_idx`,
02의 `ula_user_time_idx`)로 충분히 싸다. 성능이 문제 되면 그때 `daily_progress`를 v2로.

---

## 산식 정의 (파생값 명세 — 전부 서버, 유저 TZ 기준)

### 활동 이벤트 (ACTIVITY_MINUTES — 존재하는 테이블만 동적 UNION ALL)

| 소스 | 시각 | 분(minutes) 환산 | 상한 |
|---|---|---|---|
| `vocab_reviews` | `reviewed_at` | `COALESCE(elapsed_ms, 10000)/60000.0` (기록 없으면 10초 추정) | 건당 2분 |
| `user_lesson_attempts` | `created_at` | `COALESCE(elapsed_ms, l.est_minutes*60000)/60000.0` | 건당 30분 |
| `conversation_messages (role='user')` | `created_at` | 건당 고정 0.5분 | — |

```sql
-- 각 블록은 to_regclass 가드 통과 시에만 조립된다. $1=user_id, $2=tz
SELECT (reviewed_at AT TIME ZONE $2)::date AS day,
       LEAST(COALESCE(elapsed_ms, 10000), 120000) / 60000.0 AS minutes
  FROM public.vocab_reviews WHERE user_id = $1
UNION ALL
SELECT (ua.created_at AT TIME ZONE $2)::date,
       LEAST(COALESCE(ua.elapsed_ms, l.est_minutes * 60000), 1800000) / 60000.0
  FROM public.user_lesson_attempts ua JOIN public.lessons l ON l.id = ua.lesson_id
 WHERE ua.user_id = $1
UNION ALL
SELECT (m.created_at AT TIME ZONE $2)::date, 0.5
  FROM public.conversation_messages m
  JOIN public.conversation_sessions s ON s.id = m.session_id
 WHERE s.user_id = $1 AND m.role = 'user'
```

### 각 수치의 정의와 빈 상태

| 필드 | 산식 | 데이터 없음(신규 사용자) |
|---|---|---|
| `stats.streak_days` | 활동일(위 UNION의 DISTINCT date) 중 **오늘부터 역방향 연속일수. 오늘 활동이 없으면 어제를 앵커로** (자정 전엔 스트릭이 안 끊긴 것) | `0` |
| `stats.week_minutes` | 이번 주(유저 TZ, **월요일 시작** `date_trunc('week', …)`) 활동 분 합계, 정수 반올림 | `0` |
| `stats.week_change_pct` | `round((이번주-지난주)/지난주*100)`. 지난주 0분이면 | `null` → 프론트가 비교 문구 생략 |
| `stats.accuracy_pct` | 최근 30일 풀링 정답률: `round(100 * (r_pass + q_correct) / (r_total + q_total))` — r=vocab_reviews(`result<>'again'`이 pass), q=attempts(`correct_count/total_count` 합산) | 분모 0이면 `null` → "—" 렌더 |
| `stats.accuracy_change` | 직전 30일(30~60일 전) 같은 산식과의 차이(퍼센트포인트) | 직전 창 비면 `null` |
| `stats.predicted_score` | `q_total >= 3`(레슨 1회 이상 채점) 조건에서 `5 * round((200 + 790 * acc30)/5)` — acc30은 위 풀링 비율(0..1). acc 0→200, 1→990. **v1 휴리스틱임을 코드 주석에 명시** | `q_total < 3`이면 `null` → GoalRing 빈 상태 |
| `goal.d_day` | `exam_date - 오늘(유저 TZ)` 일수 | `exam_date` null이면 `null` → D-배지 숨김 |
| `goal.last_lesson_score` / `last_lesson_delta` | 최신 attempt의 `round(correct/total*100)`, delta는 직전 attempt 대비 | attempt 0건이면 둘 다 `null` (레이블도 "최근 레슨"으로 교체 — mock "지난 모의고사"는 데이터가 없다) |
| `today_plan` | 파생 3항목(저장 안 함): ① 회화 — done=`오늘 user 메시지 존재`, mins 8 ② 학습 — done=`오늘 attempt 존재`, sub=추천 레슨 subtitle, mins=est_minutes ③ 단어 — sub=`` `${due}개 · SRS` ``, done=`due==0 AND 오늘 리뷰>0`, mins=`max(5, ceil(due*0.5))`. 테이블 부재 항목은 **배열에서 제외** | 전 항목 done=false. `done/total`은 items에서 계산 |
| `skills` | 고정 4행: reading=`레슨 30일 정답률`(없으면 전체 기간), vocab=`복습 30일 정답률`, listening/speaking=**v1 데이터 없음** → `pct:null, score_text:'데이터 없음'` | pct null → 바 0% + dim 텍스트 |
| `recent_correction` | `corrections` 최신 1행 + `total_count` | 테이블 부재 또는 0행 → `null` → 카드가 빈 상태("회화 첨삭이 쌓이면 여기 표시돼요" + 회화 탭 CTA). 모바일은 카드 자체 숨김 |
| `recommendations` | **규칙 기반, AI 호출 없음**: ① due>0이면 `{tag:'단어', title:'복습 대기 N개', nav:'vocabulary'}` ② 미시도→최저점 순 레슨 1건 `{tag:'시험대비', title:l.subtitle, sub:'N문항 · 약 M분', nav:'lesson'}` ③ 항상 `{tag:'회화', title:'Jina와 8분 회화', nav:'conversation'}`. mock의 "매칭 %"는 폐기(근거 없는 수치는 내리지 않는다) | 최소 ③ 1건은 항상 존재 |
| `weekly.days` | 이번 주 월~일 **항상 7칸** (`generate_series(0,6)`), 미래 날짜 0분, `today` 플래그 | 전부 0 |

스트릭 SQL (act = 위 UNION의 DISTINCT date 버전):

```sql
WITH act AS ( /* DISTINCT (…)::date 동적 UNION */ ),
anchor AS (
  SELECT CASE WHEN EXISTS (SELECT 1 FROM act WHERE d = (now() AT TIME ZONE $2)::date)
              THEN (now() AT TIME ZONE $2)::date
              ELSE (now() AT TIME ZONE $2)::date - 1 END AS a)
SELECT count(*)::int AS streak
  FROM (SELECT d, row_number() OVER (ORDER BY d DESC) - 1 AS off
          FROM act, anchor WHERE d <= anchor.a) t, anchor
 WHERE t.d = anchor.a - t.off;
```

주간 SQL:

```sql
SELECT d.date, COALESCE(round(sum(m.minutes)), 0)::int AS minutes
  FROM (SELECT (date_trunc('week', now() AT TIME ZONE $2)::date + g)::date AS date
          FROM generate_series(0, 6) g) d
  LEFT JOIN ( /* ACTIVITY_MINUTES */ ) m ON m.day = d.date
 GROUP BY d.date ORDER BY d.date;
```

---

## Phase 1 — DB (`db/migrations/00XX_user_goals.sql` + dev 시드 확장)

번호 규칙: 구현 시점에 `ls db/migrations` 마지막 번호 +1 (아래 `00XX`를 치환).
BOM 없는 UTF-8, `npm run db:migrate`로만 적용 (psql -f 금지 — 한글 깨짐 실측).

### `db/migrations/00XX_user_goals.sql`

```sql
CREATE TABLE IF NOT EXISTS public.user_goals (
  user_id       BIGINT      PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  target_score  SMALLINT    NOT NULL DEFAULT 900,
  exam_date     DATE,                              -- null 허용 → D-day 배지 숨김
  daily_minutes SMALLINT    NOT NULL DEFAULT 35,   -- 후속(오늘의 학습 목표 게이지)용, v1 미사용
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_goals_target_ck  CHECK (target_score BETWEEN 10 AND 990),
  CONSTRAINT user_goals_daily_ck   CHECK (daily_minutes BETWEEN 5 AND 600)
);
```

인덱스 불필요(PK = user_id 단건 조회뿐). `user_goals` 행이 없는 사용자는 서비스가
기본값 `{target_score: 900, exam_date: null}`을 **INSERT 없이** 응답으로만 합성한다
(GET은 무부작용 — 목표 편집 UI는 05-settings 후속, `PATCH /api/dashboard/goal`도 그때).

### `db/migrations/00XX_user_goals.down.sql`

```sql
DROP TABLE IF EXISTS public.user_goals;
```

### `db/migrate.mjs` 수정 — RESET_TABLES 확장

`db/migrate.mjs:22`의 `RESET_TABLES` 배열에서 **`'users'` 앞**(FK 역순)에 `'user_goals'` 추가.
(02가 이미 `'user_lesson_attempts', 'lesson_items', 'lessons'`를 맨 앞에 넣었을 것 — 그 유무와
무관하게 `'users'` 앞이면 된다.) `FOREIGN_TABLES`(:31-35) self-assert가 이름 충돌을 재검증한다.

### `db/seeds/dev.mjs` 확장 — 목표 1행

기존 카드 시드 루프(dev.mjs :51-75) 뒤에 추가:

```js
await client.query(
  `INSERT INTO public.user_goals (user_id, target_score, exam_date)
   VALUES ($1, 900, (now() AT TIME ZONE $2)::date + 42)
   ON CONFLICT (user_id) DO UPDATE
     SET target_score = EXCLUDED.target_score, exam_date = EXCLUDED.exam_date, updated_at = now()`,
  [user.id, TZ],
);
```

`+ 42`는 date에 정수 덧셈(일 단위) — 시드가 언제 돌아도 **D-42 재현**. 고정 날짜 금지.

**완료 판정**: `npm run db:migrate && npm run db:seed` → `npm run db:status` 전부 applied,
MODIFIED 없음. `select target_score, exam_date - current_date as dday from user_goals`
→ `900 | 42`. `npm run db:rollback` → 재적용 왕복 성공.

---

## Phase 2 — API (`api/services/dashboard.service.js` + `api/routes/dashboard.routes.js`)

### 엔드포인트

```
GET /api/dashboard   → 아래 DTO 전체 (requireUser, 파라미터 없음)
```

엔드포인트는 하나다 — 대시보드는 항상 전체를 그리므로 쪼개면 왕복만 는다.
`api/server.js`에 등록: import를 :13 부근에, `registerDashboardRoutes(router)`를 :20 다음에.

### DTO 예시 (dev 시드 + 리뷰 1회 직후 기준)

```json
{ "ok": true,
  "user": { "display_name": "수민 (dev)" },
  "stats": { "streak_days": 2, "week_minutes": 12, "week_change_pct": null,
             "predicted_score": 725, "accuracy_pct": 67, "accuracy_change": null },
  "goal": { "target_score": 900, "exam_max": 990, "exam_date": "2026-09-30", "d_day": 42,
            "predicted_score": 725, "last_lesson_score": 67, "last_lesson_delta": null },
  "today_plan": { "done": 1, "total": 3, "items": [
    { "key": "conversation", "title": "Jina와 회화", "sub": "오늘 아직 대화 없음", "mins": 8,
      "done": false, "nav": "conversation" },
    { "key": "lesson", "title": "TOEIC Part 7", "sub": "Set 24 · 공지 및 안내문", "mins": 6,
      "done": false, "nav": "lesson" },
    { "key": "vocab", "title": "단어 복습", "sub": "3개 · SRS", "mins": 5,
      "done": false, "nav": "vocabulary" } ] },
  "skills": [
    { "key": "listening", "label": "Listening", "pct": null, "score_text": "데이터 없음" },
    { "key": "reading",   "label": "Reading",   "pct": 67,   "score_text": "레슨 정답률 67%" },
    { "key": "speaking",  "label": "Speaking",  "pct": null, "score_text": "데이터 없음" },
    { "key": "vocab",     "label": "Vocabulary","pct": 71,   "score_text": "복습 정답률 71%" } ],
  "weekly": { "total_minutes": 12, "days": [
    { "date": "2026-08-17", "dow": "월", "minutes": 0,  "today": false },
    { "date": "2026-08-18", "dow": "화", "minutes": 4,  "today": false },
    { "date": "2026-08-19", "dow": "수", "minutes": 8,  "today": true  },
    { "date": "2026-08-20", "dow": "목", "minutes": 0,  "today": false },
    { "date": "2026-08-21", "dow": "금", "minutes": 0,  "today": false },
    { "date": "2026-08-22", "dow": "토", "minutes": 0,  "today": false },
    { "date": "2026-08-23", "dow": "일", "minutes": 0,  "today": false } ] },
  "recent_correction": null,
  "recommendations": [
    { "tag": "단어", "title": "복습 대기 3개", "sub": "SRS 큐 비우기 · 약 5분", "nav": "vocabulary" },
    { "tag": "시험대비", "title": "Set 24 · 공지 및 안내문", "sub": "3문항 · 약 6분", "nav": "lesson" },
    { "tag": "회화", "title": "Jina와 8분 회화", "sub": "첨삭을 받아보세요", "nav": "conversation" } ] }
```

- 날짜/인사말 **표시 문자열은 서버가 만들지 않는다** — `weekly.days[].dow`만 예외(요일은
  데이터의 일부). "5월 26일 · 화요일"류는 클라이언트가 `new Date()`로 포맷 (단어장
  `formatNextReview` 규범과 동일: 포맷터는 클라 한 곳).
- `null`의 의미를 프론트 계약으로 고정: **null = 데이터 없음 → 정의된 빈 상태 렌더**, 0과
  구분한다 (`accuracy_pct: 0`은 "전부 틀림", `null`은 "기록 없음").

### `api/services/dashboard.service.js` — 구조

```js
// 테이블 존재 가드 — 01/02보다 먼저 구현돼도 500이 나지 않게 한다. 60s 캐시.
let tablesCache = { at: 0, val: null };
async function presentTables() {
  if (tablesCache.val && Date.now() - tablesCache.at < 60_000) return tablesCache.val;
  const { rows: [r] } = await pool.query(`SELECT
    to_regclass('public.lessons')               IS NOT NULL AS lessons,
    to_regclass('public.user_lesson_attempts')  IS NOT NULL AS attempts,
    to_regclass('public.conversation_sessions') IS NOT NULL AS conv_sessions,
    to_regclass('public.conversation_messages') IS NOT NULL AS conv_messages,
    to_regclass('public.corrections')           IS NOT NULL AS corrections`);
  r.conversation = r.conv_sessions && r.conv_messages; // 둘 다 있어야 조인 가능
  r.lesson = r.lessons && r.attempts;
  tablesCache = { at: Date.now(), val: r };
  return r;
}

export async function getDashboard(user) { /* Promise.all로 병렬:
   streak / weekly / accuracy(30d + prev 30d) / goal / dueStats(fetchStats 재사용) /
   recommendLesson / todayFlags / recentCorrection — 전부 [user.id, user.tz] 파라미터 */ }
```

- 활동 UNION은 `presentTables()` 결과로 **문자열 조립** — 파라미터는 `$1`/`$2` 고정이므로
  인젝션 표면 없음. 각 블록 SQL은 위 "산식 정의"의 것을 그대로.
- due 개수는 `vocab.service.js`의 `fetchStats(user.id)`를 **import 재사용** (중복 구현 금지).
- 30일 정확도:
  ```sql
  SELECT count(*) FILTER (WHERE result <> 'again')::int AS pass, count(*)::int AS total
    FROM public.vocab_reviews
   WHERE user_id = $1 AND reviewed_at > now() - interval '30 days';
  -- attempts: SELECT COALESCE(sum(correct_count),0)::int, COALESCE(sum(total_count),0)::int …
  ```
  직전 창은 `reviewed_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'`.
- 추천 레슨(미시도 → 최저 정답 순):
  ```sql
  SELECT l.id, l.title, l.subtitle, l.est_minutes,
         (SELECT count(*)::int FROM public.lesson_items i WHERE i.lesson_id = l.id) AS question_count
    FROM public.lessons l
    LEFT JOIN LATERAL (SELECT count(*)::int AS cnt, max(correct_count)::int AS best
                         FROM public.user_lesson_attempts ua
                        WHERE ua.user_id = $1 AND ua.lesson_id = l.id) a ON true
   WHERE l.published
   ORDER BY COALESCE(a.cnt, 0) ASC, a.best ASC NULLS FIRST, l.position, l.id
   LIMIT 1;
  ```
- 최근 첨삭 (01 계약 가정 — 컬럼명 차이는 이 상수 한 곳만 수정):
  ```sql
  SELECT original, corrected, explanation, created_at,
         (SELECT count(*)::int FROM public.corrections c2 WHERE c2.user_id = $1) AS total_count
    FROM public.corrections WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1;
  ```
- goal: `SELECT target_score, exam_date FROM public.user_goals WHERE user_id = $1` — 0행이면
  `{target_score: 900, exam_date: null}` 합성. `d_day = exam_date - (now() AT TIME ZONE tz)::date`.
- 트랜잭션 불필요(읽기 전용 스냅샷 일관성이 크리티컬하지 않음), `withTx` 미사용 —
  풀 커넥션을 물고 있지 않는다.

### `api/routes/dashboard.routes.js`

```js
import { sendJson } from '../lib/respond.js';
import { requireUser } from '../middleware/auth.js';
import { getDashboard } from '../services/dashboard.service.js';

export function registerDashboardRoutes(router) {
  router.get('/api/dashboard', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await getDashboard(user)) });
  });
}
```

**완료 판정 (curl)** — `DEV_AUTOLOGIN=1` 전제:

```bash
curl -s -c /tmp/ck.txt http://localhost:3004/api/auth/me -H 'X-Requested-With: jina' | jq .user.email

curl -s -b /tmp/ck.txt http://localhost:3004/api/dashboard > /tmp/dash.json
jq '{streak:.stats.streak_days, week:.stats.week_minutes, dday:.goal.d_day,
    plan:[.today_plan.items[].key], days:(.weekly.days|length)}' /tmp/dash.json
# 시드 직후(02 시드 attempt=어제 1건, vocab_reviews 0건, 오늘 활동 없음):
#  → streak 1 (앵커=어제), dday 42, days 7
#  → 02 미구현 DB라면 plan에 "lesson" 없음 + 500 아님 200 ★to_regclass 폴백 판정
jq '.recent_correction' /tmp/dash.json          # corrections 부재/0행 → null ★빈 상태
jq '.skills[]|select(.key=="listening").pct' /tmp/dash.json   # → null (v1 데이터 없음)

# 스트릭 산식 판정: 오늘 리뷰 1건 발생시키면 어제+오늘 연속 → 2
curl -s -X POST http://localhost:3004/api/vocab/1/review -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/ck.txt -d '{"result":"good"}' > /dev/null
curl -s -b /tmp/ck.txt http://localhost:3004/api/dashboard | jq '.stats.streak_days'   # → 2

# 신규 사용자(빈 상태) 판정: signup 후 같은 GET →
#  streak 0 / accuracy null / predicted null / recent_correction null / weekly 전부 0 / 200 OK
curl -s -X POST http://localhost:3004/api/auth/signup -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -c /tmp/ck2.txt \
  -d '{"email":"empty@dev.local","password":"test-pass-1234","display_name":"빈계정"}' > /dev/null
curl -s -b /tmp/ck2.txt http://localhost:3004/api/dashboard \
  | jq '{s:.stats.streak_days, a:.stats.accuracy_pct, p:.stats.predicted_score, g:.goal.target_score}'
# → {"s":0,"a":null,"p":null,"g":900}   (goal은 행 없이 기본값 합성)
```

`EXPLAIN ANALYZE` — vocab_reviews 블록이 `vocab_reviews_user_time_idx`,
attempts 블록이 `ula_user_time_idx`를 타는지 확인 (01 구현 시 conversation_messages에도
`(session_id, created_at)` 인덱스가 있어야 함 — 01 문서 작성 시 반영 사항으로 기록).

---

## Phase 3 — 프론트 컷오버

### 신규: `src/shared/dashboard-store.jsx` (`window.DashboardProvider` / `window.useDashboard`)

`vocab-store.jsx`를 패턴 복제하되 읽기 전용이라 더 단순하다.

```
상태:  dash (DTO 전체 | null), loading, error, lastFetchedAt
액션:  refresh({ force } = {})   GET /api/dashboard.
       - 15초 스로틀: force 아니고 lastFetchedAt 15s 이내면 skip (화면 재진입마다
         호출되므로 — 아래 "재진입 갱신" 참조)
       - 성공: dash 교체 + localStorage['jina_dashboard_cache_v1'] write-through
       - 실패: error = res.hint ? `${res.error} — ${res.hint}` : res.error,
         캐시 있으면 dash 유지/복원 (빈 화면 금지 — vocab-store :44-53 패턴)
반환:  { dash, loading, error, refresh }
```

- **fallback** (`useDashboardFallback`): 현재 mock 리터럴을 DTO 모양으로 옮긴 정적 객체
  (streak 24, 845/900/D-42, 주간 28/45/18/52/38/64/0, 첨삭 예문, 추천 3건 등 —
  dashboard-desktop.jsx의 기존 수치를 그대로 이식해 캔버스 아트보드의 룩을 보존).
  `loading:false, error:null, refresh:noop`. `useDashboard()`는 vocab-store :189-193과
  동일하게 훅 규칙상 fallback을 항상 호출 후 `ctx || fallback`.
- **재진입 갱신**: Provider는 마운트 시 1회 fetch. 추가로 `DashboardDesktop`/`MobileDashboard`
  최상위에서 `React.useEffect(() => { refresh(); }, [])` — 탭 전환으로 대시보드에 돌아올
  때마다 재조회(스로틀이 남발을 막는다). 단어장 복습 직후 돌아와도 스트릭/주간이 즉시 반영.

### `src/screens/dashboard-desktop.jsx` 수정 지점 (라인 실측 완료, 전부 `{theme}` props 유지)

각 리프 컴포넌트 첫 줄에 `const { dash } = useDashboard();`를 넣고 리터럴을 치환한다.
`dash`가 null인 동안(Provider 첫 로딩)은 각 카드가 자체 스켈레톤(무늬 박스)을 렌더 — 빈 화면 금지.

| 위치 | 수정 |
|---|---|
| `Sidebar` :106-117 | :113 `이수민` → `dash.user.display_name`, :114 → `` `토익 목표 ${dash.goal.target_score}` ``, :111 아바타 이니셜 → `display_name.charAt(0)` |
| `HeroCard` :159, :165-176 | :159 칩 → 클라 포맷 `` `오늘 ${HH:MM}` ``. :166 `수민님` → display_name. :167-171 강조 토픽 + :173-176 부제 → `dash.recommendations[0]`의 title/sub 기반 문구 (추천 1순위가 히어로 카피의 단일 소스). CTA 버튼 2개에 `onClick={() => onNavigate(rec.nav)}` — `DashboardDesktop`이 이미 받는 `onNavigate`(commonProps)를 HeroCard까지 prop으로 내림 |
| `StatStrip` :206-211 | stats 배열을 `dash.stats`로 생성: 연속 `streak_days`일 / 이번 주 `(week_minutes/60).toFixed(1)`시간 / 예상 `predicted_score ?? '—'` / 정확도 `accuracy_pct ?? '—'`%. `change`는 `accuracy_change > 0`일 때만 `` `+${v}%p` `` |
| `TodayPlan` :244-249, :254, :258-261 | items → `dash.today_plan.items` (icon/accent은 key→아이콘 매핑표를 컴포넌트에 상수로: conversation=Chat/accent, lesson=Bolt/accent3, vocab=Book/warning). :254 날짜 → 클라 `toLocaleDateString('ko-KR', {month:'long', day:'numeric', weekday:'long'})`. :259-261 → `done`/`total`. `current` 플래그 = 첫 미완료 항목. "계속" 버튼 → `onNavigate(it.nav)` |
| `GoalRing` :323-384 | :324 상수 삭제 → `dash.goal`. `current = predicted_score`, null이면 링 0% + 중앙에 "레슨을 풀면 예상 점수가 표시돼요"(빈 상태). :325-326 `pct = Math.min(100, current/target*100)`. :331 D-배지 → `d_day != null ? `D-${d_day}` : 숨김`. :370-374 "지난 모의고사" → "최근 레슨" + `last_lesson_score ?? '—'`, ↑delta는 `last_lesson_delta > 0`일 때만. :376-379 Part5 문구 → recommendations의 lesson 항목 title로 치환, 없으면 블록 숨김 |
| `SkillCard` :388-393 | skills 배열 → `dash.skills` (`s.pct ?? 0`로 바 폭, `score_text` 표기, pct null이면 라벨 dim) |
| `CorrectionsCard` :424-481 | `dash.recent_correction` null → 빈 상태 카드(아이콘 + "회화 첨삭이 쌓이면 여기 표시돼요" + 회화 탭 버튼). 있으면 :432 → `created_at` 클라 상대 포맷, :441-443 원문 → `original`, :448-456 → `corrected`, :464-465 해설 → `explanation` (mock의 취소선/하이라이트 span 마크업은 v1에서 통문장 렌더로 단순화 — diff 하이라이트는 01의 corrections 스키마 확정 후 후속), :475 → `` `(${total_count}건)` `` |
| `RecommendCard` :484-526 | items → `dash.recommendations`. :515 "매칭 %" 표기 삭제. 버튼 `onClick={() => onNavigate(it.nav)}` |
| `WeeklyChart` :529-566 | days → `dash.weekly.days` (`d.dow` 라벨, `d.today` 플래그). :539 `max = Math.max(40, ...minutes)`. :545 → `` `총 ${h}시간 ${m}분` `` + `week_change_pct` 있을 때만 `` `지난주보다 ${±v}%` `` |
| `TopBar` :596-598 | `24` → `dash.stats.streak_days` |
| `DashboardDesktop` :611-643 | 최상위에 `refresh()` useEffect(위 "재진입 갱신") 추가 + `onNavigate`를 HeroCard/TodayPlan/RecommendCard로 전달. 그 외 무수정 (리프가 훅 직접 호출) |

### `src/screens/mobile.jsx` — MobileDashboard 수정 지점 (:6-254)

| 위치 | 수정 |
|---|---|
| :17-19 | 날짜 클라 포맷, `수민님` → `dash.user.display_name` |
| :29 | 스트릭 → `dash.stats.streak_days` |
| :100-110 | 링 offset → `1 - Math.min(1, (predicted ?? 0)/target)`, :104 `845` → `predicted ?? '—'`, :109 `900` → target, :110 `↑ 20` → `last_lesson_delta > 0`일 때만 |
| :117-120 | 미니 통계 → 이번 주 `` `${(week_minutes/60).toFixed(1)}h` `` / 정확도 `` `${accuracy_pct ?? '—'}%` `` |
| :146, :153 | `` `${done}/${total} 완료 · ${남은 mins 합}분 남음` ``, 링 진행 = `done/total` (total 0이면 0) |
| :159-163 | 플랜 items → `dash.today_plan.items` (데스크탑과 같은 아이콘 매핑표 — mobile.jsx에 중복 정의하지 말고 `dashboard-store.jsx`에 `window.DASH_PLAN_META`로 한 번만) |
| :194-213 | `recent_correction` null이면 **카드 자체 렌더 생략**, 있으면 원문/교정 치환 |
| :221-246 | 추천 → `dash.recommendations.slice(0, 2)`, 버튼 `onNavigate(it.nav)` (MobileDashboard는 이미 `onNavigate` prop을 받는다 :6) |

### 앱 셸 / HTML

| 파일 | 수정 |
|---|---|
| `src/main.jsx` :354-356 | `<DashboardProvider>`로 기존 Provider 트리 바깥을 감싼다: `<DashboardProvider><VocabProvider>…{renderPage()}…</VocabProvider></DashboardProvider>` (02의 LessonProvider가 이미 있으면 그 바깥). 탭 전환에도 스토어 생존 → 재진입 시 캐시 즉시 표시 + 스로틀 조회 |
| `index.html` :29 다음 줄 | `<script type="text/babel" src="src/shared/dashboard-store.jsx"></script>` (vocab-store 뒤, screens 앞) |
| `canvas.html` :31 다음 줄 | 동일 태그 — **둘 다 갱신, KEEP IN SYNC 주석 블록 안에** |
| `src/app.jsx` :94-99 (캔버스 아트보드) | 무수정 — Provider 없이 `useDashboard` fallback(mock 수치 이식본)으로 기존 룩 그대로 렌더 |

**완료 판정 (브라우저 수동)**: `localhost:3003` → 대시보드(기본 탭) → 스트릭/이번 주/예상
점수가 mock(24/4.2/845)이 아니라 시드 실측값 → 신규 계정 관점 확인(첨삭 카드 빈 상태, 예상
점수 '—') → 단어장에서 복습 몇 장 → 대시보드 복귀 → 이번 주 분·정확도 갱신(재진입 갱신 증명)
→ 추천 카드 클릭 → 해당 탭 이동 → 새로고침 후 동일 수치(서버 단일 소스) → 창 <768px 모바일
대시보드가 데스크탑과 같은 수치(스토어 공유 증명) → API 프로세스 kill 후 새로고침 → 캐시
수치 + 에러 배너(빈 화면 금지) → `canvas.html` → 대시보드 아트보드 2개가 기존 mock 룩으로 렌더.

---

## Phase 4 — 자동 검증 (`scripts/e2e-dashboard.mjs`)

`scripts/e2e-vocab.mjs` 골격 재사용 (playwright + `check()` 러너, **CDN 차단 컨테이너용
`routeCdn()` 블록 :11-22 그대로 복사**, Babel 컴파일 대기 9s 동일). 시나리오:

1. `page.evaluate`로 `GET /api/dashboard` 원본 확보(`credentials:'include'`,
   `X-Requested-With: jina`) → `ok:true`, `weekly.days.length === 7`
2. 데스크탑 로드(대시보드 기본) → TopBar 스트릭 표시값 === API `stats.streak_days` (mock 24 아님)
3. StatStrip 예상 점수 표시 === API `predicted_score ?? '—'` ★빈 상태/실값 양쪽 커버
4. `recent_correction`이 null이면 빈 상태 문구("첨삭이 쌓이면") 렌더, 아니면 `original` 일부 렌더
5. 단어장 탭 → 플래시카드 1장 복습(good) → 대시보드 탭 복귀 → 1.5s 대기 →
   스트릭/이번 주 분이 API 재조회 값과 일치 ★재진입 갱신 + 산식(오늘 활동 → 스트릭 연장)
6. 추천 카드 첫 항목 클릭 → 해당 탭으로 이동(`nav` 라우팅)
7. 모바일 뷰포트(390×844) → 대시보드 → 스트릭/예상 점수가 데스크탑과 동일 값 ★서버 단일 소스
8. `canvas.html` 로드 → `#root` 렌더 + 대시보드 아트보드에 fallback 수치 `845` 존재
   (Provider 부재 fallback 증명) + 콘솔 에러 0
9. 데스크탑 콘솔 에러 0

실행: `npm run dev:all` 상태에서 `node scripts/e2e-dashboard.mjs` → exit 0.
회귀: `node scripts/e2e-vocab.mjs` (+ 02 완료 상태면 `e2e-lesson.mjs`)도 여전히 exit 0.

---

## 단계 요약 / 순서

1. **Phase 1** `00XX_user_goals.sql`(+down, 번호는 최신+1) → `migrate.mjs` RESET_TABLES →
   `dev.mjs` goal 시드 → migrate/seed/status/rollback 왕복 검증
2. **Phase 2** `dashboard.service.js`(presentTables 가드 + 산식 SQL) → `dashboard.routes.js` →
   `api/server.js` 등록 → curl 완료 판정 전부 통과 (특히 신규 계정 빈 상태 + 스트릭 1→2)
3. **Phase 3** `dashboard-store.jsx`(fallback = mock 수치 이식) → `dashboard-desktop.jsx` →
   `mobile.jsx` MobileDashboard → `main.jsx` Provider → `index.html`/`canvas.html` → 수동 판정
4. **Phase 4** `scripts/e2e-dashboard.mjs` 작성·통과 + 기존 e2e 회귀 통과
5. 문서 갱신: `docs/HANDOFF.md`에 `/api/dashboard` 계약·산식 반영. 01-conversation.md가
   이 문서 이후에 확정되면 `corrections`/`conversation_*` 컬럼명 차이를
   `dashboard.service.js` SELECT 상수와 이 문서 "테이블 전제" 표에 반영

## 완료 판정 (최종 체크리스트)

- [ ] `npm run db:status` — 전부 applied, MODIFIED 없음 (기존 마이그레이션 무수정 증명)
- [ ] 신규 테이블 `user_goals` 1개뿐, 기존 앱 테이블 11개 무접촉
- [ ] `GET /api/dashboard`가 01/02 테이블 **부재 DB에서도 200** (to_regclass 폴백) —
      부재 소스의 카드만 빈 상태
- [ ] 신규 가입 계정: streak 0 / accuracy·predicted null / correction null / weekly 7×0 / goal 기본값
- [ ] 리뷰 1회 후 streak가 산식대로 증가(어제 시드 활동 + 오늘 = 2) — 저장된 카운터 없음 증명
- [ ] D-day가 시드 시점 무관 42 (`exam_date` 상대 시드)
- [ ] 데스크탑/모바일/새로고침 수치 동일 (파생값 서버 단일 소스)
- [ ] `dashboard-desktop.jsx`·`mobile.jsx`(MobileDashboard 구간)에 mock 수치 리터럴 잔존 0
      (`grep -nE "845|'24'|4\.2|D-42|87%" src/screens/dashboard-desktop.jsx` 검토 — fallback
      수치는 `dashboard-store.jsx`에만 존재해야 함)
- [ ] `canvas.html` 대시보드 아트보드 2개가 fallback으로 기존 룩 렌더, 네트워크 불필요
- [ ] `api/ai/schemas.js`·`prompts.js` diff 0 (AI 호출 없음 확인)
- [ ] `node scripts/e2e-dashboard.mjs` exit 0, `node scripts/e2e-vocab.mjs` 회귀 exit 0
