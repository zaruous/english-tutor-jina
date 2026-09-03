---
# status: draft | in_progress | done · phase.status: done | pending_verification | todo
plan: "13"
title: "관리자 콘텐츠 ③ — LC 에디터(최소형) · 토픽 구성 · 스피킹 세트"
status: draft
group:
  id: admin-content
  title: "관리자 콘텐츠 저작·관리"
  members: ["11", "12", "13"]
  order: 3
created: 2026-09-03
updated: 2026-09-03
depends_on: ["10.7", "11", "12"]
preconditions:
  - { phase: C, requires: "플랜 10 Phase 1·2 실측 검증 통과 (pending_verification → done)", reason: "focus 음소·target_wpm 은 발음 점수가 있어야 의미가 있다" }
migrations: ["0018_speaking_set_details"]   # Phase C 에서만. 10.7 baseline 위에 detail 테이블 1개
phases:
  - { id: A, name: "LC 에디터 최소형 — AI 초안·기존 레슨을 폼으로 고친다", status: todo }
  - { id: B, name: "토픽 생성 · 구성 · 순서", status: todo }
  - { id: C, name: "스피킹 세트 — speaking_sets · 3단 폴백 · 에디터", status: todo, gated_by: "플랜 10 실측" }
verify: ["scripts/e2e-admin-authoring.mjs (신규)", "scripts/e2e-topics.mjs", "scripts/e2e-plan08-screens.mjs"]
follow_ups:
  - "풀 기능 LC 에디터(줄 순서 드래그·문항 추가/삭제) — 최소형으로 부족하다고 판명될 때"
  - "Part 7 복수 지문 지원 — 최소형 폼으로 부족할 때 (열린 질문 4)"
---

# 13 — 관리자 콘텐츠 ③: LC 에디터(최소형) · 토픽 구성 · 스피킹 세트 (2026-09-03)

[11](11-content-lifecycle-admin.md) 의 상태 축과 [12](12-ai-draft-review.md) 의 검수 위에 **만들기**를 얹는다.
원문 플랜의 Phase 3(LC 에디터)·Phase 5(스피킹 세트 + 토픽 구성)를 여기로 옮기고 두 가지를 바꿨다:
LC 에디터는 **최소형**으로 줄이고, 스피킹 세트는 **플랜 10 의 실측 통과를 선행 조건**으로 건다.

## 0. 무엇을 줄였고 왜

- **LC 에디터 → 최소형.** 원안은 화자 M/W 토글·줄 추가/삭제/순서·문항 편집을 갖춘 1주짜리 화면이었다.
  LC 는 이미 `lesson_gen` + `part:'lc'` 로 스크립트+문항이 생성되고 `validateLcScript`(4~8줄, `M:`/`W:` 라벨,
  괄호 지시문 금지, 대사 12자 이상)까지 돈다. 그러니 v1 에디터의 일은 **AI 가 만든 것을 고치는 것**이다 —
  줄 단위 textarea + 문항 폼 + 서버 검증 오류 표시면 된다. 처음부터 빈 화면에서 만드는 흐름은 "AI 로 초안 생성 →
  고치기" 로 대체한다. 풀 에디터는 최소형이 부족하다고 **판명된 뒤** follow_up.
- **스피킹 세트 → 조건부.** `items` 의 `focus`(음소)·`target_wpm` 은 발음 점수가 있어야 의미가 있는 필드다.
  플랜 10 Phase 1·2 는 구현은 끝났지만 **실측 검증 대기**다. 실측이 실패하면(사이드카를 받아들이지 않기로 하면)
  이 테이블은 존재하지 않는 기능을 위한 콘텐츠 저장소가 된다. Phase C 는 10 이 `done` 이 될 때 시작한다.
  그전까지 스피킹은 지금의 파생 뷰(`listSpeakingSentences`) + 화면 고정 시드로 충분하다.
- **토픽 구성은 그대로.** 11 결정 6 으로 빈 토픽이 관리자에게 보이게 됐으니, 토픽 만들기 + 콘텐츠 붙이기가
  카탈로그를 실제로 채우는 마지막 조각이다.

## 1. 설계 결정

1. **저작은 같은 테이블에 쓴다.** 새 콘텐츠 엔진 없음(원문 "먼저 하지 말 것"). 레슨은 `lessons`+`lesson_items`,
   시나리오·단어 세트는 본 테이블. 생성은 `status='draft'`(11 결정 4 의 기본값과 일치), 공개는 11 의 전이로.
2. **검증 규칙의 단일 소스는 서버다.** 에디터는 저장 시 서버가 돌려준 `validation_errors` 를 렌더한다 —
   `validateGeneratedLesson`·`validateLcScript` 를 저작 경로에서도 그대로 호출한다. 클라이언트 중복 검증 없음.
3. **리스닝 오디오는 v1 그대로 브라우저 TTS(`jinaSpeak`)를 유지한다.** 관리자 오디오 업로드는 하지 않는다 —
   파일 저장소가 새로 필요하고(현재 없음), 08 §2.3 이 규정한 '연습 모드'의 전제가 바뀐다.
   시험 모드(서버 TTS)와 함께 후속으로 미룬다.
4. **스피킹 콘텐츠는 `content_items` 의 한 `type` 이다.** 10.7 이 콘텐츠를 `content_items` + detail 로 통합했으므로
   추가할 것은 `speaking_set_details(content_id PK, items JSONB)` **한 테이블**이다 — 원안의 배타 FK 확장
   (`num_nonnulls` 4개 · 부분 UNIQUE 추가)은 필요 없다. 문항 테이블로 쪼개지 않는 이유는 스피킹이 아직 채점
   이력을 저장하지 않아서(`POST /api/speaking/assess` 는 오디오를 메모리에서만 다루고 결과를 반환만 한다)
   **FK 대상이 될 일이 없기 때문**이다. 이력을 남기게 되면(플랜 10 Phase 3) 그때 쪼갠다.
   기존 파생 로직은 버리지 않고 **3단 폴백**으로 격하: 세트 → 파생 → 화면 고정 시드 20문장.
5. **시드 편집은 `source` 를 `curated` 로 바꾼다.** 10.7 이 콘텐츠 시드를 `db/content/*.json` 으로 꺼냈으므로
   관리자 편집이 `db:reset` 으로 사라지는 문제는 사라졌다. 그래도 "JSON 시드와 DB 가 어긋난 행" 은 구분해야
   한다 — `content_items.source` 에 `curated` 를 둔다(10.7 baseline 의 CHECK 에 포함). 재시드 스크립트는
   `curated` 행을 덮어쓰지 않는다.

## 2. Phase 플랜

### Phase A (3일) — LC 에디터 최소형

| 산출물 | 세부 |
|---|---|
| `api/routes/admin.routes.js` | `POST /api/admin/contents/lesson`, `PATCH …/lesson/:id` — items 포함 트랜잭션 저장, 서버 검증 실패 시 422 + `validation_errors` |
| `src/admin/editors/lc.jsx` | 스크립트 = 줄 단위 textarea 배열(`M:`/`W:` 접두는 텍스트로 그대로), 문항 = 4지선다·정답·해설·`skill_code` 폼. 저장 → 오류 렌더 |
| TTS 미리듣기 | `jinaSpeak` 로 스크립트 재생 — 화자 라벨은 읽지 않는다(기존 규범 유지) |
| 진입점 | 11 Phase 2 목록의 [▾] 에 "수정" 추가, 12 검수 화면의 "승인 전 수정" 링크 |
| Part 7(RC) | 같은 폼의 지문 필드가 배열 대신 본문 하나 — 별도 에디터 없음 |

완료 판정: 관리자가 AI 초안 LC 한 세트를 열어 대사 한 줄과 문항 정답 하나를 고쳐 저장 → 검증 통과 → 공개 →
학습자 계정 리스닝 탭에서 고친 내용으로 재생·채점. 검증에 걸리는 수정(라벨 없는 줄)은 저장 0 + 오류 표시.

### Phase B (3~4일) — 토픽 생성 · 구성

| 산출물 | 세부 |
|---|---|
| `api/routes/admin.routes.js` | `GET/POST/PATCH /api/admin/topics`, `PUT /api/admin/topics/:id/contents` — 구성·순서 일괄 저장(트랜잭션), 배타 FK 는 DB 가 지킨다 |
| `src/admin/editors/topic.jsx` | 토픽 만들기 + 콘텐츠 붙이기(검색·선택)/순서 + `eligible` 경고 배지(11 결정 6) |
| `src/screens/topics.jsx` | 변경 없음 확인 — 11 의 `status` 필터로 이미 동작 |

완료 판정: 관리자가 **토픽 하나를 처음부터 완성**(리스닝 1 + 회화 1 + 단어 20)해 공개하고, 학습자 화면의
주제별 학습에서 진행률까지 정상 계산. `eligible` 미달 토픽은 관리자 화면에만 배지, 학습자에겐 `status` 만.

### Phase C (1주, **플랜 10 실측 통과 후**) — 스피킹 세트

| 산출물 | 세부 |
|---|---|
| `0018_speaking_sets.sql` | 아래 §3. `topic_contents` 배타 FK 를 4개로 확장 |
| `speaking.service.js` 재작성 | 3단 폴백: 세트 → 기존 파생 → 화면 고정 시드 |
| `src/admin/editors/speaking.jsx` | 문장·번역·포커스 음소·목표 WPM |
| `src/screens/speaking.jsx` | 세트 선택 UI(세트가 2개 이상일 때만 노출) |
| `db/migrate.mjs` `RESET_TABLES` | `speaking_sets` 추가(FK 역순), `FOREIGN_TABLES` self-assert 통과 확인 |

완료 판정: 관리자가 스피킹 세트 1개를 만들어 토픽에 붙이고 공개 → 학습자 스피킹 화면이 세트 문장을 우선 노출,
세트가 없는 계정은 파생 문장으로 폴백(회귀 `e2e-plan08-screens`).

## 3. 구현자 메모

### 마이그레이션 `0018_speaking_set_details.sql` 초안 (Phase C)

10.7 baseline 이 `content_items` 와 `status`·`visibility`·CHECK 를 이미 갖고 있으므로 추가분만 쓴다.
원안의 `speaking_sets` 전체 테이블(컬럼 15개 · CHECK 6개)과 `topic_contents` 배타 FK 교체는 사라졌다.

```sql
-- 스피킹 detail (결정 4). 공통 컬럼(slug·title·status·visibility·source·created_by…)은 content_items 에 있다.
CREATE TABLE IF NOT EXISTS speaking_set_details (
  content_id BIGINT PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  items      JSONB  NOT NULL,   -- [{text, text_ko, focus, target_wpm}]
  CONSTRAINT speaking_set_items_ck
    CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 60)
);
```

`content_items.type` 의 CHECK 에 `speaking_set` 은 10.7 baseline 에 이미 들어 있다(비어 있어도 무해).
`topic_contents` 는 `(topic_id, content_id)` 단일 FK 라 **손댈 것이 없다**.
`db/migrate.mjs` 의 `RESET_TABLES` 갱신도 필요 없다 — 10.7 이 `DROP SCHEMA … CASCADE` 로 바꿨다.

### API 표면 (이 플랜 범위)

```
POST   /api/admin/contents/:type                생성 (status='draft')   type=lesson|scenario|vocab_set|speaking_set
PATCH  /api/admin/contents/:type/:id            수정 (seed → curated)
GET    /api/admin/topics · POST · PATCH
PUT    /api/admin/topics/:id/contents           구성·순서 일괄 저장
```

전 경로 `requireAdmin`. 상태 전이는 11 의 `…/:id/status`, 검수는 12 의 `drafts` 를 그대로 쓴다.

### 먼저 하지 말 것

- 오디오 파일 업로드·저장소 도입(결정 3).
- 스피킹 문항 단위 테이블 분리 — 채점 이력을 저장하게 될 때(결정 4, 플랜 10 Phase 3).
- 줄 순서 드래그·문항 추가/삭제가 있는 풀 에디터 — 최소형이 부족하다고 판명된 뒤(§0).
- `src/screens/*` 학습 화면 수정 — 스피킹 세트 선택 UI(Phase C) 외에는 이 플랜이 학습 화면을 건드리지 않는다.

## 4. 열린 질문

1. ~~시드 콘텐츠를 마이그레이션에서 꺼낼 것인가~~ → **10.7 Phase 2 에서 해소**(`db/content/*.json` + import).
   남은 세부: 관리자가 편집한 `curated` 행을 재시드가 건너뛰는 규칙을 어디에 둘지(import 스크립트 vs DB CHECK).
2. **Phase C 의 착수 조건** — 플랜 10 이 `done` 이 아니라 "사이드카는 포기, Speechace 로 간다" 로 결론나도
   음소 점수는 나오므로 착수 가능. 조건은 "발음 점수 백엔드가 하나 확정" 으로 읽는다.
3. **세트 선택 UI 노출 기준** — 세트 2개 이상일 때만(원안). 세트 1개 + 파생 문장이 섞이는 화면을 어떻게 표시할지.
4. **Part 7 에디터를 같은 폼으로 처리하는 것이 충분한가** — 지문이 길어 textarea 하나면 되지만, 문항 수·지문 수(복수 지문)가
   LC 와 다르다. 최소형에서 부족하면 follow_up.
