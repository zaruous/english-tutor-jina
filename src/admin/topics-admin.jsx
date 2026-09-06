// topics-admin.jsx — 관리자 · 토픽 생성/구성/순서 (플랜 13 Phase B).
// 목록에서 만들고 내리고 올리고, 컴포저에서 콘텐츠를 붙이고 순서를 정한다.
// eligible 임계치(레슨3·회화1·단어20)는 저장·공개를 막지 않는 경고 배지다(플랜 11 결정 3).
// 상태 색·전이 라벨·StatusBadge 는 contents.jsx 가 정의한 것을 그대로 쓴다.

// 행 메뉴는 콘텐츠 목록의 ContentRowMenu 를 그대로 쓴다 — 전이표가 콘텐츠와 같아서
// transitionActions(contents.jsx)가 만든 항목이 토픽에도 그대로 맞는다. onAction 만 토픽 API 로 간다.

function EligibleBadge({ theme, t }) {
  if (t.eligible) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: theme.success }}>구성 충족</span>;
  }
  return (
    <span title="학습자 권장 구성: 레슨 3 · 회화 1 · 단어 20 — 미달이어도 저장·공개는 막지 않습니다" style={{
      fontSize: 11, fontWeight: 700, color: theme.warning,
    }}>구성 부족 ⚠</span>
  );
}

// 컴포저 — 구성 목록(↑↓·제거) + 콘텐츠 검색·추가. [구성 저장]이 PUT 한 번으로 반영한다.
function TopicComposer({ theme, me, topicId, onBack, showToast }) {
  const [topic, setTopic] = React.useState(null);
  const [items, setItems] = React.useState([]);       // [{content_id, title, type, status, kind, ...}]
  const [dirty, setDirty] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [q, setQ] = React.useState('');
  const [found, setFound] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await window.JINA_API.get(`/api/admin/topics/${topicId}`);
    if (res.ok) {
      setTopic(res.topic);
      setItems(res.topic.contents);
      setLabel(res.topic.label_ko);
      setDesc(res.topic.description || '');
      setDirty(false);
    } else {
      showToast(res.error || '토픽을 불러오지 못했습니다', true);
      onBack();
    }
  }, [topicId]);
  React.useEffect(() => { load(); }, [load]);

  // 콘텐츠 검색 — 관리자 목록 API 재사용. 구성은 상태와 무관하므로 status 필터 없이 찾는다.
  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ limit: '20' });
      if (q) qs.set('q', q);
      const res = await window.JINA_API.get(`/api/admin/contents?${qs}`);
      if (alive && res.ok) setFound(res.contents);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const move = (idx, dir) => {
    const next = [...items];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
    setDirty(true);
  };
  const remove = (idx) => { setItems(items.filter((_, i) => i !== idx)); setDirty(true); };
  const add = (c) => {
    if (items.some((it) => it.content_id === c.id)) { showToast('이미 붙어 있는 콘텐츠입니다', true); return; }
    setItems([...items, {
      content_id: c.id, title: c.title, type: c.type, status: c.status,
      visibility: c.visibility, kind: c.kind, question_count: c.question_count, slug: c.slug,
    }]);
    setDirty(true);
  };

  const saveMeta = async () => {
    setBusy(true);
    const res = await window.JINA_API.patch(`/api/admin/topics/${topicId}`, { label_ko: label, description: desc });
    setBusy(false);
    if (res.ok) { setTopic(res.topic); showToast('토픽 정보를 저장했습니다'); }
    else showToast(res.error || '저장 실패', true);
  };

  const saveContents = async () => {
    setBusy(true);
    const res = await window.JINA_API.put(`/api/admin/topics/${topicId}/contents`, {
      contents: items.map((it) => it.content_id),
    });
    setBusy(false);
    if (res.ok) { setTopic(res.topic); setItems(res.topic.contents); setDirty(false); showToast('구성을 저장했습니다'); }
    else showToast(res.error || '구성 저장 실패', true);
  };

  if (!topic) return <div style={{ padding: 40, color: theme.textDim, fontSize: 13 }}>불러오는 중…</div>;

  const inputStyle = {
    padding: '8px 11px', borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
    background: theme.card, color: theme.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  };
  return (
    <div className="jina-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          padding: '7px 13px', borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
          background: 'transparent', color: theme.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>← 토픽 목록</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>토픽 구성</h1>
        <StatusBadge theme={theme} status={topic.status} />
        <EligibleBadge theme={theme} t={topic} />
        <span style={{ fontSize: 11.5, color: theme.textDim, fontFamily: 'ui-monospace, Consolas, monospace' }}>
          {topic.slug}
        </span>
      </div>

      {/* 메타 */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
        padding: 16, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.surface, marginBottom: 14,
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 260 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.textDim }}>이름 (label_ko)</span>
          <input data-testid="topic-label" value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 240 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.textDim }}>설명</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} style={inputStyle} />
        </label>
        <button disabled={busy} onClick={saveMeta} style={{
          padding: '9px 16px', borderRadius: 10, border: `1px solid ${theme.borderStrong}`,
          background: 'transparent', color: theme.textMuted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        }}>정보 저장</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* 구성 목록 */}
        <div style={{ padding: 16, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>구성 ({items.length})</span>
            <span style={{ marginLeft: 10, fontSize: 11, color: theme.textDim }}>
              레슨 {topic.lesson_count} · 회화 {topic.scenario_count} · 단어 {topic.vocab_count}
            </span>
            <button data-testid="topic-contents-save" disabled={busy || !dirty} onClick={saveContents} style={{
              marginLeft: 'auto', padding: '8px 15px', borderRadius: 10, border: 'none',
              cursor: dirty ? 'pointer' : 'default', fontSize: 12.5, fontWeight: 700,
              background: dirty ? theme.accent : theme.chipBg, color: dirty ? '#fff' : theme.textDim,
            }}>{dirty ? '구성 저장' : '저장됨'}</button>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12.5, color: theme.textDim }}>
              오른쪽에서 콘텐츠를 검색해 붙이세요
            </div>
          ) : items.map((it, idx) => (
            <div key={it.content_id} data-testid="topic-content-row" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px',
              borderTop: `1px solid ${theme.border}`, fontSize: 12.5,
            }}>
              <span style={{ width: 22, color: theme.textDim, fontFamily: 'ui-monospace, Consolas, monospace' }}>{idx + 1}</span>
              <StatusBadge theme={theme} status={it.status} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.title}>
                {it.title}
              </span>
              <span style={{ fontSize: 11, color: theme.textDim, flexShrink: 0 }}>
                {CONTENT_TYPE_LABELS[it.type] || it.type}{it.kind ? ` · ${KIND_LABELS[it.kind] || it.kind}` : ''}
              </span>
              <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{
                width: 26, height: 26, borderRadius: 7, border: `1px solid ${theme.borderStrong}`,
                background: 'transparent', color: theme.textDim, cursor: 'pointer',
              }}>↑</button>
              <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} style={{
                width: 26, height: 26, borderRadius: 7, border: `1px solid ${theme.borderStrong}`,
                background: 'transparent', color: theme.textDim, cursor: 'pointer',
              }}>↓</button>
              <button onClick={() => remove(idx)} style={{
                width: 26, height: 26, borderRadius: 7, border: `1px solid ${theme.borderStrong}`,
                background: 'transparent', color: theme.error, cursor: 'pointer',
              }}>✕</button>
            </div>
          ))}
        </div>

        {/* 콘텐츠 검색·추가 */}
        <div style={{ padding: 16, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.surface }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>콘텐츠 붙이기</div>
          <input data-testid="topic-content-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="제목 · slug 검색" style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>
            구성은 콘텐츠 상태와 무관하게 짜둘 수 있습니다 — 학습자에게는 공개(published+public)된 것만 보입니다.
          </div>
          {found.map((c) => (
            <div key={c.id} data-testid="topic-search-row" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px',
              borderTop: `1px solid ${theme.border}`, fontSize: 12.5,
            }}>
              <StatusBadge theme={theme} status={c.status} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.title}>
                {c.title}
              </span>
              <span style={{ fontSize: 11, color: theme.textDim, flexShrink: 0 }}>
                {CONTENT_TYPE_LABELS[c.type] || c.type}
              </span>
              <button data-testid={`topic-add-${c.id}`} disabled={items.some((it) => it.content_id === c.id)}
                onClick={() => add(c)} style={{
                  padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${theme.accent}66`, background: 'transparent', color: theme.accent,
                }}>{items.some((it) => it.content_id === c.id) ? '추가됨' : '+ 추가'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminTopicsScreen({ theme }) {
  const { user: me } = useAuth();
  const [state, setState] = React.useState({ loading: true, forbidden: false, error: null, topics: [] });
  const [view, setView] = React.useState({ mode: 'list' }); // list | compose
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');
  const [toast, setToast] = React.useState(null);
  const [rowBusy, setRowBusy] = React.useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async () => {
    setState((p) => ({ ...p, loading: true, error: null, forbidden: false }));
    const res = await window.JINA_API.get('/api/admin/topics');
    if (res.ok) setState({ loading: false, forbidden: false, error: null, topics: res.topics });
    else if (res.code === 'FORBIDDEN') setState((p) => ({ ...p, loading: false, forbidden: true }));
    else setState((p) => ({ ...p, loading: false, error: res.hint ? `${res.error} — ${res.hint}` : res.error }));
  }, []);
  React.useEffect(() => { if (view.mode === 'list') load(); }, [load, view.mode]);

  const create = async () => {
    if (!newLabel.trim()) return;
    const res = await window.JINA_API.post('/api/admin/topics', { label_ko: newLabel.trim() });
    if (res.ok) {
      setCreating(false);
      setNewLabel('');
      showToast('토픽을 초안으로 만들었습니다 — 콘텐츠를 붙여 보세요');
      setView({ mode: 'compose', id: res.topic.id });
    } else {
      showToast(res.error || '토픽 생성 실패', true);
    }
  };

  const runAction = async (row, act) => {
    setRowBusy(row.id);
    const res = act.kind === 'status'
      ? await window.JINA_API.post(`/api/admin/topics/${row.id}/status`, { to: act.to })
      : await window.JINA_API.post(`/api/admin/topics/${row.id}/visibility`, { to: act.to });
    setRowBusy(null);
    if (res.ok) { showToast(`${row.label_ko} — ${act.label} 완료`); load(); }
    else showToast(res.error || '조작 실패', true);
  };

  if (view.mode === 'compose') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TopicComposer theme={theme} me={me} topicId={view.id}
          onBack={() => setView({ mode: 'list' })} showToast={showToast} />
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            padding: '10px 18px', borderRadius: 10, zIndex: 200,
            background: toast.isError ? theme.error : theme.success,
            color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: theme.shadow,
          }}>{toast.msg}</div>
        )}
      </div>
    );
  }

  const gridCols = '76px 1fr 190px 110px 84px 88px 40px';
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {state.forbidden ? (
        <div data-testid="topics-forbidden" style={{ padding: 40, fontSize: 15, color: theme.textMuted }}>
          author 이상의 역할이 필요합니다
        </div>
      ) : (
        <React.Fragment>
          <div style={{ padding: '18px 26px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>토픽</h1>
            {!state.loading && <span style={{ fontSize: 12.5, color: theme.textDim }}>{state.topics.length}개</span>}
            {creating ? (
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                <input data-testid="topic-new-label" autoFocus value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false); }}
                  placeholder="토픽 이름 (예: 출장 영어)"
                  style={{
                    padding: '8px 11px', borderRadius: 9, border: `1px solid ${theme.accent}`,
                    background: theme.card, color: theme.text, fontSize: 13, outline: 'none', width: 240,
                  }} />
                <button data-testid="topic-new-submit" onClick={create} style={{
                  padding: '8px 15px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: theme.accent, color: '#fff', fontSize: 12.5, fontWeight: 700,
                }}>만들기</button>
              </span>
            ) : (
              <button data-testid="topic-new" onClick={() => setCreating(true)} style={{
                marginLeft: 'auto', padding: '8px 15px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: theme.accent, color: '#fff', fontSize: 12.5, fontWeight: 700,
              }}>+ 새 토픽</button>
            )}
          </div>
          {state.error && (
            <div style={{
              margin: '0 26px 12px', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: theme.error + '18', border: `1px solid ${theme.error}44`, color: theme.error,
            }}>{state.error}</div>
          )}
          <div className="jina-scroll" style={{
            margin: '0 26px', flex: 1, minHeight: 0, overflow: 'auto',
            border: `1px solid ${theme.border}`, borderRadius: 15, background: theme.surface,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', gap: 12,
              padding: '0 18px', height: 40, background: theme.bgSoft,
              borderRadius: '14px 14px 0 0', fontSize: 10.5, color: theme.textDim,
              fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              position: 'sticky', top: 0, zIndex: 1,
            }}>
              <span>상태</span><span>토픽</span><span>구성</span><span>배지</span><span>공개범위</span><span>수정일</span><span />
            </div>
            {state.loading ? (
              <div style={{ padding: 40, color: theme.textDim, fontSize: 13 }}>불러오는 중…</div>
            ) : state.topics.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
                토픽이 없습니다 — [+ 새 토픽]으로 시작하세요
              </div>
            ) : state.topics.map((t) => (
              <div key={t.id} data-testid="topic-admin-row" style={{
                display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', gap: 12,
                padding: '0 18px', height: 58, borderTop: `1px solid ${theme.border}`,
              }}>
                <StatusBadge theme={theme} status={t.status} />
                <button onClick={() => setView({ mode: 'compose', id: t.id })} style={{
                  textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
                  color: theme.text, minWidth: 0, padding: 0,
                }}>
                  <span style={{
                    display: 'block', fontSize: 13.5, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.label_ko}</span>
                  <span style={{
                    display: 'block', fontSize: 11, color: theme.textDim,
                    fontFamily: 'ui-monospace, Consolas, monospace',
                  }}>{t.slug}</span>
                </button>
                <span style={{ fontSize: 12, color: theme.textMuted }}>
                  레슨 {t.lesson_count} · 회화 {t.scenario_count} · 단어 {t.vocab_count}
                </span>
                <EligibleBadge theme={theme} t={t} />
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: t.visibility === 'public' ? theme.success : theme.textDim,
                }}>{t.visibility === 'public' ? '전체 공개' : '비공개'}</span>
                <span style={{ fontSize: 12.5, color: theme.textMuted }}>{fmtDate(t.updated_at)}</span>
                <ContentRowMenu
                  theme={theme}
                  row={{ ...t, type: 'topic', title: t.label_ko }}
                  me={me} busy={rowBusy === t.id}
                  onAction={runAction}
                  onEdit={() => setView({ mode: 'compose', id: t.id })}
                />
              </div>
            ))}
          </div>
          <div style={{ padding: '13px 26px 24px', fontSize: 11.5, color: theme.textDim, lineHeight: 1.7 }}>
            토픽 노출은 <b style={{ color: theme.textMuted }}>상태(발행)와 공개범위</b>가 결정합니다 —
            구성 부족 배지는 경고일 뿐 저장·공개를 막지 않습니다. 붙인 콘텐츠 중 학습자에게는
            공개된 것만 보입니다.
          </div>
        </React.Fragment>
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 18px', borderRadius: 10, zIndex: 200,
          background: toast.isError ? theme.error : theme.success,
          color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: theme.shadow,
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
