import { HttpError } from './errors.js';

// JSON 바디 읽기 (기본 상한 256KB)
export function readJson(req, { limit = 256 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'PROMPT_TOO_LONG', '요청 본문이 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'BAD_REQUEST', 'JSON 본문이 아닙니다.'));
      }
    });
    req.on('error', reject);
  });
}
