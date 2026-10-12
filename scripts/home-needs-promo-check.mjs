import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Read-only layout check. Compare desktop height with the previous layout;
// mobile now has its own padded frame and full-width buy/sell buttons.
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local frontend');
const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  const page = await browser.newPage({ viewport:{ width:1440, height:1000 }, reducedMotion:'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  assert.equal((await page.goto(base, { waitUntil:'domcontentloaded', timeout:120000 })).status(), 200);
  await page.locator('.home-needs-promo').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.querySelectorAll('.tt-home-fitted-banners .home-buy-banner img')].every(img => img.complete && img.naturalWidth > 0));
  for (const width of [1920, 1440, 1024, 961, 960, 768, 640, 601, 600, 390, 375, 360, 320]) {
    await page.setViewportSize({ width, height:1000 });
    await page.waitForFunction(mobile => Boolean(document.querySelector('.muaxe .lookup-carousel-mobile')) === mobile, width <= 960);
    const result = await page.locator('.wap_muaxe').evaluate(el => {
      const rect = node => node.getBoundingClientRect();
      const promo = el.querySelector('.home-needs-promo');
      const priceRow = el.querySelector('.ngansach');
      const banner = el.querySelector('.home-buy-banner');
      const button = promo.querySelector('a');
      const heading = promo.querySelector('h3');
      const visibleButtonLabel = [...button.querySelectorAll('span')].find(label => getComputedStyle(label).display !== 'none');
      const buttonLabel = visibleButtonLabel.textContent.trim();
      const buttonRange = document.createRange();
      buttonRange.selectNodeContents(visibleButtonLabel);
      const copy = promo.querySelector('.home-needs-promo__copy');
      const icon = promo.querySelector('.home-needs-promo__icon');
      const mobilePromoLayout = getComputedStyle(promo.querySelector('p')).display !== 'none' &&
        getComputedStyle(icon).display !== 'none' && getComputedStyle(promo).backgroundColor === 'rgb(242, 244, 250)' &&
        rect(button).top >= rect(copy).bottom + 9 && Math.abs(rect(button).left - rect(icon).left) < 1 &&
        Math.abs(rect(button).right - rect(copy).right) < 1 && buttonRange.getClientRects().length === 1 &&
        heading.scrollWidth <= heading.clientWidth + 1 && copy.scrollWidth <= copy.clientWidth + 1;
      const height = rect(el).height;
      const tabs = el.querySelector(':scope > .dangky_ct');
      const search = el.querySelector('.muaxe > .search');
      const buttons = [...tabs.querySelectorAll('a')];
      const alignedMobileButtons = Math.abs(rect(buttons[0]).left - rect(search).left) < 1 &&
        Math.abs(rect(buttons[1]).right - rect(search).right) < 1 &&
        Math.abs(rect(buttons[0]).width - rect(buttons[1]).width) < 1 &&
        buttons.every(button => rect(button).height >= 44) &&
        rect(tabs).top - rect(el).top >= 18 && rect(search).top - rect(tabs).bottom >= 15;
      const mobileFrame = getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)' &&
        getComputedStyle(el).boxShadow !== 'none';
      const sidebar = rect(el.querySelector('.banxe')).height;
      const prices = priceRow.outerHTML;
      const priceHeight = rect(priceRow).height;
      const priceLabelsFit = [...priceRow.querySelectorAll('a')].every(link => link.scrollWidth <= link.clientWidth + 1);
      const allCars = priceRow.lastElementChild;
      const allCarsAtEnd = allCars?.matches('a.home-budget-all') && allCars.getAttribute('href') === '/san-pham';
      const withinStrip = [...promo.children].filter(child => getComputedStyle(child).display !== 'none')
        .every(child => rect(child).left >= rect(promo).left && rect(child).right <= rect(promo).right + 1);
      const href = button.getAttribute('href');
      const buttonHeight = rect(button).height;
      const containsBanner = !banner || rect(banner).bottom <= rect(el).bottom;
      const imageFit = banner ? getComputedStyle(banner.querySelector('img')).objectFit : undefined;
      const fittedBanner = el.querySelector('.tt-home-fitted-banners');
      const bannerFits = !fittedBanner || (Math.abs(rect(banner).width / rect(banner).height - 1600 / 158) < .03 &&
        [...banner.querySelectorAll('.home-buy-banner__backdrop')].every(layer => getComputedStyle(layer).display === 'none') &&
        [...banner.querySelectorAll('img')].every(img => img.getAttribute('srcset')?.includes('480w')));
      const followsPrices = promo.previousElementSibling?.contains(priceRow);
      const bannerPlacement = !banner || (banner.previousElementSibling?.matches('.search') && banner.nextElementSibling?.matches('.home-car-brands'));
      const next = promo.nextSibling;
      promo.remove();
      el.classList.remove('tt-home-needs');
      const before = rect(el).height;
      const oldSidebar = rect(el.querySelector('.banxe')).height;
      const unchangedPrices = prices === priceRow.outerHTML && priceHeight === rect(priceRow).height;
      el.classList.add('tt-home-needs');
      el.querySelector('.muaxe').insertBefore(promo, next);
      return { height, before, sidebar, oldSidebar, unchangedPrices, priceLabelsFit, allCarsAtEnd, withinStrip, href, buttonHeight, containsBanner, imageFit, bannerFits, followsPrices, bannerPlacement, alignedMobileButtons, mobileFrame, buttonLabel, mobilePromoLayout };
    });
    if (width > 960) assert(result.height <= result.before + 1, `${width}px: surrounding box grew (${result.before} -> ${result.height})`);
    else {
      assert(result.mobileFrame, `${width}px: mobile white frame or shadow missing`);
      assert(result.alignedMobileButtons, `${width}px: mobile buy/sell buttons must align with search and fit inside the frame`);
    }
    assert.equal(result.sidebar, result.oldSidebar, `${width}px: selling column changed`);
    assert(result.unchangedPrices, `${width}px: price row changed`);
    assert(result.priceLabelsFit, `${width}px: price label clips or overlaps`);
    assert(result.allCarsAtEnd, 'All cars link must be the last price pill and clear price filters');
    assert(result.withinStrip && result.containsBanner, `${width}px: content overflows`);
    assert(result.followsPrices, 'Strip must sit directly below the existing price row');
    assert(result.bannerPlacement, 'Banner must sit between the search input and car brands');
    assert(result.bannerFits, 'Edited banners must fill the frame, use responsive sources, and have no blurred backdrop');
    assert.equal(result.href, '/tien-ich/mua-xe-theo-nhu-cau');
    assert.equal(result.buttonLabel, 'Tìm xe theo nhu cầu');
    if (width <= 700) assert(result.mobilePromoLayout, `${width}px: full-width button, icon, or complete copy missing or overlapping`);
    assert(result.buttonHeight >= (width <= 700 ? 44 : 36), `${width}px: button is too small`);
    if (result.imageFit) assert.equal(result.imageFit, 'contain', 'Banner must remain uncropped');
    console.log(`PASS ${width}px: box ${result.before.toFixed(1)} -> ${result.height.toFixed(1)}px; price row and selling column unchanged`);
  }
  await page.locator('.home-needs-promo__button').focus();
  assert.equal(await page.locator('.home-needs-promo__button').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  const allCars = page.locator('.home-budget-all');
  const idle = await allCars.evaluate(el => ({ color:getComputedStyle(el).color, red:getComputedStyle(el).getPropertyValue('--color-red').trim() }));
  assert.equal(idle.color, 'rgb(226, 0, 0)');
  await allCars.focus();
  const focused = await allCars.evaluate(el => ({ background:getComputedStyle(el).backgroundColor, color:getComputedStyle(el).color,
    visible:el.getBoundingClientRect().right <= el.closest('.cuonngang').getBoundingClientRect().right + 1 }));
  assert.equal(focused.color, 'rgb(255, 255, 255)');
  assert.equal(focused.background, 'rgb(226, 0, 0)');
  assert(focused.visible, 'Focused all cars link must scroll into view on mobile');
  assert.deepEqual(errors, []);
  console.log('PASS unclipped price labels, all cars link/focus colors, mobile focus scroll, existing survey URL, no browser errors');
} finally {
  await browser.close();
}
