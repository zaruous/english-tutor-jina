# 위임 라운드 05 — 플랜 13 (LC 에디터 · 토픽 구성) · 서브에이전트 워크플로

- 대상: **Claude 서브에이전트 6그룹**(Workflow 오케스트레이션) + 3렌즈 적대 리뷰
- 저장소: `D:\git\node\english tutor jina` · 브랜치 `claude/plan-13-authoring`
- 위임자: Claude (설계 검토·통합 검증·리뷰 반영 담당)
- 2026-09-05

## 왜 서브에이전트인가

라운드 04(Codex `gpt-6-astra`)는 결과가 좋았지만 **크레딧이 소진**됐다(§04-grade E=0).
이번 라운드는 Codex 를 쓸 수 없어, 구현을 **파일 소유가 겹치지 않는 6개 서브에이전트 그룹**으로 나눠
Workflow 로 병렬 실행하고, 같은 diff 를 **세 렌즈(플랜 정합성·권한/보안·UI 회귀)로 적대 리뷰**했다.

## 위임 전 — 설계 검토 (지시서 §2 의 D1~D7)

플랜 13 은 2026-09-03 작성이라 10.7·11·12 이후 전제가 어긋나 있었다. 코드 대조로 7건을 미리 못박았다:

| # | 플랜/코드 어긋남 | 지시서의 결론 |
|---|---|---|
| D1 | LC 편집 단위 — 플랜 Phase A 표는 "M: 접두 텍스트", 열린질문 5 는 미해결 | **화자 토글 + {speaker,text}** — 10.7 구조화·검증기와 일치 |
| D2 | 학습자 `getLesson` 은 answer 를 안 준다 | 관리자 읽기 엔드포인트가 answer·explanation·skill_code 를 실어야 |
| D3 | 저장 경로는 `saveGeneratedLesson` 거울, 검증은 `validateGeneratedLesson` 단일 소스 → 422 | 그대로 |
| D4 | 시드 upsert 가 `curated` 를 덮는다(결정 5 위반) | `WHERE source <> 'curated'` |
| D5 | `topics_public_ck` 도 열린질문 7 기각안 | 0019 로 후보 A 교체 |
| D6 | 플랜 §3 "전 경로 requireAdmin" ↔ 결정 1 "author 이상" | 결정 1(author), 판정은 전이표 |
| D7 | 진입점 — [▾] 수정·검수 "승인 전 수정"·해시 라우터 | 활성화 |

## 그룹 배정 (파일 소유 분리)

- **A** 0019 topics CHECK + 시드 curated 가드 (`db/migrations/0019_*`, `db/seeds/content.mjs`, `tests/seed-curated.test.mjs`)
- **B** 레슨 저작 API (`api/services/admin-authoring.service.js`, `api/routes/admin.routes.js`, `tests/admin-authoring.test.mjs`)
- **C** 토픽 API (`api/services/admin-topic.service.js`, `api/routes/admin-topics.routes.js`, `api/server.js`, `tests/admin-topic.test.mjs`)
- **D** LC 에디터 + 진입점 (`src/admin/editors/lc.jsx`, `src/admin/admin-app.jsx`, `src/admin/review-queue.jsx`, `admin.html`)
- **E** 토픽 구성 화면 (`src/admin/editors/topic.jsx`)
- **F** e2e 하네스 (`scripts/e2e-admin-authoring.mjs`) + R11(검수 화면 e2e)

전체 지시서 원문은 워크플로 스크립트에 인라인돼 있고, 각 그룹 프롬프트는 이 문서 §그룹 배정의 계약을 공유했다.
