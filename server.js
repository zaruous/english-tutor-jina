import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const API_PORT = process.env.API_PORT || 3004;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.jsx':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

http.createServer((req, res) => {
  // CORS for Ollama dev
  res.setHeader('Access-Control-Allow-Origin', '*');

  // /api/* — API 서버(:API_PORT)로 동일 출처 프록시.
  // 일부 브라우저 보안 확장은 교차 출처 localhost XHR(웹→API 포트)의 본요청을 차단한다 —
  // 페이지와 같은 출처로 태우면 그 제약을 받지 않고 CORS 도 필요 없어진다.
  // 브라우저 오디오 업로드(multipart)와 긴 AI 응답을 위해 양방향 모두 버퍼링 없이 파이프한다.
  if (req.url.startsWith('/api/')) {
    res.removeHeader('Access-Control-Allow-Origin'); // 업스트림(API)의 CORS 헤더와 겹치지 않게
    const headers = { ...req.headers };
    delete headers.host; // 대상(127.0.0.1:API_PORT) 기준으로 다시 계산되게
    const upstream = http.request(
      { host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers },
      (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); },
    );
    upstream.on('error', () => {
      // api-client 는 상태코드와 무관하게 JSON 봉투를 그대로 돌려준다 — code:NETWORK 가 오프라인 화면을 띄운다
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false, code: 'NETWORK',
        error: 'API 서버에 연결할 수 없습니다.',
        hint: '터미널에서 `npm run api` (또는 `npm run dev`)로 API 서버를 실행하세요.',
      }));
    });
    req.pipe(upstream);
    return;
  }

  // /config.js — .env 값을 window.JINA_CONFIG로 주입
  if (req.url === '/config.js') {
    const config = {
      provider:  process.env.AI_PROVIDER || 'claude',
      ollamaUrl: process.env.OLLAMA_URL  || 'http://localhost:11434',
      // provider별 모델 맵 (구형 ollamaModel/claudeModel 키는 캔버스 하위호환으로 유지)
      models: {
        ollama: process.env.OLLAMA_MODEL || 'gemma4:e2b',
        claude: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
        agy:    process.env.AGY_MODEL    || 'gemini-3.7-flash-low',
        cursor: process.env.CURSOR_MODEL || 'gpt-5',
        codex:  process.env.CODEX_MODEL  || null,
      },
      // 로그인 화면의 "개발 계정으로 계속" 노출 조건 (api/config.js가 production+1을 부팅 거부)
      devAutologin: process.env.DEV_AUTOLOGIN === '1',
      ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:e2b',
      claudeModel: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
    };
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    // apiBase: 페이지와 같은 출처 — 위의 /api/* 프록시가 API 서버로 중계한다
    res.end(
      `window.JINA_CONFIG = ${JSON.stringify(config, null, 2)};\n` +
      `window.JINA_CONFIG.apiBase = location.origin;`
    );
    return;
  }

  // 정적 파일 서빙
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // deny-list — .env(DB 비밀번호)·서버 코드·스크립트가 정적으로 노출되지 않게
  const DENY = [/^\/\./, /^\/(api|db|node_modules|scripts)\//i, /\.(env|sql|mjs|log|bak)$/i];
  if (DENY.some((re) => re.test(urlPath))) {
    res.writeHead(403); res.end(); return;
  }

  const filePath = path.join(__dirname, urlPath);

  // 디렉토리 트래버설 방지
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  Jina English Tutor  →  http://localhost:${PORT}\n`);
  console.log(`  AI Provider : ${process.env.AI_PROVIDER || 'ollama'}`);
  console.log(`  Ollama Model: ${process.env.OLLAMA_MODEL || 'gemma4:31b-cloud'}`);
  console.log(`  Claude Model: ${process.env.CLAUDE_MODEL || 'claude-haiku-4-5'}\n`);
});
