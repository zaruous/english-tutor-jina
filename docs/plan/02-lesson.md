---
# status: draft | in_progress | done · phase.status: done | pending_verification | todo
plan: "02"
title: "TOEIC 학습 탭 영속화 (lessons / lesson_items / user_lesson_attempts)"
status: done
created: 2026-08-19
updated: 2026-08-19
depends_on: ["PLAN-vocab-backend"]
migrations: ["0005_lessons", "0006_lessons_seed"]
phases:
  - { id: "1", name: "DB — 마이그레이션 + dev 시드", status: done }
  - { id: "2", name: "API — lesson.service / lesson.routes (정답·해설 비노출)", status: done }
  - { id: "3", name: "프론트 컷오버 — lesson-store.jsx / lesson.jsx", status: done }
  - { id: "4", name: "자동 검증 — e2e-lesson.mjs", status: done }
verify: ["scripts/e2e-lesson.mjs"]
follow_ups:
  - "GET /api/lessons/recommended → 플랜 03/07에서 구현됨"
  - "lesson_gen task(AI 문제 생성) → 플랜 07 Phase 2에서 구현됨"
  - "passage JSONB highlight 필드"
---

# 02 — TOEIC 학습 탭 영속화 (lessons / lesson_items / user_lesson_attempts)

> 단어장(vocabulary) 탭에서 확립한 4개 패턴을 TOEIC 학습 탭에 복제한다:
> ① `db/migrations/NNNN_*.sql` 마이그레이션 규범 ② DTO + 파생값 서버 단일 소스
> ③ Context 스토어(`vocab-store.jsx` 패턴) ④ CLI 프록시 + JSON 스키마.
> 이 문서는 다음 세션의 구현 에이전트가 그대로 실행하는 실행 계획서다.
> 패턴 원본: `db/migrations/0002_vocab.sql`, `api/services/vocab.service.js`,
> `api/routes/vocab.routes.js`, `src/shared/vocab-store.jsx`, `scripts/e2e-vocab.mjs`.

## Context — 현황

`src/screens/lesson.jsx`는 하드코딩 mock 2세트로 도는 UI 프로토타입이다.

| 문제 | 위치 (2026-08-19 기준 실측 라인) |
|---|---|
| 콘텐츠 전체가 클라이언트 상수 | `LESSON_DATA` :4-65, `LESSON_DATA_2` :67-126, `LESSONS` :128 |
| **정답이 클라이언트에 노출** — `options[].correct`가 소스/브라우저에 그대로 보임 | :34, :45, :54, :95, :106, :116 및 `QuestionCard` :293-294 (`showRight = revealed && o.correct`) |
| 채점이 클라이언트 | `QuestionsColumn` :344-354 (`answers`/`revealed`/`correctCount`), 결과 카드 :388-425 |
| **해설 버그: set24가 set23 해설을 보여줌** — 해설이 `q.n`(1/2/3) 하드코딩이라 지문과 무관 | `QuestionCard` :323-336 (하드코딩 텍스트 :332-334). set24용 해설은 아예 없음 |
| 진도/헤더 하드코딩 | `LessonTopBar` :159 (`난이도 ★★★☆☆ · 권장 6분`), 모바일 헤더 :591 (`4/10`), :594 (`Set 23 — 비즈니스 이메일`), 모바일 탭 :606 (`문제 3`) |
| 문제풀이 상태가 `key={lessonIdx}` 리마운트로 소실 | :558 (desktop), :656 (mobile) — answers/revealed가 `QuestionsColumn` 로컬 state |
| Jina 패널 추천 질문이 set23 전용 하드코딩 | `JinaSidePanel` :486-491, `MobileJinaTab` :681-685 |
| 시도 기록이 어디에도 안 남음 | `progress.done/total`(:8, :71)이 mock 리터럴 |

**핵심 구조 이점**: `LessonCtx = React.createContext(LESSON_DATA)` (:130) 이 기성 주입 시임(injection seam)이다.
`LessonDesktop`(:544)/`LessonMobile`(:576)의 `<LessonCtx.Provider value={currentLesson}>` 의 value만
서버 DTO로 교체하면 `LessonTopBar`/`PassageColumn`/`QuestionsColumn` 하위 컴포넌트는 데이터 접근
경로를 바꿀 필요가 없다.

### 목표

1. 콘텐츠(지문/문제/해설/어휘)를 `lessons`/`lesson_items`로 이관 — **정답·해설은 DB에만**
2. 채점을 `POST /api/lessons/:id/attempts` 서버 채점으로 이관 — 정답/해설은 **채점 응답에만** 실려 내려옴
3. `progress.done/total`을 `user_lesson_attempts` 집계 파생값으로 (저장 금지, 매 요청 계산)
4. `src/shared/lesson-store.jsx` Context 스토어 — Provider 부재 시(캔버스) 메모리 fallback
5. AI 신규 task **없음** — Jina 패널은 기존 `useJinaChat`(tutor task, `POST /api/ai/chat`) 그대로.
   `api/ai/schemas.js`/`prompts.js` 이번 단계 무수정 (LLM 문제 생성 `lesson_gen` task는 후속)

### 단어장 구현에서 겪은 함정 → 이 문서에서의 적용

| 함정 | 적용 |
|---|---|
| PG 42804: 같은 파라미터를 `::int` 캐스트와 `||` 텍스트 연결에 재사용 금지 | 시드 attempt 타임스탬프는 `now() - make_interval(days => $n::int)` 로만. `($n || ' days')::interval` 금지 |
| pg BIGINT/NUMERIC 문자열 반환 | `api/lib/pool.js`에 `setTypeParser(20/1700, Number)` **이미 적용됨** — 재작업 금지. 단 `count(*)`는 습관대로 SQL에서 `::int` 캐스트 |
| 인증/CSRF/CORS/READONLY 미들웨어 이미 존재 | `requireUser`(api/middleware/auth.js), `X-Requested-With` CSRF, 캔버스 `X-Jina-Mode` 403은 `api/server.js:34-41`이 전역 처리 — **재구현 금지** |
| 시드 타임스탬프는 now() 상대시각 | dev.mjs의 attempt 시드는 `now() - interval '1 day'` 상대값 (고정값 금지) |
| 캔버스는 main.jsx를 안 탐 | `LessonProvider`는 `index.html` 경로(main.jsx)에만. `useLesson`은 fallback 필수. **새 `<script>`는 index.html/canvas.html 둘 다** |
| 기존 테이블 11개는 다른 앱 소유 | 신규 3개(`lessons`, `lesson_items`, `user_lesson_attempts`)는 기존 11개(`study_sessions`, `session_messages`, `session_corrections`, `vocabulary`, `vocab_quiz_details`, `diary_details`, `freetalk_details`, `grammar_details`, `pronunciation_details`, `roleplay_details`, `shadowing_details`)와 충돌 없음 — 확인 완료 |
| 적용된 마이그레이션 수정 금지 | 신규는 `0004_lessons.sql`, `0005_lessons_seed.sql` (+ `.down.sql`). 0001~0003 절대 무수정 |

### HANDOFF.md §2 와의 의도적 차이

`docs/HANDOFF.md:176-193`은 `lessons.id TEXT PK` / `user_id UUID`를 제안하지만, 단어장에서 확정한
규칙(`users.id BIGSERIAL`, 자연키는 별도 UNIQUE 컬럼)을 따른다: `lessons.id BIGSERIAL PK` +
`slug TEXT UNIQUE`(기존 mock id `'toeic-part7-set23'` 이관). HANDOFF의 `content JSONB` 단일 컬럼
대신 문제를 `lesson_items` 행으로 분리 — 정답/해설을 SELECT 컬럼 수준에서 제외하기 위해서다
(JSONB 한 덩어리면 매 요청 jsonb 수술이 필요하고 실수 한 번에 정답이 샌다). 구현 완료 후
HANDOFF.md §2/§3의 해당 부분을 실제 구현에 맞게 갱신한다(단어장 Phase 7-3과 동일 규범).

---

## Phase 1 — DB (`db/migrations/0004`, `0005` + dev 시드 확장)

### `db/migrations/0004_lessons.sql`

```sql
CREATE TABLE IF NOT EXISTS public.lessons (
  id           BIGSERIAL   PRIMARY KEY,
  slug         TEXT        NOT NULL,                       -- 'toeic-part7-set23' (mock id 이관)
  kind         TEXT        NOT NULL DEFAULT 'toeic_part7',
  title        TEXT        NOT NULL,                       -- 'TOEIC Part 7 — 단일 지문'
  subtitle     TEXT        NOT NULL DEFAULT '',            -- 'Set 23 · 비즈니스 이메일'
  difficulty   SMALLINT    NOT NULL DEFAULT 3,
  est_minutes  SMALLINT    NOT NULL DEFAULT 6,
  passage      JSONB       NOT NULL,                       -- {type,from,to,cc,date,subject,body:[]}
  vocab        JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{word,ipa,pos,meaning,ex}] 표시용
  faq          JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- Jina 패널 추천 질문 (문자열 배열)
  position     INT         NOT NULL DEFAULT 0,             -- 목록/'다음 지문' 순서
  published    BOOLEAN     NOT NULL DEFAULT true,
  created_by   BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lessons_slug_key      UNIQUE (slug),
  CONSTRAINT lessons_kind_ck       CHECK (kind IN ('toeic_part5','toeic_part7')),
  CONSTRAINT lessons_difficulty_ck CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT lessons_passage_ck    CHECK (jsonb_typeof(passage) = 'object'),
  CONSTRAINT lessons_vocab_ck      CHECK (jsonb_typeof(vocab) = 'array'),
  CONSTRAINT lessons_faq_ck        CHECK (jsonb_typeof(faq) = 'array')
);
CREATE INDEX IF NOT EXISTS lessons_position_idx ON public.lessons (position, id) WHERE published;

CREATE TABLE IF NOT EXISTS public.lesson_items (
  id          BIGSERIAL   PRIMARY KEY,
  lesson_id   BIGINT      NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  position    SMALLINT    NOT NULL,                        -- 화면의 q.n (1부터)
  stem        TEXT        NOT NULL,
  options     JSONB       NOT NULL,                        -- [{id:'A',text:'…'}] ★correct 플래그 없음
  answer      TEXT        NOT NULL,                        -- 정답 옵션 id. GET DTO 제외, 채점 응답에만
  explanation TEXT        NOT NULL DEFAULT '',             -- Jina 해설 (아이템 데이터로 이관 = 해설 버그 해소)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_items_lesson_pos_uq UNIQUE (lesson_id, position),
  CONSTRAINT lesson_items_position_ck   CHECK (position BETWEEN 1 AND 50),
  CONSTRAINT lesson_items_answer_ck     CHECK (answer ~ '^[A-Z]$'),
  CONSTRAINT lesson_items_options_ck    CHECK (jsonb_typeof(options) = 'array'
                                          AND jsonb_array_length(options) BETWEEN 2 AND 6)
);
CREATE INDEX IF NOT EXISTS lesson_items_lesson_idx ON public.lesson_items (lesson_id, position);

CREATE TABLE IF NOT EXISTS public.user_lesson_attempts (
  id                BIGSERIAL   PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  lesson_id         BIGINT      NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  answers           JSONB       NOT NULL,   -- {"1":"B","2":"C","3":"B"} (position 문자열 → 옵션 id)
  correct_count     SMALLINT    NOT NULL,   -- 채점 시점 사실 기록 (vocab_reviews의 prev/next와 같은 성격)
  total_count       SMALLINT    NOT NULL,
  elapsed_ms        INT,
  client_request_id UUID,                   -- 멱등키 (vocab_reviews 패턴)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ula_answers_ck CHECK (jsonb_typeof(answers) = 'object'),
  CONSTRAINT ula_counts_ck  CHECK (correct_count >= 0 AND total_count >= 1
                              AND correct_count <= total_count)
);
CREATE INDEX IF NOT EXISTS ula_user_lesson_idx ON public.user_lesson_attempts (user_id, lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ula_user_time_idx   ON public.user_lesson_attempts (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ula_reqid_uq ON public.user_lesson_attempts (client_request_id)
  WHERE client_request_id IS NOT NULL;
```

**저장하지 않는 파생값** (매 요청 계산 — 단어장 status와 같은 규범):
`progress.done/total`, `attempt_count`, `best_correct`, `last_attempted_at`, `score`.
`correct_count/total_count`는 파생값이 아니라 **채점 이벤트의 사실 기록**이다(아이템이 나중에
추가되어도 과거 시도의 점수가 변하면 안 됨).

### `db/migrations/0004_lessons.down.sql`

```sql
DROP TABLE IF EXISTS public.user_lesson_attempts;
DROP TABLE IF EXISTS public.lesson_items;
DROP TABLE IF EXISTS public.lessons;
```

### `db/migrations/0005_lessons_seed.sql` — 참조 데이터 (콘텐츠 이관)

`lesson.jsx:4-126`의 `LESSON_DATA`/`LESSON_DATA_2`를 그대로 이관한다. 사용자 무관 콘텐츠이므로
`0003_vocab_words_seed.sql`과 같이 마이그레이션으로 (dev.mjs 아님). 멱등: `ON CONFLICT DO NOTHING`.
JSONB 본문은 `$$ … $$` 달러 인용 — 러너가 SQL 문을 분할하지 않으므로 안전하다.
**파일은 BOM 없는 UTF-8, 반드시 `npm run db:migrate`로만 적용** (psql -f 금지 — 한글 깨짐 실측).

```sql
INSERT INTO public.lessons (slug, kind, title, subtitle, difficulty, est_minutes, passage, vocab, faq, position)
VALUES
('toeic-part7-set23', 'toeic_part7', 'TOEIC Part 7 — 단일 지문', 'Set 23 · 비즈니스 이메일', 3, 6,
 $$ {"type":"EMAIL","from":"Daniel Park <d.park@meridian-co.com>","to":"All Marketing Team",
     "cc":"Hannah Lee, J. Whitmore","date":"Tuesday, May 26 · 09:14",
     "subject":"Q3 Campaign Kickoff — Action Items",
     "body":["Dear team,", …lesson.jsx:17-25의 9개 문단 그대로(** 강조 마크업 포함)…]} $$::jsonb,
 $$ [{"word":"accommodate","ipa":"/əˈkɑːmədeɪt/","pos":"v.","meaning":"~을 수용하다, 맞추다","ex":"to accommodate the schedule"},
     {"word":"anticipate", …:61-64 그대로…}] $$::jsonb,
 $$ ["\"moved up by one week\"을 한국어로 풀어주세요","이 이메일의 어조(tone)는 어떤가요?",
     "Daniel Park이 가장 강조한 메시지는 무엇인가요?","\"accommodate\"가 비즈니스에서 쓰이는 다른 예시는?"] $$::jsonb,
 1),
('toeic-part7-set24', 'toeic_part7', 'TOEIC Part 7 — 단일 지문', 'Set 24 · 공지 및 안내문', 3, 6,
 $$ {…lesson.jsx:72-87의 passage 그대로…} $$::jsonb,
 $$ […:121-125의 vocabulary 그대로…] $$::jsonb,
 $$ ["\"no later than\"은 어떤 뉘앙스인가요?","이 공지에서 직원이 해야 할 일을 정리해주세요",
     "\"operational\"이 비즈니스에서 쓰이는 다른 예시는?"] $$::jsonb,
 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.lesson_items (lesson_id, position, stem, options, answer, explanation)
SELECT l.id, v.position, v.stem, v.options::jsonb, v.answer, v.explanation
  FROM (VALUES
    (1, 'What is the main purpose of the email?',
     '[{"id":"A","text":"To announce a new hire in the marketing team"},{"id":"B","text":"To outline next steps for an upcoming campaign"},{"id":"C","text":"To request approval for a budget increase"},{"id":"D","text":"To reschedule a regional sales conference"}]',
     'B', '이메일 첫 문단의 "moving forward with the campaign as our Q3 priority"와 본문 1-3번 액션 아이템이 핵심 단서예요. 캠페인의 다음 단계를 정리한 이메일이에요.'),
    (2, …:41-47 그대로…, 'C', '"the launch date has been moved up by one week"의 move up은 "앞당기다"라는 뜻이에요. (C) one week earlier가 정답.'),
    (3, …:51-57 그대로…, 'B', 'blockers는 IT/비즈니스 영어에서 "진행을 가로막는 장애물"을 뜻해요. 가장 가까운 동의어는 obstacles.')
  ) AS v(position, stem, options, answer, explanation)
  JOIN public.lessons l ON l.slug = 'toeic-part7-set23'
ON CONFLICT (lesson_id, position) DO NOTHING;

-- set24도 같은 형태 (:92-118의 stem/options 그대로). ★set24 해설은 mock에 존재하지 않았다
-- (해설 버그의 원인). 아래 신규 해설을 그대로 사용:
--  Q1(B): '공지 제목과 첫 문단 "Elevator B … will be taken out of service"가 핵심 단서예요.
--          엘리베이터의 임시 운행 중단을 알리는 공지예요.'
--  Q2(C): '"contact Facilities Management at ext. 4400 by Wednesday afternoon"이 그대로 답이에요.
--          이메일이 아니라 내선 4400으로 전화, 기한은 수요일 오후.'
--  Q3(B): '"we will provide an updated timeline no later than Friday at noon" — no later than은
--          "늦어도 ~까지"라는 뜻이에요. (B) By Friday at noon이 정답.'
```

(`…그대로…` 부분은 구현 시 `lesson.jsx` 해당 라인의 텍스트를 문자 그대로 복사한다.
mock의 `progress` 필드는 파생값이므로 버린다. `q.n`은 `position`으로, `options[].correct`는
`answer` 컬럼으로 변환한다.)

### `db/migrations/0005_lessons_seed.down.sql`

```sql
DELETE FROM public.lessons WHERE slug IN ('toeic-part7-set23','toeic-part7-set24');
-- lesson_items는 ON DELETE CASCADE
```

### `db/migrate.mjs` 수정 — RESET_TABLES 확장

`db/migrate.mjs:22`의 `RESET_TABLES` 배열 **맨 앞**(FK 역순)에 추가:
`'user_lesson_attempts', 'lesson_items', 'lessons'`. `FOREIGN_TABLES`(:31) self-assert가
자동으로 이름 충돌을 재검증한다.

### `db/seeds/dev.mjs` 확장 — 개발용 attempt 1건

카드 시드 루프 뒤에 추가 (멱등: 고정 `client_request_id` + `ula_reqid_uq`):

```js
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
```

주의: partial unique index에 대한 `ON CONFLICT`는 위처럼 `WHERE` 절까지 명시해야 매칭된다.
타임스탬프는 `make_interval(days => 1)` — `('1' || ' days')` 텍스트 연결 금지(42804 함정).
결과: 시드 직후 진도 = **1/2** (set23 시도됨, set24 미시도).

**완료 판정**: `npm run db:migrate && npm run db:seed` → `npm run db:status` 5개 전부 applied.
psql(chcp 65001)에서 `select slug, subtitle from lessons` 한글 안 깨짐,
`select position, answer, left(explanation,20) from lesson_items order by lesson_id, position` 6행,
set24의 3행 해설이 set23과 다른 텍스트. `npm run db:rollback` 2회 → 0003으로 복귀 → 재적용 성공.

---

## Phase 2 — API (`api/services/lesson.service.js` + `api/routes/lesson.routes.js`)

### 엔드포인트

```
GET  /api/lessons                → {ok, lessons:[LessonSummary…], progress:{done,total}}
GET  /api/lessons/:id            → {ok, lesson:LessonDetail}          # ★정답·해설 제외
POST /api/lessons/:id/attempts   {answers, client_request_id?, elapsed_ms?}
                                 → {ok, attempt, results, progress}   # 정답·해설은 여기에만
GET  /api/lessons/recommended    → 후속(01-conversation의 corrections 축적 후). 이번엔 미구현.
                                   ★구현 시 router가 등록순 first-match이므로(api/router.js:20-29)
                                   반드시 /api/lessons/:id 보다 먼저 register 할 것
```

모든 라우트는 `requireUser` (단어장 `vocab.routes.js:12` 패턴). CSRF/CORS/캔버스 403은
`api/server.js`가 전역 처리 — 라우트에서 재구현하지 않는다.
`api/server.js`에 `registerLessonRoutes(router)` 등록 추가 (:14 import, :20 부근 호출).

### DTO 예시

`LessonSummary` (목록):
```json
{ "id": 1, "slug": "toeic-part7-set23", "kind": "toeic_part7",
  "title": "TOEIC Part 7 — 단일 지문", "subtitle": "Set 23 · 비즈니스 이메일",
  "difficulty": 3, "est_minutes": 6, "question_count": 3,
  "attempt_count": 1, "best_correct": 2, "last_attempted_at": "2026-08-18T05:11:00.000Z" }
```

`LessonDetail` (`GET /api/lessons/:id` — **`answer`/`explanation`/`correct` 키가 어디에도 없어야 한다**):
```json
{ "id": 1, "slug": "toeic-part7-set23", "kind": "toeic_part7",
  "title": "TOEIC Part 7 — 단일 지문", "subtitle": "Set 23 · 비즈니스 이메일",
  "difficulty": 3, "est_minutes": 6,
  "passage": { "type": "EMAIL", "from": "Daniel Park <d.park@meridian-co.com>", "to": "All Marketing Team",
               "cc": "Hannah Lee, J. Whitmore", "date": "Tuesday, May 26 · 09:14",
               "subject": "Q3 Campaign Kickoff — Action Items", "body": ["Dear team,", "…"] },
  "questions": [ { "n": 1, "stem": "What is the main purpose of the email?",
                   "options": [ {"id":"A","text":"…"}, {"id":"B","text":"…"},
                                {"id":"C","text":"…"}, {"id":"D","text":"…"} ] } ],
  "vocabulary": [ { "word":"accommodate", "ipa":"/əˈkɑːmədeɪt/", "pos":"v.",
                    "meaning":"~을 수용하다, 맞추다", "ex":"to accommodate the schedule" } ],
  "faq": ["\"moved up by one week\"을 한국어로 풀어주세요", "…"],
  "attempt_count": 1, "best_correct": 2, "question_count": 3,
  "next_lesson_id": 2 }
```
- `questions[].n` = `lesson_items.position` — 기존 컴포넌트의 `q.n` 계약 유지
- `vocabulary` 키 이름은 mock과 동일하게 (`lessons.vocab` 컬럼 → DTO에서 rename) —
  `PassageColumn:267`/`QuestionsColumn:431`이 `lesson.vocabulary`를 읽는다
- `next_lesson_id`: `position, id` 순서상 다음 published 레슨, 마지막이면 첫 레슨(순환) —
  '다음 지문' 버튼의 파생값. 클라이언트가 배열 인덱스 연산(`lessonIdx % LESSONS.length`)을 안 하게 됨

`POST /api/lessons/:id/attempts` 응답:
```json
{ "ok": true,
  "attempt": { "id": 7, "lesson_id": 1, "correct_count": 2, "total_count": 3,
               "score": 67, "created_at": "2026-08-19T09:12:00.000Z" },
  "results": {
    "1": { "your": "B", "correct": true,  "answer": "B",
           "explanation": "이메일 첫 문단의 \"moving forward with…\" …" },
    "2": { "your": "A", "correct": false, "answer": "C",
           "explanation": "\"the launch date has been moved up by one week\"의 move up은 …" },
    "3": { "your": "B", "correct": true,  "answer": "B", "explanation": "blockers는 …" } },
  "progress": { "done": 1, "total": 2 } }
```
`score = Math.round(correct_count / total_count * 100)` — 서버 계산, 저장 안 함.

### `api/services/lesson.service.js` — 쿼리 설계

파생값 집계 (`vocab.service.js`의 `CARD_SELECT`/`fetchStats` 패턴):

```sql
-- LIST_SELECT
SELECT l.id, l.slug, l.kind, l.title, l.subtitle, l.difficulty, l.est_minutes, l.position,
       (SELECT count(*)::int FROM public.lesson_items i WHERE i.lesson_id = l.id) AS question_count,
       COALESCE(a.attempt_count, 0) AS attempt_count, a.best_correct, a.last_attempted_at
  FROM public.lessons l
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS attempt_count, max(correct_count)::int AS best_correct,
           max(created_at) AS last_attempted_at
      FROM public.user_lesson_attempts ua
     WHERE ua.user_id = $1 AND ua.lesson_id = l.id
  ) a ON true
 WHERE l.published
 ORDER BY l.position, l.id;

-- fetchProgress(userId) — done/total은 항상 이 쿼리로 (저장 금지)
SELECT (SELECT count(*)::int FROM public.lessons WHERE published) AS total,
       (SELECT count(DISTINCT ua.lesson_id)::int
          FROM public.user_lesson_attempts ua
          JOIN public.lessons l2 ON l2.id = ua.lesson_id AND l2.published
         WHERE ua.user_id = $1) AS done;
```

`getLesson(user, id)`: lessons 1행 + `SELECT position, stem, options FROM lesson_items WHERE
lesson_id=$1 ORDER BY position` — **컬럼 나열에 `answer`/`explanation`을 아예 쓰지 않는다**
(`SELECT *` 금지가 유출 방지의 구조적 보장).

`submitAttempt(user, lessonId, { answers, clientRequestId, elapsedMs })` — `vocab.service.js
review()`(:97-149)와 같은 골격:

1. `withTx` 진입. **트랜잭션 안은 SELECT/INSERT만** (이 라우트는 CLI 호출이 없어 자연 준수)
2. 멱등: `clientRequestId`가 `user_lesson_attempts`에 있으면 저장된 `answers`로 아래 4의
   results를 재구성해 `{…, replay:true}` 응답 (review()의 :103-111 패턴)
3. `SELECT position, options, answer, explanation FROM public.lesson_items WHERE lesson_id=$1
   ORDER BY position` — 0행이면 404. `lessons.published` 아니면 404
4. 검증+채점 (전부 서버):
   - `answers`는 객체, 키는 아이템 position의 문자열 집합과 **정확히 일치** (누락/초과 → 400
     `BAD_REQUEST`, '모든 문항에 답해야 합니다')
   - 각 값은 해당 아이템 `options[].id` 중 하나 (아니면 400)
   - `correct_count = items.filter(i => answers[String(i.position)] === i.answer).length`
5. `INSERT INTO user_lesson_attempts … VALUES ($1,$2,$3::jsonb,…)` —
   `JSON.stringify(answers)`를 `$3::jsonb`로 (addCardFromEntry :175 패턴)
6. 응답 조립: `results[position] = { your, correct, answer, explanation }`, `progress` 재집계

### `api/routes/lesson.routes.js`

```js
export function registerLessonRoutes(router) {
  router.get('/api/lessons', …requireUser → listLessons…);
  router.get('/api/lessons/:id', …posInt(params.id) → getLesson…);
  router.post('/api/lessons/:id/attempts', …requireUser → readJson →
    clientRequestId: str(body.client_request_id, …, { max:36, optional:true, pattern: UUID_RE }),
    elapsedMs: posInt(body.elapsed_ms, …, { optional:true, max: 3_600_000 }),
    submitAttempt…);  // vocab.routes.js:61-73 그대로 복제
}
```

**완료 판정 (curl)** — `DEV_AUTOLOGIN=1` 전제, 쿠키 파일은 단어장 검증과 동일 방식:

```bash
# 쿠키 발급 (dev 자동로그인)
curl -s -c /tmp/ck.txt http://localhost:3004/api/auth/me -H 'X-Requested-With: jina' | jq .user.email

curl -s -b /tmp/ck.txt http://localhost:3004/api/lessons | jq '{slugs:[.lessons[].slug], progress}'
# → {"slugs":["toeic-part7-set23","toeic-part7-set24"],"progress":{"done":1,"total":2}}  ★dev 시드 attempt 반영

curl -s -b /tmp/ck.txt http://localhost:3004/api/lessons/1 > /tmp/lesson1.json
jq '.lesson.questions[0].options' /tmp/lesson1.json          # correct 키 없음
grep -c '"answer"\|"correct"\|"explanation"' /tmp/lesson1.json  # → 0  ★정답 비노출 판정
jq '.lesson.next_lesson_id' /tmp/lesson1.json                # → 2

REQ=$(uuidgen)
curl -s -X POST http://localhost:3004/api/lessons/1/attempts -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/ck.txt \
  -d "{\"answers\":{\"1\":\"B\",\"2\":\"A\",\"3\":\"B\"},\"client_request_id\":\"$REQ\"}" \
  | jq '{score:.attempt.score, r2:.results."2", progress}'
# → score 67, results."2" = {your:"A", correct:false, answer:"C", explanation:"…move up…"}

# 멱등: 같은 REQ 재전송 → replay:true, attempt_count 불변 (GET /api/lessons로 확인)
# 불완전 answers {"1":"B"} → 400 / 없는 옵션 {"1":"Z",…} → 400 / 없는 id /api/lessons/999 → 404
# set24 채점 응답의 explanation이 set23과 다른 텍스트 ★해설 버그 해소 판정
curl -s -X POST http://localhost:3004/api/lessons/2/attempts -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/ck.txt \
  -d '{"answers":{"1":"B","2":"C","3":"B"}}' | jq '.attempt.score, .results."3".explanation'
# → 100, "…no later than은 \"늦어도 ~까지\"…"
```

---

## Phase 3 — 프론트 컷오버

### 신규: `src/shared/lesson-store.jsx` (`window.LessonProvider` / `window.useLesson`)

`vocab-store.jsx`를 1:1 패턴 복제. `window.JINA_API` 사용, Provider 부재 시 메모리 fallback.

```
상태:  lessons, progress, listLoading, error
       currentId, current(LessonDetail), currentLoading
       answersByLesson: { [lessonId]: { [n]: optionId } }   ★리마운트에도 답이 살아남는 곳
       resultByLesson:  { [lessonId]: { attempt, results } }
       grading (POST 진행 중 여부)
액션:  refresh()                       GET /api/lessons
       select(lessonId)                GET /api/lessons/:id → current (캐시: 이미 받은 detail 재사용)
       setAnswer(n, optionId)          answersByLesson[currentId] 갱신 (result 있으면 무시)
       submit()                        POST /api/lessons/:id/attempts
                                       { answers, client_request_id: crypto.randomUUID() }
                                       성공 → resultByLesson 저장 + progress/lessons 갱신(refresh)
                                       실패 → error에 res.hint 포함 배너 (vocab-store :86 패턴)
       retake()                        answersByLesson/resultByLesson에서 currentId 삭제
       next()                          select(current.next_lesson_id)
파생:  answers = answersByLesson[currentId] ?? {}
       result  = resultByLesson[currentId] ?? null   (revealed = Boolean(result))
```

- 채점은 **비낙관적** (서버 왕복 후 공개 — 정답을 클라이언트가 모르므로 낙관적 채점이 불가능
  하다는 것 자체가 이 설계의 목적). DB 3쿼리라 <100ms — 스피너 '채점 중…'이면 충분, 취소 불필요
- 목록 로드 실패 시 `localStorage['jina_lesson_cache_v1']` write-through 폴백 + 에러 배너
  (vocab-store :44-53 패턴). detail은 캐시하지 않는다(본문이 커서 이득 대비 손해)
- **fallback** (`useLessonFallback`): mock 2세트를 DTO 모양으로 내장하되 **fallback 데이터에만**
  `answer`/`explanation`을 포함(캔버스 데모용 로컬 채점 — 실서비스 경로에는 존재하지 않음).
  `submit()`은 로컬 채점으로 `resultByLesson`을 채운다. READONLY 서버 가드와 무관하게 동작.
  `useLesson()`은 vocab-store :189-193과 동일하게 훅 규칙상 fallback을 항상 호출 후 `ctx || fallback`

### `src/screens/lesson.jsx` 수정 지점 (라인 실측 완료)

| 위치 | 수정 |
|---|---|
| :4-128 `LESSON_DATA`/`LESSON_DATA_2`/`LESSONS` | **전부 삭제** (0005 시드로 이관 완료 후) |
| :130 `LessonCtx = React.createContext(LESSON_DATA)` | `React.createContext(null)` — 주입 시임 유지 |
| :144-186 `LessonTopBar` | `progress`는 `useLesson().progress`로 (:166-171의 `progress.done/total` 표기 유지). :159 하드코딩 → `` `난이도 ${'★'.repeat(l.difficulty)}${'☆'.repeat(5-l.difficulty)} · 권장 ${l.est_minutes}분` `` |
| :275-339 `QuestionCard` | props `{q, answer, onAnswer, revealed}` → `{q, answer, onAnswer, revealed, correctId, explanation}`. :293 `revealed && o.correct` → `revealed && o.id === correctId`, :294 `!o.correct` → `o.id !== correctId` (:311 배경색 삼항도 동일 치환). :323-336 해설 블록의 하드코딩 3줄(:332-334) → `{explanation}` 렌더 (해설 버그 근본 해소 — 해설이 아이템 데이터) |
| :342-450 `QuestionsColumn` | :344-345 로컬 `answers`/`revealed` state 삭제 → `const { answers, setAnswer, result, grading, submit, retake } = useLesson()`. `revealed = Boolean(result)`. :350-353 클라 `correctCount` 삭제 → `result.attempt.correct_count` (:403-404 결과 카드도 동일). :346-349 `onAnswer` → `setAnswer(n, id)` (result 있으면 무시 — 기존 :347 가드와 동일 의미). :376 `setRevealed(true)` → `submit()`, `grading`이면 버튼 비활성 + '채점 중…'. :369-371 `QuestionCard`에 `correctId={result?.results?.[q.n]?.answer}` `explanation={result?.results?.[q.n]?.explanation}` 전달. :409 다시 풀기 → `retake()` |
| :453-532 `JinaSidePanel` | :486-491 FAQ 배열 → `lesson.faq` (LessonCtx에서, 비면 기존 배열 폴백) |
| :534-564 `LessonDesktop` | :537-538 `lessonIdx`/`LESSONS` 삭제 → `const { current, currentLoading, next } = useLesson()`. Provider `value={current}`. `current` 없으면 로딩/에러 플레이스홀더 렌더(빈 화면 금지). :539-542 `onNext` → `next()`. :558 `key={lessonIdx}` → `key={current.id}` (리마운트는 유지하되 답 상태는 스토어에 있어 소실되지 않음 — 하드코딩 문제 해소) |
| :569-666 `LessonMobile` | 동일 치환. :591 `4/10` → `` `${progress.done}/${progress.total}` ``, :594 `Set 23 — 비즈니스 이메일` → `{current.subtitle}`, :606 `문제 3` → `` `문제 ${current.questions.length}` ``, :656 `key={lessonIdx}` → `key={current.id}` |
| :668-724 `MobileJinaTab` | :681-685 FAQ → `lesson.faq` 폴백 동일 |

`PassageColumn:202-209`의 'blockers' 하이라이트는 set23 전용이지만 set24 본문에 해당 단어가
없어 무해 — 이번 범위에서 유지 (후속: passage JSONB에 highlight 필드).

### 앱 셸 / HTML

| 파일 | 수정 |
|---|---|
| `src/main.jsx:354-356` | `<VocabProvider><LessonProvider>{renderPage()}</LessonProvider></VocabProvider>` — 탭 전환에도 스토어 생존(진도 즉시 표시). :314/:323의 lesson case는 무수정 |
| `index.html:29` 다음 줄 | `<script type="text/babel" src="src/shared/lesson-store.jsx"></script>` (vocab-store 뒤, screens 앞) |
| `canvas.html:31` 다음 줄 | 동일 태그 — **둘 다 갱신, KEEP IN SYNC 주석 블록 안에** |
| `src/app.jsx:65,69` (캔버스) | 무수정 — Provider 없이 `useLesson` fallback으로 렌더 |

**완료 판정 (브라우저 수동)**: `localhost:3003` → 학습 탭 → 헤더 진도 `1/2`(dev 시드) →
Set 23 렌더(서버 본문) → 3문항 답변 → 채점하기 → 서버 점수/정답 표시 + 해설 → 다음 지문 →
**Set 24 렌더 + 모바일 헤더 `Set 24 · 공지 및 안내문`** → 채점 → **set24 고유 해설**(버그 해소) →
새로고침 → 진도 `2/2` 유지(서버 저장) → 창 <768px 모바일도 같은 진도 → 지문↔문제 탭 전환/
리마운트에도 고른 답 유지(스토어 증명) → devtools Network에서 `GET /api/lessons/1` 응답 본문에
`answer`/`explanation` 문자열 부재 확인 → `canvas.html` 학습 화면 렌더 + 로컬 채점 동작.

---

## Phase 4 — 자동 검증 (`scripts/e2e-lesson.mjs`)

`scripts/e2e-vocab.mjs`를 골격으로 신규 작성 (playwright + `check()` 러너, **CDN 차단 컨테이너용
`routeCdn()` 블록 :11-22 그대로 복사**, 대기시간 상수 동일). 시나리오:

1. 데스크탑 로드 → 학습 탭 클릭 → `Set 23` 텍스트 존재 (서버 콘텐츠 렌더)
2. `page.evaluate(() => fetch(JINA_API.base+'/api/lessons/1',{credentials:'include',headers:{'X-Requested-With':'jina'}}).then(r=>r.text()))`
   → 본문에 `"answer"`/`"correct"`/`"explanation"` 미포함 ★정답 비노출
3. 진도 배지 `1/2` (dev 시드 attempt 반영 — 파생값 집계 증명)
4. 문항 3개에 옵션 클릭(오답 1개 섞기: 1→B, 2→A, 3→B) → '채점하기' → `2 / 3 정답` 렌더
   + 2번 문항에 `move up` 포함 해설 렌더 (서버 채점 응답)
5. '지문' 탭 → '문제' 탭 재진입(모바일) 또는 리렌더 후 답 표시 유지 (스토어 생존)
6. '다음 지문' → `Set 24` 렌더 → 모바일 헤더/탭이 아니라 데스크탑 기준 subtitle 변화 확인
   → 3문항 정답 제출 → 해설에 `no later than` 포함 ★set24 고유 해설 = 해설 버그 해소
7. 새로고침 → 학습 탭 → 진도 `2/2` (attempt 서버 저장 증명)
8. 모바일 뷰포트(390×844) → 학습 탭 → 헤더 진도가 데스크탑과 동일 값 (Context/서버 단일 소스)
9. `canvas.html` → 학습 화면 렌더 + `window.JINA_API.post('/api/lessons/1/attempts',…)` 직접 호출이
   `READONLY` 코드 반환 (서버측 가드) + 화면 채점 버튼은 fallback 로컬 채점으로 동작
10. 콘솔 에러 0

실행: `npm run dev:all` 상태에서 `node scripts/e2e-lesson.mjs` → exit 0.
회귀: `node scripts/e2e-vocab.mjs`도 여전히 exit 0 (index.html script 추가가 단어장을 깨지 않음).

---

## 단계 요약 / 순서

1. **Phase 1** `0004_lessons.sql`(+down) → `0005_lessons_seed.sql`(+down) → `migrate.mjs`
   RESET_TABLES → `dev.mjs` attempt 시드 → migrate/seed/status/rollback 왕복 검증
2. **Phase 2** `lesson.service.js` → `lesson.routes.js` → `server.js` 등록 → curl 완료 판정 전부 통과
3. **Phase 3** `lesson-store.jsx` → `lesson.jsx` 수정(위 표 순서: mock 삭제는 시드 검증 후) →
   `main.jsx` → `index.html`/`canvas.html` → 브라우저 수동 판정
4. **Phase 4** `scripts/e2e-lesson.mjs` 작성·통과 + `e2e-vocab.mjs` 회귀 통과
5. 문서 갱신: `docs/HANDOFF.md` §2(lessons TEXT PK/UUID → 실구현), §3 Lessons API 응답 계약

## 완료 판정 (최종 체크리스트)

- [ ] `npm run db:status` — 0001~0005 applied, MODIFIED 없음 (0001~0003 무수정 증명)
- [ ] `\dt` 신규 3개 추가(총 20개), 기존 11개 무접촉
- [ ] `GET /api/lessons/:id` 응답 원문 grep에 `answer`/`correct`/`explanation` 0회
- [ ] 같은 `client_request_id` 재전송 → `replay:true`, attempt 행 증가 없음
- [ ] set24 채점 응답 해설이 set24 고유 텍스트 (해설 버그 해소)
- [ ] 진도 배지 = attempts 집계값, 새로고침/모바일/데스크탑 동일 (파생값 서버 단일 소스)
- [ ] `lesson.jsx`에 `LESSON_DATA` 문자열 잔존 0 (`grep -c LESSON_DATA src/screens/lesson.jsx` → 0)
- [ ] `canvas.html` 학습 화면 렌더 + 로컬 채점 (fallback), 서버 POST는 READONLY 403
- [ ] `node scripts/e2e-lesson.mjs` exit 0, `node scripts/e2e-vocab.mjs` 회귀 exit 0
