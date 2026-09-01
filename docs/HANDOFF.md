# Developer Handoff — Jina English Tutor

프로토타입에서 **실제 프로덕션 서비스**로 전환할 때 필요한 기술 상세.

---

## 1. 아키텍처 — 현재 vs. 프로덕션

### 현재 (프로토타입)

```
┌──────────────────────────────┐
│        Browser               │
│  ┌────────────────────────┐  │
│  │  React (CDN + Babel)   │  │
│  │  ai-provider.jsx       │──┼─► fetch http://localhost:11434/api/chat
│  └────────────────────────┘  │     (Ollama, CORS 허용 모드)
│                              │
│                          ──┼─► window.claude.complete()
│                              │     (호스팅 환경 내장)
└──────────────────────────────┘
```

**한계**:
- API 키가 클라이언트에 노출되면 안 됨 → Claude 직접 호출 불가
- Rate limit 제어 불가
- 학습 데이터 저장 안 됨 (페이지 새로고침 시 소실)
- 음성 기능은 시각 데모만

### 프로덕션 권장 구조

```
┌─────────────────┐      ┌─────────────────────┐      ┌─────────────┐
│   Web / iOS /   │ HTTPS│   API Gateway       │      │   LLM       │
│   Android       │─────►│   (Next.js API /    │─────►│   - Claude  │
│                 │      │   Hono / FastAPI)   │      │   - GPT-4o  │
│                 │      │                     │      │   - Ollama  │
│                 │      │   ┌──────────────┐  │      │     (self)  │
│                 │      │   │ Auth         │  │      └─────────────┘
│                 │      │   │ Rate Limit   │  │      
│                 │      │   │ Logging      │  │      ┌─────────────┐
│                 │      │   │ Caching      │  │─────►│   Speech    │
│                 │      │   └──────────────┘  │      │   - Whisper │
│                 │      │                     │      │   - ElevenLabs
│                 │      └──────┬──────────────┘      └─────────────┘
└─────────────────┘             │
                                ▼
                       ┌──────────────────┐
                       │  Postgres        │
                       │  + Redis (cache) │
                       │  + S3 (audio)    │
                       └──────────────────┘
```

---

## 2. 데이터 모델 (Postgres)

> ⚠️ **구현 반영 노트** (docs/PLAN-vocab-backend.md 로 구현된 부분과의 차이):
> - `users.id`는 UUID가 아니라 **BIGSERIAL** 로 구현됨 (`db/migrations/0001_auth.sql`) —
>   psql 디버깅 용이, user_id는 URL에 노출되지 않음. 인증 세션 테이블은 아래의 회화용
>   `sessions`와 구분해 **`auth_sessions`** 로 명명.
> - `vocab_words`/`user_vocab_cards`는 `0002_vocab.sql` 기준이 정본 (`vocab_reviews` 추가,
>   `word_key` 생성 컬럼, 개인 override 컬럼 등).
> - 회화 테이블은 기존 DB의 타 앱 테이블(`study_sessions` 등)과의 충돌을 피해
>   `conversation_sessions`/`conversation_messages` 접두 명명을 권장 (`docs/plan/01-conversation.md`).
> - **학습 콘텐츠는 `0005_lessons.sql`이 정본** (`docs/plan/02-lesson.md`로 구현):
>   아래 스케치의 `lessons.id TEXT PK` / `user_id UUID` 대신 `lessons.id BIGSERIAL PK` +
>   `slug TEXT UNIQUE`('toeic-part7-set23'), `user_id BIGINT`. `content JSONB` 한 덩어리 대신
>   문항을 **`lesson_items` 행으로 분리** — `answer`/`explanation`을 GET 쿼리의 컬럼 나열에서
>   아예 빼는 것이 정답 비노출의 구조적 보장이기 때문(JSONB 한 덩어리면 매 요청 jsonb 수술이
>   필요하고 실수 한 번에 정답이 샌다). 시도 기록은 `user_lesson_attempts`
>   (`correct_count`/`total_count`는 채점 시점의 **사실 기록**, `score`·`progress.done/total`·
>   `attempt_count`·`best_correct`는 **저장하지 않는 파생값**), 멱등키는
>   `client_request_id UUID` + partial unique index.

```sql
-- 사용자
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  korean_name   TEXT,
  target_test   TEXT,  -- 'toeic' | 'toefl' | 'opic'
  target_score  INT,
  current_score INT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  is_pro        BOOLEAN DEFAULT false,
  pro_until     TIMESTAMPTZ
);

-- 시나리오 (회화 주제)
CREATE TABLE scenarios (
  id            TEXT PRIMARY KEY,    -- 'toeic-speaking-q11-vendor'
  category      TEXT NOT NULL,       -- 'toeic_speaking' | 'business' | 'daily'
  level         TEXT,                -- 'A2' | 'B1' | 'B2' | 'C1'
  title         JSONB,               -- { ko, en }
  description   JSONB,
  system_prompt TEXT NOT NULL,       -- LLM 시스템 메시지
  duration_min  INT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 회화 세션
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  scenario_id   TEXT REFERENCES scenarios(id),
  started_at    TIMESTAMPTZ DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  message_count INT DEFAULT 0,
  avg_score     INT,                 -- 0-100
  metadata      JSONB
);

CREATE TABLE messages (
  id            BIGSERIAL PRIMARY KEY,
  session_id    UUID REFERENCES sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,       -- 'user' | 'assistant'
  content       TEXT NOT NULL,       -- 영어 원문
  content_ko    TEXT,                -- 한국어 보조
  audio_url     TEXT,                -- S3 (사용자 음성 또는 TTS)
  corrections   JSONB,               -- 첨삭 배열
  scores        JSONB,               -- {grammar, fluency, vocab, pronunciation}
  llm_provider  TEXT,                -- 'claude' | 'openai' | 'ollama'
  llm_model     TEXT,
  llm_latency_ms INT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);

-- 누적 첨삭 (SRS 복습용 — 사용자가 자주 틀린 패턴)
CREATE TABLE corrections (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  message_id    BIGINT REFERENCES messages(id) ON DELETE CASCADE,
  original      TEXT NOT NULL,
  corrected     TEXT NOT NULL,
  reason        TEXT,
  type          TEXT,                -- 'grammar' | 'usage' | 'spelling'
  reviewed_at   TIMESTAMPTZ,
  next_review   TIMESTAMPTZ,         -- SRS 다음 복습일
  ease_factor   FLOAT DEFAULT 2.5,
  interval_days INT DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 단어장
CREATE TABLE vocab_words (
  id            BIGSERIAL PRIMARY KEY,
  word          TEXT UNIQUE NOT NULL,
  pos           TEXT,                -- v., n., adj. ...
  ipa           TEXT,
  meaning_ko    TEXT,
  examples      JSONB,               -- ["...", "..."]
  difficulty    INT                  -- 1-5
);

CREATE TABLE user_vocab_cards (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  word_id       BIGINT REFERENCES vocab_words(id),
  added_at      TIMESTAMPTZ DEFAULT now(),
  next_review   TIMESTAMPTZ,
  interval_days INT DEFAULT 1,
  ease_factor   FLOAT DEFAULT 2.5,
  review_count  INT DEFAULT 0,
  fail_count    INT DEFAULT 0,
  UNIQUE(user_id, word_id)
);

-- 일별 진도
CREATE TABLE daily_progress (
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  minutes       INT DEFAULT 0,
  sessions_done INT DEFAULT 0,
  words_added   INT DEFAULT 0,
  accuracy      FLOAT,
  PRIMARY KEY (user_id, date)
);

-- 콘텐츠 (TOEIC 문제 등)
CREATE TABLE lessons (
  id            TEXT PRIMARY KEY,    -- 'toeic-part7-set23'
  type          TEXT,                -- 'toeic_part5' | 'toeic_part7' | 'toefl_reading'
  difficulty    INT,
  duration_min  INT,
  content       JSONB NOT NULL,      -- passage, questions, vocab
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_lesson_attempts (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  lesson_id     TEXT REFERENCES lessons(id),
  answers       JSONB,
  score         INT,
  started_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
```

---

## 3. API 명세

### Auth
```
POST   /api/auth/signup          { email, password, name }
POST   /api/auth/login           { email, password } → { token }
POST   /api/auth/refresh
POST   /api/auth/logout
```

### User
```
GET    /api/me                   → { profile, streak, current_score, ... }
PATCH  /api/me                   { target_score, korean_name, ... }
GET    /api/me/progress?period=week|month → { daily: [...], totals: {...} }
GET    /api/me/skills            → { listening, reading, speaking, writing } (0-100)
```

### Lessons (학습 콘텐츠) — **구현됨** (`api/routes/lesson.routes.js`, `docs/plan/02-lesson.md`)
```
GET    /api/lessons              → { ok, lessons: [LessonSummary…], progress: { done, total } }
                                   LessonSummary: id, slug, kind, title, subtitle, difficulty,
                                   est_minutes, question_count, attempt_count, best_correct,
                                   last_attempted_at   (뒤 4개는 attempts 집계 파생값)
GET    /api/lessons/:id          → { ok, lesson: LessonDetail }
                                   passage, questions[{n, stem, options[{id,text}]}], vocabulary,
                                   faq, attempt_count, best_correct, question_count, next_lesson_id
                                   ★ answer / explanation / correct 키는 응답에 존재하지 않는다
POST   /api/lessons/:id/attempts { answers: { "1": "B", … }, client_request_id?, elapsed_ms? }
                                 → { ok, attempt: { id, lesson_id, correct_count, total_count,
                                                    score, created_at },
                                      results: { "1": { your, correct, answer, explanation }, … },
                                      progress: { done, total }, replay? }
                                   채점은 전부 서버. 정답·해설은 이 응답에만 실린다.
                                   answers 키는 문항 position 집합과 정확히 일치해야 한다(아니면 400).
                                   같은 client_request_id 재전송 → 새 행 없이 replay:true.
GET    /api/lessons/recommended  → 후속 (미구현). 구현 시 라우터 등록순 first-match이므로
                                   반드시 /api/lessons/:id 보다 먼저 등록할 것.
```
모든 라우트는 `requireUser`. 비GET은 `X-Requested-With` 필수, 캔버스(`X-Jina-Mode: canvas`)는
`READONLY` 403 — 전역 미들웨어가 처리한다.

### Conversation (AI 회화)
```
GET    /api/scenarios?category=toeic_speaking
POST   /api/sessions             { scenario_id }
       → { id, initial_message: { reply_en, reply_ko } }

POST   /api/sessions/:id/messages
       Content-Type: multipart/form-data (audio_blob 있을 때) or application/json
       Body:
         text?:        string         (음성 없을 때)
         audio_blob?:  Blob           (음성 입력)
       Response:
         user_message: { text, corrections, scores, pronunciation? }
         assistant:    { reply_en, reply_ko, suggestion, audio_url? }

GET    /api/sessions/:id         → 전체 메시지 히스토리
GET    /api/me/sessions          → 최근 세션 목록
```

### Speech
```
POST   /api/speech/recognize     multipart: audio + expected_text?
       → { text, confidence, pronunciation_score?, word_scores? }

POST   /api/speech/synthesize    { text, voice?: 'jina-default' }
       → { url, duration_ms }
```

### Vocabulary
```
GET    /api/vocab/due            → 오늘 복습할 단어
POST   /api/vocab/:card_id/review { result: 'easy'|'good'|'hard'|'again' }
POST   /api/vocab/add            { word }   # AI가 자동으로 의미/예문 생성
```

### Corrections
```
GET    /api/me/corrections?since=2025-05-20
GET    /api/me/corrections/due   → SRS 복습할 첨삭 패턴
POST   /api/me/corrections/:id/review { result }
```

---

## 4. LLM 백엔드 호출 — 의사코드

```typescript
// POST /api/sessions/:id/messages
async function handleMessage(req, res) {
  const userId = req.auth.userId;
  const sessionId = req.params.id;
  const { text, audio_blob } = req.body;

  // 1) 음성이면 STT
  let userText = text;
  let pronunciationScore = null;
  if (audio_blob) {
    const stt = await whisper.transcribe(audio_blob, { language: 'en' });
    userText = stt.text;
    pronunciationScore = await pronunciationAssess(audio_blob, userText);
  }

  // 2) 세션 컨텍스트 로드
  const session = await db.sessions.findById(sessionId);
  const history = await db.messages.findBySession(sessionId, { limit: 20 });
  const scenario = await db.scenarios.findById(session.scenario_id);

  // 3) Rate limit / 무료 사용자 체크
  if (!user.is_pro && (await getTodayMessageCount(userId)) >= 5) {
    return res.status(429).json({ error: 'free_limit_reached' });
  }

  // 4) LLM 호출 — JSON 스키마 강제
  const completion = await llm.chat({
    model: pickModel(user.is_pro),  // pro → claude-sonnet, free → claude-haiku
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: scenario.system_prompt + JINA_JSON_SCHEMA_PROMPT },
      ...history.map(formatForLLM),
      { role: 'user', content: userText }
    ]
  });
  const parsed = JSON.parse(completion.content);

  // 5) DB 저장
  const userMsg = await db.messages.insert({
    session_id: sessionId, role: 'user',
    content: userText, audio_url: audio_blob ? await uploadToS3(audio_blob) : null,
    corrections: parsed.corrections,
    scores: { ...parsed.scores, pronunciation: pronunciationScore }
  });
  const assistantMsg = await db.messages.insert({
    session_id: sessionId, role: 'assistant',
    content: parsed.reply_en, content_ko: parsed.reply_ko,
    llm_provider: 'anthropic', llm_model: completion.model
  });

  // 6) 첨삭 SRS 큐에 추가
  for (const c of parsed.corrections) {
    await db.corrections.insert({
      user_id: userId, message_id: userMsg.id,
      original: c.original, corrected: c.corrected, reason: c.reason, type: c.type,
      next_review: addDays(now(), 1)
    });
  }

  // 7) TTS (옵션 — pro 사용자만)
  let audioUrl = null;
  if (user.is_pro) {
    audioUrl = await elevenLabs.synthesize(parsed.reply_en, { voice: 'jina' });
  }

  res.json({
    user_message: { text: userText, corrections: parsed.corrections, scores: ... },
    assistant: { ...parsed, audio_url: audioUrl }
  });
}
```

---

## 5. 시스템 프롬프트 (참고)

```text
당신은 'Jina', 한국인 학습자를 위한 AI 영어 튜터입니다.
사용자는 한국인이며 {target_test} 점수 {target_score}을 목표로 합니다.
현재 레벨: {current_level} · 약점: {weakness_topics}.

대화 규칙:
- 영어로 답하되, 한국어 보조 설명을 곁들이세요.
- 사용자의 영어가 어색하면 친근하게 첨삭하세요.
- 시험 시나리오라면 채점 기준에 따라 점수를 매기세요.
- 너무 길게 말하지 마세요. (최대 3문장)
- 사용자가 막히면 한 번에 하나씩 힌트를 주세요.

응답은 반드시 다음 JSON 형식으로만 출력하세요:
{
  "reply_en": "...",
  "reply_ko": "..." | null,
  "corrections": [{ "original": "...", "corrected": "...", "reason": "...", "type": "grammar|usage|spelling" }],
  "scores": { "grammar": 0-100, "fluency": 0-100, "vocabulary": 0-100 },
  "suggestion": "..." | null
}
```

---

## 6. 비용 추정

월간 활성 사용자 1만 명 가정, 1인당 일 5회 메시지:

| 항목 | 모델 | 단가 | 월 비용 |
|------|------|------|--------|
| 회화 LLM (Pro) | Claude Sonnet | $3/1M in, $15/1M out | ~$1,200 |
| 회화 LLM (Free) | Claude Haiku | $0.25/1M in, $1.25/1M out | ~$200 |
| 음성 인식(전사) | Whisper API | $0.006/min | ~$300 |
| 발음 평가 | Speechace / Azure 중 택1 | 계약 단가 확인 필요 | 별도 산정 |
| 음성 합성 | ElevenLabs | $0.30/1k chars | ~$800 |
| DB / 호스팅 | Supabase + Vercel | — | ~$200 |
| **합계** | | | **~$2,700 / 월** |

→ Pro $9.99/월 × 500명 = $5,000 → 손익분기 약 540명 Pro 사용자.

---

## 7. 음성 기능 구현 가이드

### 사용자 음성 캡처 (브라우저)

```javascript
let mediaRecorder, chunks = [];

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.start();
}

async function stopRecording() {
  return new Promise(resolve => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      chunks = [];
      resolve(blob);
    };
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  });
}

// 사용
await startRecording();
// ... user speaks
const audioBlob = await stopRecording();
const form = new FormData();
form.append('audio_blob', audioBlob);
await fetch('/api/sessions/xxx/messages', { method: 'POST', body: form });
```

### 발음 점수 색상 매핑

> ⚠ `word_scores` 는 **발음 평가 API**(Speechace/Azure 또는 자체 GOP)가 주는 값이다.
> Whisper 는 전사 모델이라 이 값을 만들지 못한다 — 방식 비교와 선택 기준은
> [docs/plan/10-pronunciation-assessment.md](plan/10-pronunciation-assessment.md) 참조.
> 현재 스피킹 화면의 '일치율'은 브라우저 STT 기반 단어 매칭이며 발음 점수가 아니다.

```javascript
function wordColor(score) {
  if (score >= 85) return theme.success;
  if (score >= 65) return theme.warning;
  return theme.error;
}
// word_scores: [{ word: 'should', score: 92 }, { word: 'recommend', score: 58 }, ...]
```

---

## 8. 테스트 전략

- **E2E**: Playwright — 로그인 → 회화 시작 → 메시지 전송 → 응답 확인
- **LLM 응답 검증**: JSON 스키마 자동 검사, 유효하지 않으면 재시도 (최대 2번)
- **부하**: k6로 동시 100세션 가정
- **A/B**: 시스템 프롬프트 변경 시 retention 측정

---

## 9. 보안 체크리스트

- [ ] API 키는 백엔드에만 (Vercel/Render 환경 변수)
- [ ] LLM 응답에서 사용자 입력 그대로 echo back 시 XSS 방지 (React 기본 escape OK)
- [ ] Rate limit: 분당 10회 / 시간당 60회
- [ ] 음성 파일은 사용자 본인만 접근 (S3 signed URL)
- [ ] CORS는 자사 도메인만 허용
- [ ] 데이터 삭제 요청 처리 (GDPR / PIPA)

---

## 10. 출시 후 KPI

- DAU/MAU
- 평균 일일 학습 시간
- 회화 세션 완료율
- 7일/30일 retention
- 첨삭당 사용자 평균 점수 변화
- Free → Pro 전환율
- 모의고사 예상점수 정확도 (실제 시험 점수 대비)
