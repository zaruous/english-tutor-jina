// conversation-desktop.jsx — Desktop AI conversation screen with Jina

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

const CONVO_SESSIONS = [
  { id: 0, title: '새 회화', sub: '새 대화를 시작하세요', time: '', count: 0, isNew: true },
  { id: 1, title: '비즈니스 미팅', sub: 'TOEIC Speaking Q11', time: '지금', count: 4 },
  { id: 2, title: '카페에서 주문하기', sub: '일상 회화 · 완료', time: '어제', count: 12 },
  { id: 3, title: 'TOEFL Independent', sub: 'Should students... ', time: '5/24', count: 8 },
  { id: 4, title: '항공편 변경 문의', sub: '여행 · 완료', time: '5/22', count: 6 },
  { id: 5, title: '면접 대비 — STAR', sub: 'Job interview', time: '5/20', count: 9 },
];

// Mini conversation sidebar
function ConvoSidebar({ theme, activeId, onSessionChange, onNewSession }) {
  return (
    <aside style={{
      width: 280, padding: '20px 16px',
      borderRight: `1px solid ${theme.border}`,
      background: theme.bgSoft,
      display: 'flex', flexDirection: 'column', gap: 8,
      flex: '0 0 auto',
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

      {CONVO_SESSIONS.filter((s) => !s.isNew).map((s) => {
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
                <span style={{ fontSize: 10.5, color: theme.textDim, flex: '0 0 auto' }}>{s.time}</span>
              </div>
              <div style={{ fontSize: 11.5, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</div>
              <div style={{ fontSize: 10.5, color: theme.textDim, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icons.Chat size={10} /> {s.count}턴
              </div>
            </div>
          </button>
        );
      })}
    </aside>
  );
}

// Scenario header
function ScenarioBar({ theme }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 5, background: theme.accent + '20', color: theme.accent, fontWeight: 700, letterSpacing: '0.06em' }}>TOEIC SPEAKING · Q11</span>
          <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 5, background: theme.chipBg, color: theme.textMuted, fontWeight: 600 }}>난이도 ★★★☆☆</span>
        </div>
        <div style={{ fontSize: 14, color: theme.text, fontWeight: 600 }}>
          비즈니스 미팅 · 신규 거래처 추천
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
          상사가 사무용품 신규 거래처를 추천해달라고 요청했어요. 동료에게 전화로 의견을 전달하세요.
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

// AI message bubble (from Jina)
function JinaMessage({ theme, text, en, suggestions, time }) {
  return (
    <div style={{ display: 'flex', gap: 12, animation: 'jina-rise .3s ease-out' }}>
      <JinaAvatar size={36} theme={theme} />
      <div style={{ flex: 1, maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span className="jina-serif" style={{ fontSize: 15, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>Jina</span>
          <span style={{ fontSize: 10.5, color: theme.textDim }}>{time}</span>
        </div>
        <div style={{
          padding: '14px 16px', borderRadius: 16, borderTopLeftRadius: 4,
          background: theme.chipBg, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: 14.5, color: theme.text, lineHeight: 1.55 }}>
            {en}
          </div>
          {text && (
            <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${theme.border}` }}>
              {text}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <button style={{
              padding: '5px 9px', borderRadius: 6,
              background: theme.bgSoft, color: theme.textMuted,
              fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Icons.Volume size={12} /> 듣기
            </button>
            <button style={{
              padding: '5px 9px', borderRadius: 6,
              background: theme.bgSoft, color: theme.textMuted,
              fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Icons.Refresh size={12} /> 천천히
            </button>
          </div>
        </div>
        {suggestions && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {suggestions.map((s, i) => (
              <button key={i} style={{
                padding: '7px 11px', borderRadius: 999,
                background: theme.surface, border: `1px solid ${theme.border}`,
                color: theme.text, fontSize: 12, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <Icons.Sparkle size={11} style={{ color: theme.accent }} /> {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// User message bubble with inline correction
function UserMessage({ theme, time }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexDirection: 'row-reverse', animation: 'jina-rise .3s ease-out' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flex: '0 0 auto',
        background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent3})`,
        display: 'grid', placeItems: 'center', color: '#fff', fontSize: 14, fontWeight: 600,
      }}>수</div>
      <div style={{ maxWidth: 600, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, color: theme.textDim }}>{time}</span>
          <span style={{ fontSize: 13, color: theme.text, fontWeight: 600 }}>You</span>
        </div>
        <div style={{
          padding: '14px 16px', borderRadius: 16, borderTopRightRadius: 4,
          background: theme.accentGradSoft,
          border: `1px solid ${theme.border}`,
          width: '100%',
        }}>
          {/* Waveform mini-player */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: `1px dashed ${theme.border}` }}>
            <button style={{
              width: 28, height: 28, borderRadius: '50%',
              background: theme.text, color: theme.bg,
              display: 'grid', placeItems: 'center', flex: '0 0 auto',
            }}>
              <Icons.Play size={11} />
            </button>
            <Waveform theme={theme} height={20} bars={28} />
            <span style={{ fontSize: 11, color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>0:18</span>
          </div>

          <div style={{ fontSize: 14.5, color: theme.text, lineHeight: 1.65 }}>
            Hi Mark, I think we{' '}
            <span style={{ color: theme.error, textDecoration: 'line-through', textDecorationColor: theme.error + 'aa' }}>should to go with</span>
            <sup style={{ fontSize: 10, color: theme.error, fontWeight: 700, margin: '0 2px' }}>1</sup>
            {' '}OfficeMart for our supplies. They{' '}
            <span style={{
              borderBottom: `2px wavy ${theme.warning}`,
              cursor: 'help',
            }}>have</span>
            <sup style={{ fontSize: 10, color: theme.warning, fontWeight: 700, margin: '0 2px' }}>2</sup>
            {' '}good prices and{' '}
            <span style={{ color: theme.error, textDecoration: 'line-through', textDecorationColor: theme.error + 'aa' }}>also</span>
            {' '}<span style={{
              background: theme.success + '22', color: theme.success,
              padding: '1px 5px', borderRadius: 4, fontWeight: 600,
            }}>they offer</span>
            {' '}next-day delivery, which{' '}
            <span style={{
              borderBottom: `2px wavy ${theme.warning}`,
            }}>is really helpful</span>
            <sup style={{ fontSize: 10, color: theme.warning, fontWeight: 700, margin: '0 2px' }}>3</sup>
            {' '}for our team.
          </div>

          {/* Score chips */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { label: '발음', value: 92, color: theme.success },
              { label: '유창성', value: 88, color: theme.success },
              { label: '문법', value: 74, color: theme.warning },
              { label: '어휘', value: 81, color: theme.success },
            ].map((s) => (
              <div key={s.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 999,
                background: theme.surface, border: `1px solid ${theme.border}`,
                fontSize: 11,
              }}>
                <span style={{ color: theme.textMuted }}>{s.label}</span>
                <span style={{ color: s.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Live mic input bar
function MicBar({ theme }) {
  return (
    <div style={{
      padding: '18px 28px 24px',
      borderTop: `1px solid ${theme.border}`,
      background: theme.bg,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 16,
        background: theme.card, border: `1px solid ${theme.borderStrong}`,
        boxShadow: theme.shadow,
      }}>
        <button style={{
          width: 44, height: 44, borderRadius: '50%',
          background: theme.accentGrad, color: '#fff',
          display: 'grid', placeItems: 'center', flex: '0 0 auto',
          boxShadow: `0 6px 20px -6px ${theme.accent}80`,
          position: 'relative',
        }}>
          <span style={{
            position: 'absolute', inset: -4, borderRadius: '50%',
            border: `2px solid ${theme.accent}`, opacity: 0.4,
            animation: 'jina-pulse 1.5s ease-in-out infinite',
          }} />
          <Icons.Mic size={18} stroke={2.2} />
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Waveform theme={theme} active height={32} bars={32} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, color: theme.text, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.error, animation: 'jina-pulse 1s infinite' }} />
              녹음 중 · 0:08
            </span>
            <span style={{ fontSize: 11, color: theme.textMuted }}>음성을 실시간 분석하고 있어요</span>
          </div>
        </div>
        <button style={{
          padding: '9px 14px', borderRadius: 10,
          background: theme.chipBg, color: theme.text, fontSize: 12, fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <Icons.X size={13} /> 취소
        </button>
        <button style={{
          padding: '9px 16px', borderRadius: 10,
          background: theme.text, color: theme.bg, fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          전송 <Icons.Send size={13} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: theme.textDim }}>빠른 응답</span>
        {['I would recommend...', 'They are reliable because...', 'Could you elaborate?'].map((q, i) => (
          <button key={i} style={{
            padding: '6px 10px', borderRadius: 999,
            background: theme.chipBg, color: theme.textMuted,
            fontSize: 11.5, fontStyle: 'italic',
          }}>{q}</button>
        ))}
      </div>
    </div>
  );
}

// Right pane: live feedback
function FeedbackPane({ theme }) {
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
            <span className="jina-serif" style={{ fontSize: 52, color: theme.text, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em' }}>83</span>
            <span style={{ fontSize: 16, color: theme.textMuted }}>/ 100</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.success, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: theme.success + '22' }}>↑ 6</span>
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            <b style={{ color: theme.text }}>Good</b>! 핵심 의견을 명확히 전달했어요. 다음엔 근거를 한 가지 더 추가해보세요.
          </div>
        </div>
      </div>

      {/* Corrections */}
      <div>
        <div style={{ fontSize: 11, color: theme.textDim, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase' }}>첨삭 ({3})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Item 1 */}
          <div style={{ padding: 12, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 6, background: theme.error, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>1</span>
              <span style={{ fontSize: 11, color: theme.error, fontWeight: 600, letterSpacing: '0.04em' }}>문법 오류</span>
            </div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 4 }}>
              <span style={{ textDecoration: 'line-through', color: theme.error }}>should to go with</span>
            </div>
            <div style={{ fontSize: 13.5, color: theme.text, marginBottom: 8, fontWeight: 500 }}>
              <Icons.ArrowRight size={11} style={{ color: theme.success, marginRight: 4, verticalAlign: 'middle' }} />
              <span style={{ background: theme.success + '20', padding: '1px 5px', borderRadius: 4 }}>should go with</span>
            </div>
            <div style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>
              <em>should</em> 뒤에는 to 없이 동사원형이 와요.
            </div>
          </div>

          {/* Item 2 */}
          <div style={{ padding: 12, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 6, background: theme.warning, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>2</span>
              <span style={{ fontSize: 11, color: theme.warning, fontWeight: 600, letterSpacing: '0.04em' }}>자연스러운 표현</span>
            </div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 4 }}>have good prices</div>
            <div style={{ fontSize: 13.5, color: theme.text, marginBottom: 8, fontWeight: 500 }}>
              <Icons.ArrowRight size={11} style={{ color: theme.accent, marginRight: 4, verticalAlign: 'middle' }} />
              <span style={{ background: theme.accent + '20', padding: '1px 5px', borderRadius: 4 }}>offer competitive pricing</span>
            </div>
            <div style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>
              비즈니스 상황에선 <em>competitive pricing</em>이 더 격식 있어요.
            </div>
          </div>

          {/* Item 3 */}
          <div style={{ padding: 12, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 6, background: theme.warning, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>3</span>
              <span style={{ fontSize: 11, color: theme.warning, fontWeight: 600 }}>업그레이드</span>
            </div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 4 }}>is really helpful</div>
            <div style={{ fontSize: 13.5, color: theme.text, marginBottom: 8, fontWeight: 500 }}>
              <Icons.ArrowRight size={11} style={{ color: theme.accent, marginRight: 4, verticalAlign: 'middle' }} />
              <span style={{ background: theme.accent + '20', padding: '1px 5px', borderRadius: 4 }}>is a major time-saver</span>
            </div>
          </div>
        </div>
      </div>

      {/* Vocabulary */}
      <div>
        <div style={{ fontSize: 11, color: theme.textDim, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>오늘의 단어</span>
          <Icons.Plus size={12} />
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span className="jina-serif" style={{ fontSize: 22, color: theme.text, fontStyle: 'italic', fontWeight: 500 }}>competitive</span>
            <span style={{ fontSize: 11, color: theme.textMuted }}>/kəmˈpetətɪv/</span>
            <button style={{ marginLeft: 'auto', color: theme.accent }}><Icons.Volume size={14} /></button>
          </div>
          <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>adj. 경쟁력 있는, 우위에 있는</div>
          <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: 'italic', lineHeight: 1.5, paddingTop: 8, borderTop: `1px dashed ${theme.border}` }}>
            "Their pricing is highly <b style={{ color: theme.text, fontStyle: 'normal' }}>competitive</b> in the market."
          </div>
        </div>
      </div>
    </aside>
  );
}

function ConversationDesktop({ theme, aiConfig }) {
  const { messages, loading, send, reset } = useJinaChat([]);
  const [activeSessionId, setActiveSessionId] = React.useState(1);
  const [isNewSession, setIsNewSession] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  const handleNewSession = () => {
    reset();
    setActiveSessionId(null);
    setIsNewSession(true);
  };

  const handleSessionChange = (id) => {
    reset();
    setActiveSessionId(id);
    setIsNewSession(false);
  };

  const modelInfo = aiConfig?.provider === 'ollama'
    ? aiConfig.ollamaModel
    : 'haiku-4-5';

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex',
      overflow: 'hidden',
    }}>
      <ConvoSidebar theme={theme} activeId={activeSessionId}
        onSessionChange={handleSessionChange} onNewSession={handleNewSession} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <ScenarioBar theme={theme} />
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {isNewSession ? (
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
            <React.Fragment>
              <div style={{ textAlign: 'center', fontSize: 11, color: theme.textDim, padding: '4px 0' }}>
                <span style={{ padding: '4px 12px', borderRadius: 999, background: theme.chipBg }}>오늘 09:24 · 회화 시작 (예시 데모)</span>
              </div>

              <JinaMessage
                theme={theme}
                time="09:24"
                en={<>Hi Sumin! Today we'll practice for <b>TOEIC Speaking Q11</b>. Imagine your boss just asked you to recommend a new vendor for office supplies. <em>Pick up the phone</em> and tell your colleague Mark which vendor you'd suggest — and why.</>}
                text="안녕 수민! 오늘은 토익 스피킹 Q11을 연습할 거예요. 상사가 사무용품 신규 거래처 추천을 요청한 상황이라고 상상해보세요. 동료 Mark에게 전화로 추천 거래처와 이유를 말해보세요."
                suggestions={['시작할게요', '예시 답안 보기', '쉽게 풀어주세요']}
              />

              <UserMessage theme={theme} time="09:26" />

              <JinaMessage
                theme={theme}
                time="09:26"
                en={<>Nice answer! You picked a clear vendor and gave <b>two reasons</b> — pricing and delivery speed. To score higher on Q11, try to add a <em>third supporting detail</em> or a brief example. Also, watch <span style={{ background: theme.accentGradSoft, padding: '1px 5px', borderRadius: 4 }}>"should to go"</span> — drop the <b>"to"</b>. Want to try once more?</>}
                text="좋은 답변이에요! 거래처와 두 가지 근거(가격, 배송)를 명확히 제시했어요. Q11에서 더 높은 점수를 받으려면 근거를 한 개 더 추가하거나 짧은 예시를 들어보세요."
                suggestions={['한 번 더 시도', '예시 답안 듣기', '다음으로 넘어가기']}
              />
            </React.Fragment>
          )}

          {messages.length > 0 && !isNewSession && (
            <div style={{ textAlign: 'center', fontSize: 11, color: theme.textDim, padding: '4px 0' }}>
              <span style={{ padding: '4px 12px', borderRadius: 999, background: theme.accentGradSoft, color: theme.accent, fontWeight: 600 }}>
                ↓ 실제 AI 대화 시작
              </span>
            </div>
          )}

          {messages.map((m, i) => (
            m.role === 'user'
              ? <LiveUserMessage key={i} theme={theme} msg={m} />
              : <LiveJinaMessage key={i} theme={theme} msg={m} />
          ))}

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
      <FeedbackPane theme={theme} />
    </div>
  );
}

window.ConversationDesktop = ConversationDesktop;
window.Waveform = Waveform;
