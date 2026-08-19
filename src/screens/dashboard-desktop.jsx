// dashboard-desktop.jsx — Desktop dashboard for Jina English Tutor

function JinaAvatar({ size = 44, pulsing = false, theme }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      position: 'relative', flex: '0 0 auto',
      background: theme.accentGrad,
      display: 'grid', placeItems: 'center',
      boxShadow: `0 0 0 1px ${theme.border}, 0 8px 24px -8px ${theme.accent}55`,
    }}>
      {pulsing && (
        <span style={{
          position: 'absolute', inset: -3, borderRadius: '50%',
          background: theme.accentGrad, opacity: 0.4,
          animation: 'jina-pulse 1.8s ease-in-out infinite',
          zIndex: 0,
        }} />
      )}
      <span className="jina-serif" style={{
        position: 'relative', zIndex: 1,
        fontSize: size * 0.48, color: '#fff', fontStyle: 'italic',
        textShadow: '0 1px 2px rgba(0,0,0,0.18)',
        lineHeight: 1,
      }}>J</span>
    </div>
  );
}

function NavItem({ icon: Ico, label, active, theme, badge }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px', borderRadius: 10, width: '100%',
      color: active ? theme.text : theme.textMuted,
      background: active ? theme.chipBg : 'transparent',
      fontSize: 14, fontWeight: active ? 600 : 500,
      transition: 'all .15s',
      textAlign: 'left',
    }}>
      <Ico size={18} stroke={active ? 2 : 1.6} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 999,
          background: theme.accent, color: theme.isDark ? '#fff' : '#fff',
          fontWeight: 600,
        }}>{badge}</span>
      )}
    </button>
  );
}

function Sidebar({ theme }) {
  return (
    <aside style={{
      width: 240, padding: '24px 16px',
      borderRight: `1px solid ${theme.border}`,
      background: theme.bgSoft,
      display: 'flex', flexDirection: 'column', gap: 4,
      flex: '0 0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 22px' }}>
        <JinaAvatar size={32} theme={theme} />
        <div>
          <div className="jina-serif" style={{ fontSize: 22, color: theme.text, fontStyle: 'italic', lineHeight: 1 }}>Jina</div>
          <div style={{ fontSize: 10.5, color: theme.textDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>AI English Tutor</div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: theme.textDim, padding: '8px 12px 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>학습</div>
      <NavItem icon={Icons.Home} label="대시보드" active theme={theme} />
      <NavItem icon={Icons.Chat} label="Jina와 대화" theme={theme} badge="LIVE" />
      <NavItem icon={Icons.Mic} label="스피킹 연습" theme={theme} />
      <NavItem icon={Icons.Headphones} label="리스닝" theme={theme} />
      <NavItem icon={Icons.Book} label="단어장" theme={theme} />

      <div style={{ fontSize: 11, color: theme.textDim, padding: '16px 12px 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>시험</div>
      <NavItem icon={Icons.Target} label="TOEIC 모의고사" theme={theme} />
      <NavItem icon={Icons.ChartBar} label="성적 추이" theme={theme} />
      <NavItem icon={Icons.Folder} label="오답 노트" theme={theme} />

      <div style={{ flex: 1 }} />

      {/* Upgrade banner */}
      <div style={{
        padding: 14, borderRadius: 14,
        background: theme.accentGradSoft,
        border: `1px solid ${theme.border}`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Icons.Sparkles size={14} style={{ color: theme.accent }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: theme.text, textTransform: 'uppercase' }}>Jina Pro</span>
        </div>
        <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.45, marginBottom: 10 }}>
          무제한 AI 첨삭과<br/>고급 발음 분석
        </div>
        <button style={{
          fontSize: 12, padding: '7px 12px', borderRadius: 8,
          background: theme.text, color: theme.bg,
          fontWeight: 600,
        }}>업그레이드 →</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 8px 4px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent3})`,
          display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 600,
        }}>수</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: theme.text, fontWeight: 600 }}>이수민</div>
          <div style={{ fontSize: 11, color: theme.textDim }}>토익 목표 900</div>
        </div>
        <Icons.Settings size={16} style={{ color: theme.textDim }} />
      </div>
    </aside>
  );
}

function Card({ children, theme, style, pad = 22 }) {
  return (
    <div style={{
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 18,
      padding: pad,
      backdropFilter: theme.isDark ? 'blur(20px)' : 'none',
      ...style,
    }}>{children}</div>
  );
}

// Hero — Jina's greeting + today's recommendation
function HeroCard({ theme }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      border: `1px solid ${theme.border}`,
      borderRadius: 22,
      padding: 28,
      background: theme.isDark
        ? `linear-gradient(135deg, ${theme.surface} 0%, ${theme.surfaceElev} 100%)`
        : theme.surface,
    }}>
      {/* Aurora orb decoration */}
      <div style={{
        position: 'absolute', right: -80, top: -80, width: 320, height: 320,
        borderRadius: '50%',
        background: theme.accentGrad,
        filter: 'blur(60px)', opacity: theme.isDark ? 0.35 : 0.18,
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        <JinaAvatar size={64} pulsing theme={theme} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: theme.chipBg, color: theme.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>오늘 09:24</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: theme.success, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.success }} />
              온라인
            </span>
          </div>
          <h1 style={{ fontSize: 30, lineHeight: 1.2, color: theme.text, margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
            수민님, <span className="jina-serif" style={{ fontStyle: 'italic', fontWeight: 400 }}>good morning</span>.<br/>
            오늘은 <span style={{
              background: theme.accentGrad,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>비즈니스 회의</span> 표현을 연습해요.
          </h1>
          <p style={{ fontSize: 14, color: theme.textMuted, marginTop: 10, lineHeight: 1.55, maxWidth: 560 }}>
            지난번 첨삭에서 가정법 표현이 약하셨어요. TOEIC Speaking Q11에 자주 출제되는<br/>
            <em>"would have / could have"</em> 패턴을 8분 회화로 자연스럽게 익혀볼게요.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 18px', borderRadius: 11,
              background: theme.text, color: theme.bg,
              fontSize: 14, fontWeight: 600,
            }}>
              <Icons.Mic size={16} stroke={2} />
              지금 시작 · 8분
            </button>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 16px', borderRadius: 11,
              background: 'transparent', color: theme.text,
              border: `1px solid ${theme.borderStrong}`,
              fontSize: 14, fontWeight: 500,
            }}>
              다른 주제 추천받기
              <Icons.Refresh size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Streak / stats strip
function StatStrip({ theme }) {
  const stats = [
    { icon: Icons.Flame, label: '연속 학습', value: '24', unit: '일', accent: theme.accent2 },
    { icon: Icons.Clock, label: '이번 주', value: '4.2', unit: '시간', accent: theme.accent3 },
    { icon: Icons.Target, label: '예상 점수', value: '845', unit: '/ 990', accent: theme.accent },
    { icon: Icons.TrendUp, label: '정확도', value: '87', unit: '%', accent: theme.success, change: '+4%' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {stats.map((s, i) => (
        <Card key={i} theme={theme} pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: s.accent + '22',
              display: 'grid', placeItems: 'center',
              color: s.accent,
            }}>
              <s.icon size={16} stroke={2} />
            </div>
            {s.change && (
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.success, padding: '2px 7px', borderRadius: 999, background: theme.success + '18' }}>
                {s.change}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>{s.label}</div>
          <div style={{ display: 'baseline', alignItems: 'baseline', gap: 4 }}>
            <span className="jina-serif" style={{ fontSize: 30, color: theme.text, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</span>
            <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: 4 }}>{s.unit}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Today's plan
function TodayPlan({ theme }) {
  const items = [
    { id: 1, title: 'Jina와 8분 회화', sub: '비즈니스 미팅 · 가정법', mins: 8, done: true, icon: Icons.Chat, accent: theme.accent },
    { id: 2, title: 'TOEIC Part 5 — 어휘', sub: '20문항 · 약점 보강', mins: 12, done: true, icon: Icons.Bolt, accent: theme.accent3 },
    { id: 3, title: 'Shadowing — TED Talk', sub: '"The puzzle of motivation" 03:20', mins: 10, done: false, current: true, icon: Icons.Mic, accent: theme.accent2 },
    { id: 4, title: '단어 복습', sub: '12개 · SRS 알림', mins: 5, done: false, icon: Icons.Book, accent: theme.warning },
  ];
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>5월 26일 · 화요일</div>
          <h3 style={{ fontSize: 18, color: theme.text, margin: 0, fontWeight: 600 }}>오늘의 학습</h3>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>완료</div>
          <div className="jina-serif" style={{ fontSize: 22, color: theme.text, fontWeight: 500 }}>
            2<span style={{ color: theme.textDim }}>/4</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 14px', borderRadius: 12,
            background: it.current ? theme.chipBg : 'transparent',
            border: it.current ? `1px solid ${theme.borderStrong}` : '1px solid transparent',
            position: 'relative',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 7,
              border: `1.5px solid ${it.done ? it.accent : theme.borderStrong}`,
              background: it.done ? it.accent : 'transparent',
              display: 'grid', placeItems: 'center',
              color: theme.isDark || it.done ? '#fff' : theme.surface,
              flex: '0 0 auto',
            }}>
              {it.done && <Icons.Check size={14} stroke={2.6} />}
            </div>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: it.accent + '20',
              display: 'grid', placeItems: 'center',
              color: it.accent,
              flex: '0 0 auto',
            }}>
              <it.icon size={16} stroke={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, color: theme.text, fontWeight: 600,
                textDecoration: it.done ? 'line-through' : 'none',
                opacity: it.done ? 0.55 : 1,
              }}>{it.title}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{it.sub}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.textMuted, fontSize: 12 }}>
              <Icons.Clock size={13} />
              {it.mins}분
            </div>
            {it.current && (
              <button style={{
                padding: '6px 12px', borderRadius: 8,
                background: theme.text, color: theme.bg,
                fontSize: 12, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Icons.Play size={11} /> 계속
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// Goal progress ring
function GoalRing({ theme }) {
  const current = 845, target = 900, max = 990;
  const pct = (current / target) * 100;
  const circumference = 2 * Math.PI * 70;
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>TOEIC 목표</h3>
        <span style={{ fontSize: 11, color: theme.textMuted, padding: '3px 8px', borderRadius: 999, background: theme.chipBg }}>D-42</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14 }}>
        <div style={{ position: 'relative', width: 156, height: 156, flex: '0 0 auto' }}>
          <svg width="156" height="156" style={{ transform: 'rotate(-90deg)' }}>
            <defs>
              <linearGradient id="goalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={theme.accent} />
                <stop offset="50%" stopColor={theme.accent2} />
                <stop offset="100%" stopColor={theme.accent3} />
              </linearGradient>
            </defs>
            <circle cx="78" cy="78" r="70" fill="none" stroke={theme.border} strokeWidth="10" />
            <circle cx="78" cy="78" r="70" fill="none" stroke="url(#goalGrad)" strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (circumference * pct / 100)}
              strokeLinecap="round" />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'grid', placeItems: 'center', textAlign: 'center',
          }}>
            <div>
              <div className="jina-serif" style={{ fontSize: 38, color: theme.text, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{current}</div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>예상 점수</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2 }}>목표</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span className="jina-serif" style={{ fontSize: 24, color: theme.text, fontWeight: 500 }}>900</span>
              <span style={{ fontSize: 12, color: theme.textMuted }}>/ {max}</span>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2 }}>지난 모의고사</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 16, color: theme.text, fontWeight: 600 }}>825</span>
              <span style={{ fontSize: 11, color: theme.success, fontWeight: 600 }}>↑ 20</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>
            <span style={{ color: theme.accent, fontWeight: 600 }}>Part 5</span>에서<br/>
            +35점 상승 가능
          </div>
        </div>
      </div>
    </Card>
  );
}

// Skill breakdown
function SkillCard({ theme }) {
  const skills = [
    { label: 'Listening', pct: 92, score: '465 / 495' },
    { label: 'Reading', pct: 76, score: '380 / 495' },
    { label: 'Speaking', pct: 64, score: 'Lv. 6' },
    { label: 'Writing', pct: 58, score: 'Lv. 5' },
  ];
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>스킬 분석</h3>
        <button style={{ fontSize: 12, color: theme.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          상세 <Icons.ChevronRight size={12} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {skills.map((s) => (
          <div key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontSize: 12, color: theme.textMuted }}>{s.score}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: theme.border, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${s.pct}%`,
                background: theme.accentGrad,
                borderRadius: 999,
              }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// AI Corrections feed
function CorrectionsCard({ theme }) {
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.Sparkles size={16} style={{ color: theme.accent }} />
          <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>최근 AI 첨삭</h3>
        </div>
        <span style={{ fontSize: 11, color: theme.textMuted }}>어제 19:42</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: theme.chipBg, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6, fontWeight: 600 }}>YOUR SENTENCE</div>
          <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.5 }}>
            "If I <span style={{ textDecoration: 'line-through', color: theme.error }}>would have</span> known about the deadline, I <span style={{ textDecoration: 'line-through', color: theme.error }}>will</span> finish it earlier."
          </div>
          <div style={{ height: 1, background: theme.border, margin: '10px 0' }} />
          <div style={{ fontSize: 11, color: theme.success, marginBottom: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icons.Check size={11} stroke={3} /> CORRECTED
          </div>
          <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.5 }}>
            "If I <span style={{
              background: theme.success + '22', color: theme.success,
              padding: '0 4px', borderRadius: 3, fontWeight: 600,
            }}>had known</span> about the deadline, I <span style={{
              background: theme.success + '22', color: theme.success,
              padding: '0 4px', borderRadius: 3, fontWeight: 600,
            }}>would have finished</span> it earlier."
          </div>
          <div style={{
            marginTop: 12, padding: 10, borderRadius: 8,
            background: theme.accentGradSoft,
            fontSize: 12, color: theme.textMuted, lineHeight: 1.5,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <Icons.Brain size={14} style={{ color: theme.accent, flex: '0 0 auto', marginTop: 1 }} />
            <span><b style={{ color: theme.text }}>가정법 과거완료</b>는 과거 사실의 반대를 표현해요.
              <em> "had p.p." + "would have p.p."</em> 구조를 기억하세요.</span>
          </div>
        </div>

        <button style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 14px', borderRadius: 10,
          background: 'transparent', border: `1px solid ${theme.border}`,
          color: theme.text, fontSize: 13, fontWeight: 500,
        }}>
          전체 첨삭 노트 보기 ({24}건)
          <Icons.ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
}

// Recommended lessons
function RecommendCard({ theme }) {
  const items = [
    { tag: '시험대비', title: 'TOEIC Speaking Q11 — 가정법', sub: '7개 레슨 · 약 35분', match: 96, accent: theme.accent },
    { tag: '회화', title: '비즈니스 이메일 표현 50선', sub: '단어 + 예문 + 받아쓰기', match: 91, accent: theme.accent2 },
    { tag: '리스닝', title: 'NPR News — 이번 주 헤드라인', sub: '레벨 B2 · 8분', match: 88, accent: theme.accent3 },
  ];
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>Jina의 추천</h3>
        <button style={{ fontSize: 12, color: theme.textMuted }}>전체 보기</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => (
          <button key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12,
            background: theme.chipBg, border: `1px solid ${theme.border}`,
            textAlign: 'left', width: '100%',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: it.accent + '22',
              display: 'grid', placeItems: 'center',
              flex: '0 0 auto',
              position: 'relative', overflow: 'hidden',
            }}>
              <div className="jina-serif" style={{ color: it.accent, fontSize: 22, fontStyle: 'italic', fontWeight: 500 }}>{it.tag.charAt(0)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: it.accent + '20', color: it.accent, fontWeight: 600, letterSpacing: '0.04em' }}>{it.tag}</span>
                <span style={{ fontSize: 10, color: theme.textDim }}>· 매칭 {it.match}%</span>
              </div>
              <div style={{ fontSize: 14, color: theme.text, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{it.sub}</div>
            </div>
            <Icons.ChevronRight size={16} style={{ color: theme.textDim }} />
          </button>
        ))}
      </div>
    </Card>
  );
}

// Weekly chart
function WeeklyChart({ theme }) {
  const days = [
    { d: '월', mins: 28, label: '월' },
    { d: '화', mins: 45, label: '화' },
    { d: '수', mins: 18, label: '수' },
    { d: '목', mins: 52, label: '목' },
    { d: '금', mins: 38, label: '금' },
    { d: '토', mins: 64, label: '토' },
    { d: '일', mins: 0, label: '오늘', current: true },
  ];
  const max = 70;
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>이번 주 학습량</h3>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>총 4시간 12분 · 평균보다 <b style={{ color: theme.success }}>32% 많음</b></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'end', height: 100 }}>
        {days.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: '100%', maxWidth: 28,
              height: `${(d.mins / max) * 80 + 4}px`,
              borderRadius: 6,
              background: d.current
                ? `repeating-linear-gradient(135deg, ${theme.accent}40, ${theme.accent}40 4px, ${theme.accent}20 4px, ${theme.accent}20 8px)`
                : d.mins > 40 ? theme.accentGrad : theme.accent + '60',
              border: d.current ? `1.5px dashed ${theme.accent}` : 'none',
            }} />
            <div style={{ fontSize: 11, color: d.current ? theme.accent : theme.textMuted, fontWeight: d.current ? 600 : 500 }}>{d.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TopBar({ theme }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '18px 32px',
      borderBottom: `1px solid ${theme.border}`,
      background: theme.bg,
    }}>
      <div style={{
        flex: 1, maxWidth: 420,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', borderRadius: 10,
        background: theme.chipBg, border: `1px solid ${theme.border}`,
      }}>
        <Icons.Search size={15} style={{ color: theme.textMuted }} />
        <input placeholder="단어, 표현, 레슨을 검색하세요" style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          color: theme.text, fontSize: 13,
        }} />
        <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: theme.border, color: theme.textMuted, fontWeight: 600 }}>⌘ K</span>
      </div>
      <div style={{ flex: 1 }} />
      <button style={{
        padding: '8px 12px', borderRadius: 10,
        background: theme.chipBg,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: theme.text, fontSize: 12.5, fontWeight: 500,
      }}>
        <Icons.Flame size={14} style={{ color: theme.accent2 }} />
        <b className="jina-serif" style={{ fontSize: 15, fontWeight: 500 }}>24</b>일 연속
      </button>
      <button style={{
        width: 36, height: 36, borderRadius: 10,
        background: theme.chipBg, display: 'grid', placeItems: 'center',
        color: theme.text, position: 'relative',
      }}>
        <Icons.Bell size={16} />
        <span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: theme.error, border: `1.5px solid ${theme.bg}` }} />
      </button>
    </header>
  );
}

function DashboardDesktop({ theme }) {
  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex',
      overflow: 'hidden',
    }}>
      <Sidebar theme={theme} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar theme={theme} />
        <div style={{
          flex: 1, padding: '24px 32px 32px',
          display: 'flex', flexDirection: 'column', gap: 18,
          overflow: 'auto',
        }}>
          <HeroCard theme={theme} />
          <StatStrip theme={theme} />
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
            <TodayPlan theme={theme} />
            <GoalRing theme={theme} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
            <SkillCard theme={theme} />
            <WeeklyChart theme={theme} />
            <RecommendCard theme={theme} />
          </div>
          <CorrectionsCard theme={theme} />
        </div>
      </div>
    </div>
  );
}

window.DashboardDesktop = DashboardDesktop;
window.JinaAvatar = JinaAvatar;
