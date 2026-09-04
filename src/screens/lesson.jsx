// lesson.jsx — TOEIC Part 7 Reading lesson page (desktop + mobile)
// Content: a business email + 3 multiple-choice questions + AI explanation panel.
// 콘텐츠/채점/진도의 단일 소스는 서버 (docs/plan/02-lesson.md) —
// 데이터는 useLesson()(src/shared/lesson-store.jsx)이 GET /api/lessons/:id 로 가져오고,
// 채점은 POST /api/lessons/:id/attempts 서버 채점. 정답/해설은 채점 응답에만 실린다.
// Jina 패널은 store.askLesson(POST /api/lessons/:id/qa) — 프롬프트는 서버가 조립하고 정답/해설은 보내지 않는다.
// 레슨 목록 뷰는 lesson-list.jsx(LessonListView) — 이 파일보다 먼저 로드된다.

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
function LessonTopBar({ theme, askingAI, setAskingAI, onBack, listOpen = false, onToggleList }) {
  const { title, subtitle, difficulty, est_minutes: estMinutes, passage } = React.useContext(LessonCtx);
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
          <Pill theme={theme} color={theme.accent} bg={theme.accent + '20'}>READING · {passage?.type || 'PART 7'}</Pill>
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
      {/* 레슨 목록 토글 — 목록 뷰(lesson-list.jsx)는 lessons(LIST_SELECT)를 kind 로 필터해 보여준다 */}
      <button type="button" data-testid="lesson-list-open" onClick={onToggleList} aria-pressed={listOpen} title="레슨 목록" style={{
        padding: '8px 12px', borderRadius: 10,
        background: listOpen ? theme.text : theme.chipBg,
        color: listOpen ? theme.bg : theme.text,
        fontSize: 12.5, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <Icons.Menu size={13} stroke={2.2} /> 목록
      </button>
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
  // 듣기 버튼용 — 제목 + 본문을 문장으로 이어 브라우저 음성(speech.jsx)으로 읽는다. **강조** 마크는 제거
  const passageText = [p.subject, ...(p.body || [])].join(". ").replace(/[*][*]/g, "");
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
        {/* Part 5 등 헤더 없는 지문에서 빈 From/To/Cc 라벨이 남지 않게 값 있는 행만 렌더 */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', rowGap: 5, color: theme.textMuted }}>
          {p.from && <React.Fragment>
            <span style={{ color: theme.textDim, fontWeight: 600 }}>From</span>
            <span style={{ color: theme.text }}>{p.from}</span>
          </React.Fragment>}
          {p.to && <React.Fragment>
            <span style={{ color: theme.textDim, fontWeight: 600 }}>To</span>
            <span>{p.to}</span>
          </React.Fragment>}
          {p.cc && <React.Fragment>
            <span style={{ color: theme.textDim, fontWeight: 600 }}>Cc</span>
            <span>{p.cc}</span>
          </React.Fragment>}
          {p.subject && <React.Fragment>
            <span style={{ color: theme.textDim, fontWeight: 600 }}>Subject</span>
            <span className="jina-serif" style={{ fontStyle: 'italic', color: theme.text, fontSize: 15, fontWeight: 500 }}>{p.subject}</span>
          </React.Fragment>}
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
        <button type="button" onClick={() => window.jinaSpeak && window.jinaSpeak(passageText, { rate: 0.95 })} title="지문을 브라우저 음성으로 읽어줍니다" style={{ padding: '6px 10px', borderRadius: 8, background: theme.chipBg, color: theme.text, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
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
                <SpeakButton text={v.word} theme={theme} size={12} style={{ marginLeft: 'auto', color: theme.textMuted }} />
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

// ─────────────────────────────────────────────────────
// Jina Q&A (레슨 문답) — 데스크탑 사이드패널·모바일 Jina 탭 공용
// ─────────────────────────────────────────────────────
// useJinaChat(회화 tutor task)이 아니라 store.askLesson(POST /api/lessons/:id/qa)을 쓴다.
// 프롬프트(지문·문항·내가 고른 답)는 서버가 조립하고 정답/해설은 서버가 보내지 않는다(SELECT 조차 안 함).
//  - 제출 전(attempt 없음): 지문 질문만 — 문항 칩 없음 + 안내 문구(qa-notice). 서버는 stateless.
//  - 제출 후(attempt 있음): 문항 칩(qa-item-chip)으로 item_id 를 고르고 attempt_id 와 함께 보낸다(서버가 CLI 세션 resume).
// 대화 상태는 컴포넌트 로컬 — 호출측이 key={lesson.id} 로 지문마다 새 대화를 만든다.
// active: display:none 으로 숨겨진 탭(모바일)이 다시 보일 때 스크롤을 맞추기 위한 힌트.
function LessonQaChat({ theme, aiConfig, compact = false, active = true }) {
  const lesson = React.useContext(LessonCtx);
  const { faq, questions } = lesson;   // 추천 질문도 서버 콘텐츠(lessons.faq)
  const suggestions = faq?.length ? faq : DEFAULT_FAQ;
  const shown = compact ? suggestions.slice(0, 3) : suggestions;
  const { result, retaking, askLesson, consumePendingAsk } = useLesson();
  // 새로고침 뒤에도 상세 DTO의 last_attempt_id로 제출 후 Q&A 문맥을 복원한다.
  const attemptId = result?.attempt?.id || (!retaking ? lesson.last_attempt_id : null) || null;
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [itemId, setItemId] = React.useState(null);          // 선택 문항(position). null = 문항 전체
  const [draft, setDraft] = React.useState('');              // 입력창 초안 — 오답 노트에서 넘어온 질문을 채운다
  const abortRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  React.useEffect(() => { setItemId(null); }, [attemptId]);  // 채점/다시 풀기 → 문항 선택 초기화

  // 오답 노트에서 "Jina에게 물어보기"로 넘어온 문맥(문항·질문 초안)을 한 번만 반영한다.
  // 자동 전송은 하지 않는다 — AI 호출은 사용자가 누를 때만(비용·의외성).
  React.useEffect(() => {
    const pending = consumePendingAsk(lesson.id);
    if (!pending) return;
    if (pending.itemId) setItemId(pending.itemId);
    if (pending.question) setDraft(pending.question);
  }, [lesson.id, attemptId, consumePendingAsk]);
  React.useEffect(() => {
    if (active && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading, active]);
  React.useEffect(() => () => abortRef.current?.abort(), []); // 언마운트(지문 전환·패널 닫기) 시 진행 중 요청 취소

  const provider = aiConfig?.provider || 'ollama';
  const modelInfo = window.JINA_AI.modelLabel(aiConfig);

  const send = async (raw) => {
    const question = (raw || '').trim();
    if (!question || loading) return;
    const asked = attemptId ? itemId : null;
    setMessages((m) => [...m, { role: 'user', content: question, itemId: asked, time: window.jinaHHMM() }]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await askLesson({
      question, attemptId, itemId: asked || undefined,
      provider: aiConfig?.provider,
      // 신형({model:{[provider]}})과 구형 캔버스({ollamaModel})를 모두 허용 — ai-provider.askJina 와 같은 규칙
      model: aiConfig?.model?.[provider] ?? (provider === 'ollama' ? aiConfig?.ollamaModel : null) ?? null,
      // ollamaUrl 은 보내지 않는다 — 서버가 config.ai.ollamaUrl 만 쓴다 (플랜 10.5 S2 SSRF).
      signal: controller.signal,
    });
    abortRef.current = null;
    setLoading(false);
    const time = window.jinaHHMM();
    if (res.code === 'ABORTED') {
      setMessages((m) => [...m, { role: 'assistant', kind: 'qa-cancel', time }]);
      return;
    }
    if (!res.ok) {
      setMessages((m) => [...m, {
        role: 'assistant', kind: 'jina-error',
        content: res.error || '응답 실패', hint: res.hint || null, provider: res.provider || provider, time,
      }]);
      return;
    }
    setMessages((m) => [...m, {
      role: 'assistant', kind: 'qa',
      answer: res.answer || '(응답 없음)',
      citations: Array.isArray(res.citations) ? res.citations.filter((c) => c && c.quote) : [],
      citationsDropped: res.citations_dropped || 0,
      mode: res.mode, resumed: Boolean(res.resumed), itemId: asked,
      provider: res.provider || provider, time,
    }]);
  };
  const cancel = () => abortRef.current?.abort();

  const chipStyle = (on) => ({
    padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
    background: on ? theme.accent : theme.chipBg, color: on ? '#fff' : theme.textMuted,
    border: `1px solid ${on ? theme.accent : theme.border}`,
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 모드 안내(제출 전) / 문항 칩(제출 후) — 메시지 목록 위에 고정해 스크롤 중에도 문항을 바꿀 수 있다 */}
      <div style={{ flex: '0 0 auto', padding: compact ? '12px 12px 0' : '14px 16px 0' }}>
        {!attemptId ? (
          <div data-testid="qa-notice" style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            padding: '9px 11px', borderRadius: 10, fontSize: 11.5, lineHeight: 1.5,
            background: theme.accentGradSoft, border: `1px solid ${theme.border}`, color: theme.textMuted,
          }}>
            <Icons.Sparkle size={11} style={{ color: theme.accent, marginTop: 3, flex: '0 0 auto' }} />
            <span>제출 전에는 지문에 대해서만 답해요 · 제출 후에는 문항별로 질문할 수 있어요</span>
          </div>
        ) : (
          <div data-testid="qa-item-picker" style={{ padding: '9px 11px', borderRadius: 10, background: theme.card, border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 7, lineHeight: 1.4 }}>
              <b style={{ color: theme.text }}>질문할 문항</b> · 고른 문항의 선택지와 내 답을 함께 보고 답해요
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" data-testid="qa-item-all" aria-pressed={itemId === null} onClick={() => setItemId(null)} style={chipStyle(itemId === null)}>전체</button>
              {questions.map((q) => (
                <button key={q.n} type="button" data-testid="qa-item-chip" data-item-id={q.n} aria-pressed={itemId === q.n}
                  onClick={() => setItemId(itemId === q.n ? null : q.n)} title={q.stem} style={chipStyle(itemId === q.n)}>
                  Q{q.n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: compact ? '12px 12px 4px' : '14px 16px 4px', display: 'flex', flexDirection: 'column', gap: compact ? 12 : 14 }}>
        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: compact ? 11 : 12, color: compact ? theme.textDim : theme.textMuted, marginBottom: compact ? 6 : 10, lineHeight: 1.5, padding: compact ? '0 4px' : 0 }}>
              자주 묻는 질문 ↓
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {shown.map((q, i) => (
                <button key={i} type="button" data-testid="qa-faq" onClick={() => send(q)} style={{
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

        {messages.map((m, i) => {
          if (m.role === 'user') return <QaUserMessage key={i} theme={theme} msg={m} />;
          if (m.kind === 'jina-error') return <div key={i} data-testid="qa-error"><LiveJinaMessage theme={theme} msg={m} compact /></div>;
          if (m.kind === 'qa-cancel') {
            return <div key={i} style={{ fontSize: 11, color: theme.textDim, textAlign: 'center', padding: '2px 0' }}>질문을 취소했어요 · {m.time}</div>;
          }
          return <QaAnswerMessage key={i} theme={theme} msg={m} />;
        })}

        {loading && (
          <div data-testid="qa-loading" style={{ display: 'flex', gap: 8 }}>
            <JinaAvatar size={compact ? 26 : 28} pulsing theme={theme} />
            <div style={{ padding: compact ? '8px 12px' : '10px 14px', borderRadius: 14, background: theme.chipBg, border: `1px solid ${theme.border}`, display: 'inline-flex', gap: 4, alignSelf: 'flex-start' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: compact ? 4 : 5, height: compact ? 4 : 5, borderRadius: '50%', background: theme.textMuted, animation: `jina-pulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <LessonQaInput
        theme={theme} onSend={send} onCancel={cancel} loading={loading}
        provider={provider} modelInfo={modelInfo}
        itemId={attemptId ? itemId : null} compact={compact}
        draft={draft} onDraftUsed={() => setDraft('')}
      />
    </div>
  );
}

// 내 질문 말풍선 — 문항을 골라 물었으면 위에 Q{n} 표식
function QaUserMessage({ theme, msg }) {
  return (
    <div>
      {msg.itemId && (
        <div style={{ textAlign: 'right', fontSize: 10.5, color: theme.accent, fontWeight: 700, marginBottom: 4, paddingRight: 36 }}>Q{msg.itemId} 문항에 대해</div>
      )}
      <LiveUserMessage theme={theme} msg={msg} compact />
    </div>
  );
}

// Jina 답변 말풍선 — answer(한국어 설명) + citations(지문 원문 인용, 서버가 부분문자열 검증한 것만)
function QaAnswerMessage({ theme, msg }) {
  const label = (window.JINA_AI.PROVIDER_META[msg.provider]?.label || msg.provider || '').toUpperCase();
  const scope = msg.mode === 'post_submit' ? (msg.itemId ? `Q${msg.itemId} 문항` : '문항 전체') : '지문';
  return (
    <div data-testid="qa-message" style={{ display: 'flex', gap: 8, animation: 'jina-rise .3s ease-out' }}>
      <JinaAvatar size={28} theme={theme} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span className="jina-serif" style={{ fontSize: 14, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>Jina</span>
          {label && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: theme.accent + '20', color: theme.accent, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
          )}
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: theme.chipBg, color: theme.textMuted, fontWeight: 600 }}>{scope}</span>
          <span style={{ fontSize: 10.5, color: theme.textDim }}>{msg.time}</span>
        </div>
        <div style={{ padding: '11px 13px', borderRadius: 16, borderTopLeftRadius: 4, background: theme.chipBg, border: `1px solid ${theme.border}` }}>
          <div data-testid="qa-answer" style={{ fontSize: 13.5, color: theme.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.answer}</div>
          {msg.citations.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10.5, color: theme.textDim, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>지문 인용</div>
              {msg.citations.map((c, i) => (
                <blockquote key={i} data-testid="qa-citation" className="jina-serif" style={{
                  margin: 0, padding: '3px 10px', borderLeft: `2px solid ${theme.accent}`,
                  fontStyle: 'italic', fontSize: 12.5, color: theme.textMuted, lineHeight: 1.55,
                }}>“{c.quote}”</blockquote>
              ))}
            </div>
          )}
          {msg.citationsDropped > 0 && (
            <div style={{ marginTop: 6, fontSize: 10.5, color: theme.textDim }}>지문과 일치하지 않는 인용 {msg.citationsDropped}개는 표시하지 않았어요</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Q&A 입력줄 — JinaInputBar(회화용: 영어로 말 걸기·음성 모드)와 달리 한국어 질문 500자 + 진행 중 취소
function LessonQaInput({ theme, onSend, onCancel, loading, provider, modelInfo, itemId, compact = false, draft = '', onDraftUsed }) {
  const [text, setText] = React.useState('');
  const ref = React.useRef(null);
  // 외부에서 넘어온 초안(오답 노트 → Jina에게 물어보기)을 입력창에 채우고 포커스한다.
  React.useEffect(() => {
    if (!draft) return;
    setText(draft);
    if (onDraftUsed) onDraftUsed();
    setTimeout(() => ref.current?.focus(), 60);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = window.JINA_AI.PROVIDER_META[provider] || {};
  const canSend = text.trim().length > 0 && !loading;
  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    setTimeout(() => ref.current?.focus(), 50);
  };
  return (
    <div style={{ padding: compact ? '10px 12px 16px' : '12px 14px 18px', borderTop: `1px solid ${theme.border}`, background: theme.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
          background: (meta.color || '#888') + '22', color: meta.color || '#888',
          fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          {`${meta.label || provider} · ${modelInfo}`}
        </span>
        {itemId && (
          <span style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 999, background: theme.accent + '20', color: theme.accent, fontWeight: 700 }}>Q{itemId} 문항</span>
        )}
        {loading && (
          <span style={{ fontSize: 11, color: theme.textMuted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.accent, animation: 'jina-pulse 1s infinite' }} />
            Jina가 답변 중…
            <button type="button" data-testid="qa-cancel" onClick={onCancel} style={{ fontSize: 11, color: theme.error, fontWeight: 600, padding: '0 4px' }}>취소</button>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: text.length >= 450 ? theme.warning : theme.textDim }}>{text.length}자 / 500</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8,
        padding: '8px 10px', borderRadius: 14,
        background: theme.card, border: `1px solid ${theme.borderStrong}`,
      }}>
        <textarea
          ref={ref}
          data-testid="qa-input"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            // 한글 IME 조합 중 Enter 는 글자 확정이므로 전송하지 않는다
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
          rows={1}
          placeholder={itemId ? `Q${itemId} 문항에 대해 질문하세요…` : '지문에 대해 질문하세요…  (Enter = 전송, Shift+Enter = 줄바꿈)'}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: theme.text, fontSize: 13.5, lineHeight: 1.5, padding: '6px 4px',
            resize: 'none', minHeight: 26, maxHeight: 110, fontFamily: 'inherit',
          }}
        />
        <button type="button" data-testid="qa-send" onClick={submit} disabled={!canSend} style={{
          padding: '8px 12px', borderRadius: 10,
          background: canSend ? theme.text : theme.chipBg,
          color: canSend ? theme.bg : theme.textMuted,
          fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          cursor: canSend ? 'pointer' : 'not-allowed',
          transition: 'all .15s',
        }}>
          전송 <Icons.Send size={12} />
        </button>
      </div>
    </div>
  );
}

// AI side panel (when "Jina에게 물어보기" is open) — 본문은 LessonQaChat
function JinaSidePanel({ theme, aiConfig, onClose }) {
  const { result } = useLesson();
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
          <div style={{ fontSize: 10.5, color: theme.textDim }}>{result ? '지문과 문항에 대해 질문하세요' : '이 지문에 대해 무엇이든 질문하세요'}</div>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, color: theme.textMuted, display: 'grid', placeItems: 'center' }}>
          <Icons.X size={14} />
        </button>
      </div>
      <LessonQaChat theme={theme} aiConfig={aiConfig} />
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
  const [view, setView] = React.useState('study'); // study | list
  const { current: currentLesson, currentLoading, listLoading, error, next } = useLesson();
  const onNext = () => {
    next();
    setHighlighted(null);
  };
  const openStudy = () => { setView('study'); setHighlighted(null); };
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
        <LessonTopBar theme={theme} askingAI={askingAI} setAskingAI={setAskingAI}
          onBack={() => onNavigate && onNavigate('dashboard')}
          listOpen={view === 'list'} onToggleList={() => setView((v) => (v === 'list' ? 'study' : 'list'))} />
        {view === 'list' ? (
          /* 목록 뷰 — 행 클릭 → select(id) 후 학습 뷰 복귀 (lesson-list.jsx) */
          <div style={{ flex: 1, minHeight: 0 }}>
            <LessonListView theme={theme} onPick={openStudy} onClose={openStudy} />
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateColumns: askingAI ? '1.2fr 1fr 380px' : '1.2fr 1fr',
            minHeight: 0,
          }}>
            <PassageColumn theme={theme} highlighted={highlighted} setHighlighted={setHighlighted} />
            {/* key로 리마운트해도 답/결과는 스토어에 있어 소실되지 않는다 */}
            <QuestionsColumn key={currentLesson.id} theme={theme} onNext={onNext} />
            {/* Q&A 대화는 지문 단위 — 지문이 바뀌면 key 로 새 대화 (QuestionsColumn 과 형제라 키 접두어로 구분) */}
            {askingAI && <JinaSidePanel key={`qa-${currentLesson.id}`} theme={theme} aiConfig={aiConfig} onClose={() => setAskingAI(false)} />}
          </div>
        )}
      </div>
    </LessonCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────
// Mobile Lesson
// ─────────────────────────────────────────────────────
function LessonMobile({ theme, aiConfig, onNavigate }) {
  const [tab, setTab] = React.useState('passage'); // list | passage | questions | jina
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
            <Pill theme={theme} color={theme.accent} bg={theme.accent + '20'}>{currentLesson.passage?.type || 'PART 7'}</Pill>
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
          { id: 'list', label: '목록', icon: Icons.Menu },
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
        {tab === 'list' && (
          <LessonListView theme={theme} compact onPick={() => { setTab('passage'); setHighlighted(null); }} />
        )}
        {tab === 'passage' && (
          <div style={{ padding: '16px 16px 80px', background: theme.surface, minHeight: '100%' }}>
            <div style={{ padding: 12, borderRadius: 10, background: theme.bgSoft, border: `1px solid ${theme.border}`, marginBottom: 16, fontSize: 11.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Pill theme={theme} color={theme.accent2} bg={theme.accent2 + '20'}>{currentLesson.passage.type}</Pill>
                <span style={{ color: theme.textDim, fontSize: 10 }}>{currentLesson.passage.date}</span>
              </div>
              {(currentLesson.passage.from || currentLesson.passage.to) && (
                <div style={{ color: theme.textMuted, lineHeight: 1.5 }}>
                  {currentLesson.passage.from && <div><b style={{ color: theme.textDim }}>From</b> {currentLesson.passage.from}</div>}
                  {currentLesson.passage.to && <div><b style={{ color: theme.textDim }}>To</b> {currentLesson.passage.to}</div>}
                </div>
              )}
              <div className="jina-serif" style={{ fontSize: 15, color: theme.text, fontWeight: 500, fontStyle: 'italic', marginTop: 6 }}>
                {currentLesson.passage.subject}
              </div>
            </div>
            {currentLesson.passage.body.map((line) => (
              // LC 스크립트는 [{speaker,text}] 객체다(플랜 10.7 §3.2) — 읽기 지문(문자열 문단)과
              // 같은 자리에 오므로 여기서 한 줄 텍스트로 되돌린다.
              typeof line === 'object' && line !== null ? `${line.speaker}: ${line.text}` : line
            )).map((para, i) => (
              <p key={i} style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.7, color: theme.text }}>
                {String(para).split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
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
        {/* Jina 탭은 display:none 으로 유지 — 문제 탭에서 채점하고 돌아와도 대화가 남는다. 지문이 바뀌면 key 로 새 대화 */}
        <div style={{ display: tab === 'jina' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <MobileJinaTab key={`qa-${currentLesson.id}`} theme={theme} aiConfig={aiConfig} active={tab === 'jina'} />
        </div>
      </div>
    </div>
    </LessonCtx.Provider>
  );
}

// 모바일 Jina 탭 — 본문은 LessonQaChat(compact). active 는 display:none 해제 시 스크롤 맞춤용
function MobileJinaTab({ theme, aiConfig, active = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <LessonQaChat theme={theme} aiConfig={aiConfig} compact active={active} />
    </div>
  );
}

window.LessonDesktop = LessonDesktop;
window.LessonMobile = LessonMobile;
