# Cursor 위임 구현 검증 — 관리자 사용자/역할 관리

- 설계서: [`docs/design/11-admin-users.md`](../design/11-admin-users.md)
- 위임: `coworks/scenario-review/cursor-task.js`, 모델 `composer-2.5`, 세션 `agent-…` (로그 `coworks/logs/jina-admin-users-2026-09-03.md`)
- 검증자: Claude (이 문서) — **Cursor 의 자체 보고를 믿지 않고 명령을 직접 재실행**했다.
- 2026-09-03

## 0. 결론

**받아들일 만하다.** 설계서 대비 누락이 없고, 내가 직접 돌린 검증이 전부 통과했다.
구현자가 빠뜨리기 쉽다고 §7 에 적어 둔 함정 6개 중 **6개 모두 회피**했다.

다만 **결함 1건(테스트 안전성)과 설계 의미 오류 1건**이 있다. 둘 다 코드가 아니라 검증 쪽이다.

## 1. 실행 실패와 원인 — 모델 한도

첫 두 번의 실행이 21초 만에 `[resource_exhausted]` 로 실패하고 **파일을 하나도 만들지 않았다.**
원인은 `cursor-task.js` 가 `model: { id: 'auto' }` 를 하드코딩한 것이고, `auto` 의 한도가 소진돼 있었다.
모델별로 찔러 본 결과 `composer-2.5` 는 정상(`PONG`)이었다.

→ `coworks/scenario-review/cursor-task.js` 에 `CURSOR_MODEL` 환경변수를 추가했다(기본값 `auto` 유지).
`CURSOR_MODEL=composer-2.5` 로 재실행해 성공.

## 2. 내가 직접 돌린 검증

| 명령 | 결과 |
|---|---|
| `node db/migrate.mjs status` | `applied 0017_user_roles.sql` |
| `node db/verify.mjs` | 통과 — migrations 17 · baseline 3 |
| `node scripts/e2e-admin-users.mjs` | **15/15 통과** |
| 중첩 `scripts/e2e-auth.mjs` | **40/40 통과, exit 0** |
| DB 실계정 확인 | `admin@jina.local` = `role=admin, is_admin=true, is_active=true` (무사) · e2e 잔여 계정 0건 |

`npm run dev` 는 내가 직접 띄웠다. Cursor 가 남긴 고아 node 프로세스가 3003/3004 를 점유하고 있어
포트 기준으로 종료 후 재기동했다(기존에 알려진 함정).

## 3. 설계서 §7 함정 — 6/6 회피

| 함정 | 결과 |
|---|---|
| `resolveSession` 에 `is_active` 누락 | 회피 — `auth.service.js:107` `AND u.is_active`. 로그인 경로(`:79`)에도 있다 |
| 마지막 admin 판정을 트랜잭션 밖에서 | 회피 — `changeRole` 트랜잭션 안에서 `FOR UPDATE` |
| `/api/auth/me` 에서 `is_admin` 제거 | 회피 — `:19` 에서 `is_admin` 유지 + `can_author/review/admin` 추가 |
| 역할 문구를 JSX 에 하드코딩 | 회피 — `state.roles`(API) 로 렌더. 한글 라벨 하드코딩 0건 |
| 목업 `shared.css` 복사 | 회피 — `theme.*` 토큰만. 하드코딩 hex 0건, `shared.css` 참조 없음 |
| `RESET_TABLES` 갱신 누락 | 회피 — `user_audit_log`(맨 앞) · `roles`(users 뒤) 추가 |

`countActiveAdmins` 는 설계서가 적은 `SELECT count(*) … FOR UPDATE` 가 PostgreSQL 에서 불가(`0A000`)라
`SELECT id … FOR UPDATE` 후 길이로 세도록 바꿨다 — **설계서 쪽이 틀렸고 구현이 맞다.**

## 4. 결함

### 4.1 [높음] e2e 시나리오 8 이 실계정을 강등했다가 복구한다 — 복구가 보장되지 않는다

`scripts/e2e-admin-users.mjs:145-172`. "마지막 admin" 상태를 만들려고 **테스트가 만들지 않은 admin 계정**
(=`admin@jina.local`)을 `reviewer` 로 UPDATE 한 뒤, 테스트가 끝나면 되돌린다.

문제는 되돌리는 코드가 `finally` 밖(`:165`)에 있다는 것이다. `:157`~`:163` 사이에서 예외가 나면 복구가 실행되지
않고, `finally` 블록은 `email LIKE '${TAG}%'` 인 테스트 계정만 지운다. 그러면 **유일한 실제 관리자 계정이
`role='reviewer'` 로 남는다.** `requireRole('admin')` 이 모든 관리 API 를 막고 있으므로 관리자 잠금이다.

이번 두 번의 실행에서는 복구가 정상 동작했다(확인함). 하지만 재실행할 때마다 같은 위험을 진다.

**고칠 방향**: 실계정을 건드리지 말고, 테스트가 만든 admin 만으로 "활성 admin 1명" 상태를 만들 수 없다면
그 시나리오는 트랜잭션 롤백이나 별도 DB 로 옮긴다. 최소한 복구를 `finally` 안으로 넣는다.

### 4.2 [낮음] `LAST_ADMIN` 가드가 대상의 활성 여부를 보지 않는다 — 그리고 테스트가 그 오류를 고정한다

`admin-user.service.js:172-177`:

```js
if (demoting && target.role === 'admin') {
  const adminCount = await countActiveAdmins(client);   // 전역 활성 admin 수
  if (adminCount <= 1) throw new HttpError(409, 'LAST_ADMIN', …);
}
```

이 카운트는 **대상을 제외하지 않고, 대상이 활성인지도 보지 않는다.** 그래서
"활성 admin 이 1명(=행위자)이고 대상은 **비활성** admin" 인 상태에서 대상을 강등하면 409 가 난다.
그런데 비활성 admin 을 강등해도 쓸 수 있는 관리자 수는 그대로다 — 막을 이유가 없다.
비활성화된 관리자의 역할을 정리하려는 정당한 조작이 막힌다.

반대로 이 가드가 **실제로 보호해야 할 경우는 도달 불가능**하다. 행위자는 항상 활성 admin 이고
본인 강등은 `SELF_DEMOTION` 이 먼저 막으므로, 대상이 활성 admin 이면 카운트는 늘 2 이상이다.

시나리오 8 은 바로 이 잘못된 경로(대상을 비활성으로 만든 뒤 강등)로 409 를 끌어낸다.
**가드가 의도한 경우는 테스트되지 않았고, 통과한 것은 오류 경로다.**

**고칠 방향**: `if (demoting && target.role === 'admin' && target.is_active)` 로 좁히고
카운트에서 대상을 제외한다. 그러면 가드는 사실상 발화하지 않게 되는데, 그것이 정상이다 —
현재 규칙(자기 강등 금지)만으로 admin 0명 상태가 이미 불가능하기 때문이다.
가드를 남길지, 규칙을 바꿔 도달 가능하게 만들지는 설계 판단이다.

## 5. 설계서와 다른 구현 — 모두 타당

| 항목 | 판단 |
|---|---|
| `scripts/e2e-auth.mjs` 셀렉터 수정 | **정당.** `git show HEAD:src/screens/login.jsx` 확인 결과 원래부터 `type="text"` 였다. `input[type=email]` 은 0건을 매치해 **이 테스트는 Cursor 작업 전부터 깨져 있었다.** 테스트를 통과시키려 제품을 바꾼 것이 아니라, 깨진 테스트를 고쳤다 |
| `GET /api/admin/contents` 스텁 추가 | 필요했음(시나리오 6 의 author 경로). 다만 **운영 라우트에 테스트 지원용 스텁**이 들어간 것이라 11 Phase 2 에서 반드시 실제 구현으로 교체해야 한다. 주석은 달려 있다 |
| `recent_audit` · `role_lock_reason` 응답 추가 | 설계 의도에 맞다. 특히 `role_lock_reason` 은 "규칙을 화면이 재구현하지 않는다" 는 §3.1 원칙의 연장 |
| `api/lib/validate.js` 에 `bool()` 추가 | 기존 관례 확장 |

## 6. 자잘한 것

- 테스트 스크린샷이 `docs/plan/img/e2e-admin-users.png` 로 저장된다. 이 디렉터리는 **목업 미리보기 전용**이라
  테스트 산출물이 섞인다. `docs/reviews/img/` 등으로 옮기거나 `.gitignore` 에 넣는 편이 낫다.
- `jina@dev.local` 이 `role='learner'` 다. `DEV_AUTOLOGIN` 개발 중에는 관리 화면 링크가 보이지 않는다.
  [10.7 §3.3](../plan/10.7-db-rebaseline.md) 이 개발 시드에 `role='admin'` 을 주기로 했으므로 `0017` 이나
  `db/seeds/dev.mjs` 에 반영이 필요하다(10.5 열린 질문 2 와 같은 지점).
