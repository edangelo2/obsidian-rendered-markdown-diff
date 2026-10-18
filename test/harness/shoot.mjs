import { chromium } from 'playwright';
const mode = process.argv[2] || 'light';
const out = process.argv[3] || '/tmp/claude-0/shots';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`file://${process.cwd()}/test/.out/${mode}.html`);
await page.waitForFunction(() => window.ready, null, { timeout: 10000 });
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const v = window.view;
  return {
    rows: v.rows.map((r) => r.type),
    groups: v.groups,
    counter: document.querySelector('.rmd-counter').textContent,
    stats: document.querySelector('.rmd-stats').textContent,
    markers: document.querySelectorAll('.rmd-marker').length,
    wordsDel: [...document.querySelectorAll('.rmd-word-del')].map((e) => e.textContent),
    wordsIns: [...document.querySelectorAll('.rmd-word-ins')].map((e) => e.textContent),
    options: [...document.querySelectorAll('.rmd-select')[0].options].map((o) => o.text),
    misaligned: [...document.querySelectorAll('.rmd-row')].filter((r) => r.children[0].getBoundingClientRect().height !== r.children[1].getBoundingClientRect().height).length,
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: `${out}/${mode}-top.png` });
// navigate: next x3
for (let i = 0; i < 3; i++) await page.evaluate(() => window.view.next());
await page.waitForTimeout(700);
console.log('after 3x next counter:', await page.evaluate(() => document.querySelector('.rmd-counter').textContent), 'scrollTop', await page.evaluate(() => document.querySelector('.rmd-scroll').scrollTop));
await page.screenshot({ path: `${out}/${mode}-next3.png` });
await page.evaluate(() => window.view.prev());
await page.waitForTimeout(700);
console.log('after prev counter:', await page.evaluate(() => document.querySelector('.rmd-counter').textContent));
// collapse
await page.click('.rmd-btn[aria-label*="cambios"], .rmd-btn[aria-label*="changes"]');
await page.waitForTimeout(300);
await page.evaluate(() => (document.querySelector('.rmd-scroll').scrollTop = 0));
await page.waitForTimeout(200);
console.log('folds:', await page.evaluate(() => [...document.querySelectorAll('.rmd-fold')].map((f) => f.textContent)));
await page.screenshot({ path: `${out}/${mode}-collapsed.png` });
// minimap click at 90%
await page.click('.rmd-collapse-none', { timeout: 1 }).catch(() => {});
await page.click('.rmd-btn[aria-label*="cambios"], .rmd-btn[aria-label*="changes"]');
const box = await page.locator('.rmd-minimap').boundingBox();
await page.mouse.click(box.x + 5, box.y + box.height * 0.9);
await page.waitForTimeout(300);
console.log('after minimap click scrollTop', await page.evaluate(() => document.querySelector('.rmd-scroll').scrollTop));
await page.screenshot({ path: `${out}/${mode}-minimap.png` });
// internal link click
await page.click('a.internal-link >> nth=0');
console.log('link opened:', await page.evaluate(() => window.lastLink));
console.log('errors:', errors);
await browser.close();
