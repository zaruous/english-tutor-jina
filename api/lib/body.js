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

// multipart/form-data 읽기 — Node 내장 Response.formData() 사용(의존성 0, Node 18+).
// 오디오 업로드용이라 상한이 크다(기본 8MB — 브라우저 MediaRecorder 한 문장은 수백 KB).
// 상한은 스트림에서 세어 초과 즉시 끊는다 — Content-Length 는 신뢰하지 않는다.
export async function readMultipart(req, { limit = 8 * 1024 * 1024 } = {}) {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('multipart/form-data')) {
    throw new HttpError(400, 'BAD_REQUEST', 'multipart/form-data 본문이 필요합니다.');
  }
  const { Readable, Transform } = await import('node:stream');
  let size = 0;
  let tooLarge = false; // formData() 는 스트림 오류를 자기 TypeError 로 감싸므로 원인은 플래그로 남긴다
  const guard = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        req.destroy();
        cb(new Error('too large'));
        return;
      }
      cb(null, chunk);
    },
  });
  try {
    const body = Readable.toWeb(req.pipe(guard));
    return await new Response(body, { headers: { 'content-type': type } }).formData();
  } catch {
    if (tooLarge) throw new HttpError(413, 'PROMPT_TOO_LONG', '업로드가 너무 큽니다.');
    throw new HttpError(400, 'BAD_REQUEST', 'multipart 본문을 해석할 수 없습니다.');
  }
}
