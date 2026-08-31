// progress.jsx — 학습 통계 화면 (Desktop + Mobile)
// 일별 진도, 스킬 점수, 연속 학습, 첨삭 SRS 복습, 예상 TOEIC 점수
//
// 수치는 전부 서버 집계(GET /api/progress) — 이 파일에 mock 리터럴은 없다.
// (구현 전 mock 객체는 src/shared/progress-store.jsx의 FALLBACK_PROGRESS로 이사했다.
//  캔버스는 Provider가 없어 그 fallback으로 기존과 동일하게 렌더된다.)
// Desktop/Mobile이 같은 useProgress()를 소비하므로 창 크기 전환에도 수치·복습 진행이 이어진다.

const SCORE_MILESTONES = [600, 700, 750, 800, 850, 900, 990];

// SRS 라벨/색/순서는 vocabulary.jsx가 정의한 단일 소스를 재사용한다 (두 화면의 복습 버튼이
// 갈라지지 않게). 부제는 하드코딩하지 않고 서버 preview[r].label을 그대로 쓴다.
const CORR_SRS_ORDER = typeof SRS_RESULTS !== 'undefined' ? SRS_RESULTS : ['again', 'hard', 'good', 'easy'];
const CORR_SRS_LABELS = typeof SRS_LABELS !== 'undefined'
  ? SRS_LABELS : { again: '다시', hard: '어려움', good: '보통', easy: '쉬움' };
const CORR_SRS_COLORS = typeof SRS_COLORS !== 'undefined'
  ? SRS_COLORS : { again: '#FC8181', hard: '#F6AD55', good: '#4FD1C5', easy: '#68D391' };

// ─────────────────────────────────────────────────────
// 공용 빈 상태 / 로딩 / 에러 (빈 화면 금지 규범)
// ─────────────────────────────────────────────────────
function ProgressEmpty({ theme, children, pad = 18 }) {
  return (
    <div style={{
      padding: pad, borderRadius: 12,
      background: theme.card, border: `1px dashed ${theme.border}`,
      fontSize: 12.5, color: theme.textMuted, textAlign: 'center', lineHeight: 1.6,
    }}>{children}</div>
  );
}

function ProgressLoading({ theme, error }) {
  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'grid', placeItems: 'center',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', maxWidth: 380, padding: 24 }}>
        <div style={{ fontSize: 13, color: theme.textMuted }}>학습 통계를 불러오는 중…</div>
        {error && (
          <div style={{ fontSize: 12, color: theme.error, textAlign: 'center', lineHeight: 1.6 }}>{error}</div>
        )}
      </div>
    </div>
  );
}

function ProgressErrorBanner({ theme, error }) {
  if (!error) return null;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 12,
      background: theme.error + '18', border: `1px solid ${theme.error}44`,
      color: theme.error, fontSize: 12, lineHeight: 1.5,
    }}>{error}</div>
  );
}

// ─────────────────────────────────────────────────────
// Desktop Progress
// ─────────────────────────────────────────────────────
function ProgressDesktop({ theme, onNavigate }) {
  const { data: d, error, reviewCorrection } = useProgress();
  const [reviewing, setReviewing] = React.useState(false);

  if (!d) return <ProgressLoading theme={theme} error={error} />;

  const maxWeeklyMinutes = Math.max(0, ...d.weekly.map((w) => w.minutes));
  const hasScore = d.user.current_score != null;
  const scoreProgress = hasScore
    ? (d.user.current_score - 600) / Math.max(1, d.user.target_score - 600)
    : 0;
  const clampedProgress = Math.max(0, Math.min(1, scoreProgress));

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex',
    }}>
      {/* Sidebar */}
      <aside aria-label="통계 메뉴" style={{
        width: 240, padding: '24px 16px',
        borderRight: `1px solid ${theme.border}`,
        background: theme.bgSoft,
        display: 'flex', flexDirection: 'column', gap: 4,
        flexShrink: 0,
      }}>
        {/* 로고 — 클릭하면 홈(대시보드). 공통 사이드바 로고와 같은 동작 */}
        <button type="button" onClick={() => onNavigate && onNavigate('dashboard')} aria-label="홈(대시보드)으로" title="홈으로"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 20px', width: '100%', textAlign: 'left' }}>
          <JinaAvatar size={32} theme={theme} />
          <span className="jina-serif" style={{ fontSize: 20, fontStyle: 'italic', color: theme.text }}>Jina</span>
        </button>
        {[
          { id: 'overview', label: '학습 개요', active: true },
          { id: 'sessions', label: '세션 기록' },
          { id: 'corrections', label: '첨삭 복습', badge: d.corrections_due.length },
        ].map(({ id, label, active, badge }) => (
          <div key={id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 10,
            color: active ? theme.text : theme.textMuted,
            background: active ? theme.chipBg : 'transparent',
            fontSize: 14, fontWeight: active ? 600 : 500,
          }}>
            <span style={{ flex: 1 }}>{label}</span>
            {badge > 0 && (
              <span style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 999,
                background: theme.warning, color: '#fff', fontWeight: 700,
              }}>{badge}</span>
            )}
          </div>
        ))}

        <div style={{ marginTop: 'auto', padding: '16px 12px 0', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>이번 주</div>
          {[
            { label: '총 학습 시간', value: `${d.weekly.reduce((s, w) => s + w.minutes, 0)}분` },
            { label: '완료 세션', value: `${d.weekly.reduce((s, w) => s + w.sessions, 0)}회` },
            { label: '연속 학습', value: `${d.user.streak}일 🔥` },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: theme.textMuted }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{value}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 28 }}>

          <ProgressErrorBanner theme={theme} error={error} />

          {/* Top row: Score + Streak */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {/* TOEIC Score card */}
            <div style={{
              padding: 24, borderRadius: 18,
              background: theme.surface, border: `1px solid ${theme.border}`,
              gridColumn: '1 / 3',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {d.user.target_test} 예상 점수
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 52, fontWeight: 800, color: theme.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {hasScore ? d.user.current_score : '—'}
                    </span>
                    <span style={{ fontSize: 18, color: theme.textMuted }}>/ {d.user.target_score}</span>
                    <span style={{ fontSize: 13, color: theme.success, fontWeight: 700, marginLeft: 4 }}>목표</span>
                  </div>
                </div>
                {/* 델타 칩은 월별 스냅샷이 있을 때만 — monthly_scores가 비면 근거가 없다 */}
                {hasScore && d.monthly_scores.length > 0 && (
                  <div style={{
                    padding: '8px 14px', borderRadius: 12,
                    background: theme.success + '18', color: theme.success,
                    fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Icons.TrendUp size={16} />
                    +{d.user.current_score - d.monthly_scores[0].score}
                  </div>
                )}
              </div>

              {/* Progress road */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  {SCORE_MILESTONES.map((ms) => (
                    <span key={ms} style={{
                      fontSize: 10.5, color: ms <= (d.user.current_score ?? 0) ? theme.text : theme.textDim,
                      fontWeight: ms === d.user.target_score ? 800 : ms <= (d.user.current_score ?? 0) ? 700 : 400,
                    }}>{ms}</span>
                  ))}
                </div>
                <div style={{ height: 8, borderRadius: 99, background: theme.chipBg, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    background: theme.accentGrad,
                    width: `${clampedProgress * 100}%`,
                    borderRadius: 99,
                    transition: 'width 0.6s ease',
                  }} />
                  {/* Target marker */}
                  <div style={{
                    position: 'absolute', top: -4, bottom: -4,
                    left: `${clampedProgress * 100}%`,
                    width: 3, background: theme.accent,
                    borderRadius: 99,
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                {hasScore ? (
                  <React.Fragment>
                    목표까지 <span style={{ fontWeight: 700, color: theme.text }}>
                      {Math.max(0, d.user.target_score - d.user.current_score)}점
                    </span> 남았어요.
                    {/* weeks_to_target이 null이면(스냅샷 미도입) 예측 절을 렌더하지 않는다 */}
                    {d.weeks_to_target != null && (
                      <React.Fragment>
                        {' '}현재 페이스로는 약 <span style={{ fontWeight: 700, color: theme.success }}>{d.weeks_to_target}주</span> 후 달성 가능해요.
                      </React.Fragment>
                    )}
                  </React.Fragment>
                ) : '회화·학습 데이터가 쌓이면 예상 점수를 계산해요.'}
              </div>
            </div>

            {/* Streak */}
            <div style={{
              padding: 24, borderRadius: 18,
              background: theme.surface, border: `1px solid ${theme.border}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8,
            }}>
              <Icons.Flame size={32} style={{ color: theme.accent2 }} />
              <div style={{ fontSize: 48, fontWeight: 800, color: theme.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {d.user.streak}
              </div>
              <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>연속 학습일</div>
              <div style={{ fontSize: 11, color: theme.textDim, textAlign: 'center', lineHeight: 1.5 }}>
                {d.user.streak > 0 ? '오늘도 이어가고 있어요 🔥' : '오늘 한 세션으로 다시 시작해요'}<br/>
                누적 {d.user.total_minutes}분 · {d.user.sessions_done}세션
              </div>
            </div>
          </div>

          {/* Skills radar-bar */}
          <div style={{
            padding: 24, borderRadius: 18,
            background: theme.surface, border: `1px solid ${theme.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>스킬 분석</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>영역별 점수</div>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>최근 7일 대비</div>
            </div>
            {d.skills.length === 0 ? (
              <ProgressEmpty theme={theme}>AI 회화를 시작하면 스킬 분석이 표시돼요.</ProgressEmpty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {d.skills.map((sk) => (
                  <SkillBar key={sk.label} skill={sk} theme={theme} />
                ))}
              </div>
            )}
          </div>

          {/* Weekly activity chart */}
          <div style={{
            padding: 24, borderRadius: 18,
            background: theme.surface, border: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>주간 활동</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 24 }}>이번 주 학습 시간</div>
            <ProgressWeeklyChart data={d.weekly} theme={theme} maxMinutes={maxWeeklyMinutes} />
          </div>

          {/* Bottom row: Sessions + Corrections */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Recent sessions */}
            <div style={{
              padding: 24, borderRadius: 18,
              background: theme.surface, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>최근 세션</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 20 }}>세션 기록</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {d.recent_sessions.length === 0 ? (
                  <ProgressEmpty theme={theme}>아직 세션 기록이 없어요. 회화나 학습을 시작해보세요.</ProgressEmpty>
                ) : d.recent_sessions.map((s) => (
                  <SessionRow key={s.id} session={s} theme={theme} />
                ))}
              </div>
            </div>

            {/* Corrections */}
            <div style={{
              padding: 24, borderRadius: 18,
              background: theme.surface, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>첨삭 복습 (SRS)</div>
                <span style={{
                  fontSize: 10.5, padding: '2px 8px', borderRadius: 999,
                  background: theme.warning + '22', color: theme.warning, fontWeight: 700,
                }}>{d.corrections_due.length}개 대기</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 20 }}>오늘 복습할 패턴</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.corrections_due.length === 0 ? (
                  <ProgressEmpty theme={theme}>복습할 첨삭이 없어요 🎉</ProgressEmpty>
                ) : d.corrections_due.map((c) => (
                  <CorrectionCard
                    key={c.id} correction={c} theme={theme}
                    reviewing={reviewing}
                    onResult={(r) => reviewCorrection(c.id, r)}
                  />
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setReviewing((v) => !v)}
                  disabled={d.corrections_due.length === 0}
                  style={{
                    flex: 1, padding: '11px 16px', borderRadius: 10,
                    background: theme.accentGrad, color: '#fff',
                    fontSize: 13, fontWeight: 700,
                    opacity: d.corrections_due.length === 0 ? 0.45 : 1,
                    cursor: d.corrections_due.length === 0 ? 'not-allowed' : 'pointer',
                  }}>
                  {reviewing ? '복습 종료' : '지금 복습 시작'}
                </button>
              </div>
            </div>
          </div>

          {/* Score trend */}
          <div style={{
            padding: 24, borderRadius: 18,
            background: theme.surface, border: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>점수 추이</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 24 }}>월별 TOEIC 예상 점수</div>
            {/* 2점 미만이면 ScoreTrend의 Math.min(...[])·100/(length-1)이 깨진다 → 빈 상태 */}
            {d.monthly_scores.length >= 2 ? (
              <ScoreTrend data={d.monthly_scores} theme={theme} target={d.user.target_score} />
            ) : (
              <ProgressEmpty theme={theme}>월별 추이는 데이터가 쌓이면 표시돼요.</ProgressEmpty>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Skill Bar
// ─────────────────────────────────────────────────────
function SkillBar({ skill, theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 90, fontSize: 13, color: theme.textMuted, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>
        {skill.label}
      </div>
      <div style={{ flex: 1, height: 8, borderRadius: 99, background: theme.chipBg, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: skill.color,
          width: `${skill.value}%`,
          transition: 'width 0.8s ease',
        }} />
      </div>
      <div style={{ width: 44, textAlign: 'right', fontWeight: 800, fontSize: 15, color: theme.text, flexShrink: 0 }}>
        {skill.value}
      </div>
      <div style={{
        width: 44, textAlign: 'right', flexShrink: 0,
        fontSize: 11.5, fontWeight: 700,
        color: skill.delta >= 0 ? theme.success : theme.error,
      }}>
        {skill.delta >= 0 ? '+' : ''}{skill.delta}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Weekly Chart
// ─────────────────────────────────────────────────────
function ProgressWeeklyChart({ data, theme, maxMinutes }) {
  const today = new Date().getDay(); // 0=Sun, 1=Mon...
  const dayMap = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };
  const todayLabel = dayMap[today];

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120 }}>
      {data.map((d) => {
        const h = maxMinutes > 0 ? (d.minutes / maxMinutes) * 100 : 0;
        const isToday = d.day === todayLabel;
        return (
          <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600 }}>{d.minutes}m</div>
            <div style={{
              width: '100%', borderRadius: 8,
              background: isToday ? theme.accentGrad : theme.chipBg,
              height: `${Math.max(h, 8)}%`,
              transition: 'height 0.6s ease',
              minHeight: 4,
              boxShadow: isToday ? `0 4px 12px ${theme.accent}44` : 'none',
            }} />
            <div style={{ fontSize: 12, color: isToday ? theme.accent : theme.textMuted, fontWeight: isToday ? 700 : 500 }}>
              {d.day}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Score Trend — 호출부가 data.length >= 2 를 보장한다
// ─────────────────────────────────────────────────────
function ScoreTrend({ data, theme, target }) {
  const minScore = Math.min(...data.map((d) => d.score)) - 30;
  const maxScore = Math.max(target + 20, ...data.map((d) => d.score)) + 20;
  const range = maxScore - minScore;
  const w = 100 / (data.length - 1);

  const toY = (score) => ((maxScore - score) / range) * 100;
  const pts = data.map((d, i) => `${i * w},${toY(d.score)}`).join(' ');
  const areaBottom = `${(data.length - 1) * w},100 0,100`;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 100 60`} preserveAspectRatio="none" style={{ width: '100%', height: 140, overflow: 'visible' }}>
        {/* Target line */}
        <line x1="0" y1={toY(target)} x2="100" y2={toY(target)}
          stroke={theme.success} strokeWidth="0.5" strokeDasharray="2,1.5" opacity={0.6} />
        {/* Area fill */}
        <polygon points={`${pts} ${areaBottom}`}
          fill={`url(#scoreGrad)`} opacity={0.15} />
        {/* Line */}
        <polyline points={pts} fill="none"
          stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {data.map((d, i) => (
          <circle key={i} cx={i * w} cy={toY(d.score)} r="2.5"
            fill={i === data.length - 1 ? theme.accent : theme.surface}
            stroke={theme.accent} strokeWidth="1.5" />
        ))}
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.accent} />
            <stop offset="100%" stopColor={theme.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {data.map((d) => (
          <div key={d.month} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, color: theme.textDim }}>{d.month}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{d.score}</div>
          </div>
        ))}
      </div>
      {/* Target label */}
      <div style={{ position: 'absolute', right: 0, top: `calc(${toY(target)}% - 10px)`, fontSize: 11, color: theme.success, fontWeight: 700 }}>
        목표 {target}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Session Row
// ─────────────────────────────────────────────────────
function SessionRow({ session: s, theme }) {
  // score는 null 가능(점수 없는 degraded 세션) — null을 숫자 비교에 넣으면 error색이 된다
  const scoreColor = s.score == null ? theme.textDim
    : s.score >= 80 ? theme.success
    : s.score >= 65 ? theme.warning
    : theme.error;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px', borderRadius: 12,
      background: theme.card, border: `1px solid ${theme.border}`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: theme.text, marginBottom: 3 }}>{s.title}</div>
        <div style={{ fontSize: 11.5, color: theme.textDim, display: 'flex', gap: 10 }}>
          <span>{s.date}</span>
          <span>{s.duration}분</span>
          {s.corrections > 0 && <span style={{ color: theme.warning }}>첨삭 {s.corrections}개</span>}
        </div>
      </div>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: scoreColor + '18', border: `1px solid ${scoreColor}30`,
        display: 'grid', placeItems: 'center',
        fontSize: 16, fontWeight: 800, color: scoreColor,
      }}>{s.score ?? '—'}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Correction Card — reviewing이면 SRS 버튼 4개.
// 버튼 부제는 서버 preview[r].label (하드코딩 금지 — 실제 계산의 dry-run이다)
// ─────────────────────────────────────────────────────
function CorrectionCard({ correction: c, theme, reviewing = false, onResult }) {
  const [busy, setBusy] = React.useState(false);
  const handle = async (r) => {
    if (busy || !onResult) return;
    setBusy(true);
    try { await onResult(r); } finally { setBusy(false); }
  };
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: theme.card, border: `1px solid ${theme.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ textDecoration: 'line-through', color: theme.error, fontSize: 13 }}>{c.original}</span>
        <Icons.ArrowRight size={11} style={{ color: theme.textDim, flexShrink: 0 }} />
        <span style={{
          background: theme.success + '22', color: theme.success,
          padding: '2px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600,
        }}>{c.corrected}</span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4,
          background: theme.chipBg, color: theme.textDim, fontWeight: 600,
        }}>{c.type}</span>
      </div>
      <div style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>{c.reason}</div>
      {reviewing && c.preview && (
        <div style={{
          marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
        }}>
          {CORR_SRS_ORDER.map((r) => (
            <button key={r} onClick={() => handle(r)} disabled={busy} style={{
              padding: '8px 4px', borderRadius: 10,
              background: CORR_SRS_COLORS[r] + '22',
              color: CORR_SRS_COLORS[r],
              border: `1.5px solid ${CORR_SRS_COLORS[r]}44`,
              fontSize: 12, fontWeight: 700,
              opacity: busy ? 0.5 : 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <span>{CORR_SRS_LABELS[r]}</span>
              <span style={{ fontSize: 9.5, opacity: 0.7, fontWeight: 500 }}>
                {c.preview?.[r]?.label || ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Mobile Progress — 데스크탑과 같은 useProgress()를 소비한다 (수치 일치 보장)
// ─────────────────────────────────────────────────────
function MobileProgress({ theme, noNav = false, onNavigate }) {
  const { data: d, error, reviewCorrection } = useProgress();
  const [reviewing, setReviewing] = React.useState(false);

  if (!d) return <ProgressLoading theme={theme} error={error} />;

  const maxWeeklyMinutes = Math.max(0, ...d.weekly.map((w) => w.minutes));
  const hasScore = d.user.current_score != null;
  const scorePct = hasScore
    ? Math.max(0, Math.min(1, (d.user.current_score - 600) / Math.max(1, d.user.target_score - 600))) * 100
    : 0;

  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>학습 통계</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{d.user.name}님의 성장</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 12px', borderRadius: 999,
          background: theme.accent2 + '22', color: theme.accent2,
          fontSize: 14, fontWeight: 700,
        }}>
          <Icons.Flame size={14} />
          {d.user.streak}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ProgressErrorBanner theme={theme} error={error} />

        {/* Score card */}
        <div style={{
          padding: '20px', borderRadius: 20,
          background: theme.surface, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: 11, color: theme.textDim, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            {d.user.target_test} 예상 점수
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: theme.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {hasScore ? d.user.current_score : '—'}
            </span>
            <span style={{ fontSize: 16, color: theme.textMuted }}>/ {d.user.target_score}점 목표</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: theme.chipBg, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{
              height: '100%', borderRadius: 99, background: theme.accentGrad,
              width: `${scorePct}%`,
            }} />
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {hasScore ? (
              <React.Fragment>
                목표까지 <span style={{ fontWeight: 700, color: theme.text }}>
                  {Math.max(0, d.user.target_score - d.user.current_score)}점
                </span>
                {d.weeks_to_target != null && (
                  <React.Fragment>
                    {' '}· 예상 <span style={{ color: theme.success, fontWeight: 700 }}>{d.weeks_to_target}주</span> 후 달성
                  </React.Fragment>
                )}
              </React.Fragment>
            ) : '회화·학습 데이터가 쌓이면 예상 점수를 계산해요.'}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: '총 시간', value: `${Math.round(d.user.total_minutes / 60)}h`, color: theme.accent },
            { label: '세션', value: `${d.user.sessions_done}회`, color: theme.accent2 },
            { label: '단어', value: `${d.user.words_learned}개`, color: theme.accent3 },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              padding: '14px 10px', borderRadius: 14, textAlign: 'center',
              background: theme.surface, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Skills */}
        <div style={{
          padding: '18px', borderRadius: 18,
          background: theme.surface, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 16 }}>스킬 점수</div>
          {d.skills.length === 0 ? (
            <ProgressEmpty theme={theme}>AI 회화를 시작하면 스킬 분석이 표시돼요.</ProgressEmpty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {d.skills.map((sk) => (
                <div key={sk.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 72, fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>{sk.label}</div>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: theme.chipBg }}>
                    <div style={{ height: '100%', borderRadius: 99, background: sk.color, width: `${sk.value}%` }} />
                  </div>
                  <div style={{ width: 36, textAlign: 'right', fontWeight: 700, fontSize: 14, color: theme.text }}>{sk.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly chart */}
        <div style={{
          padding: '18px', borderRadius: 18,
          background: theme.surface, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 16 }}>주간 학습 시간</div>
          <ProgressWeeklyChart data={d.weekly} theme={theme} maxMinutes={maxWeeklyMinutes} />
        </div>

        {/* Recent sessions */}
        <div style={{
          padding: '18px', borderRadius: 18,
          background: theme.surface, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 14 }}>최근 세션</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {d.recent_sessions.length === 0 ? (
              <ProgressEmpty theme={theme}>아직 세션 기록이 없어요.</ProgressEmpty>
            ) : d.recent_sessions.slice(0, 3).map((s) => (
              <SessionRow key={s.id} session={s} theme={theme} />
            ))}
          </div>
        </div>

        {/* Corrections due */}
        <div style={{
          padding: '18px', borderRadius: 18,
          background: theme.surface, border: `1px solid ${theme.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>오늘 첨삭 복습</div>
            <span style={{
              fontSize: 10.5, padding: '2px 8px', borderRadius: 999,
              background: theme.warning + '22', color: theme.warning, fontWeight: 700,
            }}>{d.corrections_due.length}개</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {d.corrections_due.length === 0 ? (
              <ProgressEmpty theme={theme}>복습할 첨삭이 없어요 🎉</ProgressEmpty>
            ) : d.corrections_due.map((c) => (
              <CorrectionCard
                key={c.id} correction={c} theme={theme}
                reviewing={reviewing}
                onResult={(r) => reviewCorrection(c.id, r)}
              />
            ))}
          </div>
          <button
            onClick={() => setReviewing((v) => !v)}
            disabled={d.corrections_due.length === 0}
            style={{
              width: '100%', marginTop: 14,
              padding: '12px', borderRadius: 12,
              background: theme.accentGrad, color: '#fff',
              fontSize: 14, fontWeight: 700,
              opacity: d.corrections_due.length === 0 ? 0.45 : 1,
              cursor: d.corrections_due.length === 0 ? 'not-allowed' : 'pointer',
            }}>
            {reviewing ? '복습 종료' : '지금 복습 시작'}
          </button>
        </div>
      </div>

      {!noNav && <AppMobileNav theme={theme} active="progress" onNavigate={onNavigate} />}
    </div>
  );
}

window.ProgressDesktop = ProgressDesktop;
window.MobileProgress = MobileProgress;
