// login.jsx — 로그인/회원가입 화면. window.LoginScreen
// auth-store.jsx(useAuth) 뒤, main.jsx 앞에 로드되어야 한다.
//
// AppGate(main.jsx)가 status === 'anon' 일 때만 렌더하므로 useAuth()는 실 Context를 받는다.
// Props는 { theme } 하나 — 다른 화면과 같은 규약. 색은 전부 테마 토큰(하드코딩 금지).
//
// 에러 문구는 만들지 않는다 — 서버 메시지/힌트가 단일 소스다(단어장 규범).
// 예외는 "서버에 가기 전에 알 수 있는 것" 2건뿐: 이메일 형식, 회원가입 비밀번호 8자.

function LoginScreen({ theme }) {
  const { login, signup, devContinue } = useAuth();
  const [mode, setMode] = React.useState('login'); // 'login' | 'signup'
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState(null); // { code, message, hint? }

  const devAvailable = window.JINA_CONFIG?.devAutologin === true;

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 12,
    background: theme.card, border: `1px solid ${theme.borderStrong}`,
    color: theme.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: 12, color: theme.textMuted, display: 'block', marginBottom: 6, fontWeight: 600,
  };

  const switchMode = (next) => {
    setMode(next);
    setFormError(null); // 입력값은 유지 — 이메일 재타이핑 방지
  };

  // 서버 실패 봉투 → 표시. code별 문구를 새로 만들지 않고 서버 메시지를 그대로 쓴다.
  const showEnvelope = (res) => setFormError({
    code: res.code,
    message: res.error || '알 수 없는 오류',
    hint: res.hint,
  });

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!email.includes('@')) {
      setFormError({ code: 'LOCAL', message: '이메일 형식이 올바르지 않습니다.' });
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setFormError({ code: 'LOCAL', message: '비밀번호는 8자 이상이어야 합니다.' });
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const res = mode === 'login'
      ? await login(email.trim(), password)
      : await signup(email.trim(), password, displayName.trim());
    setSubmitting(false);
    // 성공 시엔 아무것도 하지 않는다 — 스토어가 authed로 바뀌면 AppGate가 앱으로 전환한다.
    if (!res.ok) showEnvelope(res);
  };

  const onDevContinue = async () => {
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);
    const res = await devContinue();
    setSubmitting(false);
    if (!res.ok) {
      if (res.code === 'UNAUTHORIZED') {
        setFormError({ code: res.code, message: '시드 계정이 없습니다. `npm run db:seed`를 실행하세요.' });
      } else showEnvelope(res);
    }
  };

  const tabStyle = (id) => ({
    flex: 1, padding: '8px 0', borderRadius: 8, background: mode === id ? theme.surface : 'transparent',
    border: `1.5px solid ${mode === id ? theme.accent : 'transparent'}`,
    color: mode === id ? theme.text : theme.textMuted,
    fontWeight: mode === id ? 700 : 500, fontSize: 13, cursor: 'pointer',
  });

  return (
    <div style={{
      width: '100vw', height: '100vh', background: theme.bg, color: theme.text,
      display: 'grid', placeItems: 'center', overflowY: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard Variable", system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', display: 'grid', placeItems: 'center', padding: '24px 0' }}>
        {/* 브랜드 */}
        <div style={{ display: 'grid', placeItems: 'center', gap: 10, marginBottom: 20 }}>
          <JinaAvatar size={56} theme={theme} />
          <span className="jina-serif" style={{ fontSize: 26, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>Jina</span>
          <span style={{ fontSize: 13, color: theme.textMuted }}>AI 영어 튜터에 로그인하세요</span>
        </div>

        {/* 카드 — 390px 뷰포트에서도 성립하도록 margin 20px + maxWidth 380 */}
        <div style={{
          width: '100%', maxWidth: 380, margin: '0 20px', boxSizing: 'border-box',
          background: theme.bgSoft, border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 28,
        }}>
          {/* 모드 탭 */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 20, padding: 4,
            borderRadius: 10, background: theme.chipBg,
          }}>
            <button type="button" data-testid="tab-login" onClick={() => switchMode('login')} style={tabStyle('login')}>로그인</button>
            <button type="button" data-testid="tab-signup" onClick={() => switchMode('signup')} style={tabStyle('signup')}>회원가입</button>
          </div>

          <form onSubmit={submit}>
            <label style={labelStyle} htmlFor="jina-login-email">이메일</label>
            <input
              id="jina-login-email" type="email" autoComplete="email" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" style={inputStyle}
            />

            <label style={labelStyle} htmlFor="jina-login-password">비밀번호</label>
            <input
              id="jina-login-password" type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? '8자 이상' : '••••••••'} style={inputStyle}
            />

            {mode === 'signup' && (
              <React.Fragment>
                <label style={labelStyle} htmlFor="jina-login-name">표시 이름 <span style={{ color: theme.textDim, fontWeight: 500 }}>(선택)</span></label>
                <input
                  id="jina-login-name" type="text" autoComplete="nickname"
                  value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="수민" style={inputStyle}
                />
              </React.Fragment>
            )}

            {formError && (
              <div data-testid="login-error" style={{
                background: theme.error + '18', color: theme.error,
                borderRadius: 8, padding: '9px 12px', marginBottom: 12,
                fontSize: 12.5, fontWeight: 600, lineHeight: 1.5,
              }}>
                <div>{formError.message}</div>
                {formError.hint && (
                  <div style={{ fontWeight: 500, marginTop: 4, opacity: 0.85 }}>{formError.hint}</div>
                )}
                {formError.code === 'CONFLICT' && (
                  <button type="button" onClick={() => switchMode('login')} style={{
                    marginTop: 6, padding: '4px 10px', borderRadius: 6,
                    background: theme.error, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  }}>로그인하기</button>
                )}
              </div>
            )}

            <button type="submit" data-testid="login-submit" disabled={submitting} style={{
              width: '100%', padding: '11px 0', borderRadius: 10, marginTop: 4,
              background: theme.accent, color: '#fff',
              fontSize: 13.5, fontWeight: 700, cursor: submitting ? 'progress' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? '확인 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
            </button>
          </form>

          {devAvailable && (
            <React.Fragment>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
                <span style={{ flex: 1, height: 1, background: theme.border }} />
                <span style={{ fontSize: 11, color: theme.textDim, fontWeight: 600 }}>또는</span>
                <span style={{ flex: 1, height: 1, background: theme.border }} />
              </div>
              <button type="button" data-testid="dev-continue" onClick={onDevContinue} disabled={submitting} style={{
                width: '100%', padding: '10px 0', borderRadius: 10,
                background: 'transparent', border: `1px solid ${theme.borderStrong}`,
                color: theme.textMuted, fontSize: 12.5, fontWeight: 600,
                cursor: submitting ? 'progress' : 'pointer',
              }}>개발 계정으로 계속 →</button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
