import { randomUUID } from 'node:crypto';

// 요청 1줄 로그 + X-Request-Id
export function requestLogger(req, res) {
  const id = randomUUID().slice(0, 8);
  const started = Date.now();
  res.setHeader('X-Request-Id', id);
  res.on('finish', () => {
    console.log(`[api] ${id} ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started}ms)`);
  });
  return id;
}
