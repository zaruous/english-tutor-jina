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
  // 정적 응답에 `Access-Control-Allow-Origin: *` 를 붙이던 줄은 삭제했다(플랜 10.5 S5).
  // 브라우저에서 Ollama 로 직결하던 시절의 잔재이고, 지금 이 헤더를 필요로 하는 소비자가 없다
  // (canvas.html 포함 전부 동일 출처 fetch, 외부 CDN 은 상대 서버의 ACAO 에 의존).

  // /api/* — API 서버(:API_PORT)로 동일 출처 프록시.
  // 일부 브라우저 보안 확장은 교차 출처 localhost XHR(웹→API 포트)의 본요청을 차단한다 —
  // 페이지와 같은 출처로 태우면 그 제약을 받지 않고 CORS 도 필요 없어진다.
  // 브라우저 오디오 업로드(multipart)와 긴 AI 응답을 위해 양방향 모두 버퍼링 없이 파이프한다.
  if (req.url.startsWith('/api/')) {
    const headers = { ...req.headers };
    delete headers.host; // 대상(127.0.0.1:API_PORT) 기준으로 다시 계산되게
    // X-Forwarded-For 는 이어붙이지 않고 **덮어쓴다**(플랜 10.5 S6).
    // 위에서 요청 헤더를 통째로 복사하므로, 지우지 않으면 클라이언트가 보낸 값이 그대로
    // API 에 도달해 레이트리밋 IP 축(api/lib/client-ip.js)이 헤더 한 줄로 뚫린다.
    // 들어오는 키의 대소문자가 섞여 들어올 수 있어 전부 지운 뒤 하나만 세팅한다.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'x-forwarded-for') delete headers[key];
    }
    // remoteAddress 가 없는 경우(소켓이 이미 닫힘)에는 헤더를 붙이지 않는다 —
    // undefined 를 그대로 넘기면 http.request 가 ERR_HTTP_INVALID_HEADER_VALUE 로 던진다.
    if (req.socket.remoteAddress) headers['x-forwarded-for'] = req.socket.remoteAddress;
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

  // 정적 파일 서빙 — 여기서는 **순서가 곧 방어**다(플랜 10.5 S4).
  // decode → 구분자 통일 → 정규화 → 루트 상대 경로 산출 → deny 검사 → 루트 포함 검사.
  // 셋 다 실측으로 뚫렸던 경로다:
  //   · 정규화 전 경로에 deny 를 걸면 `/x/../api/config.js` 가 200 으로 서버 소스를 뱉는다.
  //   · 백슬래시를 슬래시로 통일하지 않으면 `/api\config.js` 가 `..` 없이도 deny 를 피한다
  //     (윈도우에서는 path.join 이 백슬래시를 구분자로 접는다).
  //   · decodeURIComponent 를 넣는 순간 `%2e%2e` 가 새로 열리므로, 반드시 정규화 **앞**에 둔다.
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  } catch {
    // 깨진 퍼센트 인코딩(`%zz`) — 정규화할 수 없는 입력이므로 여기서 끊는다.
    res.writeHead(400); res.end('Bad request'); return;
  }
  // %00 은 디코드 후 널바이트가 된다. fs.readFile 은 널바이트 경로에 **동기적으로** 던지므로
  // (ERR_INVALID_ARG_VALUE) 걸러내지 않으면 요청 하나로 정적 서버가 죽는다.
  if (urlPath.includes('\0')) { res.writeHead(400); res.end('Bad request'); return; }

  if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;
  urlPath = path.posix.normalize(urlPath.replace(/\\/g, '/'));
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);
  // 루트 상대 경로 — deny 검사는 반드시 이 값(정규화 + 슬래시 통일)에 걸어야 hit 한다.
  const relPath = path.relative(__dirname, filePath);
  const denyPath = '/' + relPath.split(path.sep).join('/');

  // deny-list — .env(DB 비밀번호)·서버 코드·스크립트가 정적으로 노출되지 않게.
  // 마지막 항목은 루트에 놓인 서버 코드·매니페스트다. 디렉터리 규칙(`/api/`·`/db/`…)에도,
  // 확장자 규칙(.mjs 등)에도 안 걸려서 `/server.js`·`/package.json` 이 그대로 200 이었다
  // (정규화 수정 전에는 `/x/../server.js` 로도 같은 파일이 나왔다). 프론트에서 읽는 곳은 없다.
  const DENY = [
    /^\/\./,
    /^\/(api|db|node_modules|scripts)\//i,
    /\.(env|sql|mjs|log|bak)$/i,
    /^\/(server\.js|package(-lock)?\.json)$/i,
  ];
  if (DENY.some((re) => re.test(denyPath))) {
    res.writeHead(403); res.end(); return;
  }

  // 디렉토리 트래버설 방지 — startsWith(__dirname) 은 구분자를 안 붙여서 형제 디렉터리
  // (`...english tutor jina-EVIL\`)를 루트 안으로 오판한다. 루트 상대 경로가 밖으로
  // 나가지 않는지(`..` 시작 · 절대경로 아님)로 본다.
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
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
