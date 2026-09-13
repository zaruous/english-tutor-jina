---
# status: draft | in_progress | done · phase.status: done | pending_verification | todo
plan: "14"
title: "관리자 콘텐츠 ④ — 만들기 진입점 · AI 초안 요청 · 레슨 에디터 확장 · 회화/단어 에디터"
status: in_progress
group:
  id: admin-content
  title: "관리자 콘텐츠 저작·관리"
  members: ["11", "12", "13", "14"]
  order: 4
created: 2026-09-13
updated: 2026-09-13
depends_on: ["12", "13"]
migrations: []
phases:
  - { id: A, name: "콘텐츠 탭 정리 — '토픽' 칩 400 제거 · '새로 만들기' 진입점 · 에디터 라우트 셋", status: done, done_at: 2026-09-13, note: "위임 없이 직접. content-store/admin-app/admin.html + 스텁 3파일" }
  - { id: B, name: "AI 초안 요청 패널(검수 탭) — lesson_gen·scenario_gen·vocab_set 을 catalog 로 · 선행 결함 2건(LC script 뭉개짐·LC count 2 스키마) 수정", status: todo }
  - { id: C, name: "LC 에디터 확장 — toeic_part5 kind · 문항 추가/삭제 · 권장 범위 경고", status: todo }
  - { id: D, name: "회화·단어 세트 수기 에디터 + 저작 API 3종 확장(AUTHORING_TYPES) · 검증기 추출", status: todo }
verify: ["scripts/e2e-admin-authoring-2.mjs (신규)", "scripts/e2e-admin-authoring.mjs (회귀)", "tests/admin-scenario-authoring.test.mjs · tests/admin-vocab-authoring.test.mjs · tests/ai-normalize-lc.test.mjs (신규)", "npm run verify:draft-review · verify:content-status (회귀)"]
follow_ups:
  - "Part 5 빈칸 `_____` 을 검증기 규칙으로 승격 — 생성 프롬프트(LESSON_GEN_SYSTEM)에 같은 지시를 넣는 것과 동시에만"
  - "문항 수 실전 규격(LC 2~4 · Part 5 3~10)을 저작에도 강제할지 — 이번엔 비차단 경고"
  - "published 레슨의 문항 수 변경과 과거 attempt(answers 가 position 키) 정합 — 이번엔 경고 문구만"
  - "관리자 전체 AI 작업 목록(/api/ai-jobs 는 user_id 스코프) — 필요 시 admin 라우트"
  - "speaking_set 에디터 — 플랜 13 Phase C 게이트 그대로"
---

# 14 — 관리자 콘텐츠 ④: 만들기 진입점 · AI 초안 요청 · 레슨 에디터 확장 · 회화/단어 에디터 (2026-09-13)

11 → 12 → 13 이 main 에 들어간 직후 관리 화면을 실제로 열어 보니 **콘텐츠를 "추가하고 채우는" 길이 거의 없었다.**
콘텐츠 탭은 스스로 "이 화면은 내리고 올리는 것만 한다" 라고 적어 두었고, 레슨 신규는 주소를 직접 쳐야 들어가며,
회화·단어는 에디터가 없고, AI 초안 생성은 학습 앱 레슨 목록에서 '카탈로그' 라디오를 골라야만 검수 큐로 온다.
그리고 콘텐츠 탭의 '토픽' 유형 칩은 서버가 받지 않는 `type=topic` 을 보내 400 을 돌려받는 잔재였다.

이 플랜은 그 네 가지를 한 번에 닫는다. 새 테이블·마이그레이션은 없다. 서버 변경은 (a) 저작 API 를 회화·단어로 넓히는 것,
(b) AI 초안 파이프라인의 선행 결함 2건, (c) jobDto 에 hint 를 싣는 것, (d) Part 5 지문 기본값 — 네 가지뿐이다.

## 0. 무엇이 없었고, 무엇을 만든다

| 유형 | 새로 만들기 | 채우기·수정 | AI 초안 요청 | 이 플랜 후 |
|---|---|---|---|---|
| 레슨 LC · Part 7 | URL 직접 입력만 | LC 에디터(최소형, 문항 3 고정) | 학습 앱에서만 | 버튼 진입 · 문항 추가/삭제 |
| 레슨 Part 5 | 없음(kind 목록에 없음) | 없음 | 학습 앱에서만 | 에디터 kind 추가 |
| 회화(scenario) | 없음 | 없음 | 서버 task 만 있고 UI 없음 | 에디터 + 저작 API + AI 요청 |
| 단어(vocab_set) | 없음 | 없음 | 서버 task 만 있고 UI 없음 | 에디터 + 저작 API + AI 요청 |
| 스피킹(speaking_set) | 없음 | 없음 | 없음 | 그대로(13 Phase C 게이트) |
| 토픽 | 토픽 탭 '새 토픽' | 구성 화면 | 해당 없음 | 콘텐츠 탭의 죽은 칩 제거 |

정찰(4갈래 병렬, 2026-09-13)에서 코드로 확인한 전제 — 설계는 전부 이 위에 서 있다:

- 저작 API(`api/services/admin-authoring.service.js`)는 **kind `toeic_part5` 를 이미 받는다**(LESSON_KINDS · PASSAGE_DEFAULTS).
  막힌 곳은 `src/admin/editors/lc.jsx` 의 `ADMIN_LC_KINDS` 뿐이다. 문항 수도 서버는 1~50 이고 3 고정은 UI 상수다.
- Part 5 레슨의 passage 는 안내문 1줄짜리 문자열 배열이고(`{type:'PART 5', subject:'Incomplete Sentences', body:['Choose the …']}`),
  빈칸은 stem 안의 `_____`(언더스코어 5개) 관례다. **규칙으로 강제하는 곳은 어디에도 없다.**
- 회화·단어는 `content_items` + 1:1 detail(`scenario_details` / `vocab_set_details.words JSONB`) 이고 조인 테이블·FK 가 없어
  words 통째 교체가 안전하다. 검증기는 `saveGenerated{Scenario,VocabSet}` 안의 inline `if` 뿐이라 **export 된 것이 없다.**
- AI 초안: `POST /api/ai-jobs` 는 세 task 를 이미 받고 catalog 는 `review/private/ai` 로 저장돼 검수 큐에 뜬다. 그런데
  **① `api/ai/normalize.js` 가 LC script 의 `{speaker,text}` 를 `String(line)` 으로 뭉개** 워커 LC 생성이 항상 VALIDATION_FAILED 이고,
  **② `LESSON_GEN_LC_SCHEMA` 가 items minItems 3 을 상속**해 허용된 count=2 가 SCHEMA_VIOLATION 이다(둘 다 node 로 재현).
- `jobDto.error` 에 hint 가 없어 Ollama 미기동(CLI_NOT_FOUND)이 화면에서 "fetch failed" 로만 보인다.
- `content_revisions` 는 저장소 어디에도 없다. 감사는 `content_audit_log` 1행이 전부다.

## 화면 미리보기

HTML 목업은 만들지 않았다(11·12·13 은 `docs/plan/mockups/` 에 있음). 새 화면은 전부 **기존 화면의 문법을 그대로 잇는다** —
AI 패널은 검수 큐 헤더 아래 접이식, 에디터 둘은 `editors/lc.jsx` 의 레이아웃(좌 메타 · 우 본문 · 하단 오류 띠 · 저장/목록).

```
콘텐츠 탭 (Phase A — 완료)
┌──────────────────────────────────────────────────────────────────────┐
│ [전체] [레슨] [스피킹] [회화] [단어]                                    │  ← '토픽' 칩 제거
│ 콘텐츠  9개                                    [＋ 새로 만들기 ▾]      │
│                                                 ├ 레슨 (LC · Part 7 · Part 5)
│                                                 ├ 회화 시나리오
│                                                 ├ 단어 세트
│                                                 └ AI 초안 요청 → 검수 큐
│ 상태  제목                 공개   유형  문항  만든이  수정일  [▾]      │
│ ● 공개 STAR 방식 영문 면접   공개   회화   —    seed   09-05  [▾ 수정] │  ← 회화·단어도 '수정' 활성
└──────────────────────────────────────────────────────────────────────┘

검수 탭 (Phase B) — #/review/new 로 들어오면 패널이 열린 채 시작
┌──────────────────────────────────────────────────────────────────────┐
│ AI 초안 검수  대기 2건            [제목 검색] [새로고침] [✦ AI 초안 요청]│
│ ┌ AI 초안 요청 ──────────────────────────────────────────────────────┐│
│ │ 유형  (●레슨)(○회화)(○단어)   파트 (●Part 5)(○LC)  문항 [5 ▾]     ││
│ │ 주제 [비즈니스 이메일 작성          ] 난도 [3 ▾]  토픽 [없음 ▾]     ││
│ │ 공급자 [ollama · gemma4 ▾]                    저장 대상: 검수 큐(catalog) ││
│ │ [요청]   ⏳ #123 running · 12s … / ✔ 검수 큐에 들어왔습니다 · 열기  ││
│ │          ✖ Ollama에 연결할 수 없습니다 — `ollama serve` 가 실행 중인지… ││
│ └────────────────────────────────────────────────────────────────────┘│
│ [목록] │ [상세: 생성 결과 · 승인 전 수정 · 승인/반려]                  │
└──────────────────────────────────────────────────────────────────────┘

회화 에디터 (Phase D) — #/edit/scenario/new | :id
┌────────────────────────────┬─────────────────────────────────────────┐
│ ← 목록      회화 시나리오   │ 역할·진행 지침 (system_prompt)          │
│ 제목  [                 ]  │ [You are a supportive English …       ] │
│ 설명  [                 ]  │ 첫 대사 (opening_message)               │
│ 태그  [BUSINESS INTERVIEW] │ [Tell me about a time you …           ] │
│ 난도  ○1 ○2 ●3 ○4 ○5      │ 학습 목표 (2~5)             [＋ 목표]   │
│ 상태 ● 초안 · 비공개       │  1 [STAR 구조로 60초 답변하기      ] [×] │
│                            │  2 [성과를 수치로 설명하기          ] [×] │
├────────────────────────────┴─────────────────────────────────────────┤
│ ⚠ objectives[1] 이 비어 있습니다.  (422 validation_errors 그대로)      │
│                                                    [저장]  [목록]      │
└──────────────────────────────────────────────────────────────────────┘

단어 세트 에디터 (Phase D) — #/edit/vocab_set/new | :id
┌────────────────────────────┬─────────────────────────────────────────┐
│ ← 목록      단어 세트       │ 단어 18개  ⚠ 20개가 아니면 토픽 임계·'20단어 담기' 라벨과 어긋남 │
│ 제목  [                 ]  │  # word          pos  ipa   meaning_ko  ex_en  ex_ko  난도 [×] │
│ 설명  [                 ]  │  1 [accomplish…] [n.] [   ] [성과, 업적] [  ] [  ] [3]  [×] │
│ 난도  ○1 ○2 ●3 ○4 ○5      │  2 [collaborate] [v.] [   ] [협업하다  ] [  ] [  ] [3]  [×] │
│ 상태 ● 초안 · 비공개       │  …                                            [＋ 단어] │
├────────────────────────────┴─────────────────────────────────────────┤
│ ⚠ words[7].meaning_ko 가 비어 있습니다. · words[12].word 가 중복입니다. │
│                                                    [저장]  [목록]      │
└──────────────────────────────────────────────────────────────────────┘

LC 에디터 (Phase C) — 문항 섹션만 바뀐다
│ 문항 5개  권장 Part 5 3~10                             [＋ 문항]      │
│ ┌ 1 ─────────────────────────────────────────────────────── [×] ┐   │
│ │ 문제 [Ms. Rivera has _____ three projects …]  ⚠ `_____` 없음   │   │  ← Part 5 만, 비차단
```

## 1. 설계 결정

### A — 콘텐츠 탭 (완료)

1. **'토픽' 칩은 제거한다. 서버에 topic 분기를 넣지 않는다.** 토픽은 `content_items` 가 아니라 `topics` 테이블이고 이미 별도 탭·API(`/api/admin/topics`, `editors/topic.jsx`)가 있다.
   한 목록에 섞으면 [▾] 전이·공개 칩이 전부 `/api/admin/contents/topic/…` 으로 가서 같은 400 을 만든다. 칩을 참조하는 테스트·e2e 는 없다(grep 0건).
2. **'새로 만들기' 는 콘텐츠 탭 헤더의 드롭다운 하나**(레슨 · 회화 · 단어 · AI 초안 요청). `canAuthor` 일 때만 그린다 — learner 에게 눌러도 403 만 보는 버튼을 보여 줄 이유가 없다.
   권한 판정 자체는 서버(에디터·큐의 author 게이트)가 한다.
3. **에디터 해시는 DB 의 type 문자열을 그대로 쓴다** — `#/edit/lesson|scenario|vocab_set/new|:id`. 라우터(`adminRouteFromHash`)·`adminGoto`·review-queue 의 '승인 전 수정'·e2e 셀렉터가
   한 문자열을 공유해야 하므로 `vocab` 같은 별칭을 두지 않는다. 표는 `ADMIN_EDIT_ROUTES` 한 곳. `speaking_set` 은 표에 없어 '수정' 이 흐리게 남는다.
4. **AI 초안 요청의 주소는 `#/review/new`** — 검수 큐를 열고 패널을 펼친 상태. 새 탭을 만들지 않는다: 요청의 결과가 곧 큐의 새 행이라 큐 옆에 있어야 한다.
5. 유형 칩의 카운트 코드는 **죽은 코드**였다 — 서버 `counts` 는 status 키(초안·검토·공개·내림)인데 type 키로 읽어 항상 undefined. 제거했다. 유형별 수가 필요하면 서버부터.

### B — AI 초안 요청

1. **선행 결함 2건은 이 플랜이 고친다.** ① `api/ai/normalize.js` `normalizeLessonGen` 의 script 정규화를 객체형(`{speaker, text}`)으로 —
   문자열이면 옛 포맷 그대로(라벨 파싱은 하지 않는다: 10.7 이 그 코드를 없앤 이유를 되살리지 않는다). ② `LESSON_GEN_LC_SCHEMA.items` 를 `minItems 2 · maxItems 4` 로 덮어
   `normalizeJobInput` 의 LC count 2~4 와 맞춘다. 둘 다 `tests/ai-normalize-lc.test.mjs` 로 잠근다(AI 호출 없이 `validateAgainst`·`normalizeLessonGen` 단위).
2. **`jobDto.error` 에 `hint` 를 싣는다** — `hintFor(error_code, provider)`(`api/lib/errors.js`). 안내 문구의 단일 소스를 서버에 둔다. 화면에 code→문구 표를 따로 만들지 않는다.
3. **패널은 검수 큐 헤더의 토글 + 헤더 아래 접이식.** 파일은 `src/admin/ai-draft.jsx`(전역 `AdminAiDraftPanel({ theme, me, onSucceeded })`), review-queue 가 렌더 시점에 `typeof` 로 확인해 그린다.
   `publish_target` 은 **`catalog` 고정**(personal 라디오 없음 — 관리자의 개인 레슨은 이 화면의 일이 아니다).
4. 필드 — 유형 칩(레슨·회화·단어) / 레슨: 파트(Part 5 · LC), 문항 수(Part 5 `[3,5,7,10]` 기본 5 · LC `[2,3,4]` 기본 3), 난도 1~5 / 회화: 난도, 주제(필수) / 단어: 주제(필수), "20개 고정" 표기 /
   공통: 주제(≤80자), 토픽(선택 — `GET /api/admin/topics` 중 **`status=published` 만** 선택지: `assertTopicAccess` 가 discoverable 기준이라 내린 토픽은 404), 공급자(`GET /api/ai/providers`, 기본은 서버 기본값; 실패하면 셀렉트를 숨기고 본문에서 생략).
   `client_request_id` 는 제출마다 새 UUID.
5. 진행 — 202 후 1.5초 간격 `GET /api/ai-jobs/:id`, 5분 데드라인(넘으면 "서버에서 계속 진행됩니다 — 새로고침으로 확인"). 종료 상태 **둘(succeeded/failed)을 모두** 처리한다.
   `reused:true` 면 "같은 조건의 기존 작업(#id)을 재사용했습니다 — 새 초안이 필요하면 주제를 바꾸세요" 를 띄운다(멱등 재사용은 서버 규칙).
   `VALIDATION_FAILED` 는 `job.result.validation_errors` 를 패널 안에 그대로 나열한다 — 이 초안은 `lesson_drafts` 에만 남고 **검수 큐에 뜨지 않는다**("큐에서 확인하세요" 는 틀린 안내).
   성공하면 `onSucceeded(job)` → 큐 `load()` 뒤 `job.result.{lesson_id|scenario_id|vocab_set_id}` 를 선택.
6. **'승인 전 수정' 을 회화·단어로 넓힌다** — `#/edit/<type>/:id?from=review`. 플랜 12 follow_up("승인 전 초안 수정 → 에디터")의 나머지 절반.

### C — LC 에디터 확장

1. `ADMIN_LC_KINDS` 에 `toeic_part5` 추가. Part 5 의 지문 칸은 **"안내문" 한 줄(선택)** — 비워 두면 서버가 생성 경로와 같은 기본 안내문(`Choose the word or phrase that best completes each sentence.`)을 채운다
   (`normalizePassage`: kind 가 `toeic_part5` 이고 body 가 비면 기본값 — 지금은 400 '지문이 없습니다'). Part 7 은 그대로 문단 textarea.
2. **문항 추가/삭제.** 하한 1(마지막 문항은 삭제 불가 — 서버가 0 개를 400 으로 거부), 상한은 서버의 50 그대로. kind 별 **권장 범위는 비차단 경고 칩**(LC 2~4 · Part 5 3~10 · Part 7 2~10) —
   "저작은 화면이 보낸 수 그대로" 라는 기존 서버 주석(결정 2, 규칙 단일 소스 = 검증기)을 바꾸지 않는다. 신규 기본 문항 수는 kind 기본값(LC 3 · Part 5 5 · Part 7 3).
3. **Part 5 stem 에 `_____` 이 없으면 비차단 경고.** 검증기에 넣지 않는다 — 생성 프롬프트에 같은 지시가 없어 AI 초안이 전부 422 로 떨어진다(FOLLOWUPS 의 "해설 정답 표기" 함정과 같은 구조). follow_up.
4. React key 는 클라이언트 `uid`(추가 시 부여), `data-testid` 는 **인덱스 기준 유지**(`lc-item-N-*`) — 삭제 뒤 인덱스가 당겨지는 것이 e2e 가 기대하는 모양이다.
5. published/archived 레슨에서 문항 수를 바꾸면 **경고 문구** — `user_lesson_attempts.answers` 가 position 키라 옛 오답이 다른 stem 에 붙을 수 있다. 서버는 바꾸지 않는다(follow_up).
6. `vocab`·`faq` 는 지금처럼 폼 상태로 들고 다닌다 — 요청에서 빠지면 `[]` 로 덮인다(서버 normalize).

### D — 회화·단어 에디터 + 저작 API

1. **검증기를 추출해 export 한다** — `validateGeneratedScenario(data) → string[]`, `validateGeneratedVocabSet(data, { expectedCount } = {}) → string[]` (`api/services/ai-job.service.js`).
   생성 경로(`saveGenerated*`)는 같은 함수를 부르고 오류가 있으면 **지금처럼 502 VALIDATION_FAILED** 를 던진다(문구·코드 유지, `tests/draft-review.test.mjs` 무회귀). 저작 경로는 422 로 돌려준다(플랜 13 결정 2 거울).
2. **저작 서비스는 레슨 경로의 거울** — `normalize{Scenario,VocabSet}Input`(400) → `assertValid`(422) → `withTx`: `uniqueSlug` → `INSERT content_items(type, slug, title, description, difficulty, 'draft', 'private', 'curated', created_by)`
   → detail → `writeAudit('create', null→'draft')`. update 는 `FOR UPDATE` → type 불일치 **404** → published/archived 는 **reviewer 게이트 403** → `seed→curated` → UPDATE content_items(title, description, difficulty, source, updated_*) → detail 통째 교체 → `writeAudit('update')`.
   레슨과 다른 점 하나: **`description` 컬럼을 쓴다**(학습 화면 카드·검수 큐가 그린다). `slugify` 폴백은 `${type}-${Date.now()}` (지금은 `lesson-` 고정).
3. **회화 필드·제약** — title 1~200 · description ≤500 · tag ≤60(비면 `'AI 회화'`) · **난도 1~5 하나**가 `content_items.difficulty` 와 `scenario_details.level` 에 같은 값(AI 경로와 동일; 시드는 level 만 있고 difficulty 는 기본 3 — 열린 질문 1)
   · system_prompt 1~4000 · opening_message 1~1000 · objectives **2~5개**, 각 1~200(AI 스키마와 동일).
4. **단어 세트 필드·제약** — title · description ≤500 · difficulty 1~5(기본 3) · words **1~50** 행, 행 = `{ word 1~64(trim, 대소문자 보존), pos ≤16, ipa ≤64, meaning_ko 1~200, example_en ≤400, example_ko ≤400, difficulty 1~5(기본 3) }`.
   필수는 **word·meaning_ko** 만(시드는 세 필드뿐이고 소비자 전부 나머지를 선택 취급). `lower(word)` 중복은 **422**(진행률 분모가 DISTINCT lower 라 중복이 있으면 eligible 배지와 어긋난다). 20개가 아니면 **UI 경고**(토픽 임계 20 · 학습 화면 '20단어 담기' 라벨) — 서버는 막지 않는다. 생성 경로만 `expectedCount: 20`.
5. **라우트** — `AUTHORING_TYPES = ['lesson','scenario','vocab_set']`, 세 경로를 type → `{ read, create, update }` 맵으로 분기. 응답 키는 **유형별**(`{ lesson }` · `{ scenario }` · `{ vocab_set }`) — 기존 테스트가 `{ lesson }` 을 단정한다.
   `oneOf(type)` 400 → 서비스 404 순서를 레슨과 같게 유지(다른 유형 id 탐색 통로를 열지 않는다).
6. **풀(`vocab_words`) 등록은 하지 않는다** — catalog 생성 경로와 같은 규범. 등록은 학습자 '담기' 가 `source='lesson'` 으로 한다. `vocab_words.source` CHECK 에 `curated` 도 없다.
7. **422 문구 접두** — 회화 `objectives[N] …`, 단어 `words[N].word|meaning_ko|… …`, 접두 없는 것은 title·system_prompt·opening_message·description·개수 오류. 에디터는 `/^(objectives|words)\[(\d+)\]/` 로 줄을 붉게 칠한다(lc.jsx 의 `script|items` 규칙과 같은 모양).
8. 관리자 읽기 DTO 에만 `system_prompt` 를 싣는다 — 학습자 `listScenarios` 는 의도적으로 빼고 있다(레슨 answer 경계와 같은 규범).
9. 시나리오 `system_prompt` 수정은 진행 중 세션에 **즉시 반영**된다(매 전송마다 라이브 조회). 그대로 둔다 — published 편집을 reviewer 로 묶는 게이트가 방어선이고, 세션 스냅숏 변경은 범위 밖(열린 질문 6).

## 2. Phase 플랜

### Phase A (완료, 직접) — 콘텐츠 탭 정리
| 항목 | 내용 |
|---|---|
| 파일 | `src/admin/content-store.jsx` · `src/admin/admin-app.jsx` · `admin.html` · 스텁 `src/admin/ai-draft.jsx` · `src/admin/editors/scenario.jsx` · `src/admin/editors/vocab.jsx` |
| 한 것 | 토픽 칩 제거 · 죽은 카운트 제거 · `ADMIN_EDIT_ROUTES` · `#/edit/<type>/…`·`#/review/new` 라우팅 · `AdminNewMenu` · [▾] '수정' 3종 활성 · `AdminShell` 분기 3종 + `openAi` |
| 확인 | 3003 에서 칩 부재·버튼·메뉴 4항목·스텁 화면 렌더, 콘솔 오류 favicon 404 만 |

### Phase B — AI 초안 요청 패널
| 항목 | 내용 |
|---|---|
| 서버 | `api/ai/normalize.js`(LC script 객체) · `api/ai/schemas.js`(LC items 2~4) · `api/services/ai-job.service.js`(`jobDto.error.hint`) |
| 화면 | `src/admin/ai-draft.jsx`(신규) · `src/admin/review-queue.jsx`(토글·패널·`openAi`·'승인 전 수정' 3종) |
| 테스트 | `tests/ai-normalize-lc.test.mjs`(신규) |
| 완료 판정 | 패널에서 세 유형 요청 → 202 → 폴링 → 큐에 새 행 선택 / reused 안내 / failed hint 표시 (e2e-2 묶음 B) |

### Phase C — LC 에디터 확장
| 항목 | 내용 |
|---|---|
| 서버 | `admin-authoring.service.js` `normalizePassage`: `toeic_part5` 빈 body → 기본 안내문 |
| 화면 | `src/admin/editors/lc.jsx`: kind Part 5 · 문항 추가/삭제 · 권장 범위·`_____`·published 문항 수 변경 경고 |
| 테스트 | `tests/admin-authoring.test.mjs` 에 Part 5 신규(안내문 생략) 201 · 문항 3→5·5→2 update 위치 재부여 |
| 완료 판정 | 화면에서 Part 5 신규 5문항 저장 → 학습 DTO 문항 5 · 문항 삭제 후 저장 → position 1..n (e2e-2 묶음 C) |

### Phase D — 회화·단어 에디터 + 저작 API
| 항목 | 내용 |
|---|---|
| 서버 | `ai-job.service.js`(검증기 2종 추출·export) · `admin-authoring.service.js`(normalize/read/create/update × 2) · `admin.routes.js`(AUTHORING_TYPES·디스패치) |
| 화면 | `src/admin/editors/scenario.jsx` · `src/admin/editors/vocab.jsx`(스텁 교체) |
| 테스트 | `tests/admin-scenario-authoring.test.mjs` · `tests/admin-vocab-authoring.test.mjs`(신규) · `tests/admin-authoring.test.mjs:288-293`(':type≠lesson → 400' 단정 뒤집기) |
| 완료 판정 | author 가 회화·단어 신규 저장(draft/private/curated) → 목록·검수 큐 렌더 · 422 줄 하이라이트 · learner 403 · published 는 author 403 (e2e-2 묶음 D) |

### E — 검증 하네스 (Phase B·C·D 와 함께)
`scripts/e2e-admin-authoring-2.mjs`(신규, `npm run e2e:admin-authoring-2`) — 묶음 A(칩 부재 · 새로 만들기 · 라우팅) · B · C · D. 기존 `e2e-admin-authoring.mjs`(535줄, 시드 LC 복원과 결합)는 건드리지 않고 회귀만 돈다.
**검증 환경은 전용 스키마·포트** — `DB_SCHEMA=jina_verify npm run db:migrate && npm run db:seed` → `DB_SCHEMA=jina_verify PORT=3993 API_PORT=4993 API_ALLOWED_ORIGINS=http://localhost:3993,http://127.0.0.1:3993 node scripts/dev-all.mjs` → `E2E_BASE=http://localhost:3993 E2E_API=http://localhost:4993`.
**사용자의 dev 인스턴스(3003/3004, 스키마 `app`)에는 어떤 검증 스크립트도 돌리지 않는다** — 정찰 중 한 에이전트가 verify 스크립트를 그쪽에 돌려 시드 LC Set 2 의 공개 범위가 바뀌었고 원복해야 했다.

## 3. 구현자 메모

### API 표면 (이 플랜 범위)

| 메서드 · 경로 | 변경 | 비고 |
|---|---|---|
| `GET /api/admin/contents?type=` | 없음 | 화면에서 `topic` 을 더 이상 보내지 않는다 |
| `GET/POST/PATCH /api/admin/contents/:type[/:id]` | `:type` ∈ lesson · **scenario · vocab_set** | 응답 `{ lesson }` · `{ scenario }` · `{ vocab_set }`; 422 `{ ok:false, code:'VALIDATION_FAILED', error, validation_errors:[…] }` |
| `POST /api/ai-jobs` · `GET /api/ai-jobs/:id` | 계약 불변, `job.error.hint` 추가 | 화면이 세 task 를 catalog 로 호출 |
| `GET /api/admin/topics` · `GET /api/ai/providers` | 없음 | 패널의 선택지 |

### 회화 저작 페이로드 · 422 문구
```json
{ "title": "STAR 방식 영문 면접", "description": "…", "tag": "BUSINESS INTERVIEW", "difficulty": 3,
  "system_prompt": "You are …", "opening_message": "Tell me about …", "objectives": ["…", "…"] }
```
`title이 비어 있습니다.` · `system_prompt 가 비어 있습니다.` · `opening_message 가 비어 있습니다.` · `objectives 는 2~5개여야 합니다.` · `objectives[N] 이 비어 있습니다.`

### 단어 세트 저작 페이로드 · 422 문구
```json
{ "title": "비즈니스 면접 핵심 20단어", "description": "…", "difficulty": 3,
  "words": [ { "word": "accomplishment", "pos": "n.", "ipa": "", "meaning_ko": "성과, 업적", "example_en": "", "example_ko": "", "difficulty": 3 } ] }
```
`title이 비어 있습니다.` · `words 는 1~50개여야 합니다.`(생성 경로: `words 는 20개여야 합니다.`) · `words[N].word 가 비어 있습니다.` · `words[N].meaning_ko 가 비어 있습니다.` · `words[N].word 가 다른 단어와 중복됩니다.`

### 파일 소유 (병렬 구현 — 겹치지 않게)
- **S 서버**: `api/ai/normalize.js` · `api/ai/schemas.js` · `api/services/ai-job.service.js` · `api/services/admin-authoring.service.js` · `api/routes/admin.routes.js` · `tests/ai-normalize-lc.test.mjs` · `tests/admin-scenario-authoring.test.mjs` · `tests/admin-vocab-authoring.test.mjs` · `tests/admin-authoring.test.mjs`
- **F-lc**: `src/admin/editors/lc.jsx`
- **F-ai**: `src/admin/ai-draft.jsx` · `src/admin/review-queue.jsx`
- **F-scenario**: `src/admin/editors/scenario.jsx` · **F-vocab**: `src/admin/editors/vocab.jsx` (S 완료 후 시작 — 서버 계약이 있어야 저장을 실제로 쳐 볼 수 있다)
- **E e2e**: `scripts/e2e-admin-authoring-2.mjs` · `package.json` (전부 끝난 뒤)
- 위임자: `docs/plan/14-*.md` · `docs/reviews/06-*` · `docs/FOLLOWUPS.md` · admin-app/content-store/admin.html(Phase A)

### 프론트 규약 (전부 기존 규칙)
- admin.html 은 무빌드 Babel standalone — **최상위 이름은 전역**. 접두 `AdminAiDraft/adminAiDraft/ADMIN_AI_DRAFT_` · `AdminScenario/…/ADMIN_SCENARIO_` · `AdminVocab/…/ADMIN_VOCAB_`. admin-app 의 헬퍼(adminGoto·adminTint·useAdminDismiss)는 **렌더 시점에만** 참조 가능 — 파일 최상위에서 쓰면 스크립트가 통째로 죽는다. 이동은 `window.location.hash` 직접 대입, 신규 저장 뒤 URL 교체는 `history.replaceState`(해시 이벤트 없이 — key 리마운트를 피한다).
- 에디터 라우트는 `AdminContentProvider` 밖 — 자체 errors/saved 상태(lc.jsx 패턴).
- `JINA_API` 에 `put` 이 없다(`fetch(path, { method: 'PUT' })`). 응답은 항상 `{ ok, … }` 봉투.
- `data-testid` 는 `scenario-*` · `vocab-*` · `ai-draft-*` 접두, 목록형은 `<list>-N-<field>` · `add-<x>` · `remove-<x>-N`.

### 먼저 하지 말 것
- 스피킹 세트 에디터(13 Phase C 게이트) · `content_revisions` · 문항 순서 드래그 · Part 7 복수 지문.
- 검증기에 Part 5 `_____` 규칙·문항 수 규격을 넣는 것(프롬프트 동반 수정 없이는 AI 초안을 전부 떨어뜨린다).
- 전이 API 에 vocab 풀 등록 같은 부수효과("전이는 status 만 바꾼다" 규범).
- `src/screens/*` 학습 화면 수정.

## 4. 열린 질문

1. 회화의 `level` 과 `content_items.difficulty` 이중 컬럼 — 이번엔 폼 필드 하나로 두 컬럼에 같은 값. 시드(level 만 명시, difficulty 기본 3)를 맞출지는 별건.
2. 문항 수 실전 규격(LC 2~4 · Part 5 3~10)을 저작에서 강제할지 — 비차단 경고로 시작. 강제한다면 400(normalize)인지 422(검증기)인지도 함께.
3. Part 5 `_____` 규칙 승격 — 프롬프트·검증기 동시 수정 + 기존 초안 재검증 비용.
4. 관리자 전체 AI 작업 목록 — `/api/ai-jobs` 는 user_id 스코프. 다른 관리자의 요청 상태를 봐야 하면 admin 라우트 신설.
5. 저작 세트의 단어를 공개 시점에 풀에 등록할지 — 지금은 어느 경로도 하지 않고 학습자 '담기' 가 등록한다.
6. 진행 중 회화 세션에 `system_prompt` 수정이 즉시 반영되는 것을 그대로 둘지, 세션 스냅숏에 넣어 고정할지(conversation.service 변경, 범위 밖).
7. published 레슨의 문항 수 변경과 과거 attempt 정합 — 경고 문구만. 금지(reviewer 도)·자동 재채점·무시 중 정책 필요.
