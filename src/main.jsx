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
// 음성 인식(STT) 설정 — 기본 = 브라우저 SpeechRecognition(받아쓰기 일치율), 선택 = OpenPronounce 사이드카(발음 점수).
// 사이드카의 설치·기동·중지는 서버(/api/speaking/sidecar/*)가 실행하고, 이 패널은 상태를 폴링해 보여준다.
// 조작 버튼은 두 조건을 모두 만족해야 보인다 — 서버가 dev(can_manage) 이고, 내가 관리자(can_admin).
// 둘은 다른 것을 막는다: can_manage 는 '어디서'(production 서버에서는 아무도 못 띄운다),
// can_admin 은 '누가'(설치·기동 라우트가 requireAdmin, 플랜 10.5 S1). can_admin 을 안 보면
// learner 에게 버튼이 그대로 보이고 누르는 순간 403 토스트만 뜬다.
function SttSettings({ theme, sttMode, setSttMode }) {
  const { user } = useAuth();
  const canAdmin = Boolean(user?.can_admin);
  const [status, setStatus] = React.useState(null); // GET /api/speaking/assess/status 응답 (ok:false 면 API 오류)
  const [busy, setBusy] = React.useState(null);     // 'install' | 'start' | 'stop'
  const [actionError, setActionError] = React.useState(null);
  const refresh = React.useCallback(async (force = false) => {
    if (!window.JINA_API) return;
    const res = await window.JINA_API.get(`/api/speaking/assess/status${force ? '?force=1' : ''}`);
    setStatus(res);
  }, []);
  React.useEffect(() => { if (sttMode === 'openpronounce') refresh(true); }, [sttMode, refresh]);

  const sc = status?.sidecar;
  const installing = sc?.install?.state === 'installing';
  // 설치 중, 또는 기동 직후(프로세스는 있는데 /health 가 아직 안 뜸)에는 2.5초마다 다시 본다
  const polling = sttMode === 'openpronounce' && Boolean(installing || (sc?.pid && status && !status.available));
  React.useEffect(() => {
    if (!polling) return undefined;
    const id = setInterval(() => refresh(true), 2500);
    return () => clearInterval(id);
  }, [polling, refresh]);

  const act = async (what) => {
    setBusy(what);
    setActionError(null);
    const res = await window.JINA_API.post(`/api/speaking/sidecar/${what}`, {});
    setBusy(null);
    if (!res.ok) setActionError(res.error || `${what} 실패`);
    await refresh(true);
  };

  const optionStyle = (active) => ({
    padding: '9px 10px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
    background: active ? theme.surface : 'transparent',
    border: `1.5px solid ${active ? theme.accent : theme.border}`,
    color: active ? theme.text : theme.textMuted, fontWeight: active ? 700 : 500, fontSize: 12.5,
  });
  const btnStyle = (kind) => ({
    padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
    background: kind === 'danger' ? theme.error + '18' : theme.accent, color: kind === 'danger' ? theme.error : '#fff',
    opacity: busy ? 0.6 : 1,
  });

  // 상태 한 줄 — 순서가 중요하다: 연결됨 > 설치 중 > 미설치 > 꺼짐 > 기동 중
  let line; let tone;
  if (status === null) { line = '확인 중…'; tone = theme.textMuted; }
  else if (status.ok === false) { line = `API 오류 — ${status.error || ''}`; tone = theme.error; }
  else if (status.backend !== 'openpronounce') { line = `서버 백엔드가 ${status.backend} 로 고정돼 있습니다`; tone = theme.warning; }
  else if (status.available) { line = '연결됨 · 발음 평가 사용 가능'; tone = theme.success; }
  else if (installing) { line = '설치 중… (torch 수백 MB, 몇 분)'; tone = theme.warning; }
  else if (sc && !sc.installed) { line = '서버에 설치되지 않음'; tone = theme.textMuted; }
  else if (sc && !sc.pid) { line = '설치됨 · 꺼져 있음'; tone = theme.warning; }
  else { line = '기동 중… 첫 실행은 모델 다운로드(~2.4GB)로 수 분 걸립니다'; tone = theme.warning; }

  return (
    <React.Fragment>
      <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>음성 인식 (STT)</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <button data-testid="stt-mode-browser" onClick={() => setSttMode('browser')} style={optionStyle(sttMode === 'browser')}>
          브라우저 음성 인식 <span style={{ fontSize: 10, color: theme.textDim, fontWeight: 600 }}>기본</span>
          <div style={{ fontSize: 10.5, color: theme.textDim, marginTop: 2, fontWeight: 500 }}>받아쓰기 일치율 · 설치 없음 · 비용 0</div>
        </button>
        <button data-testid="stt-mode-openpronounce" onClick={() => setSttMode('openpronounce')} style={optionStyle(sttMode === 'openpronounce')}>
          OpenPronounce 발음 평가
          <div style={{ fontSize: 10.5, color: theme.textDim, marginTop: 2, fontWeight: 500 }}>로컬 서버 · 음소 단위 점수 · 음성이 PC 를 떠나지 않음</div>
        </button>
      </div>

      {sttMode === 'openpronounce' && (
        <div data-testid="stt-sidecar-panel" style={{ padding: '10px 12px', borderRadius: 8, background: theme.card, border: `1px solid ${theme.border}`, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: tone }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0, animation: polling ? 'jina-pulse 1s infinite' : 'none' }} />
            <span data-testid="stt-sidecar-status" style={{ flex: 1 }}>{line}</span>
            <button onClick={() => refresh(true)} title="다시 확인" style={{ fontSize: 10, padding: '3px 7px', borderRadius: 5, background: 'rgba(0,0,0,0.1)', color: 'inherit', fontWeight: 700 }}>↻</button>
          </div>
          {status?.detail && !status.available && (
            <div style={{ fontSize: 10.5, color: theme.textDim, marginTop: 4 }}>{status.detail}</div>
          )}

          {sc && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {!sc.can_manage ? (
                <span style={{ fontSize: 11, color: theme.textMuted }}>이 서버는 화면에서 설치·기동할 수 없습니다 (production). 관리자에게 `lib/pronounce` 설치를 요청하세요.</span>
              ) : !canAdmin ? (
                <span data-testid="stt-sidecar-admin-only" style={{ fontSize: 11, color: theme.textMuted }}>
                  관리자만 설치·기동할 수 있습니다. 상태는 위에서 확인할 수 있고, 사이드카가 꺼져 있으면 스피킹 화면은 브라우저 받아쓰기로 동작합니다.
                </span>
              ) : (
                <React.Fragment>
                  {!sc.installed && !installing && (
                    <button data-testid="stt-sidecar-install" disabled={Boolean(busy)} onClick={() => act('install')} style={btnStyle()}>
                      {busy === 'install' ? '요청 중…' : '서버에 설치'}
                    </button>
                  )}
                  {sc.installed && !sc.pid && !installing && (
                    <button data-testid="stt-sidecar-start" disabled={Boolean(busy)} onClick={() => act('start')} style={btnStyle()}>
                      {busy === 'start' ? '요청 중…' : '시작'}
                    </button>
                  )}
                  {sc.pid && (
                    <button data-testid="stt-sidecar-stop" disabled={Boolean(busy)} onClick={() => act('stop')} style={btnStyle('danger')}>
                      {busy === 'stop' ? '요청 중…' : '중지'}
                    </button>
                  )}
                </React.Fragment>
              )}
            </div>
          )}
          {actionError && <div style={{ fontSize: 11.5, color: theme.error, marginTop: 8, fontWeight: 600 }}>{actionError}</div>}

          {sc?.install && (installing || sc.install.state === 'failed') && sc.install.log_tail?.length > 0 && (
            <pre data-testid="stt-install-log" style={{
              margin: '10px 0 0', padding: '8px 10px', borderRadius: 6, maxHeight: 140, overflow: 'auto',
              background: theme.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.05)', color: sc.install.state === 'failed' ? theme.error : theme.textMuted,
              fontSize: 10.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>{sc.install.log_tail.slice(-8).join('\n')}</pre>
          )}
          {sc?.install?.state === 'failed' && (
            <div style={{ fontSize: 11, color: theme.error, marginTop: 6 }}>설치 실패 — {sc.install.error}. 전체 로그는 서버 콘솔 · 수동 설치는 `lib/pronounce/README.md`</div>
          )}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: theme.textDim, lineHeight: 1.6 }}>
        발음 점수는 사람 채점과 캘리브레이션되지 않은 실험 값입니다. 사이드카가 꺼져 있으면 스피킹 화면은 자동으로 브라우저 받아쓰기로 동작합니다.
      </div>
    </React.Fragment>
  );
}

function SettingsPanel({ theme, themeName, setThemeName, aiConfig, setAiConfig, aiHealth, providerMeta, onCheck, sttMode, setSttMode, onClose }) {
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

              {user.can_author && (
                <a
                  href="admin.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="admin-open"
                  style={{
                    display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 600,
                    color: theme.accent, textDecoration: 'none',
                  }}
                >콘텐츠 관리 열기</a>
              )}

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

          {/* Ollama URL — 읽기 전용. 서버가 /config.js 로 주입한 값(.env OLLAMA_URL)을 그대로 보여준다.
              자유 입력이었던 시절엔 이 값이 요청 본문에 실려 서버 fetch 대상이 됐고(SSRF, 플랜 10.5 S2),
              지금은 서버가 본문의 ollamaUrl 을 아예 무시한다. 입력칸을 남겨두면 "바꿨는데 안 먹는" 화면이 된다. */}
          {aiConfig.provider === 'ollama' && (
            <React.Fragment>
              <label style={{ fontSize: 12, color: theme.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>Ollama URL</label>
              <div
                data-testid="ollama-url-readonly"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 6,
                  background: theme.chipBg, border: `1px dashed ${theme.border}`,
                  color: theme.textMuted, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
                  wordBreak: 'break-all',
                }}
              >
                {window.JINA_CONFIG?.ollamaUrl || 'http://localhost:11434'}
              </div>
              <div style={{ fontSize: 10.5, color: theme.textDim, lineHeight: 1.6, marginBottom: 12 }}>
                서버 설정값입니다. 바꾸려면 서버 <code>.env</code> 의 <code>OLLAMA_URL</code> 을 고치고 다시 시작하세요.
              </div>
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

          {/* 상태 pill — health.providers[선택 provider].
              프로브 강제(force=1)는 관리자만 반영된다(플랜 10.5 S3). 비관리자에게 같은 버튼을 주면
              "눌러도 아무 일이 없다" 로 보이므로, 라벨을 기대에 맞추고 캐시 응답이면 그렇다고 적는다. */}
          {(() => {
            const health = aiHealth.providers?.[aiConfig.provider];
            const canAdmin = Boolean(user?.can_admin);
            const checkedLabel = aiHealth.checkedAt
              ? new Date(aiHealth.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              : null;
            return (
              <React.Fragment>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 8, marginBottom: 6,
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
                  <button
                    data-testid="ai-health-check"
                    onClick={() => onCheck(canAdmin)}
                    title={canAdmin ? '모든 제공자를 다시 검사합니다' : '서버가 마지막으로 검사한 결과를 다시 읽습니다 (강제 검사는 관리자만)'}
                    style={{ fontSize: 10, padding: '3px 7px', borderRadius: 5, background: 'rgba(0,0,0,0.1)', color: 'inherit', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    {canAdmin ? '↻ 다시 검사' : '↻ 상태 새로고침'}
                  </button>
                </div>
                {/* 첫 응답 전(checkedAt 없음)에는 아무 말도 하지 않는다 — 없는 시각을 지어내지 않기 위해 */}
                {!aiHealth.checking && checkedLabel && (
                  <div data-testid="ai-health-cache-note" style={{ fontSize: 10.5, color: theme.textDim, lineHeight: 1.6, marginBottom: 8 }}>
                    {aiHealth.cached
                      ? `캐시된 결과입니다 · ${checkedLabel} 기준${canAdmin ? '' : ' — 제공자를 다시 검사하는 것은 관리자만 할 수 있습니다.'}`
                      : `방금 검사했습니다 · ${checkedLabel}`}
                  </div>
                )}
              </React.Fragment>
            );
          })()}

          {/* 음성 인식(STT) — 기본 브라우저, 선택 OpenPronounce 사이드카(설치·기동 버튼 포함) */}
          <div style={{ margin: '20px 0 20px', borderTop: `1px solid ${theme.border}` }} />
          <SttSettings theme={theme} sttMode={sttMode} setSttMode={setSttMode} />

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
    // saved.ollamaUrl 은 일부러 읽지 않는다 — 예전 버전이 localStorage 에 남긴 자유 입력값이
    // 여기로 복원되면 window.__JINA_AI_CONFIG 를 타고 다시 살아난다. 서버가 본문의 ollamaUrl 을
    // 무시하므로 실제 피해는 없지만, 화면에 서버와 다른 주소가 뜨는 거짓 표시가 된다 (플랜 10.5 S2).
    // 마이그레이션(잔존값 삭제)은 하지 않는다 — 다음 저장 때 아래 setItem 이 통째로 덮어쓴다.
    return {
      provider: saved.provider || window.JINA_CONFIG?.provider || 'claude',
      // provider별 모델 맵 — 서버 기본값 위에 저장된 선택을 덮는다
      model: { ...(window.JINA_CONFIG?.models || {}), ...(saved.model || {}) },
    };
  });
  // 음성 인식 모드 — 'browser'(기본) | 'openpronounce'. speech.jsx 의 useJinaSttMode 가 아래 전역 동기화를 구독한다.
  const [sttMode, setSttMode] = React.useState(() => {
    const saved = readSettings().sttMode;
    return (window.JINA_STT_MODES || ['browser']).includes(saved) ? saved : 'browser';
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
  React.useEffect(() => {
    window.__JINA_STT_MODE = sttMode;
    window.dispatchEvent(new CustomEvent('jina-stt-change', { detail: { mode: sttMode } }));
  }, [sttMode]);
  // 기기 단위 지속성 (localStorage) — 서버 저장은 v2
  React.useEffect(() => {
    try { localStorage.setItem(JINA_SETTINGS_KEY, JSON.stringify({ themeName, aiConfig, sttMode })); } catch {}
  }, [themeName, aiConfig, sttMode]);

  // force=1 은 provider 전원의 CLI 프로브를 강제한다 — 서버는 그것을 관리자에게만 반영하고
  // 비관리자에겐 400 이 아니라 조용히 캐시를 돌려준다 (플랜 10.5 S3). 그래서 응답의 cached·checkedAt 을
  // 그대로 들고 있다가 패널에 표시한다: 눌렀는데 아무 일도 안 난 것처럼 보이면 안 된다.
  const checkHealth = React.useCallback(async (force = true) => {
    setAiHealth(s => ({ ...s, checking: true }));
    const res = await window.JINA_AI.checkHealth({ force });
    setAiHealth({
      checking: false,
      providers: res.ok ? res.providers : {},
      cached: res.ok ? Boolean(res.cached) : false,
      checkedAt: res.ok ? (res.checkedAt || null) : null,
    });
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
  // 소리(TTS) 재생 중 화면 이동은 확인 모달을 거친다 — 사이드바·모바일 탭·화면 내 이동 버튼 전부
  // 이 래퍼를 쓰므로 한 곳에서 가드된다 (speech.jsx 공통 컴포넌트).
  const [guardedNavigate, speechGuardModal] = useSpeechNavGuard(navigate, theme);
  const commonProps = { theme, aiConfig, onNavigate: guardedNavigate };

  const renderPage = () => {
    if (isMobile) {
      const mobileProps = { ...commonProps, noNav: true };
      switch (page) {
        case 'dashboard':    return <MobileDashboard    {...mobileProps} />;
        case 'conversation': return <MobileConversation {...mobileProps} />;
        case 'topics':       return <TopicsScreen        {...mobileProps} />;
        case 'lesson':       return <LessonMobile       {...mobileProps} />;
        case 'vocabulary':   return <MobileVocabulary   {...mobileProps} />;
        case 'progress':     return <MobileProgress     {...mobileProps} />;
        case 'mistakes':     return <MobileMistakes     {...mobileProps} />;
        case 'listening':    return <MobileListening    {...mobileProps} />;
        case 'speaking':     return <MobileSpeaking     {...mobileProps} />;
        default:             return <MobileDashboard    {...mobileProps} />;
      }
    }
    switch (page) {
      case 'dashboard':    return <DashboardDesktop    {...commonProps} />;
      case 'conversation': return <ConversationDesktop {...commonProps} />;
      case 'topics':       return <TopicsScreen         {...commonProps} />;
      case 'lesson':       return <LessonDesktop       {...commonProps} />;
      case 'vocabulary':   return <VocabularyDesktop   {...commonProps} />;
      case 'progress':     return <ProgressDesktop     {...commonProps} />;
      case 'mistakes':     return <MistakesDesktop     {...commonProps} />;
      case 'listening':    return <ListeningDesktop    {...commonProps} />;
      case 'speaking':     return <SpeakingDesktop     {...commonProps} />;
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
          onNavigate={guardedNavigate}
          theme={theme}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* 페이지 콘텐츠 — VocabProvider가 데스크탑/모바일 단어장을 한 스토어로 묶는다 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>
        {/* 데스크탑 좌측 사이드바 — 모든 페이지에서 같은 자리(1차 내비). 모바일은 하단 탭이 담당 */}
        {!isMobile && (
          <AppDesktopSidebar theme={theme} page={page} onNavigate={guardedNavigate} user={user}
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
          <AppMobileNav theme={theme} active={page} onNavigate={guardedNavigate} />
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
          sttMode={sttMode}
          setSttMode={setSttMode}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 소리 재생 중 이동 확인 모달 (speech.jsx 공통 가드) */}
      {speechGuardModal}
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
