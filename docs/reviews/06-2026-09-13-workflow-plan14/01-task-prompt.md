# 위임 라운드 06 — 플랜 14 (만들기 진입점 · AI 초안 요청 · 레슨 에디터 확장 · 회화/단어 에디터) · 서브에이전트 워크플로

- 대상: **Claude 서브에이전트** — 정찰 4갈래(읽기 전용) → 구현 5그룹 + e2e 1그룹(Workflow 오케스트레이션) → 3렌즈 적대 리뷰
- 저장소: `D:\git\node\english tutor jina` · 브랜치 `claude/plan-14-authoring-fill`
- 위임자: Claude (정찰 설계·플랜 문서·Phase A 직접 구현·통합 검증·리뷰 반영)
- 2026-09-13

## 왜 이 라운드인가

PR #10→#11→#12 를 main 에 머지한 직후 관리 화면을 열어 보니 콘텐츠를 **추가하고 채우는** 길이 거의 없었다(플랜 14 §0 표).
사용자 지시: "1~4번에 대해 구현 플랜을 세우고 진행". 라운드 05 와 같은 방식(파일 소유가 겹치지 않는 그룹 병렬 + 적대 리뷰)을 썼고,
이번엔 구현 전에 **정찰 워크플로(4갈래 읽기 전용)** 를 한 번 더 두어 플랜 문서를 코드 사실 위에 썼다.

## 정찰 (4갈래, 읽기 전용) → 플랜 문서

| 갈래 | 대상 | 플랜에 들어간 핵심 사실 |
|---|---|---|
| A 레슨 저작 서버 | admin-authoring.service · 검증기 · lesson 모델 | `toeic_part5` 는 서버가 이미 받는다(막힌 곳은 UI 상수) · 문항 수 서버 1~50, 3 고정은 UI · Part 5 passage 는 안내문 1줄 · `content_revisions` 없음 |
| B AI 파이프라인 | ai-job.service · worker · normalize · schemas · lesson-store UI | **선행 결함 2건** — normalize 가 LC script 객체를 `[object Object]` 로 뭉갬 · LC 스키마 items minItems 3 이 count 2 를 거절 · jobDto 에 hint 없음 |
| C 회화·단어 모델 | scenario_details · vocab_set_details · seeds · 소비자 | 1:1 detail + JSONB words, 조인·FK 없음 → 통째 교체 안전 · export 된 검증기 없음(inline if 502) · 풀 등록은 catalog 에서 안 함 |
| D 관례 | tests/setup · e2e-admin-authoring · admin 프런트 규약 · 문서 형식 | pglite 단위 테스트 · 전역 이름 규칙 · 로드 순서 · 라운드 폴더 형식 · 콘텐츠 탭 '토픽' 칩 400 원인(content-store:30) + 죽은 칩 카운트 |

정찰 중 한 갈래가 verify 스크립트를 **사용자 dev 인스턴스(3003/3004, 스키마 app)** 에 돌려 시드 LC Set 2 의 공개 범위가 바뀌었다(감사 로그 `admin@jina.local` 19:43:59).
`POST /api/admin/contents/lesson/7/visibility {to:'public'}` 로 원복하고, 구현 지시서에 **"3003/3004·app 스키마에는 어떤 요청도 보내지 마라, 전용 스키마·포트만"** 을 박았다.

## 설계 결정 (플랜 14 §1) — 지시서가 공유한 계약

A1 토픽 칩 제거(서버 topic 분기 대신) · A3 에디터 해시 `#/edit/<DB type>/new|:id` · A4 `#/review/new` = 큐 + AI 패널 열림 ·
B1 선행 결함 2건 수정 · B2 `jobDto.error.hint` · B3 패널은 검수 큐 헤더 토글, `publish_target=catalog` 고정 · B5 종료 상태 둘 처리 + reused + VALIDATION_FAILED 는 큐에 안 뜸 명시 ·
C1 Part 5 안내문 미리 채움 + 서버 기본값 · C2 문항 추가/삭제, 하한 1, 권장 범위는 비차단 경고 · C3 `_____` 비차단 경고 ·
D1 검증기 추출·export(생성 경로 502 유지) · D2 저작 서비스는 레슨 거울 + description · D3 회화 난도 하나 → difficulty=level · D4 단어 필수 word·meaning_ko, lower 중복 422, 20개 아니면 UI 경고 · D5 응답 키 유형별 · D6 풀 등록 없음.

## 그룹 배정 (파일 소유 분리)

- **위임자(직접)** Phase A — `src/admin/content-store.jsx` · `src/admin/admin-app.jsx` · `admin.html` · 스텁 3파일 · `docs/plan/14-authoring-fill.md` (커밋 65e2a03)
- **S 서버** `api/ai/normalize.js` · `api/ai/schemas.js` · `api/services/ai-job.service.js` · `api/services/admin-authoring.service.js` · `api/routes/admin.routes.js` · `tests/ai-normalize-lc.test.mjs` · `tests/admin-scenario-authoring.test.mjs` · `tests/admin-vocab-authoring.test.mjs` · `tests/admin-authoring.test.mjs` (검증 스키마 jina_v_s)
- **F-lc** `src/admin/editors/lc.jsx` (jina_v_lc · 3911/4911)
- **F-ai** `src/admin/ai-draft.jsx` · `src/admin/review-queue.jsx` (jina_v_ai · 3912/4912)
- **F-scenario** `src/admin/editors/scenario.jsx` — S 완료 후 시작 (jina_v_sc · 3913/4913)
- **F-vocab** `src/admin/editors/vocab.jsx` — S 완료 후 시작 (jina_v_vc · 3914/4914)
- **E e2e** `scripts/e2e-admin-authoring-2.mjs` · `package.json` — 전부 끝난 뒤 (jina_verify · 3993/4993)

파이프라인: `parallel([ S → parallel(F-scenario, F-vocab), F-lc, F-ai ])` → E. 브라우저 확인은 공유 Playwright MCP 대신 저장소 playwright 패키지로 일회용 스크립트.

## 지시서 원문

### 정찰 워크플로 스크립트 (그대로)

```js
export const meta = {
  name: 'plan14-understand',
  description: '플랜 14(관리자 저작 채우기) 설계를 위해 서버·AI 파이프라인·데이터 모델·테스트 관례를 병렬로 정찰한다',
  phases: [{ title: 'Understand', detail: '읽기 전용 정찰 4갈래' }],
}

const MAP = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '핵심 요약 10~20문장. 한국어.' },
    files: { type: 'array', items: { type: 'object', properties: {
      path: { type: 'string' }, role: { type: 'string' }, key_lines: { type: 'string', description: '예: 12-40 createLesson, 88 validateLcScript 호출' } }, required: ['path', 'role'] } },
    contracts: { type: 'array', items: { type: 'string' }, description: '함수 시그니처·HTTP 계약·DTO 모양·검증 규칙을 코드에서 그대로 옮긴 문장. 추측 금지.' },
    data_shapes: { type: 'array', items: { type: 'string' }, description: '테이블/컬럼/CHECK/UNIQUE, JSON 페이로드 예시(실제 시드에서 발췌)' },
    change_points: { type: 'array', items: { type: 'string' }, description: '이번 플랜 항목을 구현하려면 정확히 어느 파일 어느 함수를 어떻게 바꿔야 하는지, 한 줄씩' },
    risks: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'contracts', 'data_shapes', 'change_points', 'risks', 'open_questions'],
}

const COMMON = `
저장소: "D:\\git\\node\\english tutor jina" (Windows, CRLF 작업트리, Bash 도구에서는 /d/git/node/english\\ tutor\\ jina). **읽기 전용** — 파일을 수정·생성하지 말고, git 명령도 상태 조회만 한다.
배경: 관리자 화면(admin.html, src/admin/*)에서 콘텐츠를 "추가하고 채우는" 기능이 부족하다. 이번 플랜 14 의 4 항목:
 (1) 콘텐츠 탭 유형 칩 '토픽' 이 GET /api/admin/contents?type=topic 으로 400 을 받는 잔재 제거 + 콘텐츠 탭에 "새로 만들기" 진입 버튼.
 (2) admin 화면에 "AI 초안 요청" 폼 — 서버 ai_jobs task lesson_gen · scenario_gen · vocab_set 을 publish_target=catalog 로 호출해 검수 큐로 보낸다(현재 학습 앱 lesson-store.jsx 의 lesson_gen 만 UI 가 있다).
 (3) LC 에디터(src/admin/editors/lc.jsx)에 toeic_part5 kind 지원 + 문항 추가·삭제(현재 신규 3 고정).
 (4) 회화(scenario)·단어(vocab_set) 수기 에디터 + 서버 저작 API 확장(현재 api/routes/admin.routes.js AUTHORING_TYPES=['lesson']).
당신의 몫은 아래 한 갈래만이다. 결과는 StructuredOutput 으로만 낸다. 코드에서 확인한 것만 적고, 확인 못 한 것은 open_questions 에 넣는다. 파일:줄 포인터를 아끼지 말 것.`

const READERS = [
  { key: 'server-lesson-authoring', prompt: `${COMMON}
갈래 A — 레슨 저작 서버와 레슨 데이터 모델.
읽을 것: api/services/admin-authoring.service.js 전체, 그것이 부르는 검증기(validateLcScript, validateGeneratedLesson 등 — grep 으로 위치를 찾아 전체를 읽는다), api/routes/admin.routes.js 의 저작 라우트(159~200행 부근)와 sendAuthoring, api/services/lesson.service.js 에서 kind 목록·Part 5 처리·lessonDto, db/migrations/0001_baseline.sql 의 content_items·lessons·lesson_items(및 관련 CHECK: lesson_items_skill_ck 등), db/content/lessons.json 에서 kind 별(toeic_lc · toeic_part7 · toeic_part5) 레코드 1개씩 모양, AI 워커가 레슨을 저장하는 경로(api/ai/* 또는 api/services/ai-job* 에서 lesson 저장 함수)와 admin-authoring 의 create/update 가 그것과 어떻게 다른지, tests/ 에서 admin-authoring 관련 테스트 파일.
답해야 할 것: Part 5 레슨의 passage/items 모양(지문이 있나, 빈칸 표기 규칙, 문항 수 상한/하한, CHECK 제약), 저작 API 가 kind 를 어떻게 검증하는지(toeic_part5 를 넣으면 지금 어디서 막히나), 문항 수를 3 고정에서 가변으로 바꿀 때 서버가 요구하는 하한·상한과 update 시 문항 통째 교체 방식(트랜잭션, 삭제 후 삽입?), content_revisions 스탬프 여부, 422 validation_errors 의 정확한 모양(script[N]·items[N] 접두 규약).` },
  { key: 'ai-job-pipeline', prompt: `${COMMON}
갈래 B — AI 초안 파이프라인과 기존 생성 UI.
읽을 것: api/services/ai-job.service.js 전체, api/routes/ai-job.routes.js(POST /api/ai-jobs 본문 계약·권한·publish_target·topic_id·client_request_id·요율 제한), 잡을 실제로 실행·저장하는 워커(grep: lesson_gen, scenario_gen, 'vocab_set' 를 api/ 전체에서 — 저장 분기가 publish_target 에 따라 어떻게 갈리는지, catalog 면 content_items 를 어떤 status/visibility/source 로 만드는지), src/shared/lesson-store.jsx 의 생성 요청·폴링 흐름(160~200행 부근)과 src/screens/lesson-list.jsx 의 생성 폼(80~170행: 필드, 라벨, catalog 라디오, 진행 표시), src/admin/review-queue.jsx 전체(구조, 데이터 소스 GET /api/admin/drafts, 승인/반려 호출, 어느 자리에 "AI 초안 요청" 폼을 두면 자연스러운지), scripts/verify-draft-review.mjs 와 tests/draft-review.test.mjs(있으면) 의 검증 방식, docs/plan/12-ai-draft-review.md 의 결정 사항 중 UI 진입점에 관한 것.
답해야 할 것: 세 task 각각의 input 필수/선택 필드와 검증 규칙(intIn/shortText 등 실제 함수 기준), 응답 모양(job DTO, 202/201?), 폴링 엔드포인트와 종료 상태, 동일 요청 해시(request_hash)·client_request_id 의 중복 방지 규칙, catalog 초안이 검수 큐에 보이기까지의 상태 흐름, 학습 앱 폼을 admin 으로 옮길 때 재사용 가능한 코드와 전역 이름 충돌 위험(Babel standalone 전역), AI provider 미기동(Ollama 503) 시 사용자에게 보여야 할 오류 경로.` },
  { key: 'scenario-vocab-model', prompt: `${COMMON}
갈래 C — 회화(scenario)·단어세트(vocab_set) 데이터 모델과 저장 경로.
읽을 것: db/migrations/0001_baseline.sql 에서 scenarios · vocab_sets · vocab_words · vocab_set_words(이름은 확인) · content_items 와의 관계(1:1? content_id FK?), 모든 CHECK/UNIQUE/NOT NULL; db/content/scenarios.json 과 vocab-sets.json, vocab-words.json 의 전체 필드; db/seeds/content.mjs 가 이 둘을 content_items 와 함께 어떻게 INSERT 하는지(함수 이름·순서·slug 규칙·source='seed'); AI 워커가 scenario_gen 과 vocab_set 결과를 저장하는 함수(grep 으로 찾아 전체 읽기 — 저작 API 가 재사용할 후보); api/services/conversation.service.js 가 scenario 의 어떤 컬럼을 소비하는지(system_prompt·opening_message·objectives·tag·level…), api/services/vocab.service.js 와 topic.service.js 가 vocab_set 의 words 를 어떻게 읽는지(조인·정렬·item_count 계산), api/services/admin-content.service.js listContents 의 item_count 가 유형별로 어떻게 계산되는지, 기존 검증기 중 scenario/vocab 용(validateGeneratedScenario 등)이 있는지.
답해야 할 것: scenario 저작 폼에 필요한 필드 목록과 각 제약(길이·필수), vocab_set 저작 폼에 필요한 필드(세트 메타 + 단어 행: word/pos/meaning_ko/ipa/examples/difficulty 중 무엇이 세트 소속이고 무엇이 전역 vocab_words 인지, 같은 word 재사용 규칙/UNIQUE), create/update 가 써야 할 테이블과 순서, 수정 시 단어 목록 통째 교체가 안전한지(학습자 진행 데이터 FK 가 걸리는 테이블이 있는지 — user_vocab 같은), content_revisions 나 감사 로그를 어디에 남겨야 하는지(admin-authoring 의 레슨 방식과 동일하게).` },
  { key: 'conventions-tests-frontend', prompt: `${COMMON}
갈래 D — 테스트·e2e·문서 관례와 admin 프론트 규약.
읽을 것: tests/setup.mjs(DB 드라이버·스키마 준비 방식), tests/admin-content.service.test.mjs 또는 tests/admin-topic.service.test.mjs 한 개 전체(픽스처 생성·actor 만들기·assert 스타일), scripts/e2e-admin-authoring.mjs 전체(서버 기동 방식, 시드 초기화 전제, Playwright 사용법 — channel/chromium, 로그인 방식, data-testid 관례, 단정 수·출력 형식), package.json scripts 와 eslint 설정, admin.html 의 script 순서와 그 이유(src/admin/admin-app.jsx 머리말 1~50행), src/admin/content-store.jsx 전체(전역 이름 규칙, useAdminContents 의 API 경로·rowBusy·notice, ADMIN_CONTENT_TYPES), src/admin/editors/lc.jsx 의 구조(상태 모델, 불러오기 GET /api/admin/contents/lesson/:id, 저장 POST/PATCH, 422 → 줄/문항 하이라이트, 저장 후 이동, 사용하는 theme 토큰과 Icons 이름, 전역 접두 규칙 AdminLc/ADMIN_LC), src/admin/editors/topic.jsx 머리말 1~140행(API 계약 주석·라우팅 규약·JINA_API 에 put 이 없다는 우회), src/shared/api-client.jsx 의 JINA_API 메서드 목록, docs/plan/13-authoring-editors.md 1~60행(YAML 프런트매터 형식·status 값·섹션 구성), docs/reviews/05-2026-09-05-workflow-plan13/ 의 파일 목록과 각 파일 첫 30행(라운드 기록 형식), docs/reviews/rubric-delegated-implementation.md 요약, docs/FOLLOWUPS.md 의 형식.
답해야 할 것: 새 에디터 파일(editors/scenario.jsx, editors/vocab.jsx)과 새 폼 파일이 따라야 할 정확한 규약(전역 접두, 로드 순서, admin-app 라우트 등록 지점 admin-app.jsx 의 adminRouteFromHash/adminGoto/AdminShell 분기 줄 번호), 단위 테스트를 DB 없이(pglite) 돌리는 방법과 PG 실서버 검증 방법, e2e 를 확장할 때 시드 초기화·서버 재기동 함정, 플랜 문서 14 를 쓸 때 맞춰야 할 프런트매터 키와 값, 라운드 06 리뷰 기록 폴더에 넣어야 할 파일들.` },
]

phase('Understand')
log('4갈래 정찰 시작: 레슨 저작 서버 · AI 파이프라인 · 회화/단어 모델 · 관례')
const results = await parallel(READERS.map((r) => () =>
  agent(r.prompt, { label: `read:${r.key}`, phase: 'Understand', schema: MAP })
    .then((m) => ({ key: r.key, map: m }))))
const done = results.filter(Boolean)
log(`정찰 완료 ${done.length}/${READERS.length}`)
return done```

### 구현 워크플로 스크립트 (그대로 — 그룹별 프롬프트 포함)

```js
export const meta = {
  name: 'plan14-implement',
  description: '플랜 14 Phase B·C·D 구현 — 서버(S) · LC 에디터 · AI 초안 패널 병렬, 회화·단어 에디터는 S 완료 후, e2e 하네스는 전부 끝난 뒤',
  phases: [
    { title: 'Implement', detail: 'S · F-lc · F-ai 병렬 → F-scenario · F-vocab (S 뒤)' },
    { title: 'E2E', detail: 'e2e-admin-authoring-2.mjs 작성·실행' },
  ],
}

const REPORT = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '무엇을 만들었고 무엇을 확인했는지 10~20문장(한국어). 자체 테스트 결과 수치 포함.' },
    files_changed: { type: 'array', items: { type: 'string' }, description: '경로 + 한 줄 설명' },
    tests_run: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    browser_checked: { type: 'string', description: '브라우저로 실제 확인한 것(인스턴스 포트·스키마·시나리오·결과). 안 했으면 이유.' },
    contract_notes: { type: 'array', items: { type: 'string' }, description: '다른 그룹이 알아야 할 계약 확정 사항(응답 키·testid·문구 등)' },
    known_gaps: { type: 'array', items: { type: 'string' }, description: '못 한 것·확인 못 한 것·의심스러운 것. 없으면 빈 배열' },
    cleanup_done: { type: 'string', description: '띄운 서버 프로세스·전용 스키마를 정리했는지' },
  },
  required: ['summary', 'files_changed', 'tests_run', 'browser_checked', 'contract_notes', 'known_gaps', 'cleanup_done'],
}

const COMMON = `
## 공통 규칙 (반드시 준수)
- 저장소: D:\\git\\node\\english tutor jina (Git Bash 경로 "/d/git/node/english tutor jina"), 브랜치 claude/plan-14-authoring-fill (이미 체크아웃됨). **git commit/push 금지** — 커밋은 위임자가 한다. git 은 diff/status/log 조회만.
- **먼저 docs/plan/14-authoring-fill.md 를 전부 읽어라.** 설계 결정(§1)·API 표면·422 문구·파일 소유(§3)가 거기 있다. 이 지시서는 그 문서의 당신 몫만 다시 적은 것이다. 문서와 지시서가 어긋나면 지시서를 따르고 report 의 contract_notes 에 적어라.
- **파일 소유를 넘지 마라.** 아래 "당신이 소유한 파일" 외의 파일은 읽기만 한다. 다른 그룹 파일을 고쳐야 할 것 같으면 known_gaps 에 적는다(동시에 다른 에이전트가 그 파일을 편집 중이다).
- 파일 편집은 Read/Edit/Write 도구로 한다(Bash sed 로 CRLF 파일을 만지지 말 것). 기존 파일의 줄 끝(CRLF)을 유지하라. 새 파일은 LF 도 무방하다(git autocrlf).
- Windows 함정: Bash 도구는 문자열 안의 이중 백슬래시를 접는다 — 경로는 슬래시(/)로 쓴다. MSYS grep 은 CR 때문에 줄 끝 앵커($)가 실패할 수 있다 — Grep 도구를 쓴다.
- **사용자의 dev 인스턴스(포트 3003/3004, DB 스키마 app)와 실 DB 의 app 스키마에는 어떤 요청·스크립트도 보내지 마라.** 브라우저·HTTP 검증이 필요하면 아래 "전용 검증 인스턴스" 절차로 자기 스키마·포트를 쓴다. npm run test:pg / verify:* / e2e-* 를 기본 .env 그대로 돌리는 것도 금지(그것들이 app 스키마를 친다).
- Playwright MCP 도구(mcp__playwright__*)는 다른 에이전트와 브라우저를 공유하므로 **쓰지 마라.** 브라우저 확인은 저장소의 playwright 패키지로 일회용 node 스크립트를 써서 한다: import { chromium } from 'playwright'; import { launchOptions } from './scripts/e2e-env.mjs'; const browser = await chromium.launch(launchOptions); … 로그인은 scripts/e2e-admin-authoring.mjs 70~90행 방식(픽스처 계정 생성 → POST /api/auth/login → jina_sid 쿠키를 컨텍스트에 심기, 요청 헤더 X-Jina-No-Autologin: 1). 일회용 스크립트는 저장소 밖(예: C:/Users/KYJ/AppData/Local/Temp/claude/plan14-<그룹>/)에 두고 저장소에 남기지 마라.
- 단위 테스트: npm test (pglite 메모리 DB, DB·서버·AI 불필요, 현재 125/125). npm run lint 는 api/·db/·scripts/·tests/ 만 본다(src/**/*.jsx 는 린트 없음 — 그래서 브라우저 콘솔 오류 0 이 프론트의 유일한 자동 게이트다).
- 한국어로 주석·문구를 쓴다. 기존 코드의 주석 스타일("왜" 를 적는 긴 머리말)을 따른다.

## 전용 검증 인스턴스 (필요한 그룹만)
스키마 이름과 포트는 그룹별로 지정돼 있다(아래). 절차(Git Bash):
  cd "/d/git/node/english tutor jina"
  DB_SCHEMA=<스키마> npm run db:migrate && DB_SCHEMA=<스키마> npm run db:seed
  DB_SCHEMA=<스키마> PORT=<웹포트> API_PORT=<API포트> API_ALLOWED_ORIGINS=http://localhost:<웹포트>,http://127.0.0.1:<웹포트> node scripts/dev-all.mjs   # run_in_background
  (확인) curl -s http://localhost:<API포트>/api/health
- API 서버가 api/ 의 문법 오류로 죽으면 다른 그룹(S)이 그 파일을 편집 중인 순간이다 — 60초 뒤 다시 띄운다(최대 5회).
- 서버는 시작 시점의 코드를 읽는다(watch 없음). 서버 파일을 고친 뒤에는 재기동해야 한다. 프론트(src/**/*.jsx, admin.html)는 새로고침으로 반영된다.
- dev 자동로그인(DEV_AUTOLOGIN=1)은 쿠키 없는 요청을 admin 으로 만든다 — 권한 검증은 픽스처 계정 로그인 + X-Jina-No-Autologin: 1 로.
- **끝나면 반드시 정리**: (1) 서버 종료 — PowerShell: Get-NetTCPConnection -LocalPort <웹포트>,<API포트> -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } (dev-all 부모도 함께 죽는다; 남으면 node 프로세스를 포트 기준으로 다시 확인) (2) 스키마 삭제 — PGPASSWORD 는 .env 의 값: "C:/Users/KYJ/pgsql/bin/psql" -h 192.168.45.7 -p 5433 -U tester1 -d jina_eng -c "DROP SCHEMA IF EXISTS <스키마> CASCADE". cleanup_done 에 결과를 적어라.

## 보고
최종 출력은 StructuredOutput 만. summary 에는 자기 테스트 수치(예: npm test 131/131, 브라우저 확인 N 시나리오)를 넣는다. 확인하지 않은 것을 확인했다고 쓰지 마라.`

const S_PROMPT = `# 그룹 S — 서버: AI 파이프라인 선행 결함 · 검증기 추출 · 회화/단어 저작 API · 테스트
${COMMON}

## 당신이 소유한 파일
api/ai/normalize.js · api/ai/schemas.js · api/services/ai-job.service.js · api/services/admin-authoring.service.js · api/routes/admin.routes.js ·
tests/ai-normalize-lc.test.mjs(신규) · tests/admin-scenario-authoring.test.mjs(신규) · tests/admin-vocab-authoring.test.mjs(신규) · tests/admin-authoring.test.mjs
(필요하면 api/lib/errors.js 의 hintFor import 만 — 그 파일은 고치지 않는다.) src/ 는 절대 만지지 않는다.
검증 인스턴스가 필요하면: 스키마 jina_v_s, 포트 3915/4915. pg 드라이버로 단위 테스트를 돌리려면 그 스키마에 migrate+seed 한 뒤 DB_SCHEMA=jina_v_s DB_DRIVER=pg node --import ./tests/setup.mjs --test tests/*.test.mjs (기본 npm run test:pg 는 app 스키마를 치므로 금지).

## 할 일 (순서대로, 각 단계 뒤 npm test 초록 유지)
### 1. 선행 결함 2건 (플랜 §1 B1)
- api/ai/normalize.js normalizeLessonGen(약 123~125행): script 줄이 객체면 { speaker: String(line.speaker ?? '').trim().toUpperCase().slice(0, 1), text: String(line.text ?? '').trim().slice(0, 400) } 로, 문자열이면 지금처럼 문자열 그대로(라벨 파싱 금지 — 10.7 이 그 코드를 없앤 이유를 되살리지 않는다). validateLcScript(ai-job.service.js 259~275)·saveGeneratedLesson passage.body·LESSON_GEN_SCHEMA 가 전부 {speaker,text} 를 기대한다. 왜 이 회귀가 생겼는지(5902ae7b 가 스키마·검증기만 객체형으로 바꿈)를 주석에 남겨라.
- api/ai/schemas.js LESSON_GEN_LC_SCHEMA(약 188~191행): items 를 { ...LESSON_GEN_SCHEMA.properties.items, minItems: 2, maxItems: 4 } 로 덮어 normalizeJobInput 의 LC count 2~4(ai-job.service.js 49~51)와 맞춘다.
- tests/ai-normalize-lc.test.mjs(신규): (a) normalizeLessonGen 이 객체 script 를 보존한다 (b) 문자열 script 도 여전히 통과 (c) LC 스키마가 items 2개를 통과시키고 5개를 거절한다(validateAgainst 또는 스키마 검증 함수 — api/ai/ 에서 찾아 그대로 쓴다) (d) validateGeneratedLesson(…,{part:'lc'}) 가 정규화된 객체 script 로 오류 0. AI 호출 0건.
### 2. jobDto.error.hint (플랜 §1 B2)
- ai-job.service.js jobDto: error: row.error_code ? { code, message, hint: hintFor(row.error_code, row.provider) ?? null } : null. hintFor 는 api/lib/errors.js 에 있다(시그니처를 읽고 맞춰라). 기존 테스트(tests/draft-review.test.mjs 등)가 error 모양을 단정하면 hint 추가가 깨뜨리지 않는지 확인.
### 3. 검증기 추출 (플랜 §1 D1, §3 문구표)
- ai-job.service.js 에 export function validateGeneratedScenario(data) → string[] 와 export function validateGeneratedVocabSet(data, { expectedCount } = {}) → string[] 를 만든다. 문구는 플랜 §3 표 그대로:
  회화: 'title이 비어 있습니다.' · 'system_prompt 가 비어 있습니다.' · 'opening_message 가 비어 있습니다.' · 'objectives 는 2~5개여야 합니다.' · 'objectives[N] 이 비어 있습니다.'(N 0-based)
  단어: 'title이 비어 있습니다.' · expectedCount 있으면 'words 는 20개여야 합니다.'(수는 expectedCount) 없으면 'words 는 1~50개여야 합니다.' · 'words[N].word 가 비어 있습니다.' · 'words[N].meaning_ko 가 비어 있습니다.' · 'words[N].word 가 다른 단어와 중복됩니다.'(lower(trim) 비교, 뒤에 나온 쪽에 표시)
- saveGeneratedScenario / saveGeneratedVocabSet 의 inline if 를 이 함수 호출로 바꾸되 **오류가 있으면 지금과 같은 HttpError(502, 'VALIDATION_FAILED', …) 를 던진다**(코드·status 유지). 생성 경로는 validateGeneratedVocabSet(data, { expectedCount: 20 }). tests/draft-review.test.mjs 와 scripts/verify-draft-review 가 단정하는 문구가 있으면 깨지지 않게 메시지에 기존 문구를 포함시켜라.
### 4. 저작 서비스 확장 (플랜 §1 D2~D4·D6·D8, §1 C1)
- admin-authoring.service.js:
  (a) normalizePassage: kind === 'toeic_part5' 이고 body 가 비면(빈 배열 또는 전부 공백) saveGeneratedLesson 과 같은 기본 안내문 1줄 ['Choose the word or phrase that best completes each sentence.'] 을 채운다(지금은 400 '지문이 없습니다'). type/subject 는 PASSAGE_DEFAULTS 그대로.
  (b) slugify(title, fallbackPrefix = 'lesson') — 한국어 제목 폴백을 \`\${fallbackPrefix}-\${Date.now()}\` 로. uniqueSlug 도 prefix 를 받아 넘긴다. 기존 레슨 호출은 동작 불변.
  (c) normalizeScenarioInput(body) → { title(str 1~200 — 빈 값은 400 이 아니라 검증기 422 로 가게 ''), description(≤500, 기본 ''), tag(≤60, 비면 'AI 회화'), difficulty(posInt 1~5 기본 3), system_prompt(≤4000), opening_message(≤1000), objectives(arrayOf ≤10, 각 str ≤200 — 개수 2~5 는 검증기 422) }. 형태 오류만 400(validate.js 헬퍼·기존 arrayOf 재사용).
  (d) normalizeVocabSetInput(body) → { title, description(≤500), difficulty(1~5 기본 3), words: arrayOf ≤60(개수 1~50 은 검증기) 각 plainObject → { word(≤64 trim, 대소문자 보존), pos(≤16), ipa(≤64), meaning_ko(≤200), example_en(≤400), example_ko(≤400), difficulty(1~5 기본 3) } — 모르는 키는 버린다 }.
  (e) readScenario(contentId) → { scenario } / readVocabSet(contentId) → { vocab_set }: LESSON_COLS 의 c.* 메타(id,type,slug,title,description,difficulty,status,visibility,source,created_*,updated_*,created_by_name,updated_by_name) + scenario_details(tag,level,system_prompt,opening_message,objectives) / vocab_set_details(words). WHERE c.id=$1 AND c.type=… 없으면 404 ('시나리오를 찾을 수 없습니다.' / '단어 세트를 찾을 수 없습니다.').
  (f) createScenario(actor, body) / createVocabSet(actor, body): normalize → assertValid(검증기 → 422 HttpError(422,'VALIDATION_FAILED', '검증에 걸린 항목이 N건 있습니다.', { validation_errors })) → withTx: uniqueSlug(prefix 'scenario'|'vocab-set') → INSERT content_items(type, slug, title, **description**, difficulty, 'draft', 'private', 'curated', created_by) → INSERT scenario_details(content_id, tag, level=difficulty, system_prompt, opening_message, objectives::jsonb) / vocab_set_details(content_id, words::jsonb) → writeAudit('create', null→'draft') → read*.
  (g) updateScenario / updateVocabSet(actor, contentId, body): updateLesson(약 269~321)을 거울처럼 — SELECT … FOR UPDATE → type 불일치 404 → published/archived 면 loadRoles()+atLeast(actor.role,'reviewer') 아니면 403(레슨 문구를 유형에 맞게) → source seed→curated → UPDATE content_items SET title, description, difficulty, source, updated_at=now(), updated_by → UPDATE scenario_details SET tag, level=difficulty, system_prompt, opening_message, objectives / UPDATE vocab_set_details SET words (rowCount 0 → 404) → writeAudit('update', status→status, note). 풀(vocab_words) 등록은 하지 않는다.
  파일 머리말 주석에 유형 3종·불변식·description 차이를 적어라.
### 5. 라우트 (플랜 §1 D5)
- admin.routes.js: AUTHORING_TYPES = ['lesson','scenario','vocab_set']; GET/POST/PATCH 세 경로를 type → { read, create, update } 맵으로 디스패치. 응답 키는 서비스가 돌려주는 그대로({ lesson } · { scenario } · { vocab_set }). oneOf(type) 400 → 서비스 404 순서 유지. sendAuthoring 그대로.
### 6. 테스트
- tests/admin-authoring.test.mjs: (a) 288~293 부근 ':type 이 lesson 이 아니면 400' 단정을 → 'speaking_set 은 400, scenario/vocab_set 은 400 이 아님' 으로 (b) Part 5 신규를 라우트로 POST — passage 생략 또는 body [] → 201 + passage.body 가 기본 안내문 (c) update 로 문항 3→5, 5→2 — lesson_items position 1..n · counts · lesson_drafts.payload 동기화(있으면) (d) items 0개 400 유지.
- tests/admin-scenario-authoring.test.mjs · tests/admin-vocab-authoring.test.mjs(신규): tests/admin-authoring.test.mjs 의 call() 하네스(59~83)·before/after(132~154, config.devAutologin=false)·counts 무변경·422 모양 단정을 복제. 케이스: author 생성 201(draft/private/curated, description 저장, 감사 'create' 1행) · learner 403 · 422(회화: objectives 1개 / 단어: meaning_ko 빈 행 + lower 중복) 문구 정확히 · read 200 이 system_prompt/words 를 싣는다 · 시드 행(scenario 'business-interview-star' / vocab_set 'business-interview-core-20') update → source seed→curated, 감사 'update', words 통째 교체 뒤 user_vocab_cards 건수 불변 — 시드는 snapshot/restore(94~130 패턴) · published 시드를 author 가 PATCH → 403, reviewer → 200 · 다른 유형 id 로 read → 404.
- npm test 전부 초록, npm run lint 0. 가능하면 자기 스키마(jina_v_s)에 pg 드라이버로도 한 번(위 절차). 결과 수치를 report 에.
### 계약 확정 (contract_notes 에 반드시 기록)
응답 키 · 422 문구 최종형 · Part 5 기본 안내문 · read DTO 필드 목록 · 회화 level=difficulty 규칙.`

const FLC_PROMPT = `# 그룹 F-lc — LC 에디터 확장: toeic_part5 · 문항 추가/삭제 · 경고
${COMMON}

## 당신이 소유한 파일
src/admin/editors/lc.jsx 만. (서버 admin-authoring.service.js 는 그룹 S 가 동시에 고치고 있다 — Part 5 빈 지문 기본값은 S 의 몫이지만, 당신은 서버에 의존하지 않도록 아래처럼 안내문을 미리 채운다.)
검증 인스턴스: 스키마 jina_v_lc, 포트 3911/4911.

## 할 일 (플랜 §1 C 전부)
1. ADMIN_LC_KINDS 에 { key: 'toeic_part5', label: 'Part 5 · toeic_part5' } 추가. Part 5 의 지문 영역은 **"안내문" 한 줄 입력**(data-testid lc-part5-instruction) — 신규 Part 5 폼은 'Choose the word or phrase that best completes each sentence.' 로 **미리 채워** 둔다(편집 가능). 저장 시 passage.body = [안내문] (비면 [] 로 보내 서버 기본값에 맡긴다). passage.type/subject 는 지금 LC↔비LC 전환 로직(약 584~600)이 하는 대로 — Part 5 는 서버 PASSAGE_DEFAULTS({type:'PART 5', subject:'Incomplete Sentences'})가 채우므로 화면이 억지로 넣지 않아도 된다(기존 레슨을 열면 서버 값이 온다 — 그대로 보존해 보낸다, 88~90행 주석의 vocab/faq 규칙과 같다). Part 7 은 지금 그대로 문단 textarea.
2. 문항 추가/삭제: ADMIN_LC_NEW_ITEMS 상수를 kind 기본값(LC 3 · Part 5 5 · Part 7 3)으로 바꾸고(신규 폼에서 kind 를 바꾸면 문항이 비어 있는 경우에만 개수를 맞춘다 — 입력한 문항을 지우지 마라), 문항 섹션 헤더에 [＋ 문항] 버튼(data-testid lc-add-item, 673~682 lc-add-line 스타일 복제)과 각 문항 카드에 [×](data-testid lc-remove-item-N, 271~282 lc-remove-line 복제). **마지막 1개는 삭제 불가**(canRemove, 서버가 0개를 400 으로 거부). 상한은 50(서버) — 50 이면 추가 버튼 비활성.
3. React key: 문항·줄에 클라이언트 uid 를 부여해 key 로 쓴다(추가 시 생성). data-testid 는 **인덱스 기준 유지**(lc-item-N-*, radio name lc-answer-N) — e2e 가 삭제 뒤 당겨진 인덱스를 기대한다.
4. 비차단 경고 칩(data-testid lc-item-count-warn): kind 별 권장 범위 밖이면(LC 2~4 · Part 5 3~10 · Part 7 2~10) "권장 N~M개 — 저장은 됩니다" 식으로. Part 5 문항 stem 에 '_____'(언더스코어 5개 연속) 이 없으면 그 문항 카드에 경고(data-testid lc-item-N-blank-warn, 비차단). published/archived 레슨에서 문항 수가 불러온 값과 달라지면 저장 버튼 근처에 경고 문구(data-testid lc-count-change-warn: "이미 푼 학습자의 기록은 문항 번호(position) 기준이라 어긋날 수 있습니다").
5. 머리말 주석(1~19행)의 "문항 추가/삭제는 없다 — 신규는 3 고정" 을 새 규범으로 고쳐 쓴다(왜 서버 상·하한은 그대로인지, 경고가 비차단인 이유 = 플랜 14 결정 C2·C3).
6. 확인: 자기 인스턴스에서 author 계정으로 (a) 새로 만들기 → 레슨 → Part 5 선택 → 문항 5개 채워 저장 201 → 다시 열어 문항 5 · passage.body 안내문 (b) 문항 삭제 후 저장 → 서버 응답 items 길이 (c) 시드 LC 열어 문항 추가 → 저장 → 문항 4 (d) 콘솔 오류 0 (favicon 404 제외). 서버 Part 5 기본값이 아직 없어도 안내문을 채워 보내므로 저장은 돼야 한다. **시드를 고쳤으면 그 스키마는 어차피 삭제한다.**
## contract_notes 에 기록
새 testid 목록 · 저장 페이로드 예(Part 5) · kind 기본 문항 수.`

const FAI_PROMPT = `# 그룹 F-ai — AI 초안 요청 패널(검수 탭) + '승인 전 수정' 3종
${COMMON}

## 당신이 소유한 파일
src/admin/ai-draft.jsx(스텁 → 실제 구현으로 통째 교체) · src/admin/review-queue.jsx. admin.html 은 이미 ai-draft.jsx 를 review-queue.jsx **앞**에 로드하고, admin-app.jsx 는 route==='review' 에서 <AdminReviewQueue theme me openAi={nav.id === 'new'} /> 를 넘긴다(#/review/new). 둘 다 고치지 않는다.
검증 인스턴스: 스키마 jina_v_ai, 포트 3912/4912.

## 서버 계약 (읽기만: api/routes/ai-job.routes.js · api/services/ai-job.service.js 33~175, 89~107 · api/routes/admin-topics.routes.js · api/routes/ai.routes.js 55~64)
- POST /api/ai-jobs { task: 'lesson_gen'|'scenario_gen'|'vocab_set', input, client_request_id: crypto.randomUUID(), provider?, model? } → 202 { ok, job, reused }. input: 공통 publish_target:'catalog'(고정)·topic_id?(양의 정수); lesson_gen: part 5|'lc', count(LC 2~4 기본 3 / Part 5 3~10 기본 5), difficulty 1~5, topic ≤80; scenario_gen: difficulty, topic(필수 1~80); vocab_set: topic(필수), count 20 고정(보내지 않는다).
- 오류 봉투 { ok:false, code, error, hint? } — 400(catalog 권한 부족·필드)·404(토픽 접근 불가)·409·429(대기 3건 초과). GET /api/ai-jobs/:id → { ok, job } — job.status queued|running|succeeded|failed, job.result({type, lesson_id|scenario_id|vocab_set_id, draft_id?, validation_errors?}), job.error {code, message, hint?}(hint 는 그룹 S 가 지금 추가 중 — 없으면 message 만 보여라).
- 토픽 선택지 GET /api/admin/topics → { topics:[{id, label_ko, slug, status, …}] } 중 **status === 'published' 만**(내린 토픽은 서버가 404). 공급자 GET /api/ai/providers → { default, providers:[{id,label,defaultModel,models}] }; 실패하면 셀렉트를 숨기고 provider/model 을 본문에서 생략(서버 기본값).
- 검수 큐 GET /api/admin/drafts 는 review-queue 가 이미 쓴다. 레슨 VALIDATION_FAILED 초안은 lesson_drafts 에만 남고 **큐에 뜨지 않는다** — 화면 문구에 반영.

## 할 일 (플랜 §1 B3~B6)
1. ai-draft.jsx: 전역 AdminAiDraftPanel({ theme, me, onSucceeded }) — 접두 AdminAiDraft/adminAiDraft/ADMIN_AI_DRAFT_. 마지막 줄 window.AdminAiDraftPanel = AdminAiDraftPanel. 필드는 플랜 §1 B4 그대로(유형 칩 · 레슨: 파트·문항 수·난도 · 회화: 난도·주제 · 단어: 주제 + "20개 고정" · 공통 주제 ≤80 · 토픽(선택) · 공급자 · "저장 대상: 검수 큐(catalog)" 표기). me.can_author 가 아니면 안내만. 제출마다 새 UUID. 제출 중 버튼 잠금.
   진행: 202 → job.status 가 종료가 아니면 1.5초 폴링, 5분 데드라인("서버에서 계속 진행됩니다 — 새로고침으로 확인"). 언마운트 시 폴링 중단(alive 플래그). reused:true → "같은 조건의 기존 작업(#id)을 재사용했습니다 — 새 초안이 필요하면 주제를 바꾸세요"(data-testid ai-draft-reused). failed → error.message + hint(data-testid ai-draft-error); code VALIDATION_FAILED 면 result.validation_errors 를 나열하고 "이 초안은 검수 큐에 오르지 않습니다(lesson_drafts 에만 남음)" 를 적는다(data-testid ai-draft-validation). succeeded → onSucceeded(job) + "검수 큐에 들어왔습니다"(data-testid ai-draft-done). POST 실패 봉투(400/404/409/429)는 error+hint 그대로.
   testid: ai-draft-panel · ai-draft-task-<task> · ai-draft-part-<5|lc> · ai-draft-count · ai-draft-difficulty · ai-draft-topic · ai-draft-topic-id · ai-draft-provider · ai-draft-submit · ai-draft-status[data-status] · 위 결과 셋.
2. review-queue.jsx: 헤더의 새로고침 옆에 토글 버튼(data-testid review-ai-toggle, Icons.Sparkles 사용 가능 — Icons 목록: Plus Sparkles Refresh Book Chat BookOpen Eye Check X? — src/shared/icons.jsx 를 읽고 있는 것만 쓴다). props 에 openAi 추가 → 초기 열림. 헤더와 main 사이에 typeof AdminAiDraftPanel === 'function' ? <AdminAiDraftPanel theme me onSucceeded={…} /> : 로드 안내(admin-app 의 AdminMissingScreen 은 뒤에 로드되므로 여기선 간단한 div). onSucceeded: await load() 뒤 job.result 의 새 id(lesson_id|scenario_id|vocab_set_id)로 setSelectedId (load 가 기존 선택을 유지하므로 load 뒤에 호출), notice 표시.
   '승인 전 수정'(약 112~124): item.type 이 lesson·scenario·vocab_set 이면 활성 → window.location.hash = '#/edit/<type>/<id>?from=review' (type 문자열 그대로, admin-app ADMIN_EDIT_ROUTES 와 동일 규약). speaking_set 만 비활성(title '플랜 13 Phase C').
3. 확인(자기 인스턴스 3912): author 계정으로 #/review/new 진입 → 패널 열림 · 세 유형 폼 전환 · 회화 요청 제출 → 202 · 상태 표시 · (Ollama 가 실제로 돌면 succeeded → 큐에 새 행 선택, 안 돌면 failed + 메시지 표시) — 2분 이상 기다리지 마라. reused 경로: node 로 scripts/lib/draft-review-fixtures.mjs 의 createReviewUser/createReviewContent 를 **DB_SCHEMA=jina_v_ai** 환경에서 실행해 succeeded 잡을 심고(그 user 로 로그인 — passwordHash 인자에 실제 hashPassword 결과를 넣어야 로그인 가능: api/services/auth.service.js 또는 scripts/e2e-admin-authoring.mjs 가 쓰는 hashPassword 를 찾아 쓴다) 같은 input 으로 제출 → reused 안내. learner 계정은 패널이 안내만. 콘솔 오류 0.
## contract_notes 에 기록
testid 전체 · onSucceeded 계약 · 패널이 보내는 본문 예 3종.`

const FSC_PROMPT = (s) => `# 그룹 F-scenario — 회화 시나리오 에디터
${COMMON}

## 당신이 소유한 파일
src/admin/editors/scenario.jsx (스텁 → 실제 구현으로 통째 교체). admin-app.jsx 는 이미 #/edit/scenario/new|:id 에서 <AdminScenarioEditor key theme me scenarioId={nav.id} /> 를 그린다(scenarioId 는 null 또는 문자열 id). admin.html 로드 순서도 끝났다. 둘 다 고치지 않는다.
검증 인스턴스: 스키마 jina_v_sc, 포트 3913/4913.

## 서버 계약 (그룹 S 가 방금 확정 — 아래 보고를 근거로 하되, 반드시 api/services/admin-authoring.service.js · api/routes/admin.routes.js 를 직접 읽어 확인하라)
${s}

## 할 일 (플랜 §1 D3·D7·D8, 화면 미리보기 '회화 에디터')
1. src/admin/editors/lc.jsx 를 정독하고 그 구조를 그대로 옮긴다: 머리말 규범(접두 AdminScenario/adminScenario/ADMIN_SCENARIO_, admin-app 헬퍼 최상위 참조 금지, adminTint 복제, 해시 직접 대입, 서버 422 를 그대로 렌더) · 상태 모델(blank/fromServer) · payload · errorTargets(정규식 /^(objectives)\\[(\\d+)\\]/ 로 줄 하이라이트; 접두 없는 오류는 상단 띠) · Errors 띠 · NeedAuthor · 불러오기 GET /api/admin/contents/scenario/:id · 저장 POST /api/admin/contents/scenario | PATCH …/:id · 신규 저장 뒤 history.replaceState('#/edit/scenario/<id>') · '목록' 은 ?from=review 면 #/review 아니면 #/contents · 저장 완료 표시.
2. 폼: 제목 · 설명 · 태그 · 난도(1~5 라디오/셀렉트 — content_items.difficulty 와 scenario_details.level 에 같은 값이 저장된다는 안내 한 줄) · 상태/공개 배지(읽기 전용) · system_prompt(textarea, 높이 충분히) · opening_message · 학습 목표 목록(추가/삭제, 2~5 권장 — 개수 규칙은 서버 422 가 판정) · 저장 · 목록. published/archived 면 reviewer 아니면 저장 시 403 이 온다 — 그 문구를 그대로 띠에.
3. testid: scenario-editor[data-scenario-id] · scenario-back · scenario-title · scenario-description · scenario-tag · scenario-difficulty · scenario-status[data-status] · scenario-loading · scenario-load-error · scenario-need-author · scenario-system-prompt · scenario-opening · scenario-objectives · scenario-add-objective · scenario-objective-N[data-error] · scenario-remove-objective-N · scenario-errors(role=alert) · scenario-error(li) · scenario-saved(role=status) · scenario-save · scenario-back-to-list.
4. 확인(자기 인스턴스 3913, S 코드가 들어간 API 서버): author 로 새로 만들기 → 회화 → 목표 1개만 넣고 저장 → 422 'objectives 는 2~5개여야 합니다.' 띠 · 목표 2개로 저장 → 201 → URL 이 #/edit/scenario/<id> 로 바뀌고 다시 열면 값 유지 · 시드 'STAR 방식 영문 면접' 열어 저장(author 는 403 → 문구 표시, reviewer 는 200) · 콘솔 오류 0. **시드를 고쳤으면 그 스키마는 어차피 삭제한다.**
## contract_notes 에 기록
testid 전체 · 저장 페이로드 예 · 서버 계약과 어긋난 점.`

const FVC_PROMPT = (s) => `# 그룹 F-vocab — 단어 세트 에디터
${COMMON}

## 당신이 소유한 파일
src/admin/editors/vocab.jsx (스텁 → 실제 구현으로 통째 교체). admin-app.jsx 는 이미 #/edit/vocab_set/new|:id 에서 <AdminVocabEditor key theme me vocabSetId={nav.id} /> 를 그린다. admin.html 로드 순서도 끝났다. 둘 다 고치지 않는다.
검증 인스턴스: 스키마 jina_v_vc, 포트 3914/4914.

## 서버 계약 (그룹 S 가 방금 확정 — 아래 보고를 근거로 하되, 반드시 api/services/admin-authoring.service.js · api/routes/admin.routes.js 를 직접 읽어 확인하라)
${s}

## 할 일 (플랜 §1 D4·D7, 화면 미리보기 '단어 세트 에디터')
1. src/admin/editors/lc.jsx 를 정독하고 그 구조를 그대로 옮긴다(접두 AdminVocab/adminVocab/ADMIN_VOCAB_, 나머지 규범은 F-scenario 와 동일 — 머리말 규범·상태 모델·payload·errorTargets(/^(words)\\[(\\d+)\\]/ 로 행 하이라이트)·Errors 띠·NeedAuthor·GET/POST/PATCH /api/admin/contents/vocab_set[/:id]·replaceState·?from=review·저장 완료 표시).
2. 폼: 제목 · 설명 · 난도(1~5) · 상태/공개 배지 · 단어 표(행: word · pos · ipa · meaning_ko · example_en · example_ko · difficulty · [×]) + [＋ 단어] · 행 수 표시와 **비차단 경고**: 20개가 아니면 "토픽 임계(단어 20)·학습 화면 '20단어 담기' 라벨과 어긋납니다 — 저장은 됩니다"(data-testid vocab-count-warn). 마지막 1행은 삭제 불가(서버가 0개 거부). 붙여넣기 편의: 'word<TAB>pos<TAB>meaning_ko' 여러 줄을 한 번에 붙이는 textarea 임포트는 **만들지 않는다**(범위 밖 — known_gaps 에 제안만).
3. testid: vocab-editor[data-vocab-set-id] · vocab-back · vocab-title · vocab-description · vocab-difficulty · vocab-status[data-status] · vocab-loading · vocab-load-error · vocab-need-author · vocab-words · vocab-add-word · vocab-word-N[data-error] · vocab-word-N-word · vocab-word-N-pos · vocab-word-N-ipa · vocab-word-N-meaning · vocab-word-N-example-en · vocab-word-N-example-ko · vocab-word-N-difficulty · vocab-remove-word-N · vocab-count-warn · vocab-errors(role=alert) · vocab-error(li) · vocab-saved(role=status) · vocab-save · vocab-back-to-list.
4. 확인(자기 인스턴스 3914): author 로 새로 만들기 → 단어 → 행 2개 중 하나 meaning_ko 비움 + 같은 word 중복 → 저장 → 422 두 문구가 각 행에 하이라이트 · 고쳐서 저장 → 201 → 재열기 값 유지 · 시드 '비즈니스 면접 핵심 20단어' 열어 행 추가 후 저장(author 403 문구 / reviewer 200 · 21개 경고 칩) · 콘솔 오류 0.
## contract_notes 에 기록
testid 전체 · 저장 페이로드 예 · 서버 계약과 어긋난 점.`

const E2E_PROMPT = (reports) => `# 그룹 E — e2e 하네스 scripts/e2e-admin-authoring-2.mjs
${COMMON}

## 당신이 소유한 파일
scripts/e2e-admin-authoring-2.mjs(신규) · package.json(scripts 에 "e2e:admin-authoring-2": "node scripts/e2e-admin-authoring-2.mjs" 한 줄만). 다른 파일은 읽기만 — 결함을 찾으면 고치지 말고 known_gaps 에 파일:줄과 재현을 적는다(위임자가 리뷰 라운드에서 처리).
검증 인스턴스: 스키마 jina_verify, 포트 3993/4993. e2e 는 시드를 고치므로 실행 전 DB_SCHEMA=jina_verify node db/migrate.mjs reset --yes && … db:migrate && db:seed, 그 뒤 서버 기동(순서 중요: db:reset 이 users 를 날려 ensureAdminAccount 가 재기동 때 다시 돈다).

## 구현 그룹들의 보고 (testid·계약의 근거 — 실제 코드와 다르면 코드가 정본)
${reports}

## 할 일
scripts/e2e-admin-authoring.mjs(535줄) 를 정독하고 **같은 골격**(픽스처 계정 3역할 hashPassword → 로그인 → 쿠키 → Playwright launchOptions(scripts/e2e-env.mjs) → 역할별 컨텍스트 → check/skip 누적 → 요약 '총 N개 중 M개 통과 · F개 실패 · S개 skip' → finally 정리)으로 새 파일을 쓴다. 기존 파일은 건드리지 않는다. E2E_BASE/E2E_API 환경변수로 대상 인스턴스를 받는다(기본 3003/3004 이지만 **당신은 반드시 3993/4993 을 넘긴다**).
묶음:
- **A 콘텍츠 탭**: content-type-topic 이 없다 · content-new 버튼(author 만 보이고 learner 는 없음) · 메뉴 4항목 · 메뉴 '회화 시나리오' 클릭 → 해시 #/edit/scenario/new → scenario-editor 렌더 · [▾] 의 content-edit 가 회화·단어 행에서 활성, 스피킹은 없어도 됨(시드에 speaking_set 없음 → skip).
- **B AI 초안 패널**: #/review/new → ai-draft-panel 열림 · 유형 칩 전환 시 필드 변화 · **AI 호출 없이** reused 경로: scripts/lib/draft-review-fixtures.mjs createReviewContent 로 author 픽스처 사용자의 succeeded 잡(task scenario_gen, input {publish_target:'catalog', difficulty:3, topic:'<TAG> scenario'})을 심고 같은 값으로 제출 → 네트워크 응답 202 reused:true → ai-draft-reused 표시 · 신규 조건 제출 → 202 + job.id(status 는 queued/running/failed 어느 것이든 OK — 워커가 실제 AI 를 부르므로 결과를 기다리지 않는다; 60초 안에 failed 가 오면 ai-draft-error 가 message 를 보여주는지만 확인) · learner 는 패널이 안내만 · 정리: ai_jobs 는 users ON DELETE CASCADE 인지 확인하고 아니면 DELETE FROM ai_jobs WHERE user_id = ANY(...) 를 finally 에.
- **C LC 에디터**: author 로 #/edit/lesson/new → lc-kind 를 toeic_part5 → lc-part5-instruction 미리 채워짐 · 문항 5개(기본) 채우기(stem 에 _____ 포함, 보기 4, 정답, 해설에 '(B)' 형 정답 표기 — validateGeneratedLesson 규칙) → 저장 201 → GET /api/admin/contents/lesson/<id> 문항 5 · passage.body[0] 이 안내문 · lc-remove-item-4 → 저장 200 → 문항 4 · lc-add-item → 6번째 채우고 저장 → 5 · 권장 범위 밖(11개)일 때 lc-item-count-warn 표시(저장은 201/200) · stem 에 _____ 없는 문항의 lc-item-N-blank-warn.
- **D 회화·단어 에디터**: author 로 회화 신규 — objectives 1개 → 저장 422 + scenario-errors 문구 · 2개 → 201 → 재로드 값 유지 · learner 는 scenario-need-author · 시드 'STAR 방식 영문 면접' 을 author 가 PATCH → 403 문구, reviewer → 200(원본 스냅숏 → finally 복원: content_items.source/title/description/difficulty·scenario_details 전 컬럼·updated_by) · 단어 신규 — meaning_ko 빈 행 + 중복 word → 422 두 문구 · 고쳐서 201 · 20개 아니면 vocab-count-warn · 시드 '비즈니스 면접 핵심 20단어' reviewer 로 행 추가 저장 200 → words 21 → 복원.
- 공통: 각 화면 pageerror·console.error 수집(favicon 404 제외) → 0 단정.
실행: 위 절차로 jina_verify 인스턴스를 띄우고 E2E_BASE=http://localhost:3993 E2E_API=http://localhost:4993 node scripts/e2e-admin-authoring-2.mjs. 실패 항목은 **코드 결함인지 하네스 결함인지 판별**해 하네스 결함은 고치고, 코드 결함은 known_gaps 에 파일:줄·재현·기대/실제로 적는다. 회귀로 같은 인스턴스에서(db reset·재기동 뒤) node scripts/e2e-admin-authoring.mjs 도 한 번 돌려 16/16 인지 본다(E2E_BASE/E2E_API 지원 여부는 그 파일 상단을 읽어 확인). npm run lint 0(scripts/ 도 린트 대상). 스크린샷은 docs/reviews/_artifacts/(gitignore) 에.
## report
tests_run 에 두 e2e 의 정확한 통과 수치, known_gaps 에 코드 결함 목록.`

function brief(r) {
  if (!r) return '(보고 없음)'
  return `### ${r.label}\n${r.summary}\n- 계약: ${r.contract_notes.join(' · ')}\n- 미해결: ${r.known_gaps.join(' · ') || '없음'}`
}

phase('Implement')
log('S(서버) · F-lc · F-ai 병렬 시작 — F-scenario·F-vocab 은 S 완료 직후')
const [serverChain, flc, fai] = await parallel([
  () => agent(S_PROMPT, { label: 'S:server', phase: 'Implement', schema: REPORT }).then(async (s) => {
    if (!s) return { s: null, fsc: null, fvc: null }
    log('S 완료 → F-scenario · F-vocab 시작')
    const contract = `${s.summary}\n\n계약 확정:\n- ${s.contract_notes.join('\n- ')}\n\n미해결:\n- ${s.known_gaps.join('\n- ') || '없음'}`
    const [fsc, fvc] = await parallel([
      () => agent(FSC_PROMPT(contract), { label: 'F:scenario-editor', phase: 'Implement', schema: REPORT }),
      () => agent(FVC_PROMPT(contract), { label: 'F:vocab-editor', phase: 'Implement', schema: REPORT }),
    ])
    return { s, fsc, fvc }
  }),
  () => agent(FLC_PROMPT, { label: 'F:lc-editor', phase: 'Implement', schema: REPORT }),
  () => agent(FAI_PROMPT, { label: 'F:ai-draft-panel', phase: 'Implement', schema: REPORT }),
])
const impl = {
  S: serverChain?.s || null,
  'F-scenario': serverChain?.fsc || null,
  'F-vocab': serverChain?.fvc || null,
  'F-lc': flc || null,
  'F-ai': fai || null,
}
const missing = Object.entries(impl).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) log(`보고 없는 그룹: ${missing.join(', ')}`)

phase('E2E')
const reports = Object.entries(impl).filter(([, v]) => v).map(([k, v]) => brief({ label: k, ...v })).join('\n\n')
const e2e = await agent(E2E_PROMPT(reports), { label: 'E:e2e-harness', phase: 'E2E', schema: REPORT })
return { impl, e2e }```
