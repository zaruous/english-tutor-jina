# 작업: 관리자 사용자/역할 관리 구현 (Jina English Tutor)

너는 이 저장소(`D:\git\node\english tutor jina`)에서 **파일을 직접 수정**해 기능을 구현한다.

## 먼저 읽을 것 (반드시)

1. `docs/design/11-admin-users.md` — **이번 작업의 설계서다. 여기 적힌 대로 만든다.**
   API 응답 모양, 에러 코드, 화면 상태, 검증 시나리오 14개가 전부 명시돼 있다.
2. `db/README.md` — 마이그레이션 규칙(번호·down 짝·체크섬·BOM)
3. `api/middleware/auth.js`, `api/services/auth.service.js` — 세션 해석 방식
4. `api/routes/` 아무 파일 하나 — 라우트 작성 관례
5. `api/lib/errors.js` — HttpError 사용법
6. `src/screens/mistakes.jsx` — 화면 작성 관례(`theme.*` 인라인 스타일)
7. `scripts/e2e-topics.mjs` — e2e 스크립트 관례(DB 직접 픽스처)

## 지켜야 할 제약

- **`npm run db:new -- --target legacy user_roles`** 로 마이그레이션 짝을 만든다. 번호를 손으로 매기지 말 것.
  적용된 마이그레이션(0001~0016)은 **절대 수정 금지** — 체크섬으로 막혀 있다.
- 마이그레이션은 옛 DB(`public` 스키마) 대상이다. `db/baseline/` 은 **건드리지 않는다**(다른 DB 용).
- `.sql` 은 BOM 없는 UTF-8. `psql` 로 밀지 말고 `npm run db:migrate` 로 적용한다.
- 화면은 목업 `docs/plan/mockups/11-admin-users.html` 이 시각 기준이지만 **그 CSS 를 복사하지 않는다.**
  구현은 `src/shared/tokens.jsx` 의 `theme.*` 인라인 스타일 — 4개 테마 전환이 깨지면 안 된다.
- 권한 가드(본인 강등 금지·마지막 admin 강등 금지)는 **서비스 계층 한 곳**에만 둔다. 라우트·화면에 중복 구현 금지.
- 기존 화면을 깨뜨리지 말 것. 특히 `/api/auth/me` 에서 `is_admin` 을 **지우지 말고** `role` 을 추가로 내린다.

## 산출물

설계서 §2·§4·§5·§6 의 파일 전부:

- `db/migrations/0017_user_roles.sql` + `.down.sql`, `db/migrate.mjs` 의 `RESET_TABLES` 갱신
- `api/lib/roles.js`, `api/middleware/auth.js`(requireRole), `api/lib/errors.js`
- `api/services/auth.service.js`(resolveSession + /me DTO), `api/services/admin-user.service.js`
- `api/routes/admin.routes.js`, `api/server.js` 등록, `server.js` 의 `admin.html` 서빙
- `admin.html`, `src/admin/users.jsx`
- `scripts/e2e-admin-users.mjs` + `package.json` 스크립트

## 완료 조건

1. `npm run db:migrate` 성공 · `npm run db:status` 에 `0017` applied
2. `npm run db:verify` 통과 (down 짝·번호·BOM 검사)
3. `node scripts/e2e-admin-users.mjs` 의 14개 시나리오 통과
4. `node scripts/e2e-auth.mjs` 무회귀

## 보고

마지막에 다음을 적어라. 추측하지 말고 **실제로 실행한 결과**만:

- 만든/고친 파일 목록
- 실행한 명령과 그 결과(성공/실패, 실패면 에러 원문)
- 설계서와 다르게 구현한 부분과 그 이유
- 하지 못한 것과 막힌 지점
