// listening.jsx — 리스닝(LC 연습) 화면 (Desktop + Mobile) · 플랜 08 Phase B 화면부
// 레슨 엔진 재사용: 콘텐츠는 lessons.kind='toeic_lc' 이고, 문항·채점·저장은 기존 레슨 API 그대로다
// (GET /api/lessons?kind=toeic_lc → GET /api/lessons/:id → POST /api/lessons/:id/attempts).
// 이 화면은 지문 컬럼만 '재생 카드'로 바꾼다:
//   - 재생 = jinaSpeak(script, {rate}) 기기 TTS. 속도 칩·재생 횟수 표시.
//   - 미제출 구간에는 스크립트를 렌더하지 않는다(잠금 카드). 제출 후 공개 — 플랜 08 §0 결정 2.
//   - 문항 컬럼은 스크롤 + 채점 버튼은 하단 고정 바(문항 3개가 한 화면에 안 들어온다).
// v1은 '연습 모드'다: 클라이언트 TTS 로 읽으려면 스크립트가 브라우저에 와야 하므로 완전 비노출은
// 불가하고, 화면에 렌더하지 않는 수준만 보장한다(시험 모드=서버 TTS 는 후속).
const LC_RATES = [0.8, 1.0, 1.2];

// LC 스크립트의 출처 — 서버가 script(연습 모드 재생용)를 주면 그것, 아니면 passage.body.
// passage.body 는 화자 라벨이 붙은 줄 배열(["W: …", "M: …"]) 이라 줄바꿈으로 잇는다.
const lcScript = (lesson) => {
  const raw = lesson?.script ?? lesson?.passage?.body ?? '';
  return Array.isArray(raw) ? raw.join('\n') : String(raw);
};

function useListening() {
  const [state, setState] = React.useState({ lessons: [], loading: true, error: null });
  const [currentId, setCurrentId] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [answers, setAnswers] = React.useState({});
  const [result, setResult] = React.useState(null);
  const [grading, setGrading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    window.JINA_API.get('/api/lessons?kind=toeic_lc').then((res) => {
      if (cancelled) return;
      setState(res.ok
        ? { lessons: res.lessons || [], loading: false, error: null }
        : { lessons: [], loading: false, error: res.hint ? `${res.error} — ${res.hint}` : res.error });
      if (res.ok && res.lessons?.length) setCurrentId(res.lessons[0].id);
    });
    return () => { cancelled = true; };
  }, []);

  const select = React.useCallback(async (id) => {
    setCurrentId(id);
    setAnswers({});
    setResult(null);
    setDetailLoading(true);
    const res = await window.JINA_API.get(`/api/lessons/${id}`);
    setDetail(res.ok ? res.lesson : null);
    setDetailLoading(false);
  }, []);

  React.useEffect(() => { if (currentId) select(currentId); }, [currentId]); // eslint-disable-line

  const submit = React.useCallback(async () => {
    if (!detail) return null;
    setGrading(true);
    const res = await window.JINA_API.post(`/api/lessons/${detail.id}/attempts`, {
      answers, client_request_id: crypto.randomUUID(),
    });
    setGrading(false);
    if (res.ok) setResult(res);
    return res;
  }, [detail, answers]);

  const retake = React.useCallback(() => { setAnswers({}); setResult(null); }, []);

  return {
    ...state, currentId, detail, detailLoading, answers, result, grading,
    select, setAnswers, submit, retake,
  };
}

// 재생 카드 — 지문 컬럼 자리를 대신한다.
function LcPlayer({ theme, lesson, revealed, compact = false }) {
  const [rate, setRate] = React.useState(1.0);
  const [plays, setPlays] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const script = lcScript(lesson);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // 문항이 바뀌면 재생 횟수를 초기화한다 (레슨 단위 카운트)
  React.useEffect(() => { setPlays(0); setPlaying(false); }, [lesson?.id]);

  const play = () => {
    if (!script || playing) return;
    // 화자 라벨("M: "/"W: ")은 화면 표시용이지 대사가 아니다 — TTS 가 "더블유"를 읽지 않게
    // 재생 시에만 뗀다 (speaking.service.js 의 문장 은행과 같은 규칙).
    const ok = window.jinaSpeak(script.replace(/^[MW]:\s*/gm, ''), {
      rate,
      onStart: () => setPlaying(true),
      onEnd: () => setPlaying(false),
    });
    if (ok) setPlays((n) => n + 1);
  };

  return (
    <div style={{
      background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 20,
      padding: compact ? '24px 20px' : '32px 28px', textAlign: 'center', boxShadow: theme.shadow,
    }}>
      <div style={{
        fontSize: 11, color: theme.textDim, fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14,
      }}>대화 듣기</div>

      <button data-testid="lc-play" onClick={play} disabled={!supported || !script} aria-label="대화 재생" style={{
        width: 84, height: 84, borderRadius: '50%', margin: '4px auto 16px',
        background: supported && script ? theme.accentGrad : theme.chipBg,
        color: '#fff', display: 'grid', placeItems: 'center',
        boxShadow: supported && script ? '0 12px 40px -10px rgba(159,122,234,0.55)' : 'none',
        opacity: playing ? 0.75 : 1,
      }}>
        {playing ? <Icons.Pause size={28} /> : <Icons.Play size={30} />}
      </button>

      <div data-testid="lc-plays" style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 14 }}>
        재생 <b style={{ color: theme.text }}>{plays}회</b> · 실전처럼 2회 안에 풀어보세요
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
        {LC_RATES.map((r) => (
          <button key={r} data-testid={`lc-rate-${r}`} onClick={() => setRate(r)} style={{
            padding: '6px 13px', borderRadius: 999,
            background: rate === r ? theme.text : theme.chipBg,
            color: rate === r ? theme.bg : theme.textMuted,
            fontSize: 12.5, fontWeight: rate === r ? 700 : 500,
          }}>{r.toFixed(1)}×</button>
        ))}
      </div>

      {revealed ? (
        <div data-testid="lc-script" style={{
          textAlign: 'left', padding: '16px 18px', borderRadius: 14,
          background: theme.card, border: `1px solid ${theme.border}`,
          fontSize: 13.5, color: theme.textMuted, lineHeight: 1.8, whiteSpace: 'pre-wrap',
        }}>
          <div style={{
            fontSize: 11, color: theme.textDim, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
          }}>스크립트</div>
          {script}
        </div>
      ) : (
        <div data-testid="lc-locked" style={{
          borderRadius: 14, border: `1px dashed ${theme.borderStrong}`,
          padding: '24px 20px', background: theme.card,
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>스크립트는 제출 후 공개됩니다</div>
          <div style={{ fontSize: 12, color: theme.textDim, lineHeight: 1.6 }}>
            채점하기를 누르면 대화 전문과 해설이 이 자리에 열립니다.
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: theme.textDim }}>
        <b style={{ color: theme.warning }}>연습 모드</b> — 기기 음성으로 재생합니다
        {!supported && ' · 이 브라우저는 음성 합성을 지원하지 않아요'}
      </div>
    </div>
  );
}

// 문항 하나 — 제출 후에는 정답/오답 표시로 바뀐다(기존 레슨 채점 UI와 같은 색 규범).
function LcQuestion({ theme, q, picked, onPick, graded }) {
  return (
    <div data-testid="lc-question" style={{
      background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16,
      padding: '15px 18px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 8, flex: '0 0 auto',
          background: theme.accentGradSoft, color: theme.accent,
          display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
        }}>{q.n}</span>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{q.stem}</span>
      </div>
      {q.options.map((o) => {
        const isPicked = picked === o.id;
        const isAnswer = graded && graded.answer === o.id;
        const isWrong = graded && isPicked && !graded.correct;
        const color = isAnswer ? theme.success : isWrong ? theme.error : theme.accent;
        const active = isPicked || isAnswer;
        return (
          <button key={o.id} data-testid="lc-option" onClick={() => !graded && onPick(o.id)} style={{
            width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center',
            padding: '9px 13px', borderRadius: 10, marginBottom: 6, fontSize: 13,
            background: active ? color + '1a' : theme.card,
            border: `1px solid ${active ? color + '8c' : theme.border}`,
            color: active ? theme.text : theme.textMuted,
            cursor: graded ? 'default' : 'pointer',
          }}>
            <span style={{
              width: 21, height: 21, borderRadius: 7, flex: '0 0 auto',
              display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
              background: active ? color : theme.chipBg,
              color: active ? theme.surface : theme.textDim,
            }}>{o.id}</span>
            {o.text}
          </button>
        );
      })}
      {graded && graded.explanation && (
        <div style={{
          marginTop: 8, padding: '10px 13px', borderRadius: 10,
          background: theme.card, border: `1px solid ${theme.border}`,
          fontSize: 12.5, color: theme.textMuted, lineHeight: 1.65,
        }}>
          <b style={{ color: theme.text, marginRight: 6 }}>해설</b>{graded.explanation}
        </div>
      )}
    </div>
  );
}

function ListeningEmpty({ theme }) {
  return (
    <div data-testid="listening-empty" style={{
      margin: 'auto', maxWidth: 460, padding: '44px 28px', borderRadius: 16,
      background: theme.card, border: `1px dashed ${theme.border}`,
      textAlign: 'center', color: theme.textMuted, lineHeight: 1.75,
    }}>
      <div style={{ marginBottom: 12, color: theme.textDim, display: 'flex', justifyContent: 'center' }}>
        <Icons.Headphones size={30} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
        아직 리스닝 콘텐츠가 없어요
      </div>
      <div style={{ fontSize: 13 }}>
        LC 문항(<code style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>kind=toeic_lc</code>)이 추가되면
        이 화면에서 대화를 듣고 바로 풀 수 있습니다. 재생·속도 조절·제출 후 스크립트 공개는 준비돼 있어요.
      </div>
    </div>
  );
}

// 화면 본체 — Desktop/Mobile 공용 (레이아웃만 분기)
function ListeningBody({ theme, lc, compact = false }) {
  const { detail, answers, result, grading, setAnswers, submit, retake } = lc;
  const questions = detail?.questions || [];
  const answered = Object.keys(answers).length;
  // 채점 응답의 results 는 배열이 아니라 position(문자열) 키 객체다 — {"1":{your,correct,answer,explanation}}
  const gradedByN = new Map(Object.entries(result?.results || {}).map(([n, r]) => [Number(n), r]));
  const done = Boolean(result);

  const player = <LcPlayer theme={theme} lesson={detail} revealed={done} compact={compact} />;
  const list = (
    <React.Fragment>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>문제</span>
        <span data-testid="lc-progress" style={{ fontSize: 12, color: theme.textDim }}>
          {done ? `${result.attempt.correct_count} / ${result.attempt.total_count} 정답` : `${answered}/${questions.length} 답변`}
        </span>
      </div>
      {questions.map((q) => (
        <LcQuestion key={q.n} theme={theme} q={q}
          picked={answers[q.n]}
          onPick={(id) => setAnswers((prev) => ({ ...prev, [q.n]: id }))}
          graded={gradedByN.get(q.n)} />
      ))}
    </React.Fragment>
  );
  const bar = (
    <div style={{
      padding: compact ? '12px 16px' : '14px 32px', borderTop: `1px solid ${theme.border}`,
      background: theme.bgSoft, display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {!compact && (
        <span style={{ fontSize: 12, color: theme.textDim }}>
          {done ? '스크립트가 왼쪽에 공개됐어요 — 다시 들으며 확인해 보세요' : '모든 문항에 답하면 채점할 수 있어요'}
        </span>
      )}
      <button data-testid="lc-submit"
        onClick={done ? retake : submit}
        disabled={!done && (grading || answered < questions.length)}
        style={{
          marginLeft: 'auto', padding: '11px 20px', borderRadius: 12, fontSize: 13.5, fontWeight: 700,
          background: !done && (grading || answered < questions.length) ? theme.chipBg : theme.accentGrad,
          color: !done && (grading || answered < questions.length) ? theme.textMuted : '#fff',
        }}>
        {done ? '다시 풀기' : grading ? '채점 중…' : '채점하기'}
      </button>
    </div>
  );

  if (compact) {
    return (
      <React.Fragment>
        <main style={{ flex: 1, overflow: 'auto', padding: '0 16px 12px' }}>
          <div style={{ marginBottom: 14 }}>{player}</div>
          {list}
        </main>
        {bar}
      </React.Fragment>
    );
  }
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <aside aria-label="대화 재생" style={{
        width: 560, flex: '0 0 auto', borderRight: `1px solid ${theme.border}`,
        background: theme.bgSoft, padding: 28, overflow: 'auto',
      }}>{player}</aside>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px 8px' }}>{list}</div>
        {bar}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Desktop
// ─────────────────────────────────────────────────────
function ListeningDesktop({ theme }) {
  const lc = useListening();
  const { lessons, loading, error, detail, detailLoading, currentId, select } = lc;

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <header style={{
        padding: '14px 24px', borderBottom: `1px solid ${theme.border}`, background: theme.bgSoft,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
          background: theme.success + '24', color: theme.success, letterSpacing: '0.04em',
        }}>LISTENING</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>
          {detail ? detail.title : '리스닝'}
          {detail?.subtitle && <span style={{ fontWeight: 500, color: theme.textMuted }}> · {detail.subtitle}</span>}
        </span>
        {detail && (
          <span style={{ fontSize: 12, color: theme.textDim }}>
            난이도 {'★'.repeat(detail.difficulty || 0)}{'☆'.repeat(Math.max(0, 5 - (detail.difficulty || 0)))}
            {detail.est_minutes ? ` · 권장 ${detail.est_minutes}분` : ''}
          </span>
        )}
        {lessons.length > 1 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {lessons.map((l, i) => (
              <button key={l.id} data-testid="lc-set" onClick={() => select(l.id)} style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12.5,
                fontWeight: currentId === l.id ? 700 : 500,
                background: currentId === l.id ? theme.text : theme.chipBg,
                color: currentId === l.id ? theme.bg : theme.textMuted,
              }}>Set {i + 1}</button>
            ))}
          </div>
        )}
      </header>

      {error && (
        <div style={{
          margin: '16px 32px 0', padding: '10px 14px', borderRadius: 10,
          background: theme.error + '18', border: `1px solid ${theme.error}44`,
          fontSize: 12.5, color: theme.error, fontWeight: 600,
        }}>리스닝 콘텐츠를 불러오지 못했습니다. ({error})</div>
      )}
      {loading || detailLoading ? (
        <div style={{ margin: 'auto', fontSize: 13, color: theme.textMuted }}>리스닝 콘텐츠를 불러오는 중…</div>
      ) : !lessons.length || !detail ? (
        <div style={{ flex: 1, display: 'flex' }}><ListeningEmpty theme={theme} /></div>
      ) : (
        <ListeningBody theme={theme} lc={lc} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Mobile
// ─────────────────────────────────────────────────────
function MobileListening({ theme, noNav = false, onNavigate }) {
  const lc = useListening();
  const { lessons, loading, detail, detailLoading } = lc;

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      paddingBottom: noNav ? 0 : 76,
    }}>
      <div style={{ padding: '14px 20px 10px' }}>
        <div style={{
          fontSize: 11, color: theme.textDim, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2,
        }}>학습</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{detail ? detail.title : '리스닝'}</div>
      </div>
      {loading || detailLoading ? (
        <div style={{ margin: 'auto', fontSize: 13, color: theme.textMuted }}>불러오는 중…</div>
      ) : !lessons.length || !detail ? (
        <div style={{ flex: 1, display: 'flex', padding: '0 16px' }}><ListeningEmpty theme={theme} /></div>
      ) : (
        <ListeningBody theme={theme} lc={lc} compact />
      )}
      {!noNav && <AppMobileNav theme={theme} active="listening" onNavigate={onNavigate} />}
    </div>
  );
}

window.ListeningDesktop = ListeningDesktop;
window.MobileListening = MobileListening;
