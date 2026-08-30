// conversation-desktop.jsx — Desktop AI conversation screen with Jina
// 세션/메시지/첨삭은 서버 저장 — useConversation()(conversation-store.jsx)이 단일 소스.

// Live waveform visualization
function Waveform({ theme, active = false, height = 28, bars = 14 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      height,
    }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 999,
          background: theme.accent,
          height: `${30 + Math.sin(i * 0.9) * 40 + (active ? Math.cos(i * 1.3) * 30 : 0)}%`,
          animation: active ? `jina-wave ${0.8 + (i % 5) * 0.2}s ease-in-out ${i * 0.04}s infinite` : 'none',
          transformOrigin: 'center',
          opacity: active ? 1 : 0.4,
        }} />
      ))}
    </div>
  );
}

// Mini conversation sidebar — 서버 SessionDto 목록을 소비
function ConvoSidebar({ theme, sessions, activeId, onSessionChange, onNewSession, formatTime, sessionsLoading }) {
  return (
    <aside style={{
      width: 280, padding: '20px 16px',
      borderRight: `1px solid ${theme.border}`,
      background: theme.bgSoft,
      display: 'flex', flexDirection: 'column', gap: 8,
      flex: '0 0 auto',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 8px' }}>
        <button style={{
          width: 32, height: 32, borderRadius: 9,
          background: theme.chipBg, display: 'grid', placeItems: 'center', color: theme.textMuted,
        }}>
          <Icons.ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Jina와 대화</div>
          <div style={{ fontSize: 11, color: theme.textDim }}>실시간 회화 · 첨삭</div>
        </div>
      </div>

      <button onClick={onNewSession} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 14px', borderRadius: 11,
        background: theme.accentGrad, color: '#fff',
        fontSize: 13, fontWeight: 600, marginBottom: 8,
        boxShadow: `0 6px 20px -8px ${theme.accent}80`,
        cursor: 'pointer',
      }}>
        <Icons.Plus size={14} stroke={2.5} /> 새 회화 시작
      </button>

      <div style={{ fontSize: 11, color: theme.textDim, padding: '8px 4px 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>최근 세션</div>

      {sessionsLoading && [0, 1, 2].map((i) => (
        <div key={i} style={{
          height: 64, borderRadius: 10, background: theme.chipBg,
          opacity: 0.5, animation: 'jina-pulse 1.4s ease-in-out infinite',
        }} />
      ))}

      {!sessionsLoading && sessions.map((s) => {
        const isActive = s.id === activeId;
        return (
          <button key={s.id} onClick={() => onSessionChange(s.id)} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: isActive ? theme.chipBg : 'transparent',
            border: isActive ? `1px solid ${theme.border}` : '1px solid transparent',
            textAlign: 'left', width: '100%',
            position: 'relative', cursor: 'pointer',
          }}>
            {isActive && (
              <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 2, borderRadius: 999, background: theme.accent }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <span style={{ fontSize: 10.5, color: theme.textDim, flex: '0 0 auto' }}>{formatTime(s.last_message_at || s.started_at)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.last_user_text || (s.scenario?.title ?? '')}</div>
              <div style={{ fontSize: 10.5, color: theme.textDim, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icons.Chat size={10} /> {s.message_count}턴
              </div>
            </div>
          </button>
        );
      })}
    </aside>
  );
}

// Scenario header — 활성 세션의 scenario 메타(없으면 자유 회화)
function ScenarioBar({ theme, session }) {
  const scenario = session?.scenario;
  return (
    <div style={{
      padding: '16px 28px',
      borderBottom: `1px solid ${theme.border}`,
      display: 'flex', alignItems: 'center', gap: 14,
      background: theme.bg,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 11,
        background: theme.accent + '22',
        display: 'grid', placeItems: 'center', color: theme.accent,
      }}>
        <Icons.Target size={18} stroke={2} />
      </div>
      <div style={{ flex: 1 }}>
        {scenario && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            {scenario.tag && <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 5, background: theme.accent + '20', color: theme.accent, fontWeight: 700, letterSpacing: '0.06em' }}>{scenario.tag}</span>}
            {scenario.level && <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 5, background: theme.chipBg, color: theme.textMuted, fontWeight: 600 }}>난이도 {scenario.level}</span>}
          </div>
        )}
        <div style={{ fontSize: 14, color: theme.text, fontWeight: 600 }}>
          {scenario?.title ?? session?.title ?? '자유 회화'}
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
          {scenario?.description ?? 'Jina에게 어떤 주제로 연습할지 말해보세요.'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button style={{
          padding: '8px 12px', borderRadius: 9,
          background: theme.chipBg, color: theme.textMuted,
          fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <Icons.Globe size={13} /> 한↔영
        </button>
        <button style={{
          padding: '8px 12px', borderRadius: 9,
          background: theme.chipBg, color: theme.textMuted,
          fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <Icons.Settings size={13} /> 모드
        </button>
      </div>
    </div>
  );
}

// 첨삭 type → 라벨/색 (grammar=error, usage/spelling=warning)
const CORRECTION_TYPE_META = {
  grammar: { label: '문법 오류', color: (t) => t.error },
  usage: { label: '자연스러운 표현', color: (t) => t.warning },
  spelling: { label: '철자', color: (t) => t.warning },
};

// Right pane: live feedback — 마지막 scored assistant 메시지(lastScored) 실데이터
function FeedbackPane({ theme, lastScored }) {
  const { cards } = useVocab(); // VocabProvider가 페이지 전체를 감싸므로(main.jsx) 공짜
  const dueCard = cards.find((c) => c.status === 'due');
  const corrections = lastScored?.corrections ?? [];
  return (
    <aside style={{
      width: 340, padding: 24,
      borderLeft: `1px solid ${theme.border}`,
      background: theme.bgSoft,
      display: 'flex', flexDirection: 'column', gap: 16,
      overflowY: 'auto',
      flex: '0 0 auto',
    }}>
      {/* Live score */}
      <div style={{
        padding: 18, borderRadius: 16,
        background: theme.isDark
          ? `linear-gradient(135deg, ${theme.surface}, ${theme.surfaceElev})`
          : theme.surface,
        border: `1px solid ${theme.border}`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -30, top: -30, width: 100, height: 100, borderRadius: '50%', background: theme.accentGrad, filter: 'blur(40px)', opacity: theme.isDark ? 0.4 : 0.2 }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, color: theme.textMuted, letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>실시간 평가</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="jina-serif" style={{ fontSize: 52, color: theme.text, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em' }}>{lastScored?.average ?? '—'}</span>
            <span style={{ fontSize: 16, color: theme.textMuted }}>/ 100</span>
            {lastScored?.delta != null && lastScored.delta !== 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                color: lastScored.delta > 0 ? theme.success : theme.error,
                background: (lastScored.delta > 0 ? theme.success : theme.error) + '22',
              }}>
                {lastScored.delta > 0 ? `↑ ${lastScored.delta}` : `↓ ${-lastScored.delta}`}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            {lastScored?.suggestion ?? '메시지를 보내면 실시간 평가가 시작돼요.'}
          </div>
        </div>
      </div>

      {/* Corrections — lastScored의 실데이터 */}
      <div>
        <div style={{ fontSize: 11, color: theme.textDim, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase' }}>첨삭 ({corrections.length})</div>
        {corrections.length === 0 ? (
          <div style={{
            padding: 14, borderRadius: 12, background: theme.surface, border: `1px dashed ${theme.border}`,
            fontSize: 12, color: theme.textMuted, textAlign: 'center',
          }}>
            아직 첨삭이 없어요
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {corrections.map((c, i) => {
              const meta = CORRECTION_TYPE_META[c.type] || CORRECTION_TYPE_META.usage;
              const color = meta.color(theme);
              return (
                <div key={i} style={{ padding: 12, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 6, background: color, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
                    <span style={{ fontSize: 11, color, fontWeight: 600, letterSpacing: '0.04em' }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 4 }}>
                    <span style={{ textDecoration: 'line-through', color }}>{c.original}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: theme.text, marginBottom: c.reason ? 8 : 0, fontWeight: 500 }}>
                    <Icons.ArrowRight size={11} style={{ color: theme.success, marginRight: 4, verticalAlign: 'middle' }} />
                    <span style={{ background: theme.success + '20', padding: '1px 5px', borderRadius: 4 }}>{c.corrected}</span>
                  </div>
                  {c.reason && (
                    <div style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>
                      {c.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 오늘의 단어 — vocab 스토어의 due 카드 (없으면 숨김) */}
      {dueCard && (
        <div>
          <div style={{ fontSize: 11, color: theme.textDim, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>오늘의 단어</span>
            <Icons.Plus size={12} />
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span className="jina-serif" style={{ fontSize: 22, color: theme.text, fontStyle: 'italic', fontWeight: 500 }}>{dueCard.word}</span>
              <span style={{ fontSize: 11, color: theme.textMuted }}>{dueCard.ipa}</span>
              <button style={{ marginLeft: 'auto', color: theme.accent }}><Icons.Volume size={14} /></button>
            </div>
            <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>{dueCard.pos} {dueCard.meaning_ko}</div>
            {dueCard.examples?.[0] && (
              <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: 'italic', lineHeight: 1.5, paddingTop: 8, borderTop: `1px dashed ${theme.border}` }}>
                "{dueCard.examples[0]}"
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function ConversationDesktop({ theme, aiConfig }) {
  const {
    messages, loading, send,
    sessions, activeSessionId, sessionsLoading,
    selectSession, newSession, activeSession, lastScored, formatSessionTime,
  } = useConversation();
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  const modelInfo = window.JINA_AI.modelLabel(aiConfig);

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex',
      overflow: 'hidden',
    }}>
      <ConvoSidebar theme={theme} sessions={sessions} activeId={activeSessionId}
        onSessionChange={selectSession} onNewSession={newSession}
        formatTime={formatSessionTime} sessionsLoading={sessionsLoading} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <ScenarioBar theme={theme} session={activeSession} />
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {messages.length === 0 && !loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 20, paddingTop: 40 }}>
              <JinaAvatar size={64} theme={theme} />
              <div style={{ textAlign: 'center' }}>
                <div className="jina-serif" style={{ fontSize: 28, fontStyle: 'italic', color: theme.text, marginBottom: 8 }}>새 회화를 시작해요!</div>
                <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.6 }}>
                  Jina에게 어떤 주제로 연습하고 싶은지 말해보세요.<br/>
                  TOEIC Speaking, 비즈니스 영어, 일상 회화 모두 가능해요.
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {['TOEIC Speaking Q11 연습', '비즈니스 이메일 작성', '카페에서 주문하기', '면접 영어 연습'].map((t) => (
                  <button key={t} onClick={() => send(t)} style={{
                    padding: '9px 14px', borderRadius: 999,
                    background: theme.chipBg, border: `1px solid ${theme.border}`,
                    color: theme.text, fontSize: 13, fontWeight: 500,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer',
                  }}>
                    <Icons.Sparkle size={12} style={{ color: theme.accent }} /> {t}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              m.role === 'user'
                ? <LiveUserMessage key={m.id != null ? `srv-${m.id}` : `local-${i}`} theme={theme} msg={m} />
                : <LiveJinaMessage key={m.id != null ? `srv-${m.id}` : `local-${i}`} theme={theme} msg={m} />
            ))
          )}

          {loading && (
            <div style={{ display: 'flex', gap: 12 }}>
              <JinaAvatar size={36} theme={theme} pulsing />
              <div style={{
                padding: '12px 16px', borderRadius: 16, borderTopLeftRadius: 4,
                background: theme.chipBg, border: `1px solid ${theme.border}`,
                display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
              }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: theme.textMuted,
                    animation: `jina-pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
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
          suggestions={['I would recommend OfficeMart because...', 'Could you elaborate on that?', 'Can you correct my last sentence?']}
        />
      </div>
      <FeedbackPane theme={theme} lastScored={lastScored} />
    </div>
  );
}

window.ConversationDesktop = ConversationDesktop;
window.Waveform = Waveform;
