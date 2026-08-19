// lesson.jsx — TOEIC Part 7 Reading lesson page (desktop + mobile)
// Content: a business email + 3 multiple-choice questions + AI explanation panel.

const LESSON_DATA = {
  id: 'toeic-part7-set23',
  title: 'TOEIC Part 7 — 단일 지문',
  subtitle: 'Set 23 · 비즈니스 이메일',
  progress: { done: 4, total: 10 },
  passage: {
    type: 'EMAIL',
    from: 'Daniel Park <d.park@meridian-co.com>',
    to: 'All Marketing Team',
    cc: 'Hannah Lee, J. Whitmore',
    date: 'Tuesday, May 26 · 09:14',
    subject: 'Q3 Campaign Kickoff — Action Items',
    body: [
      "Dear team,",
      "Thank you all for the productive workshop yesterday. As discussed, we will be moving forward with the \"Bright Mornings\" campaign as our Q3 priority. Below is a summary of the immediate next steps:",
      "1. Hannah will finalize the creative brief by Friday, May 29.",
      "2. James, please coordinate with the external agency to confirm the photo-shoot schedule. We are aiming for the week of June 8.",
      "3. The media buy budget has been approved at $48,000 — a 12% increase from Q2.",
      "I would also like to remind everyone that **the launch date has been moved up by one week** to accommodate the regional sales conference. Please update your project plans accordingly.",
      "If you anticipate any blockers, please reach out to me directly before Thursday's stand-up. I appreciate your continued effort and flexibility.",
      "Best regards,",
      "Daniel Park · Marketing Director",
    ],
  },
  questions: [
    {
      n: 1,
      stem: 'What is the main purpose of the email?',
      options: [
        { id: 'A', text: 'To announce a new hire in the marketing team' },
        { id: 'B', text: 'To outline next steps for an upcoming campaign', correct: true },
        { id: 'C', text: 'To request approval for a budget increase' },
        { id: 'D', text: 'To reschedule a regional sales conference' },
      ],
    },
    {
      n: 2,
      stem: 'According to the email, what is true about the launch date?',
      options: [
        { id: 'A', text: 'It has been postponed by one week' },
        { id: 'B', text: 'It is scheduled for the week of June 8' },
        { id: 'C', text: 'It has been moved one week earlier', correct: true },
        { id: 'D', text: 'It will be decided during Thursday\'s stand-up' },
      ],
    },
    {
      n: 3,
      stem: 'The word "blockers" in paragraph 5 is closest in meaning to —',
      options: [
        { id: 'A', text: 'budget cuts' },
        { id: 'B', text: 'obstacles', correct: true },
        { id: 'C', text: 'colleagues' },
        { id: 'D', text: 'deliverables' },
      ],
    },
  ],
  vocabulary: [
    { word: 'accommodate', ipa: '/əˈkɑːmədeɪt/', pos: 'v.', meaning: '~을 수용하다, 맞추다', ex: 'to accommodate the schedule' },
    { word: 'anticipate', ipa: '/ænˈtɪsɪpeɪt/', pos: 'v.', meaning: '예상하다, 미리 대비하다', ex: 'anticipate any blockers' },
    { word: 'finalize', ipa: '/ˈfaɪnəlaɪz/', pos: 'v.', meaning: '최종 확정하다', ex: 'finalize the brief by Friday' },
  ],
};

const LESSON_DATA_2 = {
  id: 'toeic-part7-set24',
  title: 'TOEIC Part 7 — 단일 지문',
  subtitle: 'Set 24 · 공지 및 안내문',
  progress: { done: 5, total: 10 },
  passage: {
    type: 'NOTICE',
    from: 'Facilities Management',
    to: 'All Staff',
    cc: '',
    date: 'Wednesday, May 27 · 08:00',
    subject: 'Building Maintenance — Elevator Out of Service (May 28–29)',
    body: [
      "Dear colleagues,",
      "Please be advised that **Elevator B in the North Tower will be taken out of service from Thursday, May 28 (7:00 AM) through Friday, May 29 (6:00 PM)** for scheduled hydraulic maintenance.",
      "During this period, Elevator A and the stairwells on both the East and West sides of the building will remain fully operational. We ask all staff to plan accordingly and allow extra travel time between floors.",
      "Employees who require mobility assistance are requested to contact Facilities Management at ext. 4400 by Wednesday afternoon so that appropriate arrangements can be made.",
      "The maintenance is expected to be completed by Friday evening. However, if additional work is required, we will provide an updated timeline no later than Friday at noon.",
      "We apologize for the inconvenience and appreciate your patience and cooperation.",
      "Facilities Management Team",
    ],
  },
  questions: [
    {
      n: 1,
      stem: 'What is the purpose of this notice?',
      options: [
        { id: 'A', text: 'To announce the construction of a new elevator' },
        { id: 'B', text: 'To inform staff about temporary elevator unavailability', correct: true },
        { id: 'C', text: 'To request volunteers for building maintenance' },
        { id: 'D', text: 'To introduce new building safety procedures' },
      ],
    },
    {
      n: 2,
      stem: 'According to the notice, what should employees needing assistance do?',
      options: [
        { id: 'A', text: 'Use the stairwells on the West side only' },
        { id: 'B', text: 'Email the Facilities Management team' },
        { id: 'C', text: 'Call extension 4400 by Wednesday afternoon', correct: true },
        { id: 'D', text: 'Wait for further instructions on Friday noon' },
      ],
    },
    {
      n: 3,
      stem: 'When will the updated timeline be provided IF additional work is needed?',
      options: [
        { id: 'A', text: 'By Thursday morning' },
        { id: 'B', text: 'By Friday at noon', correct: true },
        { id: 'C', text: 'By Friday at 6:00 PM' },
        { id: 'D', text: 'By the following Monday' },
      ],
    },
  ],
  vocabulary: [
    { word: 'operational', ipa: '/ˌɒpəˈreɪʃənəl/', pos: 'adj.', meaning: '운용 가능한, 작동 중인', ex: 'remain fully operational' },
    { word: 'hydraulic', ipa: '/haɪˈdrɔːlɪk/', pos: 'adj.', meaning: '유압의, 수압을 이용한', ex: 'hydraulic maintenance' },
    { word: 'mobility', ipa: '/moʊˈbɪlɪti/', pos: 'n.', meaning: '이동성, 운동 능력', ex: 'require mobility assistance' },
  ],
};

const LESSONS = [LESSON_DATA, LESSON_DATA_2];

const LessonCtx = React.createContext(LESSON_DATA);

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
function LessonTopBar({ theme, askingAI, setAskingAI }) {
  const { progress, title, subtitle } = React.useContext(LessonCtx);
  return (
    <div style={{
      padding: '14px 28px',
      borderBottom: `1px solid ${theme.border}`,
      display: 'flex', alignItems: 'center', gap: 14,
      background: theme.bg,
    }}>
      <button style={{ width: 34, height: 34, borderRadius: 9, background: theme.chipBg, color: theme.text, display: 'grid', placeItems: 'center' }}>
        <Icons.ArrowLeft size={16} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <Pill theme={theme} color={theme.accent} bg={theme.accent + '20'}>READING · PART 7</Pill>
          <span style={{ fontSize: 11, color: theme.textMuted }}>난이도 ★★★☆☆ · 권장 6분</span>
        </div>
        <div style={{ fontSize: 15, color: theme.text, fontWeight: 600 }}>
          {title} <span style={{ color: theme.textMuted, fontWeight: 400 }}>· {subtitle}</span>
        </div>
      </div>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10, background: theme.chipBg }}>
        <span style={{ fontSize: 11, color: theme.textMuted }}>진도</span>
        <div style={{ width: 100, height: 6, borderRadius: 999, background: theme.border, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress.done / progress.total * 100}%`, background: theme.accentGrad }} />
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
function QuestionCard({ theme, q, answer, onAnswer, revealed }) {
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
          const showRight = revealed && o.correct;
          const showWrong = revealed && isSelected && !o.correct;
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
      {revealed && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 10,
          background: theme.accentGradSoft, fontSize: 12, color: theme.textMuted, lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <Icons.Sparkles size={12} style={{ color: theme.accent }} />
            <b style={{ color: theme.text }}>Jina 해설</b>
          </div>
          {q.n === 1 && '이메일 첫 문단의 "moving forward with the campaign as our Q3 priority"와 본문 1-3번 액션 아이템이 핵심 단서예요. 캠페인의 다음 단계를 정리한 이메일이에요.'}
          {q.n === 2 && '"the launch date has been moved up by one week"의 move up은 "앞당기다"라는 뜻이에요. (C) one week earlier가 정답.'}
          {q.n === 3 && 'blockers는 IT/비즈니스 영어에서 "진행을 가로막는 장애물"을 뜻해요. 가장 가까운 동의어는 obstacles.'}
        </div>
      )}
    </div>
  );
}

// Questions column
function QuestionsColumn({ theme, onNext }) {
  const lesson = React.useContext(LessonCtx);
  const [answers, setAnswers] = React.useState({});
  const [revealed, setRevealed] = React.useState(false);
  const onAnswer = (n, id) => {
    if (revealed) return;
    setAnswers((a) => ({ ...a, [n]: id }));
  };
  const correctCount = lesson.questions.filter((q) => {
    const a = answers[q.n];
    return a && q.options.find((o) => o.id === a)?.correct;
  }).length;
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
          answer={answers[q.n]} onAnswer={onAnswer} revealed={revealed} />
      ))}

      {/* Action */}
      {!revealed ? (
        <button onClick={() => setRevealed(true)} disabled={!allAnswered} style={{
          padding: '14px', borderRadius: 12,
          background: allAnswered ? theme.text : theme.chipBg,
          color: allAnswered ? theme.bg : theme.textMuted,
          fontSize: 14, fontWeight: 700,
          cursor: allAnswered ? 'pointer' : 'not-allowed',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {allAnswered ? '채점하기' : `${lesson.questions.length - Object.keys(answers).length}개 문제를 더 풀어주세요`}
          {allAnswered && <Icons.ArrowRight size={14} />}
        </button>
      ) : (
        <div style={{
          padding: 16, borderRadius: 12,
          background: correctCount === lesson.questions.length ? theme.success + '15' : theme.accentGradSoft,
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
                {correctCount} <span style={{ color: theme.textDim, fontSize: 18 }}>/ {lesson.questions.length} 정답</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setAnswers({}); setRevealed(false); }} style={{
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
  const { messages, loading, send } = useJinaChat([]);
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading]);
  const modelInfo = aiConfig?.provider === 'ollama' ? aiConfig.ollamaModel : 'haiku-4-5';
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
              {[
                '"moved up by one week"을 한국어로 풀어주세요',
                '이 이메일의 어조(tone)는 어떤가요?',
                'Daniel Park이 가장 강조한 메시지는 무엇인가요?',
                '"accommodate"가 비즈니스에서 쓰이는 다른 예시는?',
              ].map((q, i) => (
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

function LessonDesktop({ theme, aiConfig }) {
  const [askingAI, setAskingAI] = React.useState(true);
  const [highlighted, setHighlighted] = React.useState(null);
  const [lessonIdx, setLessonIdx] = React.useState(0);
  const currentLesson = LESSONS[lessonIdx % LESSONS.length];
  const onNext = () => {
    setLessonIdx((i) => i + 1);
    setHighlighted(null);
  };
  return (
    <LessonCtx.Provider value={currentLesson}>
      <div className="jina-root" style={{
        width: '100%', height: '100%',
        background: theme.bg, color: theme.text,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <LessonTopBar theme={theme} askingAI={askingAI} setAskingAI={setAskingAI} />
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: askingAI ? '1.2fr 1fr 380px' : '1.2fr 1fr',
          minHeight: 0,
        }}>
          <PassageColumn theme={theme} highlighted={highlighted} setHighlighted={setHighlighted} />
          <QuestionsColumn key={lessonIdx} theme={theme} onNext={onNext} />
          {askingAI && <JinaSidePanel theme={theme} aiConfig={aiConfig} onClose={() => setAskingAI(false)} />}
        </div>
      </div>
    </LessonCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────
// Mobile Lesson
// ─────────────────────────────────────────────────────
function LessonMobile({ theme, aiConfig }) {
  const [tab, setTab] = React.useState('passage'); // passage | questions | jina
  const [lessonIdx, setLessonIdx] = React.useState(0);
  const [highlighted, setHighlighted] = React.useState(null);
  const currentLesson = LESSONS[lessonIdx % LESSONS.length];
  const onNext = () => { setLessonIdx((i) => i + 1); setHighlighted(null); setTab('passage'); };
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
        <button style={{ width: 30, height: 30, borderRadius: 8, color: theme.text, display: 'grid', placeItems: 'center' }}>
          <Icons.ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
            <Pill theme={theme} color={theme.accent} bg={theme.accent + '20'}>PART 7</Pill>
            <span style={{ fontSize: 10, color: theme.textMuted }}>4/10</span>
          </div>
          <div style={{ fontSize: 13, color: theme.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Set 23 — 비즈니스 이메일
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
          { id: 'questions', label: '문제 3', icon: Icons.Target },
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
            <QuestionsColumn key={lessonIdx} theme={theme} onNext={onNext} />
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
  const { messages, loading, send } = useJinaChat([]);
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading]);
  const modelInfo = aiConfig?.provider === 'ollama' ? aiConfig.ollamaModel : 'haiku-4-5';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: theme.textDim, padding: '0 4px 4px' }}>자주 묻는 질문 ↓</div>
            {[
              '"moved up by one week" 한국어로?',
              '이메일의 톤은 어떤가요?',
              '"accommodate" 비즈니스 예시',
            ].map((q, i) => (
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
