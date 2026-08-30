// mobile.jsx — Mobile dashboard + AI conversation screens

// ─────────────────────────────────────────────────────
// Mobile Dashboard
// ─────────────────────────────────────────────────────
function MobileDashboard({ theme, noNav = false, onNavigate }) {
  // 데스크탑(dashboard-desktop.jsx)과 같은 Context·포맷터를 쓴다 — 수치/문자열 중복 정의 금지.
  const { dash } = useDashboard();
  const F = window.DASH_FMT;
  const go = (nav) => onNavigate && nav && onNavigate(nav);
  if (!dash) {
    return (
      <div className="jina-root" style={{ width: '100%', height: '100%', background: theme.bg, color: theme.textMuted,
        display: 'grid', placeItems: 'center', fontSize: 13 }}>불러오는 중…</div>
    );
  }
  const goal = dash.goal;
  const plan = dash.today_plan;
  const corr = dash.recent_correction;
  const goalPct = goal.target_score ? Math.min(1, (goal.predicted_score || 0) / goal.target_score) : 0;
  const planPct = plan.total ? plan.done / plan.total : 0;
  const currentKey = plan.items.find((it) => !it.done)?.key;
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
          <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{F.shortDate()}</div>
          <div className="jina-serif" style={{ fontSize: 28, color: theme.text, fontStyle: 'italic', fontWeight: 500, lineHeight: 1.1, marginTop: 2 }}>{F.greeting()},</div>
          <div style={{ fontSize: 22, color: theme.text, fontWeight: 700, lineHeight: 1.2 }}>{dash.user.display_name}님</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{
            padding: '7px 11px', borderRadius: 999,
            background: theme.chipBg,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: theme.text, fontSize: 13, fontWeight: 600,
          }}>
            <Icons.Flame size={14} style={{ color: theme.accent2 }} />
            {dash.stats.streak_days}
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
          flexShrink: 0, // 스크롤 컬럼(flex column) 안에서 overflow:hidden 카드가 찌부러지지 않게 (데스크탑 HeroCard 와 같은 버그)
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
              오늘은 <span style={{ backgroundImage: theme.accentGrad, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 }}>비즈니스 회의</span> 표현을 8분만 연습해볼까요?
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
                    strokeDashoffset={2 * Math.PI * 32 * (1 - goalPct)}
                    strokeLinecap="round" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <span className="jina-serif" style={{ fontSize: 22, color: theme.text, fontWeight: 500 }}>{goal.predicted_score ?? '—'}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>목표</div>
                <div style={{ fontSize: 18, color: theme.text, fontWeight: 700, lineHeight: 1.1 }}>{goal.target_score}</div>
                {goal.last_lesson_delta > 0 && (
                  <div style={{ fontSize: 10.5, color: theme.success, fontWeight: 600, marginTop: 4 }}>↑ {goal.last_lesson_delta}</div>
                )}
              </div>
            </div>
          </div>

          {/* Mini stats stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: Icons.Clock, label: '이번 주', value: `${F.hours(dash.stats.week_minutes)}h`, color: theme.accent3 },
              { icon: Icons.TrendUp, label: '정확도',
                value: dash.stats.accuracy_pct == null ? '—' : `${dash.stats.accuracy_pct}%`, color: theme.success },
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
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                {plan.done}/{plan.total} 완료 · {plan.items.filter((it) => !it.done).reduce((a, it) => a + (it.mins || 0), 0)}분 남음
              </div>
            </div>
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              <svg width="32" height="32" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="16" cy="16" r="13" fill="none" stroke={theme.border} strokeWidth="3" />
                <circle cx="16" cy="16" r="13" fill="none" stroke={theme.success} strokeWidth="3"
                  strokeDasharray={2 * Math.PI * 13}
                  strokeDashoffset={2 * Math.PI * 13 * (1 - planPct)}
                  strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plan.items.map((it) => {
              const meta = dashPlanMeta(it.key, theme);
              return { ...it, icon: meta.Icon, accent: meta.accent, current: it.key === currentKey };
            }).map((it, i) => (
              <div key={it.key || i} onClick={() => go(it.nav)} style={{
                cursor: it.nav ? 'pointer' : 'default',
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

        {/* Latest correction — 첨삭 기록이 없으면 카드를 숨긴다 */}
        {corr && (
          <div style={{
            padding: 16, borderRadius: 18,
            background: theme.accentGradSoft,
            border: `1px solid ${theme.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icons.Sparkles size={14} style={{ color: theme.accent }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: theme.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>첨삭</span>
              <span style={{ fontSize: 10.5, color: theme.textDim, marginLeft: 'auto' }}>{F.relative(corr.created_at)}</span>
            </div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 6, lineHeight: 1.4, textDecoration: 'line-through' }}>
              "{corr.original}"
            </div>
            <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.45, fontWeight: 500 }}>
              "<span style={{ background: theme.success + '22', color: theme.success, padding: '0 4px', borderRadius: 3, fontWeight: 700 }}>{corr.corrected}</span>"
            </div>
            {corr.explanation && (
              <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 6, lineHeight: 1.5 }}>{corr.explanation}</div>
            )}
            <button onClick={() => go('progress')} style={{ marginTop: 10, padding: '6px 10px', borderRadius: 8, background: theme.text, color: theme.bg, fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              전체 {corr.total_count}개 보기 <Icons.ArrowRight size={11} />
            </button>
          </div>
        )}

        {/* Recommended */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
            <h3 style={{ fontSize: 14, color: theme.text, margin: 0, fontWeight: 700 }}>Jina의 추천</h3>
            <span style={{ fontSize: 11, color: theme.textMuted }}>전체 →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dash.recommendations.slice(0, 3).map((r) => ({ ...r, accent: dashRecAccent(r.tag, theme) })).map((it, i) => (
              <button key={i} onClick={() => go(it.nav)} style={{
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
  // 세션 사이드바 없음 — 스토어가 가장 최근 active 세션을 자동 선택해 이어간다 (v1)
  const { messages, loading, send, lastScored, activeSession } = useConversation();
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
            {activeSession?.title ?? '새 회화'}
          </div>
        </div>
        <button style={{ width: 32, height: 32, borderRadius: 9, color: theme.textMuted, display: 'grid', placeItems: 'center' }}>
          <Icons.Settings size={16} />
        </button>
      </div>

      {/* Live score bar — lastScored 실데이터 (없으면 숨김) */}
      {lastScored && (
        <div style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.bgSoft,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 11, color: theme.textMuted }}>실시간 점수</span>
            <span className="jina-serif" style={{ fontSize: 22, fontWeight: 500, color: theme.text, lineHeight: 1 }}>{lastScored.average}</span>
          </div>
          <div style={{ flex: 1, height: 4, borderRadius: 999, background: theme.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${lastScored.average}%`, background: theme.accentGrad, borderRadius: 999 }} />
          </div>
          {lastScored.delta != null && lastScored.delta !== 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              color: lastScored.delta > 0 ? theme.success : theme.error,
              background: (lastScored.delta > 0 ? theme.success : theme.error) + '22',
            }}>
              {lastScored.delta > 0 ? `↑ ${lastScored.delta}` : `↓ ${-lastScored.delta}`}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 14px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 48, textAlign: 'center' }}>
            <JinaAvatar size={48} theme={theme} />
            <div className="jina-serif" style={{ fontSize: 20, fontStyle: 'italic', color: theme.text }}>새 회화를 시작해요!</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6 }}>
              Jina에게 어떤 주제로 연습하고 싶은지 말해보세요.
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          m.role === 'user'
            ? <LiveUserMessage key={m.id != null ? `srv-${m.id}` : `local-${i}`} theme={theme} msg={m} compact />
            : <LiveJinaMessage key={m.id != null ? `srv-${m.id}` : `local-${i}`} theme={theme} msg={m} compact />
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
