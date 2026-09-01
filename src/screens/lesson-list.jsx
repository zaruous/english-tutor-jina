// lesson-list.jsx — TOEIC 레슨 목록 뷰 (데스크탑 '목록' 버튼 / 모바일 '목록' 탭 공용). window.LessonListView
// lesson.jsx 보다 먼저 로드되어야 한다 (index.html / canvas.html 태그 순서).
//
// 데이터는 useLesson().lessons — GET /api/lessons 의 LIST_SELECT 행(kind, difficulty, est_minutes, question_count,
// attempt_count, best_correct …)을 그대로 쓰고, kind 필터는 클라이언트에서 좁힌다(파생값 저장 없음).
// 행 클릭 → select(id) 후 onPick() 으로 학습 뷰 복귀. Provider 부재(캔버스)에서는 fallback lessons 로 렌더된다.

// kind 코드 → 칩 라벨. 알 수 없는 kind 는 코드 그대로 보여준다(서버가 새 kind 를 추가해도 깨지지 않게)
function lessonKindLabel(kind) {
  if (!kind) return '기타';
  if (kind === 'toeic_lc') return 'TOEIC LC';
  const m = /^toeic_part(\d+)$/i.exec(kind);
  return m ? `TOEIC Part ${m[1]}` : kind;
}

// 목록 한 행 — title/subtitle · 난도 별 · 예상 분 · 문항 수 · 풀이 횟수 · 최고 정답(best_correct/question_count)
function LessonListRow({ theme, lesson: l, active, compact, onPick }) {
  const stars = '★'.repeat(l.difficulty || 0) + '☆'.repeat(Math.max(0, 5 - (l.difficulty || 0)));
  const attempts = l.attempt_count || 0;
  const total = l.question_count || 0;
  const best = l.best_correct != null && total ? `${l.best_correct}/${total}` : null;
  const perfect = best !== null && l.best_correct === total;
  const tag = (text, color, bg) => (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: bg, color, fontWeight: 700, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{text}</span>
  );
  return (
    <button type="button" data-testid="lesson-list-row" data-lesson-id={l.id} aria-current={active ? 'true' : undefined}
      onClick={() => onPick(l.id)} style={{
        display: 'flex', alignItems: 'center', gap: compact ? 10 : 14, width: '100%', textAlign: 'left',
        padding: compact ? '12px 14px' : '14px 18px', borderRadius: 14,
        background: active ? theme.accent + '12' : theme.card,
        border: `1.5px solid ${active ? theme.accent : theme.border}`,
        transition: 'all .15s',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
          {tag(lessonKindLabel(l.kind), theme.accent, theme.accent + '20')}
          {attempts > 0
            ? tag(`${attempts}회 풀이`, theme.textMuted, theme.chipBg)
            : tag('새 레슨', theme.accent2, theme.accent2 + '20')}
          {active && tag('학습 중', theme.bg, theme.text)}
        </div>
        {/* 좁은 화면(compact)에서는 두 줄로 감싼다 — 세트를 구분하는 subtitle 이 잘리지 않게 */}
        <div style={{ fontSize: compact ? 13.5 : 14.5, color: theme.text, fontWeight: 600, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: compact ? 'normal' : 'nowrap' }}>
          {l.title}{l.subtitle && <span style={{ color: theme.textMuted, fontWeight: 400 }}> · {l.subtitle}</span>}
        </div>
        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>난이도 {stars}</span>
          <span>· 약 {l.est_minutes ?? '-'}분</span>
          {total > 0 && <span>· {total}문항</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
        <div style={{ fontSize: 10, color: theme.textDim, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>최고 정답</div>
        <div className="jina-serif" style={{ fontSize: compact ? 16 : 18, color: best === null ? theme.textDim : perfect ? theme.success : theme.text, fontWeight: 500, lineHeight: 1.2 }}>
          {best === null ? '—' : best}
        </div>
      </div>
      <Icons.ChevronRight size={14} style={{ color: theme.textDim, flex: '0 0 auto' }} />
    </button>
  );
}

// 생성 유형 — 서버 normalizeJobInput 의 part 계약과 같은 값(5 | 'lc')을 그대로 보낸다.
// LC 는 스크립트 하나에 문항 2~4개가 실전 규격이라 선택지도 좁힌다(서버도 같은 범위로 검증).
const GEN_PARTS = [
  { id: 5, label: 'Part 5 · 문법·어휘', counts: [3, 5, 7, 10], defaultCount: 5 },
  { id: 'lc', label: 'LC · 대화·설명문', counts: [2, 3, 4], defaultCount: 3 },
];

function LessonGenerator({ theme, compact, generation, onGenerate, onDone }) {
  const [topic, setTopic] = React.useState('비즈니스 커뮤니케이션');
  const [part, setPart] = React.useState(5);
  const [difficulty, setDifficulty] = React.useState(3);
  const [count, setCount] = React.useState(5);
  const partMeta = GEN_PARTS.find((p) => p.id === part) || GEN_PARTS[0];
  const busy = generation.status === 'queued' || generation.status === 'running';
  const pickPart = (id) => {
    const meta = GEN_PARTS.find((p) => p.id === id) || GEN_PARTS[0];
    setPart(id);
    if (!meta.counts.includes(count)) setCount(meta.defaultCount);
  };
  const run = async () => {
    const res = await onGenerate({ topic, difficulty, count, part });
    if (res?.ok && res.job?.result?.lesson_id && onDone) onDone(res.job.result.lesson_id);
  };
  const inputStyle = {
    width: '100%', borderRadius: 9, border: `1px solid ${theme.border}`,
    background: theme.bg, color: theme.text, padding: '8px 10px', fontSize: 12.5,
  };
  return (
    <div data-testid="lesson-generator" style={{
      marginBottom: 14, padding: compact ? 13 : 16, borderRadius: 14,
      border: `1px solid ${theme.accent}44`, background: theme.accent + '0c',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icons.Sparkles size={17} style={{ color: theme.accent }} />
        <div>
          <div style={{ color: theme.text, fontSize: 13.5, fontWeight: 700 }}>AI로 레슨 만들기</div>
          <div style={{ color: theme.textMuted, fontSize: 10.5, marginTop: 1 }}>생성물은 먼저 내 전용 레슨으로 저장됩니다.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {GEN_PARTS.map((p) => (
          <button key={String(p.id)} type="button" data-testid={`lesson-gen-part-${p.id}`} disabled={busy}
            onClick={() => pickPart(p.id)} style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 11.5,
              fontWeight: part === p.id ? 700 : 500,
              background: part === p.id ? theme.text : theme.chipBg,
              color: part === p.id ? theme.bg : theme.textMuted,
            }}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'minmax(180px, 1fr) 120px 120px auto', gap: 8, alignItems: 'end' }}>
        <label style={{ gridColumn: compact ? '1 / -1' : undefined, fontSize: 10.5, color: theme.textMuted }}>
          주제
          <input data-testid="lesson-gen-topic" value={topic} disabled={busy}
            onChange={(e) => setTopic(e.target.value)} maxLength={80} style={{ ...inputStyle, display: 'block', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 10.5, color: theme.textMuted }}>
          난도
          <select data-testid="lesson-gen-difficulty" value={difficulty} disabled={busy}
            onChange={(e) => setDifficulty(Number(e.target.value))} style={{ ...inputStyle, display: 'block', marginTop: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
          </select>
        </label>
        <label style={{ fontSize: 10.5, color: theme.textMuted }}>
          문항 수
          <select data-testid="lesson-gen-count" value={count} disabled={busy}
            onChange={(e) => setCount(Number(e.target.value))} style={{ ...inputStyle, display: 'block', marginTop: 4 }}>
            {partMeta.counts.map((n) => <option key={n} value={n}>{n}문항</option>)}
          </select>
        </label>
        <button type="button" data-testid="lesson-gen-submit" disabled={busy || !topic.trim()} onClick={run} style={{
          minHeight: 36, padding: '8px 14px', borderRadius: 9,
          background: busy ? theme.chipBg : theme.accent, color: busy ? theme.textMuted : '#fff',
          fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          cursor: busy ? 'wait' : 'pointer', gridColumn: compact ? '1 / -1' : undefined,
        }}>
          {busy ? <><Icons.Refresh size={13} /> {generation.status === 'queued' ? '대기 중' : '생성 중'}</> : <><Icons.Sparkle size={13} /> 만들기</>}
        </button>
      </div>
      {generation.error && (
        <div data-testid="lesson-gen-error" style={{ marginTop: 10, color: theme.error, fontSize: 11.5, lineHeight: 1.45 }}>{generation.error}</div>
      )}
      {generation.status === 'succeeded' && (
        <div data-testid="lesson-gen-success" style={{ marginTop: 10, color: theme.success, fontSize: 11.5, fontWeight: 600 }}>
          검증을 통과한 새 레슨이 내 목록에 추가되었습니다.
        </div>
      )}
    </div>
  );
}

function LessonListView({ theme, compact = false, onPick, onClose }) {
  const { lessons, currentId, select, listLoading, error, progress, generation, generateLesson } = useLesson();
  const [kind, setKind] = React.useState('all');
  const [showGenerator, setShowGenerator] = React.useState(false);
  const kinds = React.useMemo(() => [...new Set(lessons.map((l) => l.kind).filter(Boolean))], [lessons]);
  // 고른 kind 가 목록에서 사라지면(재로드) '전체'로 되돌린다
  React.useEffect(() => { if (kind !== 'all' && !kinds.includes(kind)) setKind('all'); }, [kind, kinds]);
  const visible = kind === 'all' ? lessons : lessons.filter((l) => l.kind === kind);
  const chips = [{ id: 'all', label: '전체' }, ...kinds.map((k) => ({ id: k, label: lessonKindLabel(k) }))];

  const pick = (id) => {
    select(id);
    if (onPick) onPick(id);
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', background: theme.bg, padding: compact ? '14px 14px 80px' : '24px 28px 40px' }}>
      <div style={{ maxWidth: compact ? '100%' : 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compact ? 12 : 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: compact ? 15 : 17, fontWeight: 700, color: theme.text }}>레슨 목록</h3>
            <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>
              {/* 진도는 서버 집계(progress) — 목록의 attempt_count 와 같은 소스 */}
              {lessons.length}개 레슨 · {progress.done}/{progress.total} 완료
            </div>
          </div>
          {!window.JINA_READONLY && (
            <button type="button" data-testid="lesson-generator-toggle" onClick={() => setShowGenerator((v) => !v)} aria-pressed={showGenerator} style={{
              padding: '8px 11px', borderRadius: 10, background: showGenerator ? theme.accent : theme.accent + '18',
              color: showGenerator ? '#fff' : theme.accent, fontSize: 12, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <Icons.Sparkles size={13} /> AI 생성
            </button>
          )}
          {onClose && (
            <button type="button" data-testid="lesson-list-close" onClick={onClose} style={{
              padding: '8px 12px', borderRadius: 10, background: theme.chipBg, color: theme.text,
              fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              학습으로 돌아가기 <Icons.ArrowRight size={13} />
            </button>
          )}
        </div>

        {showGenerator && (
          <LessonGenerator theme={theme} compact={compact} generation={generation}
            onGenerate={generateLesson} onDone={(id) => { setShowGenerator(false); if (onPick) onPick(id); }} />
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: compact ? 12 : 16 }}>
          {chips.map((c) => {
            const on = kind === c.id;
            return (
              <button key={c.id} type="button" data-testid="lesson-kind-filter" data-kind={c.id} aria-pressed={on}
                onClick={() => setKind(c.id)} style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: on ? theme.text : theme.chipBg, color: on ? theme.bg : theme.textMuted,
                  border: `1px solid ${on ? theme.text : theme.border}`,
                }}>
                {c.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5, marginBottom: 10, background: theme.error + '18', border: `1px solid ${theme.error}55`, color: theme.text }}>{error}</div>
        )}
        {listLoading && lessons.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: theme.textMuted }}>레슨 목록을 불러오는 중…</div>
        )}
        {!listLoading && visible.length === 0 && (
          <div data-testid="lesson-list-empty" style={{ padding: 24, textAlign: 'center', fontSize: 13, color: theme.textMuted }}>표시할 레슨이 없어요</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((l) => (
            <LessonListRow key={l.id} theme={theme} lesson={l} active={l.id === currentId} compact={compact} onPick={pick} />
          ))}
        </div>
      </div>
    </div>
  );
}

window.LessonListView = LessonListView;
window.lessonKindLabel = lessonKindLabel;
