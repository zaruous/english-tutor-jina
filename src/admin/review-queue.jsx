// review-queue.jsx — 관리자 · AI 초안 검수 (플랜 12 Phase 2).
// 큐 = status='review' 콘텐츠(수기 검수 요청 + AI catalog 초안이 한 목록). 이 화면은 편집하지
// 않는다(결정 4) — 생성 결과와 validation_errors 를 보여주고 승인/반려만. 수정은 에디터로 넘긴다.
// 승인은 published 로 올릴 뿐 공개(visibility)는 건드리지 않는 것이 기본(결정 2) —
// "승인과 함께 공개" 체크박스(기본 off)를 켰을 때만 public 까지 간다.

function reviewTypeLabel(c) {
  return `${CONTENT_TYPE_LABELS[c.type] || c.type}${c.kind ? ` · ${KIND_LABELS[c.kind] || c.kind}` : ''}`;
}

function waitedLabel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}분`;
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

// 검수 상세 — 학습자가 보게 될 내용 + 정답·해설(검수자용)을 한 화면에.
function ReviewDetail({ theme, me, item, onBack, onDecided, onEditLesson, showToast }) {
  const [content, setContent] = React.useState(null);
  const [publishPublic, setPublishPublic] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const res = await window.JINA_API.get(`/api/admin/contents/${item.id}`);
      if (alive && res.ok) setContent(res.content);
    })();
    return () => { alive = false; };
  }, [item.id]);

  const decide = async (kind) => {
    let note;
    if (kind === 'reject') {
      note = window.prompt('반려 사유를 입력하세요 (필수 — 감사 로그에 남습니다)');
      if (!note) return;
    }
    setBusy(true);
    const res = kind === 'approve'
      ? await window.JINA_API.post(`/api/admin/drafts/${item.id}/approve`, { publish_public: publishPublic })
      : await window.JINA_API.post(`/api/admin/drafts/${item.id}/reject`, { note });
    setBusy(false);
    if (res.ok) {
      showToast(kind === 'approve'
        ? `승인 완료 — published${publishPublic ? ' + 전체 공개' : ' (공개는 콘텐츠 탭에서)'}`
        : '반려 완료 — 초안으로 되돌렸습니다');
      onDecided();
    } else {
      showToast(res.error || '처리 실패', true);
    }
  };

  const canReview = Boolean(me?.can_review);
  const sectionStyle = {
    padding: 16, borderRadius: 14, border: `1px solid ${theme.border}`,
    background: theme.surface, marginBottom: 14,
  };

  return (
    <div className="jina-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          padding: '7px 13px', borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
          background: 'transparent', color: theme.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>← 대기열</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{item.title}</h1>
        <StatusBadge theme={theme} status="review" />
        <span style={{ fontSize: 12, color: theme.textDim }}>{reviewTypeLabel(item)}</span>
        {item.draft && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
            background: theme.accent + '1c', color: theme.accent, border: `1px solid ${theme.accent}44`,
          }}>AI · {item.draft.provider}{item.draft.model ? ` / ${item.draft.model}` : ''}</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: theme.textDim, marginBottom: 14 }}>
        요청자 {item.created_by_email || '—'} · 대기 {waitedLabel(item.updated_at)}
        {content?.current_rev ? ` · rev ${content.current_rev}` : ''}
      </div>

      {/* 조작 — 승인은 published 까지만, 공개는 체크박스로 명시 */}
      <div style={{
        ...sectionStyle, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        border: `1px solid ${theme.accent}44`, background: theme.accent + '0c',
      }}>
        {canReview ? (
          <React.Fragment>
            <button data-testid="review-approve" disabled={busy} onClick={() => decide('approve')} style={{
              padding: '9px 18px', borderRadius: 10, border: 'none', cursor: busy ? 'wait' : 'pointer',
              background: theme.success, color: '#fff', fontSize: 13, fontWeight: 700,
            }}>승인 → published</button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: theme.textMuted, cursor: 'pointer' }}>
              <input data-testid="review-publish-public" type="checkbox" checked={publishPublic}
                onChange={(e) => setPublishPublic(e.target.checked)} />
              승인과 함께 전체 공개
            </label>
            <button data-testid="review-reject" disabled={busy} onClick={() => decide('reject')} style={{
              padding: '9px 18px', borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
              border: `1px solid ${theme.error}66`, background: 'transparent',
              color: theme.error, fontSize: 13, fontWeight: 700,
            }}>반려 (사유)</button>
          </React.Fragment>
        ) : (
          <span style={{ fontSize: 12.5, color: theme.textDim }}>승인·반려는 reviewer 이상만 할 수 있습니다</span>
        )}
        {item.type === 'lesson' && (
          <button data-testid="review-edit" onClick={() => onEditLesson(item.id)} style={{
            marginLeft: 'auto', padding: '9px 15px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${theme.borderStrong}`, background: 'transparent',
            color: theme.textMuted, fontSize: 12.5, fontWeight: 600,
          }}>승인 전 수정 (에디터)</button>
        )}
      </div>

      {item.draft?.validation_errors?.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '12px 16px', borderRadius: 10,
          background: theme.error + '18', border: `1px solid ${theme.error}55`,
          color: theme.error, fontSize: 12.5, fontWeight: 600, lineHeight: 1.8,
        }}>
          자동 검증 오류 {item.draft.validation_errors.length}건
          {item.draft.validation_errors.map((e, i) => <div key={i}>· {e}</div>)}
        </div>
      )}

      {!content ? (
        <div style={{ padding: 30, color: theme.textDim, fontSize: 13 }}>불러오는 중…</div>
      ) : content.type === 'lesson' ? (
        <React.Fragment>
          <div style={sectionStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
              {content.detail?.kind === 'toeic_lc' ? '스크립트' : '지문'}
            </div>
            {content.detail?.kind === 'toeic_lc' ? (
              (content.detail.passage?.body || []).map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', fontSize: 13, lineHeight: 1.6 }}>
                  <b style={{ color: l?.speaker === 'W' ? theme.warning : theme.accent, width: 20, flexShrink: 0 }}>{l?.speaker}</b>
                  <span style={{ color: theme.text }}>{l?.text}</span>
                </div>
              ))
            ) : (
              <React.Fragment>
                <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 8 }}>
                  {content.detail?.passage?.subject}
                </div>
                {(content.detail?.passage?.body || []).map((p, i) => (
                  <p key={i} style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.7, color: theme.text }}>{String(p)}</p>
                ))}
              </React.Fragment>
            )}
          </div>
          <div style={sectionStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>문항 ({content.items?.length ?? 0}) — 정답·해설 포함(검수용)</div>
            {(content.items || []).map((q) => (
              <div key={q.position} data-testid="review-item" style={{
                padding: '12px 0', borderTop: `1px solid ${theme.border}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  <span style={{ color: theme.accent, fontWeight: 800 }}>Q{q.position}.</span> {q.stem}
                  {q.skill_code && (
                    <span style={{ marginLeft: 8, fontSize: 10.5, color: theme.textDim }}>({q.skill_code})</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {(q.options || []).map((o) => (
                    <div key={o.id} style={{
                      fontSize: 12.5, padding: '5px 10px', borderRadius: 8,
                      border: `1px solid ${o.id === q.answer ? theme.success : theme.border}`,
                      background: o.id === q.answer ? theme.success + '15' : 'transparent',
                      color: o.id === q.answer ? theme.success : theme.textMuted,
                      fontWeight: o.id === q.answer ? 700 : 500,
                    }}>({o.id}) {o.text}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.6 }}>{q.explanation}</div>
              </div>
            ))}
          </div>
        </React.Fragment>
      ) : content.type === 'scenario' ? (
        <div style={sectionStyle}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>회화 시나리오</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 10 }}>{content.description}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textDim, marginBottom: 4 }}>OPENING</div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>{content.detail?.opening_message}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textDim, marginBottom: 4 }}>SYSTEM PROMPT</div>
          <pre style={{
            margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6,
            color: theme.textMuted, fontFamily: 'ui-monospace, Consolas, monospace',
          }}>{content.detail?.system_prompt}</pre>
        </div>
      ) : (
        <div style={sectionStyle}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
            단어 세트 ({Array.isArray(content.detail?.words) ? content.detail.words.length : 0})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(content.detail?.words || []).map((w, i) => (
              <span key={i} style={{
                fontSize: 12, padding: '5px 11px', borderRadius: 999,
                background: theme.chipBg, border: `1px solid ${theme.border}`, color: theme.textMuted,
              }}>
                <b style={{ color: theme.text }}>{w.word}</b>
                {w.meaning_ko || w.meaning ? ` — ${w.meaning_ko || w.meaning}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminReviewScreen({ theme, onEditLesson }) {
  const { user: me } = useAuth();
  const [state, setState] = React.useState({ loading: true, forbidden: false, error: null, queue: [] });
  const [selected, setSelected] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async () => {
    setState((p) => ({ ...p, loading: true, error: null, forbidden: false }));
    const res = await window.JINA_API.get('/api/admin/drafts');
    if (res.ok) setState({ loading: false, forbidden: false, error: null, queue: res.queue });
    else if (res.code === 'FORBIDDEN') setState((p) => ({ ...p, loading: false, forbidden: true }));
    else setState((p) => ({ ...p, loading: false, error: res.hint ? `${res.error} — ${res.hint}` : res.error }));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const body = state.forbidden ? (
    <div data-testid="review-forbidden" style={{ padding: 40, fontSize: 15, color: theme.textMuted }}>
      author 이상의 역할이 필요합니다
    </div>
  ) : selected ? (
    <ReviewDetail
      theme={theme} me={me} item={selected}
      onBack={() => setSelected(null)}
      onDecided={() => { setSelected(null); load(); }}
      onEditLesson={onEditLesson}
      showToast={showToast}
    />
  ) : (
    <React.Fragment>
      <div style={{ padding: '18px 26px 12px', display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>검수 대기열</h1>
        {!state.loading && <span style={{ fontSize: 12.5, color: theme.textDim }}>{state.queue.length}건</span>}
        <button onClick={load} style={{
          marginLeft: 'auto', padding: '6px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12,
          border: `1px solid ${theme.borderStrong}`, background: 'transparent', color: theme.textMuted, fontWeight: 600,
        }}>새로고침</button>
      </div>
      {state.error && (
        <div style={{
          margin: '0 26px 12px', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: theme.error + '18', border: `1px solid ${theme.error}44`, color: theme.error,
        }}>{state.error}</div>
      )}
      <div className="jina-scroll" style={{
        margin: '0 26px 24px', flex: 1, minHeight: 0, overflow: 'auto',
        border: `1px solid ${theme.border}`, borderRadius: 15, background: theme.surface,
      }}>
        {state.loading ? (
          <div style={{ padding: 40, color: theme.textDim, fontSize: 13 }}>불러오는 중…</div>
        ) : state.queue.length === 0 ? (
          <div data-testid="review-empty" style={{ padding: 40, textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
            검수 대기 중인 콘텐츠가 없습니다 — AI 카탈로그 생성이나 검수 요청이 여기로 옵니다
          </div>
        ) : (
          state.queue.map((c) => (
            <button key={c.id} data-testid="review-row" onClick={() => setSelected(c)} style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
              padding: '13px 18px', borderTop: `1px solid ${theme.border}`,
              background: 'transparent', cursor: 'pointer', color: theme.text,
            }}>
              <StatusBadge theme={theme} status="review" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: theme.textDim, marginTop: 2 }}>
                  {reviewTypeLabel(c)}{c.type === 'lesson' ? ` · 문항 ${c.question_count}` : ''}
                  {' · '}{c.created_by_email || '—'}
                  {c.draft ? ` · AI(${c.draft.provider})` : ' · 수기'}
                </span>
              </span>
              <span style={{ fontSize: 11.5, color: theme.textDim, flexShrink: 0 }}>대기 {waitedLabel(c.updated_at)}</span>
              <span style={{
                fontSize: 12, fontWeight: 700, color: theme.accent, flexShrink: 0,
              }}>검수하기 →</span>
            </button>
          ))
        )}
      </div>
    </React.Fragment>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {body}
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
