# Trio Chat

- 주제: [토론 주제] Jina English Tutor — 섹션별 현재 상태 점검과 다음 개발 계획 (부족한 세 영역 중심)

당신은 이 프로젝트의 개발 계획을 함께 세우는 시니어 엔지니어입니다. 다른 참가자의 의견을 읽고 동의/반박/보완하며, 마지막 라운드에는 실행 가능한 플랜으로 수렴해 주세요. 한국어로, 각 발언은 700자 이내로 간결하게. 추상적 조언보다 이 프로젝트의 제약에 맞는 구체적 설계(테이블·API·화면·AI task 단위)를 제시하세요.

## 프로젝트 요약
- 한국인 학습자용 AI 영어 튜터 웹앱(TOEIC/TOEFL). 프론트: React 18 + in-browser Babel(빌드 없음, `src/**/*.jsx`가 `window.*` 전역으로 공유), 라우터 없이 `page` state 하나. 백엔드: Node `node:http`(Express 없음) + PostgreSQL(`db/migrations/*.sql` 자체 러너, 체크섬·down 파일 규범), 의존성은 `pg`만.
- AI는 브라우저 직결이 아니라 서버의 **CLI 프록시**(claude / codex / cursor / agy / ollama 어댑터). 도구는 전면 차단(`--allowed-tools ''`)이라 실시간 웹 검색 불가. 모든 AI task는 JSON 스키마(`api/ai/schemas.js`) + 정규화(`normalize.js`) + 프롬프트(`prompts.js`)로 정의하고, 스키마 위반 시 repair 1회 → 실패 시 저장 금지. 같은 provider로 이어지는 대화는 CLI 세션 resume(히스토리 생략), 실패 시 히스토리 폴백.
- 원칙: 파생값은 저장하지 않고 서버가 매 요청 계산(대시보드 스트릭/정확도 등), DB가 단일 소스, 클라이언트 히스토리 미수신, 멱등 `client_request_id`.

## 섹션별 현재 상태 (2026-08-30)
| 섹션 | 상태 |
|---|---|
| 대시보드 | 실시간 집계(스트릭·주간·정확도·예상점수·규칙 기반 추천). 공통 사이드바/내비 재구성 완료 |
| AI 회화 | 세션/메시지/첨삭 영속화, 서버 채점, CLI 세션 resume. 시나리오(비즈니스 미팅 등)는 시드 2개뿐, 시나리오 선택 UI 없음 |
| TOEIC 학습 | **엔진은 완성**(lessons/lesson_items/attempts, 정답·해설 서버 비노출, 서버 채점, 진도, E2E 20개). **콘텐츠는 Part 7 단일 지문 2개(6문항)**. 레슨 목록/선택 화면 없음(첫 레슨 자동 선택 → "다음 지문" 선형). 지문 툴바 "하이라이트/한글 번역/단어" 버튼은 장식. "Jina에게 물어보기" 패널이 지문을 AI에 넘기지 않아 Jina가 지문을 모른 채 답함. 타이머·오답 노트 없음. `GET /api/lessons/recommended` 미구현. LLM 문제 생성(`lesson_gen`) 없음 |
| 단어장 | SRS(서버), AI 단어 추가, **'오늘의 단어' AI 퀴즈**(주제: 랜덤/뉴스/게임/블로그/키워드 → 10단어 4지선다, 서버 채점, 단어장 추가), 발음(Web Speech) |
| 학습 통계 | 실집계 DTO, 첨삭 SRS 복습. 점수 스냅샷 이력 없음(월별 추이 빈 상태) |
| 설정/로그인 | scrypt + 세션 쿠키, 계정 설정, 테마·provider 지속성 |
| 사이드바 '준비 중' | 스피킹 연습, 리스닝, 오답 노트 — 화면 없음 |

## 이번 토론에서 다룰 부족한 영역 3가지
1. **주제별 섹션(Topic-based sections)**: 지금은 기능 단위(회화/학습/단어장)로만 나뉘어 있고 "비즈니스 이메일", "면접", "여행" 같은 **주제(토픽)**로 회화 시나리오·레슨 지문·단어를 묶어 주는 구조가 없다. 학습자가 주제를 고르면 회화·독해·단어가 한 세트로 이어지는 흐름이 필요한가? 어떤 데이터 모델(예: `topics` 테이블 + 콘텐츠의 topic 참조 vs 태그 배열)과 화면(대시보드 진입점, 사이드바 항목)이 맞는가?
2. **AI를 통한 섹션 생성(AI-generated sections)**: 콘텍츠 병목을 AI 생성으로 풀 때의 설계 — `lesson_gen`(주제/Part/난도 → 지문+문항+정답+해설), 회화 시나리오 생성, 주제별 단어 세트. '오늘의 단어' 퀴즈에서 확립한 패턴(스키마 검증 → 저장 금지, 제외 목록, 결정적 셔플, 생성 40~60초·동시 2건 제한)을 어떻게 일반화할지. 품질 관리(자동 검증, 사람 검수 큐, 사용자 신고), 중복·저작권·난도 보정, 비용/시간(CLI 호출 40~60초) 대책. 생성물을 공용 풀에 넣을지 개인 소유로 둘지.
3. **TOEIC 학습 섹션 보강**: 우선순위 — (a) Jina 패널에 지문·문항 컨텍스트 주입(세션 resume 활용), (b) 레슨 목록 + Part별 필터, (c) Part 5/6(문법·어휘 단문)부터 AI 생성으로 콘텍츠 확대, (d) 장식 버튼의 실제 동작(한글 번역=AI 번역 캐시, 단어=단어장 추가), (e) 타이머·오답 노트·약점 분석과 통계 탭 연결, (f) LC(Part 1~4)는 TTS로 가능한지. 무엇을 먼저, 어떤 순서로?

## 요청하는 결과물
- 라운드 1: 위 세 영역에 대한 진단과 우선순위 의견(근거 포함).
- 라운드 2~: 서로의 제안에 대한 반박/보완, 데이터 모델·API·화면·AI task 수준의 구체안, 리스크(품질·비용·복잡도).
- 마지막 라운드: **합의된 플랜** — Phase(1~3주 단위)별 산출물, 각 Phase의 완료 판정 기준, 먼저 하지 말아야 할 것.
- 라운드: 4
- 작업 디렉토리: D:\git\node\english tutor jina
- 참가자: 🔵 Cursor → 🟢 Codex
- 시작: 2026. 8. 30. 오후 10:20:05

## 라운드 1

### 🔵 Cursor

**우선순위: TOEIC 보강 → AI 생성 일반화 → 토픽 구조.** 토픽부터 잡으면 지금 엔진·콘텐츠 공백을 덮지 못한다.

**1) 토픽 구조**  
당장 `topics` 허브(회화+독해+단어 원클릭 플로우)는 반대다. 시나리오 2개·Part7 지문 2개 상태에서 허브는 빈 선반이다. 대신 `topics(id, slug, label_ko)` + 콘텐츠에 `topic_id`(nullable FK)만 먼저 둔다. 태그 배열은 조회·집계가 애매하니 FK 단일 참조. 사이드바 항목·대시보드 카드는 Phase 후반에 콘텐츠 임계치(토픽당 레슨≥3, 시나리오≥1, 단어≥20) 넘긴 뒤.

**2) AI 섹션 생성**  
‘오늘의 단어’ 패턴을 `ai_jobs`로 일반화하자: `task_type`(lesson_gen|scenario_gen|vocab_set), `status`, `client_request_id`, 스키마 검증→실패 시 저장 금지, 동시 2건·타임아웃 60s. 산출물은 **개인 소유(`user_id`) + `visibility=private`**가 기본. 공용 풀은 검수 큐(`review_status`) 통과 후만. 첫 task는 Part5 단문 생성—지문 길이·오디오 없어 품질·비용 리스크가 가장 낮다.

**3) TOEIC 보강 순서**  
(a) Jina 패널에 `passage+items` 컨텍스트 주입+세션 resume → (b) 레슨 목록/`GET /api/lessons?part=` → (c) Part5 `lesson_gen` → (d) 하이라이트·번역 캐시·단어장 추가. 타이머·오답노트·LC/TTS는 미룸. 근거: (a)는 저장 콘텐츠 0건으로 “지문 모르는 Jina”를 즉시 고치고, (b) 없으면 생성물을 고를 UI가 없다.

라운드 합의 목표: Phase1=컨텍스트+목록, Phase2=Part5 생성 파이프라인, Phase3=topic FK·진입점.

_소요 15.4초_

### 🟢 Codex

Cursor의 큰 우선순위에는 동의한다. 지금은 토픽 허브보다 “지문을 모르는 Jina”와 콘텐츠 탐색 부재가 핵심 결함이다. 다만 `topic_id` 단일 FK에는 반대한다. 면접 레슨이 비즈니스·여행 영어에도 재사용될 수 있으므로 `topics`와 `topic_lessons`, `topic_scenarios`, `topic_vocab_sets` 연결 테이블이 안전하다. UI는 임계치 전까지 숨기면 된다.

Phase 1은 컨텍스트 주입과 목록을 묶되, Jina 요청에 정답·해설을 보내면 안 된다. `lesson_id/item_id`만 받고 서버가 passage·선택지·사용자 답을 조립하는 `lesson_qa` task를 추가하며, 제출 전에는 정답 관련 질문을 거부해야 한다.

`ai_jobs` 일반화에도 동의하지만 60초 HTTP 대기는 피해야 한다. `POST /api/ai-jobs`는 202와 job ID를 반환하고 `GET /api/ai-jobs/:id`로 폴링한다. Part 5 생성물은 곧바로 `lessons`에 넣지 말고 draft 테이블에서 문항 수, 정답 인덱스, 선택지 중복, 해설 일치 검증 후 게시해야 한다. 오답 노트는 UI만 미루고, Phase 1부터 attempts에 약점 분류용 `skill_code`는 남겨야 재작업이 없다.

_소요 24.4초_

## 라운드 2

### 🔵 Cursor

**동의하는 부분부터.** Codex가 짚은 “정답·해설을 Jina에 넣지 말 것”, `lesson_qa`의 서버 조립, `ai_jobs` 202+폴링, Part5 draft 검증 후 게시는 전부 수용한다. 브라우저가 지문/선택지를 그대로 프롬프트에 실으면 유출·스키마 우회가 생기고, 60초 HTTP는 이 스택의 `node:http`·CLI 제약과 안 맞다.

**연결 테이블에는 부분 반대.** 재사용성은 맞지만 Phase1~2에 `topic_lessons`/`topic_scenarios`/`topic_vocab_sets` 세 개를 한꺼번에 두면 마이그레이션·시드·조회 비용만 늘고 UI는 숨긴다. 타협: `topics` + **`content_topics(content_type, content_id, topic_id)`** 다형 연결 한 장만. 면접 레슨의 비즈니스·여행 중복 태깅은 여기서 해결하고, 전용 조인 테이블은 토픽 허브 UI 직전(Phase3)에 쪼개도 늦지 않다.

**`lesson_qa` 구체안.**  
API: `POST /api/lessons/:id/qa` `{item_id?, question, client_request_id}` → 서버가 passage·선택지·(제출 후만) user_answer 조립. 스키마는 `{answer, citations:[{quote}]}`. 제출 전 `attempts` 없으면 “정답/해설 요청” 키워드·의도 분류로 거절 문구 고정 반환(CLI 호출 스킵). resume는 같은 `lesson_id` 세션 키로.

**draft·attempts.** `lesson_drafts(payload jsonb, validation_errors, review_status)` — 검증: 문항수=약속값, `answer_index` 범위, 선택지 중복 없음, 해설이 정답 선택지를 가리킴. 통과 시에만 `lessons`/`lesson_items` insert.  
`attempts.skill_code` TEXT NULL Phase1 컬럼 추가 동의. 분류기는 규칙(품사·빈칸유형)부터, LLM 태깅은 생성 파이프라인 이후.

**반대할 것:** Phase1에 오답노트 스키마까지 확장. `skill_code`면 충분하고 `wrong_notes` 테이블은 Phase2 말미.

_소요 10.8초_

### 🟢 Codex

Cursor의 `202+폴링`, draft 검증, `skill_code` 선반영에는 동의하며 `wrong_notes` 신설 반대에도 동의한다. 오답 노트는 우선 `attempts WHERE is_correct=false`에서 계산하고, 사용자가 메모를 저장할 때만 별도 테이블이 필요하다.

그러나 `content_topics(content_type, content_id)`에는 반대한다. PostgreSQL FK로 대상 존재를 보장하지 못해 DB 단일 소스 원칙과 충돌한다. 한 테이블을 원한다면 `topic_contents(topic_id, lesson_id, scenario_id, vocab_set_id)`에 각 FK를 두고 `CHECK (num_nonnulls(...)=1)`로 무결성을 지키자. 이 스키마 자체도 실제 Phase3 직전에 추가하면 된다.

또 제출 전 키워드·의도 분류를 보안 경계로 삼는 것은 위험하다. 우회가 쉽고 불필요한 CLI 호출도 생긴다. 제출 전 `lesson_qa`에는 passage만 주고 문항·선택지는 제외하며, 제출 후에만 item과 user_answer를 추가하자. `citations.quote`는 서버가 passage의 실제 부분문자열인지 검증하고 실패하면 repair 대상으로 처리해야 한다. 세션 키도 `user_id+lesson_id+attempt_id`로 격리해야 이전 학습자의 문맥이나 재도전 답변이 섞이지 않는다.

_소요 27.2초_

## 라운드 3

### 🔵 Cursor

**대부분 동의한다.** 특히 다형 `content_type` 폐기와 제출 전 보안 경계 재설계는 Codex 쪽이 맞다.

**토픽 스키마.** FK 없는 다형은 DB 단일 소스와 충돌한다—내 제안 철회. `topic_contents(topic_id, lesson_id, scenario_id, vocab_set_id)` + `CHECK (num_nonnulls(lesson_id,scenario_id,vocab_set_id)=1)` + 각 컬럼 FK에 찬성. **Phase3 직전 마이그레이션만**—그 전엔 컬럼·API·사이드바 진입점 전부 금지.

**`lesson_qa` 보안.** 키워드/의도 분류를 경계로 쓰는 건 철회한다. 우회·오탐·불필요 CLI 모두 Codex 지적대로다.  
- 제출 전: 서버가 **passage 본문만** 프롬프트에 넣음. `item_id` 요청이 와도 문항·선택지·정답 미포함.  
- 제출 후(`attempt` 존재): 해당 item 선택지 + `user_answer`만 추가. 정답·해설은 여전히 미전송(채점은 기존 서버 경로).  
- `citations[].quote`: normalize 단계에서 `passage.includes(quote)` 실패 시 repair 1회 → 그래도 실패면 저장 금지.  
- CLI 세션 키: `user_id + lesson_id + attempt_id`(미제출이면 `attempt_id=0` 고정 세션). 재도전은 새 attempt로 resume 분리.

**오답 노트.** `attempts WHERE is_correct=false` 파생 동의. 메모 테이블은 사용자 메모 UX 확정 전까지 신설 금지.

**남은 이견 하나.** 제출 전 “passage만”이면 “이 빈칸 답이 뭐야?”에 Jina가 문항을 모른다—의도된 UX로 못 박고, UI에 “제출 후 문항별 질문 가능”을 명시하자. 목록 API는 `GET /api/lessons?part=&status=`만 Phase1에 두고 recommended는 통계 안정화 후.

_소요 10.5초_

### 🟢 Codex

Cursor가 제출 전 문항 질문을 의도적으로 제한하고 UI에 안내하자는 데 동의한다. 다만 `attempt_id=0` 세션 resume에는 반대한다. 같은 레슨 재방문 시 과거 제출 전 대화가 섞이므로 제출 전 QA는 stateless로 호출하고, 제출 후에만 resume하자. 또한 “attempt 존재”가 아니라 `attempt.user_id=세션 사용자`, `lesson_id/item_id` 일치, `submitted_at IS NOT NULL`을 모두 검증해야 한다.

`recommended` 연기에도 반대한다. 대시보드에 이미 규칙 기반 추천이 있으므로 Phase1에서 `GET /api/lessons/recommended`를 같은 서비스 함수로 구현해야 추천 규칙이 클라이언트와 중복되지 않는다. 반환은 최대 3건과 `reason_code`만 두면 된다.

AI 생성 Phase2에는 `ai_jobs`의 `UNIQUE(user_id, client_request_id)`, 정규화된 입력의 `request_hash`, 전역 실행 2건 제한을 완료 조건에 넣자. 동일 사용자의 같은 Part·난도·토픽 요청은 기존 성공 job을 재사용하고, draft 게시 전 자동 검증 외에 신고 API `POST /api/lessons/:id/reports`도 필요하다. 공용 전환은 신고 0건이 아니라 `review_status=approved`만 허용해야 한다.

_소요 30.3초_

## 라운드 4

### 🔵 Cursor

**최종 합의로 수렴한다.** Codex의 제출 전 stateless·소유권/`submitted_at` 검증·`recommended` Phase1 편입·job 멱등/`request_hash`·신고≠승인 분리에 **동의**한다. `attempt_id=0` resume 제안은 철회한다.

**합의 플랜**

**Phase1 (1주) — 탐색·질의 신뢰**  
산출: `lesson_qa`(제출 전 passage만·stateless / 제출 후 item+user_answer·resume, 세션키 `user+lesson+attempt`); `citations` 부분문자열 검증; `GET /api/lessons?part=&status=`; `GET /api/lessons/recommended`≤3+`reason_code`(대시보드 추천 함수 공유); `attempts.skill_code` NULL.  
완료: E2E—미제출 시 선택지 미포함·제출 후 타인 attempt 거부·추천 규칙 단일 소스.

**Phase2 (1~2주) — Part5 생성**  
산출: `ai_jobs`(202+폴링, `UNIQUE(user_id,client_request_id)`, `request_hash`, 전역 동시 2); `lesson_gen`→`lesson_drafts` 자동검증 후 게시; 동일 Part·난도·토픽 성공 job 재사용; `POST /api/lessons/:id/reports`. 공용은 `review_status=approved`만.  
완료: 스키마 실패 저장 0·동시 3번째 429·신고만으로 공용 승격 불가.

**Phase3 (1주) — 토픽 진입**  
`topics`+`topic_contents`(배타 FK+CHECK); 임계치 충족 토픽만 사이드바/대시보드.  
완료: FK 깨짐 0·임계치 미만 숨김.

**먼저 하지 말 것:** 토픽 허브 UI, LC/TTS, 타이머·오답노트 테이블, 번역/하이라이트 장식 구현, Part6/7 대량 생성, 키워드 기반 정답 가드, 공용 풀 자동 승격.

_소요 10.5초_

### 🟢 Codex

Cursor의 플랜에 대부분 동의하지만 두 가지는 수정해야 한다. 첫째, `ai_jobs`를 만들면서 3번째 요청을 429로 버리는 것은 비동기 설계와 모순이다. 전역 실행은 2건, 나머지는 `queued`로 202 반환하고 사용자별 대기 3건 초과만 429로 제한하자. 서버 재시작 시 오래된 `running` job을 재대기시키는 복구 테스트도 필요하다. 둘째, Phase3에 스키마와 빈 허브만 두면 토픽 목표를 달성하지 못한다.

최종안은 다음과 같다. Phase1(1주): `lesson_qa`, 인용 검증, 목록·추천 API, `skill_code`; 권한·미제출 정보 비노출 E2E 통과. Phase2(2주): job 큐, `lesson_gen`, draft 검증·승인·신고; 잘못된 산출물 저장 0건, 멱등·동시성·재시작 복구 통과. Phase3(2주): 배타 FK 토픽 모델과 `scenario_gen`·`vocab_set`을 같은 파이프라인에 추가하고, 비즈니스 면접 토픽 1개를 레슨 3·시나리오 1·단어 20개로 완성한다. 화면은 회화→독해→단어 진행률을 DB에서 계산해 표시한다.

그 전에는 LC/TTS, 타이머, 번역 캐시, 오답 메모, Part6/7 생성, 공용 자동 승격을 하지 않는다.

_소요 29.1초_

---

## 세션 ID

- 🔵 Cursor: `agent-9b9414c7-5985-4480-898c-880c3f74f7ca`
- 🟢 Codex: `01a052d4-09e6-7d40-8200-03a6707ad45f`

- 종료: 2026. 8. 30. 오후 10:22:43
