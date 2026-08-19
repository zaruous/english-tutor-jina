import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errors = [];
p.on('console', m => {
  if (m.type()==='error' && !m.text().includes('net::') && !m.text().includes('404'))
    errors.push(m.text().slice(0,120));
});
await p.setViewportSize({width: 1440, height: 900});
await p.goto('http://localhost:3000');
await p.waitForTimeout(9000);
const rootLen = await p.$eval('#root', el => el.innerHTML.length);
console.log('root length:', rootLen);
if (errors.length) errors.slice(0,5).forEach(e => console.log('ERR:', e));
await p.screenshot({path: 'ss-real-dashboard.png'});

// AI 회화 탭 클릭
const navBtns = await p.$$('header button');
console.log('header buttons:', navBtns.length);
for (const btn of navBtns) {
  const txt = (await btn.textContent()).trim();
  if (txt.includes('AI 회화')) {
    await btn.click();
    await p.waitForTimeout(800);
    await p.screenshot({path: 'ss-real-conversation.png'});
    console.log('navigated to AI 회화');
    break;
  }
}
// 단어장 클릭
for (const btn of await p.$$('header button')) {
  const txt = (await btn.textContent()).trim();
  if (txt.includes('단어장')) {
    await btn.click();
    await p.waitForTimeout(800);
    await p.screenshot({path: 'ss-real-vocab.png'});
    console.log('navigated to 단어장');
    break;
  }
}
// 설정 버튼 클릭
for (const btn of await p.$$('header button')) {
  const txt = (await btn.textContent()).trim();
  if (txt === '') { // settings icon button
    const box = await btn.boundingBox();
    if (box && box.x > 1300) {
      await btn.click();
      await p.waitForTimeout(500);
      await p.screenshot({path: 'ss-real-settings.png'});
      console.log('opened settings');
      break;
    }
  }
}
await b.close();
