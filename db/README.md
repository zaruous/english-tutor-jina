# db/ — 스키마 관리

## 접속

접속 정보는 git에 추적되지 않는 `.env`의 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`.
psql로 직접 볼 때(Windows 콘솔은 `chcp 65001` 먼저):

```bash
psql "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
```

**이전 중**: 새 전용 DB `jina_eng` / 스키마 `app` 으로 옮기는 중이다([플랜 10.7](../docs/plan/10.7-db-rebaseline.md)).
`db/baseline/` 이 새 스키마, `db/migrations/` 는 옛 DB `jina` 용이다. 완료 전까지 둘이 공존한다.

## 명령

러너는 `--target` 으로 두 대상을 가린다. 기본은 `legacy`(옛 DB `jina` / `public`),
`app` 은 새 DB `jina_eng` / `app` 스키마다. 명령 첫 줄에 어디에 붙었는지 항상 찍는다.

```bash
# 대상 무관
npm run db:verify           # 오프라인 점검 — 번호·down 짝·공통 컬럼·COMMENT (DB 불필요, CI용)
npm run db:new -- add_foo   # 마이그레이션 짝(up+down) 생성. 번호 자동
npm run db:inspect          # 적용된 스키마를 COMMENT 와 함께 덤프 (기본 --target app)

# 새 DB (jina_eng / app)
npm run db:app:status
npm run db:app:migrate
npm run db:app:reset -- --yes    # DROP SCHEMA app CASCADE

# 옛 DB (jina / public) — 10.7 Phase 2 까지만
npm run db:status
npm run db:migrate
npm run db:rollback         # 마지막 1개를 .down.sql로 되돌림
npm run db:seed             # 개발 계정 + 카드 8장 (재실행 안전)
npm run db:reset -- --yes   # 명시 목록의 테이블만 DROP (다른 앱 테이블과 동거하므로)
```

`.env` 에 `PGDATABASE_APP`(기본 `jina_eng`)·`DB_SCHEMA`(기본 `app`)로 새 대상을 바꿀 수 있다.

## 변경 관리 도구 — 라이브러리를 넣지 않는다 (2026-09-03 결정)

Flyway·Liquibase·dbmate·Atlas·node-pg-migrate 같은 전용 도구를 검토했고 **채택하지 않는다.**
이유는 취향이 아니라 이 프로젝트의 두 제약이다.

1. **PGlite 와 함께 못 쓴다.** [10.7 Phase 1](../docs/plan/10.7-db-rebaseline.md)은 DB 설치 없이
   테스트가 돌도록 `DB_DRIVER=pglite`(WASM PostgreSQL)를 도입한다. PGlite 는 wire protocol 서버가 아니라
   **인프로세스 라이브러리**다. Flyway·Liquibase·dbmate·Atlas 는 외부 바이너리로 접속 문자열을 요구하므로
   PGlite 에 마이그레이션을 적용할 방법이 없다 — 테스트 하네스가 스키마를 못 만든다.
   node-pg-migrate 는 Node 라이브러리지만 자체적으로 `pg` 클라이언트를 만들어 쓴다.
2. **스키마를 코드로 옮기는 도구는 규범과 충돌한다.** Drizzle Kit 은 PGlite 드라이버가 있어 1번을 통과하지만,
   스키마를 TypeScript 로 선언하게 만든다. 이 코드베이스는 집계·파생값을 SQL 안에서 계산하는 것이
   설계 원칙이고 10.7 §1 이 추상화 계층 도입을 명시적으로 기각했다.

그리고 **이미 있는 것으로 충분하다.** `db/migrate.mjs` 는 그 도구들이 주는 것을 대부분 갖고 있다 —
버전 순서, 이력 테이블(`schema_migrations`), up/down, status, 파일당 트랜잭션. 게다가 두 가지는
주류 도구가 기본으로 주지 않는다: **적용된 파일의 SHA-256 체크섬 강제**(고치면 즉시 실패)와
**`pg_advisory_lock` 동시 실행 차단**.

대신 부족했던 **규율**을 스크립트로 메웠다. 라이브러리가 해주던 일 중 우리에게 없던 것은
"사람이 규칙을 어겼을 때 잡아주는 것"이었다:

| 없던 것 | 채운 것 |
|---|---|
| 번호를 손으로 매기다 중복 | `db:new` 가 다음 번호로 up+down 을 만든다 |
| down 파일을 잊음 | `db:verify` 가 짝 없는 마이그레이션을 실패시킨다 |
| 새 테이블에 공통 컬럼·COMMENT 누락 | `db:verify` 가 baseline 을 파싱해 확인한다 |
| 규칙이 문서에만 있음 | `db:verify` 를 CI 에 걸면 게이트가 된다 |

재검토 시점: 사람이 둘 이상이 되어 마이그레이션이 병렬로 만들어지거나, 배포 환경이 여럿이 될 때.

## 규칙

- 파일명 `NNNN_snake_case.sql` — 4자리 0패딩, 사전순 = 적용순, **번호 재사용 금지**(`db:new` 가 지킨다)
- **적용된 파일은 수정 금지** — 체크섬 불일치로 러너가 즉시 실패한다. 고칠 것이 있으면 새 번호로 추가
- **`.down.sql` 짝을 반드시 만든다** — `db:verify` 가 없으면 실패시킨다
- 모든 DDL 멱등(`IF NOT EXISTS`)
- `.sql`은 BOM 없는 UTF-8. **`psql -f`로 밀지 말 것** — Windows 콘솔 코드페이지에서 한글/IPA가 깨진다. 반드시 `npm run db:migrate`
- 파일당 1 트랜잭션. 트랜잭션 밖에서 실행해야 하는 문(예: `CREATE INDEX CONCURRENTLY`)은 1행에 `-- migrate:no-transaction`
- 옛 DB(`jina`)에서 `DROP SCHEMA public CASCADE` **절대 금지** — 같은 스키마에 다른 앱의 테이블 11개가 산다

### 새 스키마(`app`)의 공통 컬럼 규약

[10.7 §3.4](../docs/plan/10.7-db-rebaseline.md). 모든 테이블 = 고유 컬럼 + 아래 세트.

```
description  TEXT NOT NULL DEFAULT ''    -- 행 설명(데이터). 테이블 설명은 COMMENT ON
is_active    BOOLEAN NOT NULL DEFAULT true    -- 사용 여부
is_deleted   BOOLEAN NOT NULL DEFAULT false   -- 삭제 여부(soft delete). 물리 삭제 안 함
deleted_at / deleted_by · created_at / created_by · updated_at / updated_by
cmf_1 … cmf_10 TEXT              -- 확장 슬롯
CHECK (is_deleted = (deleted_at IS NOT NULL))
```

- `updated_at` 은 트리거(`app.set_updated_at()`)가 채운다. 쿼리에 `updated_at = now()` 를 쓰지 않는다.
- soft delete 이므로 **UNIQUE 는 `WHERE NOT is_deleted` 부분 인덱스**로 건다. 안 그러면 지운 행이
  이메일·slug 를 계속 붙들어 같은 값으로 다시 만들 수 없다.
- 조회 조건에 `is_deleted`·`is_active` 가 들어간다 — `api/lib/content-scope.js` 헬퍼가 함께 건다.
- `cmf_*` 는 **쓰기 시작할 때 `COMMENT ON COLUMN` 을 단다.** 자리를 잡으면 이름 있는 컬럼으로 승격.
- append-only 로그(`*_audit_log`)는 예외 — `created_at`/`created_by` 만 갖는다. 파일에
  `-- common:exempt <table>` 로 선언하고 이유를 적는다. `db:verify` 가 선언 없는 예외를 잡는다.

### 기준정보(공통 코드) — 무엇을 `codes` 에 두는가

`code_groups` + `codes`(`0002_common_codes.sql`)는 **긴 꼬리 열거값**만 담는다.

- **전용 테이블로 남긴다** — 다른 테이블이 FK 로 참조하거나(`roles`, `content_statuses`),
  값에 동작이 딸린 것(`roles.rank` 서열 비교, `content_transitions` 전이 규칙).
- **`codes` 로 온다** — 화면 라벨·필터 칩·드롭다운. 코드가 늘어도 로직이 안 바뀌는 것.
  `skill_code`, 첨삭 유형, 레슨 종류, 복습 평가, 신고 사유, 난이도 라벨.

`codes` 를 쓰는 컬럼에도 **진짜 FK 를 걸 수 있다.** 그룹을 고정한 생성 컬럼을 옆에 두면 된다
(PostgreSQL 16.15 실측 — 다른 그룹의 코드를 거부한다):

```sql
ALTER TABLE app.lesson_items
  ADD COLUMN skill_group TEXT GENERATED ALWAYS AS ('SKILL_CODE') STORED,
  ADD CONSTRAINT lesson_items_skill_fk
    FOREIGN KEY (skill_group, skill_code) REFERENCES app.codes(group_code, code);
```

주의 둘. **`is_active = false` 는 FK 가 막지 않는다** — 사용 중지한 코드를 새로 쓰는 것은 앱이 거른다.
그리고 `codes` 는 다른 테이블과 달리 **부분 UNIQUE 를 걸지 않는다**. 지운 코드의 값을 재사용하지
못하는 것이 의도다 — 과거 이력이 그 문자열을 가리키고 있어서 뜻이 바뀌면 지난 데이터가 조용히 오염된다.

## 후속 과제 — 최소권한 롤

현재 접속 롤이 슈퍼유저다. 전용 스키마로 옮기면 GRANT 범위가 스키마 하나로 떨어진다:

```sql
-- CREATE ROLE jina_app LOGIN PASSWORD '...';
-- GRANT USAGE ON SCHEMA app TO jina_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO jina_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO jina_app;   -- BIGSERIAL용
-- ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ... TO jina_app;     -- 이후 만들어질 것까지
-- schema_migrations 는 마이그레이션 전용 계정만 쓰기 가능하게 분리
```
