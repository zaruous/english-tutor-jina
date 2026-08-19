// lesson-store.jsx — TOEIC 학습 Context 스토어. window.LessonProvider / window.useLesson
// screens/lesson.jsx 보다 먼저 로드되어야 한다. (vocab-store.jsx 패턴 1:1 복제)
//
// - 콘텐츠/채점/진도의 단일 소스는 서버. 정답을 클라이언트가 모르므로 채점은 비낙관적
//   (서버 왕복 후 공개 — 이것이 이 설계의 목적이다).
// - answersByLesson: key={lesson.id} 리마운트에도 답이 살아남는 곳.
// - Provider가 없으면(캔버스) 메모리 fallback — fallback 데이터에만 answer/explanation을
//   내장해 로컬 채점 데모가 가능하다 (실서비스 경로에는 존재하지 않음).

const LessonContext = React.createContext(null);

const LESSON_CACHE_KEY = 'jina_lesson_cache_v1';

function LessonProvider({ children }) {
  const [lessons, setLessons] = React.useState([]);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [listLoading, setListLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [currentId, setCurrentId] = React.useState(null);
  const [details, setDetails] = React.useState({});           // { [lessonId]: LessonDetail } 캐시
  const [currentLoading, setCurrentLoading] = React.useState(false);
  const [answersByLesson, setAnswersByLesson] = React.useState({}); // { [lessonId]: { [n]: optionId } }
  const [resultByLesson, setResultByLesson] = React.useState({});   // { [lessonId]: { attempt, results } }
  const [grading, setGrading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const res = await window.JINA_API.get('/api/lessons');
    if (res.ok) {
      setError(null);
      setLessons(res.lessons || []);
      if (res.progress) setProgress(res.progress);
      try { localStorage.setItem(LESSON_CACHE_KEY, JSON.stringify({ lessons: res.lessons, progress: res.progress })); } catch {}
    } else {
      // 로드 실패 → write-through 캐시 폴백 + 에러 배너 (빈 화면 금지)
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
      try {
        const cached = JSON.parse(localStorage.getItem(LESSON_CACHE_KEY) || 'null');
        if (cached?.lessons?.length) {
          setLessons(cached.lessons);
          if (cached.progress) setProgress(cached.progress);
        }
      } catch {}
    }
    setListLoading(false);
    return res;
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const select = React.useCallback(async (lessonId) => {
    if (!lessonId) return;
    setCurrentId(lessonId);
    if (details[lessonId]) return; // detail 캐시 재사용 (localStorage에는 저장 안 함 — 본문이 크다)
    setCurrentLoading(true);
    const res = await window.JINA_API.get(`/api/lessons/${lessonId}`);
    if (res.ok) {
      setError(null);
      setDetails((prev) => ({ ...prev, [lessonId]: res.lesson }));
    } else {
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
    }
    setCurrentLoading(false);
  }, [details]);

  // 목록 로드 후 첫 레슨 자동 선택
  React.useEffect(() => {
    if (!currentId && lessons.length > 0) select(lessons[0].id);
  }, [currentId, lessons, select]);

  const setAnswer = React.useCallback((n, optionId) => {
    setAnswersByLesson((prev) => {
      if (!currentId || resultByLesson[currentId]) return prev; // 채점 후에는 무시
      return { ...prev, [currentId]: { ...(prev[currentId] || {}), [n]: optionId } };
    });
  }, [currentId, resultByLesson]);

  const submit = React.useCallback(async () => {
    if (!currentId || grading) return;
    setGrading(true);
    const res = await window.JINA_API.post(`/api/lessons/${currentId}/attempts`, {
      answers: answersByLesson[currentId] || {},
      client_request_id: crypto.randomUUID(),
    });
    if (res.ok) {
      setError(null);
      setResultByLesson((prev) => ({ ...prev, [currentId]: { attempt: res.attempt, results: res.results } }));
      if (res.progress) setProgress(res.progress);
      refresh(); // lessons 목록(attempt_count/best_correct) 동기화
    } else {
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
    }
    setGrading(false);
    return res;
  }, [currentId, grading, answersByLesson, refresh]);

  const retake = React.useCallback(() => {
    if (!currentId) return;
    setAnswersByLesson((prev) => { const n = { ...prev }; delete n[currentId]; return n; });
    setResultByLesson((prev) => { const n = { ...prev }; delete n[currentId]; return n; });
  }, [currentId]);

  const current = currentId ? details[currentId] || null : null;
  const next = React.useCallback(() => {
    if (current?.next_lesson_id) select(current.next_lesson_id);
  }, [current, select]);

  const value = React.useMemo(() => ({
    lessons, progress, listLoading, error,
    currentId, current, currentLoading,
    answers: (currentId && answersByLesson[currentId]) || {},
    result: (currentId && resultByLesson[currentId]) || null,
    grading,
    refresh, select, setAnswer, submit, retake, next,
  }), [lessons, progress, listLoading, error, currentId, current, currentLoading,
       answersByLesson, resultByLesson, grading, refresh, select, setAnswer, submit, retake, next]);

  return <LessonContext.Provider value={value}>{children}</LessonContext.Provider>;
}

// ── Provider 부재 시(캔버스) 메모리 fallback ──────────────────────
// mock 2세트를 서버 DTO 모양으로 내장. ★answer/explanation은 fallback 채점용으로만
// FALLBACK_KEYS에 분리 보관 — 실서비스 GET DTO에는 존재하지 않는 키다.
const FALLBACK_LESSONS = [
  {
    id: 1, slug: 'toeic-part7-set23', kind: 'toeic_part7',
    title: 'TOEIC Part 7 — 단일 지문', subtitle: 'Set 23 · 비즈니스 이메일',
    difficulty: 3, est_minutes: 6, question_count: 3,
    attempt_count: 0, best_correct: null, next_lesson_id: 2,
    passage: {
      type: 'EMAIL',
      from: 'Daniel Park <d.park@meridian-co.com>',
      to: 'All Marketing Team',
      cc: 'Hannah Lee, J. Whitmore',
      date: 'Tuesday, May 26 · 09:14',
      subject: 'Q3 Campaign Kickoff — Action Items',
      body: [
        "Dear team,",
        "Thank you all for the productive workshop yesterday. As discussed, we will be moving forward with the \"Bright Mornings\" campaign as our Q3 priority. Below is a summary of the immediate next steps:",
        "1. Hannah will finalize the creative brief by Friday, May 29.",
        "2. James, please coordinate with the external agency to confirm the photo-shoot schedule. We are aiming for the week of June 8.",
        "3. The media buy budget has been approved at $48,000 — a 12% increase from Q2.",
        "I would also like to remind everyone that **the launch date has been moved up by one week** to accommodate the regional sales conference. Please update your project plans accordingly.",
        "If you anticipate any blockers, please reach out to me directly before Thursday's stand-up. I appreciate your continued effort and flexibility.",
        "Best regards,",
        "Daniel Park · Marketing Director",
      ],
    },
    questions: [
      { n: 1, stem: 'What is the main purpose of the email?', options: [
        { id: 'A', text: 'To announce a new hire in the marketing team' },
        { id: 'B', text: 'To outline next steps for an upcoming campaign' },
        { id: 'C', text: 'To request approval for a budget increase' },
        { id: 'D', text: 'To reschedule a regional sales conference' },
      ] },
      { n: 2, stem: 'According to the email, what is true about the launch date?', options: [
        { id: 'A', text: 'It has been postponed by one week' },
        { id: 'B', text: 'It is scheduled for the week of June 8' },
        { id: 'C', text: 'It has been moved one week earlier' },
        { id: 'D', text: 'It will be decided during Thursday\'s stand-up' },
      ] },
      { n: 3, stem: 'The word "blockers" in paragraph 5 is closest in meaning to —', options: [
        { id: 'A', text: 'budget cuts' },
        { id: 'B', text: 'obstacles' },
        { id: 'C', text: 'colleagues' },
        { id: 'D', text: 'deliverables' },
      ] },
    ],
    vocabulary: [
      { word: 'accommodate', ipa: '/əˈkɑːmədeɪt/', pos: 'v.', meaning: '~을 수용하다, 맞추다', ex: 'to accommodate the schedule' },
      { word: 'anticipate', ipa: '/ænˈtɪsɪpeɪt/', pos: 'v.', meaning: '예상하다, 미리 대비하다', ex: 'anticipate any blockers' },
      { word: 'finalize', ipa: '/ˈfaɪnəlaɪz/', pos: 'v.', meaning: '최종 확정하다', ex: 'finalize the brief by Friday' },
    ],
    faq: [
      '"moved up by one week"을 한국어로 풀어주세요',
      '이 이메일의 어조(tone)는 어떤가요?',
      'Daniel Park이 가장 강조한 메시지는 무엇인가요?',
      '"accommodate"가 비즈니스에서 쓰이는 다른 예시는?',
    ],
  },
  {
    id: 2, slug: 'toeic-part7-set24', kind: 'toeic_part7',
    title: 'TOEIC Part 7 — 단일 지문', subtitle: 'Set 24 · 공지 및 안내문',
    difficulty: 3, est_minutes: 6, question_count: 3,
    attempt_count: 0, best_correct: null, next_lesson_id: 1,
    passage: {
      type: 'NOTICE',
      from: 'Facilities Management',
      to: 'All Staff',
      cc: '',
      date: 'Wednesday, May 27 · 08:00',
      subject: 'Building Maintenance — Elevator Out of Service (May 28–29)',
      body: [
        "Dear colleagues,",
        "Please be advised that **Elevator B in the North Tower will be taken out of service from Thursday, May 28 (7:00 AM) through Friday, May 29 (6:00 PM)** for scheduled hydraulic maintenance.",
        "During this period, Elevator A and the stairwells on both the East and West sides of the building will remain fully operational. We ask all staff to plan accordingly and allow extra travel time between floors.",
        "Employees who require mobility assistance are requested to contact Facilities Management at ext. 4400 by Wednesday afternoon so that appropriate arrangements can be made.",
        "The maintenance is expected to be completed by Friday evening. However, if additional work is required, we will provide an updated timeline no later than Friday at noon.",
        "We apologize for the inconvenience and appreciate your patience and cooperation.",
        "Facilities Management Team",
      ],
    },
    questions: [
      { n: 1, stem: 'What is the purpose of this notice?', options: [
        { id: 'A', text: 'To announce the construction of a new elevator' },
        { id: 'B', text: 'To inform staff about temporary elevator unavailability' },
        { id: 'C', text: 'To request volunteers for building maintenance' },
        { id: 'D', text: 'To introduce new building safety procedures' },
      ] },
      { n: 2, stem: 'According to the notice, what should employees needing assistance do?', options: [
        { id: 'A', text: 'Use the stairwells on the West side only' },
        { id: 'B', text: 'Email the Facilities Management team' },
        { id: 'C', text: 'Call extension 4400 by Wednesday afternoon' },
        { id: 'D', text: 'Wait for further instructions on Friday noon' },
      ] },
      { n: 3, stem: 'When will the updated timeline be provided IF additional work is needed?', options: [
        { id: 'A', text: 'By Thursday morning' },
        { id: 'B', text: 'By Friday at noon' },
        { id: 'C', text: 'By Friday at 6:00 PM' },
        { id: 'D', text: 'By the following Monday' },
      ] },
    ],
    vocabulary: [
      { word: 'operational', ipa: '/ˌɒpəˈreɪʃənəl/', pos: 'adj.', meaning: '운용 가능한, 작동 중인', ex: 'remain fully operational' },
      { word: 'hydraulic', ipa: '/haɪˈdrɔːlɪk/', pos: 'adj.', meaning: '유압의, 수압을 이용한', ex: 'hydraulic maintenance' },
      { word: 'mobility', ipa: '/moʊˈbɪlɪti/', pos: 'n.', meaning: '이동성, 운동 능력', ex: 'require mobility assistance' },
    ],
    faq: [
      '"no later than"은 어떤 뉘앙스인가요?',
      '이 공지에서 직원이 해야 할 일을 정리해주세요',
      '"operational"이 비즈니스에서 쓰이는 다른 예시는?',
    ],
  },
];

// fallback 채점 키 — 캔버스 데모 전용 (서버 DTO에는 없다)
const FALLBACK_KEYS = {
  1: {
    1: { answer: 'B', explanation: '이메일 첫 문단의 "moving forward with the campaign as our Q3 priority"와 본문 1-3번 액션 아이템이 핵심 단서예요. 캠페인의 다음 단계를 정리한 이메일이에요.' },
    2: { answer: 'C', explanation: '"the launch date has been moved up by one week"의 move up은 "앞당기다"라는 뜻이에요. (C) one week earlier가 정답.' },
    3: { answer: 'B', explanation: 'blockers는 IT/비즈니스 영어에서 "진행을 가로막는 장애물"을 뜻해요. 가장 가까운 동의어는 obstacles.' },
  },
  2: {
    1: { answer: 'B', explanation: '공지 제목과 첫 문단 "Elevator B … will be taken out of service"가 핵심 단서예요. 엘리베이터의 임시 운행 중단을 알리는 공지예요.' },
    2: { answer: 'C', explanation: '"contact Facilities Management at ext. 4400 by Wednesday afternoon"이 그대로 답이에요. 이메일이 아니라 내선 4400으로 전화, 기한은 수요일 오후.' },
    3: { answer: 'B', explanation: '"we will provide an updated timeline no later than Friday at noon" — no later than은 "늦어도 ~까지"라는 뜻이에요. (B) By Friday at noon이 정답.' },
  },
};

// fallback 상태는 모듈 단일 인스턴스 — LessonDesktop/LessonTopBar/QuestionsColumn이
// 각각 useLesson()을 호출하므로, 훅 로컬 state로 두면 컴포넌트마다 다른 지문을 보게 된다
// (Provider 경로에서 Context가 하나인 것과 같은 성질을 fallback에서도 유지한다).
const fallbackState = {
  currentId: FALLBACK_LESSONS[0].id,
  answersByLesson: {},
  resultByLesson: {},
  listeners: new Set(),
  emit() { this.listeners.forEach((fn) => fn()); },
};

function useLessonFallback() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    fallbackState.listeners.add(force);
    return () => { fallbackState.listeners.delete(force); };
  }, [force]);

  const { currentId } = fallbackState;
  const current = FALLBACK_LESSONS.find((l) => l.id === currentId) || FALLBACK_LESSONS[0];
  const result = fallbackState.resultByLesson[currentId] || null;

  const setAnswer = React.useCallback((n, optionId) => {
    const id = fallbackState.currentId;
    if (fallbackState.resultByLesson[id]) return; // 채점 후에는 무시
    fallbackState.answersByLesson = {
      ...fallbackState.answersByLesson,
      [id]: { ...(fallbackState.answersByLesson[id] || {}), [n]: optionId },
    };
    fallbackState.emit();
  }, []);

  // 로컬 채점 — READONLY 서버 가드와 무관하게 캔버스에서 동작
  const submit = React.useCallback(() => {
    const id = fallbackState.currentId;
    const lesson = FALLBACK_LESSONS.find((l) => l.id === id);
    const keys = FALLBACK_KEYS[id] || {};
    const answers = fallbackState.answersByLesson[id] || {};
    const results = {};
    let correct = 0;
    for (const q of lesson.questions) {
      const your = answers[q.n];
      const k = keys[q.n] || {};
      const isCorrect = your === k.answer;
      if (isCorrect) correct += 1;
      results[String(q.n)] = { your, correct: isCorrect, answer: k.answer, explanation: k.explanation };
    }
    const attempt = {
      id: 0, lesson_id: id, correct_count: correct,
      total_count: lesson.questions.length,
      score: Math.round((correct / lesson.questions.length) * 100),
      created_at: new Date().toISOString(),
    };
    fallbackState.resultByLesson = { ...fallbackState.resultByLesson, [id]: { attempt, results } };
    fallbackState.emit();
    return Promise.resolve({ ok: true, attempt, results });
  }, []);

  const retake = React.useCallback(() => {
    const id = fallbackState.currentId;
    const a = { ...fallbackState.answersByLesson }; delete a[id];
    const r = { ...fallbackState.resultByLesson }; delete r[id];
    fallbackState.answersByLesson = a;
    fallbackState.resultByLesson = r;
    fallbackState.emit();
  }, []);

  const select = React.useCallback((id) => {
    if (!id || !FALLBACK_LESSONS.some((l) => l.id === id)) return;
    fallbackState.currentId = id;
    fallbackState.emit();
  }, []);

  const next = React.useCallback(() => {
    const cur = FALLBACK_LESSONS.find((l) => l.id === fallbackState.currentId);
    select(cur?.next_lesson_id || FALLBACK_LESSONS[0].id);
  }, [select]);

  return {
    lessons: FALLBACK_LESSONS.map(({ passage, questions, vocabulary, faq, ...s }) => s),
    progress: { done: Object.keys(fallbackState.resultByLesson).length, total: FALLBACK_LESSONS.length },
    listLoading: false, error: null,
    currentId, current, currentLoading: false,
    answers: fallbackState.answersByLesson[currentId] || {},
    result, grading: false,
    refresh: () => Promise.resolve({ ok: true }),
    select, setAnswer, submit, retake, next,
  };
}

function useLesson() {
  const ctx = React.useContext(LessonContext);
  const fallback = useLessonFallback(); // 훅 규칙상 항상 호출
  return ctx || fallback;
}

window.LessonProvider = LessonProvider;
window.useLesson = useLesson;
