# 01 — AI 회화 탭 영속화 (conversation_sessions / conversation_messages / corrections)

> 이 문서는 `docs/PLAN-vocab-backend.md`(단어장 구현 완료본)의 구조와 규범을 따르는 **구현 계획서**입니다.
> 구현 에이전트는 이 문서만으로 작업을 완료하고, 마지막의 검증 절차를 통과시켜야 합니다.
> 단어장에서 확립된 4개 패턴 — ①마이그레이션 파일 규범 ②DTO+파생값 서버 단일 소스
> ③Context 스토어(캔버스 fallback) ④CLI 프록시+JSON 스키마 — 를 그대로 복제합니다.

## Context — 현황

AI 회화 탭은 **반쪽만 실기능**입니다. `useJinaChat`(src/runtime/chat-runtime.jsx:4-50)이
`POST /api/ai/chat`을 통해 실제 CLI LLM과 대화하고 첨삭/점수를 렌더하지만, **아무것도 저장되지 않습니다**:

- **세션 목록이 mock** — `CONVO_SESSIONS`(conversation-desktop.jsx:24-31)를 사이드바가 소비(:69).
  세션을 눌러도 `reset()`으로 메시지가 지워질 뿐(:482-486) 과거 대화는 어디에도 없음.
- **정적 데모 대화가 실대화 위에 붙박이** — desktop :528-551(JinaMessage/UserMessage 하드코딩,
  라이브 메시지는 :561-565에 그 뒤로 붙음), mobile :318-394(데모 버블 + 첨삭 카드).
- **ScenarioBar 전부 하드코딩** — conversation-desktop.jsx:101-146 ("TOEIC SPEAKING · Q11" 등).
- **FeedbackPane 전부 하드코딩** — conversation-desktop.jsx:356-462 (점수 83·↑6, 첨삭 3개,
  오늘의 단어 "competitive"). 마지막 assistant 메시지의 `corrections`/`scores` 실데이터가 이미
  프론트 메모리에 있는데도 버려짐. mobile 실시간 점수 바(:300-314)도 동일하게 83 하드코딩.
- **첨삭이 휘발** — tutor 응답의 `corrections` 배열은 채팅 버블에 한 번 그려지고 사라짐.
  "자주 틀리는 패턴"을 SRS로 복습시키려면(progress 탭, `docs/plan/04-progress.md`) 축적이 필요.
- **새로고침 = 전체 소실**, 기기 간 공유 불가.

이 작업의 목표: **회화 세션/메시지/첨삭을 PostgreSQL에 저장**하고, 사이드바·ScenarioBar·
FeedbackPane을 실데이터로 전환하며, 첨삭을 단어장과 같은 SRS 컬럼 세트로 축적합니다
(복습 **UI**는 04-progress 범위 — 여기서는 테이블 + 적재 + 조회 API까지).

### 저장 흐름 핵심 결정 — 서버가 askAI를 호출하고 두 메시지를 한 번에 저장

`POST /api/conversations/:id/messages` 가 서버에서 `askAI(task:'tutor')`를 호출한 뒤
user/assistant 메시지 + corrections 를 저장하고 **둘 다 반환**합니다. 프론트 회화 훅은 이
엔드포인트로 전환하고 `askJina` 직접 호출을 제거합니다(단, lesson.jsx와 캔버스 fallback은
기존 `/api/ai/chat` 경로 유지 — §프론트 참조). 근거:

- 프론트가 `/api/ai/chat` 후 별도 저장 요청을 보내는 2-call 설계는 탭 닫힘/실패 시 **부분 저장**
  (질문만 저장, 답 없음)을 만들고, 저장 API가 임의 content를 받는 위조 표면이 됨.
- 서버 단일 호출이면 히스토리도 DB가 단일 소스 — 클라이언트가 보낸 history를 믿지 않고
  서버가 최근 8턴을 직접 로드해 렌더(프롬프트 인젝션/조작 표면 축소).
- 트랜잭션 하나로 user+assistant+corrections 원자 저장. 실패하면 아무것도 안 남음(재전송 안전).

### SSE(스트리밍)는 v1 제외 — 근거

1. **provider 5종 중 4종이 원리적으로 스트림 불가**: claude/agy/codex/cursor는 one-shot CLI
   프로세스가 완결 JSON 봉투를 stdout으로 뱉는 구조(agy는 `structured_output` 필드, codex는
   NDJSON의 마지막 `item.completed`). 토큰 스트림 자체가 없어 프록시할 것이 없음.
2. 유일하게 가능한 ollama도 응답이 **JSON 스키마 강제 객체**라 중간 토큰은 미완성 JSON —
   `corrections` 배열이 반쯤 온 상태로는 아무것도 렌더할 수 없음. `reply_en`만 따로 스트리밍
   하려면 스키마 계약을 깨는 2-pass 호출이 필요.
3. 세마포어/취소 체계(ask.js의 AbortController + `res.on('close')` + 프로세스 트리 kill)가
   요청-응답 모델 전제로 설계됨. SSE는 슬롯 반환 시점과 봉투 계약(`{ok, data}`)을 전부 재설계해야 함.
4. 체감 대기는 이미 `meta.queuedMs` + 로딩 인디케이터로 처리 중.
   → **재검토 조건**: ollama가 기본 provider가 되고 평균 응답이 10s를 넘을 때, `reply_en` 전용
   별도 스트림 채널로 opt-in 설계. v1 봉투는 건드리지 않는다.

### 이 계획이 전제하는, 단어장 구현에서 실증된 함정

1. **PG 파라미터 타입 추론(42804)**: 같은 파라미터를 `::int` 캐스트와 텍스트 연결(`||`)에
   재사용 금지 — 간격 연산은 전부 `make_interval(days => $n::int)` / `make_interval(mins => $n::int)`.
2. **pg BIGINT/NUMERIC 문자열 문제**는 이미 `api/lib/pool.js:8-9`의 setTypeParser로 해결됨 — 재작업 금지.
3. **인증/CSRF/CORS/READONLY는 이미 있음** — `requireUser`(api/middleware/auth.js:34),
   CSRF 커스텀 헤더(api/server.js:34), 캔버스 non-GET 403(api/server.js:37-40, `/api/ai/chat`만 예외).
   **재구현 금지.** 신규 라우트는 `requireUser`만 호출하면 전부 적용된다.
4. **시드 타임스탬프는 now() 상대시각** — 고정값이면 며칠 뒤 시나리오 재현 불가.
5. **canvas.html은 main.jsx를 로드하지 않는다** — `ConversationProvider`는 index.html(main.jsx)에만.
   훅은 Provider 부재 시 메모리 fallback. **새 `<script>` 태그는 index.html/canvas.html 둘 다 갱신**
   (양쪽에 `KEEP IN SYNC` 주석 있음 — index.html:23, canvas.html:25).
6. **기존 DB 테이블 11개는 다른 앱 소유** — `sessions`/`messages` 같은 이름 금지.
   `conversation_sessions`/`conversation_messages`로 접두. `corrections`는 기존 11개
   (`session_corrections`는 있어도 `corrections`는 없음 — 실측 목록 확인)와 충돌하지 않아 그대로 사용.
7. **트랜잭션 안에서 CLI를 기다리지 않는다** — `pool.max=8`. AI 먼저, DB 나중
   (vocab.routes.js:36-57과 동일한 순서).
8. **`db/migrate.mjs`의 `RESET_TABLES`(:22-29) 갱신 필수** — 신규 테이블 3개를 FK 역순으로 목록
   맨 앞에 추가하지 않으면 `db:reset`이 신규 테이블을 남겨 재시드가 깨진다.

### HANDOFF.md와의 정합 (docs/HANDOFF.md §2/§3 참조하되 다음을 우선)

| HANDOFF안 | 이 계획 (실구현 정합) | 이유 |
|---|---|---|
| `sessions`/`messages` (UUID user_id) | `conversation_sessions`/`conversation_messages`, `user_id BIGINT → public.users(id)` | 0001_auth.sql의 users.id는 BIGSERIAL. 기존 앱 테이블과 이름 충돌 회피 |
| `sessions.message_count`, `avg_score` **저장** | **저장하지 않음** — 매 요청 서브쿼리 계산 | 패턴 ② 파생값 서버 단일 소스. 카운터 드리프트 원천 차단 |
| `corrections.ease_factor FLOAT` | `NUMERIC(4,2)` + CHECK — `user_vocab_cards`와 동일 세트 | `api/services/srs.js` 공식/제약 재사용 |
| `scenarios` 테이블 (id TEXT PK, system_prompt) | v1 미도입 — `conversation_sessions.scenario JSONB`(표시 메타만) | 시나리오 상점/프롬프트 주입은 02-lesson 이후. 첫 user 메시지가 주제를 모델에 전달하는 현행 UX로 충분 |
| `messages.corrections`를 user 행에 저장 | **assistant 행에 저장** | 프론트 계약(LiveJinaMessage가 assistant 버블에 첨삭 렌더, chat-runtime.jsx:254-274)을 그대로 유지 — 매퍼 한 줄로 끝. 단 `corrections` 테이블의 `message_id`는 **채점 대상인 user 메시지**를 가리킨다(의미 정확성) |
| `audio_url`, STT/TTS | 제외 | 음성은 시각 데모(프로토타입 유지) |

---

## Phase C1 — DB 마이그레이션 (`db/migrations/0004_conversation.sql`)

번호는 **0004** (0001_auth / 0002_vocab / 0003_vocab_words_seed 다음). `.down.sql` 동반.
규범: 멱등 DDL(`IF NOT EXISTS`), 모든 식별자 `public.` 명시, BOM 없는 UTF-8, 적용 후 수정 금지
(체크섬 강제 — 고칠 것은 0005로), 적용은 반드시 `npm run db:migrate`(psql -f 금지).

### `0004_conversation.sql`

```sql
CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL DEFAULT '새 회화',
  scenario        JSONB,                -- 표시 메타 {tag, level, title, description} — 프롬프트 주입 없음(v1)
  status          TEXT        NOT NULL DEFAULT 'active',
  provider_ref    TEXT,                 -- CLI resume ID 예약 컬럼 (v1 stateless — 미사용)
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,          -- 메시지 저장 트랜잭션이 갱신 (목록 정렬용 — 파생값 아님)
  ended_at        TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_sessions_status_ck   CHECK (status IN ('active','ended')),
  CONSTRAINT conversation_sessions_title_ck    CHECK (length(title) BETWEEN 1 AND 80),
  CONSTRAINT conversation_sessions_scenario_ck CHECK (scenario IS NULL OR jsonb_typeof(scenario) = 'object'),
  CONSTRAINT conversation_sessions_ended_ck    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS conversation_sessions_user_recent_idx
  ON public.conversation_sessions (user_id, COALESCE(last_message_at, started_at) DESC);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id                BIGSERIAL   PRIMARY KEY,
  session_id        BIGINT      NOT NULL REFERENCES public.conversation_sessions(id) ON DELETE CASCADE,
  user_id           BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  -- 소유권 필터 중복 보관
  role              TEXT        NOT NULL,
  content           TEXT        NOT NULL,      -- user: 입력 원문 / assistant: reply_en
  content_ko        TEXT,                      -- assistant 전용: reply_ko
  corrections       JSONB,                     -- assistant 전용: [{original, corrected, reason, type}] (직전 user 발화 채점)
  scores            JSONB,                     -- assistant 전용: {grammar, fluency, vocabulary}
  suggestion        TEXT,                      -- assistant 전용
  degraded          BOOLEAN     NOT NULL DEFAULT false,   -- 스키마 위반 강등 응답 표식
  provider          TEXT,                      -- 'claude'|'agy'|'codex'|'cursor'|'ollama'
  model             TEXT,
  latency_ms        INT,
  client_request_id UUID,                      -- 멱등키 (user 행에만 세팅)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_role_ck    CHECK (role IN ('user','assistant')),
  CONSTRAINT conversation_messages_len_ck     CHECK (length(content) BETWEEN 1 AND 8000),
  CONSTRAINT conversation_messages_corr_ck    CHECK (corrections IS NULL OR jsonb_typeof(corrections) = 'array'),
  CONSTRAINT conversation_messages_scores_ck  CHECK (scores IS NULL OR jsonb_typeof(scores) = 'object')
);
CREATE INDEX IF NOT EXISTS conversation_messages_session_idx
  ON public.conversation_messages (session_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_reqid_uq
  ON public.conversation_messages (client_request_id) WHERE client_request_id IS NOT NULL;

-- 누적 첨삭 — SRS 컬럼 세트는 user_vocab_cards(0002_vocab.sql:24-45)와 동일. srs.js 재사용 전제.
CREATE TABLE IF NOT EXISTS public.corrections (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          BIGINT       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id       BIGINT       REFERENCES public.conversation_sessions(id) ON DELETE SET NULL,
  message_id       BIGINT       REFERENCES public.conversation_messages(id) ON DELETE SET NULL,  -- 채점 대상 user 메시지
  original         TEXT         NOT NULL,
  corrected        TEXT         NOT NULL,
  reason           TEXT,
  type             TEXT         NOT NULL,
  dedup_key        TEXT         GENERATED ALWAYS AS (lower(btrim(original)) || ' → ' || lower(btrim(corrected))) STORED,
  seen_count       INT          NOT NULL DEFAULT 1,      -- 같은 실수 재발 횟수
  -- ── SRS 컬럼 세트 (user_vocab_cards와 1:1) ──
  next_review      TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- 신규 첨삭은 즉시 due
  interval_days    INT          NOT NULL DEFAULT 1,
  ease_factor      NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  review_count     INT          NOT NULL DEFAULT 0,
  fail_count       INT          NOT NULL DEFAULT 0,
  last_result      TEXT,
  last_reviewed_at TIMESTAMPTZ,
  suspended        BOOLEAN      NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT corrections_type_ck        CHECK (type IN ('grammar','usage','spelling')),
  CONSTRAINT corrections_len_ck         CHECK (length(original) BETWEEN 1 AND 500 AND length(corrected) BETWEEN 1 AND 500),
  CONSTRAINT corrections_interval_ck    CHECK (interval_days BETWEEN 0 AND 3650),
  CONSTRAINT corrections_ef_ck          CHECK (ease_factor BETWEEN 1.30 AND 3.00),
  CONSTRAINT corrections_counts_ck      CHECK (review_count >= 0 AND fail_count >= 0 AND fail_count <= review_count),
  CONSTRAINT corrections_last_result_ck CHECK (last_result IS NULL OR last_result IN ('again','hard','good','easy')),
  CONSTRAINT corrections_seen_ck        CHECK (seen_count >= 1),
  CONSTRAINT corrections_user_dedup_uq  UNIQUE (user_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS corrections_due_idx
  ON public.corrections (user_id, next_review) WHERE suspended = false;
CREATE INDEX IF NOT EXISTS corrections_user_created_idx
  ON public.corrections (user_id, created_at DESC);
```

설계 노트:
- **`dedup_key` + `seen_count`**: 튜터가 같은 실수를 다시 지적하면 새 행 대신
  `ON CONFLICT (user_id, dedup_key) DO UPDATE` 로 `seen_count+1` + `next_review = LEAST(next_review, now())`
  (재발 = 즉시 복습 대상으로 승격). "자주 틀리는 패턴" 집계가 `ORDER BY seen_count DESC` 한 줄이 됨.
- **`message_count`/`avg_score`를 저장하지 않는 이유** — 단어장 버그 1(저장된 status가 시간이 지나도
  안 변함)과 동형의 드리프트를 원천 차단. 목록 쿼리 서브쿼리로 매 요청 계산(아래 SESSION_SELECT).
- **첨삭 복습 로그 테이블(`correction_reviews`)은 이번에 만들지 않음** — 복습 UI가 04-progress 범위.
  적용된 파일 수정 금지 규범 때문에 그때 **0005**로 추가한다(0004에 선반영 금지 — YAGNI + down 단순화).

### `0004_conversation.down.sql`

```sql
DROP TABLE IF EXISTS public.corrections;
DROP TABLE IF EXISTS public.conversation_messages;
DROP TABLE IF EXISTS public.conversation_sessions;
```

### `db/migrate.mjs` 갱신 (코드 1곳)

`RESET_TABLES`(db/migrate.mjs:22-29) 맨 앞에 FK 역순으로 추가:

```js
const RESET_TABLES = [
  'corrections',
  'conversation_messages',
  'conversation_sessions',
  'vocab_reviews',
  // …기존 그대로
];
```

`FOREIGN_TABLES` self-assert(:36-39)가 그대로 통과하는지 확인 (`session_corrections`≠`corrections`).

### 시드 — `db/seeds/dev.mjs` 확장 (시드는 체크섬 대상 아님, 수정 가능)

기존 단어장 시드 뒤에 회화 시드 블록 추가. **전부 now() 상대시각**:

- 세션 2개 (dev 유저 소유, `ON CONFLICT` 불가 — 자연키가 없으므로 **제목으로 SELECT 후 없을 때만 INSERT** 방식으로 재실행 안전하게):
  1. `비즈니스 미팅` — active, scenario `{tag:'TOEIC SPEAKING · Q11', level:'★★★☆☆', title:'비즈니스 미팅 · 신규 거래처 추천', description:'상사가 사무용품 신규 거래처를 추천해달라고 요청했어요…'}`,
     `started_at = now() - interval '2 hours'`, 메시지 4개(아래), `last_message_at = now() - interval '5 minutes'`
  2. `카페에서 주문하기` — ended, `started_at = now() - interval '1 day' - interval '1 hour'`,
     `ended_at = now() - interval '1 day'`, 메시지 2개, `last_message_at = ended_at`
- 세션 1의 메시지 4개 (id 순서 = 대화 순서):
  user("Hi Mark, I think we should to go with OfficeMart …", client_request_id 고정 UUID) →
  assistant(reply_en/reply_ko, corrections 2개: `should to go with→should go with`(grammar),
  `have good prices→offer competitive pricing`(usage), scores `{grammar:74,fluency:88,vocabulary:81}`,
  suggestion, provider 'claude') → user → assistant(scores `{grammar:80,fluency:90,vocabulary:83}`).
  점수를 다르게 두 번 넣는 이유: FeedbackPane의 "↑ 델타" 계산 검증.
- corrections 3행: 위 2개 + `I go to school yesterday→I went to school yesterday`(grammar, seen_count 2).
  분배 — due 2(`next_review = now() - interval '1 hour'` / `now()`) + 미래 1
  (`date_trunc('day', now() AT TIME ZONE $tz) + make_interval(days => 3)` — **`($n || ' days')::interval`에
  같은 파라미터 재사용 금지, 42804**). 04-progress의 복습 큐 검증 데이터가 된다.

**완료 판정**: `npm run db:migrate && npm run db:seed` 후
`node -e` 원라이너(pg)로 `\dt` 상당 조회 → 테이블 20개(기존 11 + 단어장 세션 6 + 신규 3).
`SELECT title, status FROM conversation_sessions` 2행,
`SELECT count(*) FROM corrections WHERE next_review <= now() AND NOT suspended` = 2.
`npm run db:rollback` → 3개 테이블 소멸 → 재`migrate`로 복구까지 확인.

---

## Phase C2 — API (`api/services/conversation.service.js` + `api/routes/conversation.routes.js`)

### 엔드포인트

```
GET    /api/conversations                     → {ok, sessions:[SessionDto]}
POST   /api/conversations                     {title?, scenario?}            → {ok, session}         (201)
GET    /api/conversations/:session_id         → {ok, session, messages:[MessageDto]}
POST   /api/conversations/:session_id/messages
       {text, client_request_id?, provider?, model?, ollamaUrl?}
       → {ok, provider, degraded?, replay?, session, user_message, assistant_message,
          corrections_saved, meta:{queuedMs, durationMs}}
PATCH  /api/conversations/:session_id         {title?, ended?}               → {ok, session}
DELETE /api/conversations/:session_id         → 204                          (CASCADE — corrections는 SET NULL 생존)
GET    /api/corrections?due=1&limit=50        → {ok, corrections:[CorrectionDto], stats:{due,total}}
```

모든 라우트 첫 줄은 `const { user } = await requireUser(req, res);` — 인증/CSRF/CORS/캔버스
READONLY는 기존 미들웨어가 처리하므로 **아무것도 추가 구현하지 않는다**. `api/server.js:16-20`에
`registerConversationRoutes(router)` 등록 한 줄 추가.

### SESSION_SELECT — 파생값(message_count/avg_score/미리보기)은 저장하지 않고 매 요청 계산

vocab.service.js의 `CARD_SELECT`(:12-28) 패턴 복제:

```js
const SESSION_SELECT = `
  SELECT s.id, s.title, s.scenario, s.status, s.started_at, s.ended_at, s.last_message_at,
         (SELECT count(*)::int FROM public.conversation_messages m
           WHERE m.session_id = s.id)                                          AS message_count,
         (SELECT round(avg(v.value::numeric))::int
            FROM public.conversation_messages m2,
                 LATERAL jsonb_each_text(m2.scores) v
           WHERE m2.session_id = s.id AND m2.scores IS NOT NULL)               AS avg_score,
         (SELECT m3.content FROM public.conversation_messages m3
           WHERE m3.session_id = s.id AND m3.role = 'user'
           ORDER BY m3.id DESC LIMIT 1)                                        AS last_user_text
    FROM public.conversation_sessions s
   WHERE s.user_id = $1`;
```

목록: `${SESSION_SELECT} ORDER BY COALESCE(s.last_message_at, s.started_at) DESC LIMIT 50`.
단건: `SELECT * FROM (${SESSION_SELECT}) t WHERE t.id = $2` (별칭은 같은 레벨 WHERE 불가 — 서브쿼리 랩).

### DTO 예시

`SessionDto` (사이드바가 mock `CONVO_SESSIONS`의 {title, sub, time, count}를 이것으로 대체):
```json
{ "id": 7, "title": "비즈니스 미팅", "status": "active",
  "scenario": { "tag": "TOEIC SPEAKING · Q11", "level": "★★★☆☆",
                "title": "비즈니스 미팅 · 신규 거래처 추천", "description": "상사가 …" },
  "started_at": "2026-08-19T07:12:00.000Z", "ended_at": null,
  "last_message_at": "2026-08-19T09:07:00.000Z",
  "message_count": 4, "avg_score": 83,
  "last_user_text": "Hi Mark, I think we should go with OfficeMart …" }
```
**표시 문자열은 서버가 만들지 않는다** — `time`("지금"/"어제"/"5/24")과 `sub`는 클라이언트
스토어의 단일 포맷터(`formatSessionTime`, vocab-store의 `formatNextReview`:12-17와 동형)가 생성.

`MessageDto`:
```json
{ "id": 102, "role": "assistant",
  "content": "Nice try! Let's polish that sentence a bit.",
  "content_ko": "좋은 시도예요! 문장을 조금 다듬어 볼게요.",
  "corrections": [ { "original": "should to go with", "corrected": "should go with",
                     "reason": "should 뒤에는 to 없이 동사원형이 와요.", "type": "grammar" } ],
  "scores": { "grammar": 74, "fluency": 88, "vocabulary": 81 },
  "suggestion": "근거를 한 가지 더 추가해보세요.",
  "degraded": false, "provider": "claude", "model": null,
  "created_at": "2026-08-19T09:07:00.000Z" }
```

`CorrectionDto` (status는 CASE 파생 — 저장 금지, vocab과 동일 규칙):
```json
{ "id": 3, "original": "I go to school yesterday", "corrected": "I went to school yesterday",
  "reason": "과거 시제", "type": "grammar", "seen_count": 2,
  "status": "due", "next_review_at": "2026-08-19T08:00:00.000Z", "next_review_in_days": 0,
  "interval_days": 1, "ease_factor": 2.50, "review_count": 0, "fail_count": 0,
  "session_id": 7, "created_at": "…", "preview": { "again": {"label":"10분", "...": "…"}, "hard": {}, "good": {}, "easy": {} } }
```
`preview`는 `predict(row)`(api/services/srs.js:43-55) 그대로 재사용 — corrections 행이
user_vocab_cards와 같은 컬럼명을 갖는 이유가 이것. status CASE도 vocab.service.js:17-20 복제.

### `POST /api/conversations/:session_id/messages` — 서버 저장 흐름 (이 엔드포인트가 이 계획의 심장)

vocab의 add(:31-59 "AI 먼저, DB 나중") + review(:97-149 멱등 트랜잭션) 패턴 결합:

```
1. requireUser → posInt(session_id) → body 검증:
   text = str(body.text, 'text', {min:1, max:2000})           // LIMITS.userMessage와 일치
   clientRequestId = str(…, {optional:true, pattern:UUID_RE})
2. 멱등 replay (트랜잭션 밖 SELECT):
   client_request_id 가 conversation_messages에 이미 있으면 → 그 user 행 + 바로 다음 assistant 행
   (WHERE session_id=… AND id>… AND role='assistant' ORDER BY id LIMIT 1)을 DTO로 {replay:true} 응답.
3. 세션 로드 + 소유권: SELECT id, title, status FROM conversation_sessions
   WHERE id=$1 AND user_id=$2 → 없으면 404 NOT_FOUND. status='ended'면 409 SESSION_ENDED
   (한국어 hint: "종료된 세션입니다. 새 회화를 시작하세요.").
4. 히스토리 로드 (DB가 단일 소스 — 클라이언트 history는 받지도 않는다):
   SELECT role, content FROM conversation_messages WHERE session_id=$1
   ORDER BY id DESC LIMIT 16 → reverse. askAI가 LIMITS(8턴/6000자)로 다시 절단하므로 넉넉히.
5. AI 호출 (★트랜잭션 밖★):
   const abort = new AbortController();
   res.on('close', () => { if (!res.writableEnded) abort.abort(); });   // ai.routes.js:16-17와 동일
   const ai = await askAI({ task:'tutor', providerId: body.provider || defaultProviderId(),
     model, history, userMessage: text, ollamaUrl(ollama일 때만), signal: abort.signal });
   실패(503/504/502)는 그대로 위로 — 아무것도 저장되지 않음. 프론트가 hint 에러 버블 렌더 후
   재전송하면 같은 client_request_id로 replay 없이 새 시도가 된다(저장된 게 없으므로 안전).
   degraded 응답(ai.degraded===true, ask.js:95-107)은 저장은 하되 corrections 적재(7)를 건너뜀.
6. withTx — 원자 저장:
   a. INSERT user 행 (role='user', content=text, client_request_id)
      → UNIQUE 위반(23505, conversation_messages_reqid_uq)이면 동시 중복 전송 경합 —
        catch 후 2번 replay 경로로 응답 (이 분기를 빼먹으면 "더블클릭할 때만 500").
   b. INSERT assistant 행 (content=ai.data.reply_en, content_ko=ai.data.reply_ko,
      corrections=JSON.stringify(ai.data.corrections)::jsonb, scores, suggestion,
      degraded=!!ai.degraded, provider=ai.provider, model=ai.meta?.model, latency_ms=ai.meta?.durationMs)
   c. corrections 적재 (degraded가 아니고 배열 비어있지 않을 때, 각 항목 원문/교정문 500자 절단):
      INSERT INTO public.corrections (user_id, session_id, message_id, original, corrected, reason, type)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id, dedup_key) DO UPDATE
        SET seen_count  = public.corrections.seen_count + 1,
            next_review = LEAST(public.corrections.next_review, now()),  -- 재발 = 즉시 due 승격
            message_id  = EXCLUDED.message_id, session_id = EXCLUDED.session_id,
            reason      = COALESCE(EXCLUDED.reason, public.corrections.reason),
            updated_at  = now()
      ※ message_id = (a)의 user 행 id — 채점 대상 발화.
   d. UPDATE conversation_sessions SET last_message_at = now(), updated_at = now(),
        title = CASE WHEN title = '새 회화' THEN left($3, 40) ELSE title END   -- 첫 메시지로 자동 제목
      WHERE id=$1 AND user_id=$2
7. 응답: {ok:true, provider, degraded?, session(SESSION_SELECT 재조회 DTO),
   user_message, assistant_message, corrections_saved:n, meta:{queuedMs, durationMs}}
```

기타 라우트는 얇다: `POST /api/conversations`는 INSERT 후 DTO(빈 세션이라 message_count 0);
`PATCH`는 title(str max 80)/`ended:true → status='ended', ended_at=now()`;
`DELETE`는 `WHERE id AND user_id` rowCount 0이면 404;
`GET /api/corrections`는 `due=1`이면 `suspended=false AND next_review<=now()` 필터
+ `stats {due, total}` (fetchStats 패턴, vocab.service.js:58-68).

**완료 판정 (curl — DEV_AUTOLOGIN이 첫 GET에서 쿠키를 심어준다)**

```bash
API=http://localhost:3004
# 0) 쿠키 확보
curl -s -c /tmp/jina-cookies.txt $API/api/auth/me -H 'X-Requested-With: jina' | jq .user.email
# 1) 세션 목록 — 시드 2개, 파생값 확인
curl -s -b /tmp/jina-cookies.txt $API/api/conversations -H 'X-Requested-With: jina' \
  | jq '.sessions[] | {title, message_count, avg_score, last_user_text}'
#    → "비즈니스 미팅" message_count=4, avg_score=83±1 / "카페에서 주문하기" 2
# 2) 새 세션
SID=$(curl -s -X POST $API/api/conversations -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/jina-cookies.txt -d '{}' | jq .session.id)
# 3) 메시지 전송 (CLI 5~15s) — 두 메시지 + 첨삭 저장 확인
REQ=$(node -e 'console.log(crypto.randomUUID())')
curl -s -X POST $API/api/conversations/$SID/messages -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/jina-cookies.txt \
  -d "{\"text\":\"I go to school yesterday.\",\"client_request_id\":\"$REQ\"}" \
  | jq '{deg:.degraded, u:.user_message.content, a:.assistant_message.content,
         corr:(.assistant_message.corrections|length), saved:.corrections_saved, title:.session.title}'
#    → corrections ≥ 1, session.title == "I go to school yesterday." (자동 제목)
# 4) 멱등 — 같은 REQ 재전송 → replay:true, message_count 불변
curl -s -X POST $API/api/conversations/$SID/messages -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/jina-cookies.txt \
  -d "{\"text\":\"I go to school yesterday.\",\"client_request_id\":\"$REQ\"}" | jq '.replay, .session.message_count'
# 5) 히스토리 재조회
curl -s -b /tmp/jina-cookies.txt $API/api/conversations/$SID -H 'X-Requested-With: jina' \
  | jq '.messages | length'   # → 2
# 6) 첨삭 큐 — 시드 due 2 + 방금 적재분 (I go… 재발이면 seen_count 3 승격 확인)
curl -s -b /tmp/jina-cookies.txt "$API/api/corrections?due=1" -H 'X-Requested-With: jina' \
  | jq '.stats, (.corrections[] | {original, seen_count, status, label: .preview.again.label})'
# 7) 종료 세션에 전송 → 409 SESSION_ENDED (hint 포함)
# 8) EXPLAIN: 목록 쿼리가 conversation_sessions_user_recent_idx 를 타는지 확인
```

---

## Phase C3 — 프론트 스토어 (`src/shared/conversation-store.jsx`)

vocab-store.jsx(패턴 ③)를 복제한 **신규 파일 1개**. `window.ConversationProvider` / `window.useConversation`.

### 반환 계약 — useJinaChat의 {messages, loading, error, send, reset}을 **상위집합으로 유지**

`useJinaChat` 계약은 4곳에서 소비된다(conversation-desktop.jsx:465, mobile.jsx:260,
lesson.jsx:454·:669). **lesson.jsx 2곳은 건드리지 않는다** — 무세션 1회성 채팅이므로 기존
`useJinaChat`(→`/api/ai/chat`)이 정확한 도구다. 회화 2곳만 `useConversation`으로 전환:

```js
useConversation() → {
  // useJinaChat 호환 부분 (chat-runtime의 LiveJinaMessage/LiveUserMessage/JinaInputBar 무수정 소비)
  messages, loading, error, send(text), reset(),
  // 세션 확장
  sessions, activeSessionId, sessionsLoading,
  selectSession(id),      // GET /api/conversations/:id → 메시지를 chat 메시지 모양으로 매핑해 로드
  newSession(),           // activeSessionId=null + messages=[] (레코드는 첫 send에서 생성 — 빈 세션 행 방지)
  activeSession,          // sessions.find(활성) — ScenarioBar/헤더가 소비
  lastScored,             // 마지막 scores 보유 assistant 메시지 {scores, corrections, delta} — FeedbackPane 소비
  formatSessionTime,      // ISO → '지금'|'N분 전'|'어제'|'M/D' (표시 포맷터는 이 하나뿐 — 드리프트 차단)
}
```

핵심 구현 규칙:
- **메시지 매퍼 단일화**: 서버 `MessageDto` → chat-runtime 메시지 모양
  (`{role, kind:'jina-ai'|'user-text', content, reply_en:content, reply_ko:content_ko, corrections,
  scores, suggestion, provider, time: hhmm(created_at)}`) 변환 함수 `toChatMessage(dto)` 하나만 둔다.
  chat-runtime.jsx:36-46이 만드는 모양과 필드명이 일치해야 LiveJinaMessage가 무수정 렌더.
- **send(text)**: 낙관적으로 user 버블 즉시 append(useJinaChat:17-18과 동일 UX) → activeSessionId가
  null이면 먼저 `POST /api/conversations`로 세션 생성 → `POST /api/conversations/:id/messages`
  (`client_request_id: crypto.randomUUID()`, `window.JINA_API.post` — CSRF/credentials 자동) →
  성공 시 assistant_message를 매핑 append + sessions 목록 갱신(응답의 session으로 교체) →
  실패 시 `{kind:'jina-error', content:res.error, hint:res.hint}` append (useJinaChat:27-34와 동일 —
  **hint는 서버가 준 것만 렌더, 프론트 provider 분기 0**). user 버블은 롤백하지 않는다(재전송 유도).
  provider/model은 `window.__JINA_AI_CONFIG`에서 읽어 body에 동봉(ai.routes.js와 동일 규약).
- **AI 응답은 비낙관적**(CLI 5~15s — vocab addWord와 동일 판단): loading 동안 기존 타이핑
  인디케이터(conversation-desktop.jsx:567-583) 사용, 취소는 v1 미지원(입력바가 loading 중 잠김).
- **로드 실패 폴백**: 세션 목록 `localStorage['jina_convo_cache_v1']` write-through + 에러 배너
  (vocab-store:44-52와 동일 — 빈 화면 금지). 메시지는 캐시하지 않음(용량/신선도 대비 이득 없음).
- **캔버스 fallback** (Provider 부재 시 — 훅 규칙상 fallback 훅을 항상 호출, vocab-store:189-193):
  sessions = 현행 `CONVO_SESSIONS` 모양의 데모 2개(메모리), messages = [],
  **send는 `window.JINA_AI.askJina` 직접 호출** — `/api/ai/chat`은 부수효과가 없어 캔버스에서도
  허용(api-client.jsx:14, api/server.js:38)되므로 라이브 채팅 데모가 그대로 산다. 저장 없음.
  `askJina`는 이 fallback과 lesson.jsx가 쓰므로 **ai-provider.jsx에서 제거하지 않는다** —
  "askJina 직접 호출 제거"는 회화 화면 경로에 한정된다.

### script 태그 — **index.html / canvas.html 둘 다** (함정 5)

`api-client.jsx` 뒤·`conversation-desktop.jsx` 앞이면 어디든 되지만, vocab-store 바로 다음으로 통일:

- index.html:29 `vocab-store.jsx` 다음 줄에 `<script type="text/babel" src="src/shared/conversation-store.jsx"></script>`
- canvas.html:31 동일 위치에 동일 태그
- 양쪽 `KEEP IN SYNC` 주석(index.html:23, canvas.html:25)에 `conversation-store는 conversation-desktop 앞` 문구 추가

### main.jsx — Provider 중첩

main.jsx:354-356의 `<VocabProvider>{renderPage()}</VocabProvider>` 를
`<VocabProvider><ConversationProvider>{renderPage()}</ConversationProvider></VocabProvider>` 로.
(FeedbackPane이 useVocab도 쓰므로 Vocab이 바깥이어야 한다는 제약은 없지만 이 순서로 고정.)

---

## Phase C4 — 화면 컷오버 (수정 지점 파일:라인 — 2026-08-19 실측 기준)

### `src/screens/conversation-desktop.jsx`

| 위치 | 수정 |
|---|---|
| :24-31 `CONVO_SESSIONS` | **삭제**. ConvoSidebar가 `sessions` prop 소비 |
| :34-98 `ConvoSidebar` | props `{sessions, activeId, onSessionChange, onNewSession, formatTime}` 로. :69 `CONVO_SESSIONS.filter((s)=>!s.isNew)` → `sessions`, :86 `{s.time}` → `{formatTime(s.last_message_at \|\| s.started_at)}`, :88 `{s.sub}` → `{s.last_user_text \|\| (s.scenario?.title ?? '')}`, :90 `{s.count}턴` → `{s.message_count}턴`. `sessionsLoading` 시 스켈레톤 3줄 |
| :101-146 `ScenarioBar` | prop `session` 추가. :118 태그 → `session?.scenario?.tag`, :119 난이도 → `session?.scenario?.level`, :121-123 제목 → `session?.scenario?.title ?? session?.title ?? '자유 회화'`, :124-126 설명 → `session?.scenario?.description ?? 'Jina에게 어떤 주제로 연습할지 말해보세요.'`. scenario 없으면 태그/난이도 배지 숨김 |
| :149-204 `JinaMessage`, :207-286 `UserMessage` | 정적 데모 전용 컴포넌트 — **삭제** (라이브는 LiveJinaMessage/LiveUserMessage가 담당) |
| :289-353 `MicBar` | 미사용 정적 데모 — 삭제 (JinaInputBar의 mic 모드가 대체) |
| :356-462 `FeedbackPane` | props `{lastScored, dueCard, onAddWord}` 로 재작성. :379 `83` → `lastScored ? Math.round(평균(lastScored.scores)) : '—'`, :381 `↑ 6` → `lastScored?.delta` (직전 scored 메시지와의 평균 차 — 클라 계산, 없으면 숨김), :383-385 코멘트 → `lastScored?.suggestion ?? '메시지를 보내면 실시간 평가가 시작돼요.'`. :391-440 첨삭 3개 하드코딩 → `lastScored?.corrections.map(...)` (번호 배지 = index+1, type별 색: grammar=error/usage·spelling=warning, 항목 구조는 기존 마크업 재사용). corrections 없으면 "아직 첨삭이 없어요" 빈 상태. :443-459 오늘의 단어 → `useVocab()`의 `cards.find(c=>c.status==='due')` 렌더(word/ipa/meaning_ko/examples[0]) — **VocabProvider가 이미 페이지 전체를 감싸므로(main.jsx:354) 공짜**; due 없으면 블록 숨김 |
| :464-486 `ConversationDesktop` | `useJinaChat([])`(:465) → `const {messages, loading, send, reset, sessions, activeSessionId, selectSession, newSession, activeSession, lastScored, formatSessionTime} = useConversation();`. `isNewSession` state(:467) 삭제 — "새 회화 빈 상태"는 `activeSessionId===null && messages.length===0` 파생. :476-486 핸들러 → `newSession` / `selectSession` |
| :503-551 데모 ternary | **재구성**: `messages.length===0`이면 빈 상태(:504-526 유지 — 칩 클릭 `send(t)` 그대로), 아니면 messages.map. :528-551 정적 Fragment(데모 배너·JinaMessage×2·UserMessage) **삭제**, :553-559 "↓ 실제 AI 대화 시작" 구분선 **삭제** |
| :561-565 messages.map | 유지 (key는 `m.id ?? i`로 보강) |
| :585-592 JinaInputBar | 유지 — onSend={send} 그대로 |
| :594 FeedbackPane | `<FeedbackPane theme={theme} lastScored={lastScored} />` |

### `src/screens/mobile.jsx` — `MobileConversation`(:259-433)

| 위치 | 수정 |
|---|---|
| :260 | `useJinaChat([])` → `useConversation()` (messages/loading/send + lastScored/activeSession) |
| :290-292 헤더 부제 | `TOEIC Speaking Q11 · 비즈니스 미팅` → `activeSession?.title ?? '새 회화'` |
| :299-314 실시간 점수 바 | `83`(:308)·`83%`(:311)·`↑ 6`(:313) → `lastScored` 평균/델타. `lastScored` 없으면 바 전체 숨김 |
| :318-394 정적 데모 3블록 | **삭제** (Jina 버블 :318-333, user 첨삭 버블 :335-371, 첨삭 카드 :373-394). messages.length===0이면 desktop과 같은 톤의 간단 빈 상태 문구 |
| :396-400 "↓ 실제 AI 응답" 배너 | 삭제 |
| :401-405 messages.map | 유지 |
| :423-430 JinaInputBar | 유지 |

※ 모바일은 세션 사이드바가 없다 — v1은 **가장 최근 active 세션 자동 선택**(스토어 초기 로드 시
sessions[0]이 active면 selectSession). 세션 전환 UI는 후속.

### `src/runtime/chat-runtime.jsx`

**무수정이 목표.** `useJinaChat`(:4-50)은 lesson.jsx용으로 그대로 두고, LiveJinaMessage/
LiveUserMessage/JinaInputBar(:58-313)는 매퍼가 만드는 메시지 모양이 기존과 동일하므로 그대로 소비.
(유일한 허용 수정: `nowHHMM`(:52-55)을 `window.jinaHHMM = (date?) => …`로 노출해 스토어 매퍼가
재사용 — 중복 구현 금지.)

### 검증할 브라우저 시나리오 (→ Phase C5의 e2e로 자동화)

`localhost:3003` → AI 회화 탭 → 사이드바에 시드 세션 2개("비즈니스 미팅" 4턴 / "카페에서 주문하기")
→ "비즈니스 미팅" 클릭 → 저장된 4개 메시지 + assistant 버블에 첨삭 렌더 → FeedbackPane 점수
83±1·첨삭 2개·오늘의 단어(=vocab due 카드) → 새 회화 시작 → "I go to school yesterday." 전송 →
첨삭 포함 응답 + 사이드바에 자동 제목 새 세션 등장 → **새로고침** → 같은 세션·같은 메시지 잔존
(서버 저장 증명) → 창 <768px 모바일 회화 = 같은 세션 이어짐(Context 승격 증명) → API 프로세스 kill
→ 전송 → hint 담긴 에러 버블, 앱 무중단 → canvas.html 회화 = 라이브 채팅은 되지만 저장 안 됨
(READONLY — 새로고침 시 소실이 정상).

---

## Phase C5 — 검증 자동화 (`scripts/e2e-conversation.mjs`)

`scripts/e2e-vocab.mjs`를 본떠 작성 (동일한 vendor CDN 라우팅 헬퍼 `routeCdn` 재사용 — 이
컨테이너는 unpkg 차단, e2e-vocab.mjs:11-22 참조. Babel 컴파일 대기 ~9s 패턴도 동일).

체크 목록 (check(name, ok) 형식, 실패 1개면 exit 1):

```
 1. 데스크탑 렌더 → AI 회화 탭 클릭
 2. 사이드바 시드 세션 2개 표시 ('비즈니스 미팅' hasText)
 3. '비즈니스 미팅' 클릭 → 저장된 메시지 로드 (본문에 'OfficeMart' + '첨삭' 존재)
 4. FeedbackPane 실데이터 (점수 텍스트가 '83' 아닌 서버 파생값과 일치 — /100 옆 숫자 존재,
    '오늘의 단어' 블록에 vocab due 단어 표시)
 5. 새 회화 시작 → textarea에 'I go to school yesterday.' 입력 → Enter
    → waitForSelector('text=첨삭', 90s) → 첨삭 렌더
 6. 사이드바에 자동 제목 세션('I go to school…') 등장
 7. page.reload() → 회화 탭 → 방금 세션 클릭 → 메시지 잔존 (서버 저장 증명)
 8. 모바일 뷰포트(390×844) 새 페이지 → 회화 탭 → 같은 최근 세션 메시지 표시 (Context 증명)
 9. 캔버스: canvas.html 렌더 + window.JINA_API.post('/api/conversations', {}) → code==='READONLY'
    (클라 가드) — 그리고 라이브 chat 데모( /api/ai/chat )는 여전히 허용되는지 fetch로 확인
10. 멱등/에러는 API 레벨에서 검증됨(Phase C2 curl) — 브라우저에서는 콘솔 에러 0만 확인
```

**최종 완료 판정 체크리스트**

- [ ] `npm run db:migrate` idempotent (2회 실행 무해), `db:status` 0004 applied, `db:rollback`→재적용 왕복
- [ ] `db:reset -- --yes` 가 신규 3테이블 포함 전부 드롭 (RESET_TABLES 갱신 증명)
- [ ] Phase C2 curl 8종 전부 기대값 (특히 replay:true 멱등, 409 SESSION_ENDED, seen_count 승격)
- [ ] `node scripts/e2e-conversation.mjs` 전체 통과
- [ ] `node scripts/e2e-vocab.mjs` **회귀 통과** (Provider 중첩·script 태그 추가가 단어장을 깨지 않음)
- [ ] 요청 중 탭 닫기 → 2초 내 CLI 프로세스 소멸 (res.on('close') abort 전파 — ps로 확인)
- [ ] `GET /api/conversations` 응답의 avg_score/message_count가 **number 타입** (BIGINT 파서 확인)

---

## 수정/생성 파일 요약

**신규**
- `db/migrations/0004_conversation.sql` / `0004_conversation.down.sql`
- `api/services/conversation.service.js`, `api/routes/conversation.routes.js`
- `src/shared/conversation-store.jsx`
- `scripts/e2e-conversation.mjs`

**수정**
- `db/migrate.mjs` — RESET_TABLES에 3개 추가 (:22)
- `db/seeds/dev.mjs` — 회화 세션 2 + 메시지 6 + corrections 3 (now() 상대시각)
- `api/server.js` — `registerConversationRoutes` 등록 (:16-20)
- `src/screens/conversation-desktop.jsx` — 위 표 (mock/데모/하드코딩 삭제 + 스토어 연결)
- `src/screens/mobile.jsx` — MobileConversation만 (:259-433)
- `src/main.jsx` — ConversationProvider 중첩 (:354-356)
- `index.html` / `canvas.html` — conversation-store script 태그 + KEEP IN SYNC 주석
- `db/README.md` — 후속과제 GRANT 목록에 신규 3테이블 추가 (:38-40)
- (선택) `src/runtime/chat-runtime.jsx` — nowHHMM 노출 1줄

**수정 금지 (읽기 전용 참조)**
- `api/ai/*` 전부 — **tutor task가 이미 있으므로 schemas.js/prompts.js 변경 0줄** (패턴 ④는
  기존 스키마 재사용으로 충족. 새 task 추가 없음)
- `api/services/srs.js` — corrections가 같은 컬럼 세트라 04-progress에서 그대로 재사용 (이번엔 predict만 호출)
- `api/services/vocab.service.js`, `src/shared/vocab-store.jsx` — 패턴 원본
- `src/screens/lesson.jsx` — useJinaChat 유지 (02-lesson 범위)

## 열어둔 판단 (구현 중 확정)

- **모바일 세션 전환 UI**: v1은 최근 active 세션 자동 이어가기. 목록 시트는 후속.
- **FeedbackPane 델타(↑N)**: 직전 scored assistant 메시지와의 평균 차. scored가 1개뿐이면 숨김 —
  세션 경계를 넘는 비교는 하지 않는다(혼란).
- **degraded 응답의 UI 표식**: v1은 corrections 빈 배열이라 첨삭 패널만 비는 것으로 충분한지,
  버블에 "자유 응답" 배지가 필요한지 구현 후 판단.
- **세션 삭제 UI**: API는 만들되(DELETE) 사이드바 버튼은 v1 보류 — 오터치 위험 대비 확인 모달까지
  넣을지 판단.
