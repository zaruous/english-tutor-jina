# 관리자 사용자 관리 — 지적사항과 조치

- 대상: [Cursor 위임 구현](02-agent-report.md) 결과물 · 검증 [03-verification.md](03-verification.md)
- 채점: 나 71 / Cursor(독립) 66 → **수정 후 재검증 필요(60–74)**
- 조치자: Claude (이번 라운드는 위임하지 않고 직접 수정)
- 2026-09-03

## 0. 이 문서의 쓰임

**다음 라운드 위임 때 이 문서를 지시서에 첨부한다.** "무엇이 잘못됐고 왜 잘못인지"가
결함 목록보다 오래 쓸모 있다 — 같은 종류의 실수가 반복되기 때문이다.

§1 은 이번에 고친 것, §2 는 남긴 것, §3 은 **내 지적이 틀렸던 것**이다.

## 1. 고친 것 (7건)

### 1.1 [높음] `LAST_ADMIN` 가드가 대상의 활성 여부를 보지 않았다

`api/services/admin-user.service.js`

전역 활성 admin 수만 세고 **대상을 제외하지도, 대상이 활성인지 보지도** 않았다. 그래서
"활성 admin 1명 + 비활성 admin 1명" 상태에서 **비활성** admin 을 강등하면 409 가 났다.
비활성 admin 을 강등해도 쓸 수 있는 관리자 수는 변하지 않으므로 막을 이유가 없다.

```js
// before — 대상을 세고, 대상이 비활성이어도 막는다
if (demoting && target.role === 'admin') {
  const adminCount = await countActiveAdmins(client);        // 전역
  if (adminCount <= 1) throw LAST_ADMIN;
}
// after — 활성 admin 만 보호하고, 카운트에서 대상을 뺀다
if (demoting && target.role === 'admin' && target.is_active) {
  const others = await countOtherActiveAdmins(client, targetId);
  if (isLastActiveAdmin(target, others)) throw LAST_ADMIN;
}
```

`setActive` 의 같은 가드와 목록의 `computeCanChangeRole`(자물쇠 표시)도 같은 규칙으로 맞췄다.

**남는 사실**: 행위자는 항상 활성 admin 이고 본인 강등은 `SELF_DEMOTION` 이 먼저 막으므로,
**`LAST_ADMIN` 은 API 로는 도달할 수 없다.** 지금은 방어적 코드다. 도달 가능하게 만들려면
"다른 활성 admin 이 있으면 본인 강등 허용" 으로 규칙을 바꿔야 한다 — 설계 변경이라 남긴다(§2).

### 1.2 [높음] e2e 시나리오 8 이 실계정을 강등했다가 복구했다

`scripts/e2e-admin-users.mjs`

"마지막 admin" 상태를 만들려고 **테스트가 만들지 않은** 모든 `role='admin'` 사용자
(=`admin@jina.local`)를 `reviewer` 로 UPDATE 했다. 복구가 `finally` 밖이라 중간에 예외가 나면
유일한 실제 관리자가 강등된 채 남는다 — `requireRole('admin')` 이 모든 관리 API 를 막으므로 관리자 잠금.

시나리오를 **테스트가 만든 계정만 쓰도록** 다시 썼다. 그리고 검증 대상을 뒤집었다:
예전엔 "비활성 admin 강등이 409" 를 기대했는데(=1.1 의 버그를 고정), 지금은 **200 을 기대**한다.
`LAST_ADMIN` 의 카운트 의미는 서비스 함수를 직접 불러 확인한다(`8b`, DB 무변경 읽기).

### 1.3 [중간] 시나리오 14 가 `/me` DTO 를 실질 검증하지 않았다

설계 §6 시나리오 14 는 `/me` DTO 변경의 회귀 검증인데 `e2e-auth.mjs` 의 `exit 0` 만 봤다.
`role`·`can_author`·`can_review`·`can_admin`·`is_admin` 동시 존재를 admin·learner 두 계정으로
단정하는 `14a` 를 추가했다(기존 `exit 0` 은 `14b` 로).

### 1.4 [낮음] 테스트 산출물이 목업 디렉터리를 오염시켰다

스크린샷을 `docs/plan/img/`(목업 미리보기 전용)에 썼다. `docs/reviews/img/` 로 옮기고
이전 파일을 지웠다.

### 1.5 [UI] 총 인원이 보이지 않았다

목록이 몇 명 중 몇 명인지 알 수 없었다. 서버는 `total` 을 주는데 화면이 쓰지 않았다.
제목 옆에 `21명` / `21명 중 8명` 을 표시한다.

### 1.6 [UI] 비활성 탭이 비활성으로 보이지 않았다

콘텐츠·검수 탭이 `opacity: 0.55` 만 걸려 눌릴 것처럼 보였다.
`opacity 0.4` + `cursor: not-allowed` + 취소선 + `aria-disabled` + `title` 로 바꿨다.

### 1.7 [UI] 감사 로그가 긴 이메일로 폭을 다 먹었다

`e2e-admin-1788445337958-sess@test.dev` 가 통째로 출력됐다. `shortEmail()` 로 로컬파트를
14자에서 줄이고 전체 값은 `title` 에 남긴다.

### 1.8 [환경] dev 계정이 `learner` 라 개발 중 관리 화면에 못 들어갔다

`db/seeds/dev.mjs` 가 `jina@dev.local` 에 `role='admin'` 을 주도록 했다.
이것이 **10.5 열린 질문 2**(사이드카 버튼을 dev 계정에도 열지)의 답이다 — `is_dev OR is_admin`
같은 세 번째 권한 등급 없이 시드가 역할을 주면 된다([10.7 §3.3](../plan/10.7-db-rebaseline.md)).

## 1B. 2차 수정 — 브라우저로 직접 보고 나서 (6건)

e2e 를 통과한 뒤 **실제 브라우저에 띄워 보고** 나온 것들이다. 스크린샷·테스트로는 안 보였다.

### 1B.1 [UI 버그] 역할 드롭다운이 표 밖으로 잘렸다

`src/admin/users.jsx` — 표 컨테이너가 `overflow: auto` 인데 메뉴가 `position: absolute` 라
**스크롤 컨테이너에 클리핑**됐다. `position: fixed` + `getBoundingClientRect()` 좌표로 바꿨다.

같이 붙인 것: 아래 공간이 부족하면 **위로 펼치고**(`dropUp`), 폭을 최소 240px 로 잡아 역할 설명이
접히지 않게 하고, `maxHeight` 를 남은 공간에 맞춰 넘치면 자체 스크롤한다.

`fixed` 메뉴는 표가 스크롤돼도 따라오지 않으므로 **스크롤·리사이즈·Esc 에 닫는다.**
`scroll` 은 버블링하지 않아 **capture** 로 들어야 내부 스크롤 컨테이너의 이벤트까지 잡힌다.
`⋯` 케밥 메뉴도 같은 결함이었어서 함께 고치고, 중복됐던 닫기 로직을 `useDismissMenu` 훅으로 합쳤다.

### 1B.2 [UI 버그] `jina-root` 클래스 누락 — 공용 스타일이 관리 화면에만 적용되지 않았다

`tokens.jsx` 가 주입하는 기본 스타일은 `.jina-root` 스코프인데 `users.jsx` 가 그 클래스를 쓰지 않았다.
그래서 **`box-sizing: border-box` · Pretendard 폰트 · 버튼 리셋이 이 화면에만 빠져 있었다.**
테스트로는 잡히지 않는 종류다 — 렌더는 되고 치수만 미묘하게 어긋난다.

### 1B.3 [버그] `DEV_AUTOLOGIN` 세션 무한 누적 → R6 해소

`api/services/auth.service.js` `devLogin`. 쿠키 없는 요청마다 새 세션을 발급하는데 정리 정책이 없어
`auth_sessions` 가 무한히 자랐다(관리 화면에서 **758** 로 관측된 원인).
새 세션을 만들기 전에 **최근 5개만 남기고** 나머지를 `revoked_at` 으로 접는다 — 여러 탭·기기는 허용한다.

실측: 쿠키 없이 12회 호출 후 활성 세션 **6개**(유지 5 + 방금 1). 예전이면 12개가 쌓였다.

### 1B.4 [버그] CSRF 거절의 상태코드와 code 가 어긋났다 → R7 해소

`api/lib/cors.js` — 403 인데 `code: 'BAD_REQUEST'` 였다. `FORBIDDEN` 으로 고쳤다.
e2e 시나리오 12 가 **상태코드만** 보고 있어 이 불일치를 통과시켰으므로 `code` 까지 단정하게 강화했다.
다른 곳의 `BAD_REQUEST` 단정 12곳은 모두 정상적인 400 검증이라 영향이 없음을 확인했다.

### 1B.5 [요청] `No.` 컬럼 추가

표 맨 왼쪽. 값은 `u.id` 가 아니라 **화면 순번**이다 — 검색·필터를 걸면 1부터 다시 세는 것이 맞다.
스켈레톤 행의 컬럼 수도 7개로 맞췄다(어긋나면 로딩 중에 표가 흔들려 보인다).

### 1B.6 [요청] 스크롤바 스타일링

인라인 스타일로는 만들 수 없어 테마 색을 넣은 `<style>` 을 주입하고 `.jina-scroll` 로 적용했다
(폭 10px · 라운드 thumb · 투명 트랙 · hover 시 밝아짐 · Firefox `scrollbar-width` 포함).
표와 드롭다운 양쪽에 붙였다.

## 2. 남긴 것 — 다음 라운드 지시서에 넣을 것

| # | 항목 | 왜 남겼나 |
|---|---|---|
| R1 | `/api/admin/contents` 스텁이 운영 라우트에 있다 (`admin.routes.js:51-55`) | 플랜 11 Phase 2 가 실제 구현으로 교체할 자리. 지금 지우면 시나리오 6 이 깨진다 |
| R2 | `SELF_DEMOTION` 규칙 재검토 → `LAST_ADMIN` 도달 가능하게 | 설계 변경. "다른 활성 admin 이 있으면 본인 강등 허용" 이 맞는지 결정 필요 |
| R3 | 목록 `can_change_role` 이 트랜잭션 밖 집계 (`admin-user.service.js`) | 표시용이라 stale 해도 실제 조작은 서버가 다시 검사한다. 영향 낮음 |
| R4 | `limit` 기본 50 초과 시 조용히 잘린다 — "더 보기" 없음 | 현재 21명이라 잠재 문제. 50 넘을 때 대응 필요 |
| R5 | 정렬 불가 (id 고정), 행 높이 62px 로 밀도 낮음 | 기능 추가. 관리 대상이 늘면 필요 |
| ~~R6~~ | ~~dev 계정 활성 세션 753개~~ | **해소** → §1B.3. 최근 5개만 유지하도록 `devLogin` 수정 |
| ~~R7~~ | ~~CSRF 거절이 403 인데 code 가 `BAD_REQUEST`~~ | **해소** → §1B.4 |
| R8 | 관리 화면에서 역할 카운트 칩이 **0인 등급을 숨긴다** | `reviewer 0`·`author 0` 이 안 보여 "없다" 는 정보를 잃는다. 필터 칩은 5개 다 보이므로 일관성도 어긋난다 |

## 3. 내 지적이 틀렸던 것 — 정정

**"21명인데 8행만 보인다. 페이지네이션이 없다"는 틀렸다.**
`users.jsx:441` 의 표 컨테이너가 `flex: 1 · minHeight: 0 · overflow: auto` 라 **내부 스크롤**이고,
나머지 13행은 스크롤하면 나온다. Playwright 의 `fullPage: true` 는 페이지 스크롤만 담고
**내부 스크롤 영역은 담지 못한다.** 스크린샷만 보고 데이터 누락으로 단정한 것이 오판이었다.

총계 표시(§1.5)는 그래도 유효한 개선이다 — 21명인지 8명인지 화면이 말해주지 않았던 것은 사실이다.
다만 "페이지네이션 부재" 는 현재 규모에서는 문제가 아니고, `limit` 50 을 넘을 때의 잠재 문제로
격하해 R4 에 남긴다.

**교훈**: 스크린샷은 렌더 결과의 증거이지 데이터의 증거가 아니다. 내부 스크롤·가상 스크롤이 있으면
보이는 행 수와 실제 행 수가 다르다. UI 를 화면으로 판단할 때는 DOM 이나 상태를 같이 봐야 한다.

**그리고 반대 방향의 교훈도 있다.** §1B 의 6건은 e2e 17개를 전부 통과한 뒤 **브라우저에 직접 띄워서야**
나왔다. 드롭다운 클리핑·`jina-root` 누락은 `data-testid` 존재만 확인하는 테스트로는 절대 잡히지 않는다.
다음 라운드 완료 조건에 **"브라우저로 열어 조작해 본다"** 를 명시할 것 — 테스트 통과는 그 앞 단계다.

## 4. 검증 (내 수정 후 직접 실행)

```
node scripts/e2e-admin-users.mjs   →  총 17개 중 17개 통과
  ✔ 8  비활성 admin 강등 허용 (LAST_ADMIN 아님) — status=200 role=reviewer   ← 1.1 수정 확인
  ✔ 8b 대상 제외 활성 admin 카운트가 대상을 세지 않는다 — others=2
  ✔ 14a /me DTO — role · can_* · is_admin 한 사이클 유지
  ✔ 14b e2e-auth.mjs 회귀 exit 0                                            (내부 40/40)
```

화면은 `docs/reviews/img/e2e-admin-users.png` 로 재확인 — 총계 `21명`, 비활성 탭 취소선,
감사 로그 이메일 축약(`e2e-admin-1788…@test.dev`) 모두 반영됐다.
