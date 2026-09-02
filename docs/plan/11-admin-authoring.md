# 11 — 관리자 콘텐츠 저작·관리 플랜 (2026-09-03)

관리자(`users.is_admin`, 0016)가 **주제별 학습 · 리스닝(LC) · 스피킹** 콘텐츠를 직접 만들고
공개/비공개를 관리한다. 지금 콘텐츠가 생기는 경로는 AI 생성 하나뿐이고 그 결과는 항상
`visibility='private'` 이라 **만든 사람만 본다** — 전체 사용자에게 보이는 콘텐츠를 만들 수단이 없다.

## 0. 출발점 — 이 플랜이 건드리는 것

- 콘텐츠 3종(레슨·회화 시나리오·단어 세트)은 **테이블이 이미 다 있다**. 새 엔진을 만들지 않는다.
- 없는 것은 **저작 경로 전부**: 쓰기 API, 공개 승격, 토픽 생성, 검수, 스피킹 콘텐츠의 실체.
- 저작이 들어오면 **표시부(학습 화면 쪽 조회 규칙)가 함께 바뀐다.** 이 플랜 분량의 절반이 §3이다.

## 1. 현재 상태 — 무엇이 이미 준비돼 있나

| 영역 | 준비된 것 | 없는 것 |
|---|---|---|
| 콘텐츠 저장소 | `lessons`+`lesson_items`, `conversation_scenarios`, `vocab_sets` — 셋 다 `source`(seed\|ai)·`visibility`(public\|private)·`created_by` 완비 | 쓰기 API 전무(라우트는 전부 GET). 콘텐츠를 INSERT 하는 코드는 `ai-job.service.js` **한 곳뿐** |
| 묶음 | `topics` + `topic_contents` — 배타 FK(`num_nonnulls(lesson_id, scenario_id, vocab_set_id) = 1`), `position`, 타깃별 부분 UNIQUE | 토픽 생성·구성 API 없음(0014 마이그레이션에 SQL 시드 1건이 전부) |
| AI 생성 | `ai_jobs`(lesson_gen·scenario_gen·vocab_set) + 인프로세스 워커(동시 2) + 자동 검증(`validateGeneratedLesson`·`validateLcScript`) + `lesson_drafts` | `lesson_drafts.review_status`(draft/approved/rejected)를 **바꾸는 코드가 없다** = 검수 워크플로 미구현. 저장 시 `'private'` 하드코딩 |
| 리스닝 | 레슨 엔진 재사용 구조(`kind='toeic_lc'`, 스크립트는 `passage.body` 화자 라벨 배열, `jinaSpeak` 재생) — 08 Phase B | 저작 화면. LC 생성은 `part:'lc'` 로 이미 가능하지만 결과를 손볼 수단이 없다 |
| 스피킹 | `listSpeakingSentences` — LC 스크립트·시나리오 opening·레슨 vocab 예문에서 문장을 **파생**하는 뷰 | **콘텐츠 테이블 자체가 없다.** 제작할 대상이 존재하지 않는다 |
| 권한 | `users.is_admin`(0016), `/api/auth/me` DTO 에 포함 | `requireAdmin` 미들웨어, `/api/admin/*` 네임스페이스 |
| 클라이언트 | `index.html`(앱) · `canvas.html`(디자인 캔버스) 2엔트리 + `src/shared/*` 공유 패턴 확립 | admin 엔트리 |

## 2. 설계 결정

1. **게시 상태 축을 `status` 로 통일한다.** 지금 게시 상태를 나타내는 축이 이미 둘이다 —
   `lessons.published`(boolean)와 `visibility`(public\|private), 그나마 시나리오·단어 세트엔
   `published` 가 없다. 저작에는 "작성 중 / 검토 / 공개 / 내림" 4단계가 필요하므로
   `status TEXT (draft|review|published|archived)` 를 콘텐츠 3종 + `topics` + `speaking_sets` 에 통일 도입한다.
   의미를 못 박는다: **`status` = 생명주기(작성자·관리자 관점), `visibility` = 누가 볼 수 있나(public 전체 / private 만든 사람).**
   `lessons.published` 는 `status` 로 이관하고 컬럼은 한 사이클 남긴다(롤백 여지).
2. **가시성 조건은 단일 소스로 뽑는다** — `api/lib/content-scope.js`.
   현재 `visibility = 'public' OR created_by` 조건이 **27곳**(topic 13 · lesson 10 · speaking 3 · ai-job 1),
   `published` 가 20곳에 흩어져 있다. 뽑지 않으면 "관리자가 내렸는데 어떤 화면엔 계속 보이는" 버그가 반드시 난다.
   저작 기능보다 이 정리가 먼저다(Phase 1을 UI 없이 두는 이유).
3. **토픽 노출은 `status` 가 결정하고, `eligible` 임계치는 경고로 격하한다.**
   지금 `topicDto` 의 임계치(레슨 3 + 시나리오 1 + 단어 20)를 못 채운 토픽은 목록에서 아예 숨는다 —
   관리자가 토픽을 새로 만들면 **콘텐츠를 다 채우기 전까지 화면에 안 보여** 저작이 막힌다.
   임계치 계산은 유지하되(집계는 그대로 쓸모 있다) 필터가 아니라 admin 화면의 배지로 쓴다.
4. **admin 클라이언트는 별도 엔트리(`admin.html`)로 분리한다.** `canvas.html` 선례를 따른다.
   - 학습 앱 번들에 저작 UI가 섞이지 않는다(`index.html` 은 이미 script 21개 + babel standalone 런타임 컴파일).
   - 일반 사용자 브라우저에 admin 코드가 전달되지 않는다.
   - `APP_PAGES`(`app-nav.jsx` 단일 소스)에 손대지 않는다. 진입은 **설정 화면의 "콘텐츠 관리" 링크(새 탭)** 한 줄, `is_admin` 일 때만.
   - `admin.html` 자체에는 가드를 두지 않는다 — 인증을 클라이언트에 맡기지 않는다. 열려도 모든 `/api/admin/*` 이 403이면 빈 화면이다.
5. **스피킹 콘텐츠를 실체화한다 — `speaking_sets` 단일 테이블(items는 JSONB).**
   `vocab_sets` 와 같은 모양. 문항 테이블로 쪼개지 않는 이유는 스피킹이 아직 채점 이력을 저장하지 않아서
   (`POST /api/speaking/assess` 는 오디오를 메모리에서만 다루고 결과를 반환만 한다) **FK 대상이 될 일이 없기 때문**이다.
   이력을 남기게 되면 그때 쪼갠다. 기존 파생 로직은 버리지 않고 **3단 폴백**으로 격하: 세트 → 파생 → 화면 고정 시드 20문장.
6. **리스닝 오디오는 v1 그대로 브라우저 TTS(`jinaSpeak`)를 유지한다.** 관리자 오디오 업로드는 하지 않는다 —
   파일 저장소가 새로 필요하고(현재 없음), 08 §2.3 이 규정한 '연습 모드'의 전제가 바뀐다. 시험 모드(서버 TTS)와 함께 후속으로 미룬다.
7. **AI 파이프라인은 재사용한다 — 새 잡 종류를 만들지 않는다.**
   `ai_jobs.input` 에 `publish_target: 'personal' | 'catalog'` 를 추가하고 `catalog` 는 `is_admin` 에게만 허용한다.
   워커의 저장 함수가 `'private'` 로 하드코딩한 자리에 이 값을 반영해 catalog 요청은 `status='review'` 로 떨어뜨리고,
   관리자가 검수 화면에서 승인하면 `published` + `public` 이 된다. 이때 비로소 `lesson_drafts.review_status` 가 제 역할을 한다.
8. **감사 흔적을 남긴다.** 콘텐츠 3종 + topics + speaking_sets 에 `updated_by`,
   게시 전이는 `content_audit_log`(누가·무엇을·언제·어디서 어디로)에 append-only 로 기록한다.
   콘텐츠 본문 리비전(되돌리기)은 v1 범위 밖 — 열린 질문 3.

## 3. 표시부 변경 목록 — 저작과 같은 크기의 작업

`status` 축이 들어가는 순간 학습 화면 쪽 조회가 전부 바뀐다. Phase 1에서 **한 번에** 처리한다.

| 파일 | 지금 | 바뀌는 것 | 놓치면 생기는 일 |
|---|---|---|---|
| `api/lib/content-scope.js` | (없음) | `visibleContent(alias, userParam)` 신설 — `status='published' AND (visibility='public' OR created_by=$n)` 를 만드는 단일 소스 | — |
| `api/services/topic.service.js` | 가시성 조건 13곳(`TOPIC_SUMMARY`·`getTopic` 4쿼리·진행률 CTE 3개) | 전부 헬퍼 경유. **진행률 CTE 분모도 같은 규칙**(이미 주석으로 명시된 규범) | 내린 콘텐츠가 진행률 분모에 남아 100%가 안 됨 |
| 〃 `topicDto` | `eligible` 로 목록 필터 | 필터는 `status`, `eligible` 은 DTO 필드로만 유지(경고 배지용) | 관리자가 만든 빈 토픽이 안 보여 저작 불가(결정 3) |
| `api/services/lesson.service.js` | 가시성 10곳 + `l.published` 4곳(목록·추천·오답·Q&A) | 헬퍼 경유. `published` → `status` | 내린 레슨을 추천·오답 노트가 계속 노출 |
| `api/services/speaking.service.js` | 가시성 3곳, LC/시나리오/vocab 파생 | **세트 우선 조회로 재작성**(3단 폴백, 결정 5) | — |
| `api/services/ai-job.service.js` | `assertTopicAccess` 1곳, 저장 시 `'private'` 하드코딩 | 헬퍼 경유 + `publish_target` 반영(결정 7) | 관리자 생성물이 계속 private |
| `src/screens/topics.jsx` | 목록/상세 렌더 | 빈 상태 문구. `eligible` 배지는 앱에서는 렌더하지 않는다(관리자 화면 전용) | — |
| `src/screens/listening.jsx` | `GET /api/lessons?kind=toeic_lc` | 쿼리 그대로 동작. 목록 카드에 난이도·문항 수 표시 확장(선택) | — |
| `src/screens/speaking.jsx` | 서버 문장 없으면 고정 시드 폴백 | 세트 선택 UI(세트가 2개 이상일 때만 노출) | — |
| 설정 패널 (05 플랜 화면) | 계정·테마·AI·STT 4섹션 | `is_admin` 일 때 "콘텐츠 관리 열기"(`admin.html`, 새 탭) 1줄 | — |
| `db/migrate.mjs` `RESET_TABLES` | 22개 목록 | `speaking_sets`·`content_audit_log` 추가(FK 역순 유지, `FOREIGN_TABLES` self-assert 통과 확인) | reset 이 새 테이블을 남겨 다음 마이그레이션이 깨짐 |

## 4. Phase 플랜

### Phase 1 (3~4일) — 상태 축 + 권한 + 표시부 정리 (**UI 없음**)

| 산출물 | 세부 |
|---|---|
| 마이그레이션 `0017_content_status.sql` | 아래 §5 SQL 초안. `lessons.published` → `status` 백필, 기존 행은 전부 `published` |
| `api/lib/content-scope.js` | 가시성/게시 조건 단일 소스. 27+20곳을 여기로 |
| `requireAdmin` (`api/middleware/auth.js`) | `requireUser` 후 `is_admin` 검사, 아니면 403 `FORBIDDEN`. DEV_AUTOLOGIN 계정은 관리자가 아니다 |
| 표시부 일괄 수정 | §3 표 전부 |
| 검증 `scripts/verify-content-status.mjs` | 마이그레이션 전후 **목록 결과 동일**(무회귀), `status='draft'` 콘텐츠는 모든 학습 API에서 0건, 진행률 분모 일치, 비관리자 `/api/admin/*` 403 |

완료 판정: 기존 e2e(`e2e-lesson`·`e2e-dashboard`·`e2e-plan08-screens`) 전부 무회귀 + 위 검증 스크립트 통과. **UI 변경 0.**

### Phase 2 (3일) — `admin.html` 최소 관리 UI (제작 아님, **관리부터**)

```
┌ Jina 콘텐츠 관리 ─────────────────────────────── admin ─┐
│ [토픽] [리스닝] [스피킹] [회화] [단어]      [+ 새로 만들기] │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 상태  제목                     유형   문항  수정일     │ │
│ │ ●공개 TOEIC LC — 짧은 대화 Set1  LC     3   09-01  [▾] │ │
│ │ ○초안 비즈니스 이메일 Set 24     Part7  3   09-02  [▾] │ │
│ │ ◐검토 (AI) 면접 표현 20          단어   20  09-03  [▾] │ │
│ └─────────────────────────────────────────────────────┘ │
│ [▾] = 공개 / 내림 / 미리보기 / 삭제                        │
└───────────────────────────────────────────────────────┘
```

| 산출물 | 세부 |
|---|---|
| `admin.html` | `index.html` 과 같은 뼈대. `src/shared/` 의 tokens·icons·api-client·auth-store 재사용, 학습 화면은 로드하지 않는다 |
| `src/admin/admin-app.jsx` · `content-store.jsx` | 유형 탭 · 목록 · 상태 전이. `is_admin` 아니면 안내 화면 |
| `api/routes/admin.routes.js` | `GET /api/admin/contents?type=&status=`, `POST /api/admin/contents/:type/:id/status {to}` |
| `server.js` | `admin.html` 정적 서빙(기존 deny-list 유지). `/config.js` 는 그대로 |
| 설정 패널 링크 | `is_admin` 일 때만 |

완료 판정: 관리자가 기존 콘텐츠를 **내리고 다시 올릴 수 있고**, 내린 즉시 학습 화면 목록·추천·진행률 분모에서 사라진다(§3 검증). 비관리자는 목록 API 403.

### Phase 3 (1주) — 리스닝 LC 에디터 (**가장 가치 높은 저작 화면**)

LC는 이미 `lesson_gen` + `part:'lc'` 로 스크립트+문항이 생성되고 `validateLcScript`(4~8줄, `M:`/`W:` 라벨,
괄호 지시문 금지, 대사 12자 이상)까지 돌고 있다. 여기에 **손보는 화면**만 붙이면 저작이 완성된다.

| 산출물 | 세부 |
|---|---|
| `src/admin/editors/lc.jsx` | 스크립트 줄 편집(화자 M/W 토글 · 줄 추가/삭제/순서) + 문항 4지선다 · 정답 · 해설 · `skill_code` |
| 검증 표시 | 규칙의 단일 소스는 서버(`validateLcScript` 등) — 저장 시 서버가 돌려준 `validation_errors` 를 화면에 렌더 |
| TTS 미리듣기 | `jinaSpeak` 로 스크립트 재생 — 화자 라벨은 읽지 않는다(기존 규범 유지) |
| API | `POST /api/admin/contents/lesson`, `PATCH …/:id` (items 포함 트랜잭션 저장) |

완료 판정: 관리자가 LC 한 세트를 **처음부터 수기로** 만들어 공개까지 하고, 학습자 계정의 리스닝 탭에서 재생·채점이 정상 동작.

### Phase 4 (4~5일) — AI 초안 → 검수 → 공개

| 산출물 | 세부 |
|---|---|
| `publish_target` | `ai_jobs.input` 확장. `catalog` 는 `is_admin` 만(비관리자 요청은 400) |
| 워커 저장 분기 | catalog → `status='review'`. personal → 지금과 동일(private) |
| 검수 큐 | `GET /api/admin/drafts`, `POST /api/admin/drafts/:id/approve\|reject` → `lesson_drafts.review_status` 갱신 |
| 검수 화면 | 생성 결과 + `validation_errors` 나란히. 승인 전 Phase 3 에디터로 수정 가능 |

완료 판정: 관리자 생성 → 검토 대기 → 승인 → 전체 사용자 노출. 승인 전에는 **어떤 학습 API 에도 나오지 않는다**. `review_status` 가 실제로 바뀐다(현재 죽은 컬럼).

### Phase 5 (1주) — 스피킹 세트 + 토픽 구성

| 산출물 | 세부 |
|---|---|
| `speaking_sets` | §5 SQL. `topic_contents` 배타 FK 를 4개로 확장(`num_nonnulls(...) = 1` 갱신 + 부분 UNIQUE 추가) |
| `speaking.service.js` 재작성 | 3단 폴백: 세트 → 기존 파생 → 화면 고정 시드 |
| `src/admin/editors/speaking.jsx` | 문장·번역·포커스 음소·목표 WPM |
| `src/admin/editors/topic.jsx` | 토픽 만들기 + 콘텐츠 붙이기/순서 + `eligible` 경고 배지 |
| `PUT /api/admin/topics/:id/contents` | 구성 일괄 저장(순서 포함, 트랜잭션) |

완료 판정: 관리자가 **토픽 하나를 처음부터 완성**(리스닝 1 + 스피킹 1 + 회화 1 + 단어 20)해 공개하고, 학습자 화면의 주제별 학습에서 진행률까지 정상 계산.

## 5. 구현자 메모

### 마이그레이션 `0017_content_status.sql` 초안

```sql
-- 상태 축 통일. 기존 행은 전부 published 로 백필한다(무회귀가 Phase 1 완료 판정).
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lessons','conversation_scenarios','vocab_sets','topics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT ''published''', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL', t);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (status IN (''draft'',''review'',''published'',''archived''))',
                     t, t || '_status_ck');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- lessons.published → status 이관. 컬럼은 한 사이클 남긴다(롤백 여지).
UPDATE public.lessons SET status = 'draft' WHERE NOT published;

CREATE INDEX IF NOT EXISTS lessons_status_idx    ON public.lessons (position, id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS scenarios_status_idx  ON public.conversation_scenarios (id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS vocab_sets_status_idx ON public.vocab_sets (id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS topics_status_idx     ON public.topics (created_at, id) WHERE status = 'published';

-- 스피킹 콘텐츠 (결정 5) — vocab_sets 와 같은 모양. 문항 테이블로 쪼개지 않는다.
CREATE TABLE IF NOT EXISTS public.speaking_sets (
  id          BIGSERIAL   PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  items       JSONB       NOT NULL,   -- [{text, text_ko, focus, target_wpm}]
  difficulty  SMALLINT    NOT NULL DEFAULT 3,
  source      TEXT        NOT NULL DEFAULT 'seed',
  status      TEXT        NOT NULL DEFAULT 'published',
  visibility  TEXT        NOT NULL DEFAULT 'public',
  created_by  BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT speaking_sets_items_ck  CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 60),
  CONSTRAINT speaking_sets_source_ck CHECK (source IN ('seed','ai')),
  CONSTRAINT speaking_sets_status_ck CHECK (status IN ('draft','review','published','archived')),
  CONSTRAINT speaking_sets_vis_ck    CHECK (visibility IN ('public','private')),
  CONSTRAINT speaking_sets_diff_ck   CHECK (difficulty BETWEEN 1 AND 5)
);

-- 배타 FK 를 4개로 확장 (0013 은 적용된 파일이라 수정 금지 — 제약을 여기서 교체한다)
ALTER TABLE public.topic_contents ADD COLUMN IF NOT EXISTS speaking_set_id BIGINT
  REFERENCES public.speaking_sets(id) ON DELETE CASCADE;
ALTER TABLE public.topic_contents DROP CONSTRAINT IF EXISTS topic_contents_one_target_ck;
ALTER TABLE public.topic_contents ADD CONSTRAINT topic_contents_one_target_ck
  CHECK (num_nonnulls(lesson_id, scenario_id, vocab_set_id, speaking_set_id) = 1);
CREATE UNIQUE INDEX IF NOT EXISTS topic_contents_speaking_set_uq
  ON public.topic_contents (topic_id, speaking_set_id) WHERE speaking_set_id IS NOT NULL;

-- 게시 전이 감사 로그 (append-only)
CREATE TABLE IF NOT EXISTS public.content_audit_log (
  id           BIGSERIAL   PRIMARY KEY,
  actor_id     BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_type TEXT        NOT NULL,
  content_id   BIGINT      NOT NULL,
  action       TEXT        NOT NULL,
  from_status  TEXT,
  to_status    TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_audit_type_ck CHECK (content_type IN ('lesson','scenario','vocab_set','speaking_set','topic')),
  CONSTRAINT content_audit_action_ck CHECK (action IN ('create','update','status_change','delete'))
);
CREATE INDEX IF NOT EXISTS content_audit_target_idx ON public.content_audit_log (content_type, content_id, created_at DESC);
```

`db/migrate.mjs` 의 `RESET_TABLES` 에 `content_audit_log` · `speaking_sets` 를 **FK 역순**으로 추가하고,
`FOREIGN_TABLES` self-assert(기존 앱 테이블 11개 불가침)를 통과하는지 확인한다.

### API 표면

```
GET    /api/admin/contents?type=lesson|scenario|vocab_set|speaking_set&status=
POST   /api/admin/contents/:type                생성 (status='draft')
PATCH  /api/admin/contents/:type/:id            수정
POST   /api/admin/contents/:type/:id/status     { to: 'published' | 'archived' | 'draft' }
GET    /api/admin/topics · POST · PATCH
PUT    /api/admin/topics/:id/contents           구성·순서 일괄 저장
GET    /api/admin/drafts                        AI 초안 검수 큐
POST   /api/admin/drafts/:id/approve | reject
```

전 경로 `requireAdmin`. 변경 요청은 기존 `X-Requested-With: jina` CSRF 규칙을 그대로 탄다.

### 먼저 하지 말 것

- 새 콘텐츠 엔진 — 리스닝은 레슨 엔진 재사용(08 §2.3), 저작도 같은 테이블에 쓴다.
- 오디오 파일 업로드·저장소 도입(결정 6).
- 콘텐츠 본문 리비전/되돌리기 — 감사 로그는 **상태 전이만** 남긴다(열린 질문 3).
- 스피킹 문항 단위 테이블 분리 — 채점 이력을 저장하게 될 때(결정 5).
- 관리자 역할 세분화(에디터/리뷰어 등) — `is_admin` 단일 플래그로 시작한다.
- `admin.html` 을 학습 앱 라우팅(`APP_PAGES`)에 편입하는 것(결정 4).

## 6. 열린 질문

1. **AI 검수 승인 시 `visibility`** — Phase 4 에서 `catalog` 초안은 승인과 동시에 `public` 으로 열 것인가,
   아니면 `published` + `private` 로 두고 별도 공개 조작을 한 번 더 요구할 것인가(오발행 방지).
2. **`archived` 콘텐츠와 학습 이력** — 이미 푼 레슨을 내리면 오답 노트·통계에서 어떻게 다룰 것인가.
   현재 오답 노트는 `l.published` 를 조인 조건으로 쓴다 → 내리는 순간 사용자의 오답이 **사라진다**.
   이력 화면은 `archived` 도 보여주고 새 시도만 막는 쪽이 자연스러워 보이는데, 규범 확정 필요.
3. **본문 리비전** — 공개된 콘텐츠를 수정했을 때 되돌릴 수단. v1은 감사 로그(상태 전이)만 남기고 본문 스냅샷은 두지 않는다.
4. **seed 콘텐츠 편집** — `source='seed'` 인 시드 콘텐츠를 관리자가 편집하면 마이그레이션과 어긋난다.
   편집 시 `source='seed'` 를 유지할지, 편집 즉시 다른 값으로 표시할지.
