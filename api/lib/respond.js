import { CODE_STATUS, HttpError, fromPgError, hintFor } from './errors.js';

export function sendJson(res, status, body) {
  if (res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendError(res, err, { provider } = {}) {
  if (res.writableEnded) return;
  let httpErr = err instanceof HttpError ? err : fromPgError(err);
  if (!httpErr) {
    // 원본(pg 에러의 where/internalQuery 등)은 로그로만 — 클라이언트에는 뭉갠다
    console.error('[api] internal error:', err);
    httpErr = new HttpError(500, 'INTERNAL', '서버 오류가 발생했습니다.');
  }
  const status = httpErr.status || CODE_STATUS[httpErr.code] || 500;
  const hint = httpErr.extra?.hint ?? hintFor(httpErr.code, provider ?? httpErr.extra?.provider);
  sendJson(res, status, {
    ok: false,
    code: httpErr.code,
    error: httpErr.message,
    ...(hint ? { hint } : {}),
    ...(httpErr.extra?.provider ? { provider: httpErr.extra.provider } : {}),
    // 저작 검증 실패(422) — 화면이 규칙을 재판정하지 않고 이 배열을 그대로 렌더한다(플랜 13 결정 2)
    ...(httpErr.extra?.validation_errors ? { validation_errors: httpErr.extra.validation_errors } : {}),
  });
}

export function sendNoContent(res) {
  if (res.writableEnded) return;
  res.writeHead(204);
  res.end();
}
