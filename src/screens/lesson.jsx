// lesson.jsx — TOEIC Part 7 Reading lesson page (desktop + mobile)
// Content: a business email + 3 multiple-choice questions + AI explanation panel.
// 콘텐츠/채점/진도의 단일 소스는 서버 (docs/plan/02-lesson.md) —
// 데이터는 useLesson()(src/shared/lesson-store.jsx)이 GET /api/lessons/:id 로 가져오고,
// 채점은 POST /api/lessons/:id/attempts 서버 채점. 정답/해설은 채점 응답에만 실린다.

// 주입 시임(injection seam): Provider value = 서버 LessonDetail DTO
const LessonCtx = React.createContext(null);

// Jina 패널 추천 질문 — lesson.faq가 비어 있을 때의 폴백
const DEFAULT_FAQ = [
  '이 지문을 한국어로 요약해주세요',
  '이 지문의 핵심 표현을 알려주세요',
  '이 지문에서 자주 나오는 TOEIC 어휘는?',
];

// Pill component
function Pill({ children, theme, color, bg }) {
  return (
    <span style={{
      fontSize: 10.5, padding: '2px 7px', borderRadius: 5,
      background: bg || theme.chipBg, color: color || theme.textMuted,
      fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}

// Lesson top bar with progress + AI mode
// 콘텐츠(title/subtitle/difficulty)는 LessonCtx(=서버 LessonDetail), 진도는 스토어 파생값.
function LessonTopBar({ theme, askingAI, setAskingAI, onBack }) {
  const { title, subtitle, difficulty, est_minutes: estMinutes } = React.useContext(LessonCtx);
  const { progress } = useLesson();
  const stars = '★'.repeat(difficulty || 0) + '☆'.repeat(Math.max(0, 5 - (difficulty || 0)));
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  return (
    <div style={{
      padding: '14px 28px',
      borderBottom: `1px solid ${theme.border}`,
      display: 'flex', alignItems: 'center', gap: 14,
      background: theme.bg,
    }}>
      <button type="button" onClick={onBack} aria-label="대시보드로 돌아가기" title="대시보드" style={{ width: 34, height: 34, borderRadius: 9, background: theme.chipBg, color: theme.text, display: 'grid', placeItems: 'center' }}>
        <Icons.ArrowLeft size={16} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <Pill theme={theme} color={theme.accent} bg={theme.accent + '20'}>READING · PART 7</Pill>
          <span style={{ fontSize: 11, color: theme.textMuted }}>난이도 {stars} · 권장 {estMinutes}분</span>
        </div>
        <div style={{ fontSize: 15, color: theme.text, fontWeight: 600 }}>
          {title} <span style={{ color: theme.textMuted, fontWeight: 400 }}>· {subtitle}</span>
        </div>
      </div>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10, background: theme.chipBg }}>
        <span style={{ fontSize: 11, color: theme.textMuted }}>진도</span>
        <div style={{ width: 100, height: 6, borderRadius: 999, background: theme.border, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: theme.accentGrad }} />
        </div>
        <span style={{ fontSize: 11, color: theme.text, fontWeight: 600 }}>{progress.done}/{progress.total}</span>
      </div>
      <button onClick={() => setAskingAI(!askingAI)} style={{
        padding: '8px 14px', borderRadius: 10,
        background: askingAI ? theme.text : theme.accentGrad,
        color: askingAI ? theme.bg : '#fff',
        fontSize: 12.5, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        boxShadow: askingAI ? 'none' : `0 4px 16px -6px ${theme.accent}80`,
      }}>
        <Icons.Sparkles size={13} stroke={2.2} />
        {askingAI ? 'Jina 닫기' : 'Jina에게 물어보기'}
      </button>
    </div>
  );
}

// Passage column
function PassageColumn({ theme, highlighted, setHighlighted }) {
  const lesson = React.useContext(LessonCtx);
  const p = lesson.passage;
  const renderBody = () => p.body.map((para, i) => {
    // Bold markdown-ish
    const parts = para.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.75, color: theme.text }}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <b key={j} style={{ background: theme.accent + '22', padding: '0 3px', borderRadius: 3, fontWeight: 700, color: theme.text }}>{part.slice(2, -2)}</b>;
          }
          // Highlight 'blockers' (for Q3)
          if (part.includes('blockers')) {
            return part.split(/(blockers)/g).map((chunk, k) =>
              chunk === 'blockers'
                ? <span key={k} style={{ borderBottom: `2px dashed ${theme.accent2}`, cursor: 'help', fontWeight: 500 }}
                    onClick={() => setHighlighted(highlighted === 'blockers' ? null : 'blockers')}>{chunk}</span>
                : chunk
            );
          }
          return part;
        })}
      </p>
    );
  });

  return (
    <div style={{
      padding: 32, overflow: 'auto', position: 'relative',
      background: theme.surface,
      borderRight: `1px solid ${theme.border}`,
    }}>
      {/* Email header */}
      <div style={{
        padding: 18, borderRadius: 12,
        background: theme.bgSoft, border: `1px solid ${theme.border}`,
        marginBottom: 24, fontSize: 12.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Pill theme={theme} color={theme.accent2} bg={theme.accent2 + '20'}>{p.type}</Pill>
          <span style={{ color: theme.textDim, fontSize: 11 }}>{p.date}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', rowGap: 5, color: theme.textMuted }}>
          <span style={{ color: theme.textDim, fontWeight: 600 }}>From</span>
          <span style={{ color: theme.text }}>{p.from}</span>
          <span style={{ color: theme.textDim, fontWeight: 600 }}>To</span>
          <span>{p.to}</span>
          <span style={{ color: theme.textDim, fontWeight: 600 }}>Cc</span>
          <span>{p.cc}</span>
          <span style={{ color: theme.textDim, fontWeight: 600 }}>Subject</span>
          <span className="jina-serif" style={{ fontStyle: 'italic', color: theme.text, fontSize: 15, fontWeight: 500 }}>{p.subject}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 620 }}>
        {renderBody()}
      </div>

      {/* Floating tools */}
      <div style={{
        position: 'sticky', bottom: 0, marginTop: 24,
        display: 'flex', gap: 8, alignItems: 'center',
        padding: '10px 14px', borderRadius: 12,
        background: theme.glassBg, backdropFilter: 'blur(16px)',
        border: `1px solid ${theme.border}`, width: 'fit-content',
      }}>
        <button style={{ padding: '6px 10px', borderRadius: 8, background: theme.chipBg, color: theme.text, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icons.Pin size={12} /> 하이라이트
        </button>
        <button style={{ padding: '6px 10px', borderRadius: 8, background: theme.chipBg, color: theme.text, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icons.Volume size={12} /> 듣기
        </button>
        <button style={{ padding: '6px 10px', borderRadius: 8, background: theme.chipBg, color: theme.text, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icons.Globe size={12} /> 한글 번역
        </button>
        <button style={{ padding: '6px 10px', borderRadius: 8, background: theme.chipBg, color: theme.text, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icons.Book size={12} /> 단어 ({lesson.vocabulary.length})
        </button>
      </div>
    </div>
  );
}

// Question card
// ★ 정답(correctId)/해설(explanation)은 서버 채점 응답에서만 내려온다 —
//   q.options에는 correct 플래그가 존재하지 않는다(정답 비노출).
function QuestionCard({ theme, q, answer, onAnswer, revealed, correctId, explanation }) {
  return (
    <div style={{
      padding: 18, borderRadius: 14,
      background: theme.card, border: `1px solid ${theme.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 7,
          background: theme.accentGrad, color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 700,
        }}>{q.n}</span>
        <span style={{ fontSize: 14, color: theme.text, fontWeight: 600, lineHeight: 1.4 }}>{q.stem}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((o) => {
          const isSelected = answer === o.id;
          const showRight = revealed && o.id === correctId;
          const showWrong = revealed && isSelected && o.id !== correctId;
          const bg = showRight ? theme.success + '20'
            : showWrong ? theme.error + '18'
            : isSelected ? theme.chipBg : 'transparent';
          const border = showRight ? theme.success
            : showWrong ? theme.error
            : isSelected ? theme.borderStrong : theme.border;
          return (
            <button key={o.id} onClick={() => onAnswer(q.n, o.id)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              background: bg, border: `1.5px solid ${border}`,
              textAlign: 'left', width: '100%',
              transition: 'all .15s',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, flex: '0 0 auto',
                background: showRight ? theme.success : showWrong ? theme.error : isSelected ? theme.text : theme.chipBg,
                color: showRight || showWrong || isSelected ? (theme.isDark && isSelected && !revealed ? theme.bg : '#fff') : theme.textMuted,
                display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 700,
              }}>
                {showRight ? <Icons.Check size={12} stroke={3} /> : showWrong ? <Icons.X size={12} stroke={3} /> : o.id}
              </span>
              <span style={{ fontSize: 13, color: theme.text, lineHeight: 1.5, flex: 1 }}>{o.text}</span>
            </button>
          );
        })}
      </div>
      {revealed && explanation && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 10,
          background: theme.accentGradSoft, fontSize: 12, color: theme.textMuted, lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <Icons.Sparkles size={12} style={{ color: theme.accent }} />
            <b style={{ color: theme.text }}>Jina 해설</b>
          </div>
          {/* 해설은 문항 데이터(lesson_items.explanation) — q.n 하드코딩 매칭이 아니므로
              지문이 바뀌면 해설도 따라 바뀐다 (set24가 set23 해설을 보여주던 버그 해소) */}
          {explanation}
        </div>
      )}
    </div>
  );
}

// Questions column
// 답/채점결과는 스토어(useLesson)에 있다 — key={current.id} 리마운트에도 살아남는다.
// 채점은 비낙관적: 정답을 클라이언트가 모르므로 서버 왕복(POST attempts) 후에만 공개된다.
function QuestionsColumn({ theme, onNext }) {
  const lesson = React.useContext(LessonCtx);
  const { answers, setAnswer, result, grading, submit, retake, error } = useLesson();
  const revealed = Boolean(result);
  const onAnswer = (n, id) => {
    if (revealed) return;
    setAnswer(n, id);
  };
  const correctCount = result?.attempt?.correct_count ?? 0;
  const totalCount = result?.attempt?.total_count ?? lesson.questions.length;
  const allAnswered = lesson.questions.every((q) => answers[q.n]);

  return (
    <div style={{
      padding: 24, overflow: 'auto',
      display: 'flex', flexDirection: 'column', gap: 14,
      background: theme.bg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, color: theme.text, margin: 0, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>문제</h3>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          {Object.keys(answers).length}/{lesson.questions.length} 답변
        </span>
      </div>

      {lesson.questions.map((q) => (
        <QuestionCard key={q.n} theme={theme} q={q}
          answer={answers[q.n]} onAnswer={onAnswer} revealed={revealed}
          correctId={result?.results?.[q.n]?.answer}
          explanation={result?.results?.[q.n]?.explanation} />
      ))}

      {/* Action */}
      {!revealed ? (
        <React.Fragment>
          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
              background: theme.error + '18', border: `1px solid ${theme.error}55`, color: theme.text,
            }}>{error}</div>
          )}
          <button onClick={() => submit()} disabled={!allAnswered || grading} style={{
            padding: '14px', borderRadius: 12,
            background: allAnswered && !grading ? theme.text : theme.chipBg,
            color: allAnswered && !grading ? theme.bg : theme.textMuted,
            fontSize: 14, fontWeight: 700,
            cursor: allAnswered && !grading ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {grading ? '채점 중…'
              : allAnswered ? '채점하기'
              : `${lesson.questions.length - Object.keys(answers).length}개 문제를 더 풀어주세요`}
            {allAnswered && !grading && <Icons.ArrowRight size={14} />}
          </button>
        </React.Fragment>
      ) : (
        <div style={{
          padding: 16, borderRadius: 12,
          background: correctCount === totalCount ? theme.success + '15' : theme.accentGradSoft,
          border: `1px solid ${theme.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: theme.accentGrad,
              display: 'grid', placeItems: 'center', color: '#fff', flex: '0 0 auto',
            }}>
              <Icons.Trophy size={20} stroke={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>이번 세트 결과</div>
              <div className="jina-serif" style={{ fontSize: 28, color: theme.text, fontWeight: 500, lineHeight: 1 }}>
                {correctCount} <span style={{ color: theme.textDim, fontSize: 18 }}>/ {totalCount} 정답</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => retake()} style={{
              flex: 1, padding: '10px', borderRadius: 9,
              background: theme.chipBg, color: theme.text, fontSize: 12.5, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <Icons.Refresh size={13} /> 다시 풀기
            </button>
            <button onClick={onNext} style={{
              flex: 1, padding: '10px', borderRadius: 9,
              background: theme.text, color: theme.bg, fontSize: 12.5, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              다음 지문 <Icons.ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Vocabulary mini */}
      <div style={{ marginTop: 8 }}>
        <h3 style={{ fontSize: 14, color: theme.text, margin: '0 0 10px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>지문 어휘</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lesson.vocabulary.map((v, i) => (
            <div key={i} style={{
              padding: 12, borderRadius: 10,
              background: theme.card, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                <span className="jina-serif" style={{ fontSize: 16, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>{v.word}</span>
                <span style={{ fontSize: 10.5, color: theme.textDim }}>{v.ipa}</span>
                <span style={{ fontSize: 10.5, color: theme.accent, fontWeight: 600 }}>{v.pos}</span>
                <button style={{ marginLeft: 'auto', color: theme.textMuted }}><Icons.Volume size={12} /></button>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{v.meaning}</div>
              <div style={{ fontSize: 11, color: theme.textDim, fontStyle: 'italic', marginTop: 3 }}>"{v.ex}"</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// AI side panel (when "Jina에게 물어보기" is open)
function JinaSidePanel({ theme, aiConfig, onClose }) {
  const { faq } = React.useContext(LessonCtx);   // 추천 질문도 서버 콘텐츠(lessons.faq)
  const suggestions = faq?.length ? faq : DEFAULT_FAQ;
  const { messages, loading, send } = useJinaChat([]);
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading]);
  const modelInfo = window.JINA_AI.modelLabel(aiConfig);
  return (
    <div style={{
      width: 380, flex: '0 0 auto',
      borderLeft: `1px solid ${theme.border}`,
      background: theme.bgSoft,
      display: 'flex', flexDirection: 'column',
      animation: 'jina-rise .25s ease-out',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <JinaAvatar size={32} pulsing theme={theme} />
        <div style={{ flex: 1 }}>
          <div className="jina-serif" style={{ fontSize: 15, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>Jina에게 물어보기</div>
          <div style={{ fontSize: 10.5, color: theme.textDim }}>이 지문에 대해 무엇이든 질문하세요</div>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, color: theme.textMuted, display: 'grid', placeItems: 'center' }}>
          <Icons.X size={14} />
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 16px 4px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
              자주 묻는 질문 ↓
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {suggestions.map((q, i) => (
                <button key={i} onClick={() => send(q)} style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: theme.card, border: `1px solid ${theme.border}`,
                  textAlign: 'left', fontSize: 12.5, color: theme.text, lineHeight: 1.4,
                  display: 'flex', alignItems: 'flex-start', gap: 6,
                }}>
                  <Icons.Sparkle size={11} style={{ color: theme.accent, marginTop: 3, flex: '0 0 auto' }} />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          m.role === 'user'
            ? <LiveUserMessage key={i} theme={theme} msg={m} compact />
            : <LiveJinaMessage key={i} theme={theme} msg={m} compact />
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <JinaAvatar size={28} pulsing theme={theme} />
            <div style={{ padding: '10px 14px', borderRadius: 14, background: theme.chipBg, border: `1px solid ${theme.border}`, display: 'inline-flex', gap: 4, alignSelf: 'flex-start' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: theme.textMuted, animation: `jina-pulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <JinaInputBar
        theme={theme}
        onSend={send}
        loading={loading}
        provider={aiConfig?.provider || 'ollama'}
        modelInfo={modelInfo}
        compact
      />
    </div>
  );
}

// 로딩/에러 플레이스홀더 — current 가 없을 때도 빈 화면을 보이지 않는다.
function LessonPlaceholder({ theme, loading, error }) {
  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.text,
      display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center',
    }}>
      <div style={{ maxWidth: 420 }}>
        <div className="jina-serif" style={{ fontSize: 18, fontStyle: 'italic', marginBottom: 8 }}>
          {loading ? '지문을 불러오는 중…' : '지문을 불러올 수 없습니다'}
        </div>
        {error && (
          <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6 }}>{error}</div>
        )}
      </div>
    </div>
  );
}

function LessonDesktop({ theme, aiConfig, onNavigate }) {
  const [askingAI, setAskingAI] = React.useState(true);
  const [highlighted, setHighlighted] = React.useState(null);
  const { current: currentLesson, currentLoading, listLoading, error, next } = useLesson();
  const onNext = () => {
    next();
    setHighlighted(null);
  };
  if (!currentLesson) {
    return <LessonPlaceholder theme={theme} loading={currentLoading || listLoading} error={error} />;
  }
  return (
    <LessonCtx.Provider value={currentLesson}>
      <div className="jina-root" style={{
        width: '100%', height: '100%',
        background: theme.bg, color: theme.text,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <LessonTopBar theme={theme} askingAI={askingAI} setAskingAI={setAskingAI} onBack={() => onNavigate && onNavigate('dashboard')} />
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: askingAI ? '1.2fr 1fr 380px' : '1.2fr 1fr',
          minHeight: 0,
        }}>
          <PassageColumn theme={theme} highlighted={highlighted} setHighlighted={setHighlighted} />
          {/* key로 리마운트해도 답/결과는 스토어에 있어 소실되지 않는다 */}
          <QuestionsColumn key={currentLesson.id} theme={theme} onNext={onNext} />
          {askingAI && <JinaSidePanel theme={theme} aiConfig={aiConfig} onClose={() => setAskingAI(false)} />}
        </div>
      </div>
    </LessonCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────
// Mobile Lesson
// ─────────────────────────────────────────────────────
function LessonMobile({ theme, aiConfig, onNavigate }) {
  const [tab, setTab] = React.useState('passage'); // passage | questions | jina
  const [highlighted, setHighlighted] = React.useState(null);
  const { current: currentLesson, currentLoading, listLoading, error, progress, next } = useLesson();
  const onNext = () => { next(); setHighlighted(null); setTab('passage'); };
  if (!currentLesson) {
    return <LessonPlaceholder theme={theme} loading={currentLoading || listLoading} error={error} />;
  }
  return (
    <LessonCtx.Provider value={currentLesson}>
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 12px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={() => onNavigate && onNavigate('dashboard')} aria-label="대시보드로 돌아가기" style={{ width: 30, height: 30, borderRadius: 8, color: theme.text, display: 'grid', placeItems: 'center' }}>
          <Icons.ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
            <Pill theme={theme} color={theme.accent} bg={theme.accent + '20'}>PART 7</Pill>
            <span style={{ fontSize: 10, color: theme.textMuted }}>{progress.done}/{progress.total}</span>
          </div>
          <div style={{ fontSize: 13, color: theme.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentLesson.subtitle}
          </div>
        </div>
        <button style={{ width: 30, height: 30, borderRadius: 8, color: theme.textMuted, display: 'grid', placeItems: 'center' }}>
          <Icons.Settings size={15} />
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ padding: '8px 12px', display: 'flex', gap: 6, borderBottom: `1px solid ${theme.border}`, background: theme.bgSoft }}>
        {[
          { id: 'passage', label: '지문', icon: Icons.Book },
          { id: 'questions', label: `문제 ${currentLesson.questions.length}`, icon: Icons.Target },
          { id: 'jina', label: 'Jina', icon: Icons.Sparkles, highlight: true },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '8px 10px', borderRadius: 9,
            background: tab === t.id ? theme.text : 'transparent',
            color: tab === t.id ? theme.bg : theme.textMuted,
            fontSize: 12, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            position: 'relative',
          }}>
            {t.highlight && tab !== t.id && (
              <span style={{ position: 'absolute', top: 5, right: 8, width: 5, height: 5, borderRadius: '50%', background: theme.accent }} />
            )}
            <t.icon size={12} stroke={tab === t.id ? 2.2 : 1.8} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 'passage' && (
          <div style={{ padding: '16px 16px 80px', background: theme.surface, minHeight: '100%' }}>
            <div style={{ padding: 12, borderRadius: 10, background: theme.bgSoft, border: `1px solid ${theme.border}`, marginBottom: 16, fontSize: 11.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Pill theme={theme} color={theme.accent2} bg={theme.accent2 + '20'}>{currentLesson.passage.type}</Pill>
                <span style={{ color: theme.textDim, fontSize: 10 }}>{currentLesson.passage.date}</span>
              </div>
              <div style={{ color: theme.textMuted, lineHeight: 1.5 }}>
                <div><b style={{ color: theme.textDim }}>From</b> {currentLesson.passage.from}</div>
                <div><b style={{ color: theme.textDim }}>To</b> {currentLesson.passage.to}</div>
              </div>
              <div className="jina-serif" style={{ fontSize: 15, color: theme.text, fontWeight: 500, fontStyle: 'italic', marginTop: 6 }}>
                {currentLesson.passage.subject}
              </div>
            </div>
            {currentLesson.passage.body.map((para, i) => (
              <p key={i} style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.7, color: theme.text }}>
                {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
                  part.startsWith('**')
                    ? <b key={j} style={{ background: theme.accent + '22', padding: '0 3px', borderRadius: 3 }}>{part.slice(2, -2)}</b>
                    : part
                )}
              </p>
            ))}
          </div>
        )}
        {tab === 'questions' && (
          <div style={{ padding: 14 }}>
            <QuestionsColumn key={currentLesson.id} theme={theme} onNext={onNext} />
          </div>
        )}
        {tab === 'jina' && (
          <MobileJinaTab theme={theme} aiConfig={aiConfig} />
        )}
      </div>
    </div>
    </LessonCtx.Provider>
  );
}

function MobileJinaTab({ theme, aiConfig }) {
  const { faq } = React.useContext(LessonCtx);
  const suggestions = (faq?.length ? faq : DEFAULT_FAQ).slice(0, 3);
  const { messages, loading, send } = useJinaChat([]);
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading]);
  const modelInfo = window.JINA_AI.modelLabel(aiConfig);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: theme.textDim, padding: '0 4px 4px' }}>자주 묻는 질문 ↓</div>
            {suggestions.map((q, i) => (
              <button key={i} onClick={() => send(q)} style={{
                padding: '10px 12px', borderRadius: 10,
                background: theme.card, border: `1px solid ${theme.border}`,
                textAlign: 'left', fontSize: 12.5, color: theme.text,
                display: 'flex', alignItems: 'flex-start', gap: 6,
              }}>
                <Icons.Sparkle size={11} style={{ color: theme.accent, marginTop: 3 }} />
                <span>{q}</span>
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          m.role === 'user'
            ? <LiveUserMessage key={i} theme={theme} msg={m} compact />
            : <LiveJinaMessage key={i} theme={theme} msg={m} compact />
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <JinaAvatar size={26} pulsing theme={theme} />
            <div style={{ padding: '8px 12px', borderRadius: 14, background: theme.chipBg, border: `1px solid ${theme.border}`, display: 'inline-flex', gap: 4, alignSelf: 'flex-start' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: theme.textMuted, animation: `jina-pulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>
      <JinaInputBar
        theme={theme}
        onSend={send}
        loading={loading}
        provider={aiConfig?.provider || 'ollama'}
        modelInfo={modelInfo}
        compact
      />
    </div>
  );
}

window.LessonDesktop = LessonDesktop;
window.LessonMobile = LessonMobile;
