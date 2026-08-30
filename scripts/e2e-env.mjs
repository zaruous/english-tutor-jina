// E2E 공용 환경 헬퍼 — 컨테이너/로컬(Windows·mac) 어디서든 같은 스크립트가 돌게 한다.
//  - 브라우저: PW_CHROMIUM 이 있으면 그 실행파일, 없고 컨테이너 경로가 있으면 그것,
//    둘 다 없으면 Playwright 번들 chromium(channel: 'chromium' — headless-shell 미설치여도 본체로 실행)
//  - CDN 우회: unpkg 차단 환경에서만 로컬 vendor 파일로 라우팅 (E2E_VENDOR 또는 컨테이너 기본 경로가 존재할 때)
import { existsSync } from 'node:fs';

const CONTAINER_CHROMIUM = '/opt/pw-browsers/chromium';
const CONTAINER_VENDOR = '/tmp/claude-0/-home-user-english-tutor-jina/112ff4bd-5b74-582c-b59e-e6f055a8d4cd/scratchpad/vendor';

const executablePath = process.env.PW_CHROMIUM
  || (existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : undefined);

export const launchOptions = executablePath
  ? { headless: true, executablePath }
  : { headless: true, channel: 'chromium' };

const VENDOR = process.env.E2E_VENDOR || CONTAINER_VENDOR;
export const cdnBlocked = existsSync(VENDOR);

export async function routeCdn(page) {
  if (!cdnBlocked) return; // CDN 접근 가능한 환경 — 실제 unpkg 사용
  await page.route('**://unpkg.com/**', (route) => {
    const url = route.request().url();
    const file = url.includes('react-dom') ? 'react-dom.development.js'
      : url.includes('/react@') ? 'react.development.js'
      : url.includes('babel') ? 'babel.min.js' : null;
    if (!file) return route.abort();
    return route.fulfill({ path: `${VENDOR}/${file}`, contentType: 'application/javascript' });
  });
}
