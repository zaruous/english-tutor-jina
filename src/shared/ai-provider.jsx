// ai-provider.jsx — Unified AI provider: Ollama (default) | Claude
// Reads config from window.__JINA_AI_CONFIG (set by app.jsx from Tweaks).

const AI_DEFAULTS = {
  provider:    window.JINA_CONFIG?.provider    || 'ollama',
  ollamaUrl:   window.JINA_CONFIG?.ollamaUrl   || 'http://localhost:11434',
  ollamaModel: window.JINA_CONFIG?.ollamaModel || 'gemma4:31b-cloud',
  claudeModel: window.JINA_CONFIG?.claudeModel || 'claude-haiku-4-5',
};

const JINA_SYSTEM_PROMPT = `너는 'Jina'라는 한국인 학습자를 위한 AI 영어 튜터야. TOEIC/TOEFL 시험 대비를 도와.
사용자는 한국인이고, 영어로 답하지만 가끔 한국어 설명도 곁들여.

답변 규칙:
1. 항상 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 출력하지 마.
2. 사용자의 영어 문장에 오류가 있으면 'corrections' 배열에 담아.
3. 'reply_en'은 자연스러운 영어 응답 (1-3 문장).
4. 'reply_ko'는 한국어 간단 요약 (선택).
5. 점수는 0-100 정수.

응답 JSON 스키마:
{
  "reply_en": "string",
  "reply_ko": "string | null",
  "corrections": [
    { "original": "wrong phrase", "corrected": "right phrase", "reason": "짧은 한국어 설명", "type": "grammar | usage | spelling" }
  ],
  "scores": { "grammar": 0-100, "fluency": 0-100, "vocabulary": 0-100 },
  "suggestion": "다음에 시도해볼 만한 표현이나 질문 (한국어) | null"
}`;

async function callOllama(messages, cfg) {
  const url = (cfg.ollamaUrl || AI_DEFAULTS.ollamaUrl).replace(/\/$/, '');
  const res = await fetch(url + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.ollamaModel || AI_DEFAULTS.ollamaModel,
      messages: [
        { role: 'system', content: JINA_SYSTEM_PROMPT },
        ...messages,
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.6 },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ollama ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}

async function callClaude(messages) {
  // window.claude.complete supports either string or {messages}
  const chat = [
    { role: 'user', content: JINA_SYSTEM_PROMPT + '\n\n위 규칙을 절대 어기지 말고 JSON으로만 답해.\n\n첫 사용자 메시지: ' + messages[0].content },
    ...messages.slice(1),
  ];
  try {
    const out = await window.claude.complete({ messages: chat });
    return out || '';
  } catch (e) {
    throw new Error('Claude 호출 실패: ' + (e?.message || e));
  }
}

// Parse JSON loosely (model sometimes wraps in ```json ... ```)
function extractJson(raw) {
  if (!raw) return null;
  // Try direct
  try { return JSON.parse(raw); } catch (_) {}
  // Try fenced
  const fence = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }
  // Try first { ... last }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

async function askJina({ history, userMessage }) {
  const cfg = window.__JINA_AI_CONFIG || AI_DEFAULTS;
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];
  let raw;
  try {
    if (cfg.provider === 'claude') {
      raw = await callClaude(messages);
    } else {
      raw = await callOllama(messages, cfg);
    }
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      provider: cfg.provider,
    };
  }
  const parsed = extractJson(raw);
  if (!parsed) {
    // Fall back to free-form text response
    return {
      ok: true,
      provider: cfg.provider,
      data: {
        reply_en: raw.slice(0, 500),
        reply_ko: null,
        corrections: [],
        scores: null,
        suggestion: null,
      },
    };
  }
  return { ok: true, provider: cfg.provider, data: parsed };
}

// Quick health-check ping for Ollama
async function pingOllama(url) {
  try {
    const r = await fetch((url || AI_DEFAULTS.ollamaUrl).replace(/\/$/, '') + '/api/tags', {
      method: 'GET',
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, models: (j.models || []).map((m) => m.name) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

window.JINA_AI = { askJina, pingOllama, AI_DEFAULTS };
