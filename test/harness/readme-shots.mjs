// Screenshots for the README, from the browser harness.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function open(mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
  await page.goto(`file://${process.cwd()}/test/.out/${mode}.html`);
  await page.waitForFunction(() => window.ready);
  await page.waitForTimeout(300);
  return page;
}
let page = await open('light');
await page.screenshot({ path: 'docs/overview-light.png' });
// Word-level detail: the "Evaluación" paragraph and the context table
const rect = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.rmd-row')];
  const first = rows.find((r) => r.textContent.includes('El motor toma'));
  const last = rows.find((r) => r.textContent.includes('legalEntity'));
  const s = document.querySelector('.rmd-scroll');
  s.scrollTop = first.offsetTop - document.querySelector('.rmd-head').offsetHeight;
  const a = first.getBoundingClientRect();
  const b = last.getBoundingClientRect();
  return { y: a.top, h: b.bottom - a.top };
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'docs/words.png', clip: { x: 0, y: rect.y, width: 1266, height: rect.h } });
await page.close();
page = await open('dark');
for (let i = 0; i < 6; i++) await page.evaluate(() => window.view.next());
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/navigate-dark.png' });
await browser.close();
