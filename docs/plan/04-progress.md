# 04 — 학습 통계 탭 실기능 전환 (GET /api/progress 집계 + 첨삭 SRS 복습)

> 이 문서는 `docs/PLAN-vocab-backend.md`(단어장 구현 완료본)의 구조와 규범을 따르는 **구현 계획서**입니다.
> 구현 에이전트는 이 문서만으로 작업을 완료하고, 마지막의 검증 절차를 통과시켜야 합니다.
> 단어장에서 확립된 4개 패턴 — ①마이그레이션 파일 규범 ②DTO+파생값 서버 단일 소스
> ③Context 스토어(캔버스 fallback) ④CLI 프록시+JSON 스키마 — 를 복제합니다.
> (④는 **신규 AI task 없음**으로 충족 — 이 탭은 읽기 집계 + SRS 복습뿐. `api/ai/schemas.js`/`prompts.js` 무수정.)

## ⛔ 구현 순서 전제 (이 문서를 먼저 시작하지 말 것)

이 계획은 다른 앱이 아니라 **이 리포의 선행 계획 2개가 만든 테이블을 집계**합니다:

| 선행 | 이 문서가 소비하는 것 | 없으면 |
|---|---|---|
| `docs/plan/01-conversation.md` (**필수**) | `conversation_sessions`/`conversation_messages`(scores JSONB)/`corrections`(SRS 컬럼 세트), `GET /api/corrections?due=1`, CorrectionDto | 집계 SQL이 테이블 부재로 즉사. 첨삭 복습 대상 자체가 없음 |
| `docs/plan/02-lesson.md` (**필수**) | `user_lesson_attempts`, `lessons.kind/subtitle` | Reading 스킬·레슨 세션 기록 쿼리가 테이블 부재로 즉사 |

**착수 조건**: `npm run db:status`에서 01·02의 마이그레이션이 전부 applied,
`node scripts/e2e-conversation.mjs`·`node scripts/e2e-lesson.mjs` 통과 상태.
테이블만 있으면 **행이 0이어도 동작**해야 한다(모든 집계는 빈 결과에 안전하게 — 아래 빈 상태 정의 참조).

**마이그레이션 번호 주의**: 01은 `0004_conversation.sql`을, 02 문서는 `0004_lessons.sql`/`0005_lessons_seed.sql`을
각각 주장한다(문서 간 번호 충돌 — 구현 순서대로 01이 0004, 02가 0005·0006으로 밀리는 것이 정상).
이 문서는 **0007을 가정**하되, 구현 시작 시 `ls db/migrations/` + `npm run db:status`로
**실제 다음 번호를 확정**하고 아래 파일명을 치환한다. 번호 재사용 금지 규범(db/README.md:24)이 우선한다.

---

## Context — 현황

`src/screens/progress.jsx`는 **API 호출이 0개**인 순수 mock 화면이다. (라인은 2026-08-19 실측 —
01/02가 이 파일을 건드리지 않으므로 구현 시점에도 유효할 것이나, 착수 전 재확인)

| 문제 | 위치 |
|---|---|
| 화면 전체가 단일 mock 객체 | `PROGRESS_DATA` :4-50 (user/skills/weekly/monthly_scores/corrections_due/recent_sessions), `SCORE_MILESTONES` :52 |
| Desktop/Mobile이 각자 mock 직참조 | `ProgressDesktop` :59 `const d = PROGRESS_DATA`, `MobileProgress` :474 동일 |
| 죽은 state | :58 `corrTab` — 어디서도 사용 안 함, 삭제 대상 |
| 사이드바 "이번 주" 집계가 mock reduce | :106-115 (`d.weekly.reduce`) — DTO가 필드명을 유지하면 무수정 통과 |
| 성취 예측이 리터럴 | :183 "약 **8주** 후 달성", :523 "예상 **8주** 후 달성" — 산식 없음 |
| 델타 칩이 mock 전역을 직참조 | :151 `PROGRESS_DATA.monthly_scores[0].score` — monthly_scores가 비면 **크래시** |
| ScoreTrend가 빈 배열에 크래시 | :364 `Math.min(...[])` → Infinity, :367 `100/(length-1)` → 0나눗셈 |
| **첨삭 SRS 복습 UI가 불활성** | desktop :250-277 (버튼 :269-275 onClick 없음), mobile :585-610 (버튼 :602-609 동일) — 01이 만든 `corrections` 테이블에 복습을 기록할 방법이 없음 |
| 새로고침/기기 간 데이터 개념 자체가 없음 | 전부 상수 |

이 작업의 목표 2개:

1. **`GET /api/progress`** — `PROGRESS_DATA`와 **같은 필드명**의 실집계 DTO를 내린다.
   필드명을 유지하면 하위 JSX(SkillBar/ProgressWeeklyChart/SessionRow/CorrectionCard)는 무수정.
   소스가 없는 항목(`monthly_scores`)은 **빈 배열 + 프론트 빈 상태**로 정직하게 처리.
2. **첨삭 SRS 복습 활성화** — `POST /api/corrections/:id/review` + `correction_reviews` 로그 테이블.
   01이 `corrections`에 `user_vocab_cards`와 1:1 SRS 컬럼 세트를 깔아둔 이유가 이것 —
   `api/services/srs.js`의 `applyReview`/`predict`를 **그대로 재사용**한다(신규 SRS 코드 0줄).

### 단어장 구현에서 실증된 함정 → 이 문서에서의 적용

1. **PG 42804 — 같은 파라미터를 `::int` 캐스트와 `||` 텍스트 연결에 재사용 금지**:
   복습 UPDATE와 시드의 간격 연산은 전부 `make_interval(days => $n::int)` / `make_interval(mins => $n::int)`.
   `vocab.service.js:123-125`의 CASE 패턴을 문자 그대로 복제한다.
   (경고: `db/seeds/dev.mjs:63`에 `($3 || ' days')::interval` 구식 표현이 남아 있다 — **복제 금지**, 신규 코드는 make_interval만.)
2. **pg BIGINT/NUMERIC 문자열 반환**은 `api/lib/pool.js`의 `setTypeParser(20/1700, Number)`로 이미 해결 —
   재작업 금지. 단 `count(*)`/`round(avg(...))`는 습관대로 SQL에서 `::int` 캐스트.
3. **인증/CSRF/CORS/READONLY 재구현 금지** — 신규 라우트 첫 줄 `requireUser`(api/middleware/auth.js)만.
   CSRF 커스텀 헤더·캔버스 `X-Jina-Mode` non-GET 403은 `api/server.js:34-40`이 전역 처리.
4. **시드 타임스탬프는 now() 상대시각** — 고정값이면 며칠 뒤 streak/weekly 시나리오 재현 불가.
5. **canvas.html은 main.jsx를 로드하지 않는다** — `ProgressProvider`는 index.html 경로(main.jsx)에만.
   `useProgress`는 Provider 부재 시 **mock을 fallback으로** 반환(현행 `PROGRESS_DATA`를 스토어로 이사).
   **새 `<script>` 태그는 index.html/canvas.html 둘 다** (KEEP IN SYNC 주석 블록 안 — index.html:23, canvas.html:25.
   01/02가 store 태그를 추가하면 라인이 밀린다 — "vocab-store 계열 블록 끝, `screens/progress.jsx` 앞"이 규칙).
6. **기존 DB 테이블 11개는 다른 앱 소유** — 신규 2개(`correction_reviews`, `user_goals`)는
   기존 11개(`study_sessions`, `session_messages`, `session_corrections`, `vocabulary`, `vocab_quiz_details`,
   `diary_details`, `freetalk_details`, `grammar_details`, `pronunciation_details`, `roleplay_details`,
   `shadowing_details`)와 충돌 없음 — 확인 완료. `migrate.mjs`의 `FOREIGN_TABLES` self-assert(:31-40)가 재검증한다.
7. **`db/migrate.mjs`의 `RESET_TABLES`(:22-29) 갱신 필수** — FK 역순 규칙: `correction_reviews`는
   `corrections`보다 앞, `user_goals`는 `users`보다 앞에 삽입.
8. **날짜 버킷은 사용자 TZ** — `(ts AT TIME ZONE $tz)::date` (vocab.service.js:24, :273 기존 관행).
   `now()::date`(서버 TZ)와 섞으면 자정 부근에서 streak/weekly가 하루 어긋난다.

### 데이터 소스 결정 — 무엇을 어디서 집계하나

| mock 필드 | 실소스 | 결정 |
|---|---|---|
| `user.name` | `users.display_name` | 그대로 |
| `user.target_test`/`target_score` | **신규 `user_goals`** (users ALTER 대신 별도 테이블 — 0001 무수정 규범 + 05-settings가 편집할 자리) | 행 없으면 기본값 TOEIC/850으로 응답 (LEFT JOIN + COALESCE) |
| `user.current_score` (예상 점수) | **파생 산식** (아래 §예상 점수) — 저장하지 않음 | 데이터 부족 시 `null` → 프론트 빈 상태 |
| `user.streak` | 활동일 집합(user 메시지·vocab_reviews·lesson_attempts·correction_reviews)의 연속 run | 서버 계산 |
| `user.total_minutes` / `sessions_done` | 활동 원장 CTE (아래) | 서버 계산 |
| `user.words_learned` | `user_vocab_cards` `review_count > 0 AND NOT suspended` count | 서버 계산 |
| `skills` | grammar/fluency/vocabulary = `conversation_messages.scores` JSONB 집계, Reading = lesson 정답률 | **Listening은 v1 소스 없음 → 배열에서 제외** (JSX는 map이라 안전). `color`는 표시값 — 서버가 내리지 않고 스토어 매퍼가 부착 |
| `weekly` | 활동 원장 + 일별 accuracy, **이번 주 월~일 7행 고정**(0 채움) | `day:'월'` 표시 라벨은 클라 포맷터 (ProgressWeeklyChart:331의 dayMap과 동일 매핑 — 오늘 하이라이트 유지) |
| `monthly_scores` | **소스 없음** (점수 스냅샷 이력 테이블 미도입) | **`[]` 고정** + 프론트 빈 상태. 스냅샷은 후속 과제 |
| `corrections_due` | 01의 `corrections` (status/preview 파생 포함 CorrectionDto) | due 순 최대 20개 동봉 |
| `recent_sessions` | `conversation_sessions` + `user_lesson_attempts` UNION | 최신 8개. `date` 표시 문자열('오늘'/'어제')은 클라 포맷터 |
| :183/:523 "8주" | **산식 미정 → DTO `weeks_to_target: null`** | 프론트는 null이면 해당 절 생략. 스냅샷 도입 후 실계산 (후속) |

---

## Phase P1 — DB 마이그레이션 (`db/migrations/0007_progress.sql` — 번호는 실측 확정)

`.down.sql` 동반. 규범: 멱등 DDL(`IF NOT EXISTS`), 모든 식별자 `public.` 명시, BOM 없는 UTF-8,
적용 후 수정 금지(체크섬), 적용은 반드시 `npm run db:migrate`(psql -f 금지).

01 문서가 "correction_reviews는 04에서 새 번호로 추가한다(0004에 선반영 금지)"고 예약해 둔 바로 그 파일이다.

### `0007_progress.sql`

```sql
-- 첨삭 SRS 복습 로그 — vocab_reviews(0002_vocab.sql)와 1:1 동형.
CREATE TABLE IF NOT EXISTS public.correction_reviews (
  id                 BIGSERIAL    PRIMARY KEY,
  correction_id      BIGINT       NOT NULL REFERENCES public.corrections(id) ON DELETE CASCADE,
  user_id            BIGINT       NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  result             TEXT         NOT NULL,
  reviewed_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  prev_interval_days INT          NOT NULL, prev_ease_factor NUMERIC(4,2) NOT NULL,
  next_interval_days INT          NOT NULL, next_ease_factor NUMERIC(4,2) NOT NULL,
  next_review        TIMESTAMPTZ  NOT NULL,
  elapsed_ms         INT,
  client_request_id  UUID,                                  -- 멱등키
  CONSTRAINT correction_reviews_result_ck CHECK (result IN ('again','hard','good','easy'))
);
CREATE INDEX IF NOT EXISTS correction_reviews_user_time_idx
  ON public.correction_reviews (user_id, reviewed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS correction_reviews_reqid_uq
  ON public.correction_reviews (client_request_id) WHERE client_request_id IS NOT NULL;

-- 학습 목표 — users를 ALTER 하지 않는 이유: 0001은 적용 완료(수정 금지), 인증 테이블은 인증만.
-- 05-settings-auth가 이 테이블의 편집 UI를 붙인다.
CREATE TABLE IF NOT EXISTS public.user_goals (
  user_id      BIGINT      PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  target_test  TEXT        NOT NULL DEFAULT 'TOEIC',
  target_score SMALLINT    NOT NULL DEFAULT 850,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_goals_test_ck  CHECK (target_test IN ('TOEIC')),
  CONSTRAINT user_goals_score_ck CHECK (target_score BETWEEN 10 AND 990)
);
```

### `0007_progress.down.sql`

```sql
DROP TABLE IF EXISTS public.correction_reviews;
DROP TABLE IF EXISTS public.user_goals;
```

### `db/migrate.mjs` — RESET_TABLES 갱신 (FK 역순 유지)

`'correction_reviews'`를 배열 **맨 앞**(corrections보다 먼저 드롭), `'user_goals'`를 `'users'` **바로 앞**에 삽입.
01/02가 이미 배열을 확장했을 것이므로 최종 순서 예시:
`correction_reviews → corrections → conversation_messages → conversation_sessions →
user_lesson_attempts → lesson_items → lessons → vocab_reviews → user_vocab_cards →
vocab_words → user_goals → auth_sessions → users → schema_migrations`.
`FOREIGN_TABLES` self-assert가 그대로 통과해야 한다.

### 시드 — `db/seeds/dev.mjs` 확장 (시드는 체크섬 대상 아님, 수정 가능)

전부 **now() 상대시각**, 재실행 안전(멱등):

```js
// 1) 학습 목표 (upsert)
await client.query(
  `INSERT INTO public.user_goals (user_id, target_test, target_score)
   VALUES ($1, 'TOEIC', 850)
   ON CONFLICT (user_id) DO UPDATE SET target_score = EXCLUDED.target_score, updated_at = now()`,
  [user.id],
);

// 2) 첨삭 복습 이력 1건 — 01 시드의 "미래 next_review" 첨삭(I go to school yesterday)을
//    "어제 good으로 복습된 상태"로 만든다. 복습 이력 렌더 경로 + 파생 status='learned' 검증 데이터.
//    corrections UPDATE와 correction_reviews INSERT를 한 트랜잭션에 — 카운터 정합
//    (fail_count <= review_count CHECK) 유지.
await client.query('BEGIN');
const { rows: [corr] } = await client.query(
  `UPDATE public.corrections
      SET review_count = GREATEST(review_count, 1), last_result = 'good',
          last_reviewed_at = now() - interval '1 day',
          interval_days = 3, ease_factor = 2.50,
          next_review = (date_trunc('day', now() AT TIME ZONE $2) + make_interval(days => 2)) AT TIME ZONE $2,
          updated_at = now()
    WHERE user_id = $1 AND dedup_key = lower('I go to school yesterday') || ' → ' || lower('I went to school yesterday')
    RETURNING id`,
  [user.id, TZ],
);
if (corr) {
  await client.query(
    `INSERT INTO public.correction_reviews
       (correction_id, user_id, result, reviewed_at, prev_interval_days, prev_ease_factor,
        next_interval_days, next_ease_factor, next_review, client_request_id)
     SELECT $1, $2, 'good', now() - interval '1 day', 1, 2.50, 3, 2.50,
            (date_trunc('day', now() AT TIME ZONE $3) + make_interval(days => 2)) AT TIME ZONE $3,
            '22222222-2222-4222-8222-222222222222'::uuid
     ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING`,
    [corr.id, user.id, TZ],
  );
}
await client.query('COMMIT');
```

주의: partial unique index의 `ON CONFLICT`는 `WHERE client_request_id IS NOT NULL`까지 명시해야
매칭된다(02 문서 :226과 동일 함정). 간격은 전부 `make_interval` — 42804 함정.

시드 후 기대 상태(집계 검증 기준값): 활동일 = 오늘(01 세션 메시지 now()-2h) + 어제(01 카페 세션,
02 attempt, 위 correction_review) → **streak 2**. corrections due = **2** (01 시드의 due 2개 —
세 번째는 위에서 +2일 미래로 이동).

**완료 판정**: `npm run db:migrate && npm run db:seed` 2회 반복 무해(멱등).
`node -e` 원라이너(pg)로: 테이블 총 **22개**(기존 11 + 인증·단어장 6 + 회화 3 + 레슨 3 + 신규 2 − schema_migrations 계산 방식은 01/02와 동일하게 `\dt` 상당으로 확인),
`SELECT count(*) FROM correction_reviews` = 1,
`SELECT target_score FROM user_goals` = 850,
`SELECT count(*) FROM corrections WHERE next_review <= now() AND NOT suspended` = 2.
`npm run db:rollback` → 신규 2테이블 소멸 → 재적용 왕복.

---

## Phase P2 — API (`api/services/progress.service.js` + `api/services/corrections.service.js` + `api/routes/progress.routes.js`)

### 엔드포인트

```
GET  /api/progress                    → {ok, progress: ProgressDto}
POST /api/corrections/:id/review      {result, client_request_id?, elapsed_ms?}
                                      → {ok, correction: CorrectionDto, stats:{due,total}, replay?}
(01이 이미 제공: GET /api/corrections?due=1&limit=50 — 재구현 금지, 스토어가 재조회에 사용)
```

`api/server.js`에 `registerProgressRoutes(router)` 등록 한 줄 추가(01/02 등록 뒤).
경로 충돌 없음 — `/api/progress`는 신규 프리픽스, `/api/corrections/:id/review`는 01의
`GET /api/corrections`와 메서드/깊이가 다르다.

### ProgressDto — mock과 같은 필드명, 값은 실집계

```json
{ "user": { "name": "수민 (dev)", "target_test": "TOEIC", "target_score": 850,
            "current_score": 720, "streak": 2, "total_minutes": 126,
            "sessions_done": 3, "words_learned": 6 },
  "skills": [ { "key": "grammar",    "label": "Grammar",    "value": 74, "delta": 3 },
              { "key": "fluency",    "label": "Fluency",    "value": 88, "delta": 0 },
              { "key": "vocabulary", "label": "Vocabulary", "value": 81, "delta": 2 },
              { "key": "reading",    "label": "Reading",    "value": 67, "delta": 0 } ],
  "weekly": [ { "date": "2026-08-17", "minutes": 0,  "sessions": 0, "accuracy": null },
              { "date": "2026-08-18", "minutes": 22, "sessions": 2, "accuracy": 78 },
              { "date": "2026-08-19", "minutes": 4,  "sessions": 1, "accuracy": 83 },
              { "date": "2026-08-20", "minutes": 0,  "sessions": 0, "accuracy": null },
              { "...": "…월~일 항상 7행, 미래일은 0/null…" } ],
  "monthly_scores": [],
  "weeks_to_target": null,
  "corrections_due": [ { "id": 1, "original": "I am agree with you", "corrected": "I agree with you",
                         "type": "grammar", "reason": "…", "seen_count": 1,
                         "status": "due", "next_review_at": "…", "next_review_in_days": 0,
                         "interval_days": 1, "ease_factor": 2.50, "review_count": 0, "fail_count": 0,
                         "preview": { "again": {"label":"10분","interval_days":0,"ease_factor":2.30,"in_days":0},
                                      "hard": {"label":"1일"}, "good": {"label":"2일"}, "easy": {"label":"4일"} } } ],
  "recent_sessions": [ { "id": "conversation-7", "kind": "conversation", "title": "비즈니스 미팅",
                         "at": "2026-08-19T09:07:00.000Z", "duration": 12, "score": 83, "corrections": 2 },
                       { "id": "lesson-1", "kind": "lesson", "title": "Set 23 · 비즈니스 이메일",
                         "at": "2026-08-18T05:11:00.000Z", "duration": 4, "score": 67, "corrections": 0 } ] }
```

계약 규칙 (단어장과 동일):
- **표시 문자열은 서버가 만들지 않는다** — `weekly[].day`('월'), `recent_sessions[].date`('오늘'/'어제'),
  `corrections_due[].next_review`('Today'), `skills[].color`는 전부 **클라 스토어 매퍼**가 생성/부착.
- `skills`에 Listening 없음(소스 없음) — JSX는 `d.skills.map`이라 4개든 0개든 안전.
- `monthly_scores`는 **항상 `[]`** (v1). `weeks_to_target`는 **항상 `null`** (v1). 필드는 지금 계약에
  박아둔다 — 스냅샷 도입 시 서버만 바꾸면 되게.
- `corrections_due[].preview`는 `predict(row)`(api/services/srs.js:43-55) 그대로 — 복습 버튼 부제의
  단일 소스(하드코딩 라벨 금지, 단어장 버그 3과 동형 예방).
- `recent_sessions[].id`는 `"{kind}-{pk}"` 문자열 — 두 테이블 UNION이라 정수 PK가 충돌한다.
  SessionRow의 `key={s.id}`(:245)가 그대로 안전해지는 방식.

### 집계 쿼리 — `progress.service.js` (읽기 전용, 트랜잭션 불필요, `Promise.all` 병렬)

**활동 원장 CTE** — total_minutes/sessions_done/streak/weekly의 공통 소스 (쿼리 1개로 일별 rows를
받아 JS에서 파생 — 같은 정의가 4곳에서 갈라지는 드리프트 방지):

```sql
WITH activity AS (
  -- 회화: 세션 지속시간을 시작일에 귀속
  SELECT (s.started_at AT TIME ZONE $2)::date AS day,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (s.last_message_at - s.started_at)) / 60))::int AS minutes,
         1 AS sessions
    FROM public.conversation_sessions s
   WHERE s.user_id = $1 AND s.last_message_at IS NOT NULL
  UNION ALL
  SELECT (ua.created_at AT TIME ZONE $2)::date,
         CEIL(COALESCE(ua.elapsed_ms, 0) / 60000.0)::int, 1
    FROM public.user_lesson_attempts ua WHERE ua.user_id = $1
  UNION ALL
  SELECT (r.reviewed_at AT TIME ZONE $2)::date,
         CEIL(COALESCE(r.elapsed_ms, 0) / 60000.0)::int, 0
    FROM public.vocab_reviews r WHERE r.user_id = $1
  UNION ALL
  SELECT (cr.reviewed_at AT TIME ZONE $2)::date,
         CEIL(COALESCE(cr.elapsed_ms, 0) / 60000.0)::int, 0
    FROM public.correction_reviews cr WHERE cr.user_id = $1
)
SELECT day, sum(minutes)::int AS minutes, sum(sessions)::int AS sessions
  FROM activity GROUP BY day ORDER BY day;
```

JS 파생 (전부 이 rows에서):
- `total_minutes = Σ minutes`, `sessions_done = Σ sessions`
- `streak`: rows의 day 집합을 내림차순 순회. 오늘(사용자 TZ, 서버에서
  `SELECT (now() AT TIME ZONE $tz)::date`로 함께 받아온 기준일)이 활동일이면 오늘부터, 아니면
  어제부터 연속 run 길이. 어제도 없으면 0. (오늘 아직 공부 안 했다고 streak을 0으로 만들지 않는다 — Anki 관행)
- `weekly`: `date_trunc('week', 기준일)`(월요일)부터 7일을 0으로 초기화 후 rows를 머지.

**일별 accuracy** (weekly에 머지):

```sql
SELECT day, round(avg(pct))::int AS accuracy FROM (
  SELECT (m.created_at AT TIME ZONE $2)::date AS day, avg(v.value::numeric) AS pct
    FROM public.conversation_messages m, LATERAL jsonb_each_text(m.scores) v
   WHERE m.user_id = $1 AND m.scores IS NOT NULL GROUP BY 1
  UNION ALL
  SELECT (ua.created_at AT TIME ZONE $2)::date,
         avg(ua.correct_count::numeric / ua.total_count * 100)
    FROM public.user_lesson_attempts ua WHERE ua.user_id = $1 GROUP BY 1
) t GROUP BY day;
```

**skills** — 회화 3종 + Reading. `value` = 최근 7일 평균, 없으면 전체 평균, 그래도 없으면 스킬 제외.
`delta` = (최근 7일 − 직전 7일) 반올림, 직전 창이 비면 0:

```sql
SELECT v.key,
       round(avg(v.value::numeric) FILTER (WHERE m.created_at >  now() - interval '7 days'))::int AS cur,
       round(avg(v.value::numeric) FILTER (WHERE m.created_at <= now() - interval '7 days'
                                       AND m.created_at >  now() - interval '14 days'))::int      AS prev,
       round(avg(v.value::numeric))::int                                                          AS alltime
  FROM public.conversation_messages m, LATERAL jsonb_each_text(m.scores) v
 WHERE m.user_id = $1 AND m.scores IS NOT NULL
 GROUP BY v.key;

SELECT round(avg(pct) FILTER (WHERE created_at >  now() - interval '7 days'))::int AS cur,
       round(avg(pct) FILTER (WHERE created_at <= now() - interval '7 days'
                          AND created_at >  now() - interval '14 days'))::int      AS prev,
       round(avg(pct))::int                                                        AS alltime
  FROM (SELECT ua.created_at, ua.correct_count::numeric / ua.total_count * 100 AS pct
          FROM public.user_lesson_attempts ua
          JOIN public.lessons l ON l.id = ua.lesson_id AND l.kind = 'toeic_part7'
         WHERE ua.user_id = $1) r;   -- → skills의 'reading'
```

**words_learned**: `SELECT count(*)::int FROM user_vocab_cards WHERE user_id=$1 AND NOT suspended AND review_count > 0`.

**recent_sessions** (UNION, 최신 8):

```sql
SELECT * FROM (
  SELECT 'conversation' AS kind, s.id AS pk, s.title,
         COALESCE(s.last_message_at, s.started_at) AS at,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (s.last_message_at - s.started_at)) / 60))::int AS duration,
         (SELECT round(avg(v.value::numeric))::int
            FROM public.conversation_messages m, LATERAL jsonb_each_text(m.scores) v
           WHERE m.session_id = s.id AND m.scores IS NOT NULL)   AS score,
         (SELECT count(*)::int FROM public.corrections c WHERE c.session_id = s.id) AS corrections
    FROM public.conversation_sessions s
   WHERE s.user_id = $1 AND s.last_message_at IS NOT NULL
  UNION ALL
  SELECT 'lesson', ua.id, l.subtitle, ua.created_at,
         GREATEST(1, CEIL(COALESCE(ua.elapsed_ms, 0) / 60000.0))::int,
         round(ua.correct_count::numeric / ua.total_count * 100)::int, 0
    FROM public.user_lesson_attempts ua
    JOIN public.lessons l ON l.id = ua.lesson_id
   WHERE ua.user_id = $1
) t ORDER BY t.at DESC LIMIT 8;
```

`score`가 NULL인 회화 세션(scores 없는 degraded만 있던 세션)은 DTO에서 `score: null` —
SessionRow의 색 삼항(:419)이 NULL 비교로 error색이 되므로 스토어 매퍼가 `score ?? 0`이 아니라
**행 제외가 아닌 `score: null` + 화면 :419에 null 가드**(`s.score == null ? theme.textDim : …`)를 넣는다.

**corrections_due**: 01의 `conversation.service.js`에 있는 첨삭 SELECT/DTO 함수를 **import 재사용**
(export 안 되어 있으면 export 추가 — status CASE/preview 로직 중복 정의 금지).
`WHERE suspended = false AND next_review <= now() ORDER BY next_review ASC LIMIT 20`.

### 예상 점수 산식 (`current_score`) — v1 단일 함수 `estimateToeicScore()`

```
conv   = 최근 30일 conversation_messages.scores 전체 값 평균 (없으면 전체 기간, 그래도 없으면 null)
lesson = 최근 30일 lesson 정답률 평균×100 (동일 폴백)
acc    = 둘 다 있으면 0.6*conv + 0.4*lesson, 하나면 그 값, 둘 다 null이면 → current_score = null
score  = clamp(round((400 + acc*4.5) / 5) * 5, 10, 990)     // acc 71 → 720, 5점 단위 반올림
```

근거: 정밀 예측이 아니라 **결정적·설명가능·데이터가 늘면 움직이는** placeholder. 산식은 이 함수
하나에만 존재(파생값 단일 소스). 함수 상단 주석에 이 표를 남기고, 03-dashboard가 예상 점수를 쓰게
되면 **이 함수를 import**하게 한다(산식 2벌 금지).

### `POST /api/corrections/:id/review` — `corrections.service.js`

`vocab.service.js`의 `review()`(:97-149)를 **테이블명만 바꿔 복제**한다. 골격 동일:

1. `requireUser` → `posInt(params.id)` → `result ∈ SRS_RESULTS` 검증 (400)
2. `withTx`: `client_request_id`가 `correction_reviews`에 있으면 현재 상태 재조회 후 `{replay:true}`
3. `SELECT * FROM public.corrections WHERE id=$1 AND user_id=$2 FOR UPDATE` — 없으면 404
4. `const next = applyReview(row, result)` — **srs.js 그대로** (corrections가 같은 컬럼명을 가진 이유)
5. UPDATE — vocab.service.js:121-134의 CASE를 문자 그대로 (again → `now() + make_interval(mins => $n::int)`,
   그 외 → TZ 자정 버킷 + `make_interval(days => $n::int)`; **42804 함정 — `||` 연결 금지**),
   `review_count+1`, `fail_count + (again?1:0)`, `last_result`, `last_reviewed_at`, `updated_at`
6. `INSERT correction_reviews` (prev/next 스냅샷 + client_request_id)
7. 응답: `{ok, correction: CorrectionDto(재조회), stats: {due, total}}` —
   `stats`는 `SELECT count(*) FILTER (WHERE NOT suspended AND next_review <= now())::int AS due, count(*) FILTER (WHERE NOT suspended)::int AS total FROM corrections WHERE user_id=$1`

트랜잭션 안에 CLI 호출 없음(이 라우트는 AI 무관) — "AI 먼저 DB 나중" 규칙은 자연 준수.

**완료 판정 (curl — DEV_AUTOLOGIN 쿠키)**

```bash
API=http://localhost:3004
curl -s -c /tmp/jina-ck.txt $API/api/auth/me -H 'X-Requested-With: jina' | jq .user.email

# 1) 집계 형태·기준값 (시드 직후)
curl -s -b /tmp/jina-ck.txt $API/api/progress -H 'X-Requested-With: jina' > /tmp/prog.json
jq '{name:.progress.user.name, target:.progress.user.target_score, streak:.progress.user.streak,
     words:.progress.user.words_learned, cs:.progress.user.current_score,
     skills:[.progress.skills[].key], weekly:(.progress.weekly|length),
     monthly:.progress.monthly_scores, w2t:.progress.weeks_to_target,
     due:(.progress.corrections_due|length), recent:(.progress.recent_sessions|length)}' /tmp/prog.json
# 기대: target 850, streak 2, words 6(review_count>0 카드), cs = 700±40의 5배수 number,
#       skills에 grammar/fluency/vocabulary/reading (listening 없음), weekly 7,
#       monthly [], w2t null, due 2, recent ≥ 3
jq '.progress.corrections_due[0].preview.again.label' /tmp/prog.json   # → "10분"
jq '[.progress.weekly[].minutes] | add' /tmp/prog.json                  # → user.total_minutes 중 이번주 분과 일치

# 2) 첨삭 복습 + 멱등
CID=$(jq '.progress.corrections_due[0].id' /tmp/prog.json)
REQ=$(node -e 'console.log(crypto.randomUUID())')
curl -s -X POST $API/api/corrections/$CID/review -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/jina-ck.txt \
  -d "{\"result\":\"good\",\"client_request_id\":\"$REQ\"}" \
  | jq '{status:.correction.status, in:.correction.next_review_in_days, due:.stats.due}'
# → status "learned", in ≥ 1, due 1 (2→1)
# 같은 REQ 재전송 → replay:true, review_count/stats 불변
# result:"banana" → 400 BAD_REQUEST / 남의 id·없는 id → 404
# 3) 타입: jq로 user.streak, stats.due 가 number (BIGINT 파서 — 문자열이면 실패)
# 4) EXPLAIN: corrections due 쿼리가 corrections_due_idx (partial index) 사용
```

---

## Phase P3 — 프론트 (`src/shared/progress-store.jsx` + `src/screens/progress.jsx` 컷오버)

### 신규: `src/shared/progress-store.jsx` (`window.ProgressProvider` / `window.useProgress`)

vocab-store.jsx를 1:1 패턴 복제. `window.JINA_API` 사용, Provider 부재 시 fallback.

```
상태:  data (mock 모양으로 매핑 완료된 객체 | null), loading, error
액션:  refresh()                        GET /api/progress → 매핑 → data
       reviewCorrection(id, result)     낙관적 (vocab updateWord :59-89 패턴):
                                        preview[result]로 즉시 반영 — next가 미래면 corrections_due에서
                                        제거(배지 감소) → POST /api/corrections/:id/review
                                        (client_request_id: crypto.randomUUID())
                                        → 성공 시 서버 stats/correction으로 확정, 실패 시 롤백 + 에러 배너
매퍼 (표시 문자열/색의 단일 소스 — 이 파일에만 존재):
  DAY_LABEL = {0:'일',1:'월',2:'화',3:'수',4:'목',5:'금',6:'토'}   // ProgressWeeklyChart:331 dayMap과 동일 —
                                                                  // 오늘 하이라이트(:332,:338)가 자동 일치
  weekly[].day        = DAY_LABEL[new Date(w.date+'T00:00:00').getDay()]
  skills[].color      = {grammar:'#B794F4', fluency:'#F687B3', vocabulary:'#4FD1C5',
                         listening:'#F6AD55', reading:'#68D391'}[s.key]   // mock :16-20의 색 이관
  recent_sessions[].date = formatSessionDate(at)   // '오늘'|'어제'|'M월 D일'
  corrections_due[].next_review = formatNextReview(c)   // vocab-store :12-17와 동형 ('Today'…)
캐시:  localStorage['jina_progress_cache_v1'] write-through — 로드 실패 시 폴백 + 에러 배너 (빈 화면 금지)
fallback (Provider 부재 = 캔버스): 현행 PROGRESS_DATA를 이 파일로 이사해 FALLBACK_DATA로 반환.
  reviewCorrection은 {ok:false, code:'READONLY'} (vocab-store :172-175 패턴).
  useProgress()는 훅 규칙상 fallback 훅을 항상 호출 후 ctx || fallback (vocab-store :189-193).
```

`refresh()`는 mount 1회 + **탭 재진입 시 재조회 불필요** (Provider가 페이지 전환에도 생존 —
main.jsx Provider 중첩이 그 목적). 단 `reviewCorrection` 성공 응답의 stats만으로는 weekly/streak가
안 늘므로, 복습 성공 후 **debounce된 refresh() 1회**를 뒤따라 호출(집계 동기화).

### `src/screens/progress.jsx` 수정 지점 (라인은 2026-08-19 실측 — 착수 전 재확인)

| 위치 | 수정 |
|---|---|
| :4-50 `PROGRESS_DATA` | **삭제** — progress-store.jsx의 FALLBACK_DATA로 이사 (필드명 그대로) |
| :52 `SCORE_MILESTONES` | 유지 (표시 상수) |
| :57-62 `ProgressDesktop` 도입부 | :58 `corrTab` **삭제**(죽은 state). :59 `const d = PROGRESS_DATA` → `const { data: d, loading, error, reviewCorrection } = useProgress();` + `const [reviewing, setReviewing] = React.useState(false);`. `d`가 null이면(초기 로딩) 스피너 플레이스홀더 반환(빈 화면 금지). :61 `scoreProgress`는 `d.user.current_score == null`이면 0 |
| :85 첨삭 배지 | 무수정 (`d.corrections_due.length`) |
| :106-115 사이드바 이번 주 | 무수정 (weekly 7행 보장) |
| :137-142 점수 숫자 | `current_score == null`이면 숫자 대신 `—` + :182-184 문장을 "회화·학습 데이터가 쌓이면 예상 점수를 계산해요."로 교체하는 분기 |
| :150-152 델타 칩 | `PROGRESS_DATA.monthly_scores[0].score` 직참조 **삭제** — `d.monthly_scores.length ? …` 가드로 칩 자체를 숨김 (v1은 항상 숨김) |
| :183 "약 8주 후" | `d.weeks_to_target == null`이면 "목표까지 N점 남았어요."까지만 렌더, 값이 오면 기존 문장 복원 (조건부 span) |
| :218-220 skills map | 무수정 (서버가 준 배열 — Listening 부재 안전). `d.skills.length === 0`이면 "AI 회화를 시작하면 스킬 분석이 표시돼요" 빈 상태 div |
| :231 weekly chart | 무수정 |
| :244-246 recent_sessions | 무수정 (key={s.id}는 스토어의 `"{kind}-{pk}"` 문자열로 유일). `length===0`이면 "아직 세션 기록이 없어요" |
| :264-266 CorrectionCard map | `<CorrectionCard … reviewing={reviewing} onResult={(r) => reviewCorrection(c.id, r)} />`. `length===0`이면 "복습할 첨삭이 없어요 🎉" + 버튼 비활성 |
| :269-275 "지금 복습 시작" | `onClick={() => setReviewing(true)}`; reviewing이면 라벨 "복습 종료"·`setReviewing(false)` 토글 |
| :287 ScoreTrend 호출 | `d.monthly_scores.length >= 2`일 때만 — 아니면 카드 본문을 "월별 추이는 데이터가 쌓이면 표시돼요" 빈 상태로 (**:364 Math.min(...[])·:367 0나눗셈 크래시 방지**) |
| :418-442 `SessionRow` | :419 `scoreColor` 에 null 가드 1개: `s.score == null ? theme.textDim : …`, :439 표기 `{s.score ?? '—'}` |
| :447-468 `CorrectionCard` | props `{correction, theme, reviewing, onResult}` 로 확장. `reviewing && correction.preview`일 때 :465 reason 아래에 SRS 버튼 4개 렌더 — 라벨 `다시/어려움/보통/쉬움` + **부제 `correction.preview[r].label`** (vocabulary.jsx 플래시카드 버튼 행과 같은 스타일·순서 — 하드코딩 부제 금지, 단어장 버그 3 재발 방지) |
| :473-475 `MobileProgress` | :474 동일 훅 교체 + null 가드 (Desktop과 같은 스피너) |
| :519 모바일 진행 바 | `current_score == null` 가드 (width 0) |
| :522-524 "예상 8주 후" | :183과 동일 처리 |
| :528-541 stats row | 무수정 (`total_minutes`/`sessions_done`/`words_learned` 필드명 유지) |
| :585-610 모바일 첨삭 | :590-609 desktop과 동일: 배지 무수정, CorrectionCard에 reviewing/onResult 전달, :602-609 버튼 → reviewing 토글 |
| :618-619 window export | 무수정 |

**Desktop/Mobile이 같은 `useProgress()`를 소비**하므로 창 크기 전환에도 데이터·복습 진행이
이어진다(Context 승격 증명 — 단어장과 동일).

### 앱 셸 / HTML

| 파일 | 수정 |
|---|---|
| `src/main.jsx` | Provider 중첩에 `ProgressProvider` 추가 — 현재 :354-356 `<VocabProvider>{renderPage()}</VocabProvider>`는 01/02 이후 3중첩이 되어 있을 것. **가장 안쪽**에 `<ProgressProvider>` 삽입(다른 Provider에 의존하지 않으므로 순서 자유 — 안쪽으로 고정만) |
| `index.html` | shared 블록(현재 :29 vocab-store 뒤, 01/02가 추가한 store 뒤) 에 `<script type="text/babel" src="src/shared/progress-store.jsx"></script>` — **`src/screens/progress.jsx`(:40) 앞이면 됨**. KEEP IN SYNC 주석(:23)에 `progress-store는 progress 앞` 추가 |
| `canvas.html` | 같은 태그를 같은 상대 위치(:31 블록)에 — **둘 다 갱신** (함정 5). 캔버스는 Provider 없이 `useProgress` fallback = 이사한 PROGRESS_DATA로 기존과 똑같이 렌더(`src/app.jsx:124-129`의 progress 아트보드 2개 무수정) |

### 검증할 브라우저 시나리오 (→ Phase P4의 e2e로 자동화)

`localhost:3003` → 학습 통계 탭 → 상단 점수 카드에 실집계(예상 점수 number 또는 `—` 빈 상태,
mock 720/24일이 아님) → 사이드바 첨삭 배지 = 2 (시드) → 주간 차트에 시드 활동(어제/오늘 막대>0,
오늘 하이라이트) → 월별 추이 카드가 크래시 없이 빈 상태 문구 → "지금 복습 시작" → 첨삭 카드에
버튼 4개(부제 "10분" 등 서버 preview 라벨) → "보통" 클릭 → 카드 목록에서 제거 + 배지 2→1 →
**새로고침 후에도 1** (서버 저장 증명) → 창 <768px 모바일 통계 = 같은 수치·같은 due (Context 증명)
→ API 프로세스 kill → 새로고침 → 캐시 데이터 + 에러 배너(빈 화면 아님) → `canvas.html` →
통계 아트보드 2개가 mock(fallback)으로 기존과 동일 렌더 + 복습 시도 시 READONLY.

---

## Phase P4 — 검증 자동화 (`scripts/e2e-progress.mjs`)

`scripts/e2e-vocab.mjs` 골격 복제 — **CDN 차단 컨테이너용 `routeCdn()`(e2e-vocab.mjs:11-22) 그대로 복사**,
Babel 컴파일 대기 ~9s 패턴 동일, `check(name, ok)` 러너, 실패 1개면 exit 1:

```
 1. 데스크탑 렌더 → '학습 통계' 탭 클릭
 2. mock 아님 증명: 본문에 mock 고정값 '1840'(total_minutes)·'243'(words_learned) 부재,
    연속 학습 값이 '24일'이 아님
 3. page.evaluate로 JINA_API.get('/api/progress') → 화면 사이드바 첨삭 배지 == corrections_due.length
    (서버 단일 소스 증명)
 4. 월별 추이 카드: 빈 상태 문구 렌더 + 콘솔 에러 0 (Infinity/0나눗셈 크래시 방지 증명)
 5. '지금 복습 시작' 클릭 → SRS 버튼 4개 표시, '다시' 버튼 부제 == '10분' (서버 preview 라벨)
 6. '보통' 클릭 → 1.5s 대기 → 해당 첨삭 카드 소멸 + 배지 감소
 7. page.reload() → 통계 탭 → 배지가 감소값 유지 (서버 저장 증명)
 8. 모바일 뷰포트(390×844) 새 페이지 → 통계 탭 → 데스크탑과 같은 배지/streak 값 (Context/서버 단일 소스)
 9. canvas.html 렌더 → progress 아트보드에 mock 수치(24) 표시(fallback) +
    JINA_API.post('/api/corrections/1/review', {result:'good'}) → code==='READONLY'
10. 콘솔 에러 0
```

멱등/400/404는 API 레벨(Phase P2 curl)에서 검증 — 브라우저에서 반복하지 않는다.

**최종 완료 판정 체크리스트**

- [ ] `npm run db:status` — 0001~0007(실번호) 전부 applied, MODIFIED 없음 (선행 파일 무수정 증명)
- [ ] `db:migrate`/`db:seed` 2회 반복 무해, `db:rollback` → 신규 2테이블 소멸 → 재적용 왕복
- [ ] `db:reset -- --yes`가 correction_reviews/user_goals 포함 전부 드롭 (RESET_TABLES 갱신 증명)
- [ ] Phase P2 curl 전부 기대값 (특히 monthly `[]`, weeks_to_target `null`, replay 멱등, stats.due 감소)
- [ ] `GET /api/progress` 응답의 streak/total_minutes/due가 **number 타입** (BIGINT/NUMERIC 파서)
- [ ] `grep -c PROGRESS_DATA src/screens/progress.jsx` → 0 (mock은 스토어 fallback으로만 존재)
- [ ] `node scripts/e2e-progress.mjs` exit 0
- [ ] 회귀: `node scripts/e2e-vocab.mjs` + `e2e-conversation.mjs` + `e2e-lesson.mjs` 전부 exit 0
      (Provider 중첩·script 태그 추가가 기존 탭을 깨지 않음)
- [ ] `api/ai/schemas.js`/`prompts.js` diff 0줄 (신규 AI task 없음 확인)

---

## 수정/생성 파일 요약

**신규**
- `db/migrations/0007_progress.sql` / `0007_progress.down.sql` (번호는 실측 확정)
- `api/services/progress.service.js` (집계 + estimateToeicScore), `api/services/corrections.service.js` (SRS 복습)
- `api/routes/progress.routes.js`
- `src/shared/progress-store.jsx`
- `scripts/e2e-progress.mjs`

**수정**
- `db/migrate.mjs` — RESET_TABLES에 `correction_reviews`(맨 앞)·`user_goals`(users 앞) 삽입
- `db/seeds/dev.mjs` — user_goals upsert + correction 복습 이력 1건 (now() 상대시각, make_interval)
- `api/server.js` — `registerProgressRoutes` 등록 1줄
- `api/services/conversation.service.js` — (필요 시) 첨삭 SELECT/DTO 함수 export 추가 1-2줄 (중복 정의 금지)
- `src/screens/progress.jsx` — 위 표 (mock 삭제 + useProgress + 빈 상태 + SRS 버튼)
- `src/main.jsx` — ProgressProvider 중첩
- `index.html` / `canvas.html` — progress-store script 태그 + KEEP IN SYNC 주석
- `db/README.md` — 후속과제 GRANT 목록에 `correction_reviews`, `user_goals` 추가 (:38-40)

**수정 금지 (읽기 전용 참조 — 패턴 원본)**
- `api/services/srs.js` — `applyReview`/`predict` import만 (corrections가 같은 컬럼 세트인 이유)
- `api/services/vocab.service.js` / `api/routes/vocab.routes.js` — review 트랜잭션/멱등/CASE 원본
- `src/shared/vocab-store.jsx` / `src/shared/api-client.jsx` — 스토어/fetch 래퍼 원본
- `api/ai/*` 전부 — 신규 task 없음
- `db/migrations/0001~0006` — 체크섬 (고칠 것은 새 번호)

## 열어둔 판단 (구현 중 확정)

- **`weeks_to_target` 산식**: 점수 스냅샷(`progress_snapshots` 후속 테이블) 도입 후
  최근 4주 기울기로 계산. v1은 null 고정 — 프론트 절 생략 분기는 이번에 깔아둔다.
- **monthly_scores 채우기**: 스냅샷 테이블 + 일일 기록 시점(첫 GET /api/progress 시 lazy 기록 vs
  라우틴) — 03-dashboard 또는 후속에서. DTO 계약은 이번에 확정되므로 서버만 바꾸면 된다.
- **estimateToeicScore 계수(0.6/0.4, 400+acc*4.5)**: v1 placeholder. 조정 시 이 함수 한 곳만.
- **사이드바 '세션 기록'/'첨삭 복습' 네비**(:83-86): v1은 표시 전용 유지 (active 고정 'overview').
  섹션 앵커 스크롤은 후속.
- **복습 버튼 4개 vs 2개(맞음/틀림)**: v1은 단어장과 동일한 4버튼 (srs.js 재사용 + preview 라벨
  일관성). 첨삭에 4단계가 과하면 후속에서 good/again 2버튼으로 축약 — 서버 계약은 불변.
