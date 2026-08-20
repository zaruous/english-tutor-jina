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

// AppMobileNav 는 src/shared/app-nav.jsx 로 이동 (canvas.html도 로드해야 하므로)

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
function SettingsPanel({ theme, themeName, setThemeName, aiConfig, setAiConfig, aiHealth, providerMeta, onCheck, onClose }) {
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

          {/* AI Provider — /api/ai/providers 결과로 5종 렌더 */}
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>AI 제공자</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
            {(providerMeta.length ? providerMeta : Object.entries(window.JINA_AI.PROVIDER_META).map(([id, m]) => ({ id, label: m.label, models: [] }))).map((p) => {
              const health = aiHealth.providers?.[p.id];
              const down = health && !health.ok;
              const active = aiConfig.provider === p.id;
              return (
                <button key={p.id}
                  onClick={() => setAiConfig(c => ({ ...c, provider: p.id }))}
                  disabled={down}
                  title={down ? `사용 불가: ${health.detail || ''}` : undefined}
                  style={{
                    padding: '8px 10px', borderRadius: 8, textAlign: 'left',
                    background: active ? theme.surface : 'transparent',
                    border: `1.5px solid ${active ? theme.accent : theme.border}`,
                    color: down ? theme.textDim : active ? theme.text : theme.textMuted,
                    fontWeight: active ? 700 : 500, fontSize: 12.5,
                    opacity: down ? 0.55 : 1, cursor: down ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: !health ? theme.textDim : health.ok ? theme.success : theme.error,
                  }} />
                  {p.label}
                </button>
              );
            })}
          </div>

          {aiConfig.provider === 'ollama' && (
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
            </React.Fragment>
          )}

          {/* 모델 — 목록이 있으면 select, 없으면 text input */}
          <label style={{ fontSize: 12, color: theme.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>모델</label>
          {(() => {
            const meta = providerMeta.find((p) => p.id === aiConfig.provider);
            const models = meta?.models || [];
            const value = aiConfig.model?.[aiConfig.provider] || meta?.defaultModel || '';
            const setModel = (v) => setAiConfig(c => ({ ...c, model: { ...c.model, [c.provider]: v } }));
            const inputStyle = {
              width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 12,
              background: theme.card, border: `1px solid ${theme.borderStrong}`,
              color: theme.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            };
            return models.length > 0 ? (
              <select value={value} onChange={e => setModel(e.target.value)} style={inputStyle}>
                {!models.includes(value) && value && <option value={value}>{value}</option>}
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={value} onChange={e => setModel(e.target.value)} placeholder="모델 이름" style={inputStyle} />
            );
          })()}

          {/* 상태 pill — health.providers[선택 provider] */}
          {(() => {
            const health = aiHealth.providers?.[aiConfig.provider];
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', borderRadius: 8, marginBottom: 8,
                background: aiHealth.checking ? theme.chipBg
                  : health?.ok ? theme.success + '18' : theme.error + '18',
                color: aiHealth.checking ? theme.textMuted
                  : health?.ok ? theme.success : theme.error,
                fontSize: 12, fontWeight: 600,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0,
                  animation: aiHealth.checking ? 'jina-pulse 1s infinite' : 'none' }} />
                <span style={{ flex: 1 }}>
                  {aiHealth.checking ? '확인 중…'
                    : health?.ok ? '연결됨'
                    : `연결 실패 — ${health?.detail || '상태 미확인'}`}
                </span>
                <button onClick={onCheck} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 5, background: 'rgba(0,0,0,0.1)', color: 'inherit', fontWeight: 700 }}>
                  ↻
                </button>
              </div>
            );
          })()}

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
    provider: window.JINA_CONFIG?.provider || 'claude',
    ollamaUrl: window.JINA_CONFIG?.ollamaUrl || 'http://localhost:11434',
    model: { ...(window.JINA_CONFIG?.models || {}) }, // provider별 모델 맵
  });
  const [showSettings, setShowSettings] = React.useState(false);
  const [aiHealth, setAiHealth] = React.useState({ checking: false, providers: {} });
  const [providerMeta, setProviderMeta] = React.useState([]);
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

  const checkHealth = React.useCallback(async (force = true) => {
    setAiHealth(s => ({ ...s, checking: true }));
    const res = await window.JINA_AI.checkHealth({ force });
    setAiHealth({ checking: false, providers: res.ok ? res.providers : {} });
  }, []);

  React.useEffect(() => {
    checkHealth(false); // 부팅 시엔 서버 캐시만 읽는다
    window.JINA_AI.listProviders().then((res) => {
      if (res.ok) {
        setProviderMeta(res.providers);
        // 서버 기본 provider를 초기값으로 (config.js에 없을 때)
        if (!window.JINA_CONFIG?.provider && res.default) {
          setAiConfig((c) => ({ ...c, provider: res.default }));
        }
      }
    });
  }, [checkHealth]);

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

      {/* 페이지 콘텐츠 — VocabProvider가 데스크탑/모바일 단어장을 한 스토어로 묶는다 */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <VocabProvider>
          <ConversationProvider>
            <LessonProvider>
              <DashboardProvider>
                <ProgressProvider>
                {renderPage()}
                </ProgressProvider>
              </DashboardProvider>
            </LessonProvider>
          </ConversationProvider>
        </VocabProvider>
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
          aiHealth={aiHealth}
          providerMeta={providerMeta}
          onCheck={checkHealth}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<JinaApp />);
