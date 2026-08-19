// mobile.jsx — Mobile dashboard + AI conversation screens

// ─────────────────────────────────────────────────────
// Mobile Dashboard
// ─────────────────────────────────────────────────────
function MobileDashboard({ theme, noNav = false, onNavigate }) {
  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>5월 26일 화요일</div>
          <div className="jina-serif" style={{ fontSize: 28, color: theme.text, fontStyle: 'italic', fontWeight: 500, lineHeight: 1.1, marginTop: 2 }}>Good morning,</div>
          <div style={{ fontSize: 22, color: theme.text, fontWeight: 700, lineHeight: 1.2 }}>수민님</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{
            padding: '7px 11px', borderRadius: 999,
            background: theme.chipBg,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: theme.text, fontSize: 13, fontWeight: 600,
          }}>
            <Icons.Flame size={14} style={{ color: theme.accent2 }} />
            24
          </button>
          <button style={{ width: 36, height: 36, borderRadius: '50%', background: theme.chipBg, display: 'grid', placeItems: 'center', color: theme.text, position: 'relative' }}>
            <Icons.Bell size={16} />
            <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: theme.error, border: `1.5px solid ${theme.bg}` }} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Jina greeting card */}
        <div style={{
          padding: 18, borderRadius: 20,
          background: theme.isDark
            ? `linear-gradient(135deg, ${theme.surface}, ${theme.surfaceElev})`
            : theme.surface,
          border: `1px solid ${theme.border}`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -40, top: -40, width: 160, height: 160,
            borderRadius: '50%', background: theme.accentGrad,
            filter: 'blur(40px)', opacity: theme.isDark ? 0.4 : 0.18,
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <JinaAvatar size={40} pulsing theme={theme} />
              <div>
                <div className="jina-serif" style={{ fontSize: 18, color: theme.text, fontStyle: 'italic', fontWeight: 500, lineHeight: 1 }}>Jina</div>
                <div style={{ fontSize: 11, color: theme.success, fontWeight: 600, marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: theme.success }} />
                  대기 중
                </div>
              </div>
            </div>
            <div style={{ fontSize: 15, color: theme.text, lineHeight: 1.5, fontWeight: 500, marginBottom: 12 }}>
              오늘은 <span style={{ background: theme.accentGrad, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 }}>비즈니스 회의</span> 표현을 8분만 연습해볼까요?
            </div>
            <button style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 12,
              background: theme.text, color: theme.bg,
              fontSize: 14, fontWeight: 600, width: '100%',
            }}>
              <Icons.Mic size={15} stroke={2.2} /> 지금 시작
            </button>
          </div>
        </div>

        {/* Goal + Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 10 }}>
          {/* Goal ring */}
          <div style={{
            padding: 16, borderRadius: 18,
            background: theme.card, border: `1px solid ${theme.border}`,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>TOEIC 목표</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', width: 76, height: 76, flex: '0 0 auto' }}>
                <svg width="76" height="76" style={{ transform: 'rotate(-90deg)' }}>
                  <defs>
                    <linearGradient id="mgoalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={theme.accent} />
                      <stop offset="100%" stopColor={theme.accent2} />
                    </linearGradient>
                  </defs>
                  <circle cx="38" cy="38" r="32" fill="none" stroke={theme.border} strokeWidth="6" />
                  <circle cx="38" cy="38" r="32" fill="none" stroke="url(#mgoalGrad)" strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - 0.94)}
                    strokeLinecap="round" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <span className="jina-serif" style={{ fontSize: 22, color: theme.text, fontWeight: 500 }}>845</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>목표</div>
                <div style={{ fontSize: 18, color: theme.text, fontWeight: 700, lineHeight: 1.1 }}>900</div>
                <div style={{ fontSize: 10.5, color: theme.success, fontWeight: 600, marginTop: 4 }}>↑ 20</div>
              </div>
            </div>
          </div>

          {/* Mini stats stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: Icons.Clock, label: '이번 주', value: '4.2h', color: theme.accent3 },
              { icon: Icons.TrendUp, label: '정확도', value: '87%', color: theme.success },
            ].map((s, i) => (
              <div key={i} style={{
                padding: 12, borderRadius: 14,
                background: theme.card, border: `1px solid ${theme.border}`,
                display: 'flex', alignItems: 'center', gap: 10, flex: 1,
              }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: s.color + '22', color: s.color, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                  <s.icon size={14} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: theme.textMuted }}>{s.label}</div>
                  <div style={{ fontSize: 16, color: theme.text, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's plan */}
        <div style={{
          padding: 18, borderRadius: 18,
          background: theme.card, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 15, color: theme.text, margin: 0, fontWeight: 700 }}>오늘의 학습</h3>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>2/4 완료 · 13분 남음</div>
            </div>
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              <svg width="32" height="32" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="16" cy="16" r="13" fill="none" stroke={theme.border} strokeWidth="3" />
                <circle cx="16" cy="16" r="13" fill="none" stroke={theme.success} strokeWidth="3"
                  strokeDasharray={2 * Math.PI * 13}
                  strokeDashoffset={2 * Math.PI * 13 * 0.5}
                  strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { title: 'Jina와 8분 회화', sub: '비즈니스 미팅', icon: Icons.Chat, done: true, accent: theme.accent },
              { title: 'TOEIC Part 5', sub: '20문항 · 약점 보강', icon: Icons.Bolt, done: true, accent: theme.accent3 },
              { title: 'Shadowing — TED', sub: '"The puzzle..." 03:20', icon: Icons.Mic, current: true, accent: theme.accent2 },
              { title: '단어 복습', sub: '12개 · SRS', icon: Icons.Book, accent: theme.warning },
            ].map((it, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10,
                background: it.current ? theme.chipBg : 'transparent',
                border: it.current ? `1px solid ${theme.border}` : '1px solid transparent',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5,
                  background: it.done ? it.accent : 'transparent',
                  border: it.done ? 'none' : `1.5px solid ${theme.borderStrong}`,
                  display: 'grid', placeItems: 'center', color: '#fff', flex: '0 0 auto',
                }}>
                  {it.done && <Icons.Check size={11} stroke={3} />}
                </div>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: it.accent + '22', color: it.accent, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                  <it.icon size={13} stroke={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: theme.text, fontWeight: 600, textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.55 : 1 }}>{it.title}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{it.sub}</div>
                </div>
                {it.current && (
                  <Icons.Play size={13} fill="currentColor" stroke="none" style={{ color: theme.accent }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Latest correction */}
        <div style={{
          padding: 16, borderRadius: 18,
          background: theme.accentGradSoft,
          border: `1px solid ${theme.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icons.Sparkles size={14} style={{ color: theme.accent }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: theme.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>어제의 첨삭</span>
          </div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 6, lineHeight: 1.4 }}>
            "If I <span style={{ textDecoration: 'line-through', color: theme.error }}>would have</span> known..."
          </div>
          <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.45, fontWeight: 500 }}>
            "If I <span style={{ background: theme.success + '22', color: theme.success, padding: '0 4px', borderRadius: 3, fontWeight: 700 }}>had known</span>..."
          </div>
          <button style={{ marginTop: 10, padding: '6px 10px', borderRadius: 8, background: theme.text, color: theme.bg, fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            전체 보기 <Icons.ArrowRight size={11} />
          </button>
        </div>

        {/* Recommended */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
            <h3 style={{ fontSize: 14, color: theme.text, margin: 0, fontWeight: 700 }}>Jina의 추천</h3>
            <span style={{ fontSize: 11, color: theme.textMuted }}>전체 →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { tag: '시험', title: 'TOEIC Speaking Q11 — 가정법', sub: '7개 레슨 · 35분', accent: theme.accent },
              { tag: '회화', title: '비즈니스 이메일 표현 50선', sub: '받아쓰기 포함', accent: theme.accent2 },
            ].map((it, i) => (
              <button key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14,
                background: theme.card, border: `1px solid ${theme.border}`,
                textAlign: 'left', width: '100%',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: it.accent + '22', color: it.accent,
                  display: 'grid', placeItems: 'center', flex: '0 0 auto',
                }}>
                  <span className="jina-serif" style={{ fontSize: 20, fontStyle: 'italic', fontWeight: 500 }}>{it.tag.charAt(0)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: it.accent, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{it.tag}</div>
                  <div style={{ fontSize: 13.5, color: theme.text, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{it.sub}</div>
                </div>
                <Icons.ChevronRight size={14} style={{ color: theme.textDim }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom tab bar — 실제 앱에서는 noNav=true로 숨김 */}
      {!noNav && <AppMobileNav theme={theme} active="dashboard" onNavigate={onNavigate} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Mobile Conversation
// ─────────────────────────────────────────────────────
function MobileConversation({ theme, aiConfig }) {
  const { messages, loading, send } = useJinaChat([]);
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading]);
  const modelInfo = window.JINA_AI.modelLabel(aiConfig);

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px 14px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
        background: theme.bg,
      }}>
        <button style={{ width: 32, height: 32, borderRadius: 9, color: theme.text, display: 'grid', placeItems: 'center' }}>
          <Icons.ArrowLeft size={18} />
        </button>
        <JinaAvatar size={36} pulsing theme={theme} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="jina-serif" style={{ fontSize: 16, fontStyle: 'italic', color: theme.text, fontWeight: 500 }}>Jina</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: theme.success + '22', color: theme.success, fontWeight: 700 }}>LIVE</span>
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            TOEIC Speaking Q11 · 비즈니스 미팅
          </div>
        </div>
        <button style={{ width: 32, height: 32, borderRadius: 9, color: theme.textMuted, display: 'grid', placeItems: 'center' }}>
          <Icons.Settings size={16} />
        </button>
      </div>

      {/* Live score bar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bgSoft,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 11, color: theme.textMuted }}>실시간 점수</span>
          <span className="jina-serif" style={{ fontSize: 22, fontWeight: 500, color: theme.text, lineHeight: 1 }}>83</span>
        </div>
        <div style={{ flex: 1, height: 4, borderRadius: 999, background: theme.border, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '83%', background: theme.accentGrad, borderRadius: 999 }} />
        </div>
        <span style={{ fontSize: 11, color: theme.success, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: theme.success + '22' }}>↑ 6</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 14px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Jina */}
        <div style={{ display: 'flex', gap: 8 }}>
          <JinaAvatar size={28} theme={theme} />
          <div style={{ maxWidth: '85%' }}>
            <div style={{
              padding: '11px 13px', borderRadius: 16, borderTopLeftRadius: 4,
              background: theme.chipBg, border: `1px solid ${theme.border}`,
              fontSize: 13.5, color: theme.text, lineHeight: 1.5,
            }}>
              Hi Sumin! Imagine your boss asked you to recommend a vendor. Tell Mark which one — and <b>why</b>.
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, lineHeight: 1.4, padding: '0 4px' }}>
              상사가 거래처 추천을 요청했어요. Mark에게 어디를, 그리고 왜인지 말해보세요.
            </div>
          </div>
        </div>

        {/* User bubble with corrections */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            maxWidth: '88%',
            padding: '11px 13px', borderRadius: 16, borderTopRightRadius: 4,
            background: theme.accentGradSoft,
            border: `1px solid ${theme.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: `1px dashed ${theme.border}` }}>
              <button style={{ width: 22, height: 22, borderRadius: '50%', background: theme.text, color: theme.bg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                <Icons.Play size={9} />
              </button>
              <Waveform theme={theme} height={16} bars={20} />
              <span style={{ fontSize: 10, color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>0:18</span>
            </div>
            <div style={{ fontSize: 13.5, color: theme.text, lineHeight: 1.6 }}>
              Hi Mark, I think we{' '}
              <span style={{ color: theme.error, textDecoration: 'line-through' }}>should to go</span>
              {' '}<span style={{ background: theme.success + '22', color: theme.success, padding: '0 4px', borderRadius: 3, fontWeight: 600 }}>should go</span>
              {' '}with OfficeMart. They <span style={{ borderBottom: `2px wavy ${theme.warning}` }}>have good prices</span> and offer next-day delivery.
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { l: '발음', v: 92 }, { l: '유창성', v: 88 }, { l: '문법', v: 74, warn: true }, { l: '어휘', v: 81 },
              ].map((s) => (
                <div key={s.l} style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 999,
                  background: theme.surface, border: `1px solid ${theme.border}`,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  <span style={{ color: theme.textMuted }}>{s.l}</span>
                  <span style={{ color: s.warn ? theme.warning : theme.success, fontWeight: 700 }}>{s.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Correction card (expanded) */}
        <div style={{
          padding: 12, borderRadius: 14,
          background: theme.surface, border: `1px solid ${theme.borderStrong}`,
          marginLeft: 36,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icons.Sparkles size={13} style={{ color: theme.accent }} />
            <span style={{ fontSize: 11, color: theme.text, fontWeight: 700, letterSpacing: '0.04em' }}>JINA의 첨삭</span>
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
            <em>"have good prices"</em>를 더 비즈니스다운 표현으로 바꿔보세요.
          </div>
          <button style={{
            padding: '6px 10px', borderRadius: 8,
            background: theme.chipBg, color: theme.text, fontSize: 11.5, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Icons.Sparkle size={11} style={{ color: theme.accent }} />
            offer competitive pricing
          </button>
        </div>

        {messages.length > 0 && (
          <div style={{ textAlign: 'center', fontSize: 10, color: theme.accent, padding: '2px 0', fontWeight: 600 }}>
            <span style={{ padding: '3px 10px', borderRadius: 999, background: theme.accentGradSoft }}>↓ 실제 AI 응답</span>
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
            <div style={{
              padding: '11px 14px', borderRadius: 16, borderTopLeftRadius: 4,
              background: theme.chipBg, border: `1px solid ${theme.border}`,
              display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
            }}>
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

window.MobileDashboard = MobileDashboard;
window.MobileConversation = MobileConversation;
