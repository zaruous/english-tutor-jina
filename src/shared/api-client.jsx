// api-client.jsx — API 서버(:3004) fetch 래퍼. window.JINA_API
// ai-provider.jsx 보다 먼저 로드되어야 한다.
//
// - credentials: 'include' + X-Requested-With: jina (CSRF)
// - apiBase 는 /config.js 가 주입. 없으면 현재 hostname + :3004
//   (localhost와 127.0.0.1을 섞으면 오리진/쿠키가 갈라진다 — hostname을 따라간다)
// - 캔버스(window.JINA_READONLY)에서는 non-GET을 클라이언트에서도 차단하고,
//   서버에도 X-Jina-Mode: canvas 를 보내 2중화한다. /api/ai/chat 은 예외.
const JINA_API_BASE =
  window.JINA_CONFIG?.apiBase || `http://${location.hostname}:3004`;

// 기본 31분 — 서버 AI 타임아웃 체인(프로세스 30분 > HTTP 30.5분)보다 브라우저가 늦게 끊어야 오류 메시지가 서버에서 온다
async function apiFetch(path, { method = 'GET', body, signal, timeoutMs = 1_860_000, headers } = {}) {
  const readonly = Boolean(window.JINA_READONLY);
  if (readonly && method !== 'GET' && path !== '/api/ai/chat') {
    return { ok: false, code: 'READONLY', error: '캔버스에서는 저장이 비활성화되어 있습니다.' };
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
  // FormData(오디오 업로드)는 브라우저가 boundary 를 포함한 Content-Type 을 직접 붙인다 — 우리가 지정하면 깨진다
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(JINA_API_BASE + path, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        'X-Requested-With': 'jina',
        ...(readonly ? { 'X-Jina-Mode': 'canvas' } : {}),
        ...(headers || {}), // 호출자 지정이 최우선 (auth-store의 X-Jina-No-Autologin)
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: merged,
    });
  } catch (err) {
    if (signal?.aborted) return { ok: false, code: 'ABORTED', error: '요청이 취소되었습니다.' };
    if (err.name === 'TimeoutError') return { ok: false, code: 'TIMEOUT', error: '응답이 제한 시간을 넘겼습니다.' };
    return {
      ok: false, code: 'NETWORK',
      error: 'API 서버에 연결할 수 없습니다.',
      hint: '터미널에서 `npm run api` (또는 `npm run dev:all`)로 API 서버를 실행하세요.',
    };
  }
  if (res.status === 204) return { ok: true };
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, code: 'BAD_RESPONSE', error: `API 응답 파싱 실패 (HTTP ${res.status})` };
  }
  return data; // 서버가 항상 {ok, ...} 봉투를 준다 (에러면 {ok:false, code, error, hint?})
}

window.JINA_API = {
  base: JINA_API_BASE,
  fetch: apiFetch,
  get: (path, opts) => apiFetch(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => apiFetch(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => apiFetch(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => apiFetch(path, { ...opts, method: 'DELETE' }),
};
