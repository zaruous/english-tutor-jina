# db/content — 콘텐츠 시드 (단일 소스)

레슨·회화 시나리오·단어 세트·토픽·단어 사전의 시드 데이터. **마이그레이션이 아니라 데이터다.**

체크섬 불변 마이그레이션 안에 콘텐츠가 있으면 관리자가 편집한 순간 `db:reset` 이 그것을 되돌린다.
또 관리자 저작(플랜 13)이 들어오면 이 포맷이 export 대상이 되므로, 처음부터 DTO 에 가깝게 만든다.

`npm run db:seed`(개발 계정 포함) 또는 `npm run db:seed:content`(콘텐츠만)가 `db/seeds/content.mjs` 로
넣는다. 전부 **slug 기준 upsert** 라 재실행이 안전하다.

| 파일 | 들어가는 곳 | 비고 |
|---|---|---|
| `lessons.json` | `content_items`(type=lesson) + `lesson_details` + `lesson_items` | `items` 배열이 문항. JSON 에서 사라진 문항은 DB 에서도 지워진다 |
| `scenarios.json` | `content_items`(type=scenario) + `scenario_details` | |
| `vocab-sets.json` | `content_items`(type=vocab_set) + `vocab_set_details` | |
| `topics.json` | `topics` + `topic_contents` | `contents[].content_slug` 가 없는 콘텐츠를 가리키면 시드가 실패한다 |
| `vocab-words.json` | `vocab_words` (source='seed') | 공유 사전. 사용자 카드는 개발 시드가 따로 만든다 |

## 규칙

- 시드 콘텐츠는 전부 `status='published'` 로 들어간다. `status`/`visibility` 축의 기본값(draft/private)이
  아니라 시더가 명시한다 — 시드는 "이미 공개된 콘텐츠"라는 뜻이다.
- `slug` 는 `^[a-z0-9]+(?:-[a-z0-9]+)*$` (content_items CHECK).
- LC 레슨의 `passage.body` 는 `[{speaker:'M'|'W', text}]` 객체 배열이다. 화자 라벨을 `text` 안에 다시
  넣지 말 것 — 재생·에디터·문장 은행이 전부 구조를 읽고, 라벨은 화면에서만 붙인다.
- 문항의 `answer` 는 대문자 한 글자, `options` 는 2~6개, `skill_code` 는
  grammar|vocab|detail|inference|main_idea 중 하나거나 null.
