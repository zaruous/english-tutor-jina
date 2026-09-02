# Jina — AI English Tutor

한국인 학습자를 위한 AI 영어 학습 앱.
**TOEIC 학습 · AI 회화 · 단어장(SRS) · 리스닝 · 스피킹 · 오답 노트 · 학습 통계**.

> 처음에는 HTML/React 디자인 프로토타입으로 시작했지만, 지금은 **정적 프론트엔드 + Node API + PostgreSQL** 로 동작하는 앱입니다.
> AI 호출은 브라우저가 아니라 **API 서버가** CLI 에이전트(claude / agy / codex / cursor) 또는 Ollama(HTTP)를 통해 수행합니다.
> 프론트엔드는 빌드 단계 없이 CDN React + Babel Standalone 으로 실행됩니다.

---

## 구성

```
브라우저 (React CDN + Babel, 빌드 없음)
  index.html  ── 실제 앱 (로그인 · 사이드바 · 9개 페이지 · 설정 패널)
  canvas.html ── 디자인 캔버스 (읽기 전용 아트보드 · Tweaks 패널)
        │  fetch  같은 출처 /api/*  (X-Requested-With: jina, 세션 쿠키)
        ▼
server.js (정적, :3003)   ──/api/* 중계──▶  api/server.js (node:http, :3004, Express 없음)
  /config.js 로 .env 값 주입                   ├─ PostgreSQL (pg)  — db/migrations 0001~0015
                                               ├─ AI 프록시  api/ai/ — CLI 5종 provider + JSON 스키마 검증
                                               │     claude · agy(Antigravity) · codex · cursor  (child_process)
                                               │     ollama                                  (HTTP :11434)
                                               ├─ AI job 워커 — 레슨/시나리오/단어 세트 생성 (ai_jobs 큐)
                                               └─ 발음 평가 어댑터 — lib/pronounce 사이드카(:8000) 또는 Speechace
```

브라우저 → LLM 직결(구 `callOllama`/`window.claude.complete`)은 폐기되었습니다. 시스템 프롬프트·JSON 파싱·검증·강등은 전부 API 서버에 있습니다.
브라우저는 API 포트를 직접 부르지 않습니다. 정적 서버가 `/api/*` 를 `127.0.0.1:API_PORT` 로 양방향 무버퍼 파이프하고 `apiBase = location.origin` 을 주입하므로 교차 출처 XHR 이 없습니다(교차 출처 localhost XHR 을 막는 브라우저 보안 확장이 있는 환경 대응). API 가 꺼져 있으면 프록시가 `code: NETWORK` 봉투를 502 로 돌려주고 화면은 오프라인 안내를 띄웁니다.

---

## 기능 현황

사이드바(`src/shared/app-nav.jsx` 의 `APP_PAGES`)의 페이지와 구현 상태. 자세한 설계는 각 플랜 문서를 봅니다.

| 페이지 | 상태 | 핵심 | 문서 |
|---|---|---|---|
| 대시보드 | 구현 | 서버 집계(`GET /api/dashboard`) — 오늘 계획·스킬·주간·추천 레슨. `daily_progress` 적재 없이 실시간 집계 | `docs/plan/03-dashboard.md` |
| AI 회화 | 구현 | 세션/메시지/첨삭 영속화, 서버 채점, 시나리오 선택, CLI 세션 resume(`--resume` 등), 🎤 STT 입력 | `docs/plan/01-conversation.md`, `07` |
| 주제별 학습 | 구현 | 레슨 3·시나리오 1·단어 20 임계치를 채운 토픽만 노출(배타 FK `topic_contents`). 시드: 비즈니스 면접 | `docs/plan/07-…md` Phase 3 |
| 스피킹 연습 | 구현(v1) | 기본: 기기 TTS + 브라우저 SpeechRecognition → **받아쓰기 일치율**(발음 점수 아님). 선택: OpenPronounce 사이드카 → 음소 단위 발음 점수. 무저장 연습 모드 | `docs/plan/08-…md` Phase C, `docs/plan/10-…md` |
| 리스닝 | 구현(연습 모드) | `lessons.kind='toeic_lc'` — 레슨 엔진 재사용, 기기 TTS 재생(속도 칩, 화자 라벨은 읽지 않음), 제출 전 스크립트 잠금, 재생 중 화면 이동 시 확인 모달. 시험 모드(서버 TTS)는 후속 | `docs/plan/08-…md` Phase B |
| TOEIC 학습 | 구현 | Part 7 리딩 레슨 목록/풀이/서버 채점, `skill_code` 약점 코드, Jina Q&A(정답·해설 미전송), AI 레슨 생성(`ai_jobs` → `lesson_drafts` 검증 → private 게시), 문항 신고 | `docs/plan/02-lesson.md`, `07` |
| 단어장 | 구현 | **전체 단어장(풀)** / **나만의 단어장(SRS)** 분리, AI 단어 추가, 플래시카드, '오늘의 단어' AI 퀴즈(10문항 4지선다 + 어원·유의어·반의어), 🔊 발음 | `docs/PLAN-vocab-backend.md`, `06`, `09` |
| 학습 통계 | 구현 | `GET /api/progress` 집계 — 점수 추이·스킬·첨삭 SRS 복습(`correction_reviews`), TOEIC 추정 점수 v1(`200 + 790 × accuracy`) | `docs/plan/04-progress.md` |
| 오답 노트 | 구현 | `GET /api/mistakes` 파생 쿼리 — 레슨별 최신 attempt 의 오답만(다시 맞히면 자동 극복), skill 필터 | `docs/plan/08-…md` Phase A |
| 로그인 / 설정 | 구현 | scrypt + 세션 쿠키 인증, 설정 패널 4섹션: **계정 · 컬러 테마 · AI 제공자 · 음성 인식(STT)** | `docs/plan/05-settings-auth.md` |

모바일: 대시보드 · AI 회화 · 주제 · TOEIC 학습 · 단어장 · 통계는 하단 탭에 있고, 스피킹/리스닝/오답 노트는 데스크탑 우선(`mobile: false`, 창을 좁히면 렌더는 됨).

---

## ⚡ 빠른 시작

### 0. 요구사항

- **Node.js ≥ 18**
- **PostgreSQL** 접속 정보 (스키마 `public` 을 다른 앱과 공유해도 됨 — 마이그레이션은 이 앱 테이블만 만든다)
- **AI provider 하나 이상**
  - CLI: `claude` / `agy` / `codex` / `cursor-agent` 중 하나가 PATH 에 있고 **로그인된 상태** (기본 provider 는 `claude`)
  - 또는 Ollama: `ollama serve` + `ollama pull gemma4:e2b` (API 서버가 호출하므로 `OLLAMA_ORIGINS` CORS 설정은 필요 없다)

### 1. 설치 · DB · 실행

```bash
npm install                 # pg / dotenv / playwright
cp .env.example .env        # PGHOST 등 실제 접속정보를 채운다 (.env 는 git 미추적)
npm run db:migrate          # 최초 1회 — 0001~0016 마이그레이션 (체크섬 검증, 적용된 파일 수정 금지)
npm run db:seed             # 개발 계정(DEV_USER_EMAIL / DEV_USER_PASSWORD) + 단어 카드 8장 (재실행 안전)
npm run dev                 # server.js(:3003) + api/server.js(:3004) 동시 실행 — 한쪽이 죽으면 둘 다 종료, Ctrl+C 로 정리

# 그 다음 http://localhost:3003
```

- `DEV_AUTOLOGIN=1`(예제 기본값)이면 쿠키 없는 요청에 개발 계정 세션이 자동 발급되어 로그인 화면 없이 들어간다. `NODE_ENV=production` 과 함께 켜면 API 가 부팅을 거부한다.
- **기본 관리자 계정은 `admin` / `1234`** (`.env` 의 `ADMIN_USERNAME` / `ADMIN_PASSWORD`). 시드가 아니라 **API 서버 부팅 때마다 `.env` 값으로 생성·동기화**되므로 비밀번호를 바꾸려면 `.env` 를 고치고 재기동하면 된다. 로그인 화면에는 아이디(`admin`)를 그대로 입력한다 — 서버가 `ADMIN_EMAIL`(기본 `admin@jina.local`)로 치환해 인증한다. DB `users.email` 에 이메일 형태 CHECK 가 걸려 있어 저장은 이메일로만 된다. 자동 생성을 끄려면 `ADMIN_AUTO_PROVISION=0`, production 은 8자 이상을 강제한다.
- 한쪽만 띄우려면 `npm run dev:web` / `npm run dev:api`. 포트는 `.env` 의 `PORT` / `API_PORT`(예제 3003/3004). 브라우저는 정적 서버 한 포트만 보면 된다(`/api/*` 는 정적 서버가 중계). API 쪽 `API_ALLOWED_ORIGINS` 검사는 그대로 살아 있으니 `localhost` 외 호스트로 열면 그 오리진을 추가해야 한다.
- 디자인 캔버스는 `http://localhost:3003/canvas.html`. 읽기 전용(클라이언트 가드 + 서버 `X-Jina-Mode: canvas` 2중 차단, `/api/ai/chat` 만 예외).

### 2. AI 제공자 고르기

- 서버 기본값은 `.env` 의 `AI_PROVIDER` 와 provider 별 모델(`CLAUDE_MODEL`, `AGY_MODEL`, `CURSOR_MODEL`, `CODEX_MODEL`, `OLLAMA_MODEL`).
- 화면에서는 **설정(우상단 ⚙) → AI 제공자** 에서 5종 중 전환·모델 선택. 상태는 `GET /api/ai/health` 의 60초 TTL 캐시를 읽는다(채팅 경로에서 auth 프로브를 호출하지 않는다). 선택은 `localStorage` 의 `jina_settings_v1` 에 기기 단위로 남는다.
- CLI 는 빈 디렉터리 `.jina-agent-cwd/` 를 cwd 로 두고 도구를 전면 차단한 상태로 실행된다. 따라서 '최신 뉴스' 같은 주제는 **AI 지식 기준**이고 실시간 검색이 아니다(화면에도 그렇게 표기).
- 각 CLI 를 서버 없이 정찰하려면 `node scripts/try-provider.mjs claude "I go to school yesterday." --task tutor` (`--all --repeat 3` 은 provider × 레이턴시 × 스키마 준수율 비교표).

### 3. 발음 평가 (선택)

스피킹 화면의 기본 모드는 외부 API 0원(브라우저 STT)이고, 화면에 나오는 수치는 **발음 점수가 아니라 받아쓰기 일치율**이다.
음소 단위 발음 점수를 원하면 **설정 → 음성 인식(STT) → OpenPronounce 선택 → [서버에 설치] → [시작]**. 버튼은 API 서버가 `lib/pronounce/install-python.*` 를 실행하고 로그 꼬리를 보여준다(`NODE_ENV=production` 에서는 비활성). 첫 평가 요청은 Wav2Vec2 체크포인트(~2.4GB)를 내려받아 수 분 걸린다. 사이드카가 꺼져 있으면 화면은 받아쓰기 모드로 폴백하며 **이것은 버그가 아니다**. 상용 대안(Speechace)은 `.env` 의 `SPEECHACE_KEY`. 상세: [`lib/pronounce/README.md`](lib/pronounce/README.md), [`docs/plan/10-pronunciation-assessment.md`](docs/plan/10-pronunciation-assessment.md).

---

## npm 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` (= `dev:all`) | 정적 3003 + API 3004 동시 실행 (`scripts/dev-all.mjs`) |
| `npm run dev:web` / `npm run dev:api` | 한쪽만 |
| `npm run db:migrate` / `db:status` / `db:rollback` | 마이그레이션 적용 / applied·pending·MODIFIED 표시 / 마지막 1개 `.down.sql` 롤백 |
| `npm run db:seed` | 개발 계정 + 카드 8장 |
| `npm run db:reset -- --yes` | 이 앱 테이블만 명시 목록으로 DROP (`DROP SCHEMA` 절대 금지 — `db/README.md`) |
| `npm run ollama` / `ollama:pull` / `ollama:list` | Ollama 편의 명령 (`ollama:pull` 은 `gemma4:e2b`) |

---

## 검증 스크립트

단위 테스트 프레임워크는 없고, `scripts/` 의 Playwright E2E 와 API 검증 스크립트가 각 플랜의 완료 판정을 담당한다.
**모두 `npm run dev` 가 떠 있는 상태**에서 실행한다(예외 표기). 기대값은 하드코딩하지 않고 서버 DTO 를 읽어 대조한다.

| 스크립트 | 검증 대상 | 전제 |
|---|---|---|
| `scripts/e2e-auth.mjs` | AppGate · 로그인/회원가입 · 계정 설정 · 설정 지속성 · 캔버스 무인증 | — |
| `scripts/e2e-vocab.mjs` | 단어장 실기능 (카드·SRS·AI 추가) | AI provider |
| `scripts/e2e-conversation.mjs` | 회화 영속화 · 첨삭 | AI provider |
| `scripts/e2e-lesson.mjs` | TOEIC 학습 영속화 · 채점 · 진도 | DB 직접 접근(attempt 정리) |
| `scripts/e2e-dashboard.mjs` / `e2e-progress.mjs` | 서버 집계가 데스크탑·모바일에 같은 수치로 렌더 · 첨삭 SRS 복습 | — |
| `scripts/e2e-topics.mjs` | 토픽 임계치 · 배타 FK · 진행률 · 연결 | DB 직접 접근 |
| `scripts/e2e-plan08-screens.mjs` | 오답 노트 · 리스닝 · 스피킹 화면 렌더/상호작용 | — |
| `scripts/e2e-stt-settings.mjs` | 설정 → STT 모드 · 사이드카 설치/기동 버튼 · 스피킹 두 모드 (사이드카 응답 **모킹**) | — |
| `scripts/verify-quiz.mjs [kind] [keyword]` | '오늘의 단어' 퀴즈 생성 → 채점 → 단어장 추가 | AI provider |
| `scripts/verify-lesson-qa.mjs` | 레슨 Q&A(dry_run + 실호출 resume) | `SKIP_AI=1` 로 AI 단계 생략 가능 |
| `scripts/verify-lesson-gen.mjs` | `ai_jobs` 큐 · 복구 · 레슨 생성 검증 | DB 직접 접근, `SKIP_AI=1` |
| `scripts/verify-resume.mjs [provider]` | CLI 세션 resume 하이브리드(턴1 새 세션 → 턴2 resume → 핸들 훼손 후 히스토리 폴백) | AI provider, DB. 기본 대상은 3103/3104 — `E2E_API` 로 지정 |
| `scripts/verify-pronunciation.mjs` | 정규화·multipart 파서(서버 없이 항상) + 실호출(사이드카/Speechace 있을 때만, 없으면 스킵). 오독 픽스처는 espeak 합성음에서도 점수가 갈리는 문장(실측 78 vs 41) | 픽스처 wav 는 `--good/--bad` 또는 espeak-ng 합성 |
| `scripts/render-mockups.mjs` | `docs/plan/mockups/*.html` → `docs/plan/img/*.png` | 서버 불필요 |

공용 환경 옵션(`scripts/e2e-env.mjs`): 기본은 Playwright 번들 chromium, `PW_CHROMIUM=<실행파일>` 로 교체, unpkg 가 막힌 환경은 `E2E_VENDOR=<react/react-dom/babel 로컬 디렉터리>`. 다른 포트의 인스턴스는 `E2E_BASE=http://localhost:3103 E2E_API=http://localhost:3104`. 데스크탑 페이지 이동은 `aside[aria-label="주요 메뉴"]` 기준.

---

## 📂 디렉터리 구조

```
.
├── index.html                  # 실제 앱 진입점 (스크립트 로더 — canvas.html 과 태그 순서 동기화 필수)
├── canvas.html                 # 디자인 캔버스 (읽기 전용, window.JINA_READONLY)
├── server.js                   # 정적 서버 :3003 — /api/* 를 API 로 동일 출처 중계, /config.js 로 .env 주입, db/scripts/.env 정적 노출 차단
├── package.json
├── .env.example                # 모든 설정 키의 예제 (실제 값은 .env)
├── api/                        # API 서버 :3004 (node:http)
│   ├── server.js · router.js · config.js
│   ├── routes/                 # auth · ai · ai-job · vocab · conversation · lesson · dashboard · progress · topic · speaking · health
│   ├── services/               # 도메인 로직 — DTO + 파생값의 단일 소스 (srs, vocab-quiz, ai-job-worker, pronunciation-* …)
│   ├── middleware/auth.js      # requireUser (세션 쿠키 · DEV_AUTOLOGIN)
│   ├── ai/                     # ask.js(공통 호출·세마포어) · prompts.js · schemas.js(task 7종) · normalize.js · registry.js
│   │   └── providers/          # claude · agy · codex · cursor (CLI) · ollama (HTTP)
│   └── lib/                    # body(json·multipart) · cookies · cors(CSRF) · errors · pool · tx · semaphore · cli/(invocation·run-cli·json)
├── db/
│   ├── migrate.mjs             # up / status / down / reset — 체크섬 검증
│   ├── migrations/             # 0001_auth ~ 0015_listening_lc (+ .down.sql 쌍)
│   ├── seeds/dev.mjs
│   └── README.md               # 마이그레이션 규칙
├── lib/pronounce/              # 발음 평가 사이드카 (FastAPI + OpenPronounce) — 설치 스크립트 · Dockerfile · README
├── scripts/                    # dev-all · e2e-* · verify-* · try-provider · render-mockups
├── docs/
│   ├── PLAN-vocab-backend.md   # 단어장 구현 계획(완료본) — 이후 모든 탭이 복제한 4개 패턴의 원본
│   ├── plan/01~10-*.md         # 탭별 구현 계획서 + 상태 (mockups/, img/ 포함)
│   ├── reviews/                # 에이전트 리뷰 기록
│   ├── HANDOFF.md              # 프로토타입 시절 프로덕션 전환 메모 (일부 내용은 현재 구조와 다름)
│   └── OLLAMA-SETUP.md         # Ollama 설치 가이드 (CORS 절은 브라우저 직결 시절 기준)
└── src/
    ├── main.jsx                # 실제 앱 셸 — AppGate(인증) · TopNav · 설정 패널 · 라우팅 · Provider 트리
    ├── app.jsx                 # 캔버스 셸 — 아트보드 + Tweaks
    ├── shared/
    │   ├── tokens.jsx · icons.jsx        # 테마 4종 · SVG 아이콘
    │   ├── app-nav.jsx                   # APP_PAGES(페이지 단일 소스) · 데스크탑 사이드바 · 모바일 탭
    │   ├── api-client.jsx                # window.JINA_API — fetch 래퍼 (같은 출처 /api/* · 쿠키·CSRF 헤더·캔버스 차단·31분 타임아웃)
    │   ├── ai-provider.jsx               # window.JINA_AI — /api/ai/* 얇은 어댑터
    │   ├── speech.jsx                    # 기기 TTS(jinaSpeak) · STT 모드 훅 · 재생 중 이동 확인 가드(useSpeechNavGuard)
    │   └── *-store.jsx                   # auth · vocab · conversation · lesson · dashboard · progress — Context 스토어(캔버스 fallback)
    ├── runtime/chat-runtime.jsx          # useJinaChat · 메시지 버블 · 입력 바(🎤)
    ├── canvas/                           # design-canvas · ios-frame · tweaks-panel
    └── screens/                          # dashboard-desktop · conversation-desktop · mobile · topics · lesson-list · lesson
                                          # · vocab-quiz · vocabulary · progress · mistakes · listening · speaking · login
```

새 스크립트 파일을 추가하면 **`index.html` 과 `canvas.html` 양쪽**에 같은 순서로 태그를 넣어야 한다(스토어는 화면보다 앞, `login` 은 `main` 앞).

---

## 🤖 AI 통합

### 요청 흐름

```
화면 → window.JINA_AI.askJina({ history, userMessage, task, conversationId })
     → POST /api/ai/chat { task, provider, model, … }      (또는 도메인 라우트가 내부에서 askAI 호출)
     → api/ai/ask.js: 세마포어(AI_MAX_CONCURRENCY=2, 대기열 AI_QUEUE_MAX=8) → provider.run()
     → 응답 JSON 추출(lib/cli/json.js) → schemas.js 검증 → 실패 시 강등/오류
```

요청이 끊기면(탭 닫기·취소) CLI 프로세스까지 죽인다 — 고아 프로세스가 세마포어 슬롯을 점유하지 않게.

### Task 7종 (`api/ai/schemas.js`)

| task | 용도 | 호출 경로 |
|---|---|---|
| `tutor` | 회화 응답 + 첨삭 + 점수 (`reply_en`, `reply_ko`, `corrections[]`, `scores`, `suggestion`) | `POST /api/conversations/:id/messages`, `/api/ai/chat` |
| `vocab_entry` | 단어 추가 시 사전 항목(품사·IPA·뜻·예문) | `POST /api/vocab/add` |
| `vocab_quiz` | '오늘의 단어' 10문항 + 어원·유의어·반의어 | `POST /api/vocab/quiz`, `…/related` |
| `lesson_qa` | 레슨 Jina Q&A — 서버가 지문·문항·내 답만 조립, 정답·해설 미전송, 인용은 지문 부분문자열 검증 | `POST /api/lessons/:id/qa` |
| `lesson_gen` | TOEIC 레슨 생성 (RC / LC 변형) → `lesson_drafts` 검증 → private 레슨 | `POST /api/ai-jobs` (워커) |
| `scenario_gen` | 회화 시나리오 생성 | `POST /api/ai-jobs` (워커) |
| `vocab_set` | 주제 단어 세트 생성 → 전체 단어장(풀) | `POST /api/ai-jobs` (워커) |

### Provider 5종 (`api/ai/providers/`)

| id | 라벨 | 종류 | 세션 resume | 기본 모델 (env) |
|---|---|---|---|---|
| `claude` | Claude | CLI `claude` | `--resume` | `CLAUDE_MODEL` = `claude-haiku-4-5` |
| `agy` | Antigravity | CLI `agy` | `--conversation` | `AGY_MODEL` |
| `codex` | Codex | CLI `codex` | `exec resume` | `CODEX_MODEL` (없으면 CLI 기본) |
| `cursor` | Cursor | CLI `cursor-agent` | `--resume` | `CURSOR_MODEL` = `gpt-5` |
| `ollama` | Ollama | HTTP `/api/chat` (JSON 스키마 `format`) | 없음 — 매 턴 히스토리 | `OLLAMA_MODEL` = `gemma4:e2b` |

**세션 resume 하이브리드**: 회화 세션은 `conversation_sessions.provider_ref(+_provider)` 에 CLI 세션 핸들을 저장하고, 같은 provider 로 이어지는 턴은 히스토리 없이 resume 한다. resume 실패·provider 전환·ollama 는 최근 8턴 히스토리를 새 세션에 재전송한다(DB 가 단일 소스, 응답 `meta.resumed`).

**Windows 주의**: `.cmd` shim 을 cmd.exe 로 감싸면 개행이 든 프롬프트가 깨진다. codex/cursor 는 내부 node 진입점을 직접 실행하고, agy 가 `.cmd` 로 잡히면 즉시 실패시킨다(`api/lib/cli/invocation.js`).

**Provider 추가**: `api/ai/providers/xxx.js` 에 `{ id, label, kind, supportsResume, supportsJsonSchema, defaultModel, models(), probe(), run() }` 를 만들고 `api/ai/registry.js` 의 `PROVIDERS` 에 등록. 프론트 배지 색은 `src/shared/ai-provider.jsx` 의 `PROVIDER_META`.

---

## 🛠️ API 엔드포인트

모든 요청은 `X-Requested-With: jina` 헤더(CSRF)와 세션 쿠키가 필요하고, 허용 오리진은 `API_ALLOWED_ORIGINS`. 응답은 `{ ok, … }` / `{ ok:false, code, error }`. 브라우저에서는 정적 서버의 같은 경로(`http://localhost:3003/api/...`)로 부르면 중계되고, 스크립트에서는 API 포트로 직접 불러도 된다.

```
GET   /api/health                          GET  /api/ai/health   GET /api/ai/providers   POST /api/ai/chat
POST  /api/auth/signup | login | logout    GET  /api/auth/me     PATCH /api/me

GET   /api/dashboard                       GET  /api/progress    GET /api/mistakes?skill=&lesson_id=
GET   /api/corrections                     POST /api/corrections/:id/review

GET   /api/vocab | /api/vocab/due | /api/vocab/stats | /api/vocab/pool?q=&source=
POST  /api/vocab/add                       PATCH|DELETE /api/vocab/:card_id     POST /api/vocab/:card_id/review
POST  /api/vocab/quiz                      GET  /api/vocab/quiz/today | /:quiz_id
POST  /api/vocab/quiz/:quiz_id/answer | add | related            POST /api/vocab-sets/:id/add

GET   /api/conversations | /:session_id    POST /api/conversations   PATCH|DELETE /api/conversations/:session_id
POST  /api/conversations/:session_id/messages                    GET  /api/scenarios

GET   /api/lessons?kind=&status=  | /api/lessons/recommended | /api/lessons/:id
POST  /api/lessons/:id/attempts | qa | reports

GET   /api/topics | /api/topics/:id        GET|POST /api/ai-jobs   GET /api/ai-jobs/:id

GET   /api/speaking/sentences              GET  /api/speaking/assess/status[?force=1]
POST  /api/speaking/assess (multipart)     POST /api/speaking/sidecar/install | start | stop
```

캔버스(`X-Jina-Mode: canvas`)에서는 `/api/ai/chat` 외 모든 non-GET 이 403.

---

## 🗄️ 데이터베이스

PostgreSQL, `db/migrate.mjs` 로만 적용한다(`psql -f` 금지 — Windows 코드페이지에서 한글/IPA 가 깨진다). 규칙은 [`db/README.md`](db/README.md).

| 마이그레이션 | 테이블 / 변경 |
|---|---|
| `0001_auth` | `users`, `auth_sessions` |
| `0002_vocab`, `0003_vocab_words_seed` | `vocab_words`, `user_vocab_cards`, `vocab_reviews` + 시드 |
| `0004_conversation` | `conversation_sessions`, `conversation_messages`, `corrections` |
| `0005_lessons`, `0006_lessons_seed` | `lessons`, `lesson_items`, `user_lesson_attempts` + Part 7 시드 |
| `0007_user_goals`, `0008_progress` | `user_goals`, `correction_reviews` |
| `0009_provider_session` | `conversation_sessions.provider_ref(_provider)` — CLI resume 핸들 |
| `0010_vocab_quizzes` | `vocab_quizzes` |
| `0011_lesson_qa` | `lesson_qa_sessions`, `user_lesson_attempts.skill_code` |
| `0012_ai_generation` | `ai_jobs`, `lesson_drafts`, `lessons` 가시성/출처 컬럼, `lesson_items.skill_code` |
| `0013_topics`, `0014_business_interview_topic` | `topics`, `conversation_scenarios`, `vocab_sets`, `topic_contents`(배타 FK) + 비즈니스 면접 토픽 |
| `0015_listening_lc` | `lessons.kind` 에 `toeic_lc` 허용 + LC 대화 세트 |

일별 학습량(`daily_progress`)은 저장하지 않고 `vocab_reviews` / `user_lesson_attempts` / `conversation_messages` 를 실시간 집계한다 — 데이터가 커지면 적재로 전환하는 것이 후속 과제. 현재 접속 롤이 슈퍼유저이므로 운영 전 최소권한 롤 분리도 필요하다(`db/README.md`).

---

## ⚙️ 설정 (.env)

전체 키와 설명은 [`.env.example`](.env.example). 자주 만지는 것만:

| 키 | 기본값 | 의미 |
|---|---|---|
| `PORT` / `API_PORT` | 3003 / 3004 | 정적 / API 포트 |
| `API_ALLOWED_ORIGINS` | `http://localhost:3003,http://127.0.0.1:3003` | API 가 검사하는 허용 오리진(프록시 경유 요청도 Origin 헤더가 그대로 전달된다) |
| `PGHOST` `PGPORT` `PGDATABASE` `PGUSER` `PGPASSWORD` | (필수) | PostgreSQL |
| `AI_PROVIDER` | `claude` | 기본 provider (`claude` \| `agy` \| `codex` \| `cursor` \| `ollama`) |
| `*_MODEL`, `OLLAMA_URL` | 위 표 참조 | provider 별 모델 |
| `AI_MAX_CONCURRENCY` / `AI_QUEUE_MAX` | 2 / 8 | 동시 AI 호출 / 대기열 |
| `DEV_AUTOLOGIN` | `1`(예제) | 쿠키 없는 요청에 개발 계정 자동 발급. production 에서 금지 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `1234` | 기본 관리자 계정. 부팅 시 `.env` 값으로 동기화 |
| `ADMIN_EMAIL` / `ADMIN_DISPLAY_NAME` | `admin@jina.local` / `관리자` | 관리자 계정이 DB 에 저장되는 이메일·표시 이름 |
| `ADMIN_AUTO_PROVISION` | `1` | `0` 이면 부팅 시 관리자 계정을 만들지 않는다. production 은 8자 이상 비밀번호 필요 |
| `COOKIE_NAME` / `COOKIE_SECURE` / `SESSION_TTL_DAYS` | `jina_sid` / `false` / 30 | 세션 쿠키 |
| `PRONUNCIATION_URL` / `PRONUNCIATION_BACKEND` | (비움 → `http://localhost:8000`, 자동) | 발음 평가 사이드카 |
| `SPEECHACE_KEY` / `SPEECHACE_DIALECT` | (비움) | 상용 발음 평가 대안. 키는 클라이언트에 나가지 않는다 |

AI 응답 타임아웃 체인: CLI 프로세스 30분 > HTTP 30.5분 > 브라우저 31분 — 오류 메시지가 항상 서버에서 오도록 브라우저가 가장 늦게 끊는다.

---

## 🎨 디자인 시스템

| 테마 (`src/shared/tokens.jsx`) | 분위기 |
|---|---|
| **Midnight Aurora** (`aurora`, 기본) | 다크 + 오로라 그라디언트 |
| **Warm Ivory** (`ivory`) | 크림 + 테라코타 |
| **Sage Study** (`sage`) | 세이지 그린 |
| **Sunset Glass** (`sunset`) | 글래스모피즘 + 멀티 그라디언트 |

설정 패널(앱) 또는 Tweaks(캔버스)에서 라이브 전환. 모든 컴포넌트는 `theme` prop 을 받아 토큰으로만 색을 쓴다(하드코딩 금지). 스타일은 인라인이며 미디어쿼리는 `useMediaQuery` 훅으로 대신한다. 폰트: 본문 Pretendard Variable, 장식 Instrument Serif(이탤릭).

테마 추가: `JINA_THEMES` 에 기존 키를 전부 채운 항목을 넣고, `src/app.jsx` 의 `themeSwatches` 와 `src/main.jsx` 설정 패널의 스와치에 4색 미리보기를 추가.

---

## 🧭 새 페이지 추가하기

1. `src/screens/xxx.jsx` 에 데스크탑/모바일 컴포넌트를 만들고 `window.Xxx = …` 로 노출 (색은 `theme` 토큰만).
2. 서버 데이터가 필요하면 `src/shared/xxx-store.jsx` Context 스토어 — Provider 부재(캔버스)에서는 fallback 으로 무에러 렌더되어야 한다.
3. `index.html` **과** `canvas.html` 에 같은 순서로 `<script type="text/babel">` 태그 추가.
4. `src/shared/app-nav.jsx` 의 `APP_PAGES` 에 항목 추가(사이드바·모바일 탭·헤더 제목이 이 배열을 읽는다). 아직 화면이 없으면 `soon: true` 로 '준비 중' 배지만 노출 — 다른 페이지로 임의 매핑하지 않는다.
5. `src/main.jsx` 라우팅에 컴포넌트 연결, 필요하면 `src/app.jsx` 에 `<DCArtboard>` 추가.
6. `scripts/e2e-xxx.mjs` 로 완료 판정을 만든다(기대값은 서버 DTO 로).

---

## 🚀 남은 과제

- **발음 평가 실측 검증** — Phase 1·2 구현은 끝났고, 실제 사이드카를 켜서 `verify-pronunciation.mjs` 의 "틀리게 읽은 wav 점수가 낮은가" 를 통과시키는 단계. 스피킹 이력·점수 추이 저장은 플랜 10 Phase 3.
- **리스닝 시험 모드** — 서버 TTS 로 스크립트를 브라우저에 내려보내지 않는 완전 비노출 모드.
- **`daily_progress` 적재** 와 TOEIC 추정 점수 보정(세션 가중평균).
- **콘텐츠 확장** — Part 1~6 · TOEFL, 시나리오·토픽 추가(생성 파이프라인은 있음), 콘텐츠 관리 화면.
- **운영 준비** — 최소권한 DB 롤, `COOKIE_SECURE=true` + HTTPS, rate limit, 결제/구독, 모바일 앱 또는 PWA.

---

## 📚 문서

| 문서 | 내용 |
|---|---|
| [`docs/PLAN-vocab-backend.md`](docs/PLAN-vocab-backend.md) | 단어장 구현 계획(완료본). ①마이그레이션 규범 ②DTO+파생값 서버 단일 소스 ③Context 스토어(캔버스 fallback) ④CLI 프록시+JSON 스키마 — 이후 모든 탭이 복제한 4개 패턴 |
| [`docs/plan/01`](docs/plan/01-conversation.md) ~ [`10`](docs/plan/10-pronunciation-assessment.md) | 탭별 구현 계획서. 각 문서 안의 "상태" 블록이 구현 진척의 단일 소스 |
| [`db/README.md`](db/README.md) | 마이그레이션 규칙 · reset 주의 · 최소권한 롤 |
| [`lib/pronounce/README.md`](lib/pronounce/README.md) | 발음 평가 사이드카 설치(Docker/네이티브)·HTTP 계약·주의점 |
| [`docs/reviews/`](docs/reviews/) | 에이전트 리뷰·토론 기록 |
| [`docs/HANDOFF.md`](docs/HANDOFF.md), [`docs/OLLAMA-SETUP.md`](docs/OLLAMA-SETUP.md) | 프로토타입 시절 문서 — 아키텍처 절과 CORS 절은 브라우저 직결 기준이라 현재와 다름. 음성 색상 규격(HANDOFF §7)·트러블슈팅은 여전히 참고 가능 |

---

## ❓ FAQ

**Q. Ollama 를 `OLLAMA_ORIGINS="*"` 로 띄워야 하나요?**
A. 아니요. 지금은 API 서버가 Ollama 를 호출하므로 브라우저 CORS 설정이 필요 없습니다. `npm run ollama` 스크립트에 남아 있는 것은 구 문서 호환용입니다.

**Q. Claude API 키는 어디에 넣나요?**
A. 없습니다. `claude` provider 는 로컬에 설치되어 로그인된 **Claude CLI** 를 child_process 로 실행합니다. agy/codex/cursor 도 같습니다. 키를 서버에 두는 HTTP provider 는 없습니다(Ollama 제외).

**Q. "CLI_NOT_FOUND" / 503 이 나요.**
A. 선택한 provider 의 CLI 가 PATH 에 없거나 로그인이 풀린 상태입니다. `node scripts/try-provider.mjs <provider> "hello" --raw` 로 서버 없이 확인하세요. Windows 에서 agy 가 `.cmd` shim 으로 잡히면 실제 실행 파일 경로를 PATH 앞에 두세요.

**Q. 스피킹 점수가 이상해요 — 발음이 나빠도 100% 가 나와요.**
A. 기본 모드의 수치는 **받아쓰기 일치율**입니다. 브라우저 STT 는 문맥으로 단어를 보정하므로 발음 점수가 아닙니다(화면 하단에 명시). 발음 점수는 설정 → 음성 인식에서 OpenPronounce 를 켜야 나옵니다.

**Q. 로그인 화면이 안 나오고 바로 들어가요.**
A. `.env` 의 `DEV_AUTOLOGIN=1` 때문입니다. 로그아웃하면 그 탭에서는 재발급을 막고(`X-Jina-No-Autologin`), 완전히 끄려면 값을 지우세요. production 에서는 켤 수 없습니다.

**Q. 브라우저 콘솔에 API 요청이 막힌다고 나와요.**
A. 일부 브라우저 보안 확장은 교차 출처 localhost XHR 을 차단합니다. 지금은 정적 서버가 `/api/*` 를 중계하므로 브라우저는 3003 한 포트만 씁니다. 그래도 막히면 확장이 같은 출처 요청까지 막는 경우이니 해당 확장의 예외 설정이 필요합니다.

**Q. 캔버스(canvas.html)에서 저장이 안 돼요.**
A. 의도된 동작입니다. 캔버스는 읽기 전용이며 클라이언트·서버 양쪽에서 non-GET 을 차단합니다(`/api/ai/chat` 라이브 데모만 예외).

**Q. 한국어 응답이 어색해요.**
A. Ollama 의 작은 모델(3B 이하)은 한국어가 약합니다. 더 큰 모델을 쓰거나 CLI provider(claude 등)로 전환하세요.

---

## 📄 크레딧

- 디자인 영감: **Cake**, **Speak**, **Duolingo Max**, **Linear**
- 폰트: **Pretendard** (오리온코딩), **Instrument Serif** (Indian Type Foundry)
- 아이콘: 자체 제작 (24×24 stroke 기반)
- 발음 평가: [OpenPronounce](https://github.com/Halleck45/OpenPronounce) (MIT, Wav2Vec2 + DTW)
