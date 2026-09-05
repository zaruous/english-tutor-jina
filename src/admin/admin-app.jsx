// admin-app.jsx — 관리 화면 셸 (플랜 11 Phase 2): 상단바 · 탭 · 테마 · root 마운트.
// 탭 본문은 화면 파일이 그린다 — contents.jsx(콘텐츠 · 플랜 11/13), users.jsx(사용자 · 플랜 11 Phase 3).
// admin.html 자체에는 가드가 없다(결정 4) — 인증은 서버가 한다. 권한이 없으면 각 화면이 403 안내를 그린다.

const ADMIN_TABS = [
  { key: 'contents', label: '콘텐츠' },
  { key: 'review', label: '검수', disabled: true, hint: '아직 만들지 않은 화면입니다 (플랜 12)' },
  { key: 'users', label: '사용자' },
];

function AdminShell() {
  const { user: me } = useAuth();
  const [themeName, setThemeName] = React.useState(readThemeName);
  const theme = JINA_THEMES[themeName] || JINA_THEMES.aurora;
  const [tab, setTab] = React.useState('contents');

  React.useEffect(() => {
    const onTheme = () => setThemeName(readThemeName());
    window.addEventListener('jina-theme-change', onTheme);
    window.addEventListener('storage', onTheme);
    return () => {
      window.removeEventListener('jina-theme-change', onTheme);
      window.removeEventListener('storage', onTheme);
    };
  }, []);

  return (
    // jina-root — tokens.jsx 가 주입하는 기본 스타일이 이 클래스에 스코프돼 있다.
    // 빠뜨리면 box-sizing: border-box · Pretendard 폰트 · 버튼 리셋이 관리 화면에만 적용되지 않는다.
    <div className="jina-root" style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: theme.bg, color: theme.text,
    }}>
      {/* 스크롤바는 인라인 스타일로 못 만든다 — 테마 색을 넣은 규칙을 주입한다. */}
      <style>{`
        .jina-scroll { scrollbar-width: thin; scrollbar-color: ${theme.borderStrong} transparent; }
        .jina-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .jina-scroll::-webkit-scrollbar-track { background: transparent; }
        .jina-scroll::-webkit-scrollbar-thumb {
          background: ${theme.borderStrong}; border-radius: 999px;
          border: 3px solid transparent; background-clip: content-box;
        }
        .jina-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.textDim}; background-clip: content-box; }
        .jina-scroll::-webkit-scrollbar-corner { background: transparent; }
      `}</style>
      {/* 상단바 */}
      <nav style={{
        height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px',
        borderBottom: `1px solid ${theme.borderStrong}`, background: theme.bgSoft, flexShrink: 0,
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%', color: '#fff',
          background: theme.accentGrad, display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 700,
        }}>J</span>
        <span style={{ fontSize: 16.5, fontWeight: 700 }}>Jina 콘텐츠 관리</span>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', padding: '3px 9px', borderRadius: 999,
          background: theme.warning + '26', color: theme.warning, border: `1px solid ${theme.warning}52`,
        }}>ADMIN</span>
        {me && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: theme.textDim }}>
            {me.email} · role={me.role}
          </span>
        )}
      </nav>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 7, padding: '16px 26px 0', flexShrink: 0 }}>
        {ADMIN_TABS.map((t) => {
          const active = t.key === tab;
          if (t.disabled) {
            return (
              <span key={t.key} aria-disabled title={t.hint} style={{
                padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textDim,
                // 비활성은 흐리게만 두지 않는다 — 눌리지 않는다는 것이 커서로도 보여야 한다.
                opacity: 0.4, cursor: 'not-allowed', textDecoration: 'line-through',
              }}>{t.label}</span>
            );
          }
          return (
            <button key={t.key} data-testid={`admin-tab-${t.key}`} onClick={() => setTab(t.key)} style={{
              padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: active ? theme.surface : 'transparent',
              border: `1px solid ${active ? theme.borderStrong : theme.border}`,
              color: active ? theme.text : theme.textDim,
              cursor: active ? 'default' : 'pointer',
            }}>{t.label}</button>
          );
        })}
      </div>

      {tab === 'contents' ? <AdminContentsScreen theme={theme} /> : <AdminUsersScreen theme={theme} />}
    </div>
  );
}

function AdminApp() {
  const { status, refresh } = useAuth();
  const themeName = readThemeName();
  const theme = JINA_THEMES[themeName] || JINA_THEMES.aurora;

  if (status === 'loading') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: theme.bg }}>
        <span style={{ color: theme.textMuted, fontSize: 14 }}>로딩 중…</span>
      </div>
    );
  }
  if (status === 'offline') {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'grid', placeItems: 'center',
        background: theme.bg, color: theme.text,
      }}>
        <button onClick={() => refresh()} style={{
          padding: '9px 20px', borderRadius: 8, background: theme.accent, color: '#fff', fontWeight: 700,
        }}>다시 시도</button>
      </div>
    );
  }
  return <AdminShell />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <AuthProvider>
    <AdminApp />
  </AuthProvider>,
);
