// progress-store.jsx — 학습 통계 Context 스토어. window.ProgressProvider / window.useProgress
// screens/progress.jsx 보다 먼저 로드되어야 한다.
//
// 서버(GET /api/progress)가 구현 전 mock 객체(PROGRESS_DATA)와 **같은 필드명**의 실집계 DTO를
// 내려주므로, 이 파일은 표시 문자열/색만 부착한다. 계산(스트릭·스킬·예상 점수·SRS)은 전부 서버.
// 포맷터가 이 파일 한 곳뿐이라 UI/로직 드리프트가 구조적으로 불가능하다 (vocab-store 규범).
//
// Provider가 없으면(캔버스: app.jsx는 main.jsx를 타지 않는다) FALLBACK_PROGRESS로 떨어져
// 네트워크 없이도 기존 mock 룩 그대로 렌더된다. ★mock 수치는 이 파일에만 존재한다★

const ProgressContext = React.createContext(null);

const PROGRESS_CACHE_KEY = 'jina_progress_cache_v1';
const PROGRESS_REFRESH_DEBOUNCE_MS = 800;

// ── 표시 문자열/색 매퍼 (서버는 DTO만 내려보낸다) ───────────────────────
// ProgressWeeklyChart의 dayMap과 같은 매핑 — 오늘 하이라이트가 자동으로 일치한다.
const DAY_LABEL = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

// mock에 있던 스킬 색을 이관. 서버는 표시값(color)을 내리지 않는다.
const SKILL_COLOR = {
  grammar: '#B794F4', fluency: '#F687B3', vocabulary: '#4FD1C5',
  listening: '#F6AD55', reading: '#68D391',
};

// vocab-store의 formatNextReview와 동형 — 첨삭도 같은 SRS 컬럼 세트를 쓴다.
function formatCorrectionNextReview(c) {
  return c.status === 'new' ? 'New'
    : c.next_review_in_days <= 0 ? 'Today'
    : c.next_review_in_days === 1 ? 'Tomorrow'
    : `In ${c.next_review_in_days} days`;
}

function formatSessionDate(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(t); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  return t.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function progressDayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : DAY_LABEL[d.getDay()];
}

// 서버 DTO → 화면용. 필드는 추가만 하고 이름은 바꾸지 않는다 (하위 JSX 무수정 계약).
function mapProgress(p) {
  if (!p) return null;
  return {
    ...p,
    skills: (p.skills || []).map((s) => ({ ...s, color: SKILL_COLOR[s.key] || '#B794F4' })),
    weekly: (p.weekly || []).map((w) => ({ ...w, day: progressDayLabel(w.date) })),
    monthly_scores: p.monthly_scores || [],
    corrections_due: (p.corrections_due || []).map((c) => ({
      ...c, next_review: formatCorrectionNextReview(c),
    })),
    recent_sessions: (p.recent_sessions || []).map((s) => ({ ...s, date: formatSessionDate(s.at) })),
  };
}

function ProgressProvider({ children }) {
  // 첫 페인트를 비우지 않기 위해 캐시를 동기 초기값으로 쓴다 (빈 화면 금지)
  const [data, setData] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(PROGRESS_CACHE_KEY) || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const dataRef = React.useRef(data);
  const inFlight = React.useRef(false);
  const refreshTimer = React.useRef(null);

  React.useEffect(() => { dataRef.current = data; }, [data]);

  const refresh = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const res = await window.JINA_API.get('/api/progress');
    inFlight.current = false;
    if (res.ok) {
      setError(null);
      const mapped = mapProgress(res.progress);
      setData(mapped);
      try { localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(mapped)); } catch {}
    } else {
      // 로드 실패 → write-through 캐시 폴백 + 에러 배너 (빈 화면 금지)
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
      try {
        const cached = JSON.parse(localStorage.getItem(PROGRESS_CACHE_KEY) || 'null');
        if (cached) setData((prev) => prev || cached);
      } catch {}
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refresh();
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [refresh]);

  // 복습 응답의 stats만으로는 weekly/streak가 안 늘어난다 → 성공 후 debounce된 재조회 1회.
  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { refresh(); }, PROGRESS_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // 낙관적: 복습된 첨삭은 next_review가 반드시 미래가 되므로 due 목록에서 즉시 제거(배지 감소).
  // 실패하면 롤백 + 에러 배너 (vocab-store updateWord 패턴).
  const reviewCorrection = React.useCallback(async (correctionId, result) => {
    const before = dataRef.current;
    if (!before) return { ok: false, code: 'NOT_READY', error: '아직 로딩 중입니다.' };
    const target = (before.corrections_due || []).find((c) => c.id === correctionId);
    if (!target) return { ok: false, code: 'NOT_FOUND', error: '첨삭을 찾을 수 없습니다.' };

    setData({ ...before, corrections_due: before.corrections_due.filter((c) => c.id !== correctionId) });

    const res = await window.JINA_API.post(`/api/corrections/${correctionId}/review`, {
      result, client_request_id: crypto.randomUUID(),
    });
    if (res.ok) {
      setError(null);
      scheduleRefresh(); // 집계(streak/weekly/스킬) 동기화
    } else {
      setData(before); // 롤백
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
    }
    return res;
  }, [scheduleRefresh]);

  const value = React.useMemo(
    () => ({ data, loading, error, refresh, reviewCorrection, formatCorrectionNextReview }),
    [data, loading, error, refresh, reviewCorrection],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

// ── Provider 부재 시(캔버스) 정적 fallback ─────────────────────────────
// screens/progress.jsx 에 있던 mock 리터럴(PROGRESS_DATA)을 그대로 이식한 것.
// 화면 파일에 리터럴이 남으면 서버 단일 소스가 깨진다 — 그래서 여기로 이사했다.
// preview는 srs.js와 같은 공식의 데모 dry-run (실제 계산은 서버에 있다).
const FALLBACK_PREVIEW = (interval, ef) => {
  const mk = (i, e, again) => ({
    interval_days: i, ease_factor: e, in_days: again ? 0 : i, label: again ? '10분' : `${i}일`,
  });
  return {
    again: mk(0, Math.max(1.3, ef - 0.2), true),
    hard: mk(Math.max(1, Math.round(interval * 1.2)), Math.max(1.3, ef - 0.15)),
    good: mk(Math.max(2, Math.round(interval * ef)), ef),
    easy: mk(Math.max(4, Math.round(interval * ef * 1.3)), Math.min(3, ef + 0.15)),
  };
};
const FALLBACK_CORRECTION = (id, original, corrected, type, reason) => ({
  id, original, corrected, type, reason,
  status: 'due', next_review: 'Today', next_review_in_days: 0,
  interval_days: 1, ease_factor: 2.5, review_count: 0, fail_count: 0, seen_count: 1,
  preview: FALLBACK_PREVIEW(1, 2.5),
});

const FALLBACK_PROGRESS = {
  user: {
    name: '수민',
    target_test: 'TOEIC',
    target_score: 850,
    current_score: 720,
    streak: 24,
    total_minutes: 1840,
    sessions_done: 48,
    words_learned: 243,
  },
  skills: [
    { key: 'grammar', label: 'Grammar', value: 74, delta: 3, color: SKILL_COLOR.grammar },
    { key: 'fluency', label: 'Fluency', value: 68, delta: 5, color: SKILL_COLOR.fluency },
    { key: 'vocabulary', label: 'Vocabulary', value: 81, delta: 2, color: SKILL_COLOR.vocabulary },
    { key: 'listening', label: 'Listening', value: 62, delta: 8, color: SKILL_COLOR.listening },
    { key: 'reading', label: 'Reading', value: 79, delta: 1, color: SKILL_COLOR.reading },
  ],
  weekly: [
    { date: null, day: '월', minutes: 28, sessions: 2, accuracy: 72 },
    { date: null, day: '화', minutes: 45, sessions: 3, accuracy: 78 },
    { date: null, day: '수', minutes: 20, sessions: 1, accuracy: 65 },
    { date: null, day: '목', minutes: 52, sessions: 4, accuracy: 82 },
    { date: null, day: '금', minutes: 35, sessions: 2, accuracy: 75 },
    { date: null, day: '토', minutes: 60, sessions: 5, accuracy: 88 },
    { date: null, day: '일', minutes: 15, sessions: 1, accuracy: 70 },
  ],
  monthly_scores: [
    { month: '12월', score: 645 },
    { month: '1월', score: 668 },
    { month: '2월', score: 690 },
    { month: '3월', score: 705 },
    { month: '4월', score: 718 },
    { month: '5월', score: 720 },
  ],
  weeks_to_target: 8,
  corrections_due: [
    FALLBACK_CORRECTION(1, 'I am agree with you', 'I agree with you', 'grammar',
      "'am agree'는 틀린 표현. agree는 일반 동사"),
    FALLBACK_CORRECTION(2, 'make a decision about going', 'decide whether to go', 'usage',
      '더 자연스러운 영어 표현'),
    FALLBACK_CORRECTION(3, 'discuss about the issue', 'discuss the issue', 'grammar',
      'discuss는 전치사 없이 바로 목적어'),
  ],
  recent_sessions: [
    { id: 'conversation-1', kind: 'conversation', title: 'TOEIC Speaking Q5-7', at: null, date: '오늘', duration: 12, score: 82, corrections: 2 },
    { id: 'conversation-2', kind: 'conversation', title: '비즈니스 회의 표현', at: null, date: '어제', duration: 20, score: 75, corrections: 4 },
    { id: 'lesson-3', kind: 'lesson', title: 'TOEIC Part 7 리딩', at: null, date: '5월 25일', duration: 18, score: 88, corrections: 1 },
    { id: 'conversation-4', kind: 'conversation', title: '자기소개 영어', at: null, date: '5월 24일', duration: 15, score: 70, corrections: 5 },
  ],
};

function useProgressFallback() {
  return React.useMemo(() => ({
    data: FALLBACK_PROGRESS,
    loading: false,
    error: null,
    refresh: () => Promise.resolve(),
    reviewCorrection: () => Promise.resolve({
      ok: false, code: 'READONLY', error: '캔버스에서는 저장이 비활성화되어 있습니다.',
    }),
    formatCorrectionNextReview,
  }), []);
}

function useProgress() {
  const ctx = React.useContext(ProgressContext);
  const fallback = useProgressFallback(); // 훅 규칙상 항상 호출
  return ctx || fallback;
}

window.ProgressProvider = ProgressProvider;
window.useProgress = useProgress;
window.PROGRESS_FMT = {
  dayLabel: progressDayLabel,
  sessionDate: formatSessionDate,
  nextReview: formatCorrectionNextReview,
  SKILL_COLOR,
  DAY_LABEL,
};
