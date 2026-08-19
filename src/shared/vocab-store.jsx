// vocab-store.jsx — 단어장 Context 스토어. window.VocabProvider / window.useVocab
// screens/vocabulary.jsx 보다 먼저 로드되어야 한다.
//
// Desktop/Mobile이 각자 훅을 부르던 state 분리 문제를 Context 승격으로 해소한다.
// Provider가 없으면(캔버스) 메모리 fallback으로 떨어져 API 없이도 렌더된다.
// 계산(SRS/상태/라벨)은 전부 서버 — 클라이언트는 표시 문자열만 만든다.

const VocabContext = React.createContext(null);

// 서버 DTO → 화면용: next_review 표시 문자열은 클라이언트 매퍼가 만든다.
// 포맷터가 이 하나뿐이라 UI/로직 드리프트가 구조적으로 불가능하다.
function formatNextReview(c) {
  return c.status === 'new' ? 'New'
    : c.next_review_in_days <= 0 ? 'Today'
    : c.next_review_in_days === 1 ? 'Tomorrow'
    : `In ${c.next_review_in_days} days`;
}
const withDisplay = (c) => ({ ...c, next_review: formatNextReview(c) });

const VOCAB_CACHE_KEY = 'jina_vocab_cache_v2';

function VocabProvider({ children }) {
  const [cards, setCards] = React.useState([]);
  const [stats, setStats] = React.useState({ due: 0, learned: 0, new: 0, total: 0 });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  // addState: { pending: string|null, result: {ok, card?|error?, duplicate?}|null }
  const [addState, setAddState] = React.useState({ pending: null, result: null });
  const addAbortRef = React.useRef(null);

  const applyList = React.useCallback((res) => {
    const list = (res.cards || []).map(withDisplay);
    setCards(list);
    if (res.stats) setStats(res.stats);
    try { localStorage.setItem(VOCAB_CACHE_KEY, JSON.stringify({ cards: list, stats: res.stats })); } catch {}
  }, []);

  const refresh = React.useCallback(async () => {
    const res = await window.JINA_API.get('/api/vocab');
    if (res.ok) {
      setError(null);
      applyList(res);
    } else {
      // 로드 실패 → write-through 캐시 폴백 + 에러 배너 (빈 화면 금지)
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
      try {
        const cached = JSON.parse(localStorage.getItem(VOCAB_CACHE_KEY) || 'null');
        if (cached?.cards?.length) {
          setCards(cached.cards);
          if (cached.stats) setStats(cached.stats);
        }
      } catch {}
    }
    setLoading(false);
  }, [applyList]);

  React.useEffect(() => { refresh(); }, [refresh]);

  // 복습: 낙관적 — 서버 preview 값으로 즉시 적용 → POST → 서버 값으로 교체 → 실패 시 롤백
  const updateWord = React.useCallback(async (cardId, result) => {
    const before = cards;
    const target = cards.find((c) => c.id === cardId);
    if (!target) return;
    const p = target.preview?.[result];
    const optimistic = withDisplay({
      ...target,
      status: 'learned', // again도 next_review=+10분이라 서버 파생값과 동일
      next_review_in_days: p ? p.in_days : target.next_review_in_days,
      interval_days: p ? p.interval_days : target.interval_days,
      ease_factor: p ? p.ease_factor : target.ease_factor,
      review_count: target.review_count + 1,
      fail_count: target.fail_count + (result === 'again' ? 1 : 0),
      last_result: result,
    });
    setCards((prev) => prev.map((c) => (c.id === cardId ? optimistic : c)));

    const res = await window.JINA_API.post(`/api/vocab/${cardId}/review`, {
      result, client_request_id: crypto.randomUUID(),
    });
    if (res.ok) {
      setError(null);
      setCards((prev) => prev.map((c) => (c.id === cardId ? withDisplay(res.card) : c)));
      if (res.stats) setStats(res.stats);
    } else {
      setCards(before); // 롤백
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
    }
    return res;
  }, [cards]);

  // 추가: 비낙관적 — CLI 5~15초. pending 상태 + 취소 지원.
  const addWord = React.useCallback(async (word, { provider, model } = {}) => {
    const controller = new AbortController();
    addAbortRef.current = controller;
    setAddState({ pending: word, result: null });
    const res = await window.JINA_API.post('/api/vocab/add',
      { word, provider, model }, { signal: controller.signal });
    addAbortRef.current = null;
    if (res.ok) {
      setAddState({ pending: null, result: { ok: true, card: withDisplay(res.card), duplicate: res.duplicate } });
      refresh(); // 목록/통계 동기화
    } else if (res.code === 'ABORTED') {
      setAddState({ pending: null, result: null });
    } else {
      setAddState({ pending: null, result: { ok: false, error: res.error, hint: res.hint } });
    }
    return res;
  }, [refresh]);

  const cancelAdd = React.useCallback(() => { addAbortRef.current?.abort(); }, []);

  const removeWord = React.useCallback(async (cardId) => {
    const res = await window.JINA_API.del(`/api/vocab/${cardId}`);
    if (res.ok) setCards((prev) => prev.filter((c) => c.id !== cardId));
    return res;
  }, []);

  const value = React.useMemo(() => ({
    cards, stats, loading, error, addState,
    updateWord, addWord, cancelAdd, removeWord, refresh, formatNextReview,
  }), [cards, stats, loading, error, addState, updateWord, addWord, cancelAdd, removeWord, refresh]);

  return <VocabContext.Provider value={value}>{children}</VocabContext.Provider>;
}

// ── Provider 부재 시(캔버스) 메모리 fallback ──────────────────────
// DTO 모양의 데모 카드. 계산은 데모 전용 미니 SRS — 실제 로직은 서버에 있다.
const FALLBACK_PREVIEW = (interval, ef) => {
  const mk = (i, e, again) => ({ interval_days: i, ease_factor: e, in_days: again ? 0 : i, label: again ? '10분' : `${i}일` });
  return {
    again: mk(0, Math.max(1.3, ef - 0.2), true),
    hard: mk(Math.max(1, Math.round(interval * 1.2)), Math.max(1.3, ef - 0.15)),
    good: mk(Math.max(2, Math.round(interval * ef)), ef),
    easy: mk(Math.max(4, Math.round(interval * ef * 1.3)), Math.min(3, ef + 0.15)),
  };
};
const FALLBACK_CARD = (id, word, pos, ipa, meaning_ko, examples, difficulty, status, inDays, interval, ef, rc, fc) =>
  withDisplay({
    id, word_id: id, word, pos, ipa, meaning_ko, examples, difficulty, status,
    next_review_in_days: inDays, interval_days: interval, ease_factor: ef,
    review_count: rc, fail_count: fc, suspended: false,
    accuracy: rc > 0 ? Math.round(((rc - fc) / rc) * 100) : null,
    preview: FALLBACK_PREVIEW(interval, ef),
  });
const FALLBACK_CARDS = [
  FALLBACK_CARD(1, 'accommodate', 'v.', '/əˈkɒmədeɪt/', '수용하다, 맞추다',
    ['The schedule was changed to accommodate the regional conference.', 'We can accommodate up to 200 guests in the main hall.'], 3, 'due', 0, 1, 2.5, 3, 1),
  FALLBACK_CARD(2, 'procurement', 'n.', '/prəˈkjʊərmənt/', '조달, 구매',
    ['The procurement department handles all supplier contracts.', 'Procurement costs increased by 8% this quarter.'], 4, 'due', 0, 1, 2.3, 2, 2),
  FALLBACK_CARD(3, 'discrepancy', 'n.', '/dɪˈskrepənsi/', '불일치, 차이',
    ['There is a discrepancy between the invoice and the purchase order.', 'Please investigate the discrepancy in the report figures.'], 4, 'learned', 3, 3, 2.8, 7, 1),
  FALLBACK_CARD(4, 'compliance', 'n.', '/kəmˈplaɪəns/', '준수, 규정 이행',
    ['All employees must complete the annual compliance training.', 'The audit confirmed full compliance with safety regulations.'], 3, 'new', 0, 1, 2.5, 0, 0),
];

function useVocabFallback() {
  const [cards, setCards] = React.useState(FALLBACK_CARDS);
  const [addState, setAddState] = React.useState({ pending: null, result: null });
  const updateWord = React.useCallback((cardId, result) => {
    setCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      const p = c.preview[result];
      return withDisplay({
        ...c, status: 'learned',
        next_review_in_days: p.in_days, interval_days: p.interval_days, ease_factor: p.ease_factor,
        review_count: c.review_count + 1, fail_count: c.fail_count + (result === 'again' ? 1 : 0),
        preview: FALLBACK_PREVIEW(p.interval_days, p.ease_factor),
      });
    }));
    return Promise.resolve({ ok: true });
  }, []);
  const addWord = React.useCallback((word) => {
    setAddState({ pending: null, result: { ok: false, error: '캔버스에서는 저장이 비활성화되어 있습니다.' } });
    return Promise.resolve({ ok: false, code: 'READONLY', error: '캔버스에서는 저장이 비활성화되어 있습니다.' });
  }, []);
  const stats = React.useMemo(() => ({
    due: cards.filter((c) => c.status === 'due').length,
    learned: cards.filter((c) => c.status === 'learned').length,
    new: cards.filter((c) => c.status === 'new').length,
    total: cards.length,
  }), [cards]);
  return {
    cards, stats, loading: false, error: null, addState,
    updateWord, addWord, cancelAdd: () => {}, removeWord: () => Promise.resolve({ ok: true }),
    refresh: () => Promise.resolve(), formatNextReview,
  };
}

function useVocab() {
  const ctx = React.useContext(VocabContext);
  const fallback = useVocabFallback(); // 훅 규칙상 항상 호출
  return ctx || fallback;
}

window.VocabProvider = VocabProvider;
window.useVocab = useVocab;
