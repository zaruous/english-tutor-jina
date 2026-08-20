// dashboard-desktop.jsx — Desktop dashboard for Jina English Tutor
//
// 모든 수치의 단일 소스는 서버(GET /api/dashboard) — 이 파일에 mock 리터럴은 없다.
// 리프 컴포넌트가 각자 useDashboard()를 직접 부른다(props 릴레이 대신). Provider가 없으면
// (캔버스 아트보드) 훅이 fallback DTO를 돌려주므로 같은 코드로 기존 룩이 렌더된다.
// null = 데이터 없음 → 정의된 빈 상태. 0("전부 틀림")과 구분한다.

// 첫 로드(캐시도 없을 때) 카드 자리를 지키는 스켈레톤 — 빈 화면 금지
function DashSkel({ theme, h = 120, radius = 18, style }) {
  return (
    <div style={{
      height: h, borderRadius: radius, background: theme.card,
      border: `1px solid ${theme.border}`, position: 'relative', overflow: 'hidden', ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0, background: theme.chipBg, opacity: 0.55,
        animation: 'jina-pulse 1.6s ease-in-out infinite',
      }} />
    </div>
  );
}

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
  const { dash } = useDashboard();
  const name = dash?.user?.display_name || '';
  const target = dash?.goal?.target_score;
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
        }}>{name.charAt(0) || '·'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: theme.text, fontWeight: 600 }}>{name || '—'}</div>
          <div style={{ fontSize: 11, color: theme.textDim }}>
            {target != null ? `토익 목표 ${target}` : '토익 목표 미설정'}
          </div>
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
// 히어로 카피의 단일 소스는 recommendations[0] (추천 1순위) — 서버 규칙 기반, AI 호출 없음.
function HeroCard({ theme, onNavigate }) {
  const { dash } = useDashboard();
  if (!dash) return <DashSkel theme={theme} h={220} radius={22} />;
  const rec = dash.recommendations?.[0];
  const name = dash.user?.display_name || '';
  const go = (nav) => onNavigate && nav && onNavigate(nav);
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
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: theme.chipBg, color: theme.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>{`오늘 ${DASH_FMT.clock()}`}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: theme.success, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.success }} />
              온라인
            </span>
          </div>
          <h1 style={{ fontSize: 30, lineHeight: 1.2, color: theme.text, margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {name}님, <span className="jina-serif" style={{ fontStyle: 'italic', fontWeight: 400 }}>{DASH_FMT.greeting()}</span>.<br/>
            {rec ? (
              <React.Fragment>
                오늘은 <span style={{
                  background: theme.accentGrad,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>{rec.title}</span>부터 시작해요.
              </React.Fragment>
            ) : '오늘도 함께 시작해요.'}
          </h1>
          <p style={{ fontSize: 14, color: theme.textMuted, marginTop: 10, lineHeight: 1.55, maxWidth: 560 }}>
            {rec?.sub || '학습 기록이 쌓이면 Jina가 오늘의 추천을 골라드려요.'}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => go(rec?.nav)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 18px', borderRadius: 11,
              background: theme.text, color: theme.bg,
              fontSize: 14, fontWeight: 600,
            }}>
              <Icons.Mic size={16} stroke={2} />
              지금 시작
            </button>
            <button onClick={() => go(dash.recommendations?.[1]?.nav || rec?.nav)} style={{
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
  const { dash } = useDashboard();
  if (!dash) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[0, 1, 2, 3].map((i) => <DashSkel key={i} theme={theme} h={128} />)}
      </div>
    );
  }
  const s = dash.stats;
  const stats = [
    { icon: Icons.Flame, label: '연속 학습', value: s.streak_days, unit: '일', accent: theme.accent2 },
    { icon: Icons.Clock, label: '이번 주', value: DASH_FMT.hours(s.week_minutes), unit: '시간', accent: theme.accent3 },
    { icon: Icons.Target, label: '예상 점수', value: s.predicted_score ?? '—', unit: `/ ${dash.goal.exam_max}`, accent: theme.accent },
    { icon: Icons.TrendUp, label: '정확도', value: s.accuracy_pct ?? '—', unit: '%', accent: theme.success,
      // change는 상승분만 노출 (null = 기록 없음, 0 = 변화 없음 → 둘 다 배지 없음)
      change: s.accuracy_change > 0 ? `+${s.accuracy_change}%p` : null },
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
function TodayPlan({ theme, onNavigate }) {
  const { dash } = useDashboard();
  if (!dash) return <DashSkel theme={theme} h={320} />;
  const plan = dash.today_plan;
  // current = 첫 미완료 항목 (파생 — 서버가 내려보내지 않는다)
  const currentKey = plan.items.find((it) => !it.done)?.key;
  const items = plan.items.map((it) => {
    const meta = dashPlanMeta(it.key, theme);
    return { ...it, icon: meta.Icon, accent: meta.accent, current: it.key === currentKey };
  });
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>{DASH_FMT.planDate()}</div>
          <h3 style={{ fontSize: 18, color: theme.text, margin: 0, fontWeight: 600 }}>오늘의 학습</h3>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>완료</div>
          <div className="jina-serif" style={{ fontSize: 22, color: theme.text, fontWeight: 500 }}>
            {plan.done}<span style={{ color: theme.textDim }}>/{plan.total}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => (
          <div key={it.key} style={{
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
              <button onClick={() => onNavigate && onNavigate(it.nav)} style={{
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
  const { dash } = useDashboard();
  if (!dash) return <DashSkel theme={theme} h={320} />;
  const g = dash.goal;
  const current = g.predicted_score;            // null = 채점 이력 부족 → 빈 상태
  const target = g.target_score, max = g.exam_max;
  const pct = current == null ? 0 : Math.min(100, (current / target) * 100);
  const lessonRec = dash.recommendations.find((r) => r.nav === 'lesson');
  const circumference = 2 * Math.PI * 70;
  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>TOEIC 목표</h3>
        {g.d_day != null && (
          <span style={{ fontSize: 11, color: theme.textMuted, padding: '3px 8px', borderRadius: 999, background: theme.chipBg }}>{`D-${g.d_day}`}</span>
        )}
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
            {current == null ? (
              <div style={{ padding: '0 22px', fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>
                레슨을 풀면<br/>예상 점수가<br/>표시돼요
              </div>
            ) : (
              <div>
                <div className="jina-serif" style={{ fontSize: 38, color: theme.text, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{current}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>예상 점수</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2 }}>목표</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span className="jina-serif" style={{ fontSize: 24, color: theme.text, fontWeight: 500 }}>{target}</span>
              <span style={{ fontSize: 12, color: theme.textMuted }}>/ {max}</span>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            {/* mock의 "지난 모의고사"는 데이터가 없다 — 실제로 있는 건 최근 레슨 점수다 */}
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2 }}>최근 레슨</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 16, color: theme.text, fontWeight: 600 }}>
                {g.last_lesson_score != null ? `${g.last_lesson_score}%` : '—'}
              </span>
              {g.last_lesson_delta > 0 && (
                <span style={{ fontSize: 11, color: theme.success, fontWeight: 600 }}>↑ {g.last_lesson_delta}</span>
              )}
            </div>
          </div>
          {lessonRec && (
            <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>
              <span style={{ color: theme.accent, fontWeight: 600 }}>{lessonRec.title}</span><br/>
              {lessonRec.sub}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Skill breakdown
function SkillCard({ theme }) {
  const { dash } = useDashboard();
  if (!dash) return <DashSkel theme={theme} h={240} />;
  const skills = dash.skills; // pct null = v1에 데이터 소스가 없는 스킬 → 바 0% + dim
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
          <div key={s.key || s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: s.pct == null ? theme.textDim : theme.text, fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontSize: 12, color: s.pct == null ? theme.textDim : theme.textMuted }}>{s.score_text}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: theme.border, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${s.pct ?? 0}%`,
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

// AI Corrections feed — 원본은 corrections 최신 1행 (회화 탭이 적재).
// v1은 통문장 렌더: mock의 취소선/하이라이트 diff는 토큰 단위 근거가 없어 후속으로 미룬다.
function CorrectionsCard({ theme, onNavigate }) {
  const { dash } = useDashboard();
  if (!dash) return <DashSkel theme={theme} h={260} />;
  const c = dash.recent_correction;

  if (!c) {
    // 빈 상태 — corrections 테이블 부재 또는 0행
    return (
      <Card theme={theme} pad={22}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Icons.Sparkles size={16} style={{ color: theme.accent }} />
          <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>최근 AI 첨삭</h3>
        </div>
        <div style={{
          padding: '22px 16px', borderRadius: 12, textAlign: 'center',
          background: theme.chipBg, border: `1px dashed ${theme.border}`,
        }}>
          <Icons.Brain size={22} style={{ color: theme.textDim }} />
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            회화 첨삭이 쌓이면 여기 표시돼요.
          </div>
          <button onClick={() => onNavigate && onNavigate('conversation')} style={{
            marginTop: 12, padding: '9px 14px', borderRadius: 10,
            background: theme.text, color: theme.bg, fontSize: 13, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            Jina와 회화 시작 <Icons.ArrowRight size={13} />
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card theme={theme} pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.Sparkles size={16} style={{ color: theme.accent }} />
          <h3 style={{ fontSize: 16, color: theme.text, margin: 0, fontWeight: 600 }}>최근 AI 첨삭</h3>
        </div>
        <span style={{ fontSize: 11, color: theme.textMuted }}>{DASH_FMT.relative(c.created_at)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: theme.chipBg, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6, fontWeight: 600 }}>YOUR SENTENCE</div>
          <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.5, textDecoration: 'line-through' }}>
            "{c.original}"
          </div>
          <div style={{ height: 1, background: theme.border, margin: '10px 0' }} />
          <div style={{ fontSize: 11, color: theme.success, marginBottom: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icons.Check size={11} stroke={3} /> CORRECTED
          </div>
          <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.5 }}>
            "<span style={{
              background: theme.success + '22', color: theme.success,
              padding: '0 4px', borderRadius: 3, fontWeight: 600,
            }}>{c.corrected}</span>"
          </div>
          {c.explanation && (
            <div style={{
              marginTop: 12, padding: 10, borderRadius: 8,
              background: theme.accentGradSoft,
              fontSize: 12, color: theme.textMuted, lineHeight: 1.5,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <Icons.Brain size={14} style={{ color: theme.accent, flex: '0 0 auto', marginTop: 1 }} />
              <span>{c.explanation}</span>
            </div>
          )}
        </div>

        <button onClick={() => onNavigate && onNavigate('conversation')} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 14px', borderRadius: 10,
          background: 'transparent', border: `1px solid ${theme.border}`,
          color: theme.text, fontSize: 13, fontWeight: 500,
        }}>
          전체 첨삭 노트 보기 ({c.total_count}건)
          <Icons.ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
}

// Recommended lessons
function RecommendCard({ theme, onNavigate }) {
  const { dash } = useDashboard();
  if (!dash) return <DashSkel theme={theme} h={240} />;
  // 규칙 기반 추천 (서버). mock의 "매칭 %"는 근거 없는 수치라 폐기했다.
  const items = dash.recommendations.map((it) => ({ ...it, accent: dashRecAccent(it.tag, theme) }));
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
