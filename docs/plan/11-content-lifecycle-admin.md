---
# status: draft | in_progress | done · phase.status: done | pending_verification | todo
plan: "11"
title: "관리자 콘텐츠 ① — 상태 축 · 권한 · 최소 관리 UI (11 → 12 → 13 시리즈의 첫 플랜)"
status: draft
group:                       # 원래 한 플랜이었던 것을 셋으로 나눈 그룹 스콥 — 세 문서가 같은 블록을 가진다
  id: admin-content
  title: "관리자 콘텐츠 저작·관리"
  members: ["11", "12", "13"]
  order: 1
created: 2026-09-03
updated: 2026-09-03
depends_on: ["07", "08", "10.5"]   # requireAdmin 은 10.5 Phase 1 산출물을 그대로 쓴다
blocks: ["12", "13"]
migrations: ["0017_content_status"]
phases:
  - { id: "1", name: "상태 축 + 가시성 헬퍼 2종 + 표시부 정리 (UI 없음)", status: todo }
  - { id: "2", name: "admin.html 최소 관리 UI — 목록 · 상태 전이", status: todo }
verify: ["scripts/verify-content-status.mjs (신규)", "scripts/e2e-lesson.mjs", "scripts/e2e-dashboard.mjs", "scripts/e2e-plan08-screens.mjs", "scripts/e2e-topics.mjs"]
follow_ups:
  - "AI 초안 검수 → 공개: 플랜 12"
  - "저작 에디터 · 토픽 구성 · 스피킹 세트: 플랜 13"
  - "빌드 단계 도입 여부 — admin.html 이 세 번째 HTML 진입점이 되는 시점 (열린 질문 4)"
---

# 11 — 관리자 콘텐츠 ①: 상태 축 · 권한 · 최소 관리 UI (2026-09-03)

관리자(`users.is_admin`, 0016)가 **주제별 학습 · 리스닝(LC) · 스피킹** 콘텐츠를 직접 만들고
공개/비공개를 관리한다. 지금 콘텐츠가 생기는 경로는 AI 생성 하나뿐이고 그 결과는 항상
`visibility='private'` 이라 **만든 사람만 본다** — 전체 사용자에게 보이는 콘텐츠를 만들 수단이 없다.

> **2026-09-03 분할.** 원래 한 문서(Phase 1~5)였던 "관리자 콘텐츠 저작·관리 플랜"을 성격이 다른 세 플랜으로 나눴다.
> 순서도 바꿨다 — 투입 대비 가치가 가장 높은 AI 검수를 에디터보다 앞에 둔다.
>
> | 플랜 | 내용 | 원래 Phase |
> |---|---|---|
> | **11 (이 문서)** | `status` 축 · 가시성 헬퍼 · `requireAdmin` 연결 · 내리고 올리는 최소 관리 UI | 1 · 2 |
> | [12](12-ai-draft-review.md) | AI 초안 → 검수 → 카탈로그 공개 (`publish_target`, `lesson_drafts.review_status` 살리기) | 4 |
> | [13](13-authoring-editors.md) | LC 에디터(최소형) · 토픽 구성 · 스피킹 세트(플랜 10 실측 통과 조건부) | 3 · 5 |
>
> 12 는 11 만 있으면 시작할 수 있고, 13 은 11 이 끝나야 한다(쓰기 API 가 11 의 상태 축을 전제).

## 0. 출발점 — 이 플랜이 건드리는 것

- 콘텐츠 3종(레슨·회화 시나리오·단어 세트)은 **테이블이 이미 다 있다**. 새 엔진을 만들지 않는다.
- 없는 것은 **저작 경로 전부**: 쓰기 API, 공개 승격, 토픽 생성, 검수, 스피킹 콘텐츠의 실체.
  이 문서는 그중 **상태 축과 "내리기/올리기"** 만 만든다. 만들기(13)와 검수(12)는 그 위에 얹는다.
- 저작이 들어오면 **표시부(학습 화면 쪽 조회 규칙)가 함께 바뀐다.** 이 문서 분량의 절반이 §3이다.

## 1. 현재 상태 — 무엇이 이미 준비돼 있나

| 영역 | 준비된 것 | 없는 것 |
|---|---|---|
| 콘텐츠 저장소 | `lessons`+`lesson_items`, `conversation_scenarios`, `vocab_sets` — 셋 다 `source`(seed\|ai)·`visibility`(public\|private)·`created_by` 완비 | 쓰기 API 전무(라우트는 전부 GET). 콘텐츠를 INSERT 하는 코드는 `ai-job.service.js` **한 곳뿐** |
| 묶음 | `topics` + `topic_contents` — 배타 FK(`num_nonnulls(lesson_id, scenario_id, vocab_set_id) = 1`), `position`, 타깃별 부분 UNIQUE | 토픽 생성·구성 API 없음(0014 마이그레이션에 SQL 시드 1건이 전부) → 13 |
| AI 생성 | `ai_jobs`(lesson_gen·scenario_gen·vocab_set) + 인프로세스 워커(동시 2) + 자동 검증(`validateGeneratedLesson`·`validateLcScript`) + `lesson_drafts` | `lesson_drafts.review_status`(draft/approved/rejected)를 **바꾸는 코드가 없다** = 검수 워크플로 미구현. 저장 시 `'private'` 하드코딩 → 12 |
| 리스닝 | 레슨 엔진 재사용 구조(`kind='toeic_lc'`, 스크립트는 `passage.body` 화자 라벨 배열, `jinaSpeak` 재생) — 08 Phase B | 저작 화면 → 13 |
| 스피킹 | `listSpeakingSentences` — LC 스크립트·시나리오 opening·레슨 vocab 예문에서 문장을 **파생**하는 뷰 | **콘텐츠 테이블 자체가 없다.** → 13 (플랜 10 실측 조건부) |
| 권한 | `users.is_admin`(0016), `/api/auth/me` DTO 에 포함, **`requireAdmin` 미들웨어는 플랜 10.5 Phase 1 산출물** | `/api/admin/*` 네임스페이스 |
| 클라이언트 | `index.html`(앱) · `canvas.html`(디자인 캔버스) 2엔트리 + `src/shared/*` 공유 패턴 확립 | admin 엔트리 |

## 2. 설계 결정

1. **게시 상태 축을 `status` 로 통일한다.** 지금 게시 상태를 나타내는 축이 이미 둘이다 —
   `lessons.published`(boolean)와 `visibility`(public\|private), 그나마 시나리오·단어 세트엔
   `published` 가 없다. 저작에는 "작성 중 / 검토 / 공개 / 내림" 4단계가 필요하므로
   `status TEXT (draft|review|published|archived)` 를 콘텐츠 3종 + `topics` 에 통일 도입한다
   (`speaking_sets` 는 13 에서 같은 모양으로).
   의미를 못 박는다: **`status` = 생명주기(작성자·관리자 관점), `visibility` = 누가 볼 수 있나(public 전체 / private 만든 사람).**
2. **두 축의 합법 조합을 DB 가 강제한다.** `status × visibility` 여덟 조합 중 의미 있는 것은
   `published + public`(카탈로그), `published + private`(개인 소유 — 지금 AI 생성물), 그리고
   `draft|review|archived + private` 뿐이다. **"공개 상태가 아닌데 public" 은 없다** —
   `CHECK (status = 'published' OR visibility = 'private')`. 없으면 12 의 검수 큐에서 `review + public`
   이 새어 나가는 순간 "승인 전에는 어떤 학습 API 에도 안 나온다" 가 깨진다.
3. **`lessons.published` 는 한 사이클 남기되 `status` 와 어긋날 수 없게 CHECK 로 묶는다** —
   `CHECK (published = (status = 'published'))`. 읽는 곳을 다 바꿔도 **쓰는 곳**이 남으면 두 축이 갈라지는데,
   이 제약이 있으면 `published` 만 세팅하는 옛 INSERT 가 시끄럽게 실패한다(조용히 갈라지는 대신).
   다음 사이클에 컬럼과 제약을 함께 지운다. 대안(바로 DROP, down.sql 로 복원)도 가능 — 열린 질문 5.
4. **새 행의 기본 `status` 는 `draft` 다.** 마이그레이션은 백필을 위해 `DEFAULT 'published'` 로 컬럼을 만들지만,
   백필 직후 `SET DEFAULT 'draft'` 로 바꾼다. 기본값이 `published` 면 `status` 를 빠뜨린 INSERT 가
   **즉시 공개**된다 — 워커의 저장 코드가 정확히 이 함정 위치다.
5. **가시성 조건은 단일 소스 `api/lib/content-scope.js` 로 뽑되, 헬퍼는 두 개다.**
   현재 `visibility = 'public' OR created_by` 조건이 **27곳**(topic 13 · lesson 10 · speaking 3 · ai-job 1),
   `published` 가 20곳에 흩어져 있다. 뽑지 않으면 "관리자가 내렸는데 어떤 화면엔 계속 보이는" 버그가 반드시 난다.
   그런데 **모든 쿼리가 같은 규칙을 원하지 않는다**:
   - `discoverable(alias, userParam)` — `status = 'published' AND (visibility = 'public' OR created_by = $n)`.
     목록·추천·토픽 구성·진행률 **분모**·새 시도 시작. "지금 학습할 수 있는 것".
   - `resolvable(alias, userParam)` — `status IN ('published','archived') AND (…같은 가시성…)`.
     오답 노트·통계·Q&A·이미 있는 attempt/session 의 상세. "이미 한 것의 근거".
     내린 레슨을 오답 노트가 조인에서 떨어뜨리면 **사용자의 오답이 사라진다**(원문 열린 질문 2) —
     이것은 열린 질문이 아니라 Phase 1 의 선결 규범이다: **archived 는 이력에는 남고, 새 시도만 막는다.**
   §3 표의 "헬퍼" 열이 쿼리마다 어느 쪽인지 지정한다. 저작 기능보다 이 정리가 먼저다(Phase 1 을 UI 없이 두는 이유).
6. **토픽 노출은 `status` 가 결정하고, `eligible` 임계치는 경고로 격하한다.**
   지금 `topicDto` 의 임계치(레슨 3 + 시나리오 1 + 단어 20)를 못 채운 토픽은 목록에서 아예 숨는다 —
   관리자가 토픽을 새로 만들면 **콘텐츠를 다 채우기 전까지 화면에 안 보여** 저작이 막힌다.
   임계치 계산은 유지하되(집계는 그대로 쓸모 있다) 필터가 아니라 admin 화면의 배지로 쓴다.
7. **admin 클라이언트는 별도 엔트리(`admin.html`)로 분리한다.** `canvas.html` 선례를 따른다.
   - 학습 앱 번들에 저작 UI가 섞이지 않는다(`index.html` 은 이미 script 21개 + babel standalone 런타임 컴파일).
   - 일반 사용자 브라우저에 admin 코드가 전달되지 않는다.
   - `APP_PAGES`(`app-nav.jsx` 단일 소스)에 손대지 않는다. 진입은 **설정 화면의 "콘텐츠 관리" 링크(새 탭)** 한 줄, `is_admin` 일 때만.
   - `admin.html` 자체에는 가드를 두지 않는다 — 인증을 클라이언트에 맡기지 않는다. 열려도 모든 `/api/admin/*` 이 403이면 빈 화면이다.
   - **비용을 적어 둔다**: HTML 진입점이 셋이 되고 `<script>` 태그 순서를 세 파일에서 수동 동기화한다.
     빌드 단계를 도입할 마지막으로 싼 시점이다(열린 질문 4).
8. **감사 흔적을 남긴다.** 콘텐츠 3종 + topics 에 `updated_by`,
   게시 전이는 `content_audit_log`(누가·무엇을·언제·어디서 어디로)에 append-only 로 기록한다.
   append-only 이므로 **행위자 계정이 지워져도 로그는 남아야 한다** — `actor_id` 는 `ON DELETE SET NULL`
   (원문 초안의 `CASCADE` 는 관리자 삭제 = 감사 기록 삭제였다).
   콘텐츠 본문 리비전(되돌리기)은 v1 범위 밖 — 열린 질문 3.
9. **`requireAdmin` 은 만들지 않고 쓴다.** 플랜 10.5 Phase 1 이 `api/middleware/auth.js` 에 추가한다.
   10.5 가 아직이면 이 플랜의 Phase 1 에서 같은 정의로 먼저 만들고 10.5 는 그것을 승계한다(정의는 하나).

## 3. 표시부 변경 목록 — 저작과 같은 크기의 작업

`status` 축이 들어가는 순간 학습 화면 쪽 조회가 전부 바뀐다. Phase 1에서 **한 번에** 처리한다.
"헬퍼" 열은 결정 5 의 두 헬퍼 중 어느 쪽인지다 — **표에 없는 쿼리를 만나면 먼저 이 열을 채운다.**

| 파일 | 지금 | 바뀌는 것 | 헬퍼 | 놓치면 생기는 일 |
|---|---|---|---|---|
| `api/lib/content-scope.js` | (없음) | `discoverable` / `resolvable` 신설 — 조건 문자열을 만드는 단일 소스 | — | — |
| `api/services/topic.service.js` | 가시성 조건 13곳(`TOPIC_SUMMARY`·`getTopic` 4쿼리·진행률 CTE 3개) | 전부 헬퍼 경유. **진행률 CTE 분모도 같은 규칙**(이미 주석으로 명시된 규범) | 목록·상세·분모: discoverable | 내린 콘텐츠가 진행률 분모에 남아 100%가 안 됨 |
| 〃 `topicDto` | `eligible` 로 목록 필터 | 필터는 `status`, `eligible` 은 DTO 필드로만 유지(경고 배지용) | discoverable | 관리자가 만든 빈 토픽이 안 보여 저작 불가(결정 6) |
| `api/services/lesson.service.js` | 가시성 10곳 + `l.published` 4곳(목록·추천·오답·Q&A) | 헬퍼 경유. `published` → `status` | 목록·추천·attempt 시작: discoverable / 오답 노트·Q&A·attempt 상세: **resolvable** | 내린 레슨을 추천이 계속 노출 · 또는 반대로 오답 노트에서 사용자의 오답이 사라짐 |
| `api/services/progress.service.js`, `dashboard.service.js` | 레슨 조인에 `published` 조건 | 헬퍼 경유 | **resolvable** (이미 푼 것의 집계) | 내린 레슨의 점수가 통계에서 증발 |
| `api/services/speaking.service.js` | 가시성 3곳, LC/시나리오/vocab 파생 | 조건만 헬퍼 경유(재작성은 13) | discoverable | — |
| `api/services/ai-job.service.js` | `assertTopicAccess` 1곳, 저장 시 `'private'` 하드코딩 | 헬퍼 경유. 저장은 `status` 명시(`'published'`+`'private'` — 지금 동작 유지). `publish_target` 은 12 | discoverable | 기본값 함정(결정 4) — `status` 안 쓰면 draft 로 저장돼 사용자가 자기 생성물을 못 봄 |
| `src/screens/topics.jsx` | 목록/상세 렌더 | 빈 상태 문구. `eligible` 배지는 앱에서는 렌더하지 않는다(관리자 화면 전용) | — | — |
| `src/screens/listening.jsx` | `GET /api/lessons?kind=toeic_lc` | 쿼리 그대로 동작 | — | — |
| 설정 패널 (05 플랜 화면) | 계정·테마·AI·STT 4섹션 | `is_admin` 일 때 "콘텐츠 관리 열기"(`admin.html`, 새 탭) 1줄 | — | — |
| `db/migrate.mjs` `RESET_TABLES` | 22개 목록 | `content_audit_log` 추가(FK 역순 유지, `FOREIGN_TABLES` self-assert 통과 확인) | — | reset 이 새 테이블을 남겨 다음 마이그레이션이 깨짐 |

## 4. Phase 플랜

### Phase 1 (3~4일) — 상태 축 + 헬퍼 2종 + 표시부 정리 (**UI 없음**)

| 산출물 | 세부 |
|---|---|
| 마이그레이션 `0017_content_status.sql` | 아래 §5 SQL. `lessons.published` → `status` 백필, 기존 행은 전부 `published`, 이후 기본값 `draft`, 정합성 CHECK 2종 |
| `api/lib/content-scope.js` | `discoverable` / `resolvable`. 27+20곳을 여기로 — §3 "헬퍼" 열대로 |
| `requireAdmin` | 10.5 Phase 1 산출물 사용(결정 9) |
| 표시부 일괄 수정 | §3 표 전부 |
| 검증 `scripts/verify-content-status.mjs` | 아래 세 묶음 |

**검증 — 무회귀만으로는 부족하다.** 백필로 기존 행이 전부 `published` 가 되므로 "마이그레이션 전후 목록 결과 동일" 은
새 헬퍼가 `status` 를 **아예 무시하는 버그**가 있어도 통과한다. Phase 1 에는 쓰기 API 가 없으니 스크립트가 DB 에 직접
픽스처를 심는다(`e2e-topics.mjs` 의 DB 직접 접근 선례).

1. **무회귀** — 마이그레이션 전후 `GET /api/lessons`·`/api/topics`·`/api/dashboard`·`/api/progress`·`/api/mistakes` 응답 동일.
2. **음성 픽스처** — 레슨·시나리오·단어 세트·토픽 각 1행을 `draft`, 1행을 `archived` 로 INSERT(public, 다른 사용자 소유).
   - `draft` 는 **모든** 학습 API 에서 0건(목록·추천·토픽 상세·진행률 분모·오답 노트·통계).
   - `archived` 레슨에 기존 attempt 를 심어 두면 **오답 노트·통계에는 남고**(resolvable), 목록·추천·분모에서는 빠진다(discoverable).
     이 한 줄이 결정 5 의 검증이다.
   - `review + public` INSERT 시도 → CHECK 위반(결정 2). `published = true, status = 'draft'` INSERT 시도 → CHECK 위반(결정 3).
   - `status` 생략 INSERT → `draft` 로 저장(결정 4).
3. **권한** — 비관리자 `/api/admin/*` 전부 403(라우트는 Phase 2 지만 네임스페이스 가드는 여기서 선등록).

완료 판정: 기존 e2e(`e2e-lesson`·`e2e-dashboard`·`e2e-plan08-screens`·`e2e-topics`) 전부 무회귀 + 위 검증 스크립트 통과. **UI 변경 0.**

### Phase 2 (3일) — `admin.html` 최소 관리 UI (제작 아님, **관리부터**)

```
┌ Jina 콘텐츠 관리 ─────────────────────────────── admin ─┐
│ [토픽] [리스닝] [스피킹] [회화] [단어]                       │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 상태  제목                     유형   문항  수정일     │ │
│ │ ●공개 TOEIC LC — 짧은 대화 Set1  LC     3   09-01  [▾] │ │
│ │ ○초안 비즈니스 이메일 Set 24     Part7  3   09-02  [▾] │ │
│ │ ◐검토 (AI) 면접 표현 20          단어   20  09-03  [▾] │ │
│ └─────────────────────────────────────────────────────┘ │
│ [▾] = 공개 / 내림 / 미리보기                              │
└───────────────────────────────────────────────────────┘
```

[+ 새로 만들기]·삭제는 이 Phase 에 없다 — 만들기는 13, 검수는 12. 여기서는 **있는 것을 내리고 올리는 것**만.

| 산출물 | 세부 |
|---|---|
| `admin.html` | `index.html` 과 같은 뼈대. `src/shared/` 의 tokens·icons·api-client·auth-store 재사용, 학습 화면은 로드하지 않는다 |
| `src/admin/admin-app.jsx` · `content-store.jsx` | 유형 탭 · 목록 · 상태 전이. `is_admin` 아니면 안내 화면 |
| `api/routes/admin.routes.js` | `GET /api/admin/contents?type=&status=`, `POST /api/admin/contents/:type/:id/status {to}` — 전이는 `content_audit_log` 에 기록(트랜잭션) |
| `server.js` | `admin.html` 정적 서빙(기존 deny-list 유지). `/config.js` 는 그대로 |
| 설정 패널 링크 | `is_admin` 일 때만 |

완료 판정: 관리자가 기존 콘텐츠를 **내리고 다시 올릴 수 있고**, 내린 즉시 학습 화면 목록·추천·진행률 분모에서 사라지되
그 레슨을 이미 푼 사용자의 오답 노트·통계에는 남는다(§3 검증). 비관리자는 목록 API 403. 전이마다 감사 로그 1행.

## 5. 구현자 메모

### 마이그레이션 `0017_content_status.sql` 초안

```sql
-- 상태 축 통일. 기존 행은 전부 published 로 백필한다(무회귀가 Phase 1 완료 판정의 첫 묶음).
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

-- lessons.published → status 이관. 컬럼은 한 사이클 남기되 어긋날 수 없게 묶는다(결정 3).
UPDATE public.lessons SET status = 'draft' WHERE NOT published;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_published_status_ck CHECK (published = (status = 'published'));

-- 결정 2: 공개 상태가 아닌데 public 인 행은 없다. 백필 후 CHECK. (영향 행 수를 verify 가 기록한다)
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lessons','conversation_scenarios','vocab_sets','topics'] LOOP
    EXECUTE format('UPDATE public.%I SET visibility = ''private'' WHERE status <> ''published'' AND visibility = ''public''', t);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (status = ''published'' OR visibility = ''private'')',
                     t, t || '_status_vis_ck');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    -- 결정 4: 백필이 끝났으니 새 행의 기본값은 draft.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN status SET DEFAULT ''draft''', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS lessons_status_idx    ON public.lessons (position, id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS scenarios_status_idx  ON public.conversation_scenarios (id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS vocab_sets_status_idx ON public.vocab_sets (id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS topics_status_idx     ON public.topics (created_at, id) WHERE status = 'published';

-- 게시 전이 감사 로그 (append-only). 행위자가 지워져도 로그는 남는다(결정 8) — CASCADE 금지.
CREATE TABLE IF NOT EXISTS public.content_audit_log (
  id           BIGSERIAL   PRIMARY KEY,
  actor_id     BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
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

`speaking_sets` 와 `topic_contents` 배타 FK 확장은 **13 의 `0018`** 로 옮겼다(`content_type` CHECK 에 `speaking_set` 을
미리 넣어 두는 것은 무해). `db/migrate.mjs` 의 `RESET_TABLES` 에 `content_audit_log` 를 **FK 역순**으로 추가하고,
`FOREIGN_TABLES` self-assert(기존 앱 테이블 11개 불가침)를 통과하는지 확인한다.

### API 표면 (이 플랜 범위)

```
GET    /api/admin/contents?type=lesson|scenario|vocab_set&status=
POST   /api/admin/contents/:type/:id/status     { to: 'published' | 'archived' | 'draft' }
```

생성·수정(`POST`/`PATCH …/:type`)은 13, `drafts` 는 12. 전 경로 `requireAdmin`. 변경 요청은 기존 `X-Requested-With: jina`
CSRF 규칙을 그대로 탄다.

### 먼저 하지 말 것

- 새 콘텐츠 엔진 — 리스닝은 레슨 엔진 재사용(08 §2.3), 저작도 같은 테이블에 쓴다.
- 만들기·삭제 UI — 13. 검수 큐 — 12.
- 콘텐츠 본문 리비전/되돌리기 — 감사 로그는 **상태 전이만** 남긴다(열린 질문 3).
- 관리자 역할 세분화(에디터/리뷰어 등) — `is_admin` 단일 플래그로 시작한다.
- `admin.html` 을 학습 앱 라우팅(`APP_PAGES`)에 편입하는 것(결정 7).

## 6. 열린 질문

1. ~~AI 검수 승인 시 `visibility`~~ → 12 로 이동.
2. ~~`archived` 콘텐츠와 학습 이력~~ → **결정 5 로 확정**(이력에는 남고 새 시도만 막는다). 남은 세부: archived 레슨의
   오답 카드에서 "다시 풀기" 버튼을 숨길지, 눌렀을 때 안내를 띄울지.
3. **본문 리비전** — 공개된 콘텐츠를 수정했을 때 되돌릴 수단. v1은 감사 로그(상태 전이)만 남기고 본문 스냅샷은 두지 않는다.
4. **빌드 단계** — `admin.html` 로 HTML 진입점이 셋이 된다. 이 시점에 번들러를 들이지 않으면 13 의 에디터까지 Babel
   런타임 컴파일 위에 쌓인다. 결정 7 의 비용 항목.
5. **`lessons.published` 처리** — CHECK 로 묶어 한 사이클 유지(결정 3) vs 0017 에서 바로 DROP(down.sql 로 복원).
   전자는 옛 쓰기 코드를 시끄럽게 잡고, 후자는 축이 하나라 단순하다.
6. **seed 콘텐츠와 마이그레이션** — 시드 콘텐츠는 SQL 마이그레이션 안에 있고 그 파일은 체크섬으로 불변이다. 관리자가
   시드 행의 `status` 를 바꾸는 것(이 플랜)은 데이터 변경이라 무해하지만, 13 에서 **본문**을 고치면 `db:reset` 한 번에
   사라진다. 저작이 들어오는 순간 콘텐츠는 스키마가 아니라 데이터여야 한다 — 시드를 마이그레이션에서 꺼내
   export/import 스크립트로 옮기는 결정을 13 착수 전에 한다(13 열린 질문 1).
