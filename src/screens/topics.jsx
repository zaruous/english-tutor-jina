// topics.jsx — 임계치(레슨3·시나리오1·단어20)를 충족한 토픽만 보여주는 통합 학습 진입점.
function TopicProgressBar({ theme, label, value }) {
  const total = value?.total || 0;
  const done = value?.done || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 5 }}>
        <span style={{ color: theme.textMuted }}>{label}</span>
        <span style={{ color: theme.text, fontWeight: 700 }}>{done}/{total}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: theme.chipBg, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percent}%`, background: theme.accent, borderRadius: 99, transition: 'width .2s' }} />
      </div>
    </div>
  );
}

function TopicsScreen({ theme, onNavigate }) {
  const mobile = useMediaQuery('(max-width: 767px)');
  const { select: selectLesson } = useLesson();
  const { startScenario } = useConversation();
  const [topics, setTopics] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [startingScenario, setStartingScenario] = React.useState(null);
  const [addingSet, setAddingSet] = React.useState(null);
  const [setNotice, setSetNotice] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    window.JINA_API.get('/api/topics').then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setTopics(res.topics || []);
        setSelectedId((id) => id || res.topics?.[0]?.id || null);
        setError(null);
      } else setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    window.JINA_API.get(`/api/topics/${selectedId}`).then((res) => {
      if (cancelled) return;
      if (res.ok) { setDetail(res); setError(null); }
      else setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  const openLesson = async (id) => {
    await selectLesson(id);
    onNavigate && onNavigate('lesson');
  };
  const openScenario = async (id) => {
    setStartingScenario(id);
    const res = await startScenario(id);
    setStartingScenario(null);
    if (res?.ok) onNavigate && onNavigate('conversation');
    else if (res?.error) setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
  };
  const addSet = async (id) => {
    setAddingSet(id);
    setSetNotice('');
    const res = await window.JINA_API.post(`/api/vocab-sets/${id}/add`, {});
    setAddingSet(null);
    if (res.ok) {
      setSetNotice(`${res.added}개 추가 · ${res.duplicates}개는 이미 학습 중`);
      const refreshed = await window.JINA_API.get(`/api/topics/${selectedId}`);
      if (refreshed.ok) setDetail(refreshed);
    } else setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
  };
  const card = { border: `1px solid ${theme.border}`, background: theme.card, borderRadius: 15 };

  return (
    <main className="jina-root" style={{ height: '100%', overflow: 'auto', background: theme.bg, padding: mobile ? '18px 14px 100px' : '28px 32px 44px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: theme.accent + '18', color: theme.accent, display: 'grid', placeItems: 'center' }}>
            <Icons.Layers size={21} />
          </div>
          <div>
            <h1 className="jina-serif" style={{ fontSize: mobile ? 23 : 28, margin: 0, color: theme.text, fontWeight: 500 }}>주제별 학습</h1>
            <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: 12.5 }}>회화 → 독해 → 단어를 한 흐름으로 완성하세요.</p>
          </div>
        </div>

        {error && <div style={{ ...card, padding: 12, marginBottom: 14, color: theme.error, fontSize: 12 }}>{error}</div>}
        {!loading && topics.length === 0 && (
          <div data-testid="topics-empty" style={{ ...card, padding: 32, textAlign: 'center', color: theme.textMuted, fontSize: 13 }}>
            콘텐츠 기준을 충족한 토픽이 아직 없습니다.
          </div>
        )}

        {topics.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '240px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
            <aside aria-label="토픽 목록" style={{ ...card, padding: 10 }}>
              {topics.map((t) => {
                const active = t.id === selectedId;
                return (
                  <button key={t.id} type="button" data-testid="topic-row" onClick={() => setSelectedId(t.id)} aria-current={active ? 'true' : undefined} style={{
                    width: '100%', padding: '11px 12px', borderRadius: 10, textAlign: 'left',
                    background: active ? theme.accent + '15' : 'transparent', color: theme.text,
                    border: active ? `1px solid ${theme.accent}44` : '1px solid transparent',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label_ko}</div>
                    <div style={{ marginTop: 4, fontSize: 10.5, color: theme.textMuted }}>{t.lesson_count} 레슨 · {t.scenario_count} 회화 · {t.vocab_count} 단어</div>
                  </button>
                );
              })}
            </aside>

            <section style={{ minWidth: 0 }}>
              {loading && !detail && <div style={{ ...card, padding: 28, color: theme.textMuted, textAlign: 'center' }}>토픽을 불러오는 중…</div>}
              {detail && (
                <>
                  <div style={{ ...card, padding: mobile ? 17 : 22, marginBottom: 14, background: `linear-gradient(135deg, ${theme.card}, ${theme.accent}0d)` }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 11, color: theme.accent, fontWeight: 800, letterSpacing: '.08em' }}>LEARNING PATH</div>
                        <h2 style={{ margin: '6px 0', color: theme.text, fontSize: 21 }}>{detail.topic.label_ko}</h2>
                        <p style={{ margin: 0, color: theme.textMuted, fontSize: 12.5, lineHeight: 1.6 }}>{detail.topic.description}</p>
                      </div>
                      <div style={{ minWidth: 150, textAlign: 'right' }}>
                        <div className="jina-serif" style={{ fontSize: 34, color: theme.accent }}>{detail.progress.percent}%</div>
                        <div style={{ fontSize: 10.5, color: theme.textMuted }}>전체 진행률</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: mobile ? 0 : 18, marginTop: 18 }}>
                      <TopicProgressBar theme={theme} label="회화" value={detail.progress.conversation} />
                      <TopicProgressBar theme={theme} label="독해" value={detail.progress.lesson} />
                      <TopicProgressBar theme={theme} label="단어" value={detail.progress.vocabulary} />
                    </div>
                  </div>

                  <h3 style={{ color: theme.text, fontSize: 14, margin: '20px 2px 10px' }}>1. AI 회화</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))', gap: 9 }}>
                    {(detail.scenarios || []).map((s) => (
                      <div key={s.id} style={{ ...card, padding: 15 }}>
                        <div style={{ color: theme.accent2, fontSize: 10, fontWeight: 800 }}>{s.tag}</div>
                        <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginTop: 5 }}>{s.title}</div>
                        <p style={{ color: theme.textMuted, fontSize: 11.5, lineHeight: 1.5, minHeight: 34 }}>{s.description}</p>
                        <button type="button" data-testid="topic-start-scenario" disabled={startingScenario === s.id || window.JINA_READONLY} onClick={() => openScenario(s.id)} style={{
                          padding: '7px 11px', borderRadius: 8, background: theme.accent2, color: '#fff', fontSize: 11.5, fontWeight: 700,
                        }}>{startingScenario === s.id ? '시작 중…' : '회화 시작'}</button>
                      </div>
                    ))}
                  </div>

                  <h3 style={{ color: theme.text, fontSize: 14, margin: '20px 2px 10px' }}>2. TOEIC 독해</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(detail.lessons || []).map((l) => (
                      <button key={l.id} type="button" data-testid="topic-open-lesson" onClick={() => openLesson(l.id)} style={{
                        ...card, padding: '13px 15px', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                        <Icons.Book size={17} style={{ color: theme.accent }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: theme.text, fontSize: 13, fontWeight: 700 }}>{l.title}</div>
                          <div style={{ color: theme.textMuted, fontSize: 10.5, marginTop: 3 }}>{l.subtitle} · {l.question_count}문항</div>
                        </div>
                        <span style={{ color: l.attempt_count ? theme.success : theme.textDim, fontSize: 11 }}>{l.attempt_count ? `${l.attempt_count}회 완료` : '시작'}</span>
                        <Icons.ChevronRight size={14} style={{ color: theme.textDim }} />
                      </button>
                    ))}
                  </div>

                  <h3 style={{ color: theme.text, fontSize: 14, margin: '20px 2px 10px' }}>3. 핵심 단어</h3>
                  {(detail.vocab_sets || []).map((set) => (
                    <div key={set.id} style={{ ...card, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div>
                          <div style={{ color: theme.text, fontSize: 14, fontWeight: 700 }}>{set.title}</div>
                          <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 3 }}>{set.description}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" data-testid="topic-add-vocab-set" disabled={addingSet === set.id || window.JINA_READONLY} onClick={() => addSet(set.id)} style={{ padding: '7px 10px', borderRadius: 8, color: '#fff', background: theme.accent, fontSize: 11, fontWeight: 700 }}>{addingSet === set.id ? '추가 중…' : '20단어 담기'}</button>
                          <button type="button" onClick={() => onNavigate && onNavigate('vocabulary')} style={{ padding: '7px 10px', borderRadius: 8, color: theme.accent, background: theme.accent + '15', fontSize: 11, fontWeight: 700 }}>단어장 열기</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 13 }}>
                        {(set.words || []).map((w) => <span key={w.word} title={w.meaning_ko} style={{ padding: '4px 8px', borderRadius: 999, background: theme.chipBg, color: theme.textMuted, fontSize: 10.5 }}>{w.word}</span>)}
                      </div>
                      {setNotice && <div style={{ marginTop: 10, color: theme.success, fontSize: 11.5 }}>{setNotice}</div>}
                    </div>
                  ))}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

window.TopicsScreen = TopicsScreen;
