// main.jsx — Real app entry point
// 데스크탑: 상단 네비바 + 현재 페이지
// 모바일: 현재 페이지 + 하단 탭바

const APP_PAGES = [
  { id: 'dashboard',    label: '대시보드', icon: 'Home' },
  { id: 'conversation', label: 'AI 회화',  icon: 'Chat',    badge: 'LIVE' },
  { id: 'lesson',       label: 'TOEIC 학습', icon: 'Book' },
  { id: 'vocabulary',   label: '단어장',   icon: 'BookOpen' },
  { id: 'progress',     label: '학습 통계', icon: 'Chart' },
];

// ─────────────────────────────────────────────────────
// 공용 모바일 하단 네비 (AppMobileNav)
// vocabulary.jsx / progress.jsx / mobile.jsx 에서 참조
// ─────────────────────────────────────────────────────
function AppMobileNav({ theme, active, onNavigate }) {
  const items = [
    { id: 'dashboard',    label: '홈',    icon: Icons.Home },
    { id: 'conversation', label: 'AI 회화', icon: Icons.Chat },
    { id: 'lesson',       label: '학습',   icon: Icons.Book },
    { id: 'vocabulary',   label: '단어장', icon: Icons.BookOpen },
    { id: 'progress',     label: '통계',   icon: Icons.Chart },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '8px 8px 22px',
      background: theme.glassBg, backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${theme.border}`,
      display: 'flex',
    }}>
      {items.map(({ id, label, icon: Ico }) => (
        <button key={id} onClick={() => onNavigate && onNavigate(id)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: active === id ? theme.accent : theme.textDim,
          fontSize: 9.5, fontWeight: active === id ? 700 : 400,
          padding: '6px 4px',
          position: 'relative',
        }}>
          <Ico size={21} stroke={active === id ? 2.2 : 1.5} />
          {label}
          {active === id && (
            <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2, borderRadius: 99, background: theme.accent }} />
          )}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 데스크탑 상단 네비
// ─────────────────────────────────────────────────────
function TopNav({ page, onNavigate, theme, onOpenSettings }) {
  return (
    <header style={{
      height: 52, padding: '0 24px',
      display: 'flex', alignItems: 'center', gap: 4,
      borderBottom: `1px solid ${theme.border}`,
      background: theme.bgSoft,
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 20 }}>
        <JinaAvatar size={28} theme={theme} />
        <span className="jina-serif" style={{ fontSize: 18, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>Jina</span>
      </div>

      {/* Nav tabs */}
      {APP_PAGES.map(({ id, label, icon: iconName, badge }) => {
        const Ico = Icons[iconName];
        const active = page === id;
        return (
          <button key={id} onClick={() => onNavigate(id)} style={{
            padding: '6px 14px', borderRadius: 8,
            background: active ? (theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)') : 'transparent',
            color: active ? theme.text : theme.textMuted,
            fontWeight: active ? 700 : 500,
            fontSize: 13.5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            transition: 'all .15s',
            position: 'relative',
          }}>
            {Ico && <Ico size={14} stroke={active ? 2.2 : 1.6} />}
            {label}
            {badge && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 999,
                background: theme.success, color: '#fff', fontWeight: 800,
                letterSpacing: '0.04em',
              }}>{badge}</span>
            )}
            {active && (
              <span style={{
                position: 'absolute', bottom: 0, left: 12, right: 12,
                height: 2, borderRadius: 99, background: theme.accent,
              }} />
            )}
          </button>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings button */}
      <button onClick={onOpenSettings} style={{
        width: 34, height: 34, borderRadius: 8,
        background: 'transparent',
        color: theme.textMuted,
        display: 'grid', placeItems: 'center',
        transition: 'all .15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = theme.chipBg}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icons.Settings size={16} />
      </button>
    </header>
  );
}

// ─────────────────────────────────────────────────────
// 설정 패널 (슬라이드 오버레이)
// ─────────────────────────────────────────────────────
function SettingsPanel({ theme, themeName, setThemeName, aiConfig, setAiConfig, ollamaStatus, onCheck, onClose }) {
  const themeSwatches = {
    aurora: ['#0A0B1A', '#B794F4', '#F687B3', '#4FD1C5'],
    ivory:  ['#EFE7D3', '#B84C2E', '#2D5237', '#C9885A'],
    sage:   ['#E6EBE2', '#2F6850', '#C9885A', '#4A7C59'],
    sunset: ['#F4ECFF', '#C44CE0', '#FF6B6B', '#6A6BFF'],
  };
  const themeDescs = {
    aurora: 'Duolingo Max · 다크',
    ivory: 'Editorial · 라이트',
    sage: '집중 · 차분',
    sunset: 'Glass · 에너제틱',
  };

  return (
    <React.Fragment>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)',
      }} />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 101,
        width: 300, background: theme.bgSoft,
        borderLeft: `1px solid ${theme.border}`,
        boxShadow: '-20px 0 60px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        animation: 'jina-rise 0.2s ease-out',
      }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>설정</span>
          <button onClick={onClose} style={{ color: theme.textMuted, background: 'none', padding: 4, borderRadius: 6 }}>
            <Icons.X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Theme */}
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>컬러 테마</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
            {Object.entries(JINA_THEMES).map(([key, th]) => (
              <button key={key} onClick={() => setThemeName(key)} style={{
                padding: 10, borderRadius: 10, textAlign: 'left',
                background: themeName === key ? (theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)') : 'transparent',
                border: `1.5px solid ${themeName === key ? theme.accent : theme.border}`,
                cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                  {themeSwatches[key].map((c, i) => (
                    <span key={i} style={{ width: 16, height: 20, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.08)' }} />
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{th.name}</div>
                <div style={{ fontSize: 10, color: theme.textDim, marginTop: 2 }}>{themeDescs[key]}</div>
              </button>
            ))}
          </div>

          {/* AI Provider */}
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>AI 제공자</div>
          <div style={{ display: 'flex', borderRadius: 10, background: theme.chipBg, padding: 3, marginBottom: 16 }}>
            {['ollama', 'claude'].map((p) => (
              <button key={p} onClick={() => setAiConfig(c => ({ ...c, provider: p }))} style={{
                flex: 1, padding: '8px', borderRadius: 8,
                background: aiConfig.provider === p ? theme.surface : 'transparent',
                color: aiConfig.provider === p ? theme.text : theme.textMuted,
                fontWeight: aiConfig.provider === p ? 700 : 500,
                fontSize: 13,
                boxShadow: aiConfig.provider === p ? `0 1px 4px rgba(0,0,0,0.12)` : 'none',
                transition: 'all .15s',
              }}>{p === 'ollama' ? 'Ollama (로컬)' : 'Claude'}</button>
            ))}
          </div>

          {aiConfig.provider === 'ollama' ? (
            <React.Fragment>
              <label style={{ fontSize: 12, color: theme.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Ollama URL</label>
              <input
                value={aiConfig.ollamaUrl}
                onChange={e => setAiConfig(c => ({ ...c, ollamaUrl: e.target.value }))}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 12,
                  background: theme.card, border: `1px solid ${theme.borderStrong}`,
                  color: theme.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              <label style={{ fontSize: 12, color: theme.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>모델</label>
              <input
                value={aiConfig.ollamaModel}
                onChange={e => setAiConfig(c => ({ ...c, ollamaModel: e.target.value }))}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 12,
                  background: theme.card, border: `1px solid ${theme.borderStrong}`,
                  color: theme.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              {/* Ollama status */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', borderRadius: 8, marginBottom: 8,
                background: ollamaStatus.checking ? theme.chipBg
                  : ollamaStatus.ok ? theme.success + '18' : theme.error + '18',
                color: ollamaStatus.checking ? theme.textMuted
                  : ollamaStatus.ok ? theme.success : theme.error,
                fontSize: 12, fontWeight: 600,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0,
                  animation: ollamaStatus.checking ? 'jina-pulse 1s infinite' : 'none' }} />
                <span style={{ flex: 1 }}>
                  {ollamaStatus.checking ? '확인 중…'
                    : ollamaStatus.ok ? `연결됨 · ${ollamaStatus.models.length}개 모델`
                    : `연결 실패 — ${ollamaStatus.error || ''}`}
                </span>
                <button onClick={onCheck} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 5, background: 'rgba(0,0,0,0.1)', color: 'inherit', fontWeight: 700 }}>
                  ↻
                </button>
              </div>
              {!ollamaStatus.ok && !ollamaStatus.checking && (
                <div style={{ fontSize: 11, color: theme.textDim, lineHeight: 1.6, padding: '0 2px' }}>
                  터미널에서: <code style={{ background: theme.surface, padding: '1px 5px', borderRadius: 4, fontSize: 10.5 }}>OLLAMA_ORIGINS="*" ollama serve</code>
                </div>
              )}
            </React.Fragment>
          ) : (
            <div style={{
              padding: '12px', borderRadius: 10,
              background: theme.accent + '15', color: theme.accent,
              fontSize: 12, lineHeight: 1.6,
            }}>
              Claude Haiku 4.5 — 이 환경 내장 API 사용 (별도 키 불필요)
            </div>
          )}

          {/* Canvas link */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${theme.border}` }}>
            <a href="canvas.html" style={{ fontSize: 12, color: theme.textDim, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              <Icons.Layers size={14} />
              디자인 캔버스 열기 (개발자 뷰)
            </a>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

// ─────────────────────────────────────────────────────
// 메인 앱
// ─────────────────────────────────────────────────────
function JinaApp() {
  const [page, setPage] = React.useState('dashboard');
  const [themeName, setThemeName] = React.useState('aurora');
  const [aiConfig, setAiConfig] = React.useState({
    provider:    window.JINA_CONFIG?.provider    || 'ollama',
    ollamaUrl:   window.JINA_CONFIG?.ollamaUrl   || 'http://localhost:11434',
    ollamaModel: window.JINA_CONFIG?.ollamaModel || 'gemma4:31b-cloud',
    claudeModel: window.JINA_CONFIG?.claudeModel || 'claude-haiku-4-5',
  });
  const [showSettings, setShowSettings] = React.useState(false);
  const [ollamaStatus, setOllamaStatus] = React.useState({ checking: false, ok: null, models: [], error: null });
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // 전역 설정 동기화
  React.useEffect(() => { window.__JINA_AI_CONFIG = aiConfig; }, [aiConfig]);
  React.useEffect(() => {
    window.__JINA_THEME = themeName;
    window.dispatchEvent(new CustomEvent('jina-theme-change', { detail: { theme: themeName } }));
  }, [themeName]);

  const checkOllama = React.useCallback(async () => {
    setOllamaStatus(s => ({ ...s, checking: true, error: null }));
    const res = await window.JINA_AI.pingOllama(aiConfig.ollamaUrl);
    setOllamaStatus({ checking: false, ok: res.ok, models: res.models || [], error: res.error || null });
  }, [aiConfig.ollamaUrl]);

  React.useEffect(() => { checkOllama(); }, [checkOllama]);

  const theme = JINA_THEMES[themeName] || JINA_THEMES.aurora;
  const commonProps = { theme, aiConfig, onNavigate: setPage };

  const renderPage = () => {
    if (isMobile) {
      const mobileProps = { ...commonProps, noNav: true };
      switch (page) {
        case 'dashboard':    return <MobileDashboard    {...mobileProps} />;
        case 'conversation': return <MobileConversation {...mobileProps} />;
        case 'lesson':       return <LessonMobile       {...mobileProps} />;
        case 'vocabulary':   return <MobileVocabulary   {...mobileProps} />;
        case 'progress':     return <MobileProgress     {...mobileProps} />;
        default:             return <MobileDashboard    {...mobileProps} />;
      }
    }
    switch (page) {
      case 'dashboard':    return <DashboardDesktop    {...commonProps} />;
      case 'conversation': return <ConversationDesktop {...commonProps} />;
      case 'lesson':       return <LessonDesktop       {...commonProps} />;
      case 'vocabulary':   return <VocabularyDesktop   {...commonProps} />;
      case 'progress':     return <ProgressDesktop     {...commonProps} />;
      default:             return <DashboardDesktop    {...commonProps} />;
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard Variable", system-ui, sans-serif',
    }}>
      {/* 데스크탑 상단 네비 */}
      {!isMobile && (
        <TopNav
          page={page}
          onNavigate={setPage}
          theme={theme}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* 페이지 콘텐츠 */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {renderPage()}
      </div>

      {/* 모바일 하단 탭 */}
      {isMobile && (
        <div style={{ flexShrink: 0, position: 'relative', background: theme.glassBg, borderTop: `1px solid ${theme.border}` }}>
          <AppMobileNav theme={theme} active={page} onNavigate={setPage} />
        </div>
      )}

      {/* 설정 패널 */}
      {showSettings && (
        <SettingsPanel
          theme={theme}
          themeName={themeName}
          setThemeName={setThemeName}
          aiConfig={aiConfig}
          setAiConfig={setAiConfig}
          ollamaStatus={ollamaStatus}
          onCheck={checkOllama}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<JinaApp />);
