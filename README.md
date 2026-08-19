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

### 3. 프로토타입 열기

`index.html`을 브라우저에서 열거나 로컬 서버로 서빙:

```bash
# Python
python3 -m http.server 8000
# 또는 Node
npx serve

# 그 다음 http://localhost:8000 접속
```

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
  - [x] `conversation_sessions` / `conversation_messages` — 회화 (`0004_conversation.sql`)
  - [x] `corrections` — 누적 첨삭 기록 (`0004_conversation.sql`)
  - [ ] `daily_progress` — 일별 학습량, 정확도, 연속 학습일
- [x] **AI 프록시 서버** — `api/ai/` CLI 프록시 5종 (claude/agy/codex/cursor/ollama), 브라우저 직결 폐기
- [ ] **TOEIC 점수 추정 모델** — 최근 N개 세션의 점수 가중평균 + 보정

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
