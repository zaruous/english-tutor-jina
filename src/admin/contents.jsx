// contents.jsx — 관리자 · 콘텐츠 목록/상태 전이 (플랜 11 Phase 2) + 레슨 에디터 (플랜 13 Phase A).
// 시각 규칙은 users.jsx 와 같다 — theme.* 인라인 스타일, 상태 색: 공개 success · 검토 warning ·
// 초안 textDim · 내림 error. useDismissMenu · readThemeName 등 공용 헬퍼는 users.jsx 가 정의한다.
//
// 검증 규칙의 단일 소스는 서버다(플랜 13 결정 2) — 저장이 422 로 거부되면 돌려받은
// validation_errors 를 그대로 렌더할 뿐, 클라이언트에서 같은 규칙을 다시 판정하지 않는다.

const STATUS_META = {
  draft: { label: '초안', tone: 'textDim', dot: '○' },
  review: { label: '검토', tone: 'warning', dot: '◐' },
  published: { label: '공개', tone: 'success', dot: '●' },
  archived: { label: '내림', tone: 'error', dot: '◌' },
};
const CONTENT_TYPE_LABELS = { lesson: '레슨', scenario: '회화', vocab_set: '단어' };
const KIND_LABELS = { toeic_part5: 'Part 5', toeic_part7: 'Part 7', toeic_lc: 'LC' };
const SKILL_CODES = ['grammar', 'vocab', 'detail', 'inference', 'main_idea'];

function statusColor(theme, status) {
  return theme[STATUS_META[status]?.tone || 'textMuted'] || theme.textMuted;
}

function StatusBadge({ theme, status }) {
  const meta = STATUS_META[status] || { label: status, dot: '·' };
  const color = statusColor(theme, status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color,
    }}>
      <span>{meta.dot}</span>{meta.label}
    </span>
  );
}

// 상태 → 메뉴 항목. 라벨만 여기 있고 판정은 서버(canTransition)가 한다 —
// 역할이 모자라면 서버가 403 을 주고 토스트로 그대로 보인다.
function transitionActions(row, me) {
  const canReview = Boolean(me?.can_review);
  const acts = [];
  if (row.status === 'draft') {
    acts.push({ kind: 'status', to: 'review', label: '검수 요청' });
    if (canReview) acts.push({ kind: 'status', to: 'published', label: '발행 (검수 생략)' });
  } else if (row.status === 'review') {
    if (canReview) {
      acts.push({ kind: 'status', to: 'published', label: '승인 → 발행' });
      acts.push({ kind: 'status', to: 'draft', label: '반려 → 초안', needNote: true });
    }
  } else if (row.status === 'published') {
    if (canReview) acts.push({ kind: 'status', to: 'archived', label: '내리기' });
  } else if (row.status === 'archived') {
    if (canReview) acts.push({ kind: 'status', to: 'published', label: '다시 올리기' });
  }
  if (canReview && (row.status === 'published' || row.status === 'archived' || row.visibility === 'public')) {
    acts.push({
      kind: 'visibility',
      to: row.visibility === 'public' ? 'private' : 'public',
      label: row.visibility === 'public' ? '비공개로 전환' : '전체 공개로 전환',
    });
  }
  return acts;
}

function ContentRowMenu({ theme, row, me, busy, onAction, onEdit }) {
  const [open, setOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState({ right: 0, top: 0, bottom: 0, dropUp: false });
  const ref = React.useRef(null);
  useDismissMenu(open, setOpen, ref);

  const acts = transitionActions(row, me);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        data-testid="content-kebab"
        onClick={(e) => {
          const next = !open;
          if (next) {
            const r = e.currentTarget.getBoundingClientRect();
            const below = window.innerHeight - r.bottom - 8;
            const dropUp = below < 160;
            setMenuPos({
              right: window.innerWidth - r.right,
              top: r.bottom + 4,
              bottom: window.innerHeight - r.top + 4,
              dropUp,
            });
          }
          setOpen(next);
        }}
        style={{
          width: 30, height: 30, borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
          display: 'grid', placeItems: 'center', color: theme.textMuted, fontSize: 13, cursor: 'pointer',
          background: 'transparent',
        }}
      >▾</button>
      {open && (
        <div data-testid="content-kebab-menu" style={{
          position: 'fixed', zIndex: 200, minWidth: 180, right: menuPos.right,
          ...(menuPos.dropUp ? { bottom: menuPos.bottom } : { top: menuPos.top }),
          background: theme.surfaceElev, border: `1px solid ${theme.borderStrong}`,
          borderRadius: 10, boxShadow: theme.shadow, padding: 4,
        }}>
          {row.type === 'lesson' && (
            <button disabled={busy} onClick={() => { setOpen(false); onEdit(row); }} style={{
              width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, color: theme.text, background: 'transparent', cursor: 'pointer',
            }}>수정</button>
          )}
          {acts.map((a) => (
            <button key={`${a.kind}-${a.to}`} disabled={busy}
              onClick={() => { setOpen(false); onAction(row, a); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, color: theme.text, background: 'transparent', cursor: 'pointer',
              }}>{a.label}</button>
          ))}
          {acts.length === 0 && row.type !== 'lesson' && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: theme.textDim }}>가능한 조작 없음</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 레슨 에디터 (플랜 13 Phase A 최소형) ────────────────────────────────────
// LC 스크립트는 화자 토글 + 본문 필드(열린 질문 5 — [{speaker,text}] 스키마와 맞는 쪽)로 편집한다.

const EMPTY_ITEM = () => ({
  stem: '', options: { A: '', B: '', C: '', D: '' }, answer: 'A', explanation: '', skill_code: '',
});

function emptyForm(kind = 'toeic_part5') {
  return {
    kind, title: '', subtitle: '', difficulty: 3, est_minutes: '',
    subject: '', passageType: '', from: '', to: '', cc: '', date: '', bodyText: '',
    script: [
      { speaker: 'M', text: '' }, { speaker: 'W', text: '' },
      { speaker: 'M', text: '' }, { speaker: 'W', text: '' },
    ],
    items: [EMPTY_ITEM()],
    vocab: [], faq: [], // v1 에디터는 손대지 않고 실어 나른다
  };
}

function formFromContent(content) {
  const d = content.detail || {};
  const passage = d.passage || {};
  const isLc = d.kind === 'toeic_lc';
  const body = Array.isArray(passage.body) ? passage.body : [];
  return {
    kind: d.kind || 'toeic_part5',
    title: content.title || '',
    subtitle: d.subtitle || '',
    difficulty: content.difficulty || 3,
    est_minutes: d.est_minutes ?? '',
    subject: passage.subject || '',
    passageType: passage.type || '',
    from: passage.from || '', to: passage.to || '', cc: passage.cc || '', date: passage.date || '',
    bodyText: isLc ? '' : body.filter((p) => typeof p === 'string').join('\n'),
    script: isLc
      ? body.map((l) => ({ speaker: l?.speaker === 'W' ? 'W' : 'M', text: l?.text || '' }))
      : emptyForm().script,
    items: (content.items || []).map((i) => ({
      stem: i.stem,
      options: Object.fromEntries(['A', 'B', 'C', 'D'].map((id) => [
        id, (i.options || []).find((o) => o.id === id)?.text || '',
      ])),
      answer: i.answer || 'A',
      explanation: i.explanation || '',
      skill_code: i.skill_code || '',
    })),
    vocab: d.vocab || [], faq: d.faq || [],
  };
}

function payloadFromForm(form) {
  const isLc = form.kind === 'toeic_lc';
  const passage = isLc
    ? { type: 'LISTENING', subject: form.subject || 'Short Conversation', body: form.script }
    : form.kind === 'toeic_part5'
      ? {
        type: form.passageType || 'PART 5', subject: form.subject || 'Incomplete Sentences',
        body: form.bodyText.split('\n').map((s) => s.trim()).filter(Boolean),
      }
      : {
        type: form.passageType || 'E-MAIL',
        ...(form.from ? { from: form.from } : {}), ...(form.to ? { to: form.to } : {}),
        ...(form.cc ? { cc: form.cc } : {}), ...(form.date ? { date: form.date } : {}),
        subject: form.subject,
        body: form.bodyText.split('\n').map((s) => s.trim()).filter(Boolean),
      };
  return {
    kind: form.kind,
    title: form.title,
    subtitle: form.subtitle,
    difficulty: Number(form.difficulty),
    ...(form.est_minutes !== '' ? { est_minutes: Number(form.est_minutes) } : {}),
    passage,
    vocab: form.vocab, faq: form.faq,
    items: form.items.map((i) => ({
      stem: i.stem,
      options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: i.options[id] })),
      answer: i.answer,
      explanation: i.explanation,
      ...(i.skill_code ? { skill_code: i.skill_code } : {}),
    })),
  };
}

function Field({ theme, label, children, width }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.textDim, letterSpacing: '0.04em' }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(theme) {
  return {
    padding: '8px 11px', borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
    background: theme.card, color: theme.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
    width: '100%',
  };
}

function LessonEditor({ theme, me, contentId, onDone, onCancel, showToast }) {
  const isNew = contentId == null;
  const [form, setForm] = React.useState(() => emptyForm());
  const [meta, setMeta] = React.useState(null);          // 기존 콘텐츠의 status/slug 표시용
  const [loading, setLoading] = React.useState(!isNew);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState([]);        // 서버 validation_errors 그대로

  React.useEffect(() => {
    if (isNew) return;
    let alive = true;
    (async () => {
      const res = await window.JINA_API.get(`/api/admin/contents/${contentId}`);
      if (!alive) return;
      if (res.ok && res.content.type === 'lesson') {
        setForm(formFromContent(res.content));
        setMeta(res.content);
        setLoading(false);
      } else {
        showToast(res.error || '레슨을 불러오지 못했습니다', true);
        onCancel();
      }
    })();
    return () => { alive = false; };
  }, [contentId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (idx, patch) => setForm((f) => ({
    ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
  }));
  const isLc = form.kind === 'toeic_lc';

  const save = async () => {
    setSaving(true);
    setErrors([]);
    const payload = payloadFromForm(form);
    const res = isNew
      ? await window.JINA_API.post('/api/admin/contents/lesson', payload)
      : await window.JINA_API.patch(`/api/admin/contents/lesson/${contentId}`, payload);
    setSaving(false);
    if (res.ok) {
      showToast(isNew ? '레슨을 초안으로 저장했습니다' : '레슨을 수정했습니다');
      onDone(res.content);
    } else if (res.validation_errors) {
      setErrors(res.validation_errors);
    } else {
      showToast(res.hint ? `${res.error} — ${res.hint}` : (res.error || '저장 실패'), true);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, color: theme.textMuted, fontSize: 14 }}>불러오는 중…</div>;
  }

  return (
    <div className="jina-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 26px 40px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onCancel} style={{
          padding: '7px 13px', borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
          background: 'transparent', color: theme.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>← 목록</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          {isNew ? '새 레슨 만들기' : '레슨 수정'}
        </h1>
        {meta && <StatusBadge theme={theme} status={meta.status} />}
        {meta && (
          <span style={{ fontSize: 11.5, color: theme.textDim, fontFamily: 'ui-monospace, Consolas, monospace' }}>
            {meta.slug}
          </span>
        )}
        <button data-testid="lesson-save" disabled={saving} onClick={save} style={{
          marginLeft: 'auto', padding: '9px 20px', borderRadius: 10, border: 'none', cursor: saving ? 'wait' : 'pointer',
          background: theme.accent, color: '#fff', fontSize: 13, fontWeight: 700,
        }}>{saving ? '저장 중…' : isNew ? '초안으로 저장' : '저장'}</button>
      </div>
      {isNew && (
        <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 14 }}>
          새 레슨은 항상 <b style={{ color: theme.textMuted }}>초안(비공개)</b>으로 저장됩니다 —
          발행·공개는 목록의 [▾] 메뉴에서 따로 합니다.
        </div>
      )}

      {/* 서버 검증 오류 — 목업의 하단 빨간 띠. 이 화면은 렌더만 한다. */}
      {errors.length > 0 && (
        <div data-testid="lesson-validation-errors" style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: theme.error + '18', border: `1px solid ${theme.error}55`,
          color: theme.error, fontSize: 12.5, fontWeight: 600, lineHeight: 1.8,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>저장이 거부되었습니다 — 서버 검증 오류 {errors.length}건</div>
          {errors.map((e, i) => <div key={i}>· {e}</div>)}
        </div>
      )}

      {/* 기본 정보 */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16, borderRadius: 14,
        border: `1px solid ${theme.border}`, background: theme.surface, marginBottom: 14,
      }}>
        <Field theme={theme} label="유형" width={130}>
          <select value={form.kind} disabled={!isNew}
            onChange={(e) => set({ kind: e.target.value })} style={inputStyle(theme)}>
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field theme={theme} label="제목" width={320}>
          <input data-testid="lesson-title" value={form.title} onChange={(e) => set({ title: e.target.value })}
            placeholder="예: TOEIC LC — 짧은 대화 Set 3" style={inputStyle(theme)} />
        </Field>
        <Field theme={theme} label="부제" width={260}>
          <input value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} style={inputStyle(theme)} />
        </Field>
        <Field theme={theme} label="난이도 (1~5)" width={100}>
          <select value={form.difficulty} onChange={(e) => set({ difficulty: Number(e.target.value) })} style={inputStyle(theme)}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field theme={theme} label="예상 분 (비우면 자동)" width={130}>
          <input value={form.est_minutes} inputMode="numeric"
            onChange={(e) => set({ est_minutes: e.target.value.replace(/[^0-9]/g, '') })} style={inputStyle(theme)} />
        </Field>
      </div>

      {/* 지문/스크립트 */}
      <div style={{
        padding: 16, borderRadius: 14, border: `1px solid ${theme.border}`,
        background: theme.surface, marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
          {isLc ? '스크립트 (화자 M/W · 4~8줄)' : '지문'}
        </div>
        {isLc ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.script.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => set({
                    script: form.script.map((l, j) => (j === i ? { ...l, speaker: l.speaker === 'M' ? 'W' : 'M' } : l)),
                  })}
                  title="화자 전환"
                  style={{
                    width: 38, height: 34, borderRadius: 9, flexShrink: 0, cursor: 'pointer',
                    border: `1px solid ${theme.borderStrong}`, fontWeight: 800, fontSize: 12.5,
                    background: line.speaker === 'M' ? theme.accent + '22' : theme.warning + '22',
                    color: line.speaker === 'M' ? theme.accent : theme.warning,
                  }}
                >{line.speaker}</button>
                <input value={line.text}
                  placeholder="대사 (12자 이상, 괄호 지시문 금지)"
                  onChange={(e) => set({
                    script: form.script.map((l, j) => (j === i ? { ...l, text: e.target.value } : l)),
                  })}
                  style={inputStyle(theme)} />
                <button disabled={form.script.length <= 1}
                  onClick={() => set({ script: form.script.filter((_, j) => j !== i) })}
                  style={{
                    width: 30, height: 30, borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
                    background: 'transparent', color: theme.textDim, cursor: 'pointer', flexShrink: 0,
                  }}>✕</button>
              </div>
            ))}
            <button disabled={form.script.length >= 8}
              onClick={() => set({
                script: [...form.script, { speaker: form.script.length % 2 === 0 ? 'M' : 'W', text: '' }],
              })}
              style={{
                alignSelf: 'flex-start', padding: '7px 13px', borderRadius: 9, cursor: 'pointer',
                border: `1px dashed ${theme.borderStrong}`, background: 'transparent',
                color: theme.textMuted, fontSize: 12.5, fontWeight: 600,
              }}>+ 줄 추가</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Field theme={theme} label="지문 유형" width={150}>
                <input value={form.passageType} placeholder={form.kind === 'toeic_part5' ? 'PART 5' : 'E-MAIL'}
                  onChange={(e) => set({ passageType: e.target.value })} style={inputStyle(theme)} />
              </Field>
              <Field theme={theme} label="제목 (subject)" width={300}>
                <input value={form.subject} onChange={(e) => set({ subject: e.target.value })} style={inputStyle(theme)} />
              </Field>
              {form.kind === 'toeic_part7' && (
                <React.Fragment>
                  <Field theme={theme} label="보낸 사람" width={200}>
                    <input value={form.from} onChange={(e) => set({ from: e.target.value })} style={inputStyle(theme)} />
                  </Field>
                  <Field theme={theme} label="받는 사람" width={200}>
                    <input value={form.to} onChange={(e) => set({ to: e.target.value })} style={inputStyle(theme)} />
                  </Field>
                  <Field theme={theme} label="CC" width={160}>
                    <input value={form.cc} onChange={(e) => set({ cc: e.target.value })} style={inputStyle(theme)} />
                  </Field>
                  <Field theme={theme} label="날짜" width={180}>
                    <input value={form.date} onChange={(e) => set({ date: e.target.value })} style={inputStyle(theme)} />
                  </Field>
                </React.Fragment>
              )}
            </div>
            <Field theme={theme} label={form.kind === 'toeic_part5' ? '안내문 (줄 = 문단)' : '본문 (줄 = 문단)'}>
              <textarea value={form.bodyText} rows={form.kind === 'toeic_part5' ? 3 : 8}
                onChange={(e) => set({ bodyText: e.target.value })}
                style={{ ...inputStyle(theme), resize: 'vertical', lineHeight: 1.6 }} />
            </Field>
          </div>
        )}
      </div>

      {/* 문항 */}
      <div style={{
        padding: 16, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>문항 ({form.items.length})</span>
          <span style={{ marginLeft: 12, fontSize: 11.5, color: theme.textDim }}>
            보기 A~D 4개 · 해설에 정답 표기 「({'{정답}'})」 포함 — 예: “정답은 (B) …”
          </span>
          <button data-testid="item-add"
            onClick={() => set({ items: [...form.items, EMPTY_ITEM()] })}
            style={{
              marginLeft: 'auto', padding: '7px 13px', borderRadius: 9, cursor: 'pointer',
              border: `1px dashed ${theme.borderStrong}`, background: 'transparent',
              color: theme.textMuted, fontSize: 12.5, fontWeight: 600,
            }}>+ 문항 추가</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {form.items.map((item, idx) => (
            <div key={idx} style={{
              padding: 14, borderRadius: 12, border: `1px solid ${theme.borderStrong}`, background: theme.card,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: theme.accent }}>Q{idx + 1}</span>
                <select value={item.skill_code}
                  onChange={(e) => setItem(idx, { skill_code: e.target.value })}
                  style={{ ...inputStyle(theme), width: 140, padding: '6px 9px', fontSize: 12 }}>
                  <option value="">스킬 없음</option>
                  {SKILL_CODES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button disabled={form.items.length <= 1}
                  onClick={() => set({ items: form.items.filter((_, j) => j !== idx) })}
                  style={{
                    marginLeft: 'auto', width: 28, height: 28, borderRadius: 8,
                    border: `1px solid ${theme.borderStrong}`, background: 'transparent',
                    color: theme.textDim, cursor: 'pointer',
                  }}>✕</button>
              </div>
              <textarea value={item.stem} rows={2} placeholder="문제 (stem)"
                onChange={(e) => setItem(idx, { stem: e.target.value })}
                style={{ ...inputStyle(theme), resize: 'vertical', marginBottom: 10, lineHeight: 1.6 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {['A', 'B', 'C', 'D'].map((id) => (
                  <div key={id} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <button
                      onClick={() => setItem(idx, { answer: id })}
                      title="정답으로 지정"
                      style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                        fontSize: 12, fontWeight: 800,
                        border: `1px solid ${item.answer === id ? theme.success : theme.borderStrong}`,
                        background: item.answer === id ? theme.success + '26' : 'transparent',
                        color: item.answer === id ? theme.success : theme.textDim,
                      }}
                    >{id}</button>
                    <input value={item.options[id]} placeholder={`보기 ${id}`}
                      onChange={(e) => setItem(idx, { options: { ...item.options, [id]: e.target.value } })}
                      style={inputStyle(theme)} />
                  </div>
                ))}
              </div>
              <textarea value={item.explanation} rows={2}
                placeholder={`해설 — 정답 표기 (${item.answer}) 를 포함해야 합니다`}
                onChange={(e) => setItem(idx, { explanation: e.target.value })}
                style={{ ...inputStyle(theme), resize: 'vertical', lineHeight: 1.6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 목록 화면 ────────────────────────────────────────────────────────────────

function AdminContentsScreen({ theme }) {
  const { user: me } = useAuth();
  const [state, setState] = React.useState({
    loading: true, forbidden: false, error: null,
    contents: [], total: 0, counts: {},
    type: '', status: '', q: '',
  });
  const [view, setView] = React.useState({ mode: 'list' }); // list | new | edit
  const [toast, setToast] = React.useState(null);
  const [rowBusy, setRowBusy] = React.useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async (type, status, q) => {
    setState((p) => ({ ...p, loading: true, error: null, forbidden: false }));
    const qs = new URLSearchParams();
    if (type) qs.set('type', type);
    if (status) qs.set('status', status);
    if (q) qs.set('q', q);
    const res = await window.JINA_API.get(`/api/admin/contents${qs.toString() ? `?${qs}` : ''}`);
    if (res.ok) {
      setState((p) => ({
        ...p, loading: false,
        contents: res.contents, total: res.total, counts: res.counts || {},
      }));
    } else if (res.code === 'FORBIDDEN') {
      setState((p) => ({ ...p, loading: false, forbidden: true }));
    } else {
      setState((p) => ({
        ...p, loading: false,
        error: res.hint ? `${res.error} — ${res.hint}` : res.error,
      }));
    }
  }, []);

  React.useEffect(() => {
    if (view.mode === 'list') load(state.type, state.status, state.q);
  }, [load, state.type, state.status, state.q, view.mode]);

  const runAction = async (row, act) => {
    let note;
    if (act.needNote) {
      note = window.prompt('반려 사유를 입력하세요 (감사 로그에 남습니다)');
      if (note === null) return;
    }
    setRowBusy(row.id);
    const res = act.kind === 'status'
      ? await window.JINA_API.post(`/api/admin/contents/${row.id}/status`, { to: act.to, ...(note ? { note } : {}) })
      : await window.JINA_API.post(`/api/admin/contents/${row.id}/visibility`, { to: act.to });
    setRowBusy(null);
    if (res.ok) {
      setState((p) => ({
        ...p,
        contents: p.contents.map((c) => (c.id === row.id ? { ...c, ...res.content } : c)),
      }));
      showToast(`${row.title} — ${act.label} 완료`);
      load(state.type, state.status, state.q);
    } else {
      showToast(res.error || '조작 실패', true);
    }
  };

  if (view.mode === 'new' || view.mode === 'edit') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <LessonEditor
          theme={theme} me={me}
          contentId={view.mode === 'edit' ? view.id : null}
          showToast={showToast}
          onDone={() => setView({ mode: 'list' })}
          onCancel={() => setView({ mode: 'list' })}
        />
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

  // 상태 · 제목 · 유형 · 문항 · 소스 · 공개범위 · 수정일 · [▾]
  const gridCols = '76px 1fr 90px 56px 76px 84px 88px 40px';
  const statusChips = ['draft', 'review', 'published', 'archived'];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {state.forbidden ? (
        <div data-testid="contents-forbidden" style={{ padding: 40, fontSize: 15, color: theme.textMuted }}>
          author 이상의 역할이 필요합니다 — 관리자에게 역할을 요청하세요
        </div>
      ) : (
        <React.Fragment>
          {state.error && (
            <div style={{
              margin: '12px 26px 0', padding: '10px 14px', borderRadius: 10,
              background: theme.error + '18', border: `1px solid ${theme.error}44`,
              color: theme.error, fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ flex: 1 }}>{state.error}</span>
              <button onClick={() => load(state.type, state.status, state.q)} style={{
                padding: '6px 12px', borderRadius: 8, background: theme.error, color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>재시도</button>
            </div>
          )}

          {/* 헤더 + 상태 칩 */}
          <div style={{
            padding: '18px 26px 0', display: 'flex', alignItems: 'flex-end',
            justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>콘텐츠</h1>
              {!state.loading && (
                <span style={{ fontSize: 12.5, color: theme.textDim }}>
                  {state.contents.length === state.total
                    ? `${state.total}건`
                    : `${state.total}건 중 ${state.contents.length}건`}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 7, paddingBottom: 4, alignItems: 'center' }}>
              {statusChips.map((s) => (
                <button key={s} data-testid={`status-chip-${s}`}
                  onClick={() => setState((p) => ({ ...p, status: p.status === s ? '' : s }))}
                  style={{
                    padding: '6px 13px', borderRadius: 9, cursor: 'pointer',
                    background: state.status === s ? theme.accent + '18' : theme.surface,
                    border: `1px solid ${state.status === s ? theme.accent : theme.border}`,
                    fontSize: 12, color: theme.textMuted,
                  }}>
                  {STATUS_META[s].label}{' '}
                  <b style={{ fontWeight: 700, color: statusColor(theme, s) }}>{state.counts[s] ?? 0}</b>
                </button>
              ))}
              <button data-testid="lesson-new" onClick={() => setView({ mode: 'new' })} style={{
                marginLeft: 8, padding: '8px 15px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: theme.accent, color: '#fff', fontSize: 12.5, fontWeight: 700,
              }}>+ 새 레슨</button>
            </div>
          </div>

          {/* 필터 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '15px 26px 13px', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, background: theme.card,
              border: `1px solid ${theme.borderStrong}`, borderRadius: 10, padding: '8px 13px', width: 262,
            }}>
              <input
                data-testid="content-search"
                value={state.q}
                onChange={(e) => setState((p) => ({ ...p, q: e.target.value }))}
                placeholder="제목 · slug 검색"
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  color: theme.text, fontSize: 12.5, fontFamily: 'inherit',
                }}
              />
            </div>
            {['', 'lesson', 'scenario', 'vocab_set'].map((t) => {
              const active = state.type === t;
              return (
                <button key={t || 'all'} data-testid={t ? `type-${t}` : 'type-all'}
                  onClick={() => setState((p) => ({ ...p, type: t }))}
                  style={{
                    padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: active ? theme.accent + '22' : theme.chipBg,
                    border: `1px solid ${active ? theme.accent : theme.border}`,
                    color: active ? theme.accent : theme.textMuted,
                  }}>{t ? CONTENT_TYPE_LABELS[t] : '전체'}</button>
              );
            })}
          </div>

          {/* 표 */}
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
              <span>상태</span><span>제목</span><span>유형</span>
              <span style={{ textAlign: 'right' }}>문항</span>
              <span>소스</span><span>공개범위</span><span>수정일</span><span />
            </div>
            {state.loading ? (
              <div data-testid="contents-skeleton" style={{ padding: 40, color: theme.textDim, fontSize: 13 }}>
                불러오는 중…
              </div>
            ) : state.contents.length === 0 ? (
              <div data-testid="contents-empty" style={{ padding: 40, textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
                콘텐츠가 없습니다
              </div>
            ) : (
              state.contents.map((c) => (
                <div key={c.id} data-testid="content-row" style={{
                  display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', gap: 12,
                  padding: '0 18px', height: 58, borderTop: `1px solid ${theme.border}`,
                }}>
                  <StatusBadge theme={theme} status={c.status} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{c.title}</div>
                    <div style={{
                      fontSize: 11, color: theme.textDim,
                      fontFamily: 'ui-monospace, Consolas, monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{c.slug}</div>
                  </div>
                  <span style={{ fontSize: 12.5, color: theme.textMuted }}>
                    {CONTENT_TYPE_LABELS[c.type] || c.type}
                    {c.kind ? ` · ${KIND_LABELS[c.kind] || c.kind}` : ''}
                  </span>
                  <span style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'right' }}>
                    {c.type === 'lesson' ? c.question_count : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: theme.textDim }}>{c.source}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: c.visibility === 'public' ? theme.success : theme.textDim,
                  }}>{c.visibility === 'public' ? '전체 공개' : '비공개'}</span>
                  <span style={{ fontSize: 12.5, color: theme.textMuted }}>{fmtDate(c.updated_at)}</span>
                  <ContentRowMenu
                    theme={theme} row={c} me={me} busy={rowBusy === c.id}
                    onAction={runAction}
                    onEdit={(row) => setView({ mode: 'edit', id: row.id })}
                  />
                </div>
              ))
            )}
          </div>

          {/* 하단 안내 */}
          <div style={{ padding: '13px 26px 24px', fontSize: 11.5, color: theme.textDim, lineHeight: 1.7 }}>
            전이마다 <b style={{ color: theme.textMuted }}>content_audit_log</b> 에 1행이 남습니다.
            내리기(archived)는 공개범위를 건드리지 않아 다시 올리면 원래 보이던 사람에게 그대로 돌아갑니다.
            발행(published) 후 <b style={{ color: theme.textMuted }}>전체 공개</b>로 전환해야 학습자에게 보입니다.
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
