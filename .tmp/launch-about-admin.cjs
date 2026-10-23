const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const context = await chromium.launchPersistentContext(path.join(__dirname, 'about-admin-profile'), {
    channel: 'chrome', headless: false,
    args: ['--remote-debugging-port=9224'],
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('http://localhost:3001/quan-ly/gioi-thieu', { waitUntil: 'domcontentloaded' });
  console.log('Admin browser ready at http://localhost:3001/quan-ly/gioi-thieu');
  process.on('SIGINT', async () => { await context.close(); process.exit(0); });
  await new Promise(() => {});
})().catch(error => { console.error(error.message); process.exitCode = 1; });
