# 위임 지시서 — 플랜 12 (AI 초안 → 검수 → 카탈로그 공개)

- 대상: **Codex CLI `gpt-6-astra`** (reasoning effort xhigh)
- 저장소: `D:\git\node\english tutor jina` · 브랜치 `claude/plan-12-ai-draft-review`
- 위임자: Claude (설계 검토·검증 담당, 구현은 하지 않는다)
- 2026-09-05

---

## 0. 네가 할 일

`docs/plan/12-ai-draft-review.md` 의 **Phase 1 과 Phase 2 를 구현한다.**
플랜 문서를 먼저 끝까지 읽어라. 아래 §2 는 그 문서를 현재 코드에 대조해 본 **설계 검토 결과**이고,
플랜과 코드가 어긋나는 지점과 그 해석을 담고 있다. **§2 가 플랜보다 우선한다.**

문서(`docs/**`)는 고치지 마라 — 이 지시서와 네 보고서를 제외하면 위임자가 갱신한다.
git 커밋·푸시 하지 마라. `npm run db:reset` 을 부르지 마라(개발 DB 를 날린다).

---

## 1. 저장소 오리엔테이션

**스택**: Node 20.6+ ESM, 빌드 단계 없음. 서버는 정적 서버(`server.js`, :3003)가 `/api/*` 를
API 서버(`api/server.js`, :3004)로 프록시한다. 프런트는 `src/**/*.jsx` 를 브라우저에서
Babel standalone 이 런타임 컴파일한다 — **JSX 는 eslint 대상이 아니고 번들러도 없다.**
HTML 진입점 셋: `index.html`(학습 앱) · `canvas.html`(디자인 캔버스) · `admin.html`(관리, 해시 탭).

**DB**: PostgreSQL 16.15 `192.168.45.7:5433/jina_eng`, 스키마 `app`, `tester1`/`tester1`.
`.env` 에 이미 설정돼 있다. SQL 에 **스키마 접두를 쓰지 마라** — 러너와 런타임이
`search_path` 를 `DB_SCHEMA` 하나로 고정한다.

**마이그레이션**: `db/migrations/NNNN_snake_case.sql` + 반드시 `.down.sql` 짝.
적용된 파일은 **체크섬이 고정**돼 수정하면 러너가 즉시 실패한다 — 고칠 것은 새 번호로.
현재 적용분: `0001_baseline` · `0017_user_roles` · `0018_content_archived_public`.
다음 번호는 **0019**. 규약은 `db/README.md`.

**작업트리는 CRLF 다.** 편집 도구가 개행을 LF 로 바꾸지 않게 주의하라.
주석·사용자 문자열은 **한국어**로 쓰고, 기존 파일의 주석 밀도·어조를 따라라 —
이 코드베이스의 주석은 "무엇을 왜 그렇게 했는지, 안 하면 무슨 일이 나는지"를 적는다.

### 이번 작업이 올라타는 두 모듈 (플랜 11 산출물 — 먼저 읽어라)

- `api/lib/content-scope.js` — `discoverable(alias, userParam)` / `resolvable(alias, userParam)`.
  `discoverable` = `status='published' AND (visibility='public' OR created_by=$n)`,
  `resolvable` = `status IN ('published','archived') AND (같은 가시성 조건)`.
- `api/lib/content-status.js` — `canTransition(from,to,role)` · `assertTransition` ·
  `canSetVisibility(status,to,role)` · `assertSetVisibility`.
  **상태를 먼저 보고 역할을 나중에 본다**: 금지 전이는 역할 무관 **409 CONFLICT**,
  역할 부족만 **403 FORBIDDEN**. `from === to` 도 409.
- `api/lib/roles.js` 의 `atLeast(userRole, required)` — **`await loadRoles()` 를 먼저 부르지 않으면 throw** 한다.
- `api/services/admin-content.service.js` + `api/routes/admin.routes.js` — 플랜 11 Phase 2 의
  콘텐츠 목록·전이 API. 검수 API 는 이 옆에 붙는다.

---

## 2. 설계 검토 — 플랜 12 를 현재 코드에 대조한 결과

플랜 12 는 2026-09-03 에 쓰였고 그 뒤 10.7(스키마 재정비)·11(상태 축)이 들어왔다.
아래 7건은 **위임자가 코드로 확인한 사실**이다. 플랜 본문과 다르면 아래를 따라라.

### 2.1 `lesson_drafts.review_status` 는 살아 있다 — 그러나 판정에 쓰지 않는다

플랜 11 결정 8 은 이 컬럼을 baseline 에서 빼자고 권했지만 **10.7 은 그대로 남겼다.**
실측: `db/migrations/0001_baseline.sql` 의 `lesson_drafts` 에
`review_status TEXT NOT NULL DEFAULT 'draft'` + `CHECK (review_status IN ('draft','approved','rejected'))` 가 있고,
`api/` 전체에서 **참조 0건**(진짜 죽은 컬럼이다).

플랜 12 안에 모순이 있다 — **결정 3 은 "쓰지 않는다"** 고 하고 **Phase 1 표는 "approve → approved"** 라고 한다.
해석은 이렇다. 둘은 층이 다르다:

- **생명주기 단일 소스는 `content_items.status` 다.** 큐 판정·권한·감사·학습 API 가시성은 전부 이 컬럼만 본다.
  `review_status` 를 판정에 쓰면 레슨만 상태 축이 둘이 되고, 시나리오·단어 세트에는 그 컬럼이 없다.
- **`review_status` 는 초안 행의 부기(bookkeeping)다.** "이 생성 산출물이 승인됐는가/반려됐는가" 를
  `lesson_drafts` 행에 남겨, 나중에 같은 초안을 다시 열었을 때 결과를 알 수 있게 한다.
  플랜의 완료 판정("`review_status` 가 실제로 바뀐다")은 이 뜻이다.

따라서 **둘 다 한다**: `content_items.status` 를 전이시키고, 레슨이면 `lesson_drafts.review_status` 도 같이 적는다.
**단 어떤 판정도 `review_status` 를 읽지 않는다.** 이 경계를 코드 주석에 남겨라.

### 2.2 검수 큐는 UNION 도, 세 쿼리도 필요 없다 — `content_items` 한 테이블이다

플랜 구현자 메모는 "레슨은 `lesson_drafts` 행, 나머지는 본 테이블이라 세 쿼리를 서비스에서 합친다" 고 적었다.
**그 전제는 10.7 Phase 2 로 사라졌다.** 지금은 레슨·시나리오·단어 세트가 전부 `content_items` 한 테이블이고
타입은 `content_items.type` 이다(`lesson|scenario|vocab_set|speaking_set`).

그래서 큐는 이렇게 된다:

```
content_items ci  (ci.status = 'review')
  LEFT JOIN lesson_drafts ld ON ld.published_content_id = ci.id   -- 레슨만 붙는다
```

레슨 행에는 `ld.payload`(생성 결과)와 `ld.validation_errors` 가 붙고, 나머지는 `NULL` 이다.
DTO 에 `cross_check: null` 슬롯을 남겨라(플랜 07 follow_up 의 교차 채점 자리).

**주의**: `lesson_drafts.published_content_id` 는 `api/services/ai-job.service.js:362` 이
콘텐츠를 만든 직후 채운다(`UPDATE lesson_drafts SET published_content_id = $2 ...`).
그러니 `review` 로 떨어지는 catalog 경로에서도 **반드시 채워져야** 큐가 초안을 찾는다. 확인하라.

플랜 §4 열린 질문 3("시나리오·단어 세트를 레슨과 같은 큐에 둘지")은 이 구조에서 자동으로 풀린다 — 같은 큐다.

### 2.3 `request_hash` 는 손댈 필요가 없다

구현자 메모가 "`request_hash` 에 `publish_target` 을 넣지 않으면 기존 job 을 재사용해 private 레슨을 돌려준다" 고
경고했는데, 실측하면 `api/services/ai-job.service.js:78` 이
`createHash('sha256').update(task + ':' + stable(input))` 로 **`input` 전체**를 해싱한다.
따라서 `publish_target` 을 **`input` 안에 저장하기만 하면** 해시가 자동으로 갈린다.
`publish_target` 을 별도 컬럼이나 별도 인자로 빼면 그 순간 이 경고가 현실이 된다 — **`input` 안에 둬라.**

### 2.4 저장 분기 지점은 세 곳이다 (하드코딩된 published/private)

`api/services/ai-job.service.js` 의 세 INSERT:
`:331` 레슨 · `:377` 시나리오 · `:408` 단어 세트 — 전부 `VALUES (..., 'published', 'private', 'ai', ...)`.

`status` 를 **항상 명시**한다는 규칙은 이미 지켜지고 있다(플랜 11 결정 1 의 기본값 함정).
여기서 할 일은 그 리터럴을 `publish_target` 에 따라 가르는 것이다:

- `personal`(기본) → `status='published'`, `visibility='private'` (지금 그대로)
- `catalog` → `status='review'`, `visibility='private'`

`review + public` 은 `content_items_public_ck` 가 막는다(0018 이후에도). 그러니 `visibility` 는 양쪽 다 `private`.

### 2.5 `publish_target` 검증 위치

`api/routes/ai-job.routes.js:27` 이 `input: body.input` 을 **검증 없이 통째로** 서비스에 넘긴다.
`publish_target` 검증(`personal|catalog`, `catalog` 는 `author` 이상)은
**서비스(`enqueue`)에서** 하라 — 라우트는 `input` 의 모양을 모르고, 워커도 같은 값을 읽어야 한다.
`learner` 의 `catalog` 요청은 플랜대로 **400**(권한 문제가 아니라 입력 문제로 다룬다는 것이 플랜의 선택이다.
403 이 더 맞다고 판단하면 그 근거를 보고서에 적고 **플랜대로 400 으로 구현**하라 — 플랜을 임의로 바꾸지 마라).

역할 판정에는 `atLeast` 를 쓰고 **`await loadRoles()` 를 먼저 불러라**.

### 2.6 승인은 두 단계 — `visibility` 를 건드리지 않는다

`approve` = `content_items.status`: `review → published`, **`visibility` 는 `private` 유지**.
공개는 플랜 11 이 만든 `POST /api/admin/contents/:type/:id/visibility` 로 한 번 더 누른다.
검수 화면의 "승인과 함께 공개" 체크박스(**기본 off**)를 켜면 승인 직후 그 엔드포인트에 해당하는
동작을 서버가 이어서 수행한다 — 두 전이를 **한 트랜잭션**에 넣고 감사 로그는 **2행**(status_change + visibility_change).

`reject` = `review → draft`. 사유는 감사 로그에 남긴다.
**플랜 본문은 `content_audit_log.description` 이라고 적었지만 실제 컬럼명은 `note` 다**(`0001_baseline.sql` 확인).

### 2.7 권한

- `catalog` 생성 요청: `author` 이상 (만드는 권한)
- 승인·반려: `reviewer` 이상 (통과시키는 권한) — 판정은 라우트가 아니라 `canTransition` 이 한다
- 자가 승인: 콘텐츠의 `created_by` 가 행위자와 같으면 감사 로그에 표식.
  플랜 11 구현은 `note` 앞에 `[self_review] ` 접두어를 붙이고 `SELF_REVIEW_TAG` 로 내보낸다 — **그것을 재사용하라.**
  `REQUIRE_SEPARATE_REVIEWER` 가 켜져 있으면 자가 승인은 403.
  현재 `api/services/admin-content.service.js` 가 `process.env.REQUIRE_SEPARATE_REVIEWER === '1'` 을
  **호출 시점에** 직접 읽는다(TODO 로 표시돼 있다). 이번에 `api/config.js` 로 옮기고 양쪽이 같은 값을 보게 하라.

---

## 3. 산출물

### Phase 1 — `publish_target` · 워커 분기 · 검수 API

| 파일 | 할 일 |
|---|---|
| `api/config.js` | `REQUIRE_SEPARATE_REVIEWER`(기본 false) 추가 |
| `api/services/ai-job.service.js` | `input.publish_target` 검증 · 세 INSERT 분기 · `published_content_id` 가 catalog 경로에서도 채워지는지 확인 |
| `api/services/admin-content.service.js` | 검수 큐 조회 + approve/reject (또는 새 서비스 파일로 분리 — 판단은 네가) |
| `api/routes/admin.routes.js` | `GET /api/admin/drafts` · `POST /api/admin/drafts/:id/approve` · `POST /api/admin/drafts/:id/reject` |

> `:id` 가 무엇인지 정하라. `lesson_drafts.id` 로 하면 시나리오·단어 세트에 초안 행이 없어 큐의 절반을 다룰 수 없다.
> **`content_items.id` 를 권한다** — 큐가 `content_items` 기반이기 때문이다. 정한 근거를 보고서에 적어라.

### Phase 2 — 검수 화면

| 파일 | 할 일 |
|---|---|
| `src/admin/review-queue.jsx` | 큐 목록 → 상세(생성 결과 + `validation_errors`) → [승인] [반려(사유)] · "승인과 함께 공개"(기본 off) |
| `src/admin/admin-app.jsx` | 탭 추가 (현재 `#/contents` · `#/users` 해시 라우팅) |
| `admin.html` | `<script>` 태그 추가 — **순서를 손으로 맞춰야 한다**(빌드 없음). 의존: tokens → icons → api-client → auth-store → store → app |
| 레슨 "AI로 만들기" 패널 | `can_author` 면 대상 라디오(내 것 / 카탈로그) 1개 추가. `learner` 는 지금과 동일 |

**관리 화면에서 이미 한 번 데인 것들 — 반복하지 마라** (`docs/reviews/03-2026-09-03-cursor-admin-users/05-fixes.md` §1B):

- 드롭다운은 `position: fixed` + `getBoundingClientRect()`. `absolute` 면 표의 `overflow:auto` 에 **클리핑된다.**
  아래 공간이 없으면 위로 펼치고, `scroll` 은 **capture** 로 들어야 내부 스크롤 컨테이너 이벤트까지 잡힌다.
  기존 `useDismissMenu` 훅을 재사용하라.
- 루트에 `jina-root` 클래스가 없으면 `box-sizing`·폰트·버튼 리셋이 **이 화면에만** 빠진다.
- 색은 `theme.*` **인라인 스타일**. CSS 사본을 만들면 4개 테마 전환이 깨진다.
- 이모지 대신 `src/shared/icons.jsx` 의 `Icons.*`.
- `data-testid` 를 붙여라(검증이 잡을 수 있게).

목업: `docs/plan/mockups/12-review-queue.html` · 미리보기 `docs/plan/img/12-review-queue.png`.
목업은 aurora 토큰 **사본**(`mockups/shared.css`)으로 그린 것이다 — 구현은 CSS 사본이 아니라 `theme.*` 를 쓴다.

### 검증 (네가 직접 돌려라)

| 명령 | 기대 |
|---|---|
| `npm run lint` | 0 |
| `npm test` | 현재 81건 전부 통과 + 네가 추가한 것 |
| `npm run db:verify` | 통과 |
| `npm run verify:content-status` | 현재 65건 전부 통과 (서버 필요) |
| `node scripts/verify-lesson-gen.mjs` | 플랜이 지정한 확장 대상. AI 가 필요하면 `SKIP_AI=1` 로 돌려라 |

서버가 필요하면 `npm run dev`(3003/3004). **끝나면 반드시 프로세스를 정리하라**(포트 기준).
Ollama 는 지금 **꺼져 있다** — AI 호출 경로는 503 `CLI_NOT_FOUND` 가 정상이다.
그래서 **AI 를 실제로 부르지 않고도 검증할 수 있게** 짜라: `ai_jobs` 행과 `lesson_drafts` 행을
DB 에 직접 심어 검수 큐·승인·반려를 검증하는 방식(선례: `scripts/verify-content-status.mjs`).

플랜의 완료 판정을 **자동 검증으로 굳혀라** — `scripts/verify-content-status.mjs` 를 확장하거나
새 `scripts/verify-draft-review.mjs` 를 만들어라(어느 쪽이든 `package.json` 에 스크립트 한 줄 추가):

1. 관리자 catalog 생성 → `status='review'` 행이 **어떤 학습 API 에도 0건**
2. approve → `published + private`(관리자만 봄) → 11 의 전이로 `public` → **학습자 계정 목록에 노출**
3. 비관리자(`learner`)의 catalog 요청 400
4. reject → `content_items` 행 수 불변 · `status='draft'` · `review_status='rejected'`
5. `author` 는 승인 403, `reviewer` 는 200

픽스처 계정·행은 태그를 붙여 만들고 `finally` 에서 **반드시 지워라**.
`DEV_AUTOLOGIN=1` 이고 dev 시드 계정은 `role='admin'` 이다 — 비관리자 검증에 dev 자동로그인 쿠키를 쓰면
**조용히 거짓 통과**한다. 쿠키 없는 요청에는 `X-Jina-No-Autologin: 1` 을 붙여라.

---

## 4. 보고서

작업이 끝나면 `docs/reviews/04-2026-09-05-codex-astra-plan12/02-agent-report.md` 에 적어라:

1. **무엇을 바꿨나** — 파일별 한두 줄
2. **설계 판단** — §2 에서 "네가 정하라" 고 한 것들(`:id` 의 정체, 서비스 분리 여부 등)과 그 근거
3. **플랜·지시서와 다르게 간 것** + 이유
4. **직접 돌린 검증** — 명령과 **실제 출력의 수치**. 안 돌린 것은 안 돌렸다고 적어라
5. **막힌 것 · 남긴 것 · 위험**

**중요**: 이 보고서는 위임자가 **직접 재실행해 검증**한다(`03-verification.md`).
"전부 통과" 라고 적고 실제로는 안 돌린 것이 이전 라운드에서 나왔다 — 돌리지 않았으면 그렇게 적는 것이 훨씬 낫다.
