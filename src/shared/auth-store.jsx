// auth-store.jsx — 인증 Context 스토어. window.AuthProvider / window.useAuth
// api-client.jsx 뒤, screens/login.jsx·main.jsx 앞에 로드되어야 한다.
//
// 캔버스(canvas.html → src/app.jsx)에는 AuthProvider가 없다 — useAuth는 게스트 fallback으로
// 떨어져 네트워크 호출 0건으로 동작한다. **캔버스는 auth를 요구하면 안 된다.**
//
// 상태는 status 4종으로만 표현한다:
//   'loading' 부팅 왕복 중 · 'authed' 로그인됨 · 'anon' 미인증(로그인 화면) · 'offline' API 불가
// 'offline'을 'anon'과 구분하는 이유: API 서버가 죽었을 때 로그인 화면을 보여주면
// 사용자가 "비밀번호가 틀렸나?"로 오독한다 (main.jsx AppGate가 별도 화면을 렌더).

const AuthContext = React.createContext(null);

// 로그아웃 후 DEV_AUTOLOGIN 재발급 차단 플래그 (docs/plan/05-settings-auth.md 판단 ②).
// 이 값이 '1'이면 GET /api/auth/me에 X-Jina-No-Autologin: 1 을 실어 보내 서버의
// devLogin 분기를 건너뛰게 한다 → 401 → 로그인 화면.
const AUTH_OPTOUT_KEY = 'jina_auth_optout';

function readOptout() {
  try { return localStorage.getItem(AUTH_OPTOUT_KEY) === '1'; } catch { return false; }
}
function clearOptout() {
  try { localStorage.removeItem(AUTH_OPTOUT_KEY); } catch {}
}
function setOptout() {
  try { localStorage.setItem(AUTH_OPTOUT_KEY, '1'); } catch {}
}

function AuthProvider({ children }) {
  const [state, setState] = React.useState({ status: 'loading', user: null, error: null });

  const refresh = React.useCallback(async () => {
    const res = await window.JINA_API.get('/api/auth/me',
      readOptout() ? { headers: { 'X-Jina-No-Autologin': '1' } } : undefined);
    if (res.ok) setState({ status: 'authed', user: res.user, error: null });
    else if (res.code === 'UNAUTHORIZED') setState({ status: 'anon', user: null, error: null });
    else setState({
      status: 'offline', user: null,
      error: res.hint ? `${res.error} — ${res.hint}` : res.error,
    });
    return res;
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  // login/signup/devContinue 공통 후처리.
  // 실패 봉투는 스토어 error에 싣지 않고 그대로 반환한다 — 폼 에러는 login.jsx가 렌더한다.
  const finishLogin = React.useCallback((res) => {
    if (res.ok) {
      clearOptout();
      setState({ status: 'authed', user: res.user, error: null });
    }
    return res;
  }, []);

  const login = React.useCallback((email, password) =>
    window.JINA_API.post('/api/auth/login', { email, password }).then(finishLogin), [finishLogin]);

  const signup = React.useCallback((email, password, displayName) =>
    window.JINA_API.post('/api/auth/signup', {
      email, password, ...(displayName ? { display_name: displayName } : {}),
    }).then(finishLogin), [finishLogin]);

  // "개발 계정으로 계속" — opt-out 해제 후 헤더 없는 me 1회. 서버 autologin이 세션을 발급한다.
  // 별도 엔드포인트도, dev 비밀번호 노출도 필요 없다.
  const devContinue = React.useCallback(() => {
    clearOptout();
    return window.JINA_API.get('/api/auth/me').then(finishLogin);
  }, [finishLogin]);

  const logout = React.useCallback(async () => {
    const res = await window.JINA_API.post('/api/auth/logout');
    setOptout();
    setState({ status: 'anon', user: null, error: null }); // 실패해도 로컬은 로그아웃
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

// Provider 부재 시(캔버스) 게스트 fallback — 네트워크 호출 0건, 항상 authed.
// 정적 객체라 훅 규칙 문제가 없다 (vocab/progress fallback은 내부 state가 필요해 훅이었다).
const AUTH_FALLBACK = {
  status: 'authed', error: null,
  user: { id: 0, email: 'guest@canvas', display_name: '게스트', tz: 'Asia/Seoul', is_dev: false },
  login: () => Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 로그인이 비활성화되어 있습니다.' }),
  signup: () => Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 회원가입이 비활성화되어 있습니다.' }),
  logout: () => Promise.resolve({ ok: true }),
  devContinue: () => Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 로그인이 비활성화되어 있습니다.' }),
  updateProfile: () => Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 저장이 비활성화되어 있습니다.' }),
  refresh: () => Promise.resolve({ ok: true }),
};

function useAuth() {
  return React.useContext(AuthContext) || AUTH_FALLBACK;
}

window.AuthProvider = AuthProvider;
window.useAuth = useAuth;
window.JINA_AUTH_OPTOUT_KEY = AUTH_OPTOUT_KEY;
