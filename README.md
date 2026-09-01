# Jina — AI English Tutor

한국인 학습자를 위한 AI 영어 학습 사이트 프로토타입.
**TOEIC/TOEFL 시험 대비 · AI 회화 · 실시간 첨삭**.

> 이 저장소는 **HTML/React 기반의 디자인 프로토타입**입니다.
> 실제 AI 응답은 **Ollama (로컬)** 또는 **Claude (내장 API)**를 사용합니다.

---

## ⚡ 빠른 시작 (3분)

### 1. Ollama 설치 & 실행

**macOS / Linux:**
```bash
# 설치 (macOS)
brew install ollama
# 또는 https://ollama.com/download

# CORS 허용 모드로 실행 — 브라우저에서 호출하려면 필수
OLLAMA_ORIGINS="*" ollama serve
```

**Windows:**
```powershell
# https://ollama.com/download/windows 에서 설치
# PowerShell에서:
$env:OLLAMA_ORIGINS="*"
ollama serve
```

### 2. 모델 다운로드 (별도 터미널)

```bash
# 추천 — 한국어/영어 모두 양호, 4GB
ollama pull llama3.2

# 또는 더 가벼운 모델
ollama pull qwen2.5:3b

# 또는 더 정확한 모델 (8GB+)
ollama pull llama3.1:8b
```

### 3. 서버 실행 (정적 3003 + API 3004 동시)

```bash
npm install                 # pg / dotenv / playwright
cp .env.example .env        # PGHOST 등 실제 접속정보를 채운다 (.env는 git 미추적)
npm run db:migrate          # 최초 1회 — 0001~0008 마이그레이션
npm run db:seed             # 개발 계정(DEV_USER_EMAIL/PASSWORD) 생성
npm run dev                 # server.js(3003) + api/server.js(3004) 동시 실행, Ctrl+C로 둘 다 종료

# 그 다음 http://localhost:3003 접속
```

한쪽만 띄우려면 `npm run dev:web`(정적) / `npm run dev:api`(API). `npm run dev:all`은 `dev`와 동일(구 문서 호환).

**E2E (Playwright, 141개)** — `npm run dev`가 떠 있는 상태에서 `node scripts/e2e-{vocab,conversation,lesson,dashboard,progress,auth}.mjs`.
브라우저·CDN 설정은 `scripts/e2e-env.mjs`가 환경에 맞게 고른다: 기본은 Playwright 번들 chromium(`channel: chromium`),
`PW_CHROMIUM=<실행파일>`로 교체 가능, unpkg가 막힌 환경은 `E2E_VENDOR=<react/react-dom/babel 로컬 디렉터리>`. 회화·단어장 스위트는 실제 AI provider(CLI) 호출이 필요하다.
다른 포트의 인스턴스를 검증할 때는 `E2E_BASE=http://localhost:3103 E2E_API=http://localhost:3104`처럼 대상 주소를 넘긴다(기본 3003/3004). 데스크탑 페이지 이동은 `aside[aria-label="주요 메뉴"]`(공통 사이드바) 기준이다.
CLI 세션 resume 하이브리드는 `node scripts/verify-resume.mjs [provider]`로 따로 검증한다 — 턴1(새 세션) → 턴2(히스토리 없이 resume, 맥락 기억) → 핸들 훼손 후 턴3(히스토리 폴백) 12개 단정, 끝나면 검증 세션을 삭제한다.
발음 평가 경로(플랜 10)는 `node scripts/verify-pronunciation.mjs`로 검증한다 — 정규화·multipart 파서 단정은 서버 없이 항상 돌고, 실호출(사이드카 `lib/pronounce` 또는 `SPEECHACE_KEY`)은 백엔드가 없으면 스킵된다(실패 아님). 픽스처 wav 는 `--good/--bad`로 주거나 espeak-ng 가 있으면 합성한다.

### 4. 설정 확인

화면 우측 상단 **Tweaks** 토글 → AI 제공자 패널에서:
- Provider: **ollama** (기본값)
- Ollama URL: `http://localhost:11434`
- 모델: 위에서 받은 모델 선택
- "연결됨 · N개 모델"이 표시되면 OK

→ "Jina와 대화" 또는 학습 페이지의 **"Jina에게 물어보기"**에서 영어로 입력하면 실제 AI 응답을 받습니다.

---

## 📂 파일 구조

```
.
├── index.html                        # 진입점 (스크립트 로더만)
├── package.json
├── README.md
├── docs/
│   ├── HANDOFF.md                    # 프로덕션 전환 기술 상세
│   └── OLLAMA-SETUP.md              # Ollama 설치 가이드
└── src/
    ├── app.jsx                       # App 컴포넌트 + Tweaks 패널 구성
    ├── shared/
    │   ├── tokens.jsx                # 4개 테마 정의 (aurora/ivory/sage/sunset)
    │   ├── icons.jsx                 # 커스텀 SVG 아이콘 세트
    │   └── ai-provider.jsx           # Ollama/Claude 통합 어댑터 + 시스템 프롬프트
    ├── canvas/
    │   ├── design-canvas.jsx         # 캔버스 셸 (pan/zoom/포커스)
    │   ├── ios-frame.jsx             # iOS 26 디바이스 프레임
    │   └── tweaks-panel.jsx          # Tweaks UI 컨트롤
    ├── runtime/
    │   └── chat-runtime.jsx          # useJinaChat 훅, 메시지 버블, 입력 바
    └── screens/
        ├── dashboard-desktop.jsx     # 데스크탑 대시보드
        ├── conversation-desktop.jsx  # 데스크탑 회화 (사이드바/시나리오/피드백)
        ├── lesson.jsx                # TOEIC Part 7 리딩 — 데스크탑 + 모바일
        ├── mobile.jsx                # 모바일 대시보드 + 모바일 회화
        ├── vocabulary.jsx            # 단어장 — SRS 플래시카드 + AI 추가 — 데스크탑 + 모바일
        └── progress.jsx              # 학습 통계 — 점수 추이/스킬/첨삭 — 데스크탑 + 모바일
```

---

## 🎨 디자인 시스템

### 컬러 테마 (4종)

| 테마 | 분위기 | 사용 케이스 |
|-----|------|----------|
| **Midnight Aurora** | 다크 + 오로라 그라디언트 | 프리미엄 (Duolingo Max 풍) — 기본값 |
| **Warm Ivory** | 크림 + 테라코타 | 에디토리얼, 학구적 |
| **Sage Study** | 세이지 그린 + 차분 | 집중 학습 모드 |
| **Sunset Glass** | 글래스모피즘 + 멀티 그라디언트 | 에너제틱, 캐주얼 |

Tweaks 패널에서 라이브 전환. 모든 컴포넌트는 `theme` prop을 받아 토큰 기반 스타일링.

### 타이포그래피

- **본문**: Pretendard Variable (한국어 최적화)
- **장식 / 헤드라인**: Instrument Serif (이탤릭) — "Jina" 로고, 큰 숫자, 강조

---

## 🤖 AI 통합

### 응답 스키마

모든 AI 호출은 다음 JSON 구조를 반환하도록 시스템 프롬프트로 강제:

```json
{
  "reply_en": "Jina의 영어 응답 (1-3문장)",
  "reply_ko": "한국어 간단 요약 또는 null",
  "corrections": [
    {
      "original": "should to go",
      "corrected": "should go",
      "reason": "should 뒤에는 동사원형이 옵니다",
      "type": "grammar"
    }
  ],
  "scores": { "grammar": 74, "fluency": 88, "vocabulary": 81 },
  "suggestion": "다음에 시도해볼 표현 (한국어)"
}
```

### Provider 추상화

`ai-provider.jsx` — 단일 함수 `askJina({ history, userMessage })`:

```javascript
const res = await window.JINA_AI.askJina({
  history: [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }],
  userMessage: 'Hi Jina, can you help me?'
});
// res.ok === true → res.data 에 위 JSON 스키마
// res.ok === false → res.error 에 메시지
```

**Provider 추가 방법** — `ai-provider.jsx`에 `callXxx()` 추가하고 `askJina()`의 분기에 케이스 추가.

### Ollama CORS

브라우저에서 직접 `localhost:11434`를 호출하려면 Ollama가 CORS를 허용해야 합니다:

```bash
# 매번
OLLAMA_ORIGINS="*" ollama serve

# 영구 설정 (macOS)
launchctl setenv OLLAMA_ORIGINS "*"

# 영구 설정 (Linux systemd)
# /etc/systemd/system/ollama.service 에 Environment="OLLAMA_ORIGINS=*" 추가
```

---

## 🚀 실제 서비스로 만들기 — 단계별 로드맵

이 프로토타입은 **프론트엔드 UI/UX의 완성된 청사진**입니다.
실제 SaaS로 출시하려면 다음 작업이 필요합니다.

### Phase 1 — 백엔드 (4-6주)

- [x] **사용자 인증** — `api/` 자체 구현 (scrypt + 세션 쿠키, `docs/PLAN-vocab-backend.md` Phase 2)
- [ ] **DB 스키마** (구현된 것은 체크, 명명은 실제 마이그레이션 기준):
  - [x] `users` / `auth_sessions` — 인증 (`db/migrations/0001_auth.sql`)
  - [x] `vocab_words` / `user_vocab_cards` / `vocab_reviews` — 단어장 + SRS (`0002_vocab.sql`)
  - [x] `lessons` / `lesson_items` / `user_lesson_attempts` — 콘텐츠 + 서버 채점 (`0005_lessons.sql`, `0006_lessons_seed.sql`)
  - [x] `lesson_qa_sessions` + `user_lesson_attempts.skill_code` — 레슨 Jina Q&A(`0011_lesson_qa.sql`, `docs/plan/07-…md` Phase 1). `POST /api/lessons/:id/qa`는 서버가 지문(제출 전)·문항+내 답(제출 후)만 조립해 AI task `lesson_qa`에 넘기고 정답·해설은 어떤 경로로도 미전송, 인용은 지문 부분문자열 검증, 제출 후엔 CLI 세션 resume. `GET /api/lessons?kind=&status=`, `GET /api/lessons/recommended`(대시보드와 같은 `recommendLessons`), 레슨 목록 뷰
  - [x] `conversation_sessions` / `conversation_messages` — 회화 (`0004_conversation.sql`)
  - [x] `corrections` — 누적 첨삭 기록 (`0004_conversation.sql`)
  - [x] `correction_reviews` / `user_goals` — 첨삭 SRS + 목표 (`0007_user_goals.sql`, `0008_progress.sql`)
  - [x] `vocab_quizzes` — 단어장 '오늘의 단어' AI 퀴즈 (`0010_vocab_quizzes.sql`, `docs/plan/06-vocab-daily-quiz.md`).
        주제(랜덤/최신 뉴스/게임/블로그/키워드)로 AI가 10단어 4지선다 퀴즈를 만들고(`POST /api/vocab/quiz`, task `vocab_quiz`),
        서버가 채점(`…/answer`)하며 틀린 단어/전체를 AI 재호출 없이 단어장에 추가(`…/add`). 뉴스·블로그는 AI 지식 기준(실시간 검색 아님)
  - [x] **단어 발음(🔊)** — `src/shared/speech.jsx`: 브라우저 Web Speech API(외부 TTS 없음)로 퀴즈 단어·예문, 플래시카드, 단어 목록, 회화 '오늘의 단어', 학습 지문 '듣기'를 읽어준다. 퀴즈는 '자동 발음' 토글(기기 설정). Phase 2 TTS(ElevenLabs/Azure)로 갈 때 `jinaSpeak` 구현만 교체
  - [x] `conversation_sessions.provider_ref` + `provider_ref_provider` — CLI 세션 resume 핸들 (`0009_provider_session.sql`).
        같은 provider 로 이어지는 턴은 히스토리 없이 `--resume`(claude) / `exec resume`(codex) / `--conversation`(agy) / `--resume`(cursor)로 보내고,
        resume 실패·provider 전환·ollama 는 예전처럼 최근 8턴 히스토리를 새 세션에 재전송 (DB 가 단일 소스, 응답 `meta.resumed`)
  - [ ] `daily_progress` — 일별 학습량/정확도/연속일수의 **적재**. v1은 저장 없이
        `vocab_reviews`/`user_lesson_attempts`/`conversation_messages` 실시간 집계
        (`api/services/dashboard.service.js`, `progress.service.js`) — 데이터가 커지면 후속 과제
- [x] **AI 프록시 서버** — `api/ai/` CLI 프록시 5종 (claude/agy/codex/cursor/ollama), 브라우저 직결 폐기
- [x] **TOEIC 점수 추정 (v1)** — 레슨 정답률 기반 단일 산식 `200 + 790 × accuracy`
      (문항 3개 미만이면 `null` + 빈 상태). 세션 가중평균·보정은 후속 과제

### Phase 2 — 음성 기능 (3-4주)

현재 음성은 **시각 데모**입니다. 실제 구현:

| 기능 | 추천 서비스 |
|------|-----------|
| **음성 인식 (STT)** | Whisper (OpenAI) / Deepgram / Google Speech-to-Text |
| **음성 합성 (TTS)** | ElevenLabs / Cartesia / Azure Neural Voice |
| **발음 평가** | Azure Pronunciation Assessment / SpeechAce / 자체 학습 모델 |

브라우저에서:
- `MediaRecorder` API로 사용자 음성 캡처 → 백엔드로 업로드 → STT → 텍스트로 AI에 전달
- AI 응답을 TTS로 변환 → `<audio>` 재생
- 발음 평가 결과를 단어별 색상 하이라이트로 표시 (이미 UI는 준비됨)

### Phase 3 — 콘텐츠 시스템 (지속)

- [ ] TOEIC Part 1-7, Speaking Q1-Q11, Writing Q1-Q3 문제 풀
- [ ] TOEFL iBT 4섹션 문제 풀
- [ ] 비즈니스 시나리오 50+종 (회화)
- [ ] 단어장 5000+ 표제어 + SRS 알고리즘
- [ ] 콘텐츠 CMS (Sanity / Strapi / 자체 admin)

### Phase 4 — 결제 & 운영 (2-3주)

- [ ] **Jina Pro** 구독 (Stripe / 토스페이먼츠)
- [ ] 무료 티어: 일 5회 AI 회화, 단어장 100개 제한
- [ ] Pro: 무제한 + 발음 분석 + 고급 첨삭 + 음성

### Phase 5 — 모바일 (4-6주)

- [ ] React Native / Flutter로 iOS/Android 앱
- [ ] 또는 PWA + 오프라인 단어장
- [ ] 푸시 알림 (학습 리마인더, SRS 복습)

---

## 🛠️ 백엔드 API 설계 예시

```
POST /api/auth/signup
POST /api/auth/login

GET  /api/me                       # 프로필 + 진도
PATCH /api/me                      # 목표 변경 등

GET  /api/lessons?type=toeic-part7 # 레슨 목록
GET  /api/lessons/:id              # 단일 레슨

POST /api/sessions                 # 회화 세션 시작
  → { id, scenario_id, system_prompt }
POST /api/sessions/:id/messages    # 메시지 전송 (AI 호출)
  body: { text, audio_url? }
  → { reply_en, reply_ko, corrections, scores, suggestion }
GET  /api/sessions/:id             # 세션 전체 조회

POST /api/speech/recognize         # 음성 → 텍스트 + 발음 점수
  body: { audio_blob, expected_text? }
POST /api/speech/synthesize        # 텍스트 → 음성 URL
  body: { text, voice: "jina-default" }

GET  /api/vocab/due                # 오늘 복습할 단어 (SRS)
POST /api/vocab/:id/review         # 복습 결과 (잘함/모름)

GET  /api/progress?period=week     # 학습 통계
```

---

## 🧪 개발 팁

### 로컬 LLM 추천 모델 비교

| 모델 | 크기 | 한국어 | 영어 첨삭 | 속도 |
|------|------|--------|---------|------|
| `qwen2.5:3b` | 2GB | ◯ | △ | ⚡⚡⚡ |
| `llama3.2` | 4GB | ◎ | ◯ | ⚡⚡ |
| `llama3.1:8b` | 8GB | ◎ | ◎ | ⚡ |
| `qwen2.5:14b` | 9GB | ◎ | ◎◎ | 🐌 |

→ **개발 중**: `qwen2.5:3b` 추천 (빠른 반복)
→ **데모**: `llama3.2` 추천 (균형)
→ **프로덕션 후보**: 클라우드 API (GPT-4o / Claude Sonnet / Gemini)

### 테마 추가하기

`tokens.jsx`의 `JINA_THEMES` 객체에 새 항목 추가:

```javascript
mytheme: {
  name: 'My Theme',
  bg: '#xxxxxx',
  // ... (기존 키 전체 채우기)
  isDark: false,
}
```

그 다음 `src/app.jsx`의 `themeSwatches`에 4색 미리보기 추가.

### 새 학습 콘텐츠 화면 추가하기

1. `src/screens/lesson-listening.jsx` 같은 파일 생성
2. `LessonListening` 컴포넌트 export → `window.LessonListening = ...`
3. `index.html`에 `<script type="text/babel" src="src/screens/lesson-listening.jsx">` 태그 추가
4. `src/app.jsx`의 `DesignCanvas` 안에 `<DCArtboard>` 추가

---

## 📦 의존성

CDN 로드 (별도 빌드 없음):

- React 18.3.1
- ReactDOM 18.3.1
- Babel Standalone 7.29.0
- Pretendard Variable (jsDelivr CDN)
- Instrument Serif (Google Fonts)

브라우저: 최신 Chrome / Safari / Firefox / Edge.

---

## 📄 라이선스 / 크레딧

- 디자인 영감: **Cake**, **Speak**, **Duolingo Max**, **Linear**
- 폰트: **Pretendard** (오리온코딩), **Instrument Serif** (Indian Type Foundry)
- 아이콘: 자체 제작 (24×24 stroke 기반)

---

## ❓ FAQ

**Q. 왜 브라우저에서 직접 Ollama를 호출하나요? 보안 문제는?**
A. 프로토타입 단계 한정입니다. 실제 서비스에서는 백엔드 프록시를 두고 사용자 인증 후 호출해야 합니다. 로컬 데모에서만 안전합니다.

**Q. Claude API 키는 어디서 받나요?**
A. 이 프로토타입은 호스팅 환경 내장 `window.claude.complete()`를 사용하므로 별도 키가 필요 없습니다. 실제 배포 시 [Anthropic Console](https://console.anthropic.com)에서 발급받아 백엔드에 보관하세요.

**Q. 한국어 응답이 어색해요.**
A. 작은 모델(3B 이하)은 한국어가 약합니다. `llama3.1:8b`나 `qwen2.5:7b` 이상을 추천하거나, Claude/GPT-4o로 전환하세요.

**Q. Tweaks 패널이 안 보여요.**
A. 화면 좌상단의 Tweaks 토글 버튼을 누르면 됩니다 (편집 모드 활성화 시 표시).
