// 모의 OpenPronounce 사이드카 — lib/pronounce/server.py 의 HTTP 계약(/health · /pronunciation)만 흉내낸다.
//
// ⚠ 실제 발음 채점이 아니다(모델 없음). 용도는 하나 — 모델을 못 내려받는 환경(CI·컨테이너)에서
// Node 어댑터 → 정규화 → speaking_attempts 저장 → 이력/대시보드 경로를 실측하는 것.
// 점수는 항상 저점 고정(9)이라 "오독이라 낮다"는 단정에는 쓸 수 없다 — 그건 실제 사이드카 +
// scripts/fixtures/ko-misread-8s.wav 로 verify-pronunciation.mjs 가 한다.
//
// 사용: node scripts/mock-pronounce-sidecar.mjs   (기본 :8000)
//       PRONUNCIATION_URL=http://localhost:8000 PRONUNCIATION_BACKEND=openpronounce npm run api
import http from 'node:http';

const PORT = Number(process.env.MOCK_PRONOUNCE_PORT || 8000);

function parseMultipartText(buf, boundary) {
  const parts = buf.toString('latin1').split(`--${boundary}`);
  const out = {};
  for (const p of parts) {
    const m = /name="([^"]+)"/.exec(p);
    if (!m) continue;
    const bodyStart = p.indexOf('\r\n\r\n');
    if (bodyStart < 0) continue;
    const body = p.slice(bodyStart + 4).replace(/\r\n$/, '');
    if (m[1] === 'expected_text') out.expected_text = body.trim();
    if (m[1] === 'file') out.fileBytes = body.length;
  }
  return out;
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, backend: 'openpronounce', version: 'mock-0.0.1', tts: 'none', device: 'cpu' }));
    return;
  }
  if (req.method === 'POST' && req.url === '/pronunciation') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] || '')?.[1];
      const { expected_text: expected = '', fileBytes = 0 } = boundary
        ? parseMultipartText(Buffer.concat(chunks), boundary) : {};
      const words = expected.replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean);
      // 오디오가 실제로 도착했는지가 곧 파이프라인 검증 — 없으면 400.
      if (!fileBytes || !words.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'file/expected_text 누락' }));
        return;
      }
      // lib/pronounce/README 응답 예시와 같은 모양 — 전 단어 오류 + 저점수(오독 시나리오)
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true, backend: 'openpronounce', score: 9.0,
        transcript: 'ANNYEONG HASEYO ONEUL HOEUI',
        phoneme_error_rate: 0.91, word_error_rate: 1.0,
        received_bytes: fileBytes,
        errors: words.map((w) => ({ word: w, expected: 'təst', actual: 'annjʌŋ', confidence: 0.2 })),
      }));
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`[mock-pronounce] http://localhost:${PORT} (모의 — 실채점 아님)`));
