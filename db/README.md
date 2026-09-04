# db/ — 스키마 관리

이 앱은 **전용 스키마**(`DB_SCHEMA`, 기본 `jina`)에 산다. 마이그레이션 SQL 은 스키마 접두를 쓰지 않고,
러너와 런타임 어댑터가 `search_path` 를 그 스키마 하나로 고정한다 — 스키마 이름이 코드에 박히지 않는다.

콘텐츠(레슨·시나리오·단어 세트·토픽·단어)는 마이그레이션이 아니라 `db/content/*.json` 이 단일 소스다.
`db/seeds/content.mjs` 가 slug 기준 upsert 로 넣는다(재실행 안전).

## 접속

접속 정보는 git에 추적되지 않는 `.env`의 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`.
psql로 직접 볼 때(Windows 콘솔은 `chcp 65001` 먼저):

```bash
psql "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
```

## PostgreSQL 없이 돌리기 — `DB_DRIVER=pglite`

PGlite 는 PostgreSQL 자체의 WASM 빌드다. SQL 도 마이그레이션도 그대로 쓰고, 설치와 `PG*` 접속 정보가
필요 없다. `.env` 에:

```
DB_DRIVER=pglite
PGLITE_DATA_DIR=.pglite/dev     # 비우면 메모리 — 프로세스가 끝나면 사라진다
```

그다음은 아래 명령이 전부 같다(`db:migrate` · `db:seed` · `db:rollback` · `db:reset`).

**한 번에 한 프로세스만 열 수 있다.** PGlite 는 프로세스마다 독립된 인스턴스라, 같은 데이터 디렉터리를
둘이 열면 서로의 쓰기를 보지 못하고 나중에 flush 한 쪽이 이긴다(실측: API 서버가 다른 프로세스의
`UPDATE` 를 끝내 보지 못했다). 그래서 `api/lib/pglite-lock.js` 가 PID 잠금을 걸고 두 번째 프로세스를
거부한다 — **마이그레이션·시드는 API 서버를 멈춘 뒤에 실행**한다. 강제 종료로 남은 잠금은 다음 실행이
자동 회수한다. 여러 프로세스가 동시에 붙어야 하면 `DB_DRIVER=pg` 를 쓴다.

`npm test` 는 이 설정과 무관하게 항상 메모리 DB 를 쓴다(`tests/setup.mjs`) — 개발 데이터를 건드리지 않는다.

## 명령

```bash
npm run db:migrate    # 미적용 마이그레이션 적용
npm run db:status     # applied / pending / MODIFIED! 표시
npm run db:rollback   # 마지막 1개를 .down.sql로 되돌림
npm run db:seed       # 콘텐츠(db/content) + 개발 계정 + 카드 8장 (재실행 안전)
npm run db:seed:content     # 콘텐츠만
npm run db:reset -- --yes   # DROP SCHEMA <DB_SCHEMA> CASCADE 후 빈 스키마 재생성

# DB 없이 도는 것
npm run db:verify           # 오프라인 점검 — 파일명·번호·down 짝·인코딩·금지 SQL (CI용)
npm run db:new -- add_foo   # 마이그레이션 짝(up+down) 생성. 번호 자동
npm run db:inspect          # 적용된 스키마를 COMMENT 와 함께 덤프 (DB_DRIVER=pg 전용)
```

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
| 규칙이 문서에만 있음 | `db:verify` 를 CI 에 걸면 게이트가 된다 |

재검토 시점: 사람이 둘 이상이 되어 마이그레이션이 병렬로 만들어지거나, 배포 환경이 여럿이 될 때.

## 규칙

- 파일명 `NNNN_snake_case.sql` — 4자리 0패딩, 사전순 = 적용순, **번호 재사용 금지**(`db:new` 가 지킨다)
- **적용된 파일은 수정 금지** — 체크섬 불일치로 러너가 즉시 실패한다. 고칠 것이 있으면 새 번호로 추가
- **`.down.sql` 짝을 반드시 만든다** — `db:verify` 가 없으면 실패시킨다
- 모든 DDL 멱등(`IF NOT EXISTS`)
- `.sql`은 BOM 없는 UTF-8. **`psql -f`로 밀지 말 것** — Windows 콘솔 코드페이지에서 한글/IPA가 깨진다. 반드시 `npm run db:migrate`
- 파일당 1 트랜잭션. 트랜잭션 밖에서 실행해야 하는 문(예: `CREATE INDEX CONCURRENTLY`)은 1행에 `-- migrate:no-transaction`
- 전용 스키마이므로 `reset` 은 `DROP SCHEMA <DB_SCHEMA> CASCADE` 한 줄이다. `public` 은 건드리지 않는다 — 거기에 다른 앱의 테이블이 산다
- 콘텐츠를 마이그레이션에 넣지 말 것 — 체크섬 불변 파일 안에 있으면 관리자가 편집한 순간 `db:reset` 이 그것을 되돌린다. `db/content/*.json` 에 둔다

## 후속 과제 — 최소권한 롤

현재 접속 롤이 슈퍼유저다. 전용 스키마를 쓰므로 GRANT 범위를 스키마 하나로 좁힐 수 있다:

```sql
-- CREATE ROLE jina_app LOGIN PASSWORD '...';
-- GRANT USAGE ON SCHEMA <DB_SCHEMA> TO jina_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA <DB_SCHEMA> TO jina_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA <DB_SCHEMA> TO jina_app;   -- BIGSERIAL용
-- ALTER DEFAULT PRIVILEGES IN SCHEMA <DB_SCHEMA> GRANT ... TO jina_app;     -- 이후 만들어질 것까지
-- schema_migrations 는 마이그레이션 전용 계정만 쓰기 가능하게 분리
```
