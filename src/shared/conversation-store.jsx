// conversation-store.jsx — 회화 Context 스토어. window.ConversationProvider / window.useConversation
// vocab-store.jsx(패턴 ③) 복제. screens/conversation-desktop.jsx / mobile.jsx 보다 먼저 로드.
//
// useJinaChat의 {messages, loading, error, send, reset} 계약을 상위집합으로 유지한다 —
// chat-runtime의 LiveJinaMessage/LiveUserMessage/JinaInputBar가 무수정으로 소비한다.
// lesson.jsx는 계속 useJinaChat(→/api/ai/chat)을 쓴다 (무세션 1회성 채팅).
// 저장/히스토리는 전부 서버(/api/conversations) — 클라이언트는 표시 문자열만 만든다.

const ConversationContext = React.createContext(null);

const CONVO_CACHE_KEY = 'jina_convo_cache_v1';

// 표시 포맷터는 이 하나뿐 — UI/로직 드리프트 차단 (vocab formatNextReview와 동형)
function formatSessionTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return '지금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff === 0) return `${Math.floor(diffMin / 60)}시간 전`;
  if (dayDiff === 1) return '어제';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 서버 MessageDto → chat-runtime 메시지 모양. 매퍼는 이 하나만 —
// chat-runtime useJinaChat(:36-46)이 만드는 모양과 필드명이 일치해야 무수정 렌더된다.
function toChatMessage(dto) {
  if (dto.role === 'user') {
    return {
      id: dto.id, role: 'user', kind: 'user-text',
      content: dto.content, time: window.jinaHHMM(dto.created_at),
    };
  }
  return {
    id: dto.id, role: 'assistant', kind: 'jina-ai',
    contentForModel: dto.content,
    reply_en: dto.content || '(응답 없음)',
    reply_ko: dto.content_ko || null,
    corrections: dto.corrections || [],
    scores: dto.scores || null,
    suggestion: dto.suggestion || null,
    provider: dto.provider,
    time: window.jinaHHMM(dto.created_at),
  };
}

// 마지막 scores 보유 assistant 메시지 + 직전 scored와의 평균 델타 (FeedbackPane 소비).
// scored가 1개뿐이면 delta=null(숨김) — 세션 경계를 넘는 비교는 하지 않는다.
function computeLastScored(messages) {
  const scored = messages.filter((m) => m.role === 'assistant' && m.scores);
  if (scored.length === 0) return null;
  const avg = (s) => {
    const vals = Object.values(s).filter((v) => typeof v === 'number');
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const last = scored[scored.length - 1];
  const prev = scored.length > 1 ? scored[scored.length - 2] : null;
  const lastAvg = avg(last.scores);
  const prevAvg = prev ? avg(prev.scores) : null;
  // 첨삭/코멘트는 "그것을 가진 가장 최근 assistant 메시지"에서 —
  // 마지막 응답에 첨삭이 없어도 패널이 직전 첨삭을 유지한다 (빈 패널 방지)
  const assistants = messages.filter((m) => m.role === 'assistant');
  const lastWithCorrections = [...assistants].reverse().find((m) => (m.corrections || []).length > 0);
  const lastWithSuggestion = [...assistants].reverse().find((m) => m.suggestion);
  return {
    scores: last.scores,
    average: lastAvg,
    delta: prevAvg !== null && lastAvg !== null ? lastAvg - prevAvg : null,
    corrections: lastWithCorrections ? lastWithCorrections.corrections : [],
    suggestion: lastWithSuggestion ? lastWithSuggestion.suggestion : null,
  };
}

// AI provider 설정 → 메시지 전송 body (ai-provider.jsx askJina와 동일 규약)
function aiBodyFields() {
  const cfg = window.__JINA_AI_CONFIG || window.JINA_AI.AI_DEFAULTS;
  const provider = cfg.provider || window.JINA_AI.AI_DEFAULTS.provider;
  return {
    provider,
    model: cfg.model?.[provider] ?? (provider === 'ollama' ? cfg.ollamaModel : null) ?? null,
    ollamaUrl: provider === 'ollama' ? cfg.ollamaUrl : undefined,
  };
}

function ConversationProvider({ children }) {
  const [sessions, setSessions] = React.useState([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(true);
  const [activeSessionId, setActiveSessionId] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const autoSelectedRef = React.useRef(false);

  const applySessions = React.useCallback((list) => {
    setSessions(list);
    try { localStorage.setItem(CONVO_CACHE_KEY, JSON.stringify({ sessions: list })); } catch {}
  }, []);

  // 응답의 session으로 목록 갱신 (있으면 교체, 없으면 prepend) + 최근순 재정렬
  const upsertSession = React.useCallback((session) => {
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== session.id);
      const next = [session, ...rest].sort((a, b) =>
        new Date(b.last_message_at || b.started_at) - new Date(a.last_message_at || a.started_at));
      try { localStorage.setItem(CONVO_CACHE_KEY, JSON.stringify({ sessions: next })); } catch {}
      return next;
    });
  }, []);

  const selectSession = React.useCallback(async (id) => {
    setActiveSessionId(id);
    setMessages([]);
    setLoading(false);
    const res = await window.JINA_API.get(`/api/conversations/${id}`);
    if (res.ok) {
      setError(null);
      setMessages(res.messages.map(toChatMessage));
      upsertSession(res.session);
    } else {
      setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
    }
  }, [upsertSession]);

  // 초기 로드: 세션 목록 + 가장 최근 active 세션 자동 선택(모바일이 세션 목록 UI 없이 이어가는 근거)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await window.JINA_API.get('/api/conversations');
      if (cancelled) return;
      if (res.ok) {
        setError(null);
        applySessions(res.sessions);
        if (!autoSelectedRef.current && res.sessions[0]?.status === 'active') {
          autoSelectedRef.current = true;
          selectSession(res.sessions[0].id);
        }
      } else {
        // 로드 실패 → write-through 캐시 폴백 + 에러 배너 (빈 화면 금지)
        setError(res.hint ? `${res.error} — ${res.hint}` : res.error);
        try {
          const cached = JSON.parse(localStorage.getItem(CONVO_CACHE_KEY) || 'null');
          if (cached?.sessions?.length) setSessions(cached.sessions);
        } catch {}
      }
      setSessionsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [applySessions, selectSession]);

  const newSession = React.useCallback(() => {
    // 레코드는 첫 send에서 생성 — 빈 세션 행 방지
    setActiveSessionId(null);
    setMessages([]);
    setLoading(false);
    setError(null);
  }, []);

  const reset = React.useCallback((msgs = []) => {
    setMessages(msgs);
    setLoading(false);
    setError(null);
  }, []);

  // 낙관적 user 버블 → (세션 없으면 생성) → 서버 저장 전송. AI 응답은 비낙관적(CLI 5~15s).
  const send = React.useCallback(async (text) => {
    if (!text || !text.trim() || loading) return;
    const trimmed = text.trim();
    setMessages((m) => [...m, { role: 'user', kind: 'user-text', content: trimmed, time: window.jinaHHMM() }]);
    setLoading(true);
    setError(null);

    const fail = (res) => {
      // hint는 서버가 준 것만 렌더 — 프론트 provider 분기 0.
      // user 버블은 롤백하지 않는다(재전송 유도).
      setMessages((m) => [...m, {
        role: 'assistant', kind: 'jina-error',
        content: res.error || '응답 실패', hint: res.hint || null,
        provider: res.provider || null, time: window.jinaHHMM(),
      }]);
      setLoading(false);
    };

    let sid = activeSessionId;
    if (sid == null) {
      const created = await window.JINA_API.post('/api/conversations', {});
      if (!created.ok) return fail(created);
      sid = created.session.id;
      setActiveSessionId(sid);
      upsertSession(created.session);
    }

    const res = await window.JINA_API.post(`/api/conversations/${sid}/messages`, {
      text: trimmed,
      client_request_id: crypto.randomUUID(),
      ...aiBodyFields(),
    });
    if (!res.ok) return fail(res);
    setMessages((m) => [...m, toChatMessage(res.assistant_message)]);
    upsertSession(res.session);
    setLoading(false);
  }, [activeSessionId, loading, upsertSession]);

  const activeSession = React.useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );
  const lastScored = React.useMemo(() => computeLastScored(messages), [messages]);

  const value = React.useMemo(() => ({
    messages, loading, error, send, reset,
    sessions, activeSessionId, sessionsLoading,
    selectSession, newSession, activeSession, lastScored, formatSessionTime,
  }), [messages, loading, error, send, reset, sessions, activeSessionId,
       sessionsLoading, selectSession, newSession, activeSession, lastScored]);

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

// ── Provider 부재 시(캔버스) 메모리 fallback ──────────────────────
// 세션 목록은 SessionDto 모양의 데모 2개(메모리). send는 /api/ai/chat 직접 호출 —
// 부수효과가 없어 캔버스에서도 허용되므로 라이브 채팅 데모가 그대로 산다. 저장 없음.
const FALLBACK_SESSIONS = [
  {
    id: 1, title: '비즈니스 미팅', status: 'active',
    scenario: {
      tag: 'TOEIC SPEAKING · Q11', level: '★★★☆☆',
      title: '비즈니스 미팅 · 신규 거래처 추천',
      description: '상사가 사무용품 신규 거래처를 추천해달라고 요청했어요. 동료에게 전화로 의견을 전달하세요.',
    },
    started_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
    last_message_at: new Date(Date.now() - 5 * 60e3).toISOString(),
    ended_at: null, message_count: 4, avg_score: 83,
    last_user_text: 'Sure! They also offer next-day delivery.',
  },
  {
    id: 2, title: '카페에서 주문하기', status: 'ended', scenario: null,
    started_at: new Date(Date.now() - 25 * 3600e3).toISOString(),
    last_message_at: new Date(Date.now() - 24 * 3600e3).toISOString(),
    ended_at: new Date(Date.now() - 24 * 3600e3).toISOString(),
    message_count: 2, avg_score: null,
    last_user_text: 'Can I get a iced americano, please?',
  },
];

function useConversationFallback() {
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [activeSessionId, setActiveSessionId] = React.useState(null);

  const reset = React.useCallback((msgs = []) => {
    setMessages(msgs);
    setLoading(false);
    setError(null);
  }, []);

  const send = React.useCallback(async (text) => {
    if (!text || !text.trim() || loading) return;
    const userMsg = { role: 'user', kind: 'user-text', content: text.trim(), time: window.jinaHHMM() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    const hist = [...messages, userMsg]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.contentForModel || m.content }));
    const res = await window.JINA_AI.askJina({ history: hist.slice(0, -1), userMessage: text.trim() });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || '응답 실패');
      setMessages((m) => [...m, {
        role: 'assistant', kind: 'jina-error',
        content: res.error, hint: res.hint || null, provider: res.provider, time: window.jinaHHMM(),
      }]);
      return;
    }
    const d = res.data || {};
    setMessages((m) => [...m, {
      role: 'assistant', kind: 'jina-ai',
      contentForModel: d.reply_en || '',
      reply_en: d.reply_en || '(응답 없음)',
      reply_ko: d.reply_ko || null,
      corrections: d.corrections || [],
      scores: d.scores || null,
      suggestion: d.suggestion || null,
      provider: res.provider,
      time: window.jinaHHMM(),
    }]);
  }, [messages, loading]);

  const selectSession = React.useCallback((id) => {
    setActiveSessionId(id);
    setMessages([]);
  }, []);
  const newSession = React.useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
  }, []);

  const activeSession = FALLBACK_SESSIONS.find((s) => s.id === activeSessionId) || null;
  const lastScored = React.useMemo(() => computeLastScored(messages), [messages]);

  return {
    messages, loading, error, send, reset,
    sessions: FALLBACK_SESSIONS, activeSessionId, sessionsLoading: false,
    selectSession, newSession, activeSession, lastScored, formatSessionTime,
  };
}

function useConversation() {
  const ctx = React.useContext(ConversationContext);
  const fallback = useConversationFallback(); // 훅 규칙상 항상 호출
  return ctx || fallback;
}

window.ConversationProvider = ConversationProvider;
window.useConversation = useConversation;
