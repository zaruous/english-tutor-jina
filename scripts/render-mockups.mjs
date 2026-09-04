// 디자인 목업(docs/plan/mockups/*.html) → 미리보기 PNG(docs/plan/img/) 렌더러.
// 사용: node scripts/render-mockups.mjs [이름...] — 목업 HTML을 고치면 다시 실행해 이미지를 갱신한다.
//   node scripts/render-mockups.mjs 13-lc-editor        고친 것만
//   node scripts/render-mockups.mjs                     전체
// 인자를 주는 편을 권한다. 목업 폰트(Pretendard·Instrument Serif)가 없는 머신에서 전체를 돌리면
// 손대지 않은 이미지까지 폴백 폰트로 다시 그려져 diff 에 섞인다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchOptions } from './e2e-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOCKUPS = [
  '08-mistakes', '08-listening', '08-speaking',
  // 관리자 콘텐츠 시리즈(11 → 12 → 13). admin.html 은 학습 앱과 별도 엔트리다.
  '11-admin-contents', '11-admin-users', '12-review-queue', '13-lc-editor', '13-topic-composer',
];

const only = process.argv.slice(2);
const unknown = only.filter((n) => !MOCKUPS.includes(n));
if (unknown.length) {
  console.error(`알 수 없는 목업: ${unknown.join(', ')}\n가능한 값: ${MOCKUPS.join(', ')}`);
  process.exit(1);
}
const targets = only.length ? only : MOCKUPS;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const name of targets) {
  await page.goto(`file://${join(root, 'docs/plan/mockups', `${name}.html`)}`);
  await page.waitForTimeout(300);
  const out = join(root, 'docs/plan/img', `${name}.png`);
  await page.screenshot({ path: out });
  console.log(`✔ ${out}`);
}
await browser.close();
