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
      provider:    process.env.AI_PROVIDER   || 'ollama',
      ollamaUrl:   process.env.OLLAMA_URL    || 'http://localhost:11434',
      ollamaModel: process.env.OLLAMA_MODEL  || 'gemma4:31b-cloud',
      claudeModel: process.env.CLAUDE_MODEL  || 'claude-haiku-4-5',
    };
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(`window.JINA_CONFIG = ${JSON.stringify(config, null, 2)};`);
    return;
  }

  // 정적 파일 서빙
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

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
