// ollama 어댑터 — HTTP /api/chat. format에 JSON 스키마 객체를 그대로 줄 수 있고
// (현재 'json' 문자열보다 강함), 거부되면 'json'으로 폴백한다.
import { config } from '../../config.js';
import { HttpError } from '../../lib/errors.js';

export const ollama = {
  id: 'ollama',
  supportsResume: false, // stateless HTTP — 매 턴 히스토리를 보낸다
  label: 'Ollama',
  kind: 'http',
  supportsJsonSchema: true,
  get defaultModel() { return config.ai.models.ollama; },
  timeoutMs: 120_000,

  async models({ baseUrl } = {}) {
    try {
      const res = await fetch(url(baseUrl, '/api/tags'), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m) => m.name);
    } catch {
      return [];
    }
  },

  async probe({ baseUrl } = {}) {
    try {
      const res = await fetch(url(baseUrl, '/api/tags'), { signal: AbortSignal.timeout(8000) });
      return { ok: res.ok, detail: res.ok ? 'ok' : `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },

  async run({ messages, model, jsonSchema, timeoutMs, signal, baseUrl }) {
    const started = Date.now();
    const call = async (format) => {
      const res = await fetch(url(baseUrl, '/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || this.defaultModel,
          messages,
          stream: false,
          format,
          options: { temperature: 0.6 },
        }),
        signal: composeSignal(signal, timeoutMs ?? this.timeoutMs),
      });
      return res;
    };

    let res;
    try {
      res = await call(jsonSchema ?? 'json');
      if (!res.ok && jsonSchema) res = await call('json'); // 스키마 format 거부 폴백
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new HttpError(504, 'TIMEOUT', 'Ollama 응답이 제한 시간을 넘겼습니다.', { provider: 'ollama' });
      }
      throw new HttpError(503, 'CLI_NOT_FOUND', `Ollama에 연결할 수 없습니다: ${err.message}`, { provider: 'ollama' });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HttpError(502, 'CLI_FAILED', `Ollama ${res.status}: ${body.slice(0, 200)}`, { provider: 'ollama' });
    }
    const data = await res.json();
    return {
      text: data?.message?.content || '',
      structured: null,
      sessionRef: null, // stateless — 히스토리를 매번 보낸다
      model: model || this.defaultModel,
      meta: { durationMs: Date.now() - started },
    };
  },
};

function url(baseUrl, path) {
  return (baseUrl || config.ai.ollamaUrl).replace(/\/$/, '') + path;
}

function composeSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
