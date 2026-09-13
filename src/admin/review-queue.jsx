// 검수 큐 — 상태 판정은 서버가 맡고 화면은 생성 결과와 자동 검증 근거를 보여준다.
// Babel standalone 전역 이름 충돌을 피하려고 AdminReview 접두사를 쓴다.
const ADMIN_REVIEW_PAGE_SIZE = 50;

function AdminReviewResult({ theme, item }) {
  const data = item.generated_content;
  if (!data) return <p style={{ color: theme.textMuted }}>표시할 생성 결과가 없습니다.</p>;
  const box = { padding: 14, border: `1px solid ${theme.border}`, borderRadius: 11, background: theme.card, marginBottom: 10 };
  if (item.type === 'lesson') {
    const passage = data.script || data.passage?.body;
    const lines = Array.isArray(passage) ? passage : passage ? [passage] : [];
    return <div data-testid="review-lesson-result">
      {data.subtitle && <p style={{ color: theme.textMuted }}>{data.subtitle}</p>}
      {lines.length > 0 && <section style={box}>
        <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>지문 · 스크립트</h3>
        {lines.map((line, i) => <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 9, lineHeight: 1.65 }}>
          {line?.speaker && <b style={{ color: theme.accent }}>{line.speaker}</b>}
          <span style={{ whiteSpace: 'pre-wrap' }}>{typeof line === 'string' ? line : line.text}</span>
        </div>)}
      </section>}
      <h3 style={{ fontSize: 13 }}>문항 · 정답 · 해설</h3>
      {(data.items || []).map((question, i) => <section key={i} style={box} data-testid="review-question">
        <b style={{ lineHeight: 1.6 }}>{i + 1}. {question.stem}</b>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
          {(question.options || []).map((option) => <span key={option.id} style={{
            padding: '6px 10px', borderRadius: 7, background: theme.chipBg,
            color: option.id === question.answer ? theme.success : theme.textMuted,
            border: `1px solid ${option.id === question.answer ? theme.success : theme.border}`,
          }}>({option.id}) {option.text} {option.id === question.answer && <Icons.Check size={12} />}</span>)}
        </div>
        <p style={{ color: theme.success, lineHeight: 1.65, marginBottom: 0 }}>정답 {question.answer} · {question.explanation}</p>
        {question.skill_code && <div style={{ color: theme.textDim, marginTop: 8, fontSize: 11 }}>평가 영역 · {question.skill_code}</div>}
      </section>)}
    </div>;
  }
  if (item.type === 'scenario') return <div data-testid="review-scenario-result">
    {item.description && <p>{item.description}</p>}
    <section style={box}><h3 style={{ marginTop: 0, fontSize: 13 }}>역할 · 진행 지침</h3>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{data.system_prompt}</div></section>
    <section style={box}><h3 style={{ marginTop: 0, fontSize: 13 }}>첫 대사</h3>{data.opening_message}</section>
    <section style={box}><h3 style={{ marginTop: 0, fontSize: 13 }}>학습 목표</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>{(data.objectives || []).map((goal, i) => <li key={i}>{goal}</li>)}</ul></section>
  </div>;
  if (item.type === 'vocab_set') return <div data-testid="review-vocab-result">
    {item.description && <p>{item.description}</p>}
    {(data.words || []).map((word, i) => <section key={i} style={box}>
      <b>{i + 1}. {word.word}</b> <span style={{ color: theme.textDim }}>{word.pos} {word.ipa}</span>
      <p style={{ margin: '8px 0', color: theme.accent }}>{word.meaning_ko}</p>
      <div style={{ lineHeight: 1.7 }}>{word.example_en}</div>
      <div style={{ color: theme.textMuted }}>{word.example_ko}</div>
    </section>)}
  </div>;
  return <p style={{ color: theme.textMuted }}>이 유형의 상세 미리보기는 준비 중입니다.</p>;
}

function AdminReviewDetail({ theme, item, busy, onReview, separateReviewer }) {
  // 행마다 새로 마운트한다. 이전 초안의 공개 체크·반려 사유가 다음 초안에 남으면 오발행이 된다.
  const [publish, setPublish] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const noteRef = React.useRef(null);
  React.useEffect(() => { if (rejecting) noteRef.current?.focus(); }, [rejecting]);
  const button = { padding: '10px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: `1px solid ${theme.borderStrong}` };
  const warnings = item.validation_errors;
  return <section data-testid="review-detail" data-content-id={item.id} style={{
    display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
    border: `1px solid ${theme.border}`, borderRadius: 15, background: theme.surface, overflow: 'hidden',
  }}>
    <header style={{ padding: '16px 20px', background: theme.bgSoft, borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>{item.title}</h2>
        <span style={{ color: theme.warning, fontSize: 12 }}>검토 대기</span>
      </div>
      <div style={{ marginTop: 7, fontSize: 11, color: theme.textDim }}>
        {ADMIN_TYPE_LABELS[item.type] || item.type} · #{item.id} · {item.created_by_name || '작성자 정보 없음'}
        {item.provider && ` · ${item.provider}${item.model ? ' / ' + item.model : ''}`}
      </div>
    </header>
    <div className="jina-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px', fontSize: 13, overflowWrap: 'anywhere' }}>
      <AdminReviewResult theme={theme} item={item} />
      <section data-testid="review-validation" style={{ padding: 14, borderRadius: 11, border: `1px solid ${theme.borderStrong}`, marginTop: 16 }}>
        <b style={{ color: warnings?.length ? theme.warning : theme.success }}>자동 검증</b>
        {warnings === null ? <p style={{ color: theme.textMuted }}>저장된 자동 검증 기록이 없습니다.</p>
          : warnings?.length ? <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>{warnings.map((warning, i) => <li key={i}>{String(warning)}</li>)}</ul>
          : <p style={{ color: theme.textMuted }}>검증 오류 0건 · 생성 규칙을 통과했습니다.</p>}
      </section>
      <div data-testid="review-cross-check" style={{ marginTop: 12, padding: 13, border: `1px dashed ${theme.borderStrong}`, borderRadius: 10, color: theme.textDim, fontSize: 12 }}>
        교차 채점 · 아직 제공되지 않습니다
      </div>
    </div>
    <footer style={{ padding: '14px 20px', borderTop: `1px solid ${theme.border}`, background: theme.bgSoft }}>
      {item.self_review && <p data-testid="review-self-notice" style={{ margin: '0 0 10px', color: theme.warning, fontSize: 12 }}>
        {separateReviewer ? '본인이 만든 초안은 다른 검수자가 승인해야 합니다.' : '본인이 만든 초안입니다. 자가 승인 사실이 검수 기록에 남습니다.'}
      </p>}
      {!item.can_reject && <p style={{ color: theme.textMuted, fontSize: 12 }}>승인·반려는 검수자(reviewer) 이상만 할 수 있습니다.</p>}
      {rejecting && <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: theme.textMuted }}>반려 사유 (필수)
          <textarea ref={noteRef} data-testid="review-reject-note" value={note} maxLength={500} disabled={busy}
            onChange={(event) => setNote(event.target.value)} rows={3} style={{
              display: 'block', width: '100%', resize: 'vertical', marginTop: 6, borderRadius: 8, padding: 10,
              border: `1px solid ${theme.borderStrong}`, background: theme.bg, color: theme.text, fontFamily: 'inherit',
            }} />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" data-testid="review-reject-confirm" disabled={busy || !note.trim() || !item.can_reject}
            onClick={() => onReview(item, 'reject', { note: note.trim() })}
            style={{ ...button, background: theme.chipBg, color: theme.error, opacity: busy || !note.trim() ? 0.5 : 1 }}>반려 확정</button>
          <button type="button" disabled={busy} onClick={() => setRejecting(false)} style={{ ...button, background: theme.chipBg, color: theme.textMuted }}>취소</button>
        </div>
      </div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* 승인 전 수정 — 레슨만 LC 에디터(플랜 13 Phase A, editors/lc.jsx)로 보낸다. 해시 형식은 admin-app.jsx
            adminRouteFromHash 의 것인데, adminGoto 는 이 파일 뒤에 로드되는 이름이라 해시를 직접 쓴다.
            다른 유형은 흐리게 남긴다 — 사라지면 "이 유형은 편집이 없다" 가 아니라 "버그" 로 읽힌다. */}
        {item.type === 'lesson'
          ? <button type="button" data-testid="review-edit" disabled={busy} title="LC 에디터에서 고친 뒤 다시 검수합니다"
            onClick={() => { window.location.hash = `#/edit/lesson/${encodeURIComponent(item.id)}?from=review`; }}   // 에디터의 '목록' 이 검수 큐로 돌아오게
            style={{ ...button, color: theme.text, background: 'transparent', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1 }}>
            <Icons.Book size={13} /> 승인 전 수정
          </button>
          : <button type="button" data-testid="review-edit" disabled title="레슨만 편집할 수 있습니다(플랜 13 최소형)"
            style={{ ...button, color: theme.textDim, background: 'transparent', cursor: 'not-allowed', opacity: 0.5 }}>
            <Icons.Book size={13} /> 승인 전 수정
          </button>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: theme.textMuted }}>
          <input type="checkbox" data-testid="review-publish" checked={publish} disabled={busy || !item.can_approve}
            onChange={(event) => setPublish(event.target.checked)} style={{ accentColor: theme.accent }} />승인과 함께 공개
        </label>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button type="button" data-testid="review-reject" disabled={busy || !item.can_reject} onClick={() => setRejecting(true)}
            style={{ ...button, color: theme.error, background: 'transparent', opacity: busy || !item.can_reject ? 0.5 : 1 }}>반려(사유)</button>
          <button type="button" data-testid="review-approve" disabled={busy || rejecting || !item.can_approve}
            onClick={() => onReview(item, 'approve', { publish })}
            style={{ ...button, background: theme.accent, color: theme.bg, opacity: busy || rejecting || !item.can_approve ? 0.5 : 1 }}>
            <Icons.Check size={13} /> {busy ? '처리 중…' : '승인'}
          </button>
        </div>
      </div>
      <p style={{ margin: '9px 0 0', color: theme.textDim, fontSize: 11 }}>공개를 선택하지 않으면 승인 후에도 작성자의 학습 목록에만 보입니다.</p>
    </footer>
  </section>;
}

function AdminReviewQueue({ theme, me }) {
  const [state, setState] = React.useState({ loading: true, drafts: [], total: 0, error: null, separateReviewer: false });
  const [selectedId, setSelectedId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [q, setQ] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const requestSeq = React.useRef(0);
  const actionPending = React.useRef(false);
  React.useEffect(() => {
    const timer = setTimeout(() => { setOffset(0); setQ(query.trim()); }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const load = React.useCallback(async () => {
    if (!me?.can_author) return;
    const seq = ++requestSeq.current;
    setState((old) => ({ ...old, loading: true, error: null }));
    const params = new URLSearchParams({ q, limit: String(ADMIN_REVIEW_PAGE_SIZE), offset: String(offset) });
    const res = await window.JINA_API.get(`/api/admin/drafts?${params}`);
    if (seq !== requestSeq.current) return;
    if (!res.ok) {
      setState((old) => ({ ...old, loading: false, error: res.error || '검수 큐를 불러오지 못했습니다.' }));
      return;
    }
    // 마지막 페이지의 마지막 행을 처리했으면 앞 페이지로 이동한다.
    if (!res.drafts.length && offset > 0) { setOffset(Math.max(0, offset - ADMIN_REVIEW_PAGE_SIZE)); return; }
    setState({ loading: false, drafts: res.drafts, total: res.total, error: null, separateReviewer: res.require_separate_reviewer });
    setSelectedId((id) => res.drafts.some((item) => item.id === id) ? id : res.drafts[0]?.id ?? null);
  }, [me?.can_author, q, offset]);
  React.useEffect(() => { load(); return () => { requestSeq.current += 1; }; }, [load]);
  const review = async (item, action, body) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const res = await window.JINA_API.post(`/api/admin/drafts/${item.id}/${action}`, body);
      setNotice({ error: !res.ok, text: res.ok
        ? action === 'reject' ? '반려했습니다. 사유를 기록하고 초안으로 되돌렸습니다.'
          : body.publish ? '승인하고 카탈로그에 공개했습니다.' : '승인했습니다. 공개 범위는 비공개로 유지됩니다.'
        : res.error || '검수 요청을 처리하지 못했습니다.' });
      // 409 는 다른 검수자가 먼저 처리한 경우다. 낡은 큐를 갱신해 재클릭을 막는다.
      if (res.ok || res.code === 'CONFLICT' || res.code === 'FORBIDDEN') await load();
    } finally { actionPending.current = false; setBusy(false); }
  };
  if (!me?.can_author) return <div data-testid="review-forbidden" style={{ padding: 26, color: theme.error }}>검수 큐는 저작자(author) 이상만 볼 수 있습니다.</div>;
  const selected = state.drafts.find((item) => item.id === selectedId);
  return <React.Fragment>
    <style>{`@media (max-width: 850px) { .admin-review-layout { grid-template-columns: 1fr !important; grid-template-rows: 190px minmax(0, 1fr); } }`}</style>
    <header style={{ padding: '16px 26px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${theme.border}` }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>AI 초안 검수</h1>
      <span data-testid="review-total" style={{ color: theme.warning, fontSize: 13 }}>대기 {state.total}건</span>
      <input aria-label="검수 큐 검색" data-testid="review-search" value={query} disabled={busy} onChange={(event) => setQuery(event.target.value)}
        placeholder="제목 검색" maxLength={200} style={{ marginLeft: 'auto', padding: '8px 11px', borderRadius: 8, background: theme.surface, color: theme.text, border: `1px solid ${theme.borderStrong}` }} />
      <button type="button" data-testid="review-refresh" disabled={busy || state.loading} onClick={load}
        style={{ color: theme.textMuted, background: theme.chipBg, borderRadius: 8, padding: '8px 12px' }}><Icons.Refresh size={13} /> 새로고침</button>
    </header>
    {notice && <div data-testid="review-notice" role="status" style={{ padding: '10px 26px', color: notice.error ? theme.error : theme.success, fontSize: 13 }}>{notice.text}</div>}
    {state.error && <div data-testid="review-error" role="alert" style={{ padding: '10px 26px', color: theme.error }}>{state.error}</div>}
    <main className="admin-review-layout" data-testid="review-queue" aria-busy={state.loading} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 310px) minmax(0, 1fr)', gap: 18, padding: '18px 26px', flex: 1, minHeight: 0 }}>
      <aside className="jina-scroll" style={{ minHeight: 0, overflow: 'auto' }}>
        {state.loading && <p style={{ color: theme.textMuted }}>검수 큐를 불러오는 중…</p>}
        {!state.loading && !state.error && !state.total && <p data-testid="review-empty" style={{ color: theme.textMuted }}>검토 대기 중인 초안이 없습니다.</p>}
        {state.drafts.map((item) => <button type="button" key={item.id} data-testid="review-queue-item" data-content-id={item.id}
          disabled={busy || state.loading} aria-pressed={item.id === selectedId} onClick={() => { setSelectedId(item.id); setNotice(null); }} style={{
            display: 'block', textAlign: 'left', width: '100%', padding: 14, marginBottom: 9, borderRadius: 12,
            background: theme.surface, color: theme.text, border: `1px solid ${item.id === selectedId ? theme.accent : theme.border}`,
          }}>
          <div style={{ fontSize: 11, color: theme.accent, marginBottom: 8 }}>{ADMIN_KIND_LABELS[item.kind] || ADMIN_TYPE_LABELS[item.type] || item.type}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{item.title}</div>
          <div style={{ marginTop: 7, fontSize: 11, color: theme.textDim }}>{item.created_by_name || '작성자 정보 없음'} · #{item.id}</div>
          <div style={{ marginTop: 7, fontSize: 11, color: item.validation_errors?.length ? theme.warning : theme.textMuted }}>
            {item.item_count !== null && `${item.type === 'vocab_set' ? '단어' : '문항'} ${item.item_count} · `}
            {item.validation_errors === null ? '자동 검증 기록 없음' : `검증 오류 ${item.validation_errors.length}건`}
          </div>
        </button>)}
        {state.total > ADMIN_REVIEW_PAGE_SIZE && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: theme.textMuted }}>
          <button type="button" disabled={!offset || busy || state.loading} onClick={() => setOffset(offset - ADMIN_REVIEW_PAGE_SIZE)} style={{ padding: 8, color: theme.textMuted }}>이전</button>
          <span>{offset + 1}–{Math.min(offset + ADMIN_REVIEW_PAGE_SIZE, state.total)} / {state.total}</span>
          <button type="button" disabled={offset + ADMIN_REVIEW_PAGE_SIZE >= state.total || busy || state.loading} onClick={() => setOffset(offset + ADMIN_REVIEW_PAGE_SIZE)} style={{ padding: 8, color: theme.textMuted }}>다음</button>
        </div>}
      </aside>
      {selected ? <AdminReviewDetail key={selected.id} theme={theme} item={selected} busy={busy || state.loading || Boolean(state.error)} onReview={review} separateReviewer={state.separateReviewer} />
        : <div style={{ display: 'grid', placeItems: 'center', color: theme.textDim, border: `1px dashed ${theme.borderStrong}`, borderRadius: 15 }}>초안을 선택하면 생성 결과와 검증 기록을 볼 수 있습니다.</div>}
    </main>
  </React.Fragment>;
}
