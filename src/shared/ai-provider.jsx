// ai-provider.jsx — 서버 AI 프록시(/api/ai/*)로 가는 얇은 fetch 어댑터.
// 브라우저 → LLM 직결(구 callOllama/callClaude)은 폐기되었고, 시스템 프롬프트와
// JSON 파싱/검증/강등은 전부 API 서버에 있다.
// 반환 계약은 기존과 동일: {ok, provider, data:{reply_en,…}} / {ok:false, error, provider}
// 이므로 chat-runtime.jsx 의 정상 경로는 바뀌지 않는다.

const AI_DEFAULTS = {
  provider: window.JINA_CONFIG?.provider || 'claude',
  // 표시 전용 + 캔버스 pingOllama 대상. 서버(.env OLLAMA_URL)가 /config.js 로 주입한 값이며
  // 어떤 API 요청 본문에도 실리지 않는다 — 서버는 본문의 ollamaUrl 을 무시하고 자기 설정만 쓴다
  // (플랜 10.5 §2 결정 3, S2 SSRF 차단). 화면에서 바꾸는 수단도 없앴다.
  ollamaUrl: window.JINA_CONFIG?.ollamaUrl || 'http://localhost:11434',
  // provider별 모델 맵. /config.js 가 .env 값을 주입한다.
  model: window.JINA_CONFIG?.models || {},
};

const PROVIDER_META = {
  ollama: { label: 'Ollama', color: '#22b07d' },
  claude: { label: 'Claude', color: '#c96442' },
  agy:    { label: 'Antigravity', color: '#4f7df2' },
  cursor: { label: 'Cursor', color: '#8b5cf6' },
  codex:  { label: 'Codex', color: '#10a37f' },
};

// aiConfig → 입력바 배지에 쓸 모델 라벨.
// 신형({model:{...}})과 구형 캔버스({ollamaModel})를 모두 허용한다.
function modelLabel(cfg) {
  const p = cfg?.provider || AI_DEFAULTS.provider;
  return cfg?.model?.[p]
    || (p === 'ollama' ? cfg?.ollamaModel : null)
    || AI_DEFAULTS.model?.[p]
    || 'default';
}

async function askJina({ history, userMessage, signal, conversationId, task = 'tutor' }) {
  const cfg = window.__JINA_AI_CONFIG || AI_DEFAULTS;
  const provider = cfg.provider || AI_DEFAULTS.provider;
  const res = await window.JINA_API.post('/api/ai/chat', {
    task,
    conversationId,
    provider,
    model: cfg.model?.[provider] ?? (provider === 'ollama' ? cfg.ollamaModel : null) ?? null,
    // ollamaUrl 은 보내지 않는다 — 서버가 config.ai.ollamaUrl 만 쓴다 (플랜 10.5 S2 SSRF).
    history: (history || []).map((m) => ({ role: m.role, content: m.content })),
    userMessage,
  }, { signal });
  if (!res.ok) {
    return { ok: false, error: res.error, hint: res.hint || null, provider: res.provider || provider };
  }
  return res; // {ok, provider, data, conversationId, degraded?, meta}
}

async function checkHealth({ force = false } = {}) {
  return window.JINA_API.get(`/api/ai/health${force ? '?force=1' : ''}`);
}

async function listProviders() {
  return window.JINA_API.get('/api/ai/providers');
}

// 하위호환 별칭 — app.jsx(캔버스)가 Ollama 연결 pill에 사용.
// 이것만은 브라우저 → Ollama 직결이라 SSRF 가 아니다(서버가 아니라 사용자의 브라우저가 부른다).
// 캔버스(canvas.html)는 미인증 화면이라 /api/ai/providers(requireUser)로 대체할 수 없어 남긴다.
// url 인자는 서버 주입값(AI_DEFAULTS.ollamaUrl)만 들어온다 — 사용자 자유 입력 경로는 없앴다.
async function pingOllama(url) {
  try {
    const r = await fetch((url || AI_DEFAULTS.ollamaUrl).replace(/\/$/, '') + '/api/tags');
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, models: (j.models || []).map((m) => m.name) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

window.JINA_AI = { askJina, checkHealth, listProviders, pingOllama, modelLabel, AI_DEFAULTS, PROVIDER_META };
