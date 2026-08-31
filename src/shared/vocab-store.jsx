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

  // ── 오늘의 단어 (AI 퀴즈) — 서버가 단일 소스(vocab_quizzes). 화면은 문항 진행 상태만 가진다.
  // quiz: { current: QuizDto|null, loaded, loading, generating, error }
  const [quiz, setQuiz] = React.useState({ current: null, loaded: false, loading: false, generating: false, error: null });
  const quizAbortRef = React.useRef(null);
  const quizError = (res) => (res.hint ? `${res.error} — ${res.hint}` : res.error);

  const loadTodayQuiz = React.useCallback(async () => {
    setQuiz((q) => ({ ...q, loading: true }));
    const res = await window.JINA_API.get('/api/vocab/quiz/today');
    setQuiz((q) => ({
      ...q, loading: false, loaded: true,
      current: res.ok ? res.quiz : q.current,
      error: res.ok ? null : quizError(res),
    }));
    return res;
  }, []);

  // 생성: 비낙관적 — CLI 10~30초. 취소 지원(요청이 끊기면 서버가 CLI 프로세스까지 죽인다).
  const generateQuiz = React.useCallback(async ({ kind, keyword, provider, model } = {}) => {
    const controller = new AbortController();
    quizAbortRef.current = controller;
    setQuiz((q) => ({ ...q, generating: true, error: null }));
    const res = await window.JINA_API.post('/api/vocab/quiz', { kind, keyword, provider, model }, { signal: controller.signal });
    quizAbortRef.current = null;
    if (res.ok) setQuiz((q) => ({ ...q, generating: false, loaded: true, current: res.quiz }));
    else if (res.code === 'ABORTED') setQuiz((q) => ({ ...q, generating: false }));
    else setQuiz((q) => ({ ...q, generating: false, error: quizError(res) }));
    return res;
  }, []);
  const cancelQuiz = React.useCallback(() => { quizAbortRef.current?.abort(); }, []);

  // 채점은 서버 — 응답의 quiz(answers/score/completed_at)로 교체
  const answerQuiz = React.useCallback(async (quizId, answers) => {
    const res = await window.JINA_API.post(`/api/vocab/quiz/${quizId}/answer`, { answers });
    if (res.ok) setQuiz((q) => ({ ...q, current: res.quiz, error: null }));
    else setQuiz((q) => ({ ...q, error: quizError(res) }));
    return res;
  }, []);

  // 퀴즈 단어 → 단어장 (AI 재호출 없음). 성공 시 목록/통계 동기화
  const addQuizWords = React.useCallback(async (quizId, indexes) => {
    const res = await window.JINA_API.post(`/api/vocab/quiz/${quizId}/add`, { indexes: indexes || [] });
    if (res.ok) refresh();
    return res;
  }, [refresh]);

  const value = React.useMemo(() => ({
    cards, stats, loading, error, addState,
    updateWord, addWord, cancelAdd, removeWord, refresh, formatNextReview,
    quiz, loadTodayQuiz, generateQuiz, cancelQuiz, answerQuiz, addQuizWords,
  }), [cards, stats, loading, error, addState, updateWord, addWord, cancelAdd, removeWord, refresh,
      quiz, loadTodayQuiz, generateQuiz, cancelQuiz, answerQuiz, addQuizWords]);

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

// 캔버스용 데모 퀴즈 — DTO 모양(options 는 정답+오답 3개 고정 순서). 실제 셔플/채점은 서버.
const FQ = (index, word, pos, ipa, meaning_ko, example_en, example_ko, d) => ({
  index, word, pos, ipa, meaning_ko, example_en, example_ko, difficulty: 3,
  options: index % 2 ? [d[0], meaning_ko, d[1], d[2]] : [d[0], d[1], meaning_ko, d[2]],
});
const FALLBACK_QUIZ = {
  id: 0, kind: 'random', keyword: null, topic_title: '비즈니스 이메일 표현', topic_ko: '업무 메일에서 자주 쓰는 동사·명사 10개',
  total: 10, answers: null, score: null, provider: null, model: null, created_at: null, completed_at: null,
  words: [
    FQ(0, 'attach', 'v.', '/əˈtætʃ/', '첨부하다', 'Please find the report attached to this email.', '이 메일에 첨부한 보고서를 확인해 주세요.', ['삭제하다', '전달하다', '요약하다']),
    FQ(1, 'forward', 'v.', '/ˈfɔːrwərd/', '전달하다, 회송하다', 'I will forward the invoice to accounting.', '청구서를 회계팀에 전달하겠습니다.', ['보류하다', '승인하다', '취소하다']),
    FQ(2, 'attendee', 'n.', '/əˌtenˈdiː/', '참석자', 'All attendees will receive the slides afterward.', '참석자 전원이 이후 슬라이드를 받게 됩니다.', ['발표자', '주최자', '후원자']),
    FQ(3, 'agenda', 'n.', '/əˈdʒendə/', '안건, 의제', 'The agenda for Monday is attached.', '월요일 안건을 첨부했습니다.', ['회의록', '예산안', '일정표']),
    FQ(4, 'follow up', 'v.', '/ˈfɑːloʊ ʌp/', '후속 조치하다, 다시 확인하다', 'I am following up on my previous email.', '이전 메일에 대해 다시 확인차 연락드립니다.', ['철회하다', '보고하다', '연기하다']),
    FQ(5, 'deadline', 'n.', '/ˈdedlaɪn/', '기한, 마감', 'The deadline has been extended to Friday.', '기한이 금요일로 연장되었습니다.', ['시작일', '휴가', '예산']),
    FQ(6, 'clarify', 'v.', '/ˈklærɪfaɪ/', '명확히 하다', 'Could you clarify the second point?', '두 번째 항목을 명확히 해 주시겠어요?', ['반박하다', '축소하다', '승인하다']),
    FQ(7, 'confidential', 'adj.', '/ˌkɑːnfɪˈdenʃl/', '기밀의', 'This document is confidential.', '이 문서는 기밀입니다.', ['공개된', '긴급한', '임시의']),
    FQ(8, 'reschedule', 'v.', '/ˌriːˈskedʒuːl/', '일정을 변경하다', 'Can we reschedule the call to 3 p.m.?', '통화를 오후 3시로 옮길 수 있을까요?', ['취소하다', '기록하다', '확정하다']),
    FQ(9, 'regards', 'n.', '/rɪˈɡɑːrdz/', '안부, (맺음말) ~올림', 'Best regards, Jina', '감사합니다, Jina', ['참조', '제목', '서명']),
  ],
};
const READONLY_RES = { ok: false, code: 'READONLY', error: '캔버스에서는 저장이 비활성화되어 있습니다.' };

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
    quiz: { current: FALLBACK_QUIZ, loaded: true, loading: false, generating: false, error: null },
    loadTodayQuiz: () => Promise.resolve({ ok: true, quiz: FALLBACK_QUIZ }),
    generateQuiz: () => Promise.resolve(READONLY_RES), cancelQuiz: () => {},
    answerQuiz: () => Promise.resolve(READONLY_RES), addQuizWords: () => Promise.resolve(READONLY_RES),
  };
}

function useVocab() {
  const ctx = React.useContext(VocabContext);
  const fallback = useVocabFallback(); // 훅 규칙상 항상 호출
  return ctx || fallback;
}

window.VocabProvider = VocabProvider;
window.useVocab = useVocab;
