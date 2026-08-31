# db/ — 스키마 관리

## 접속

접속 정보는 git에 추적되지 않는 `.env`의 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`.
psql로 직접 볼 때(Windows 콘솔은 `chcp 65001` 먼저):

```bash
psql "postgresql://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
```

## 명령

```bash
npm run db:migrate    # 미적용 마이그레이션 적용
npm run db:status     # applied / pending / MODIFIED! 표시
npm run db:rollback   # 마지막 1개를 .down.sql로 되돌림
npm run db:seed       # 개발 계정 + 카드 8장 (재실행 안전)
npm run db:reset -- --yes   # 이 앱의 테이블만 명시 목록으로 DROP
```

## 규칙

- 파일명 `NNNN_snake_case.sql` — 4자리 0패딩, 사전순 = 적용순, **번호 재사용 금지**
- **적용된 파일은 수정 금지** — 체크섬 불일치로 러너가 즉시 실패한다. 고칠 것이 있으면 새 번호로 추가
- 모든 DDL 멱등(`IF NOT EXISTS`), 모든 식별자에 `public.` 명시
- `.sql`은 BOM 없는 UTF-8. **`psql -f`로 밀지 말 것** — Windows 콘솔 코드페이지에서 한글/IPA가 깨진다. 반드시 `npm run db:migrate`
- 파일당 1 트랜잭션. 트랜잭션 밖에서 실행해야 하는 문(예: `CREATE INDEX CONCURRENTLY`)은 1행에 `-- migrate:no-transaction`
- `DROP SCHEMA public CASCADE` **절대 금지** — 같은 스키마에 다른 앱의 테이블 11개가 산다. reset은 `migrate.mjs`의 명시적 목록만 지운다

## 후속 과제 — 최소권한 롤

현재 접속 롤이 슈퍼유저다. 운영 전에 최소권한 롤을 만들어 이 앱의 테이블에만 DML을 허용할 것:

```sql
-- CREATE ROLE jina_app LOGIN PASSWORD '...';
-- GRANT USAGE ON SCHEMA public TO jina_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE
--   ON public.users, public.auth_sessions, public.vocab_words,
--      public.user_vocab_cards, public.vocab_reviews,
--      public.conversation_sessions, public.conversation_messages,
--      public.corrections TO jina_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jina_app;  -- BIGSERIAL용
-- schema_migrations 는 마이그레이션 전용 계정만 쓰기 가능하게 분리
```
