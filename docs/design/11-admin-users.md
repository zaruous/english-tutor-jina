# 화면 설계서 — 관리자 · 사용자/역할 관리

- 플랜: [11 Phase 3](../plan/11-content-lifecycle-admin.md) · 스키마 근거: [10.7 §3.3·§3.4](../plan/10.7-db-rebaseline.md)
- 미리보기: [`../plan/img/11-admin-users.png`](../plan/img/11-admin-users.png) · 목업 소스 `../plan/mockups/11-admin-users.html`
- 작성 2026-09-03

## 0. 이 문서의 전제 — 어느 DB에 만드는가

앱은 지금 **옛 DB `jina`(`public`, `users.is_admin`)** 로 돈다. 새 스키마 `jina_eng`/`app` 은
[`db/baseline/`](../../db/baseline/) 에 만들어져 있지만 **앱이 연결돼 있지 않다**(10.7 Phase 1·2 미착수).

그래서 이 기능은 **옛 DB 위에 만든다.** `0017_user_roles.sql` 로 `roles` · `users.role` ·
`user_audit_log` 를 `public` 에 올린다. 근거:

- 앱이 도는 DB 에 없으면 "역할을 바꿔도 아무 일이 안 일어나는" 기능이 된다.
- DDL 은 baseline 과 **같은 모양**이라 Phase 2 가 baseline 을 적용할 때 그대로 수렴한다. 버려지지 않는다.
- 10.5 의 `requireAdmin` 도 `is_admin` 대신 `role` 위에서 시작할 수 있게 된다.

"옛 DB 는 더 이상 열지 않는다"(10.7 §3.1)는 **baseline 재작성 대상에서 뺀다**는 뜻이지,
Phase 2 전까지 운영 DB 를 동결한다는 뜻이 아니다. 이 문서가 그 해석을 못 박는다.

`is_admin` 은 **지우지 않는다.** `role` 을 채우고 읽기는 `role` 만 한다. 한 사이클 뒤 제거(롤백 여지).

---

## 1. 범위

| 하는 것 | 안 하는 것 |
|---|---|
| 사용자 목록(검색·역할 필터·활성 세션 수) | 계정 생성 — 임시 비밀번호 전달 수단(메일) 없음 |
| 역할 부여 `learner\|author\|reviewer\|admin` | 비밀번호 재설정 — 같은 이유 |
| 사용 중지/재개(`is_active`) | 계정 삭제 — `ON DELETE CASCADE` 가 학습 이력까지 지운다 |
| 세션 강제 종료(탈취 대응) | 역할 세분화·다대다 권한 |
| 모든 변경을 `user_audit_log` 에 기록 | 콘텐츠 관리 화면(11 Phase 2) · 검수(12) |

---

## 2. 데이터

### 2.1 마이그레이션 `db/migrations/0017_user_roles.sql`

`npm run db:new -- --target legacy user_roles` 로 짝을 만든 뒤 채운다. baseline(`db/baseline/0001_baseline.sql`)의
`roles` · `users.role` · `user_audit_log` 와 **컬럼 이름·의미가 같아야 한다.**

```sql
CREATE TABLE IF NOT EXISTS public.roles (
  code        TEXT     PRIMARY KEY,
  rank        SMALLINT NOT NULL UNIQUE,
  name        TEXT     NOT NULL,
  description TEXT     NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.roles (code, rank, name, description) VALUES
  ('learner',  10, '학습자', '학습만 한다. 관리 API 는 전부 403.'),
  ('author',   20, '저작자', '콘텐츠 생성·수정, 검수 요청(draft → review).'),
  ('reviewer', 30, '검수자', '저작자 권한에 더해 승인·반려·공개·내림.'),
  ('admin',    40, '관리자', '검수자 권한에 더해 시스템 조작과 역할 부여.')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'learner',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
-- 기존 is_admin 을 role 로 백필. is_admin 컬럼은 남긴다(한 사이클).
UPDATE public.users SET role = 'admin' WHERE is_admin AND role = 'learner';
ALTER TABLE public.users
  ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES public.roles(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users (role) WHERE role <> 'learner';

CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id             BIGSERIAL   PRIMARY KEY,
  target_user_id BIGINT      NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action         TEXT        NOT NULL,
  from_role      TEXT        REFERENCES public.roles(code) ON UPDATE CASCADE,
  to_role        TEXT        REFERENCES public.roles(code) ON UPDATE CASCADE,
  description    TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     BIGINT      REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT user_audit_action_ck
    CHECK (action IN ('role_change','session_revoke','disable','enable','delete'))
);
CREATE INDEX IF NOT EXISTS user_audit_target_idx
  ON public.user_audit_log (target_user_id, created_at DESC);
```

`db/migrate.mjs` 의 `RESET_TABLES` 맨 앞(FK 역순)에 `user_audit_log`, `roles` 는 `users` 뒤에 넣는다.
`.down.sql` 은 두 테이블 DROP + `users` 의 두 컬럼 DROP.

### 2.2 세션과 권한 — 즉시 반영이 전제다

`resolveSession`(`api/services/auth.service.js:77`)이 요청마다 `auth_sessions JOIN users` 를 한다.
그래서 **`role` 변경·사용 중지가 다음 요청부터 곧바로 걸린다.** 이 성질을 깨지 않는다:

- `SELECT` 목록에 `u.is_admin` 대신 `u.role`, `u.is_active` 를 넣는다.
- `WHERE` 에 `AND u.is_active` 를 더한다 → 사용 중지 계정은 세션이 있어도 401.
- **`role` 을 쿠키/토큰에 싣지 않는다.**

---

## 3. API

전 경로 `/api/admin/users*` 는 `requireRole('admin')`. 변경 요청은 기존 `X-Requested-With: jina` CSRF 규칙을 탄다.

### 3.1 `GET /api/admin/users`

쿼리: `q`(이메일·이름 부분일치, 선택) · `role`(선택) · `limit`(기본 50, 최대 200) · `offset`(기본 0)

```json
{ "users": [ {
    "id": 3, "email": "sumin@example.com", "display_name": "박수민",
    "role": "author", "is_active": true, "is_dev": false,
    "created_at": "2026-08-28T…", "last_login_at": "2026-09-03T…",
    "active_sessions": 3,
    "is_self": false, "can_change_role": true
  } ],
  "total": 6,
  "roles": [ { "code":"learner","rank":10,"name":"학습자","description":"…" }, … ],
  "counts": { "learner": 2, "author": 1, "reviewer": 1, "admin": 2 } }
```

- `active_sessions` — `auth_sessions` 에서 `revoked_at IS NULL AND expires_at > now()` 집계.
- `can_change_role` — **서버가 계산한다.** `false` 인 경우: 본인이거나, `admin` 이 하나뿐인데 그 계정.
  화면이 규칙을 다시 구현하면 두 곳이 어긋난다.
- `roles` 를 함께 내리는 이유: 드롭다운의 라벨·설명이 `roles` 테이블에서 온다(문구를 코드에 박지 않는다).

### 3.2 `PATCH /api/admin/users/:id/role`

요청 `{ "to": "author", "note": "저작 담당" }` · 응답 `{ "user": {…3.1의 항목…} }`

| 상황 | 상태 | code |
|---|---|---|
| 성공 | 200 | — |
| `to` 가 `roles` 에 없음 | 400 | `BAD_REQUEST` |
| 대상 없음 | 404 | `NOT_FOUND` |
| **본인 강등** | 409 | `SELF_DEMOTION` |
| **마지막 admin 강등** | 409 | `LAST_ADMIN` |
| 호출자가 admin 아님 | 403 | `FORBIDDEN` |

권한이 아니라 **상태** 문제라서 409다. 승격(rank 상승)은 본인이어도 막지 않는다 — 잠기지 않는다.
성공 시 `user_audit_log(action='role_change', from_role, to_role, description=note, created_by=행위자)` 1행.
역할 변경과 로그를 **한 트랜잭션**으로 쓴다.

### 3.3 `PATCH /api/admin/users/:id/active`

요청 `{ "to": false, "note": "…" }` · 성공 200. 본인/마지막 admin 은 `to=false` 일 때 409(같은 code).
로그 `action='disable'|'enable'`.

### 3.4 `POST /api/admin/users/:id/sessions/revoke`

응답 `{ "revoked": 3 }`. 그 사용자의 세션 전부 `revoked_at = now()`.
로그 `action='session_revoke'`. **본인 대상도 허용**(다른 기기 로그아웃) — 여기엔 가드가 없다.

### 3.5 `GET /api/auth/me` 변경

`is_admin` 자리에 `role` + 편의 불린을 넣는다. 클라이언트가 서열을 직접 계산하면 규칙이 두 곳이 된다.

```json
{ "user": { "…": "…", "role": "admin",
            "can_author": true, "can_review": true, "can_admin": true } }
```

`is_admin` 은 한 사이클 **같이 내려보낸다**(기존 화면 회귀 방지).

---

## 4. 서버 구현

| 파일 | 변경 |
|---|---|
| `api/lib/roles.js` (신규) | `ROLE_RANK` 를 DB `roles` 에서 1회 로드해 캐시 · `rankOf(code)` · `atLeast(userRole, required)` |
| `api/middleware/auth.js` | `requireRole(required)` 추가 — `requireUser` 후 `atLeast` 검사, 아니면 `HttpError(403,'FORBIDDEN')`. `requireAdmin = requireRole('admin')` 별칭 |
| `api/lib/errors.js` | `FORBIDDEN` · `SELF_DEMOTION` · `LAST_ADMIN` 코드가 없으면 추가 |
| `api/services/auth.service.js` | `resolveSession` SELECT/WHERE 수정(§2.2) · `/me` DTO(§3.5) |
| `api/services/admin-user.service.js` (신규) | 목록·역할 변경·활성 토글·세션 폐기. **가드와 감사 로그가 여기 산다** |
| `api/routes/admin.routes.js` (신규) | §3 라우트 4개. 얇게 — 검증과 규칙은 서비스 |
| `api/server.js` | `/api/admin` 라우터 등록 |
| `server.js` | `admin.html` 정적 서빙(기존 deny-list 유지) |

**가드는 서비스 한 곳에만 둔다.** 라우트·화면에 중복 구현하지 않는다.
마지막 admin 판정은 같은 트랜잭션 안에서 `SELECT count(*) … WHERE role='admin' AND is_active FOR UPDATE` 로 센다
— 동시에 두 admin 을 강등하면 둘 다 통과하는 경합이 실재한다.

---

## 5. 화면 `admin.html` + `src/admin/users.jsx`

목업 [`11-admin-users.png`](../plan/img/11-admin-users.png) 이 시각 기준이다. **목업의 CSS 를 복사하지 않는다** —
구현은 `src/shared/tokens.jsx` 의 `theme.*` 인라인 스타일을 쓴다(4개 테마 전환이 깨지면 안 된다).

`index.html` 과 같은 뼈대(Babel standalone + `src/shared/*` 재사용), 학습 화면은 로드하지 않는다.
`admin.html` 자체에 가드를 두지 않는다 — 인증을 클라이언트에 맡기지 않고, `role` 이 낮으면 API 가 전부 403이라 빈 화면이 된다.

### 5.1 구조

```
상단바   [J] Jina 콘텐츠 관리   [ADMIN]                admin@… · role=admin
탭       콘텐츠(비활성) · 검수(비활성) · [사용자]        ← 나머지 둘은 11 Phase 2·12
헤더     "사용자"                        admin 2 · reviewer 1 · author 1 · learner 2
필터     [검색 입력]  [전체][admin][reviewer][author][learner]
표       사용자 | 역할 | 가입 | 마지막 로그인 | 활성 세션 | ⋯
하단     안내 문구 · user_audit_log 최근 3행
```

### 5.2 컴포넌트 상태

| 상태 | 화면 |
|---|---|
| 로딩 | 표 자리에 스켈레톤 3행 |
| 403 | "관리자 권한이 필요합니다" 안내 한 줄 (탭·표 숨김) |
| 빈 결과 | "검색 결과가 없습니다" |
| 오류 | 상단에 빨간 배너 + 재시도 버튼 |

### 5.3 조작

| 요소 | 동작 |
|---|---|
| 역할 셀 | 드롭다운. `roles` 응답으로 렌더(라벨+설명). 선택 시 즉시 `PATCH …/role` → 성공하면 그 행만 갱신 |
| 역할 셀 (`can_change_role=false`) | 자물쇠 아이콘 + 비활성. 툴팁에 이유("본인" / "마지막 관리자") |
| `⋯` 메뉴 | "사용 중지"(또는 "사용 재개") · "세션 모두 종료" |
| 사용 중지 | 확인 대화 후 `PATCH …/active` |
| 세션 종료 | 확인 대화 후 `POST …/sessions/revoke` → 결과 토스트 "세션 3개를 종료했습니다" |

409 응답은 **서버 메시지를 그대로** 토스트에 띄운다. 화면이 문구를 따로 갖지 않는다.

### 5.4 색

역할 색은 `theme.*` 토큰: `admin`=`warning` · `reviewer`=`success` · `author`=`accent` · `learner`=`textDim`.
활성 세션 0은 `textDim`, 1 이상은 `success` 점.

### 5.5 진입

설정 화면(05)에 `can_author` 일 때만 "콘텐츠 관리 열기"(`admin.html`, 새 탭) 한 줄.
`APP_PAGES`(`app-nav.jsx`)는 건드리지 않는다.

---

## 6. 검증 `scripts/e2e-admin-users.mjs`

기존 `scripts/e2e-*.mjs` 형식(Playwright + 직접 fetch). `npm run dev` 가 떠 있는 상태에서 실행.
테스트 계정 3개(`learner`/`reviewer`/`admin`)를 DB 에 직접 심고 끝나면 지운다(`e2e-topics.mjs` 선례).

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | learner 쿠키로 `GET /api/admin/users` | 403 `FORBIDDEN` |
| 2 | reviewer 쿠키로 같은 요청 | 403 (사용자 관리는 admin 전용) |
| 3 | admin 쿠키로 목록 | 200 · `total` ≥ 3 · `roles` 4개 · `counts` 합 = `total` |
| 4 | `q=` 부분일치 검색 | 해당 계정만 |
| 5 | learner → author 승격 | 200 · `user.role='author'` · `user_audit_log` 1행 증가 |
| 6 | **승격 직후 그 계정 쿠키로** `GET /api/admin/contents` 류 author 경로 | **재로그인 없이** 통과(즉시 반영) |
| 7 | 본인 강등 | 409 `SELF_DEMOTION` · 로그 증가 없음 |
| 8 | 마지막 admin 강등 | 409 `LAST_ADMIN` |
| 9 | admin 2명일 때 한 명 강등 | 200 |
| 10 | 사용 중지 후 그 계정 쿠키로 아무 API | 401 (세션 남아 있어도) |
| 11 | 세션 종료 | `revoked` 수 = 종료 전 활성 세션 수 · 그 쿠키로 401 |
| 12 | CSRF 헤더 없이 `PATCH …/role` | 403 |
| 13 | 화면: admin 로그인 → `admin.html` 렌더 · 역할 드롭다운 노출 · 잠긴 행에 자물쇠 | 스크린샷 1장 |
| 14 | 회귀 | `e2e-auth.mjs` exit 0 (`/me` DTO 변경 영향) |

**완료 판정**: 위 14개 통과 + `npm run db:status` 에 `0017` applied + 기존 e2e 무회귀.

---

## 7. 구현자가 빠뜨리기 쉬운 것

- `resolveSession` 에 `is_active` 조건을 넣지 않으면 사용 중지가 **다음 로그인부터** 걸린다(시나리오 10 실패).
- 마지막 admin 판정을 트랜잭션 밖에서 세면 동시 강등 경합이 뚫린다(§4).
- `/api/auth/me` 에서 `is_admin` 을 **지우면** 기존 화면이 깨진다. 한 사이클 같이 내린다.
- 역할 드롭다운 문구를 JSX 에 하드코딩하면 `roles.description` 을 둔 의미가 없다.
- 목업 `shared.css` 를 복사해 오면 테마 전환이 깨진다 — `theme.*` 인라인 스타일.
- `RESET_TABLES` 갱신을 잊으면 `db:reset` 이 새 테이블을 남겨 다음 마이그레이션이 깨진다.
