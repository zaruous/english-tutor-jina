# 05 — 설정 + 로그인 UI (auth 화면 + 계정 설정)

> 단어장(vocabulary) 탭에서 확립한 패턴을 복제한다:
> ③ Context 스토어(`src/shared/vocab-store.jsx` 패턴 → `auth-store.jsx`)가 핵심이고,
> ① 마이그레이션은 **이번 문서에서 신규 0개** — 필요한 테이블(`users`, `auth_sessions`)은
> `0001_auth.sql`로 이미 적용돼 있다(적용된 파일 무수정 규범 준수 — 컬럼 추가도 없다).
> ② DTO 규범은 user DTO에 그대로 적용(비밀번호 해시·세션 토큰은 절대 내려가지 않음),
> ④ CLI 프록시는 **미적용** — 이 탭은 AI 호출이 0건이다(`api/ai/schemas.js`/`prompts.js` 무수정).
> 이 문서는 다음 세션의 구현 에이전트가 그대로 실행하는 실행 계획서다.
> 패턴 원본: `api/routes/auth.routes.js`, `api/middleware/auth.js`, `api/services/auth.service.js`,
> `src/shared/vocab-store.jsx`, `src/shared/api-client.jsx`, `scripts/e2e-vocab.mjs`.

## Context — 현황

**백엔드 인증은 완성돼 있고, 화면이 없다.** 이 문서의 일은 "화면"이다.

이미 존재하는 것 (2026-08-19 실측, **재구현 금지**):

| 구성요소 | 위치 | 내용 |
|---|---|---|
| signup/login/logout/me | `api/routes/auth.routes.js:10-44` | scrypt 해시, 레이트리밋(1분 10회), 타이밍 방어, 409/401 처리 완비 |
| 세션 쿠키 | `api/middleware/auth.js:6-17` | `jina_sid`, SameSite=Lax, 30일. DB에는 sha256(토큰)만 |
| `optionalUser`/`requireUser` | `api/middleware/auth.js:21-38` | `DEV_AUTOLOGIN=1`이면 쿠키 없는 요청에 시드 계정(`jina@dev.local` / `수민 (dev)`) 세션 자동 발급 + 쿠키 심기 |
| production 부팅 거부 | `api/config.js:18-22` | `NODE_ENV=production` + `DEV_AUTOLOGIN=1` → throw. **이미 있음, 재작업 금지** |
| CSRF/CORS/READONLY | `api/lib/cors.js`, `api/server.js:34-41` | 전역 처리. non-GET은 `X-Requested-With: jina` 필수, 캔버스(`X-Jina-Mode: canvas`) non-GET 403 |
| fetch 래퍼 | `src/shared/api-client.jsx` | `window.JINA_API` — credentials/CSRF/READONLY 가드 내장 |

없는 것 (이번 작업):

| 항목 | 현황 실측 |
|---|---|
| 로그인/회원가입 UI | `src/`에 전무. `grep -r "login\|signup" src/` 0건 |
| 부팅 시 인증 확인 | `src/main.jsx:384-385`의 `root.render(<JinaApp />)`가 무조건 앱 렌더. `GET /api/auth/me` 호출 없음 — DEV_AUTOLOGIN이 꺼지면 모든 API가 401인데 화면은 그대로 |
| 사용자 표시/로그아웃 | `TopNav`(`main.jsx:18-85`)에 로고·탭·설정 버튼뿐. spacer는 `:68`, 설정 버튼은 `:70-82` |
| 계정 설정 | `SettingsPanel`(`main.jsx:90-255`)은 테마(:129-147)·AI 제공자(:150-242)·캔버스 링크(:245-250)만 |
| 설정 지속성 | **테마/aiConfig가 새로고침에 날아간다** — `themeName`은 `useState('aurora')`(:262), `aiConfig`는 `/config.js` 기본값(:263-267). localStorage 저장 없음 |
| 표시 이름 변경 | 엔드포인트 없음 — `PATCH /api/me` 신설 필요 |

### 목표

1. `src/shared/auth-store.jsx` — `AuthProvider`/`useAuth` Context 스토어. 부팅 시 `GET /api/auth/me`,
   `login`/`signup`/`logout`/`devContinue`/`updateProfile`. Provider 부재 시(캔버스) 게스트 fallback.
2. `src/screens/login.jsx` — 로그인/회원가입 폼. 테마 준수, 서버 에러 코드별 표시,
   DEV에서만 "개발 계정으로 계속" 노출. 390px 뷰포트에서도 성립.
3. `src/main.jsx` — `AuthProvider` + `AppGate`로 감싸 미인증이면 로그인 화면.
   TopNav에 사용자 칩, SettingsPanel에 계정 섹션(이메일/표시 이름 변경/로그아웃).
4. `PATCH /api/me` 신설(display_name 변경) — auth 라우트에 1개 추가, 마이그레이션 불필요.
5. 테마/aiConfig **localStorage 지속성** 추가 (서버 저장은 v2 — 근거는 아래 판단 기록).

### 단어장 구현에서 겪은 함정 → 이 문서에서의 적용

| 함정 | 적용 |
|---|---|
| PG 42804 (`::int` + `\|\|` 재사용) | 이번 문서의 SQL은 `UPDATE users SET display_name` 1문뿐 — 해당 없음. 세션 TTL의 `($3 \|\| ' days')::interval`(auth.service.js:61)은 기존 코드, 무수정 |
| pg BIGINT/NUMERIC 문자열 | `api/lib/pool.js`에 `setTypeParser` **이미 적용됨** — user.id는 Number로 온다. 재작업 금지 |
| 인증/CSRF/CORS/READONLY 미들웨어 이미 존재 | 이 문서가 바로 그 소비자다. `requireUser` 사용, 쿠키/스크립트 재구현 금지. 단 **커스텀 헤더 1개 추가 시 `cors.js:18` Allow-Headers 갱신 필수** — 빠뜨리면 프리플라이트가 막혀 "CORS error"만 보인다 (아래 Phase 1-③) |
| 시드 타임스탬프 now() 상대시각 | 시드 무수정 — 기존 dev 계정(`db/seeds/dev.mjs:43-49`)을 그대로 쓴다 |
| 캔버스는 main.jsx를 안 탐 | `AuthProvider`는 main.jsx 경로에만. `useAuth`는 게스트 fallback 필수 — **캔버스는 auth를 요구하면 안 된다**(READONLY + fallback). 새 `<script>` 2개는 **index.html/canvas.html 둘 다** |
| 기존 테이블 11개는 다른 앱 소유 | 신규 테이블 0개 — 충돌 원천 없음 |
| 적용된 마이그레이션 수정 금지 | `0001_auth.sql` 무수정. `users`에 필요한 컬럼(display_name, updated_at)이 이미 있어 새 마이그레이션도 불필요 |

### 판단 ①: 사용자별 설정(테마/aiConfig)의 서버 저장 여부 — **v1은 localStorage** (기록)

서버 저장(`users.settings JSONB` + PATCH 확장)을 **하지 않는** 근거:

1. **aiConfig는 이미 서버가 기본값의 단일 소스다.** `.env → server.js /config.js → window.JINA_CONFIG`
   (server.js:28-50)로 provider/모델 기본값이 내려오고, provider 생사(`/api/ai/health`)도 서버 상태다.
   사용자가 바꾸는 것은 "이 브라우저에서의 임시 선택"에 가깝다.
2. **테마는 기기 선호다.** 같은 계정이라도 폰은 다크, 데스크탑은 라이트를 쓰는 게 자연스럽고,
   캔버스(비로그인·게스트)와 로그인 화면(인증 전)에서도 테마가 필요하다 — 서버 저장이면 이
   두 지점에서 이원화된 폴백이 또 필요해진다.
3. 서버 저장은 마이그레이션 1개 + PATCH 스키마 검증 + 스토어 동기화 로직이 붙는데, 잃는 것은
   "기기 간 테마 동기화"뿐 — v1 가치가 비용을 못 넘는다. **v2 예약**: `users.settings JSONB NOT NULL
   DEFAULT '{}'` 추가 + `PATCH /api/me`의 `settings` 필드 확장(이 문서의 PATCH가 그 자리를 미리 잡는다).
4. 단, **localStorage 지속성 자체가 지금 없다**(새로고침 → aurora로 리셋). 이건 이 문서 범위로 추가한다.
   키 `jina_settings_v1`, 값 `{ themeName, aiConfig }`. **알려진 한계(기록)**: localStorage는
   브라우저 단위라 한 브라우저에서 계정을 갈아타면 설정이 공유된다 — v1 수용.
   같은 이유로 `jina_vocab_cache_v2`(vocab-store.jsx:20)도 계정 전환 시 이전 사용자 캐시가
   API 실패 폴백에 나타날 수 있다 — v2에서 캐시 키에 user.id를 접미(이번 작업 아님, 기록만).

### 판단 ②: DEV_AUTOLOGIN과 로그아웃의 관계 (설계 결정)

`DEV_AUTOLOGIN=1`은 "쿠키 없는 요청에 dev 세션 자동 발급"(auth.js:24-30)이므로, 그대로 두면
**로그아웃이 불가능하다** — 로그아웃 직후 `GET /api/auth/me`가 새 dev 세션을 심어버린다.
로그인 화면·계정 전환을 DEV에서도 테스트할 수 있어야 하므로 **클라이언트 opt-out**을 도입한다:

- 로그아웃 시 `localStorage['jina_auth_optout']='1'` 저장. 이 상태의 `GET /api/auth/me`에는
  `X-Jina-No-Autologin: 1` 헤더를 실어 보낸다.
- `optionalUser`가 이 헤더를 보면 devLogin 분기를 건너뛴다 → 401 → 로그인 화면.
- 로그인/회원가입/"개발 계정으로 계속" 성공 시 플래그 제거.
- 미인증 상태에서는 `AppGate`가 `JinaApp` 자체를 마운트하지 않으므로(§Phase 4) `/api/auth/me`와
  auth 계열 외의 API 호출이 발생하지 않는다 — 헤더를 me 호출에만 실으면 충분하다.
- "개발 계정으로 계속" 버튼 = 플래그 제거 후 헤더 없는 `GET /api/auth/me` 1회 (서버 autologin이
  세션을 발급). 별도 엔드포인트·dev 비밀번호 노출 불필요. 노출 조건은 `window.JINA_CONFIG.devAutologin`
  — server.js가 `.env`의 `DEV_AUTOLOGIN`을 `/config.js`로 주입(Phase 1-④). production은
  `api/config.js:20-22`가 이미 부팅을 거부하므로 이 버튼이 살아있을 수 없다.

---

## Phase 1 — API 소폭 확장 (신규 파일 0개, 기존 4파일 수정)

### ① `PATCH /api/me` — 표시 이름 변경

`api/services/auth.service.js` 끝에 추가:

```js
export async function updateProfile(userId, { displayName }) {
  const { rows: [user] } = await pool.query(
    `UPDATE public.users SET display_name = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, email, display_name, tz, is_dev`,
    [displayName, userId],
  );
  return user; // resolveSession(:71)과 같은 user DTO 모양 — 프론트가 그대로 교체 가능
}
```

`api/routes/auth.routes.js` — `router.get('/api/auth/me', …)` 블록(:41-44) 뒤, 함수 닫힘(:45) 앞에 추가:

```js
router.patch('/api/me', async (req, res) => {
  const { user } = await requireUser(req, res);
  const body = await readJson(req);
  const displayName = str(body.display_name, 'display_name', { min: 1, max: 60 });
  const updated = await auth.updateProfile(user.id, { displayName });
  sendJson(res, 200, { ok: true, user: updated });
});
```

- 경로는 `/api/me`(리소스 = 나 자신). `/api/auth/*`는 세션 수명주기 전용으로 남긴다.
- `str()`(api/lib/validate.js:3)이 트림·길이·400을 처리한다. 빈 문자열로 "이름 지우기"는 v1 미지원
  (str이 ''를 missing으로 취급 → 400. 지우려면 v2에서 `null` 허용 분기).
- CSRF는 전역(`requireCsrfHeader`)이 PATCH를 이미 검사한다 — 라우트에서 할 일 없음.
- tz 변경은 v2 (대시보드/통계 산식이 tz를 쓰기 시작한 뒤 UI와 함께).

**user DTO (이 문서의 계약 — 모든 auth 응답이 이 모양)**

```json
{ "id": 1, "email": "jina@dev.local", "display_name": "수민 (dev)", "tz": "Asia/Seoul", "is_dev": true }
```

`password_hash`·세션 토큰·`ip`·`user_agent`는 어떤 응답에도 싣지 않는다(현행 유지).
signup(201)만 `created_at`이 하나 더 온다(auth.service.js:29) — 프론트는 위 5개 필드만 읽는다.

### ② `optionalUser` — no-autologin 헤더 (api/middleware/auth.js:24)

```js
// 변경 전:  if (!resolved && config.devAutologin) {
// 변경 후:
if (!resolved && config.devAutologin && req.headers['x-jina-no-autologin'] !== '1') {
```

한 줄. `requireUser`는 `optionalUser`를 경유하므로 자동 반영된다.

### ③ CORS Allow-Headers (api/lib/cors.js:18) — **빠뜨리면 조용히 깨진다**

```js
'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, X-Jina-Mode, X-Jina-No-Autologin',
```

커스텀 헤더는 GET이라도 프리플라이트를 유발한다. 이 목록에 없으면 브라우저가 본 요청을
보내지도 않고 콘솔에 CORS 에러만 남는다 — 단어장 때 CSRF 헤더로 이미 밟아본 지뢰.

### ④ `/config.js`에 devAutologin 플래그 (server.js:29-42의 config 객체)

```js
const config = {
  provider: …, ollamaUrl: …, models: { … },   // 기존 유지
  devAutologin: process.env.DEV_AUTOLOGIN === '1',   // ★ 추가 — 로그인 화면의 dev 버튼 노출 조건
  …
};
```

정적 서버와 API 서버는 같은 `.env`를 읽으므로 값이 갈릴 수 없다. 캔버스도 `/config.js`를
로드하지만(canvas.html:18) 이 플래그를 읽는 곳은 login.jsx뿐이라 무해하다.

### ⑤ `apiFetch`에 headers 옵션 (src/shared/api-client.jsx)

- `:12` 시그니처: `{ method = 'GET', body, signal, timeoutMs = 180000, headers } = {}`
- `:24-28` headers 객체 마지막에 `...(headers || {})` 스프레드 추가 (호출자 지정이 최우선).

auth-store만 쓰는 옵션이지만 래퍼의 일반 기능으로 넣는다. READONLY 가드(:13-16)·CSRF(:26)는 무수정.

### curl 검증 (Phase 1 완료 판정)

```bash
# 0) 프리플라이트에 새 헤더 허용 확인
curl -s -i -X OPTIONS http://localhost:3004/api/auth/me \
  -H 'Origin: http://localhost:3003' -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: x-jina-no-autologin' | grep -i allow-headers
# → X-Jina-No-Autologin 포함

# 1) autologin me — 쿠키 발급 + dev 사용자
curl -s -i -c /tmp/dev.txt http://localhost:3004/api/auth/me | grep -Ei 'set-cookie|display_name'
# → Set-Cookie: jina_sid=… + "display_name":"수민 (dev)"

# 2) opt-out me — autologin 건너뛰고 401
curl -s http://localhost:3004/api/auth/me -H 'X-Jina-No-Autologin: 1' | jq -c '{ok,code}'
# → {"ok":false,"code":"UNAUTHORIZED"}

# 3) PATCH /api/me
curl -s -X PATCH http://localhost:3004/api/me -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/dev.txt -d '{"display_name":"지나"}' | jq '.user'
# → display_name "지나", password_hash 키 없음
curl -s -X PATCH http://localhost:3004/api/me -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -b /tmp/dev.txt -d '{"display_name":""}' | jq -c '{ok,code}'
# → {"ok":false,"code":"BAD_REQUEST"}
# 원복: -d '{"display_name":"수민 (dev)"}'

# 4) 회원가입 → 사용자 분리 확인 (신규 사용자는 카드 0장)
curl -s -X POST http://localhost:3004/api/auth/signup -H 'Content-Type: application/json' \
  -H 'X-Requested-With: jina' -c /tmp/u2.txt \
  -d '{"email":"test-auth@e2e.dev","password":"password123","display_name":"테스트"}' | jq -c '{ok}'
curl -s http://localhost:3004/api/vocab -b /tmp/u2.txt | jq '.stats.total'   # → 0 ★
curl -s http://localhost:3004/api/vocab -b /tmp/dev.txt | jq '.stats.total'  # → 9+ (시드+추가분)

# 5) 로그아웃 → 세션 무효
curl -s -X POST http://localhost:3004/api/auth/logout -H 'X-Requested-With: jina' -b /tmp/u2.txt | jq -c .
curl -s http://localhost:3004/api/auth/me -b /tmp/u2.txt -H 'X-Jina-No-Autologin: 1' | jq -c '{code}'
# → {"code":"UNAUTHORIZED"} (revoked_at 처리 확인)
```

---

## Phase 2 — `src/shared/auth-store.jsx` (`window.AuthProvider` / `window.useAuth`)

vocab-store.jsx의 구조(Context + Provider 부재 fallback + `window.*` 노출)를 그대로 따른다.

```jsx
// auth-store.jsx — 인증 Context 스토어. window.AuthProvider / window.useAuth
// api-client.jsx 뒤, screens/login.jsx·main.jsx 앞에 로드되어야 한다.
// 캔버스에는 AuthProvider가 없다 — useAuth는 게스트 fallback으로 떨어져 auth를 요구하지 않는다.

const AuthContext = React.createContext(null);
const AUTH_OPTOUT_KEY = 'jina_auth_optout'; // 로그아웃 후 DEV_AUTOLOGIN 재발급 차단 (판단 ②)

function AuthProvider({ children }) {
  // status: 'loading' | 'authed' | 'anon' | 'offline'
  const [state, setState] = React.useState({ status: 'loading', user: null, error: null });

  const refresh = React.useCallback(async () => {
    const optout = localStorage.getItem(AUTH_OPTOUT_KEY) === '1';
    const res = await window.JINA_API.get('/api/auth/me',
      optout ? { headers: { 'X-Jina-No-Autologin': '1' } } : undefined);
    if (res.ok) setState({ status: 'authed', user: res.user, error: null });
    else if (res.code === 'UNAUTHORIZED') setState({ status: 'anon', user: null, error: null });
    else setState({ status: 'offline', user: null,
                    error: res.hint ? `${res.error} — ${res.hint}` : res.error });
    return res;
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const finishLogin = (res) => { // login/signup/devContinue 공통 후처리
    if (res.ok) {
      try { localStorage.removeItem(AUTH_OPTOUT_KEY); } catch {}
      setState({ status: 'authed', user: res.user, error: null });
    }
    return res; // 실패 봉투는 화면(login.jsx)이 폼 에러로 렌더 — 스토어 error에 싣지 않는다
  };

  const login = React.useCallback((email, password) =>
    window.JINA_API.post('/api/auth/login', { email, password }).then(finishLogin), []);
  const signup = React.useCallback((email, password, displayName) =>
    window.JINA_API.post('/api/auth/signup',
      { email, password, ...(displayName ? { display_name: displayName } : {}) }).then(finishLogin), []);
  const devContinue = React.useCallback(() => { // 헤더 없는 me → 서버 autologin이 세션 발급
    try { localStorage.removeItem(AUTH_OPTOUT_KEY); } catch {}
    return window.JINA_API.get('/api/auth/me').then(finishLogin);
  }, []);

  const logout = React.useCallback(async () => {
    const res = await window.JINA_API.post('/api/auth/logout');
    try { localStorage.setItem(AUTH_OPTOUT_KEY, '1'); } catch {}
    setState({ status: 'anon', user: null, error: null }); // 실패해도 로컬은 로그아웃 (쿠키는 서버 몫)
    return res;
  }, []);

  const updateProfile = React.useCallback(async (fields) => {
    const res = await window.JINA_API.patch('/api/me', fields);
    if (res.ok) setState((s) => ({ ...s, user: res.user }));
    return res;
  }, []);

  const value = React.useMemo(() => ({
    ...state, login, signup, logout, devContinue, updateProfile, refresh,
  }), [state, login, signup, logout, devContinue, updateProfile, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Provider 부재 시(캔버스) 게스트 fallback — 네트워크 호출 0건, 항상 authed
const AUTH_FALLBACK = {
  status: 'authed', error: null,
  user: { id: 0, email: 'guest@canvas', display_name: '게스트', tz: 'Asia/Seoul', is_dev: false },
  login: () => Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 로그인이 비활성화되어 있습니다.' }),
  signup: () => Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 회원가입이 비활성화되어 있습니다.' }),
  logout: () => Promise.resolve({ ok: true }),
  devContinue: () => Promise.resolve({ ok: false, code: 'READONLY' }),
  updateProfile: () => Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 저장이 비활성화되어 있습니다.' }),
  refresh: () => Promise.resolve({ ok: true }),
};

function useAuth() {
  return React.useContext(AuthContext) || AUTH_FALLBACK;
}

window.AuthProvider = AuthProvider;
window.useAuth = useAuth;
```

설계 노트:

- **`status: 'offline'`을 'anon'과 구분한다.** API 서버가 죽었을 때 로그인 화면을 보여주면
  "비밀번호가 틀렸나?"로 오독한다 — AppGate가 offline이면 에러 + 재시도 화면을 렌더(§Phase 4).
- 폼 제출 에러(401/409/429)는 스토어 상태가 아니라 **호출 반환값**으로 화면에 준다 — 스토어의
  `error`는 부팅 실패 전용. vocab-store가 add 결과를 `addState`로 따로 다루는 것과 같은 이유.
- fallback은 상수 객체(훅 아님) — vocab-store의 `useVocabFallback`은 내부 state가 필요했지만
  auth fallback은 정적이라 훅 규칙 문제가 없다.

---

## Phase 3 — `src/screens/login.jsx` (`window.LoginScreen`)

`useAuth()`를 직접 호출한다(AppGate가 AuthProvider 아래에서만 렌더하므로 실 Context를 받는다).
Props는 `{ theme }` 하나 — 다른 화면과 동일한 규약.

### 레이아웃 (테마 토큰만 사용, 하드코딩 색 금지)

```
┌──────────────────────────────────────────┐  배경 theme.bg, 전체 화면 grid 중앙정렬
│            (JinaAvatar size=56)          │  카드: maxWidth 380, width '100%',
│         Jina  ← jina-serif italic        │  margin '0 20px'(모바일 390px 대응),
│      AI 영어 튜터에 로그인하세요         │  background theme.bgSoft,
│  ┌─[로그인]──[회원가입]─┐ ← 탭 토글      │  border 1px theme.border, radius 16,
│  │ 이메일    [___________]│              │  padding 28
│  │ 비밀번호  [___________]│  input 스타일은 SettingsPanel의 inputStyle
│  │ (회원가입: 표시 이름·선택)│  (main.jsx:202-206)과 동일 토큰:
│  │ [에러 박스 — 있을 때만] │  theme.card / theme.borderStrong / theme.text
│  │ [  로그인  ] ← accent  │
│  └────────────────────────┘
│   ─────── 또는 ───────      ← devAutologin일 때만
│   [개발 계정으로 계속 →]    ← window.JINA_CONFIG?.devAutologin === true 조건
└──────────────────────────────────────────┘
```

### 동작 명세

| 항목 | 명세 |
|---|---|
| state | `mode('login'\|'signup')`, `email`, `password`, `displayName`, `submitting`, `formError({code,message,hint}?)` |
| 제출 | `submitting` 중 버튼 disabled + "확인 중…". Enter 제출(form onSubmit). 성공 시 아무것도 안 함 — 스토어가 authed로 바뀌면 AppGate가 알아서 전환 |
| 클라 검증 | 제출 전: 이메일 `@` 포함, signup 비밀번호 8자 미만이면 서버 안 가고 즉시 표시("비밀번호는 8자 이상"). 나머지는 서버 검증에 위임 |
| 모드 전환 | 탭 클릭 시 `formError` 초기화, 입력값은 유지(이메일 재타이핑 방지) |
| dev 버튼 | `devContinue()` 호출. 실패(`UNAUTHORIZED` — 시드 전 DB)면 "시드 계정이 없습니다. `npm run db:seed`를 실행하세요." 표시 |

### 서버 에러 코드 → 표시 매핑 (에러 박스: `theme.error + '18'` 배경, `theme.error` 텍스트)

| code | 표시 |
|---|---|
| `INVALID_CREDENTIALS` | 서버 메시지 그대로 ("이메일 또는 비밀번호가 올바르지 않습니다.") |
| `CONFLICT` (signup 409) | 서버 메시지 + "로그인하기" 인라인 버튼(mode='login' 전환) |
| `RATE_LIMITED` (429) | 서버 메시지 그대로 |
| `BAD_REQUEST` (400) | 서버 메시지 그대로 (형식 오류 — 서버가 필드명 포함 한국어 생성) |
| `NETWORK` | `error` + `hint` 줄바꿈 표시 (api-client가 "npm run api" 힌트를 이미 만든다 — 재작성 금지) |
| 그 외 | `error \|\| '알 수 없는 오류'` |

프론트에 provider별/코드별 분기 문구를 새로 만들지 않는다 — **서버 메시지·힌트가 단일 소스**
(단어장 규범과 동일).

---

## Phase 4 — `src/main.jsx` 컷오버

### 구조 변경 (파일:라인은 2026-08-19 실측 — 구현 시 재확인)

| 위치 | 수정 |
|---|---|
| `main.jsx:384-385` `root.render(<JinaApp />)` | `root.render(<AuthProvider><AppGate /></AuthProvider>)` 로 교체. `AppGate` 신규(아래) |
| `main.jsx:262` `themeName` state | lazy init: `React.useState(() => readSettings().themeName \|\| 'aurora')` |
| `main.jsx:263-267` `aiConfig` state | lazy init: 저장값 우선 — `{ provider: saved.provider \|\| JINA_CONFIG.provider \|\| 'claude', ollamaUrl: saved.ollamaUrl \|\| …, model: { ...(JINA_CONFIG.models \|\| {}), ...(saved.model \|\| {}) } }` |
| `main.jsx:280-284` 전역 동기화 effect | 아래에 저장 effect 1개 추가: `useEffect(() => { try { localStorage.setItem('jina_settings_v1', JSON.stringify({ themeName, aiConfig })); } catch {} }, [themeName, aiConfig])` |
| `main.jsx:296-300` 서버 default provider 주입 | 조건에 저장값 부재 추가: `if (!window.JINA_CONFIG?.provider && !readSettings().provider && res.default)` — 저장된 선택을 서버 기본값이 덮지 않게 |
| `main.jsx:18` `TopNav` | 내부에서 `const { user } = useAuth()`. spacer(:68)와 설정 버튼(:70) 사이에 사용자 칩(아래) |
| `main.jsx:90` `SettingsPanel` | 내부에서 `const { user, logout, updateProfile } = useAuth()`. 계정 섹션을 패널 본문 맨 위(:129 "컬러 테마" 라벨 앞)에 삽입 |
| `main.jsx:354` `<VocabProvider>` | 무수정 — JinaApp이 authed에서만 마운트되므로 자동으로 인증 후에만 fetch |

`readSettings()` 헬퍼(파일 상단, APP_PAGES 아래):

```jsx
function readSettings() {
  try { return JSON.parse(localStorage.getItem('jina_settings_v1')) || {}; } catch { return {}; }
}
```

### `AppGate` (main.jsx에 신규 — JinaApp 정의 앞)

```jsx
function AppGate() {
  const { status, error, refresh } = useAuth();
  // 로그인 화면·스플래시도 저장된 테마를 따른다 (JinaApp 밖이라 state 접근 불가 → localStorage 직독)
  const theme = JINA_THEMES[readSettings().themeName] || JINA_THEMES.aurora;

  if (status === 'loading') return ( // autologin 왕복 중 로그인 화면 플래시 방지
    <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: theme.bg }}>
      <JinaAvatar size={48} pulsing theme={theme} />
    </div>
  );
  if (status === 'offline') return ( // API 서버 다운 ≠ 미로그인 — 로그인 화면을 보여주면 오독
    <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: theme.bg, color: theme.text }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>API 서버에 연결할 수 없습니다</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>{error}</div>
        <button onClick={() => refresh()} style={{ padding: '9px 20px', borderRadius: 8, background: theme.accent, color: '#fff', fontWeight: 700 }}>다시 시도</button>
      </div>
    </div>
  );
  if (status === 'anon') return <LoginScreen theme={theme} />;
  return <JinaApp />;
}
```

미인증 시 `JinaApp`을 언마운트하는 것이 핵심이다: ① `/api/auth/me` 외 API 호출이 안 나가고
(opt-out 헤더를 me에만 실으면 되는 근거), ② 로그아웃/계정 전환 시 `VocabProvider` state가
통째로 버려져 **이전 사용자 카드가 다음 사용자에게 보이지 않는다**.

### TopNav 사용자 칩 (:68 spacer와 :70 설정 버튼 사이)

```jsx
{user && (
  <button onClick={onOpenSettings} title={user.email} style={{
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px 5px 5px',
    borderRadius: 999, background: 'transparent', color: theme.textMuted, fontSize: 12.5, fontWeight: 600,
  }}>
    <span style={{ width: 24, height: 24, borderRadius: '50%', background: theme.accent, color: '#fff',
      display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>
      {(user.display_name || user.email)[0].toUpperCase()}
    </span>
    {user.display_name || user.email.split('@')[0]}
  </button>
)}
```

클릭 = 설정 열기(계정 섹션이 패널 맨 위라 자연 동선). 드롭다운 메뉴는 v1 미도입.

### SettingsPanel 계정 섹션 (":129 컬러 테마" 라벨 앞에 삽입)

```
계정                                  ← 기존 섹션 라벨 스타일(:129) 재사용
[이니셜 원] 수민 (dev)  [DEV]         ← is_dev면 뱃지(theme.warning 톤)
           jina@dev.local             ← theme.textMuted 12px
표시 이름  [수민 (dev)      ] [저장]  ← input은 기존 inputStyle(:202-206) 재사용
[ 로그아웃 ]                          ← 전폭, theme.error+'18' 배경 / theme.error 텍스트
──────────────────────────            ← 구분선 후 기존 "컬러 테마" 섹션 계속
```

동작:

- 표시 이름: 로컬 state 초기값 `user.display_name`. 저장 → `updateProfile({ display_name: v })`,
  저장 중 버튼 "저장 중…" disabled, 성공 시 스토어가 user를 갱신하므로 TopNav 칩이 즉시 바뀐다.
  실패 시 입력 아래 에러 한 줄(`res.error`). 값이 `user.display_name`과 같으면 저장 버튼 disabled.
- 로그아웃: `logout()` 호출 후 `onClose()` — AppGate가 anon으로 전환하며 패널째 언마운트되지만
  명시 호출이 안전하다. 확인 다이얼로그 없음(세션 30일, 파괴적 작업 아님).
- 캔버스에서는 이 패널이 렌더되지 않지만(SettingsPanel은 main.jsx 전용), 만약 향후 재사용되면
  fallback의 `updateProfile`이 READONLY 봉투를 돌려주므로 안전하다.

### 모바일 (기록)

모바일 셸에는 설정 진입점 자체가 없다(하단 탭 4+1개뿐, `AppMobileNav`). 계정 UI의 모바일
진입점은 **v1 범위 밖** — 로그인 화면만 390px 대응(카드 `margin: 0 20px`)하면 된다.
모바일에서도 AppGate는 동일하게 동작한다(로그인 → 하단 탭 앱).

---

## Phase 5 — HTML 갱신 (`index.html` / `canvas.html` **둘 다**)

새 `<script>` 2개. 순서 제약:

| 파일 | 위치 | 제약 근거 |
|---|---|---|
| `src/shared/auth-store.jsx` | `api-client.jsx` 다음 줄 (index.html:27 뒤, canvas.html:29 뒤) | `window.JINA_API` 사용. login.jsx·main.jsx보다 앞 |
| `src/screens/login.jsx` | screens 블록 끝, `progress.jsx` 다음 (index.html:40 뒤, canvas.html:47 뒤) | `useAuth`(auth-store)·아이콘·토큰 뒤, `main.jsx`(:43)보다 앞 |

- 두 파일의 `<!-- KEEP IN SYNC -->` 주석(index.html:23, canvas.html:25) 규범 준수 — **한쪽만
  고치면 캔버스가 흰 화면**(정의 안 된 전역 참조로 Babel 파일 단위 실패)이 된다.
- canvas.html에 `AuthProvider`를 **마운트하지 않는다** — useAuth가 게스트 fallback으로 동작.
  캔버스에서 `/api/auth/me` 요청이 0건이어야 한다(e2e가 검증).
- (선택) `src/app.jsx`에 로그인 화면 아트보드 추가 — DCSection "Jina — 로그인" +
  `<LoginScreen theme={theme} />` 아트보드(1440×920 / iOS 프레임). 필수는 아니다.
  추가한다면 fallback의 login이 READONLY 봉투를 주므로 버튼을 눌러도 무해하다.

---

## Phase 6 — 자동 검증

### 사전 조건

`npm run dev:all` (3003 정적 + 3004 API), DB 마이그레이션·시드 완료 상태, `.env`의 `DEV_AUTOLOGIN=1`.

### `scripts/e2e-auth.mjs` (Playwright — `scripts/e2e-vocab.mjs`의 골격 재사용)

`routeCdn`(e2e-vocab.mjs:13-22, unpkg 차단 환경용 로컬 vendor 라우팅)과 `check` 헬퍼를 복사한다.
vendor 경로는 실행 환경에 맞게 조정(환경 종속 — e2e-vocab.mjs와 동일한 주의).

```
시나리오 (순서 고정 — localStorage 상태가 이어진다):

 1. [autologin 부팅] localStorage.clear() 후 3003 로드(대기 9s, Babel 컴파일)
    → 로그인 화면이 아니라 대시보드. TopNav에 "수민" 칩 존재. 콘솔 에러 0.
 2. [설정 persist] 설정 열기 → 테마 'ivory' 클릭 → 새로고침
    → body 배경이 ivory 톤 유지 (localStorage jina_settings_v1 확인:
      page.evaluate(() => JSON.parse(localStorage.jina_settings_v1).themeName) === 'ivory')
 3. [표시 이름 변경] 설정 → 계정 섹션 → 표시 이름 "지나E2E" 입력 → 저장
    → TopNav 칩이 "지나E2E"로 즉시 갱신 → 새로고침 후에도 "지나E2E" (서버 저장 증명)
    → 원복: 다시 "수민 (dev)" 저장
 4. [로그아웃 → 로그인 화면] 설정 → 로그아웃
    → 로그인 폼 렌더("이메일"/"비밀번호" 필드), "개발 계정으로 계속" 버튼 존재(DEV 노출 조건)
 5. [★ opt-out 지속] 새로고침(9s 대기)
    → 여전히 로그인 화면 (autologin이 헤더로 차단됨 — 판단 ② 메커니즘 검증.
      이게 실패하면 X-Jina-No-Autologin 배선이나 CORS Allow-Headers 누락)
 6. [잘못된 비밀번호] dev 이메일 + "wrongpass!" 로그인
    → 에러 박스 "이메일 또는 비밀번호가 올바르지 않습니다" 표시, 앱 크래시 없음
 7. [회원가입 + 사용자 분리] 회원가입 탭 → e2e-<rand>@test.dev / password123 / "E2E"
    → 앱 진입, TopNav "E2E" → 단어장 탭 → 카드 0장·"단어를 추가해보세요" 류 빈 상태
      (dev 계정의 시드 9장이 안 보임 = user_id 분리 증명)
 8. [로그아웃 → 재로그인] 로그아웃 → 같은 계정으로 로그인 탭에서 재진입 → TopNav "E2E"
 9. [dev 계정 복귀] 로그아웃 → "개발 계정으로 계속" 클릭
    → TopNav "수민 (dev)" + 단어장에 시드 카드 표시
10. [캔버스 무인증] page.on('request')로 /api/auth/me 요청 수집하며 canvas.html 로드(10s)
    → 렌더 정상(#root innerHTML > 1000), /api/auth/me 요청 0건, 콘솔 에러 0
11. [offline 화면] ⚠ 이 항목만 수동 또는 별도 실행: API 프로세스 kill 후
    localStorage.clear() + 새로고침 → "API 서버에 연결할 수 없습니다" + 다시 시도 버튼
    (로그인 폼이 아님). e2e 스크립트에서는 route로 /api/auth/me를 abort시켜 자동화:
    page.route('**/api/auth/me**', r => r.abort()) → offline 화면 확인 → unroute.

종료: results 집계, 실패 있으면 exit 1 (e2e-vocab.mjs:133-135 패턴)
```

셀렉터 힌트: 로그인 화면 루트에 `data-testid` 없이도 `page.locator('button', { hasText: '개발 계정으로 계속' })`,
`page.locator('input[type=email]')`(로그인 폼 이메일 input에 `type="email"` 지정할 것),
설정 패널 로그아웃은 `page.locator('button', { hasText: '로그아웃' })`로 잡히게 텍스트를 유지한다.

### 기존 e2e 회귀

`scripts/e2e-vocab.mjs`를 재실행해 전 항목 통과 확인 — AppGate 도입으로 부팅 경로가 바뀌므로
(autologin 상태에서는 체감 무변경이어야 정상), 특히 항목 1(데스크탑 렌더)·9(캔버스 READONLY)가 회귀 감시 지점.

---

## 단계 요약 / 순서

1. **Phase 1** — API 4파일 수정(auth.service.js `updateProfile` / auth.routes.js `PATCH /api/me` /
   middleware/auth.js:24 헤더 분기 / cors.js:18 Allow-Headers) + server.js `/config.js`에
   `devAutologin` + api-client.jsx `headers` 옵션 → **curl 5종 통과 후 다음 단계**
2. **Phase 2** — `src/shared/auth-store.jsx` 작성
3. **Phase 3** — `src/screens/login.jsx` 작성
4. **Phase 5(선행)** — index.html/canvas.html에 script 2개 추가 (main.jsx 수정 전에 넣어야
   브라우저에서 즉시 확인 가능)
5. **Phase 4** — main.jsx 컷오버 (readSettings/AppGate/TopNav 칩/SettingsPanel 계정 섹션/설정 persist)
6. **Phase 6** — `scripts/e2e-auth.mjs` 작성·통과 + `scripts/e2e-vocab.mjs` 회귀 통과

의존: 이 문서는 01~04와 독립(신규 테이블 0, 기존 엔드포인트 소비) — 어느 순서로도 구현 가능.
단 01~04가 만들 스토어들도 JinaApp 아래에 Provider가 놓이므로, 이 문서가 먼저 들어가면
그들도 자동으로 "인증 후에만 fetch"가 된다(추가 작업 불필요).

## 수정/생성 파일 요약

**신규**: `src/shared/auth-store.jsx`, `src/screens/login.jsx`, `scripts/e2e-auth.mjs`
**수정**: `api/services/auth.service.js`(updateProfile), `api/routes/auth.routes.js`(PATCH /api/me),
`api/middleware/auth.js:24`, `api/lib/cors.js:18`, `server.js:29-42`(/config.js devAutologin),
`src/shared/api-client.jsx:12,:24-28`(headers), `src/main.jsx`(AppGate/TopNav/SettingsPanel/persist),
`index.html`, `canvas.html`
**무수정 확인 대상**: `db/migrations/*`, `db/seeds/dev.mjs`, `api/config.js`(production 거부 기존),
`api/ai/*`, `src/shared/vocab-store.jsx`

## 완료 판정 (최종 체크리스트)

- [ ] Phase 1 curl 5종 전부 기대값 (특히 ②의 `X-Jina-No-Autologin` 401, ③의 PATCH user DTO에 password_hash 부재)
- [ ] OPTIONS 프리플라이트 Allow-Headers에 `X-Jina-No-Autologin` 포함
- [ ] `DEV_AUTOLOGIN=1` 부팅 → 로그인 화면 없이 앱 진입 (개발 편의 유지)
- [ ] 로그아웃 → 로그인 화면, **새로고침해도** 로그인 화면 유지 (opt-out 지속)
- [ ] 회원가입 신규 계정의 단어장 = 0장 (사용자 분리)
- [ ] "개발 계정으로 계속"이 DEV(`window.JINA_CONFIG.devAutologin`)에서만 보이고 동작
- [ ] 표시 이름 변경이 TopNav 즉시 반영 + 새로고침 잔존 (PATCH /api/me)
- [ ] 테마/aiConfig가 새로고침에 유지 (`jina_settings_v1`)
- [ ] API 서버 다운 시 로그인 화면이 아니라 offline 화면 + 재시도
- [ ] `canvas.html` — `/api/auth/me` 요청 0건, 렌더 정상, 콘솔 에러 0 (auth 비요구)
- [ ] `scripts/e2e-auth.mjs` 전 항목 통과 + `scripts/e2e-vocab.mjs` 회귀 통과
- [ ] `NODE_ENV=production DEV_AUTOLOGIN=1 npm run api` → 부팅 거부 (기존 동작 회귀 확인)
