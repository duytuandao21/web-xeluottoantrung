import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3107';
const browser = await chromium.launch({ channel:'chrome', headless:true });
const checked = [];
try {
  const page = await browser.newPage({ viewport:{ width:1440, height:900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  assert.equal((await page.goto(base, {waitUntil:'networkidle'})).status(), 200);
  const carHref = await page.locator('.tt-home-cars .item .name_sp a').first().getAttribute('href');
  assert(carHref);
  const accessoryHref = await page.locator('#tt-accessories-root .tt-accessories__image').first().getAttribute('href');
  assert(accessoryHref);
  for (const tab of await page.locator('.wap_dichvu .cap1 li[data-id]').all()) {
    await tab.click();
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
    await page.locator(`#${await tab.getAttribute('aria-controls')}`).waitFor({state:'visible'});
  }
  checked.push('Three service tabs and buy/sell/trade-in panels');
  const search = page.locator('#keyword');
  await search.focus();
  const popup = page.locator('#tt-product-search-popup');
  await popup.waitFor({state:'visible'});
  await search.fill('Toyota');
  await page.waitForTimeout(700);
  await page.getByRole('button', {name:'Đóng gợi ý tìm kiếm',exact:true}).click();
  await popup.waitFor({state:'hidden'});
  assert.equal(await search.evaluate(el => el === document.activeElement), false);
  checked.push('Search popup, typing and dismiss/blur');
  await page.getByRole('button', {name:'Mở trợ lý AI',exact:true}).click();
  await page.locator('#tt-chat-panel').waitFor({state:'visible'});
  await page.getByRole('button', {name:'Đóng trợ lý AI',exact:true}).last().click();
  await page.locator('#tt-chat-panel').waitFor({state:'hidden'});
  checked.push('Chatbot open/close without sending an AI question');
  assert(await page.locator('a[href^="tel:"]').count() > 0);
  assert(await page.locator('#tt-footer a[href]').count() > 0);
  assert.equal(await page.locator('.home-view-all').getAttribute('href'), '/tien-ich/mua-xe-theo-nhu-cau');
  checked.push('Phone/footer links and needs utility CTA');
  for (const route of ['/san-pham','/san-pham?gia=gia%20asc',carHref,'/ban-xe','/len-doi',accessoryHref,
    '/tien-ich/mua-xe-theo-nhu-cau','/tien-ich/dinh-gia-xe','/tien-ich/xem-ngay-mua-xe','/bai-viet']) {
    const response=await page.goto(base+route, {waitUntil:'domcontentloaded',timeout:45000});
    assert.equal(response.status(),200,route);
    checked.push(`GET ${route}: 200`);
  }
  assert.deepEqual(errors,[]);
  await page.close();
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.goto(base,{waitUntil:'networkidle'});
  await mobile.getByRole('button',{name:'Mở menu',exact:true}).click();
  const drawer=mobile.locator('.menu_mobi_add');
  await drawer.locator('a').filter({hasText:/^Khám phá$/}).click();
  await drawer.locator('a').filter({hasText:/^Tiện ích$/}).click();
  await drawer.locator('a[href="/tien-ich/mua-xe-theo-nhu-cau"]').click();
  await mobile.waitForURL('**/tien-ich/mua-xe-theo-nhu-cau');
  await mobile.getByRole('heading',{name:'Mua xe theo nhu cầu',exact:true}).waitFor();
  const surveyConfig = await mobile.request.get(base + '/api/v1/car-recommendations/config');
  if (surveyConfig.ok()) {
    await mobile.getByRole('button',{name:'Bắt đầu tìm xe'}).waitFor();
    checked.push('Mobile discovery menu → utilities → needs survey');
  } else {
    assert.equal(surveyConfig.status(),404);
    await mobile.getByRole('button',{name:'Thử lại',exact:true}).waitFor();
    checked.push('Mobile menu navigation PASS; survey interaction NOT VERIFIED: EC2 config endpoint returns 404');
  }
  await mobile.close();
  fs.writeFileSync('../toi-uu-hieu-suat-website/phase-3/functional-results.json',JSON.stringify({checked,errors},null,2));
  console.log(JSON.stringify({checked,errors},null,2));
} finally { await browser.close(); }
