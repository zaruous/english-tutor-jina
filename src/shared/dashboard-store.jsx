// dashboard-store.jsx — 대시보드 Context 스토어. window.DashboardProvider / window.useDashboard
// screens/dashboard-desktop.jsx, screens/mobile.jsx 보다 먼저 로드되어야 한다.
// (vocab-store.jsx 패턴 복제 — 읽기 전용이라 낙관적 업데이트/pending 상태가 없어 더 단순하다.)
//
// 산식(스트릭·주간·정확도·예상 점수·추천)은 전부 서버(GET /api/dashboard). 클라이언트는
// 표시 문자열만 만든다 — 날짜/시각/상대시간 포맷터가 이 파일 한 곳뿐이라 UI/로직 드리프트가
// 구조적으로 불가능하다 (vocab-store의 formatNextReview 규범).
//
// Provider가 없으면(캔버스: app.jsx는 main.jsx를 타지 않는다) 정적 fallback DTO로 떨어져
// 네트워크 없이도 기존 mock 룩 그대로 렌더된다.

const DashboardContext = React.createContext(null);

const DASH_CACHE_KEY = 'jina_dashboard_cache_v1';
const DASH_THROTTLE_MS = 15000; // 탭 재진입마다 refresh()가 불리므로 남발 방지

// ── 표시 문자열 포맷터 (서버는 DTO만 내려보낸다 — weekly.days[].dow만 예외) ──
function dashGreeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'good morning' : h < 18 ? 'good afternoon' : 'good evening';
}
function dashClock(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function dashPlanDate(d = new Date()) {
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}
function dashShortDate(d = new Date()) {
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}
// 첨삭 카드의 "어제 19:42" 자리 — created_at(ISO) → 상대 표기
function dashRelative(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const hm = dashClock(t);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(t); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return `오늘 ${hm}`;
  if (diff === 1) return `어제 ${hm}`;
  if (diff < 7) return `${diff}일 전`;
  return t.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
// 분 → "4.2" (시간, StatStrip) / "총 4시간 12분" (WeeklyChart)
const dashHours = (mins) => ((mins || 0) / 60).toFixed(1);
function dashDuration(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(m / 60);
  return h > 0 ? `총 ${h}시간 ${m % 60}분` : `총 ${m}분`;
}

// ── today_plan key → 아이콘/색 매핑 (데스크탑·모바일이 공유 — 중복 정의 금지) ──
const DASH_PLAN_META = {
  conversation: { icon: 'Chat', accent: 'accent' },
  lesson:       { icon: 'Bolt', accent: 'accent3' },
  vocab:        { icon: 'Book', accent: 'warning' },
  shadowing:    { icon: 'Mic',  accent: 'accent2' }, // fallback(캔버스) 전용 키
};
function dashPlanMeta(key, theme) {
  const m = DASH_PLAN_META[key] || { icon: 'Bolt', accent: 'accent' };
  return { Icon: Icons[m.icon] || Icons.Bolt, accent: theme[m.accent] || theme.accent };
}
// 추천 카드 tag → 색 (tag는 서버 문자열이라 매핑에 없으면 accent)
function dashRecAccent(tag, theme) {
  return ({ 단어: theme.warning, 시험대비: theme.accent3, 회화: theme.accent,
            리스닝: theme.accent2 })[tag] || theme.accent;
}

function DashboardProvider({ children }) {
  // 첫 페인트를 비우지 않기 위해 캐시를 동기 초기값으로 쓴다 (빈 화면 금지)
  const [dash, setDash] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(DASH_CACHE_KEY) || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const lastFetchedAt = React.useRef(0);
  const inFlight = React.useRef(false);

  const refresh = React.useCallback(async ({ force = false } = {}) => {
    if (inFlight.current) return;
    if (!force && Date.now() - lastFetchedAt.current < DASH_THROTTLE_MS) return;
    inFlight.current = true;
    const res = await window.JINA_API.get('/api/dashboard');
    inFlight.current = false;
    if (res.ok) {
      lastFetchedAt.current = Date.now();
      setError(null);
      const { ok, ...dto } = res;
      setDash(dto);
      try { localStorage.setItem(DASH_CACHE_KEY, JSON.stringify(dto)); } catch {}
    } else {
      // 로드 실패 → write-through 캐시 폴백 + 에러 배너 (빈 화면 금지)
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
      try {
        const cached = JSON.parse(localStorage.getItem(DASH_CACHE_KEY) || 'null');
        if (cached) setDash((prev) => prev || cached);
      } catch {}
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { refresh({ force: true }); }, [refresh]);

  const value = React.useMemo(
    () => ({ dash, loading, error, refresh }),
    [dash, loading, error, refresh],
  );
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

// ── Provider 부재 시(캔버스) 정적 fallback DTO ─────────────────────────
// dashboard-desktop.jsx / mobile.jsx 에 있던 mock 리터럴을 DTO 모양으로 이식한 것.
// ★mock 수치는 이 파일에만 존재한다★ — 화면 파일에 리터럴이 남으면 서버 단일 소스가 깨진다.
const FALLBACK_DASH = {
  user: { display_name: '이수민' },
  stats: {
    streak_days: 24, week_minutes: 252, week_change_pct: 32,
    predicted_score: 845, accuracy_pct: 87, accuracy_change: 4,
  },
  goal: {
    target_score: 900, exam_max: 990, exam_date: null, d_day: 42,
    predicted_score: 845, last_lesson_score: 825, last_lesson_delta: 20,
  },
  today_plan: {
    done: 2, total: 4,
    items: [
      { key: 'conversation', title: 'Jina와 8분 회화', sub: '비즈니스 미팅 · 가정법', mins: 8, done: true, nav: 'conversation' },
      { key: 'lesson', title: 'TOEIC Part 5 — 어휘', sub: '20문항 · 약점 보강', mins: 12, done: true, nav: 'lesson' },
      { key: 'shadowing', title: 'Shadowing — TED Talk', sub: '"The puzzle of motivation" 03:20', mins: 10, done: false, nav: 'progress' },
      { key: 'vocab', title: '단어 복습', sub: '12개 · SRS', mins: 5, done: false, nav: 'vocabulary' },
    ],
  },
  skills: [
    { key: 'listening', label: 'Listening', pct: 92, score_text: '465 / 495' },
    { key: 'reading', label: 'Reading', pct: 76, score_text: '380 / 495' },
    { key: 'speaking', label: 'Speaking', pct: 64, score_text: 'Lv. 6' },
    { key: 'vocab', label: 'Vocabulary', pct: 58, score_text: 'Lv. 5' },
  ],
  weekly: {
    total_minutes: 252,
    days: [
      { date: null, dow: '월', minutes: 28, today: false },
      { date: null, dow: '화', minutes: 45, today: false },
      { date: null, dow: '수', minutes: 18, today: false },
      { date: null, dow: '목', minutes: 52, today: false },
      { date: null, dow: '금', minutes: 38, today: false },
      { date: null, dow: '토', minutes: 64, today: false },
      { date: null, dow: '일', minutes: 0, today: true },
    ],
  },
  recent_correction: {
    original: 'If I would have known about the deadline, I will finish it earlier.',
    corrected: 'If I had known about the deadline, I would have finished it earlier.',
    explanation: '가정법 과거완료는 과거 사실의 반대를 표현해요. "had p.p." + "would have p.p." 구조를 기억하세요.',
    created_at: null, // 캔버스는 상대시각 대신 고정 라벨을 쓴다
    total_count: 24,
  },
  recommendations: [
    { tag: '회화', title: '비즈니스 회의 표현', sub: '가정법 "would have / could have" 패턴을 8분 회화로', nav: 'conversation' },
    { tag: '시험대비', title: 'TOEIC Speaking Q11 — 가정법', sub: '7개 레슨 · 약 35분', nav: 'lesson' },
    { tag: '단어', title: '비즈니스 이메일 표현 50선', sub: '단어 + 예문 + 받아쓰기', nav: 'vocabulary' },
  ],
};

function useDashboardFallback() {
  return React.useMemo(() => ({
    dash: FALLBACK_DASH, loading: false, error: null,
    refresh: () => Promise.resolve(),
  }), []);
}

function useDashboard() {
  const ctx = React.useContext(DashboardContext);
  const fallback = useDashboardFallback(); // 훅 규칙상 항상 호출
  return ctx || fallback;
}

window.DashboardProvider = DashboardProvider;
window.useDashboard = useDashboard;
window.DASH_PLAN_META = DASH_PLAN_META;
window.dashPlanMeta = dashPlanMeta;
window.dashRecAccent = dashRecAccent;
window.DASH_FMT = {
  greeting: dashGreeting, clock: dashClock, planDate: dashPlanDate,
  shortDate: dashShortDate, relative: dashRelative, hours: dashHours, duration: dashDuration,
};
