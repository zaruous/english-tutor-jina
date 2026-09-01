// app.jsx — Compose everything in design canvas + tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "aurora",
  "provider": "ollama",
  "ollamaUrl": "http://localhost:11434",
  "ollamaModel": "gemma4:e2b"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [ollamaStatus, setOllamaStatus] = React.useState({ checking: false, ok: null, models: [], error: null });

  // Push theme + AI config to globals
  React.useEffect(() => {
    window.__JINA_THEME = t.theme;
    window.dispatchEvent(new CustomEvent('jina-theme-change', { detail: { theme: t.theme } }));
  }, [t.theme]);

  React.useEffect(() => {
    window.__JINA_AI_CONFIG = {
      provider: t.provider,
      ollamaUrl: t.ollamaUrl,
      ollamaModel: t.ollamaModel,
    };
  }, [t.provider, t.ollamaUrl, t.ollamaModel]);

  const checkOllama = React.useCallback(async () => {
    setOllamaStatus((s) => ({ ...s, checking: true, error: null }));
    const res = await window.JINA_AI.pingOllama(t.ollamaUrl);
    setOllamaStatus({
      checking: false,
      ok: res.ok,
      models: res.models || [],
      error: res.error || null,
    });
  }, [t.ollamaUrl]);

  // Auto-check on mount and when URL changes
  React.useEffect(() => { checkOllama(); }, [checkOllama]);

  const theme = JINA_THEMES[t.theme] || JINA_THEMES.aurora;
  const aiConfig = {
    provider: t.provider,
    ollamaUrl: t.ollamaUrl,
    ollamaModel: t.ollamaModel,
  };

  const themeSwatches = {
    aurora: ['#0A0B1A', '#B794F4', '#F687B3', '#4FD1C5'],
    ivory: ['#EFE7D3', '#B84C2E', '#2D5237', '#C9885A'],
    sage: ['#E6EBE2', '#2F6850', '#C9885A', '#4A7C59'],
    sunset: ['#F4ECFF', '#C44CE0', '#FF6B6B', '#6A6BFF'],
  };

  return (
    <React.Fragment>
      <DesignCanvas>
        <DCSection
          id="jina-learn"
          title="Jina — Learning Pages"
          subtitle="학습 콘텐츠 — TOEIC Part 7 리딩 + AI 해설"
        >
          <DCArtboard id="lesson-desktop" label="01 · Desktop · TOEIC Part 7 Reading" width={1440} height={920}>
            <LessonDesktop theme={theme} aiConfig={aiConfig} />
          </DCArtboard>
          <DCArtboard id="lesson-mobile" label="02 · Mobile · Lesson" width={420} height={892}>
            <IOSDevice width={402} height={874} dark={theme.isDark}>
              <LessonMobile theme={theme} aiConfig={aiConfig} />
            </IOSDevice>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="jina-chat"
          title="Jina — AI 회화"
          subtitle="실제 AI(Ollama/Claude)와 영어로 대화하고 첨삭받기"
        >
          <DCArtboard id="conversation-desktop" label="03 · Desktop · Jina와 대화" width={1440} height={920}>
            <ConversationDesktop theme={theme} aiConfig={aiConfig} />
          </DCArtboard>
          <DCArtboard id="conversation-mobile" label="04 · Mobile · Jina와 대화" width={420} height={892}>
            <IOSDevice width={402} height={874} dark={theme.isDark}>
              <MobileConversation theme={theme} aiConfig={aiConfig} />
            </IOSDevice>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="jina-home"
          title="Jina — 대시보드"
          subtitle="학습 진도 + Jina의 추천"
        >
          <DCArtboard id="dashboard-desktop" label="05 · Desktop · Dashboard" width={1440} height={920}>
            <DashboardDesktop theme={theme} withSidebar />
          </DCArtboard>
          <DCArtboard id="dashboard-mobile" label="06 · Mobile · Dashboard" width={420} height={892}>
            <IOSDevice width={402} height={874} dark={theme.isDark}>
              <MobileDashboard theme={theme} />
            </IOSDevice>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="jina-vocab"
          title="Jina — 단어장"
          subtitle="SRS 플래시카드 복습 · AI 단어 추가 · 전체 단어장(풀) 탐색"
        >
          <DCArtboard id="vocabulary-desktop" label="07 · Desktop · 단어장" width={1440} height={920}>
            <VocabularyDesktop theme={theme} aiConfig={aiConfig} />
          </DCArtboard>
          <DCArtboard id="vocabulary-mobile" label="08 · Mobile · 단어장" width={420} height={892}>
            <IOSDevice width={402} height={874} dark={theme.isDark}>
              <MobileVocabulary theme={theme} />
            </IOSDevice>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="jina-progress"
          title="Jina — 학습 통계"
          subtitle="점수 추이 · 스킬 분석 · 첨삭 SRS 복습 · 주간 활동"
        >
          <DCArtboard id="progress-desktop" label="09 · Desktop · 학습 통계" width={1440} height={920}>
            <ProgressDesktop theme={theme} />
          </DCArtboard>
          <DCArtboard id="progress-mobile" label="10 · Mobile · 학습 통계" width={420} height={892}>
            <IOSDevice width={402} height={874} dark={theme.isDark}>
              <MobileProgress theme={theme} />
            </IOSDevice>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        {/* THEME */}
        <TweakSection label="컬러 테마" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0 14px' }}>
          {Object.entries(JINA_THEMES).map(([key, th]) => (
            <button
              key={key}
              onClick={() => setTweak('theme', key)}
              style={{
                padding: 10, borderRadius: 10,
                background: t.theme === key ? '#1d1d1f' : 'transparent',
                border: t.theme === key ? '1.5px solid #c96442' : '1.5px solid rgba(0,0,0,0.1)',
                cursor: 'pointer',
                textAlign: 'left',
                color: t.theme === key ? '#fff' : '#1d1d1f',
                transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                {themeSwatches[key].map((c, i) => (
                  <span key={i} style={{ width: 18, height: 22, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.08)' }} />
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{th.name}</div>
              <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: 2 }}>
                {key === 'aurora' && 'Duolingo Max · 다크'}
                {key === 'ivory' && 'Editorial · 라이트'}
                {key === 'sage' && '집중 · 차분'}
                {key === 'sunset' && 'Glass · 에너제틱'}
              </div>
            </button>
          ))}
        </div>

        {/* AI PROVIDER */}
        <TweakSection label="AI 제공자" />
        <TweakRadio
          label="Provider"
          value={t.provider}
          options={['ollama', 'claude']}
          onChange={(v) => setTweak('provider', v)}
        />

        {t.provider === 'ollama' && (
          <React.Fragment>
            <TweakText
              label="Ollama URL"
              value={t.ollamaUrl}
              onChange={(v) => setTweak('ollamaUrl', v)}
              placeholder="http://localhost:11434"
            />
            {ollamaStatus.ok && ollamaStatus.models.length > 0 ? (
              <TweakSelect
                label="모델"
                value={t.ollamaModel}
                options={ollamaStatus.models}
                onChange={(v) => setTweak('ollamaModel', v)}
              />
            ) : (
              <TweakText
                label="모델"
                value={t.ollamaModel}
                onChange={(v) => setTweak('ollamaModel', v)}
                placeholder="llama3.2"
              />
            )}

            {/* Status pill */}
            <div style={{ padding: '8px 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                background: ollamaStatus.checking ? '#f0eee9'
                  : ollamaStatus.ok ? '#22b07d18'
                  : '#e0584418',
                color: ollamaStatus.checking ? '#666'
                  : ollamaStatus.ok ? '#1a7a52'
                  : '#a8392a',
                fontSize: 11, fontWeight: 600,
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'currentColor',
                  animation: ollamaStatus.checking ? 'jina-pulse 1s infinite' : 'none',
                }} />
                <span style={{ flex: 1 }}>
                  {ollamaStatus.checking ? 'Ollama 확인 중…'
                    : ollamaStatus.ok ? `연결됨 · ${ollamaStatus.models.length}개 모델`
                    : `연결 실패 — ${ollamaStatus.error || ''}`}
                </span>
                <button onClick={checkOllama} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 5,
                  background: 'rgba(0,0,0,0.08)', color: 'inherit', fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                }}>↻ 재확인</button>
              </div>
              {!ollamaStatus.ok && !ollamaStatus.checking && (
                <div style={{ fontSize: 10.5, color: '#666', marginTop: 6, lineHeight: 1.5, padding: '0 2px' }}>
                  로컬에서 <code style={{ background: '#1d1d1f', color: '#fff', padding: '0 4px', borderRadius: 3 }}>OLLAMA_ORIGINS="*" ollama serve</code><br/>
                  실행 후 재확인하세요.
                </div>
              )}
            </div>
          </React.Fragment>
        )}

        {t.provider === 'claude' && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: '#c9644218', color: '#a4451c',
            fontSize: 11, lineHeight: 1.5, fontWeight: 500,
          }}>
            Claude Haiku 4.5 — 이 환경 내장 API 사용 (별도 키 불필요)
          </div>
        )}

        <TweakSection label="회화 화면에서 사용해보세요" />
        <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '4px 0' }}>
          "Jina와 대화" 또는 학습 페이지의 <b>Jina에게 물어보기</b> 패널에서 텍스트를 입력해 실제 AI 응답을 받을 수 있어요.
        </div>
      </TweaksPanel>
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
