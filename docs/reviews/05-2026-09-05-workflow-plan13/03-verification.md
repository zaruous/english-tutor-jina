# 검증 + 적대 리뷰 반영 — 위임자가 직접

6그룹 자체 보고는 각자 pglite 단위 테스트를 돌렸다(그룹별 보고는 워크플로 결과에 있음). 아래는
**위임자가 실 DB(jina_eng/app, PG 16.15)에서 재실행**한 결과와, 3렌즈 적대 리뷰가 찾은 결함의 처리다.

## 1. 적대 리뷰가 찾은 결함 (3렌즈 · 14건) 과 처리

세 렌즈(플랜 정합성 6 · 권한/보안 3 · UI 회귀 5)가 같은 diff 를 뒤집어 봤다. 겹친 것을 합치면 **고유 8건**.

| 심각도 | 결함 | 처리 |
|---|---|---|
| **high** | '승인 전 수정' 뒤 검수 큐가 **수정 전 AI payload** 를 보여준다 — 리뷰어가 낡은 본문으로 승인 (plan·ui 렌즈 중복) | **고침** — `updateLesson` 이 `lesson_drafts.payload`·`validation_errors` 도 같은 본문으로 동기화 |
| **medium** | LC 저장이 `passage.type/subject` 를 서버 기본값으로 덮어 시드 'Short Talk'→'Short Conversation' (plan·sec 중복) | **고침** — `lc.jsx` 가 LC 에서도 메타 보존, kind 전환 시에만 초기화 |
| **medium** | `author` 가 published/archived 본문을 제자리 수정 — 검수 게이트 우회 (sec 렌즈) | **고침** — `updateLesson` 에 `atLeast(role,'reviewer')` 게이트 + 하네스 A2b 단정 |
| **medium** | eligible 임계치·집계 SQL 이 두 파일에 복제 (plan 렌즈) | **고침** — `api/lib/topic-eligible.js` 신설, 두 서비스가 import |
| **medium** | `admin.html` 이 `speech.jsx` 미로드 → TTS 미리듣기가 절대 안 뜸 (plan 렌즈) | **고침** — `speech.jsx` 로드 추가 |
| **medium** | e2e A2/B6 셀렉터가 실제 testid 와 불일치 (plan·ui 중복) | **고침** — 하네스 셀렉터를 `lc-item-N-answer-*` 등으로 정정 |
| **low** | 새 토픽 해시 `#/topics?id=new` vs `#/topics/new` 공존 (plan·ui 중복) | **고침** — `#/topics/new` 로 통일 |
| **low** | '승인 전 수정' 에디터의 '목록' 이 항상 `#/contents` (ui 렌즈) | **고침** — `?from=review` 로 큐 복귀 |
| **low** | 재시드가 시드 토픽 status 를 published 로 되돌림 (sec 렌즈) | **고침** — 기존 토픽 status/visibility 는 재시드가 안 건드림 |

추가로 위임자가 실측으로 찾은 것: **시드 Part 7 레슨 2개의 해설 4건에 정답 표기 `(B)`/`(C)` 가 없어**
저작 검증기(`validateGeneratedLesson`)가 거부했다 → `db/content/lessons.json` 4곳 보정(시드 7개 전부 검증 통과).
그리고 `db/seeds/content.mjs` 의 직접 실행 가드가 `file://${argv}` 문자열 결합이라 Windows 에서 항상 false →
`pathToFileURL` 로 고쳐 `npm run db:seed:content` 가 실제로 시드를 넣게 했다.

## 2. 재실행 (실 DB · 서버 3003/3004)

| 명령 | 결과 |
|---|---|
| `npm run lint` | **0** |
| `npm run db:verify` | **통과 — migrations 4개** (0019 포함) |
| `npm test` | **125/125** (위임 전 95 → +30: admin-authoring 18 · admin-topic 8 · seed-curated 4) |
| `npm run verify:content-status` | **65/65** (플랜 11, `topic.service` 리팩터 후 무회귀) |
| `npm run verify:draft-review` | **74/74** (플랜 12) |
| `npm run verify:security` | **25/25** (플랜 10.5) |
| `node scripts/e2e-admin-authoring.mjs` | **16/16** (신규 — 아래) |
| `node scripts/e2e-topics.mjs` | **24/24** |
| `node scripts/e2e-lesson.mjs` | 35/37 (2건 Ollama 미기동 — 선행) |

### `e2e-admin-authoring` 16/16 (플랜 13 완료 판정 + R11)

- **A0** 관리자 읽기가 answer·explanation·skill_code 를 싣고 **A0b** 학습자 DTO 는 안 싣는다(D2)
- **A1** LC 에디터 줄 수 = passage.body 길이 · 화자 토글 M/W(D1)
- **A2** reviewer 가 대사+정답 수정 → 200 · DB 반영 · `source seed→curated` · status 불변
- **A2b** author 가 published 본문 수정 → **403**(검수 게이트, sec 렌즈 결함의 회귀 잠금)
- **A3** `M:` 라벨 저장 → **422** · `lc-errors` 렌더 · DB 무변경(D3, 규칙은 서버 단일 소스)
- **A4** reviewer 왕복(archived↔published) 뒤 학습자가 고친 대사를 받는다
- **A5** learner 는 에디터 403
- **B6** author 가 화면에서 토픽 생성(draft) · **B7** PUT 구성 3건 position 순 · eligible=false
- **B7b** eligible 미달 배지 노출 · **B8** reviewer 공개 후 학습자 목록 노출(미달인데도, 11 결정 3) · **B9** learner 403
- **C10** (R11) 검수 큐 → 상세 → 공개 기본 off → 반려 → DB `draft`·`review_status=rejected`·감사 note

## 3. 브라우저 실조작 — 화면을 직접 열어 봤다

라운드 03 교훈("e2e 통과는 그 앞 단계")대로 `e2e-admin-authoring` 이 남긴 스크린샷을 확인:

- **LC 에디터**([_artifacts/e2e-admin-authoring-lc-editor.png]) — 화자 M/W 토글, 줄 단위 textarea,
  문항 4지선다+정답 라디오+해설+skill_code, "스크립트 미리듣기"(jinaSpeak),
  하단 "서버가 validateGeneratedLesson 을 돌리고 422 를 그대로 띄운다 — 화면은 규칙을 다시 판단하지 않는다"
- **토픽 구성**([_artifacts/e2e-admin-authoring-topic-composer.png]) — eligible 미달 배지·막대(레슨 1/3),
  ▲▼ 순서·✕ 빼기, 상태 무관 붙이기, "스피킹 탭이 없는 이유 — Phase C 는 플랜 10 발음 백엔드 확정 후"

## 4. 운영 환경

- 고아 프로세스 0(3003·3004 정리) · 개발 DB 시드 상태 복구 · 임시 프로브 스크립트 전부 삭제
- 저장소 오염 없음(임시 파일 없음). e2e 스크린샷은 gitignore 된 `_artifacts/`
