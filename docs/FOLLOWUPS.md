# 후속 작업 · 확인 사항 (2026-09-05 기준)

11 → 12 → 13 관리자 콘텐츠 시리즈를 마치며, **다음 세션이 바로 집어들 수 있게** 흩어진 후속·미해결·확인
사항을 한곳에 모은다. 출처(플랜 문서·리뷰 라운드)를 각 항목에 달았다 — 상세는 그쪽이 단일 소스다.

> 이 문서는 **작업 큐**다. 항목을 처리하면 여기서 지우고 해당 플랜/리뷰 문서에 반영한다.
> 새 후속이 생기면 근거 문서에 먼저 적고 여기에 한 줄로 링크한다.

---

## 0. 지금 가장 먼저 — 열린 PR 4개 머지 (base 체인)

브랜치가 서로를 base 로 쌓아 올려서 **순서가 있다.** main 이 아니라 앞 브랜치를 가리킨다.

| PR | 플랜 | base | CI |
|---|---|---|---|
| #10 | 11 (상태 축·가시성 헬퍼·전이·관리 UI) | `main` | 초록 |
| #11 | 12 (AI 초안 → 검수 → 공개) | `claude/plan-11-content-lifecycle` | 초록 |
| #12 | 13 (LC 에디터·토픽 구성) | `claude/plan-12-ai-draft-review` | 초록 |

**#10 → #11 → #12 순으로 머지**한다. #10 을 머지하면 #11 의 base 를 `main` 으로 바꿔야 하고(GitHub 이
보통 자동으로 바꾼다), #11 을 머지하면 #12 도 마찬가지다. 순서를 어기면 diff 에 앞 플랜이 섞여 보인다.

머지 방식은 지금까지와 같게 — DRAFT 아니면 `gh pr merge <n> --merge` 후 로컬 `main` fast-forward pull.

---

## 1. 미착수 — 플랜 13 Phase C (스피킹 세트)

- **게이트**: 플랜 10(발음 평가)의 백엔드가 **하나 확정**돼야 한다. 현재 플랜 10 Phase 1·2 는
  `pending_verification`(사이드카 구현은 끝났지만 "틀리게 읽은 wav 의 점수가 실제로 낮은가" 실측 대기).
  플랜 13 §4 열린질문 2: "사이드카를 포기하고 Speechace 로 가도 음소 점수는 나오므로 착수 가능 —
  조건은 **발음 점수 백엔드가 하나 확정**".
- **남은 산출물**(플랜 13 §2 Phase C · §3): `db/migrations/0018_speaking_set_details.sql`(detail 테이블 1개 —
  번호는 0019 가 이미 쓰였으니 **0020**), `speaking.service.js` 3단 폴백(세트 → 파생 → 화면 고정 시드),
  `src/admin/editors/speaking.jsx`, `src/screens/speaking.jsx` 세트 선택 UI.
- 출처: [`docs/plan/13-authoring-editors.md`](plan/13-authoring-editors.md) Phase C.

## 2. 미착수 — 플랜 10 발음 평가 실측 (Phase C 의 선행)

- `lib/pronounce` 사이드카(OpenPronounce)를 실제로 띄워 캘리브레이션을 검증하는 것. 이 PC 는
  Docker·Python 3.11·ffmpeg 는 있고 **espeak-ng 만 없다**(`winget install eSpeak-NG.eSpeak-NG`).
- 출처: [`docs/plan/10-pronunciation-assessment.md`](plan/10-pronunciation-assessment.md),
  메모리 `jina-next-steps` 의 2026-09-01 항목.

---

## 3. 확인 필요 — 시드·검증 정합성

- **시드 AI 해설의 정답 표기**: `db/content/lessons.json` 의 Part 7 해설 4건에 정답 `(B)`/`(C)` 표기가
  없어 저작 검증기(`validateGeneratedLesson`, "explanation 이 정답 id 를 가리켜야")가 거부했다. 이번에
  수기로 보정했다. **AI 생성 프롬프트(`api/ai/prompts.js`)가 그 표기를 항상 넣도록** 고치지 않으면
  다음 생성물이 같은 함정에 빠진다. 시드를 저작 검증기로 한 번 통과시키는 CI 체크도 고려.
  - 재현: `node --input-type=module -e "import {validateGeneratedLesson} from './api/services/ai-job.service.js'; …"`
    로 `db/content/lessons.json` 전 레슨을 검증 → 실패 0 이어야 한다.
- **`seed-curated.test.mjs` 의 slug 고정**: 테스트가 `db/content/*.json` 의 slug 5개를 하드코딩한다.
  JSON 에서 slug 를 바꾸면 픽스처 드리프트로 첫 단정이 실패한다(의도된 조기 경보).

---

## 4. 리뷰 라운드가 남긴 것 (미반영)

### 관리자 사용자 화면 (라운드 03)
- **R2** `SELF_DEMOTION` 규칙 재검토 — "다른 활성 admin 이 있으면 본인 강등 허용" 으로 바꿀지. 설계 변경이라
  결정 필요. 현재 `LAST_ADMIN` 은 API 로 도달 불가(방어적 코드).
- **R5** 사용자 목록 정렬 불가(id 고정)·행 높이 62px. 관리 대상이 늘면 필요.
- 출처: [`docs/reviews/03-2026-09-03-cursor-admin-users/05-fixes.md`](reviews/03-2026-09-03-cursor-admin-users/05-fixes.md) §2.

### 검수·저작 (라운드 04·05)
- **R11 (일부 해소)** 검수 화면(`src/admin/review-queue.jsx`) 에 저장소에 남는 e2e 가 없었다 →
  라운드 05 의 `scripts/e2e-admin-authoring.mjs` **C10** 이 검수 큐 → 반려 경로를 덮는다.
  다만 **승인(approve) 경로의 브라우저 e2e** 는 여전히 없다(`verify:draft-review` 가 API 로만 덮음).
- **R12** 플랜 12 열린질문 — 승인+공개 체크박스 기본값(off 로 구현, 실사용 뒤 뒤집을지) · 반려 사유를
  재생성 프롬프트에 되먹이기(v1 밖).
- **R13** 교차 채점(`cross_check`) — 검수 큐 DTO·화면에 슬롯만 있고 비어 있다(`교차 채점 · 아직 제공되지
  않습니다`). 07 follow_up 의 "생성 provider ≠ 검증 provider 로 풀어보기" 가 채울 자리.
- 출처: [`docs/reviews/04-2026-09-05-codex-astra-plan12/05-fixes.md`](reviews/04-2026-09-05-codex-astra-plan12/05-fixes.md) §3.

---

## 5. 구조적 후속 (규모가 커질 때)

- **`topic_audit_log`**: 토픽 상태 전이·공개 변경이 감사에 안 남는다. `content_audit_log.content_id` 가
  `content_items` FK 라 토픽을 못 가리킨다. 마이그레이션(`topic_id` FK + action/from/to/note/actor)이
  생기면 `admin-topic.service` 의 `changeStatus`/`setVisibility` 두 곳에 INSERT 를 더한다.
  출처: 라운드 05 그룹 C needsOtherGroup.
- **`topics.source` 축**: topics 에는 `source` 컬럼이 없어 시드 토픽을 관리자가 고쳐도 재시드가
  `topics.json` 으로 되돌린다(현재는 status/visibility 만 보호). 시드 토픽 편집을 허용하려면 `source`
  (또는 curated 플래그) 마이그레이션이 선행이고, `seed-curated.test.mjs` 의 4번째 케이스를 뒤집어야 한다.
- **`REQUIRE_SEPARATE_REVIEWER`**: 이제 `api/config.js` 로 이관됐다(라운드 04 에서). 4-eyes 검수를
  실제로 켤지는 사람이 둘 이상일 때 결정.
- **AI 생성 도구 허용 정책**: 실시간 웹 검색(뉴스 퀴즈)을 붙이려면 task 별 도구 허용 정책이 먼저 필요
  (현재 CLI provider 는 `--allowed-tools ''` 로 전면 차단). 출처: 플랜 06 follow_up.
- **동기 AI 경로의 `ai_jobs` 이관**: 플랜 10.5 S7 은 사용자당 동기 요청 1건으로 완화만 했다. 근본 해결은
  30분 점유 경로(퀴즈 등)를 비동기 `ai_jobs` 로 옮기는 것. 출처: 플랜 07·10.5 follow_up.
- **최소권한 DB 롤**: 접속 롤이 슈퍼유저다. 전용 스키마(`app`)가 생겼으니 GRANT 범위를 좁힐 수 있다.
  출처: `db/README.md` 후속 과제.

---

## 6. 운영 함정 (다음 세션이 알아야 할 것)

- **검증 환경**: `.env` 는 이제 `jina_eng`/`app` 을 가리킨다. `e2e-admin-authoring`·`e2e-plan08-screens` 는
  시드 상태를 바꾸므로 **매 실행 전 `db:reset && db:migrate && db:seed`**. `db:reset` 이 `users` 를 날려
  admin 계정이 사라지므로 그 뒤 `verify:security` 를 돌리려면 **서버를 재기동**해 `ensureAdminAccount` 를
  다시 태운다.
- **위임(서브에이전트/Codex)**: 워크플로 산출물은 **반드시 적대 리뷰를 붙인다** — 라운드 05 에서 그냥
  뒀으면 "검수 큐가 수정 전 payload 를 보여줘 리뷰어가 낡은 본문으로 승인" 하는 high 결함이 남았다.
  Codex 는 샌드박스가 원격 DB 를 막고(EACCES) 크레딧이 보고 단계에서 소진될 수 있다 — DB 없는 단위
  테스트를 먼저 요구하고, 보고서를 못 써도 위임자가 재실행으로 검증한다.

---

## 7. 검증 명령 모음 (서버 3003/3004 필요한 것 표시)

```
npm run lint · npm test (125) · npm run db:verify           # DB·서버 불필요 (test 는 pglite)
npm run verify:content-status (65)   # 서버 필요 — 플랜 11
npm run verify:draft-review (74)     # 서버 필요 — 플랜 12
npm run verify:security (25)         # 서버 필요 — 플랜 10.5
node scripts/e2e-admin-authoring.mjs (16)   # 서버+브라우저 — 플랜 13 (실행 전 시드 초기화)
node scripts/e2e-topics.mjs (24) · e2e-admin-users (17) · e2e-auth (40)
# AI 필요(현재 Ollama 미기동이라 일부 실패 정상): e2e-lesson · e2e-vocab · e2e-conversation
```
