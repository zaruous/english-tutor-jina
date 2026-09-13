# 조치 · 남긴 것 · 우리가 틀린 것

- 라운드 04 · Codex `gpt-6-astra` · 플랜 12
- 2026-09-05

## 0. 이번 라운드의 특이점

**고친 것이 없다.** 라운드 01~03 과 달리 위임 결과에서 결함이 나오지 않았다.
재실행 검증([`03-verification.md`](03-verification.md))에서 하네스 74건 · 회귀 5종 · 브라우저 12건이
전부 통과했고, 코드를 읽어 내려가며 찾은 의심 두 건도 실측에서 무혐의였다(§2).

그래서 이 문서는 "고친 목록" 이 아니라 **왜 안 고쳤는지의 근거**와 **남긴 것**이다.

## 1. 위임자가 사전에 한 일 — 설계 검토

이번에는 구현 전에 위임자가 **플랜 12 를 현재 코드에 대조**해 7건을 지시서 §2 에 적었다.
플랜은 2026-09-03 에 쓰였고 그 뒤 10.7(스키마 재정비)·11(상태 축)이 들어와 전제가 여러 개 어긋나 있었다.

| # | 플랜이 말한 것 | 실제 | 지시서의 해석 |
|---|---|---|---|
| 2.1 | 결정 3 "`review_status` 안 쓴다" vs Phase 1 표 "approve → approved" — **문서 내부 모순** | 컬럼은 baseline 에 살아 있고 `api/` 참조 0건 | **층이 다르다** — 판정은 `content_items.status`, `review_status` 는 초안 행의 부기. 둘 다 한다 |
| 2.2 | "레슨은 draft 행·나머지는 본 테이블이라 세 쿼리를 합친다" | 10.7 이 전부 `content_items` 로 통합 | **`LEFT JOIN` 하나**. 열린질문 3 도 자동 해소 |
| 2.3 | "`request_hash` 에 `publish_target` 을 넣어야 한다" | `sha256(task:stable(input))` 가 input 전체를 해싱 | **`input` 안에 두기만 하면 자동**. 밖으로 빼면 그때 경고가 현실이 된다 |
| 2.6 | 사유를 `content_audit_log.description` 에 | 실제 컬럼명은 `note` | 정정 |

이 검토가 없었다면 에이전트는 문서 모순(2.1)에서 갈렸을 것이고, 세 쿼리 합치기(2.2)를
그대로 구현해 필요 없는 복잡도를 만들었을 것이다.

**교훈**: 플랜 문서가 오래되면 위임 전에 **전제를 코드로 재확인**하는 단계가 필요하다.
지시서에 "플랜을 읽어라" 만 쓰면 에이전트는 낡은 전제를 그대로 구현한다.

## 2. 의심했다가 무혐의로 끝난 것 — **우리가 틀린 것**

### 2.1 "`job.input` 이 DTO 에 없으면 카탈로그 분기가 조용히 죽는다"

`src/shared/lesson-store.jsx:195` 가 `job.input?.publish_target !== 'catalog'` 로 분기하고
`src/screens/lesson-list.jsx:87` 도 같은 값을 읽는다. DTO 에 `input` 이 없으면
**조건이 항상 참이 되어 카탈로그 초안인데도 학습 목록을 선택하려 들고 404 가 난다.**
e2e 는 AI 가 필요해 이 경로를 못 친다 — 테스트로 안 잡히는 종류다.

실측: `api/services/ai-job.service.js:93` `jobDto` 가 `input: row.input` 을 싣는다. **무혐의.**

### 2.2 "`scripts/lib/` 는 새 디렉터리 관례다"

에이전트가 `scripts/lib/draft-review-fixtures.mjs` 를 새로 만들었다.
`scripts/` 아래 하위 디렉터리는 이 저장소에 선례가 없었다.
다만 `npm run lint` 대상(`scripts/**/*.mjs`)에 들어가고 `db:verify` 와 무관하며,
하네스 두 개가 픽스처를 공유할 자리로는 자연스럽다. **문제 없음** 으로 둔다.

## 3. 남긴 것 — 다음 라운드 지시서에 넣을 것

| # | 항목 | 왜 남겼나 |
|---|---|---|
| R9 | **Codex 샌드박스가 원격 DB 를 막는다**(`EACCES 192.168.45.7:5433`) | 이번 에이전트는 자기 코드를 **한 줄도 실행하지 못했다**. 다음에 Codex 를 쓰면 `-c` 로 네트워크를 열거나, DB 없이 도는 단위 테스트를 먼저 요구할 것 |
| R10 | 워크스페이스 크레딧 소진으로 **보고서 단계에서 끊겼다** | 채점 E(15점)를 통째로 잃었다. 실행 환경 문제지 능력 문제가 아니다 |
| R11 | `e2e` 가 없는 신규 화면(`src/admin/review-queue.jsx`) | 이번엔 위임자가 임시 스크립트로 브라우저 조작을 확인했지만 **저장소에 남는 회귀는 없다.** `scripts/e2e-admin-review.mjs` 로 굳힐 것 |
| R12 | 플랜 12 열린질문 1(승인+공개 체크박스 기본값) · 2(반려 사유 되먹임) | v1 밖. 체크박스는 off 로 구현했고 실사용 뒤 뒤집을지 판단 |
| R13 | 교차 채점(`cross_check`) 슬롯이 비어 있다 | 07 follow_up. DTO·화면 자리는 만들어졌다(`교차 채점 · 아직 제공되지 않습니다`) |

이전 라운드에서 남긴 것 중 이번에 **자동 해소**된 것: R1(`/api/admin/contents` 스텁) — 플랜 11 Phase 2 가 실구현으로 교체했다.
여전히 남은 것: R2(SELF_DEMOTION 규칙 재검토) · R5(정렬·행 높이).

## 4. 검증 명령 (다음 사람이 그대로 쓸 것)

```bash
npm run lint && npm test && npm run db:verify
# 서버 필요 (npm run dev)
npm run verify:draft-review      # 74건 — 이 라운드 산출물
npm run verify:content-status    # 65건 — 플랜 11
npm run verify:security          # 25건 — 플랜 10.5
SKIP_AI=1 node scripts/verify-lesson-gen.mjs   # 22건
# e2e 는 매 실행 전 시드 상태로 되돌린다
npm run db:reset -- --yes && npm run db:migrate && npm run db:seed
```
