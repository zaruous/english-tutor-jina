// 플랜 08 디자인 목업(docs/plan/mockups/*.html) → 미리보기 PNG(docs/plan/img/) 렌더러.
// 사용: node scripts/render-mockups.mjs — 목업 HTML을 고치면 다시 실행해 이미지를 갱신한다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchOptions } from './e2e-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOCKUPS = ['08-mistakes', '08-listening', '08-speaking'];

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const name of MOCKUPS) {
  await page.goto(`file://${join(root, 'docs/plan/mockups', `${name}.html`)}`);
  await page.waitForTimeout(300);
  const out = join(root, 'docs/plan/img', `${name}.png`);
  await page.screenshot({ path: out });
  console.log(`✔ ${out}`);
}
await browser.close();
