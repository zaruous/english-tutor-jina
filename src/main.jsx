// main.jsx — Real app entry point
// 데스크탑: 상단 네비바 + 현재 페이지
// 모바일: 현재 페이지 + 하단 탭바

const APP_PAGES = window.APP_PAGES; // 페이지 단일 소스 — src/shared/app-nav.jsx (좌측 사이드바·모바일 탭과 공유)

// AppMobileNav 는 src/shared/app-nav.jsx 로 이동 (canvas.html도 로드해야 하므로)

// 기기 단위 설정 지속성 (docs/plan/05-settings-auth.md 판단 ①: v1은 localStorage).
// 값 모양은 { themeName, aiConfig }. 로그인 화면·스플래시는 JinaApp 밖이라 state를 못 보므로
// AppGate도 이 함수로 테마를 직독한다.
const JINA_SETTINGS_KEY = 'jina_settings_v1';
function readSettings() {
  try { return JSON.parse(localStorage.getItem(JINA_SETTINGS_KEY)) || {}; } catch { return {}; }
}

// ─────────────────────────────────────────────────────
// 데스크탑 상단 헤더 — 현재 페이지 제목 + 사용자 칩 + 설정 (페이지 탭은 좌측 사이드바로 이동)
// ─────────────────────────────────────────────────────
function TopNav({ page, onNavigate, theme, onOpenSettings }) {
  const { user } = useAuth();
  return (
    <header style={{
      height: 52, padding: '0 24px',
      display: 'flex', alignItems: 'center', gap: 4,
      borderBottom: `1px solid ${theme.border}`,
      background: theme.bgSoft,
      flexShrink: 0,
    }}>
      {/* 현재 페이지 제목 — 페이지 이동은 좌측 AppDesktopSidebar 가 담당한다 (상단 탭과 중복 내비였던 것을 정리) */}
      {/* 페이지 컴포넌트가 자체 h1 을 가지므로 여기선 heading 이 아닌 라벨로 둔다 (h1 중복 방지) */}
      <div style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.text, letterSpacing: '-0.01em' }}>
        {(APP_PAGES.find((p) => p.id === page) || APP_PAGES[0]).label}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* 사용자 칩 — 클릭하면 설정(계정 섹션이 패널 맨 위) */}
      {user && (
        <button data-testid="user-chip" onClick={onOpenSettings} title={user.email} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 10px 5px 5px', borderRadius: 999,
          background: 'transparent', color: theme.textMuted,
          fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}
          onMouseEnter={e => e.currentTarget.style.background = theme.chipBg}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{
            width: 24, height: 24, borderRadius: '50%', background: theme.accent, color: '#fff',
            display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800,
          }}>
            {(user.display_name || user.email)[0].toUpperCase()}
          </span>
          {user.display_name || user.email.split('@')[0]}
        </button>
      )}

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
  const { user, logout, updateProfile } = useAuth();
  const [nameDraft, setNameDraft] = React.useState(user?.display_name || '');
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState(null);
  // 스토어의 user가 갱신되면(저장 성공/계정 전환) 입력값을 서버 값에 맞춘다
  React.useEffect(() => { setNameDraft(user?.display_name || ''); }, [user?.display_name]);

  const saveName = async () => {
    setNameSaving(true);
    setNameError(null);
    const res = await updateProfile({ display_name: nameDraft.trim() });
    setNameSaving(false);
    if (!res.ok) setNameError(res.error || '저장에 실패했습니다.');
  };

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
          {/* 계정 — 표시 이름 변경(PATCH /api/me) + 로그아웃 */}
          {user && (
            <React.Fragment>
              <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>계정</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: theme.accent, color: '#fff',
                  display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800,
                }}>{(user.display_name || user.email)[0].toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.display_name || '(이름 없음)'}</span>
                    {user.is_dev && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 999,
                        background: theme.warning + '22', color: theme.warning, fontWeight: 800, letterSpacing: '0.04em',
                      }}>DEV</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                </div>
              </div>

              <label style={{ fontSize: 12, color: theme.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>표시 이름</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: nameError ? 6 : 14 }}>
                <input
                  data-testid="account-name-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && nameDraft.trim() && nameDraft.trim() !== user.display_name) saveName(); }}
                  style={{
                    flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 8,
                    background: theme.card, border: `1px solid ${theme.borderStrong}`,
                    color: theme.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
                <button
                  data-testid="account-name-save"
                  onClick={saveName}
                  disabled={nameSaving || !nameDraft.trim() || nameDraft.trim() === user.display_name}
                  style={{
                    flexShrink: 0, padding: '9px 12px', borderRadius: 8,
                    background: theme.accent, color: '#fff', fontSize: 12, fontWeight: 700,
                    opacity: (nameSaving || !nameDraft.trim() || nameDraft.trim() === user.display_name) ? 0.45 : 1,
                    cursor: (nameSaving || !nameDraft.trim() || nameDraft.trim() === user.display_name) ? 'not-allowed' : 'pointer',
                  }}>{nameSaving ? '저장 중…' : '저장'}</button>
              </div>
              {nameError && (
                <div style={{ fontSize: 11.5, color: theme.error, marginBottom: 12, fontWeight: 600 }}>{nameError}</div>
              )}

              <button data-testid="account-logout" onClick={async () => { await logout(); onClose(); }} style={{
                width: '100%', padding: '9px 0', borderRadius: 8,
                background: theme.error + '18', color: theme.error,
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}>로그아웃</button>

              <div style={{ margin: '20px 0 20px', borderTop: `1px solid ${theme.border}` }} />
            </React.Fragment>
          )}

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
  // 저장값 우선 lazy init — 새로고침에 테마/제공자 선택이 날아가지 않게 (판단 ①)
  const [themeName, setThemeName] = React.useState(() => readSettings().themeName || 'aurora');
  const [aiConfig, setAiConfig] = React.useState(() => {
    const saved = readSettings().aiConfig || {};
    return {
      provider: saved.provider || window.JINA_CONFIG?.provider || 'claude',
      ollamaUrl: saved.ollamaUrl || window.JINA_CONFIG?.ollamaUrl || 'http://localhost:11434',
      // provider별 모델 맵 — 서버 기본값 위에 저장된 선택을 덮는다
      model: { ...(window.JINA_CONFIG?.models || {}), ...(saved.model || {}) },
    };
  });
  const [showSettings, setShowSettings] = React.useState(false);
  const [aiHealth, setAiHealth] = React.useState({ checking: false, providers: {} });
  const [providerMeta, setProviderMeta] = React.useState([]);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  // 데스크탑 좌측 사이드바 — 1300px 미만에서는 아이콘 레일(72px)로 접어 본문 폭을 확보한다
  const sidebarRail = useMediaQuery('(max-width: 1299px)');
  const { user } = useAuth();
  // 허용된 페이지 id 만 라우팅 — '준비 중' 항목·오타 id 는 무시 (알 수 없는 page 가 state 에 남는 일 방지)
  const navigate = React.useCallback((id) => { if (APP_PAGE_IDS.has(id)) setPage(id); }, []);

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
  // 기기 단위 지속성 (localStorage) — 서버 저장은 v2
  React.useEffect(() => {
    try { localStorage.setItem(JINA_SETTINGS_KEY, JSON.stringify({ themeName, aiConfig })); } catch {}
  }, [themeName, aiConfig]);

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
        // 서버 기본 provider를 초기값으로 (config.js에도, 저장값에도 없을 때)
        if (!window.JINA_CONFIG?.provider && !readSettings().aiConfig?.provider && res.default) {
          setAiConfig((c) => ({ ...c, provider: res.default }));
        }
      }
    });
  }, [checkHealth]);

  const theme = JINA_THEMES[themeName] || JINA_THEMES.aurora;
  const commonProps = { theme, aiConfig, onNavigate: navigate };

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
          onNavigate={navigate}
          theme={theme}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* 페이지 콘텐츠 — VocabProvider가 데스크탑/모바일 단어장을 한 스토어로 묶는다 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>
        {/* 데스크탑 좌측 사이드바 — 모든 페이지에서 같은 자리(1차 내비). 모바일은 하단 탭이 담당 */}
        {!isMobile && (
          <AppDesktopSidebar theme={theme} page={page} onNavigate={navigate} user={user}
            collapsed={sidebarRail} onOpenSettings={() => setShowSettings(true)} />
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
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
      </div>

      {/* 모바일 하단 탭 */}
      {isMobile && (
        <div style={{ flexShrink: 0, position: 'relative', background: theme.glassBg, borderTop: `1px solid ${theme.border}` }}>
          <AppMobileNav theme={theme} active={page} onNavigate={navigate} />
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

// ─────────────────────────────────────────────────────
// 인증 게이트 — 미인증이면 JinaApp을 마운트조차 하지 않는다.
// ① /api/auth/me 외 API 호출이 나가지 않고(opt-out 헤더를 me에만 실으면 되는 근거),
// ② 로그아웃/계정 전환 시 모든 Provider state가 통째로 버려져 이전 사용자 데이터가
//    다음 사용자에게 보이지 않는다.
// ─────────────────────────────────────────────────────
function AppGate() {
  const { status, error, refresh } = useAuth();
  // 로그인 화면·스플래시도 저장된 테마를 따른다 (JinaApp 밖이라 state 접근 불가 → localStorage 직독)
  const theme = JINA_THEMES[readSettings().themeName] || JINA_THEMES.aurora;

  if (status === 'loading') { // autologin 왕복 중 로그인 화면 플래시 방지
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: theme.bg }}>
        <JinaAvatar size={48} pulsing theme={theme} />
      </div>
    );
  }
  if (status === 'offline') { // API 서버 다운 ≠ 미로그인 — 로그인 화면을 보여주면 오독한다
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'grid', placeItems: 'center',
        background: theme.bg, color: theme.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard Variable", system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>API 서버에 연결할 수 없습니다</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16, lineHeight: 1.6 }}>{error}</div>
          <button onClick={() => refresh()} style={{
            padding: '9px 20px', borderRadius: 8, background: theme.accent,
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>다시 시도</button>
        </div>
      </div>
    );
  }
  if (status === 'anon') return <LoginScreen theme={theme} />;
  return <JinaApp />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <AuthProvider>
    <AppGate />
  </AuthProvider>
);
