---
# status: draft | in_progress | done · phase.status: done | pending_verification | todo
plan: "07"
title: "주제별 섹션 · AI 섹션 생성 · TOEIC 학습 보강"
status: done
created: 2026-08-30
updated: 2026-08-31
depends_on: ["01", "02", "06"]
migrations: ["0009_provider_session", "0011_lesson_qa", "0012_ai_generation", "0013_topics", "0014_business_interview_topic"]
phases:
  - { id: "1", name: "탐색·질의 신뢰 — 레슨 Q&A(lesson_qa) · 목록 필터", status: done, done_at: 2026-08-30 }
  - { id: "2", name: "Part 5 AI 생성 파이프라인 — ai_jobs · lesson_drafts · 워커", status: done, done_at: 2026-08-31 }
  - { id: "3", name: "토픽 진입점 — topics · topic_contents 배타 FK · 비즈니스 면접 시드", status: done, done_at: 2026-08-31 }
verify: ["scripts/verify-lesson-qa.mjs", "scripts/verify-lesson-gen.mjs", "scripts/e2e-topics.mjs", "scripts/verify-resume.mjs"]
follow_ups:
  - "상세 DTO last_attempt_id (새로고침 후 제출 상태 복원)"
  - "교차 채점 — 다른 provider 로 풀어보기 (정답 유일성 필터)"
  - "POST /api/vocab/quiz 동기 경로의 ai_jobs 이관"
  - "토픽 임계치 필터 → 플랜 11에서 status 축으로 대체 예정"
---

# 07 — 주제별 섹션 · AI 섹션 생성 · TOEIC 학습 보강 플랜 (2026-08-30)

Cursor ↔ Codex 2자 라운드 토론(4라운드 8턴, coworks `trio-chat --only cursor,codex`)으로 도출한 합의 플랜.
원문: `docs/reviews/2026-08-30-trio-cursor-codex-plan.md` (coworks `trio-chat/logs/trio-jina-plan-2026-08-30.md`).
토론 요청서: coworks `prompts/jina-plan-topic-2026-08-30.md`.

## 0. 출발점 — 섹션별 현재 상태

| 섹션 | 상태 | 부족 |
|---|---|---|
| 대시보드 | 실시간 집계, 공통 사이드바 | — |
| AI 회화 | 영속화·서버 채점·CLI 세션 resume | 시나리오 시드 2개, 선택 UI 없음 |
| **TOEIC 학습** | 엔진 완성(정답 비노출·서버 채점·진도·E2E 20) | 콘텐츠 Part 7 지문 2개(6문항), 목록 없음, Jina 패널이 지문을 모름, 장식 버튼 3개, `recommended` 미구현 |
| 단어장 | SRS, AI 추가, 오늘의 단어 퀴즈, 발음 | — |
| 통계 | 실집계, 첨삭 SRS | 점수 스냅샷 없음 |
| 준비 중 | 스피킹·리스닝·오답 노트 | 화면 없음 |

토론 의제: ① 주제별 섹션 ② AI를 통한 섹션 생성 ③ TOEIC 학습 보강.

## 1. 토론 요지

| 라운드 | Cursor | Codex |
|---|---|---|
| 1 | 우선순위 **TOEIC 보강 → AI 생성 일반화 → 토픽**. 토픽 허브는 "빈 선반"이라 반대, `topics` + `topic_id` FK만. `ai_jobs`로 퀴즈 패턴 일반화, 산출물은 개인 소유 기본, 첫 task는 Part 5 | 우선순위 동의. `topic_id` 단일 FK 반대(레슨이 여러 토픽에 재사용) → 연결 테이블. Jina 패널에 **정답·해설을 보내지 말고** 서버가 조립하는 `lesson_qa` task. 60초 HTTP 대기 대신 **202 + 폴링**. 생성물은 draft 검증 후 게시. `attempts.skill_code` 선반영 |
| 2 | 202/폴링·draft·`skill_code` 수용. 연결 테이블 3장은 과하다 → 다형 `content_topics` 1장 타협. `lesson_qa` API·스키마 초안, 제출 전 키워드/의도 분류로 정답 질문 거절 | 다형 테이블은 **FK 무결성 없음 → DB 단일 소스 원칙 위반** → 배타 FK `topic_contents` + `CHECK(num_nonnulls=1)`. 키워드 분류는 보안 경계로 부적절(우회 쉬움) → **제출 전엔 passage만**, 제출 후에만 문항+사용자 답. `citations.quote`는 passage 부분문자열 검증. 세션 키 `user+lesson+attempt` |
| 3 | 다형 폐기·키워드 가드 철회, Codex 안 수용. 제출 전 문항 질문 불가는 **의도된 UX로 UI에 명시**. `recommended`는 통계 안정화 후 | 미제출 `attempt_id=0` resume 반대(과거 대화 섞임) → **제출 전 stateless, 제출 후만 resume**; 소유권·`submitted_at` 검증. `recommended`는 Phase 1(대시보드 추천 함수 공유, ≤3건 + `reason_code`). job 멱등(`UNIQUE(user_id, client_request_id)`, `request_hash`), 신고 API, 공용 승격은 `approved`만 |
| 4 | **최종 합의안** 제시(아래 Phase 1~3). 먼저 하지 말 것 목록 | 두 가지 수정: (a) 3번째 요청 429는 비동기 설계와 모순 → **전역 실행 2건, 나머지 `queued` 202, 사용자별 대기 3건 초과만 429** + 재시작 복구; (b) Phase 3에 스키마만 두면 목표 미달 → `scenario_gen`·`vocab_set`을 같은 파이프라인에 넣고 **토픽 1개를 레슨 3·시나리오 1·단어 20으로 완성** |

## 2. 합의 사항 (설계 결정)

1. **순서**: TOEIC 학습 신뢰 회복 → AI 생성 파이프라인 → 토픽 구조. 토픽 UI는 콘텐츠 임계치(토픽당 레슨 ≥ 3, 시나리오 ≥ 1, 단어 ≥ 20) 충족 후에만 노출.
2. **`lesson_qa` task** — 클라이언트는 `lesson_id/item_id/question`만 보내고 서버가 프롬프트를 조립. 정답·해설은 절대 미전송. 제출 전에는 passage만(문항·선택지 제외, **stateless**) — passage 는 헤더(유형/보낸 사람/받는 사람/CC/날짜) + 제목 + 본문이며 Part 7 은 헤더가 단서라 함께 보낸다, 제출 후에는 해당 문항 선택지 + 사용자 답을 추가하고 **CLI 세션 resume**(키 `user_id + lesson_id + attempt_id`). 응답 스키마 `{answer, citations:[{quote}]}`, `quote`는 passage(헤더 값 + 제목 + 본문, 서버가 붙인 라벨 제외) 부분문자열 검증(실패한 인용은 버리고 `citations_dropped` 로 개수 반환; 검증 기준은 `renderPassage`·`scripts/verify-lesson-qa.mjs`가 공유). 제출 전 문항 질문 불가는 UI에 "제출 후 문항별 질문 가능"으로 명시.
3. **`ai_jobs`** — 모든 생성 task(`lesson_gen | scenario_gen | vocab_set`)의 공통 큐. `POST /api/ai-jobs` → 202 + job id, `GET /api/ai-jobs/:id` 폴링. `UNIQUE(user_id, client_request_id)`, 정규화 입력의 `request_hash`(같은 Part·난도·토픽 성공 job 재사용). 전역 실행 2건, 초과는 `queued`, **사용자별 대기 3건 초과만 429**. 서버 재시작 시 오래된 `running` → 재대기.
4. **draft → 검증 → 게시** — `lesson_drafts(payload, validation_errors, review_status)`. 자동 검증: 문항 수 = 약속값, `answer` 범위, 선택지 중복 없음, 해설이 정답 선택지를 가리킴. 통과분만 `lessons/lesson_items` insert. 산출물은 **개인 소유(`user_id`, private) 기본**, 공용 풀은 `review_status = approved`만(신고 0건 ≠ 승인). `POST /api/lessons/:id/reports`.
5. **토픽 모델** — `topics(id, slug, label_ko, …)` + `topic_contents(topic_id, lesson_id, scenario_id, vocab_set_id)` 각 컬럼 FK + `CHECK (num_nonnulls(lesson_id, scenario_id, vocab_set_id) = 1)`. 다형 `content_type/content_id`와 태그 배열은 폐기(FK 무결성·집계 불가). Phase 3 직전에만 마이그레이션.
6. **약점 분류** — `user_lesson_attempts.skill_code TEXT NULL`을 Phase 1에 선반영(규칙 기반 분류부터, LLM 태깅은 이후). 오답 노트는 `attempts WHERE is_correct = false` 파생으로 시작, 메모 테이블은 UX 확정 전 금지.
7. **먼저 하지 말 것** — 토픽 허브 UI, LC/TTS 문항, 타이머·오답 노트 테이블, 번역·하이라이트 장식 구현, Part 6/7 대량 생성, 키워드 기반 정답 가드, 공용 풀 자동 승격.

## 3. Phase 플랜

### Phase 1 (1주) — 탐색·질의 신뢰 (TOEIC 학습)

> **상태 (2026-08-30): 구현 완료.** 서브에이전트 병렬(백엔드/프론트) → 3렌즈 리뷰(high 0·medium 2 반영) → Cursor가 작성한 `scripts/verify-lesson-qa.mjs` 21/21(실 AI, 인용 3건 검증, resume 확인), `e2e-lesson` 회귀 + Phase 1 검증 추가, `e2e-dashboard` 30/30. 남은 후속: 상세 DTO `last_attempt_id`(새로고침 후 제출 상태 복원), `skill_code` 값 채우기.
| 산출물 | 세부 |
|---|---|
| `lesson_qa` task | `schemas/normalize/prompts`에 추가. `POST /api/lessons/:id/qa {item_id?, question, client_request_id}` — 서버 조립·정답 미전송·`citations` 검증·제출 전 stateless/제출 후 resume(`lesson_qa_sessions(user_id, lesson_id, attempt_id, provider, provider_ref)` 또는 `user_lesson_attempts.qa_provider_ref`) |
| 레슨 목록 | `GET /api/lessons?part=&status=` + 데스크탑/모바일 목록 화면(Part 필터, 진도 배지). 첫 레슨 자동 선택 유지 |
| 추천 | `GET /api/lessons/recommended` ≤ 3건 + `reason_code` — 대시보드 규칙 기반 추천과 **같은 서비스 함수** 공유(`recommendLessons`). 규칙 순서 `next_in_series`(직전 채점 레슨의 다음 position, 마지막이면 첫 레슨으로 **순환**, 정답률 무관) → `not_started` → `retry_low_score`(최근 시도 < 70%). 시도가 있으면 순환 항목이 있고 없으면 미시도 항목이 있으므로 레슨이 존재하는 한 **항상 ≥ 1건** — 대시보드 '시험대비' 카드·오늘의 학습 레슨 항목은 항상 채워진다 |
| 스키마 | `user_lesson_attempts.skill_code TEXT NULL` |
| Jina 패널 | `useJinaChat` → `lesson_qa` 호출로 교체, 제출 전 안내 문구 |

완료 판정: E2E — 미제출 시 프롬프트에 선택지·정답 미포함(서버 로그/스텁으로 검증), 제출 후 타인 `attempt_id` 요청 403, `citations.quote` 검증 실패 시 저장 0, 추천 규칙이 대시보드와 동일 함수(중복 0), 목록 필터 동작. 기존 141+ E2E 회귀 통과.

### Phase 2 (2주) — Part 5 AI 생성 파이프라인

> **상태 (2026-08-31): 구현 완료.** codex 가 0012 마이그레이션 + `ai-job.service/worker/routes` + `lesson_gen` 스키마·프롬프트 + 목록 "AI로 Part 5 만들기" 패널(202 폴링)을 구현, Claude 가 `scripts/verify-lesson-gen.mjs` 35/35(실 AI 생성 1회 포함: 멱등 재사용·request_hash 재사용·409·대기 3건 초과 429·재시작 복구·검증 실패 저장 0·신고 비승격)로 완료 판정 충족 확인. 예상 점수 집계는 `source='seed'` attempt 만 포함(열린 질문 1 반영). 교차 채점(다른 provider 로 풀어보기)은 미구현 — 후속.
| 산출물 | 세부 |
|---|---|
| `ai_jobs` | 테이블 + 인프로세스 큐(별도 워커 없음, `node:http` 프로세스 내) + 202/폴링 API, 멱등·`request_hash`·동시 2/사용자 대기 3, 재시작 복구 |
| `lesson_gen` task | 입력 `{part:5, difficulty, topic?, count}` → 지문 없음(단문) + 문항·선택지·정답·해설. 오늘의 단어 퀴즈의 스키마 검증 → 저장 금지 규칙 재사용 |
| `lesson_drafts` | 자동 검증 → 게시(개인 소유). `review_status`(draft/approved/rejected), `POST /api/lessons/:id/reports` |
| 화면 | 학습 목록에 "AI로 Part 5 만들기"(주제·난도 선택 → job 진행 표시 → 목록에 등장) |

완료 판정: 스키마 실패 저장 0건, 동시 3번째 job은 `queued`로 202(사용자 4번째 대기는 429), 서버 재시작 후 `running` 재대기 테스트, 같은 요청 재전송은 기존 job 재사용, 신고만으로 공용 승격 불가. `scripts/verify-lesson-gen.mjs` 단정 스크립트.

### Phase 3 (2주) — 토픽 진입점 (토픽 1개 완성까지)

> **상태 (2026-08-31): 구현 완료.** 0013(topics·conversation_scenarios·vocab_sets·topic_contents 배타 FK·sessions.scenario_id) + 0014("비즈니스 면접" 시드: 레슨 3×3문항 · STAR 시나리오 1 · 단어 20) + `scenario_gen`/`vocab_set` task + `topics.jsx`(진행률 파생값·회화 시작·20단어 담기) + 사이드바/대시보드 진입점(임계치 충족 시에만). `scripts/e2e-topics.mjs` 22/22(임계치 미만 숨김·배타 FK 위반 0·진행률=attempts 집계·담기 멱등·모바일 탭 포함)로 완료 판정 충족.
| 산출물 | 세부 |
|---|---|
| 스키마 | `topics` + `topic_contents`(배타 FK + CHECK) |
| 파이프라인 확장 | `scenario_gen`(회화 시나리오) · `vocab_set`(주제 단어 세트)을 `ai_jobs`에 추가 |
| 콘텐츠 | **"비즈니스 면접" 토픽 1개 = 레슨 3 · 시나리오 1 · 단어 20** 완성 |
| 화면 | 임계치 충족 토픽만 사이드바/대시보드 진입점, 회화 → 독해 → 단어 진행률은 DB 집계로 표시 |

완료 판정: FK 깨짐 0, 임계치 미만 토픽 숨김, 토픽 진행률이 attempts/sessions/cards 집계와 일치.

## 4. 구현자 메모 (Claude, 토론 후 검토)

- **resume 재사용**: `lesson_qa` 세션 키는 회화의 `provider_ref` 패턴을 그대로 쓴다 — `askAI({ sessionRef })` + 폴백 이미 있음. 제출 전 stateless는 `sessionRef: null`로 자연 처리.
- **큐는 인프로세스**: 지금 스택엔 워커·Redis가 없다. `ai_jobs` 상태는 DB, 실행은 API 프로세스의 세마포어(전역 4·provider 2가 이미 있음)를 재사용하고, 부팅 시 `running` → `queued` 복구만 추가하면 된다. 다중 인스턴스는 범위 밖.
- **기존 퀴즈 엔드포인트**: `POST /api/vocab/quiz`(동기 40~60초)는 Phase 2에서 `ai_jobs`로 옮기는 게 일관되지만, 사용자 체감이 이미 검증됐으므로 **Phase 2 말미에 선택적으로** 이관(202 폴링 UI가 생긴 뒤).
- **개인 소유 레슨의 통계 영향**: 예상 점수(`200 + 790 × accuracy`)가 AI 생성 문항 정답률에 흔들릴 수 있다 → Phase 2에서 `lessons.source(seed|ai)`를 두고 예상 점수 계산은 `seed`+`approved`만 포함할지 결정 필요(토론 미논의, 열린 질문).
- **Part 5 생성 품질**: 정답 유일성은 자동 검증으로 못 잡는다(오답 보기가 문법적으로도 맞을 수 있음). 게시 전 "다른 provider로 풀어보기"(교차 채점: 생성 provider ≠ 검증 provider가 정답을 맞히는지) 1회를 자동 검증에 추가하는 안을 제안 — 비용 1회 추가, 품질 필터로 유효.
- **토픽 임계치**는 서버 파생값으로 계산(저장 금지 규범) — `topics` DTO에 `lesson_count/scenario_count/vocab_count/eligible`.

## 5. 열린 질문
1. AI 생성 레슨을 예상 점수·정확도 집계에 포함할지(개인 소유 문항은 난도 편차가 큼).
2. `citations.quote` 검증 실패율이 높으면 repair 대신 "인용 없이 답변"으로 강등할지.
3. Phase 3 첫 토픽을 "비즈니스 면접"으로 할지 — 회화 시드(비즈니스 미팅)와의 중복을 피할 대안은 "출장·여행".
