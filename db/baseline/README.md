# db/baseline/ — 전용 DB `jina_eng` / 스키마 `app` 의 기반 스키마

[플랜 10.7](../../docs/plan/10.7-db-rebaseline.md)의 산출물. 옛 DB `jina` 의 `db/migrations/` 를 대체한다.

## 왜 별도 디렉터리인가

`db/migrations/` 는 **옛 DB `jina`** 에 적용된 이력이고 체크섬이 걸려 있다. 새 스키마를 거기에 번호로 이어
붙이면 옛 DB 에 적용하려 들게 된다. 두 대상이 다르므로 디렉터리를 나눈다.
10.7 Phase 2 가 끝나 앱이 `app` 스키마로 부팅되면 `db/migrations/` 는 삭제하고(git 이력에 남는다)
이 디렉터리가 `0001_baseline.sql` + 이후 번호를 갖는 정식 마이그레이션 경로가 된다.

## 적용 상태

`0001_baseline.sql` 은 **아직 앱을 띄울 수 없다.** 사용자·권한·콘텐츠 승인 영역만 들어 있다.

| 영역 | 테이블 | 상태 |
|---|---|---|
| 스키마·공용 함수 | `app`, `set_updated_at()` | ✔ |
| 권한 | `roles` | ✔ |
| 사용자 | `users`, `auth_sessions`, `user_audit_log` | ✔ |
| 콘텐츠 승인 | `content_statuses`, `content_transitions`, `content_items`, `content_audit_log` | ✔ |
| 기준정보 | `code_groups`, `codes` | ✔ (`0002`) |
| 콘텐츠 본문 | `lesson_details`, `scenario_details`, `vocab_set_details`, `lesson_items` | ☐ 10.7 Phase 2 |
| 학습 이력 | `user_lesson_attempts`, `lesson_qa_sessions`, `lesson_reports` | ☐ 10.7 Phase 2 |
| 단어장 | `vocab_words`, `user_vocab_cards`, `vocab_reviews`, `vocab_quizzes` | ☐ 10.7 Phase 2 |
| 회화 | `conversation_sessions`, `conversation_messages`, `corrections`, `correction_reviews` | ☐ 10.7 Phase 2 |
| 토픽 | `topics`, `topic_contents` | ☐ 10.7 Phase 2 |
| AI 생성 | `ai_jobs`, `lesson_drafts` | ☐ 10.7 Phase 2 (`review_status` 없이) |
| 진도 | `user_goals`, `daily_progress` | ☐ 10.7 Phase 2 |

## 적용됨 (2026-09-03)

`jina_eng` 에 **실제로 적용돼 있다** — `npm run db:app:status` → `applied 0001_baseline.sql`.
이력은 `app.schema_migrations`(체크섬 포함)에 남는다. 다시 만들려면:

```bash
npm run db:app:reset -- --yes   # DROP SCHEMA app CASCADE
npm run db:app:migrate
npm run db:inspect              # COMMENT 와 함께 확인
```

## 실측 (2026-09-03)

빈 `jina_eng` 에 `0001_baseline.sql` 을 통째로 적용해 확인했다.

- 서버 **PostgreSQL 16.15** (Ubuntu). 적용 73ms, 한 트랜잭션.
- 테이블 8개, `COMMENT ON` 23건.
- 공통 컬럼 세트가 5개 테이블(`roles`·`users`·`content_statuses`·`content_transitions`·`content_items`)에
  전부 붙고, append-only 로그 2개에는 `is_active`·`is_deleted`·`updated_at` 이 **없다.**
- `BEFORE UPDATE` 트리거가 `updated_at` 을 실제로 갱신한다.
- soft delete 후 **같은 이메일로 재가입 가능**(부분 UNIQUE 가 동작).
- `is_deleted = true` + `deleted_at IS NULL` → CHECK 거부.
- `content_items` 게시 CHECK(11 열린 질문 7 → 후보 A):
  `published+public` 허용 · **`archived+public` 허용** · `draft+public` 거부 · `review+public` 거부.
  archived 가 public 을 유지한다는 것이 이 설계의 핵심이고, 여기서 실증됐다.
- 전이 allowlist 6행, `published → draft` 없음.

> **버전 스큐 주의**: 실서버는 **16.15** 인데 PGlite 는 PostgreSQL 18 이다(10.7 §2.2).
> 18 에서 통과한 문법이 16 에서 거부될 수 있으므로, 릴리스 전 1회는 `DB_DRIVER=pg` 로 전체 회귀를 돌린다.
> 위 실측은 16.15 기준이므로 이 baseline 자체는 안전하다.

## 규약

`db/README.md` 의 "새 스키마(`app`)의 공통 컬럼 규약" 참조. `npm run db:verify` 가 지킨다.
