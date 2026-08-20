import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

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
    // apiBase: 포트만 주입 — localhost/127.0.0.1 어느 쪽으로 열어도 오리진이 일치하게
    res.end(
      `window.JINA_CONFIG = ${JSON.stringify(config, null, 2)};\n` +
      `window.JINA_CONFIG.apiBase = 'http://' + location.hostname + ':${process.env.API_PORT || 3004}';`
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
