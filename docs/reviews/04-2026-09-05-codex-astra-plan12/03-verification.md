# 검증 — 위임자가 직접 재실행

에이전트 자체 보고는 **없고**(크레딧 소진) 자체 검증도 **전부 실패**했다(샌드박스가 DB 차단).
그래서 이 문서가 이 라운드의 유일한 검증 근거다. 아래는 전부 위임자가 실제로 돌린 것이다.

- 환경: PostgreSQL 16.15 `192.168.45.7:5433/jina_eng` 스키마 `app` · 서버 3003/3004 · **Ollama 미기동**
- 2026-09-05

## 1. 정적 검증

| 명령 | 결과 |
|---|---|
| `npm run lint` | **0** (출력 없음) |
| `npm run db:verify` | **통과 — migrations 3개** |
| `npm test` | **95/95 통과** (위임 전 81 → +14, `tests/draft-review.test.mjs`) |

## 2. 신규 하네스 — `npm run verify:draft-review`

**74개 중 74개 통과 · 실패 0 · AI 호출 0건.**

플랜 §2 Phase 1 완료 판정 5개를 전부 덮고, 지시서가 요구하지 않은 것까지 단정한다:

- catalog 생성 → `status='review'` → **어떤 학습 API 에도 0건**
- approve → `published + private` → 작성자만 조회 → 11 의 공개 전이 → **learner 목록 노출**
  (레슨·시나리오·단어 세트 **3종 각각**)
- `learner` 의 catalog 요청 **400** (3종 각각) · `publish_target` 허용값 밖 400
- `author` 승인 403 · `author` 반려 403 · 없는 콘텐츠 404
- reject → 행 수 불변 · `status='draft'` · `review_status='rejected'` · 사유가 감사 `note` 에
- **반려 뒤 재승인은 상태 우선 409** (권한이 아니라 상태 문제 — 플랜 11 결정 7 의 규칙이 지켜졌다)
- **동시 승인: 성공 200 한 건 · 충돌 409 한 건** (경합 처리)
- 한 번에 승인·공개 → **감사 정확히 2행** · `public` + `approved`
- 자가 승인 정책 · `[self_review]` 감사 표식
- 공개 레슨 상세에 **정답·해설 미노출**(DTO 유출 회귀)
- `finally` 픽스처 정리 확인까지 단정에 포함

## 3. 회귀

| 하네스 | 결과 |
|---|---|
| `npm run verify:content-status` | **65/65** (플랜 11) |
| `npm run verify:security` | **25/25 · 스킵 1** (플랜 10.5) |
| `node scripts/verify-lesson-gen.mjs` (`SKIP_AI=1`) | **22/22** (플랜 12 확장분 3건 포함) |
| `scripts/e2e-auth.mjs` | **40/40** |
| `scripts/e2e-admin-users.mjs` | **17/17** (내부 e2e-auth 40/40) |
| `scripts/e2e-topics.mjs` | **24/24** |
| `scripts/e2e-lesson.mjs` | 35/37 — **2건은 Ollama 미기동**(선행 결함, 이 라운드와 무관) |

e2e 는 매 실행 전 `db:reset && db:migrate && db:seed` 로 시드 상태를 맞췄다
(`e2e-plan08-screens` 계열이 상태를 바꿔 연속 실행하면 엉뚱한 지점에서 실패한다).

## 4. 브라우저 실조작 — **테스트 통과는 그 앞 단계다**

라운드 03 의 교훈(`03-*/05-fixes.md` §3: e2e 17개를 통과한 뒤 브라우저에서 6건이 나왔다)에 따라
검수 화면을 **실제로 열어 조작**했다. `src/admin/review-queue.jsx` 는 e2e 가 없는 신규 화면이다.

임시 스크립트로 `review` 상태 콘텐츠 + `lesson_drafts` 행을 심고 Playwright 로 조작 → **12/12 통과**:

- `#/review` 직접 진입 렌더 · **`.jina-root` 스코프 적용**(라운드 03 §1B.2 재발 없음)
- 큐 항목 → 상세 패널 → 생성 결과 · `validation_errors` 렌더
- **"승인과 함께 공개" 체크박스 기본 off** (결정 2)
- [승인]·[반려] 노출 → 반려 사유 입력 UI → 확인
- **반려가 DB 에 실제 반영**: `status='draft'` · `review_status='rejected'` · 사유가 감사 `note` 에
- 가로 스크롤 0px · 콘솔 에러 0

스크린샷: [`img/review-detail.png`](img/review-detail.png) · [`img/review-queue.png`](img/review-queue.png)

화면이 플랜에 충실하다는 것도 눈으로 확인했다 —
`교차 채점 · 아직 제공되지 않습니다`(`cross_check: null` 슬롯, 07 follow_up 자리),
`본인이 만든 초안입니다. 자가 승인 사실이 검수 기록에 남습니다.`(결정 9),
`승인 전 수정` 비활성(결정 4, 플랜 13 대기),
`공개를 선택하지 않으면 승인 후에도 작성자의 학습 목록에만 보입니다.`(결정 2).

검증용 임시 스크립트는 저장소에 남기지 않았다(스크래치패드에서 실행).

## 5. 운영 환경 훼손 여부

- 고아 프로세스 없음(3003·3004 정리 확인)
- 개발 DB 는 시드 상태로 복구
- 픽스처 계정·콘텐츠·`ai_jobs` 행 잔존 0건 (하네스의 `finally` + 브라우저 검증 스크립트의 `finally`)
- 저장소 오염 없음 — `git status` 에 임시 파일 없음
