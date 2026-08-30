// vocab-quiz.jsx — 단어장 '오늘의 단어' AI 퀴즈 패널 (docs/plan/06-vocab-daily-quiz.md)
// 데스크탑(단어장 탭)·모바일(compact) 공용. 생성/채점/단어장 추가는 전부 서버(vocab-store 의 quiz 액션) —
// 여기는 문항 진행 상태(현재 번호·선택)만 가진다. vocabulary.jsx 보다 먼저 로드되어야 한다.
//
// 흐름: 주제 선택(랜덤/뉴스/게임/블로그/키워드) → AI 생성(10~30초, 취소 가능) → 10문항 4지선다(즉시 피드백 + 예문)
//       → 서버 채점 → 결과(점수·오답) → 틀린 단어/전체를 단어장에 추가 → 새 퀴즈. 단어·예문은 🔊(speech.jsx)로 발음, 문항 자동 발음 토글.
// 뉴스·블로그는 실시간 검색이 아니라 AI 지식 기준의 주제 어휘다 — 화면에 그렇게 적는다.

const QUIZ_KIND_META = [
  { id: 'random',  label: '랜덤',      icon: 'Sparkles', desc: 'Jina가 주제를 골라요' },
  { id: 'news',    label: '최신 뉴스', icon: 'Globe',    desc: '국제·경제·기술 뉴스 어휘' },
  { id: 'game',    label: '게임',      icon: 'Play',     desc: '게임·e스포츠 어휘' },
  { id: 'blog',    label: '블로그',    icon: 'BookOpen', desc: '여행·음식·라이프스타일' },
  { id: 'keyword', label: '키워드',    icon: 'Search',   desc: '내가 정한 주제로' },
];
const quizKindLabel = (id) => (QUIZ_KIND_META.find((k) => k.id === id) || {}).label || id;

function DailyQuizPanel({ theme, aiConfig, compact = false }) {
  const { quiz, loadTodayQuiz, generateQuiz, cancelQuiz, answerQuiz, addQuizWords } = useVocab();
  const [kind, setKind] = React.useState('random');
  const [keyword, setKeyword] = React.useState('');
  const [picking, setPicking] = React.useState(false);      // 오늘 퀴즈가 있어도 새 주제 선택 화면을 열었는지
  const [pos, setPos] = React.useState(0);                  // 현재 문항 위치
  const [picked, setPicked] = React.useState({});           // { [index]: choice }
  const [submitting, setSubmitting] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [addResult, setAddResult] = React.useState(null);   // { ok, added, duplicates, mode } | { ok:false, error, hint }

  // 탭을 열 때 오늘의 퀴즈를 한 번 불러온다
  React.useEffect(() => {
    if (!quiz.loaded && !quiz.loading) loadTodayQuiz();
  }, [quiz.loaded, quiz.loading, loadTodayQuiz]);

  const q = quiz.current;
  // 퀴즈가 바뀌면(새로 생성) 진행 상태 초기화
  React.useEffect(() => { setPos(0); setPicked({}); setAddResult(null); setPicking(false); }, [q && q.id]);

  const pad = compact ? 16 : 40;
  const completed = Boolean(q && q.completed_at);
  const showPicker = !quiz.generating && (picking || (quiz.loaded && !q));
  const provider = aiConfig?.provider;

  const handleGenerate = async () => {
    if (kind === 'keyword' && !keyword.trim()) return;
    const res = await generateQuiz({
      kind,
      keyword: kind === 'keyword' ? keyword.trim() : undefined,
      provider,
      model: aiConfig?.model?.[provider] ?? null,
    });
    if (res.ok) setPicking(false);
  };

  const current = q && !completed ? q.words[pos] : null;
  const chosen = current ? picked[current.index] : undefined;
  // 자동 발음: 새 문항이 나올 때 단어를 읽어준다 (기기 설정, speech.jsx). 지원 안 되는 환경이면 항상 false
  const [autoSpeak, setAutoSpeak] = useAutoSpeak();
  React.useEffect(() => {
    if (autoSpeak && current && window.jinaSpeak) window.jinaSpeak(current.word);
  }, [current ? current.index : null, q ? q.id : null, autoSpeak]);
  const pick = (choice) => {
    if (!current || chosen !== undefined) return;
    setPicked((p) => ({ ...p, [current.index]: choice }));
  };
  const next = async () => {
    if (!q) return;
    if (pos < q.words.length - 1) { setPos(pos + 1); return; }
    setSubmitting(true);
    const answers = q.words
      .filter((w) => picked[w.index] !== undefined)
      .map((w) => ({ index: w.index, choice: picked[w.index] }));
    await answerQuiz(q.id, answers);
    setSubmitting(false);
  };

  const wrongIndexes = q && q.answers ? q.answers.filter((a) => !a.correct).map((a) => a.index) : [];
  const handleAdd = async (indexes, mode) => {
    if (!q) return;
    setAdding(true);
    const res = await addQuizWords(q.id, indexes);
    setAdding(false);
    setAddResult(res.ok
      ? { ok: true, added: res.added, duplicates: res.duplicates, mode }
      : { ok: false, error: res.error, hint: res.hint });
  };

  const card = {
    background: theme.card, border: `1px solid ${theme.border}`, borderRadius: compact ? 16 : 20,
  };
  const primaryBtn = (disabled) => ({
    padding: compact ? '11px 16px' : '12px 20px', borderRadius: 12,
    background: disabled ? theme.chipBg : theme.accentGrad, color: disabled ? theme.textMuted : '#fff',
    fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
  });
  const ghostBtn = {
    padding: compact ? '10px 14px' : '12px 18px', borderRadius: 12,
    background: 'transparent', border: `1px solid ${theme.borderStrong}`, color: theme.text,
    fontSize: 14, fontWeight: 600,
  };

  // ── 1) 첫 로드 ──
  if (!quiz.loaded && quiz.loading) {
    return (
      <div style={{ padding: pad, color: theme.textMuted, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.accent, animation: 'jina-pulse 1s infinite' }} />
        오늘의 퀴즈를 불러오는 중…
      </div>
    );
  }

  // ── 2) 생성 중 ──
  if (quiz.generating) {
    return (
      <div style={{ padding: pad, maxWidth: 640 }}>
        <div style={{ ...card, padding: compact ? 18 : 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: theme.text, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accent, animation: 'jina-pulse 1s infinite' }} />
            AI가 <b style={{ color: theme.accent }}>{kind === 'keyword' ? `'${keyword.trim()}'` : quizKindLabel(kind)}</b> 주제로 단어 10개를 고르는 중… (보통 30~60초)
          </div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6 }}>
            품사·발음기호·뜻·예문과 오답 보기까지 한 번에 만듭니다. 이미 단어장에 있는 단어는 제외합니다.
          </div>
          <div>
            <button data-testid="quiz-cancel" onClick={cancelQuiz} style={{ ...ghostBtn, color: theme.error, borderColor: theme.error + '55' }}>취소</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 3) 주제 선택 ──
  if (showPicker) {
    const canGo = kind !== 'keyword' || keyword.trim().length > 0;
    return (
      <div style={{ padding: pad, maxWidth: 720 }}>
        <p style={{ fontSize: compact ? 14 : 15, color: theme.textMuted, lineHeight: 1.6, marginTop: 0, marginBottom: compact ? 16 : 24 }}>
          주제를 고르면 AI가 관련 영어 단어 10개로 4지선다 퀴즈를 만듭니다. 끝나면 틀린 단어를 바로 단어장(SRS)에 넣을 수 있어요.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          {QUIZ_KIND_META.map((k) => {
            const Ico = Icons[k.icon] || Icons.Sparkles;
            const active = kind === k.id;
            return (
              <button key={k.id} data-testid={`quiz-kind-${k.id}`} onClick={() => setKind(k.id)} style={{
                ...card, padding: compact ? 12 : 14, textAlign: 'left',
                borderColor: active ? theme.accent : theme.border,
                background: active ? theme.accent + '18' : theme.card,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: active ? theme.accent : theme.text, fontSize: 14, fontWeight: 700 }}>
                  <Ico size={16} /> {k.label}
                </span>
                <span style={{ fontSize: 11.5, color: theme.textMuted }}>{k.desc}</span>
              </button>
            );
          })}
        </div>
        {kind === 'keyword' && (
          <input
            data-testid="quiz-keyword-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value.slice(0, 40))}
            onKeyDown={(e) => e.key === 'Enter' && canGo && handleGenerate()}
            placeholder="예: coffee, 반도체, job interview, 여행 예약…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: 12, marginBottom: 14,
              background: theme.card, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 15, outline: 'none', fontFamily: 'inherit',
            }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button data-testid="quiz-generate" onClick={handleGenerate} disabled={!canGo} style={primaryBtn(!canGo)}>
            10문제 만들기
          </button>
          {q && (
            <button data-testid="quiz-back" onClick={() => setPicking(false)} style={ghostBtn}>오늘의 퀴즈로 돌아가기</button>
          )}
        </div>
        {quiz.error && (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: theme.error + '15', border: `1px solid ${theme.error}40`, fontSize: 13, color: theme.error, lineHeight: 1.6 }}>
            오류: {quiz.error}
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: 12, color: theme.textDim, lineHeight: 1.6 }}>
          ※ 뉴스·블로그 주제는 AI가 알고 있는 지식 기준으로 단어를 고릅니다(실시간 검색 아님). 이미 단어장에 있는 단어는 제외됩니다.
        </div>
      </div>
    );
  }

  if (!q) return null;

  // ── 4) 문항 진행 ──
  if (!completed) {
    const total = q.words.length;
    const done = Object.keys(picked).length;
    const isCorrect = chosen !== undefined && chosen === current.meaning_ko;
    return (
      <div style={{ padding: pad, maxWidth: 720, margin: compact ? 0 : '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {quizKindLabel(q.kind)}{q.keyword ? ` · ${q.keyword}` : ''}
            </div>
            <div style={{ fontSize: compact ? 16 : 18, fontWeight: 700, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.topic_title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
            {window.JINA_TTS && window.JINA_TTS.supported && (
              <button type="button" data-testid="quiz-auto-speak" onClick={() => setAutoSpeak(!autoSpeak)} aria-pressed={autoSpeak}
                title="문항이 나올 때 단어를 자동으로 읽어줍니다 (브라우저 음성)" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
                  fontSize: 12, fontWeight: 600, color: autoSpeak ? theme.accent : theme.textMuted,
                  background: autoSpeak ? theme.accent + '18' : theme.chipBg,
                }}>
                <Icons.Volume size={13} /> 자동 발음 {autoSpeak ? 'ON' : 'OFF'}
              </button>
            )}
            <div data-testid="quiz-progress" style={{ fontSize: 13, color: theme.textMuted, fontWeight: 700 }}>Q {pos + 1} / {total}</div>
          </div>
        </div>
        <div style={{ height: 4, borderRadius: 999, background: theme.border, marginBottom: compact ? 14 : 22, overflow: 'hidden' }}>
          <div style={{ width: `${(done / total) * 100}%`, height: '100%', background: theme.accentGrad, transition: 'width .25s' }} />
        </div>

        <div style={{ ...card, padding: compact ? 20 : 28, marginBottom: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>이 단어의 뜻은?</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div data-testid="quiz-word" style={{ fontSize: compact ? 30 : 38, fontWeight: 800, color: theme.text, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{current.word}</div>
            <SpeakButton text={current.word} theme={theme} size={compact ? 18 : 22} />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: theme.textMuted, display: 'inline-flex', gap: 10 }}>
            <span>{current.pos}</span>
            <span style={{ fontStyle: 'italic' }}>{current.ipa}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {current.options.map((opt, i) => {
            const answered = chosen !== undefined;
            const right = answered && opt === current.meaning_ko;
            const wrongPick = answered && opt === chosen && !right;
            return (
              <button key={i} data-testid="quiz-option" onClick={() => pick(opt)} disabled={answered} style={{
                ...card, padding: compact ? '13px 14px' : '15px 18px', textAlign: 'left', fontSize: 15, fontWeight: 600,
                color: right ? theme.success : wrongPick ? theme.error : answered ? theme.textDim : theme.text,
                borderColor: right ? theme.success : wrongPick ? theme.error : theme.border,
                background: right ? theme.success + '18' : wrongPick ? theme.error + '15' : theme.card,
                cursor: answered ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 8, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                  background: theme.chipBg, color: theme.textMuted, fontSize: 12, fontWeight: 700,
                }}>{String.fromCharCode(65 + i)}</span>
                <span style={{ flex: 1 }}>{opt}</span>
                {right && <Icons.Check size={16} />}
                {wrongPick && <Icons.X size={16} />}
              </button>
            );
          })}
        </div>

        {chosen !== undefined && (
          <div data-testid="quiz-feedback" style={{ ...card, marginTop: 14, padding: compact ? 14 : 18, borderColor: isCorrect ? theme.success + '55' : theme.error + '55' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: isCorrect ? theme.success : theme.error, marginBottom: 8 }}>
              {isCorrect ? '정답!' : `아쉬워요 — 정답은 "${current.meaning_ko}"`}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.6, fontStyle: 'italic', flex: 1 }}>"{current.example_en}"</div>
              <SpeakButton text={current.example_en} theme={theme} size={14} rate={0.9} label="예문 듣기" />
            </div>
            <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.6, marginTop: 4 }}>{current.example_ko}</div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button data-testid="quiz-next" onClick={next} disabled={submitting} style={primaryBtn(submitting)}>
                {submitting ? '채점 중…' : pos < total - 1 ? '다음 문항 →' : '결과 보기'}
              </button>
            </div>
          </div>
        )}
        {quiz.error && (
          <div style={{ marginTop: 12, fontSize: 13, color: theme.error }}>오류: {quiz.error}</div>
        )}
      </div>
    );
  }

  // ── 5) 결과 ──
  const total = q.words.length;
  const score = q.score ?? 0;
  const byIndex = new Map((q.answers || []).map((a) => [a.index, a]));
  return (
    <div style={{ padding: pad, maxWidth: 720, margin: compact ? 0 : '0 auto' }}>
      <div style={{ ...card, padding: compact ? 20 : 28, marginBottom: 16, display: 'flex', alignItems: 'center', gap: compact ? 16 : 24, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>점수</div>
          <div data-testid="quiz-score" className="jina-serif" style={{ fontSize: compact ? 40 : 52, lineHeight: 1, color: theme.text, marginTop: 6 }}>
            {score}<span style={{ fontSize: compact ? 18 : 22, color: theme.textMuted }}> / {total}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {quizKindLabel(q.kind)}{q.keyword ? ` · ${q.keyword}` : ''}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginTop: 4 }}>{q.topic_title}</div>
          {q.topic_ko && <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4, lineHeight: 1.5 }}>{q.topic_ko}</div>}
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 10 }}>
            {score === total ? '전부 맞혔어요! 이 단어들을 단어장에 넣어 복습 주기로 굳혀 보세요.'
              : `틀린 단어 ${wrongIndexes.length}개 — 단어장에 추가하면 SRS 복습 큐에 바로 들어갑니다.`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button data-testid="quiz-add-wrong" onClick={() => handleAdd(wrongIndexes, 'wrong')} disabled={adding || wrongIndexes.length === 0}
          style={primaryBtn(adding || wrongIndexes.length === 0)}>
          틀린 단어 {wrongIndexes.length}개 단어장에 추가
        </button>
        <button data-testid="quiz-add-all" onClick={() => handleAdd([], 'all')} disabled={adding} style={ghostBtn}>
          {adding ? '추가 중…' : `${total}개 모두 추가`}
        </button>
        <button data-testid="quiz-new" onClick={() => { setPicking(true); setAddResult(null); }} style={{ ...ghostBtn, marginLeft: 'auto' }}>
          새 퀴즈 만들기
        </button>
      </div>
      {addResult && (
        <div data-testid="quiz-add-result" style={{
          padding: '12px 14px', borderRadius: 12, marginBottom: 16, fontSize: 13, lineHeight: 1.6,
          background: addResult.ok ? theme.success + '15' : theme.error + '15',
          border: `1px solid ${addResult.ok ? theme.success + '40' : theme.error + '40'}`,
          color: addResult.ok ? theme.success : theme.error, fontWeight: 600,
        }}>
          {addResult.ok
            ? `단어장에 ${addResult.added}개 추가${addResult.duplicates ? ` (이미 있던 단어 ${addResult.duplicates}개)` : ''} — 오늘의 복습 큐에서 바로 만날 수 있어요.`
            : `오류: ${addResult.error}${addResult.hint ? ` — ${addResult.hint}` : ''}`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.words.map((w) => {
          const a = byIndex.get(w.index);
          const ok = a ? a.correct : null;
          return (
            <div key={w.index} data-testid="quiz-result-row" style={{ ...card, padding: compact ? '12px 14px' : '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                background: ok === null ? theme.chipBg : ok ? theme.success + '22' : theme.error + '22',
                color: ok === null ? theme.textDim : ok ? theme.success : theme.error,
              }}>{ok === null ? '–' : ok ? <Icons.Check size={14} /> : <Icons.X size={14} />}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{w.word}</span>
                  <span style={{ fontSize: 12, color: theme.textMuted }}>{w.pos}</span>
                  <span style={{ fontSize: 12, color: theme.textMuted, fontStyle: 'italic' }}>{w.ipa}</span>
                  <SpeakButton text={w.word} theme={theme} size={13} />
                </div>
                <div style={{ fontSize: 13.5, color: theme.text, marginTop: 2 }}>{w.meaning_ko}</div>
                {a && !a.correct && <div style={{ fontSize: 12, color: theme.error, marginTop: 2 }}>내 답: {a.choice}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.DailyQuizPanel = DailyQuizPanel;
window.QUIZ_KIND_META = QUIZ_KIND_META;
