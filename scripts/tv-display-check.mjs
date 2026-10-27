import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultTVAnniversary } from '../lib/tv-anniversary-settings.ts';

// Production build required. All API data and image bytes below are local fixtures.
const base = 'http://127.0.0.1:3117';
const artifactDir = 'artifacts/tv-display';
const headerOnly = process.argv.includes('--header-only');
const themeOnly = process.argv.includes('--theme-check');
const anniversaryOnly = process.argv.includes('--anniversary-check');
const marqueeOnly = process.argv.includes('--marquee-check');
const rotationOnly = process.argv.includes('--rotation-only');
const checkPositions = !process.argv.includes('--smoke');
const calls = [];
let failure = false;
let revision = 0;
let inventoryLimit = 128;
let tvConfig = null;
const defaultFixtureConfig = { logoUrl: '', title: 'Bảng giá xe đang bán', hotlineTitle: 'Liên hệ nhận giá tốt',
  carIntervalSeconds: 15, hotlineIntervalSeconds: 5, syncSalesContacts: true, hotlines: [] };
let mixedBrands = false;
const toyotaBrand = { slug: 'toyota', name: 'Toyota', imageUrl: 'https://cdn.toantrungxeluot.io.vn/tv-brands/toyota.png' };
const brandCatalog = [toyotaBrand,
  { slug: 'mercedes-benz', name: 'Mercedes-Benz', imageUrl: 'https://cdn.toantrungxeluot.io.vn/tv-brands/mercedes.png' },
  { slug: 'hyundai', name: 'Hyundai', imageUrl: null }];
const catalogWithEmptyBrands = [
  { slug: 'empty-first', name: 'No active cars first', imageUrl: null }, toyotaBrand,
  { slug: 'empty-middle', name: 'Deposit only', imageUrl: null }, ...brandCatalog.slice(1),
  { slug: 'empty-last', name: 'No active cars last', imageUrl: null },
];
const names = ['Toyota Fortuner 2.4AT', 'Toyota Innova Cross 2.0V', 'Hyundai Santa Fe Dầu Premium',
  'Mercedes-Benz GLB 200 AMG', 'Vinfast VF3 Tiêu chuẩn', 'Ford Everest Titanium Bi-turbo 4x4'];
const cars = Array.from({ length: 128 }, (_, index) => ({
  slug: `tv-car-${index + 1}`, name: `${names[index % names.length]} ${2020 + index % 6}`,
  year: 2020 + index % 6, price: index % 6 === 0 ? 1_190_000_000 : 239_000_000 + index * 1_000_000,
  originalPrice: index % 2 ? null : 1_290_000_000, mileage: index % 5 ? 48000 + index * 10 : null,
  fuel: index % 3 ? 'Xăng' : 'Dầu', status: 'active', coverWidth: 1200, coverHeight: 800,
  cover: `https://cdn.toantrungxeluot.io.vn/tv-test/tv-car-${index + 1}.jpg`,
  brand: toyotaBrand,
}));
const api = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  calls.push(url.pathname + url.search);
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/api/v1/cars') {
    if (failure) { response.statusCode = 503; return response.end('{}'); }
    assert.equal(url.searchParams.get('status'), 'active');
    assert.equal(url.searchParams.get('limit'), '100');
    const page = Number(url.searchParams.get('page'));
    assert.equal(url.searchParams.get('view'), page === 1 ? 'tv' : null);
    const selected = mixedBrands ? cars.slice(0, 16).map((car, i) => ({ ...car, brand: brandCatalog[i < 8 ? 0 : i < 15 ? 1 : 2] })) : cars.slice(0, inventoryLimit);
    const inventory = revision ? selected.slice(1).map(car => ({ ...car, price: 333_000_000 })) : selected;
    const data = inventory.slice((page - 1) * 100, page * 100);
    return response.end(JSON.stringify({ data, meta: { page, limit: 100, total: inventory.length, totalPages: Math.ceil(inventory.length / 100),
      ...(page === 1 ? { tvBrands: mixedBrands ? catalogWithEmptyBrands : [toyotaBrand] } : {}) } }));
  }
  if (url.pathname.endsWith('/thiet-lap-thong-tin')) return response.end(JSON.stringify([{ key: 'phone', value: '0777262607' }, { key: 'siteName', value: headerOnly ? 'OTO TOAN TRUNG | O TO CU TPHCM | O TO CU GIA LAI' : 'Xe Lướt Toàn Trung' }]));
  if (url.pathname.endsWith('/thiet-lap-logo')) return response.end(JSON.stringify([{ key: 'logo', value: '/upload/photo/logo-tt-gold-6981.webp' }]));
  if (url.pathname === '/api/v1/site-settings/tv-display') return response.end(JSON.stringify([{ key: 'config', value: JSON.stringify(tvConfig || defaultFixtureConfig) }]));
  if (url.pathname === '/api/v1/content' && url.searchParams.get('group') === 'thiet-lap-nut-goi') return response.end(JSON.stringify([
    { title: 'Sale HCM', body: '(Tư vấn bán hàng (HCM))', phone: '0777262607', status: 'active' },
    { title: 'Sale Gia Lai', body: '(Tư Vấn Bán Hàng (Gia Lai))', phone: '0777393913', status: 'active' },
    { title: 'Thu mua', body: '(Thu mua và Thẩm định xe)', phone: '0922325679', status: 'active' },
    { title: 'Hidden', body: '(Tư vấn bán hàng)', phone: '0777262609', status: 'inactive' },
  ]));
  if (url.pathname === '/api/v1/about-story' || url.pathname === '/api/v1/seo') { response.statusCode = 404; return response.end('{}'); }
  if (url.pathname.includes('/lookups/') || url.pathname === '/api/v1/services') return response.end(JSON.stringify({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }));
  return response.end('[]');
});
await new Promise((resolve, reject) => { api.once('error', reject); api.listen(4127, '127.0.0.1', resolve); });
await mkdir(artifactDir, { recursive: true });
const output = [];
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3117', '-H', '127.0.0.1'], {
  env: { ...process.env, API_URL: 'http://127.0.0.1:4127' }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => output.push(String(chunk)));
server.stderr.on('data', chunk => output.push(String(chunk)));
let browser;
const watchdog = setTimeout(() => { output.push('TV test watchdog: closing owned browser after 5 minutes.'); void browser?.close(); }, 300000);
const summaries = [];
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(`${base}/TV/QR-xeluottoantrung.svg`); break; }
    catch { if (server.exitCode !== null) throw new Error(output.join('')); await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const photo = await readFile('public/upload/photo/img8444-2-7758.jpg');
  const logo = await readFile('public/upload/photo/logo-tt-gold-6981.webp');
  const brandLogo = await readFile('public/thumbs/65x35x2/upload/product/png-clipart-toyota-logo-toyota-symbol-logo-transport-cars-removebg-preview-3661.png');
  const createPage = async (viewport = { width: 1920, height: 1080 }, options = {}) => {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', ...options });
    await context.route('https://cdn.toantrungxeluot.io.vn/**', route => {
      const url = route.request().url();
      return route.fulfill({ contentType: url.includes('/tv-test/') ? 'image/jpeg' : url.includes('/tv-brands/') ? 'image/png' : 'image/webp',
        body: url.includes('/tv-test/') ? photo : url.includes('/tv-brands/') ? brandLogo : logo });
    });
    // The installed production build keeps the user's API rewrite. Block optional
    // storefront client reads here so a layout check cannot contact that origin.
    await context.route(`${base}/api/v1/**`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }) }));
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    return { context, page };
  };
  const pumpUntil = async (page, predicate) => {
    // Network/decode remain real asynchronous work; let them settle between clock
    // advances instead of assuming headers also mean React committed the result.
    for (let attempt = 0; attempt < 24; attempt++) {
      await page.waitForTimeout(100);
      if (await predicate()) return;
      await page.clock.runFor(1000);
    }
    assert.fail('Timed out waiting for a committed TV state');
  };
  const startPositionCheck = page => page.evaluate(() => {
    const selectors = ['.tv-masthead', '.tv-logo', '.tv-heading h1', '.tv-qr', '.tv-hotline', '.tv-stage', '.tv-footer', '.tv-brand-ribbon', '.tv-brand-summaries'];
    const nodes = selectors.map(selector => document.querySelector(selector));
    const geometry = node => { const b = node.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
    const original = nodes.map(geometry);
    const slots = [...document.querySelectorAll('.tv-board--active [data-tv-card]')].map(geometry);
    let frame, samples = 0, maxDelta = 0, maxCardDelta = 0, mutations = 0, transitionFrames = 0, blankFrames = 0, unreadyImages = 0, coveredIncomingFrames = 0;
    const observer = new MutationObserver(records => {
      mutations += records.filter(record => {
        const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        return !node?.closest('.tv-hotline__numbers, .tv-brand-ribbon, .tv-anniversary-badge');
      }).length;
    });
    observer.observe(nodes[0], { attributes: true, childList: true, characterData: true, subtree: true });
    const sample = () => {
      samples++;
      nodes.forEach((node, i) => geometry(node).forEach((value, j) => { maxDelta = Math.max(maxDelta, Math.abs(value - original[i][j])); }));
      let visible = false;
      document.querySelectorAll('.tv-board').forEach(board => {
        const style = getComputedStyle(board);
        if (style.visibility !== 'visible' || Number(style.opacity) <= .01) return;
        visible = true;
        unreadyImages += [...board.querySelectorAll('img')].filter(image => !image.complete || !image.naturalWidth).length;
        if (board.style.opacity) transitionFrames++;
        if (board.style.opacity && Number(style.opacity) < .99) {
          const current = document.querySelector('.tv-board--active');
          if (board !== current && Number(style.zIndex) <= Number(getComputedStyle(current).zIndex)) coveredIncomingFrames++;
        }
        board.querySelectorAll('[data-tv-card]').forEach((card, index) => {
          if (Number(getComputedStyle(card).opacity) <= .01) return;
          geometry(card).forEach((value, j) => { maxCardDelta = Math.max(maxCardDelta, Math.abs(value - slots[index][j])); });
        });
      });
      if (!visible) blankFrames++;
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    window.stopTVPositionCheck = () => {
      cancelAnimationFrame(frame); observer.disconnect();
      return { samples, transitionFrames, maxDelta, maxCardDelta, mutations, blankFrames, unreadyImages, coveredIncomingFrames,
        sameNodes: nodes.every((node, i) => node === document.querySelector(selectors[i])),
        heading: document.querySelector('.tv-heading h1').innerText };
    };
  });
  const finishPositionCheck = async (page, requireCarTransition = true) => {
    const result = await page.evaluate(() => window.stopTVPositionCheck());
    console.log(JSON.stringify({ positionCheck: result }));
    assert.ok(result.samples > 50 && (!requireCarTransition || result.transitionFrames > 10), 'sample the animated frames, not only the final state');
    assert.equal(result.maxDelta, 0, 'header, stage and footer remain stationary');
    assert.equal(result.maxCardDelta, 0, 'every visible card stays in the same slot throughout transitions and buffer reuse');
    assert.equal(result.mutations, 0, 'rotation does not modify the header DOM');
    assert.equal(result.blankFrames, 0, 'there is always a visible board during the fade and class handoff');
    assert.equal(result.unreadyImages, 0, 'all visible images have loaded before the board appears');
    assert.equal(result.coveredIncomingFrames, 0, 'the fading board is above the old board in both buffer directions');
    assert.ok(result.sameNodes);
    return result;
  };

  if (marqueeOnly) {
    const fixedGeometry = page => page.evaluate(()=>[...document.querySelectorAll('.tv-footer,.tv-hotline,.tv-stage,.tv-logo,.tv-qr,.tv-masthead')].map(node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
    for (const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:3840,height:2160},{width:1080,height:1920},{width:1920,height:886}]) {
      const fullHD=viewport.width===1920 && viewport.height===1080;
      for (const count of fullHD ? [1,2,5] : [5]) {
        const event=structuredClone(defaultTVAnniversary);
        event.slideEnabled=false;
        event.messages=count===1 ? ['Cảm ơn'] : [...defaultTVAnniversary.messages,...Array.from({length:3},(_,i)=>`Auto Toàn Trung tri ân khách hàng đồng hành · Lời tri ân ${i+3}`)].slice(0,count);
        tvConfig={...defaultFixtureConfig,theme:'anniversary-4',anniversary:event};
        const {context,page}=await createPage(viewport);
        const errors=[]; page.on('pageerror',error=>errors.push(error.message));
        await page.clock.install(); const reads=calls.length;
        await page.goto(`${base}/TV`); await page.clock.runFor(1800);
        await page.locator('.tv-stage[data-ready="true"]').waitFor();
        await page.locator('.tv-gratitude[data-fit="true"]').waitFor();
        const geometry=await fixedGeometry(page);
        const details=await page.evaluate(()=>{
          const node=document.querySelector('.tv-gratitude'), view=node.querySelector('.tv-gratitude__viewport'), track=node.querySelector('.tv-gratitude__track');
          const groups=[...track.children], unit=groups[0].firstElementChild;
          const animation=track.getAnimations()[0]; animation.pause();
          const duration=Number(animation.effect.getTiming().duration), width=groups[0].getBoundingClientRect().width;
          const position=time=>{animation.currentTime=time;return new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;};
          const start=position(1000), end=position(3000);
          const coverage=time=>{position(time);const rect=view.getBoundingClientRect(), boxes=groups.map(g=>g.getBoundingClientRect());return boxes.some(b=>b.left<=rect.left+1 && b.right>=rect.right-1);};
          const seam=coverage(duration-1)&&coverage(duration+1);
          animation.currentTime=4000;
          window.marqueeAnimation=animation;
          const r=node.getBoundingClientRect(),footer=node.closest('.tv-footer');
          const left=footer.querySelector('.tv-brand-summary--active .tv-brand-summary__count').getBoundingClientRect().right;
          const right=footer.querySelector('.tv-hotline__icon').getBoundingClientRect().left;
          return {duration,width,viewportWidth:view.clientWidth,sequenceCount:groups[0].children.length,
            groupWidths:groups.map(g=>g.getBoundingClientRect().width),seam,leftward:end<start,pixelsPerSecond:(start-end)/2,
            firstMessages:unit.querySelectorAll('.tv-gratitude__text').length,
            withinGap:innerHeight>innerWidth || r.left>=left && r.right<=right,
            red:getComputedStyle(node).color,fontSize:parseFloat(getComputedStyle(node).fontSize),nowrap:[...unit.children].every(item=>getComputedStyle(item).whiteSpace==='nowrap'),
            noDocumentOverflow:document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight};
        });
        assert.ok(details.leftward&&details.seam&&details.withinGap&&details.nowrap&&details.noDocumentOverflow,JSON.stringify(details));
        assert.equal(details.firstMessages,count); assert.equal(details.red,'rgb(226, 0, 0)');
        assert.ok(details.width>=details.viewportWidth && details.sequenceCount<=24);
        assert.ok(Math.abs(details.groupWidths[0]-details.groupWidths[1])<.01,'both copies have equal width within subpixel rectangle precision');
        assert.ok(Math.abs(details.pixelsPerSecond-details.fontSize*14/9)<.1,'speed scales with the actual landscape or portrait font size');
        if (fullHD && count===2 || !fullHD) {
          await page.locator('.tv-footer').screenshot({path:`${artifactDir}/marquee-footer-${viewport.width}x${viewport.height}.png`});
        }
        // Seeking/pausing through WAAPI overrides CSS play-state. Recreate only
        // the test animation, then check the app's actual CSS pause behavior.
        await page.evaluate(()=>{
          const track=document.querySelector('.tv-gratitude__track');
          track.style.animationName='none'; void getComputedStyle(track).animationName;
          track.style.removeProperty('animation-name'); window.marqueeAnimation=track.getAnimations()[0];
        });
        await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
        const paused=await page.locator('.tv-gratitude__track').evaluate(node=>getComputedStyle(node).animationPlayState);
        assert.equal(paused,'paused');
        await page.evaluate(()=>window.marqueeAnimation.ready);
        const hiddenTime=await page.evaluate(()=>window.marqueeAnimation.currentTime);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>window.marqueeAnimation.currentTime),hiddenTime);
        await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
        assert.equal(await page.locator('.tv-gratitude__track').evaluate(node=>getComputedStyle(node).animationPlayState),'running');
        await page.clock.fastForward(14000); await page.clock.runFor(2500);
        await pumpUntil(page,async()=>await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').count()===1);
        assert.ok(await page.evaluate(()=>document.querySelector('.tv-gratitude__track').getAnimations()[0]===window.marqueeAnimation),'vehicle rotation does not recreate the marquee');
        assert.deepEqual(await fixedGeometry(page),geometry);
        assert.equal(calls.length-reads,7,'marquee does not fetch API data');
        await page.emulateMedia({reducedMotion:'reduce'});
        assert.equal(await page.locator('.tv-gratitude__track').evaluate(node=>getComputedStyle(node).animationName),'none');
        assert.equal(await page.locator('.tv-gratitude__track').evaluate(node=>getComputedStyle(node).transform),'none');
        assert.deepEqual(errors,[]);
        summaries.push({marqueeViewport:viewport,messages:count,...details,hiddenPause:true,reducedMotion:true,fixedGeometry:true,noExtraReads:true,errors});
        console.log(JSON.stringify(summaries.at(-1))); await context.close();
      }
    }
    tvConfig=null;
  }
  if (themeOnly) {
    const observeIntros = page => page.addInitScript(() => {
      window.tvAnniversaryIntroCount = 0;
      const animated = new WeakSet();
      new MutationObserver(records => {
        for (const { target } of records) {
          if (target instanceof HTMLElement && target.matches('.tv-anniversary-badge__number') &&
            target.style.transform && target.style.transform !== 'none' && !animated.has(target)) {
            animated.add(target); window.tvAnniversaryIntroCount++;
          }
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    const motionState = page => page.evaluate(() => {
      const root = document.querySelector('.tv-anniversary-badge');
      const gold = root.querySelector('.tv-anniversary-badge__number strong');
      const light = root.querySelector('.tv-anniversary-ribbon-glint');
      return { intros: window.tvAnniversaryIntroCount,
        light: Number.parseFloat(gold.style.getPropertyValue('--tv-anniversary-glint') || '140'),
        x: light.transform.baseVal.consolidate()?.matrix.e ?? -130,
        introTransform: root.querySelector('.tv-anniversary-badge__number').style.transform,
        masked: getComputedStyle(gold, '::after').maskImage !== 'none',
      };
    });
    const checkMotion = async page => {
      const reads = calls.length;
      assert.equal((await motionState(page)).intros, 1, 'intro is observed once across vehicle rotations');
      await startPositionCheck(page);
      await page.clock.fastForward(30000); await page.clock.runFor(450);
      const sweep = await motionState(page);
      assert.ok(sweep.masked);
      assert.ok(sweep.light < 140 && sweep.light > -40 && sweep.x > -130 && sweep.x < 660, `both gold/ribbon lights move: ${JSON.stringify(sweep)}`);
      await page.screenshot({ path: `${artifactDir}/motion-light-sweep.png` });
      await page.clock.runFor(1300);
      await finishPositionCheck(page, false);
      await page.clock.fastForward(30000); await page.clock.runFor(450);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hidden = await motionState(page);
      assert.ok(hidden.masked, 'pausing GSAP preserves the numeral mask');
      assert.equal(hidden.light, 140); assert.equal(hidden.x, -130); assert.equal(hidden.introTransform, '');
      await page.clock.fastForward(60000); await page.clock.runFor(2000);
      assert.deepEqual(await motionState(page), hidden, 'hidden tabs cancel their light schedule and restore the static design');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(100);
      // Wait for the resumed context to exist before advancing its timeout.
      // Crossing the deadline in fastForward can skip the entire short sweep;
      // approach it first, then sample its actual frames with runFor.
      await page.waitForFunction(() => document.querySelector('.tv-anniversary-badge__number strong')?.style.getPropertyValue('--tv-anniversary-glint') === '140%');
      await page.clock.fastForward(27000); await page.clock.runFor(1500);
      const resumed = await motionState(page);
      assert.equal(resumed.intros, 1); assert.ok(resumed.light < 140 && resumed.light > -40, `resumed sweep: ${JSON.stringify(resumed)}`);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(100);
      const reduced = await motionState(page);
      assert.ok(reduced.masked, 'reduced motion preserves the numeral mask');
      assert.equal(reduced.light, 140); assert.equal(reduced.x, -130);
      await page.clock.fastForward(30000); await page.clock.runFor(2000);
      assert.deepEqual(await motionState(page), reduced, 'live reduced-motion preference stops and restores decoration only');
      assert.equal(calls.length, reads, 'intro, repeated lights and visibility/preference changes add no API reads');
      return { oncePerScreen: true, lightSweep: true, hiddenResume: true, liveReducedMotion: true, noExtraReads: true };
    };
    const geometry = page => page.evaluate(() => {
      const rect = node => { const box = node.getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; };
      // The event may align content within the footer; its outer height and
      // every region outside the footer must match the standard template.
      return [...document.querySelectorAll('.tv-masthead, .tv-logo, .tv-qr, .tv-footer, .tv-stage, .tv-board--active [data-tv-card]')].map(rect);
    });
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 3840, height: 2160 }, { width: 1080, height: 1920 }, { width: 1920, height: 886 }]) {
      let standardGeometry;
      for (const theme of ['standard', 'anniversary-4']) {
        tvConfig = { ...defaultFixtureConfig, theme };
        const { context, page } = await createPage(viewport);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const fullHD = viewport.width === 1920 && viewport.height === 1080;
        if (fullHD) await observeIntros(page);
        await page.clock.install();
        const reads = calls.length;
        await page.goto(`${base}/TV`);
        await page.clock.runFor(1800);
        await page.locator('.tv-stage[data-ready="true"]').waitFor();
        assert.equal(await page.locator('.tv-screen').getAttribute('data-theme'), theme);
        if (theme === 'anniversary-4') {
          // Rasterize the real SVGs: bounding boxes alone cannot detect a
          // painted curve crossing the logo, QR or phone clearance.
          const clearance = await page.evaluate(async () => {
            const results = [];
            for (const position of ['header', 'footer']) {
              const svg = document.querySelector(`.tv-anniversary-trim--${position}`);
              const bounds = svg.getBoundingClientRect();
              const clone = svg.cloneNode(true);
              clone.setAttribute('width', bounds.width); clone.setAttribute('height', bounds.height);
              const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
              try {
                const image = new Image(); image.src = url; await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(bounds.width); canvas.height = Math.ceil(bounds.height);
                const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, bounds.width, bounds.height);
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const selector = position === 'header' ? '.tv-qr' : '.tv-brand-summary__logo, .tv-hotline__icon, .tv-hotline > div, .tv-gratitude';
                const gap = Math.max(6, Math.min(20, innerWidth / 1920 * 10));
                let overlaps = 0;
                for (const node of svg.parentElement.querySelectorAll(selector)) {
                  const box = node.getBoundingClientRect();
                  const left = Math.max(0, Math.ceil(box.left - bounds.left - gap));
                  const right = Math.min(canvas.width, Math.floor(box.right - bounds.left + gap));
                  const top = Math.max(0, Math.ceil(box.top - bounds.top - gap));
                  const bottom = Math.min(canvas.height, Math.floor(box.bottom - bounds.top + gap));
                  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (pixels[(y * canvas.width + x) * 4 + 3]) overlaps++;
                }
                const continuous = position !== 'footer' || Array.from({ length: canvas.width }, (_, x) => pixels[((canvas.height - 2) * canvas.width + x) * 4 + 3]).every(alpha => alpha > 0);
                results.push({ position, overlaps, continuous, visible: pixels.some((value, index) => index % 4 === 3 && value > 0) });
              } finally { URL.revokeObjectURL(url); }
            }
            const confetti = document.querySelector('.tv-event-confetti');
            const inset = getComputedStyle(confetti).clipPath.match(/inset\(0px ([\d.]+)%/);
            const contentLeft = Math.min(...[...document.querySelectorAll('.tv-qr > span, .tv-qr img')].map(node => node.getBoundingClientRect().left));
            return { trims: results, confettiClearOfQR: Boolean(inset) && innerWidth * (1 - Number(inset[1]) / 100) <= contentLeft - 6 };
          });
          assert.ok(clearance.trims.every(item => item.visible && item.continuous && item.overlaps === 0), `painted ribbon is continuous and clear of QR, brand logo, phone and marquee: ${JSON.stringify(clearance)}`);
          assert.ok(clearance.confettiClearOfQR, 'animated confetti is clipped before the QR and caption area');
        }
        if (fullHD && theme === 'anniversary-4') {
          const pieces=page.locator('.tv-event-confetti i');
          assert.equal(await pieces.count(),12,'two additional pieces fill the space before the QR caption');
          const positions=()=>pieces.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));
          const before=await positions(); await page.waitForTimeout(1200); const after=await positions();
          assert.ok(after.some((point,i)=>Math.hypot(point[0]-before[i][0],point[1]-before[i][1])>2),'confetti has visible drift over a short real compositor interval');
          assert.equal(await page.locator('.tv-event-confetti').evaluate(node=>getComputedStyle(node).overflow),'hidden','drifting pieces are clipped to the header');
          assert.equal(await page.locator('.tv-footer .tv-event-confetti').count(),0,'the text footer stays clear');
        }
        const bounds = await geometry(page);
        if (theme === 'standard') standardGeometry = bounds;
        else assert.deepEqual(bounds, standardGeometry, 'event does not move/resize header, logo, QR, footer, stage or cards');
        assert.equal(await page.locator('.tv-anniversary-badge').count(), theme === 'standard' ? 0 : 1);
        const display = await page.evaluate(() => {
          const inside = (node, parent) => {
            const box = node.getBoundingClientRect(), outer = parent.getBoundingClientRect();
            return box.left >= outer.left - 1 && box.right <= outer.right + 1 && box.top >= outer.top - 1 && box.bottom <= outer.bottom + 1;
          };
          const heading = document.querySelector('.tv-heading');
          const badge = heading.querySelector('.tv-anniversary-badge');
          const badgeBox = badge?.getBoundingClientRect();
          const badgeNumber = badge?.querySelector('.tv-anniversary-badge__number').getBoundingClientRect();
          const ribbon = badge?.querySelector('.tv-anniversary-badge__message > strong');
          const ribbonBox = ribbon?.getBoundingClientRect();
          const title = heading.querySelector('h1');
          const titleBox = title.getBoundingClientRect();
          const header = document.querySelector('.tv-masthead');
          const wreath = badge?.querySelector('svg').getBBox();
          return {
            overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            headingFits: [...heading.children].every(node => inside(node, document.querySelector('.tv-masthead'))),
            loaded: [...document.querySelectorAll('.tv-board--active img, .tv-logo, .tv-qr img')].every(img => img.complete && img.naturalWidth),
            captionFits: [...document.querySelectorAll('.tv-anniversary-badge__message > *')].every(node => node.scrollWidth <= node.clientWidth + 1),
            badgeClearOfTop: !badgeNumber || badgeNumber.top >= header.getBoundingClientRect().top + innerHeight * .008,
            badgeCentered: !badgeBox || Math.abs(badgeBox.left + badgeBox.width / 2 - innerWidth / 2) < 2,
            ribbonCenteredOnTitle: !ribbonBox || Math.abs(ribbonBox.left + ribbonBox.width / 2 - titleBox.left - titleBox.width / 2) < 2,
            ribbonProminent: !ribbon || parseFloat(getComputedStyle(ribbon).fontSize) / parseFloat(getComputedStyle(title).fontSize) > .7,
            numberClearOfLogo: !badgeNumber || badgeNumber.left >= document.querySelector('.tv-logo').getBoundingClientRect().right,
            badgeContentsFit: !badge || [...badge.querySelectorAll('div, strong, span, svg')].every(node => inside(node, header)),
            wreathUnclipped: !wreath || (wreath.x >= 0 && wreath.y >= 0 && wreath.x + wreath.width <= 100 && wreath.y + wreath.height <= 100),
            wreathBounds: wreath ? [wreath.x, wreath.y, wreath.width, wreath.height] : null,
            numberLightMask: !badge || getComputedStyle(badge.querySelector('.tv-anniversary-badge__number strong'), '::after').maskImage !== 'none',
            brandRibbonShown: getComputedStyle(heading.querySelector('.tv-brand-ribbon')).display !== 'none',
          };
        });
        assert.equal(display.overflow, false); assert.ok(display.headingFits && display.loaded && display.captionFits);
        assert.ok(display.badgeClearOfTop && display.badgeCentered && display.badgeContentsFit && display.wreathUnclipped, `the entire event badge is centered, inside the header, with top clearance and no SVG clipping: ${JSON.stringify(display)}`);
        assert.ok(display.ribbonCenteredOnTitle && display.ribbonProminent && display.numberClearOfLogo, `the larger ribbon shares the title center, with its numeral outside and clear of the logo: ${JSON.stringify(display)}`);
        assert.equal(display.brandRibbonShown, theme === 'standard', 'only the event hides the header brand; the standard theme restores it');
        assert.ok(display.numberLightMask, 'the numeral light is masked to the custom vector outline');
        assert.equal(calls.length - reads, 7, 'the skin adds no API or database reads');
        await page.screenshot({ path: `${artifactDir}/theme-${theme}-${viewport.width}x${viewport.height}.png` });
        await page.locator('.tv-masthead').screenshot({ path: `${artifactDir}/header-${theme}-${viewport.width}x${viewport.height}.png` });
        if (theme === 'anniversary-4') await page.locator('.tv-footer').screenshot({ path: `${artifactDir}/footer-${theme}-${viewport.width}x${viewport.height}.png` });
        if (theme === 'anniversary-4') await page.locator('.tv-anniversary-badge__number').screenshot({ path: `${artifactDir}/emblem-four-${viewport.width}x${viewport.height}.png` });
        const rotationReads = calls.length;
        await startPositionCheck(page);
        for (const slug of ['tv-car-7', 'tv-car-13']) {
          await page.clock.fastForward(14000); await page.clock.runFor(2500);
          await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="${slug}"]`).count() === 1);
        }
        const stability = await finishPositionCheck(page);
        assert.equal(calls.length, rotationReads, 'switching vehicles does not request API data');
        const motion = fullHD && theme === 'anniversary-4' ? await checkMotion(page) : undefined;
        // Apply and remove the event through the existing five-minute refresh,
        // without navigation/reload, preserving the same header and card nodes.
        if (viewport.width === 1920 && theme === 'standard') {
          for (const nextTheme of (fullHD ? ['anniversary-4', 'standard', 'anniversary-4', 'standard'] : ['anniversary-4', 'standard'])) {
            tvConfig = { ...defaultFixtureConfig, theme: nextTheme };
            await page.clock.fastForward(300000);
            await pumpUntil(page, async () => await page.locator('.tv-screen').getAttribute('data-theme') === nextTheme);
            await page.screenshot({ path: `${artifactDir}/theme-refresh-${nextTheme}.png` });
            assert.deepEqual(await geometry(page), standardGeometry, 'refresh-driven theme changes keep card and frame geometry');
            assert.equal(await page.locator('.tv-anniversary-badge').count(), nextTheme === 'standard' ? 0 : 1);
            if (fullHD && nextTheme === 'anniversary-4') {
              await page.waitForTimeout(100); await page.clock.runFor(1200);
              assert.equal((await motionState(page)).intros, 1, 'turning the event off/on and refreshing data does not replay its intro');
            }
          }
        }
        assert.deepEqual(errors, []);
        summaries.push({ viewport, theme, unchangedGeometry: true, ...display, stability, motion, errors });
        console.log(JSON.stringify({ viewport, theme, unchangedGeometry: true, ...display }));
        await context.close();
      }
    }
    tvConfig = null;
  }
  if (anniversaryOnly) {
    tvConfig = { ...defaultFixtureConfig, theme: 'anniversary-4', carIntervalSeconds: 5 };
    const visibleEvent = page => page.locator('.tv-anniversary-slide[data-visible="true"]').count();
    const firstCar = page => page.locator('.tv-board--active [data-car-slug]').first().getAttribute('data-car-slug');
    const advanceUntil = async (page, check, seconds = 24) => {
      for (let i = 0; i < seconds * 2; i++) {
        if (await check()) return;
        await page.clock.runFor(500); await page.waitForTimeout(10);
      }
      assert.fail('Anniversary state did not arrive within its visible-time budget');
    };
    const fixedGeometry = page => page.evaluate(() => [...document.querySelectorAll('.tv-masthead,.tv-logo,.tv-qr,.tv-hotline,.tv-stage,.tv-footer')]
      .map(node => { const r = node.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; }));
    for (const viewport of [{width:1920,height:1080}, {width:1366,height:768}, {width:3840,height:2160}, {width:1080,height:1920}, {width:1920,height:886}]) {
      const fullHD = viewport.width === 1920 && viewport.height === 1080;
      mixedBrands = fullHD;
      const expectedCar = index => `tv-car-${fullHD ? [1,7,9,15,16][index % 5] : index * 6 + 1}`;
      const { context, page } = await createPage(viewport);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.clock.install();
      const reads = calls.length;
      await page.goto(`${base}/TV`); await page.clock.runFor(1800);
      await page.locator('.tv-stage[data-ready="true"]').waitFor();
      await page.waitForFunction(() => document.querySelector('.tv-anniversary-slide img')?.naturalWidth > 0);
      const geometry = await fixedGeometry(page);
      assert.equal(await page.locator('.tv-event-confetti i').count(), 12);
      const pages = fullHD ? 18 : 6;
      for (let next = 1; next <= pages; next++) {
        if (next % 6 === 0) {
          await advanceUntil(page, async () => !!await visibleEvent(page));
          assert.equal(await firstCar(page), expectedCar(next - 1), 'interlude does not consume or alter the car index');
          assert.deepEqual(await fixedGeometry(page), geometry);
          assert.ok(await page.locator('.tv-anniversary-slide img').evaluate(img => img.complete && img.naturalWidth > 0));
          if (next === 6) {
            await page.clock.runFor(800);
            // Native CSS transitions follow compositor time, not page.clock.
            await page.waitForTimeout(850);
            assert.equal(await page.locator('.tv-anniversary-slide').evaluate(node => getComputedStyle(node).opacity), '1');
            const fit = await page.evaluate(() => {
              const footer = document.querySelector('.tv-footer'), gratitude = footer.querySelector('.tv-gratitude').getBoundingClientRect();
              const count = footer.querySelector('.tv-brand-summary--active .tv-brand-summary__count').getBoundingClientRect();
              const phone = footer.querySelector('.tv-hotline__icon').getBoundingClientRect();
              const slide = document.querySelector('.tv-anniversary-slide__copy');
              return { gratitudeClear: innerWidth < innerHeight || gratitude.left >= count.right && gratitude.right <= phone.left,
                slideFits: slide.scrollHeight <= slide.clientHeight + 1 && slide.scrollWidth <= slide.clientWidth + 1,
                overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
            });
            assert.ok(fit.gratitudeClear && fit.slideFits && !fit.overflow, JSON.stringify(fit));
            await page.screenshot({ path: `${artifactDir}/anniversary-slide-${viewport.width}x${viewport.height}.png` });
            if (fullHD) {
              await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange')); });
              await page.clock.fastForward(60000);
              assert.equal(await visibleEvent(page), 1, 'hidden time must not consume the interlude');
              assert.ok(await page.locator('.tv-event-confetti i').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationPlayState === 'paused')));
              await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
              await page.clock.runFor(4000);
              assert.equal(await visibleEvent(page), 1, 'interlude resumes its remaining visible time');
            }
          }
        }
        await advanceUntil(page, async () => await firstCar(page) === expectedCar(next) && !await visibleEvent(page));
      }
      assert.deepEqual(await fixedGeometry(page), geometry);
      assert.equal(calls.length - reads, fullHD ? 6 : 7, 'event decoration/interludes introduce no API reads');
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.ok(await page.locator('.tv-event-animated').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none')));
      assert.equal(await page.locator('.tv-gratitude__track').evaluate(node => getComputedStyle(node).transform), 'none');
      assert.deepEqual(errors, []);
      summaries.push({ anniversaryViewport:viewport, carPages:pages, interludes:pages / 6, noSkippedPages:true, fixedGeometry:true, noExtraReads:true, errors });
      console.log(JSON.stringify(summaries.at(-1)));
      await context.close();
    }
    // Admin-managed content/timing and independently disabled effects.
    {
      const custom = structuredClone(defaultTVAnniversary);
      custom.pagesBetweenSlides = 1; custom.slideSeconds = 5; custom.messageSeconds = 7;
      custom.messages = ['Lời tri ân tùy chỉnh 1','Lời tri ân tùy chỉnh 2'];
      custom.confetti = false; custom.silk = false; custom.sparkles = false;
      custom.slides = [
        {...custom.slides[0],title:'A'.repeat(60),highlight:'B'.repeat(60),body:'C'.repeat(240)},
        {...custom.slides[0],id:'second',imageUrl:custom.slides[0].imageUrl+'?tribute=second',title:'Tri ân khách hàng thứ hai'},
      ];
      tvConfig = {...defaultFixtureConfig,theme:'anniversary-4',carIntervalSeconds:5,anniversary:custom};
      const {context,page} = await createPage();
      await page.clock.install(); const reads = calls.length;
      await page.goto(`${base}/TV`); await page.clock.runFor(1800);
      await page.locator('.tv-stage[data-ready="true"]').waitFor();
      assert.equal(await page.locator('.tv-event-confetti,.tv-event-sparkles,.tv-event-silk').count(),0);
      assert.equal(await page.locator('.tv-gratitude span').first().textContent(),custom.messages[0]);
      assert.ok(await page.locator('.tv-gratitude__track').evaluate(node=>parseFloat(getComputedStyle(node).animationDuration)>0));
      for (const [index,slide] of custom.slides.entries()) {
        await advanceUntil(page,async()=>!!await visibleEvent(page));
        assert.equal(await page.locator('.tv-anniversary-slide h2').textContent(),slide.title+slide.highlight);
        assert.ok(await page.locator('.tv-anniversary-slide__copy').evaluate(node=>node.scrollHeight<=node.clientHeight+1),'long admin text fits without enlarging the stage');
        await advanceUntil(page,async()=>!await visibleEvent(page));
        assert.equal(await firstCar(page),`tv-car-${(index+1)*6+1}`);
      }
      assert.equal(calls.length-reads,7);
      custom.slideEnabled=false; custom.gratitude=false;
      tvConfig={...tvConfig,anniversary:structuredClone(custom)};
      await page.clock.fastForward(300000);
      await pumpUntil(page,async()=>await page.locator('.tv-anniversary-slide,.tv-gratitude').count()===0);
      tvConfig={...tvConfig,theme:'standard'};
      await page.clock.fastForward(300000);
      await pumpUntil(page,async()=>await page.locator('.tv-screen').getAttribute('data-theme')==='standard');
      assert.equal(await page.locator('.tv-anniversary-badge,.tv-anniversary-trim,.tv-event-confetti,.tv-anniversary-slide,.tv-gratitude').count(),0);
      assert.notEqual(await page.locator('.tv-brand-ribbon').evaluate(node=>getComputedStyle(node).display),'none');
      await context.close(); summaries.push({adminManagedContentTimingAndEffects:true,alternatingSlides:true,longTextFits:true,standardRestoresOldUI:true});
      tvConfig={...defaultFixtureConfig,theme:'anniversary-4',carIntervalSeconds:5};
    }
    // Failed showroom image must never replace a perfectly usable vehicle page.
    for (const mode of ['failed', 'slow', 'single-page']) {
      inventoryLimit = mode === 'single-page' ? 1 : 128;
      const {context, page} = await createPage();
      let release; const gate = new Promise(resolve => { release = resolve; });
      let photoReads = 0;
      if (mode !== 'single-page') await context.route('**/upload/photo/img8444-2-7758.jpg', async route => {
        photoReads++;
        if (mode === 'slow') await gate;
        await route.fulfill({status:mode === 'failed' ? 404 : 200,contentType:'image/jpeg',body:mode === 'failed' ? '' : photo});
      });
      await page.clock.install();
      await page.goto(`${base}/TV`, {waitUntil:'domcontentloaded'}); await page.clock.runFor(1800);
      await page.locator('.tv-stage[data-ready="true"]').waitFor();
      if (mode === 'single-page') {
        await advanceUntil(page, async () => !!await visibleEvent(page), 40);
        await advanceUntil(page, async () => !await visibleEvent(page));
        assert.equal(await firstCar(page), 'tv-car-1');
      } else {
        await advanceUntil(page, async () => await firstCar(page) === 'tv-car-43', 50);
        assert.equal(await visibleEvent(page), 0, 'unready photo skips interludes, never cars');
        assert.equal(photoReads, 1, 'no repeated image requests while unavailable');
        if (mode === 'slow') {
          release();
          // A timed-out URL is skipped until the existing five-minute refresh.
          await page.clock.fastForward(300000);
          await advanceUntil(page,async()=>await page.locator('.tv-anniversary-slide img').evaluateAll(nodes=>nodes.some(img=>img.naturalWidth>0)),40);
          await advanceUntil(page, async () => !!await visibleEvent(page));
          assert.ok(photoReads<=2,'failed photos retry at most once per snapshot refresh');
        }
      }
      release(); await context.close();
      summaries.push({anniversaryImageMode:mode, passed:true});
    }
    inventoryLimit = 128; tvConfig = null;
  }
  for (const viewport of (rotationOnly || themeOnly || anniversaryOnly || marqueeOnly ? [] : [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 3840, height: 2160 }, { width: 1080, height: 1920 }])) {
    const { context, page } = await createPage(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (checkPositions) await page.clock.install();
    const before = calls.length;
    assert.equal((await page.goto(`${base}/TV`)).status(), 200);
    if (checkPositions) await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    const data = await page.evaluate(() => {
      const active = document.querySelector('.tv-board--active');
      return {
        cards: active.querySelectorAll('[data-tv-card]').length,
        loaded: [...active.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0),
        overflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight],
        extras: document.querySelectorAll('.wap_header, .menu_mobi, .tt-footer, .sale-header-button, .chatbot-launcher').length,
        legacyCSS: document.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]').length,
        clipped: [...active.querySelectorAll('h2, .tv-car__price strong, .tv-car__specs')].filter(node => node.scrollWidth > node.clientWidth + 1).length,
        titleClippedVertically: [...active.querySelectorAll('h2')].filter(node => node.scrollHeight > node.clientHeight + 1).length,
        brands: [...active.querySelectorAll('h2')].map(title => {
          const brand = title.querySelector('.tv-car__brand');
          return { text: brand?.textContent, expected: title.title.trim().split(/\s+/)[0],
            preserved: title.textContent === title.title.trim(),
            ratio: brand ? parseFloat(getComputedStyle(brand).fontSize) / parseFloat(getComputedStyle(title).fontSize) : 0,
            stroke: brand ? parseFloat(getComputedStyle(brand).webkitTextStrokeWidth) : 0 };
        }),
        clipDetails: [...active.querySelectorAll('h2, .tv-car__price strong, .tv-car__specs')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => ({ tag: node.tagName, text: node.textContent, box: [node.clientWidth, node.clientHeight], scroll: [node.scrollWidth, node.scrollHeight] })),
        title: document.title,
      };
    });
    await page.screenshot({ path: `${artifactDir}/${viewport.width}x${viewport.height}.png` });
    console.log(JSON.stringify({ viewport, ...data }));
    assert.equal(data.cards, 6); assert.ok(data.loaded); assert.equal(data.extras, 0);
    assert.equal(data.legacyCSS, 0);
    assert.deepEqual(data.overflow, [0, 0]); assert.equal(data.clipped, 0);
    assert.equal(data.titleClippedVertically, 0);
    assert.ok(data.brands.every(brand => brand.text === brand.expected && brand.preserved && brand.ratio >= 1.17 && brand.stroke > 0), 'only the first word is emphasized, without changing the car name');
    assert.match(await page.locator('.tv-pagination').innerText(), /128/);
    assert.equal(await page.locator('.tv-pagination > strong').count(), 0, 'page numbers are removed');
    assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-count'), '128');
    const layout = await page.locator('.tv-screen').evaluate(node => {
      const header = node.querySelector('.tv-masthead').getBoundingClientRect();
      const footer = node.querySelector('.tv-footer').getBoundingClientRect();
      const qrImage = node.querySelector('.tv-masthead .tv-qr img');
      const qr = qrImage.getBoundingClientRect();
      const qrCaption = node.querySelector('.tv-qr > span').getBoundingClientRect();
      const logo = node.querySelector('.tv-brand-summary--active img').getBoundingClientRect();
      const hotline = node.querySelector('.tv-footer .tv-hotline').getBoundingClientRect();
      const hotlineParts = [...node.querySelectorAll('.tv-hotline__icon, .tv-hotline > div > span, .tv-hotline__numbers')].map(item => item.getBoundingClientRect());
      const inside = (box, bounds) => box.top >= bounds.top && box.bottom <= bounds.bottom && box.left >= bounds.left && box.right <= bounds.right;
      const stage = node.querySelector('.tv-stage').getBoundingClientRect();
      return { qrSize: qr.width, logoSize: logo.width, qrInside: inside(qr, header) && inside(qrCaption, header), hotlineInside: inside(hotline, footer),
        headerHeight: header.height,
        qrLoaded: qrImage.complete && qrImage.naturalWidth > 0, stage: [stage.top, stage.bottom],
        hotlineOneLine: hotlineParts.every((box, i) => Math.abs(box.top + box.height / 2 - hotlineParts[0].top - hotlineParts[0].height / 2) < 1 && (!i || box.left >= hotlineParts[i - 1].right)),
        hotlineGaps: hotlineParts.slice(1).map((box, i) => box.left - hotlineParts[i].right),
        labelClipped: [...node.querySelectorAll('.tv-brand-summary--active .tv-brand-summary__count, .tv-hotline > div > span, .tv-hotline__number--active, .tv-qr > span')].some(item => item.scrollWidth > item.clientWidth + 1) };
    });
    assert.ok(layout.qrInside && layout.qrLoaded, 'larger SVG QR is ready and wholly inside the header');
    assert.ok(layout.hotlineInside, 'hotline fits the unchanged footer');
    assert.ok(layout.hotlineOneLine && layout.hotlineGaps.every(gap => gap < viewport.width * .02), 'icon, label and rotating number share one line with compact gaps');
    assert.ok(layout.qrSize >= viewport.height * (viewport.width > viewport.height ? .139 : .099) && layout.logoSize >= viewport.width * .064);
    assert.equal(layout.labelClipped, false);
    const portrait = viewport.height > viewport.width;
    assert.ok(Math.abs(layout.headerHeight - viewport.height * (portrait ? .13 : .15)) < 1, 'larger QR keeps the header height unchanged');
    assert.ok(Math.abs(layout.stage[0] - viewport.height * (portrait ? .14 : .166)) < 1 &&
      Math.abs(layout.stage[1] - viewport.height * (portrait ? .91 : .90)) < 1, 'car region keeps its original bounds');
    assert.equal(await page.locator('.tv-masthead .tv-hotline, .tv-footer .tv-qr, .tv-website').count(), 0);
    assert.equal(await page.locator('.tv-qr').count(), 1);
    assert.doesNotMatch(await page.locator('.tv-screen').innerText(), /Xem thêm xe tại|xeluottoantrung\.com/);
    assert.match(await page.locator('.tv-hotline').innerText(), /0777262607/);
    assert.equal(calls.slice(before).filter(path => path.startsWith('/api/v1/cars?')).length, 2);
    assert.equal(calls.slice(before).length, 7, 'two inventory reads, four shared settings reads and one existing sales contact list');
    assert.ok(calls.slice(before).every(path => path.startsWith('/api/v1/cars?') || path.startsWith('/api/v1/site-settings/') || path.startsWith('/api/v1/content?group=thiet-lap-nut-goi')));
    assert.equal((await page.locator('meta[name="robots"]').getAttribute('content')), 'noindex, nofollow');
    assert.equal(await page.locator('link[rel="icon"]').count(), 1);
    assert.equal(await page.locator('.tv-heading p').count(), 0);
    await page.screenshot({ path: `${artifactDir}/${viewport.width}x${viewport.height}.png` });
    summaries.push({ viewport, ...data, layout, errors }); assert.deepEqual(errors, []);
    if (checkPositions) {
      const reads = calls.length;
      await startPositionCheck(page);
      for (const slug of ['tv-car-7', 'tv-car-13', 'tv-car-19', 'tv-car-25']) {
        await page.clock.fastForward(14000);
        await page.clock.runFor(2500);
        await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="${slug}"]`).count() === 1);
      }
      const header = await finishPositionCheck(page);
      assert.equal(header.heading, 'BẢNG GIÁ XE ĐANG BÁN');
      assert.equal(calls.length, reads);
      summaries.push({ viewport, stableHeader: header });
      console.log(JSON.stringify({ viewport, stableHeader: header }));
    }
    await context.close();
  }

  if (!process.argv.includes('--smoke') && !headerOnly && !themeOnly && !anniversaryOnly && !marqueeOnly) {
  // Brand boundary, partial pages, next-logo readiness, and repeated buffers.
  {
    mixedBrands = true;
    const { context, page } = await createPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await context.route(/tv-brands\/mercedes\.png/, async route => {
      await gate; await route.fulfill({ contentType: 'image/webp', body: logo }).catch(() => {});
    });
    await page.clock.install();
    const readsBefore = calls.length;
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.equal(calls.length - readsBefore, 6, 'one inventory request plus existing settings/contacts; no brand request');
    const reads = calls.length;
    await startPositionCheck(page);
    const check = async (brand, slugs) => {
      await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="tv-car-${slugs[0]}"]`).count() === 1);
      assert.equal(await page.locator('.tv-brand--active').getAttribute('data-brand-slug'), brand);
      assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-slug'), brand);
      assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-count'), String(brand === 'toyota' ? 8 : brand === 'mercedes-benz' ? 7 : 1));
      assert.match(await page.locator('.tv-brand-summary--active').innerText(), /^\d+ xe đang bán$/);
      assert.ok(await page.locator('.tv-brand-summary--active img').evaluateAll(images => images.every(image => image.dataset.tvFailed === 'true' || image.complete && image.naturalWidth > 0)));
      if (await page.locator('.tv-brand-summary--active img').count())
        assert.equal(await page.locator('.tv-brand-summary--active img').evaluate(image => image.currentSrc),
          await page.locator('.tv-brand--active img').evaluate(image => image.currentSrc), 'reuse the same logo candidate');
      assert.deepEqual(await page.locator('.tv-board--active [data-car-slug]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.carSlug.split('-').at(-1)))), slugs);
      assert.ok(await page.locator('.tv-brand--active img').evaluateAll(images => images.every(image => image.dataset.tvFailed === 'true' || image.complete && image.naturalWidth > 0)));
      assert.equal(await page.locator('.tv-brand--active strong').evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
      assert.doesNotMatch(await page.locator('.tv-brand--active').innerText(), /Hãng/i);
      assert.equal(calls.length, reads);
    };
    await check('toyota', [1, 2, 3, 4, 5, 6]);
    await page.clock.runFor(16500); await check('toyota', [7, 8]);
    // Next brand's cars are ready, but its logo is still held. Keep current pair.
    await page.clock.runFor(16500);
    assert.equal(await page.locator('.tv-brand--active').getAttribute('data-brand-slug'), 'toyota');
    assert.equal(await page.locator('.tv-board--active [data-tv-card]').count(), 2);
    release(); await check('mercedes-benz', [9, 10, 11, 12, 13, 14]);
    await page.clock.runFor(16500); await check('mercedes-benz', [15]);
    await page.clock.runFor(16500); await check('hyundai', [16]);
    await page.screenshot({ path: `${artifactDir}/brand-partial.png` });
    await page.clock.runFor(16500); await check('toyota', [1, 2, 3, 4, 5, 6]);
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const [brand, slugs] of [['toyota', [7, 8]], ['mercedes-benz', [9, 10, 11, 12, 13, 14]],
        ['mercedes-benz', [15]], ['hyundai', [16]], ['toyota', [1, 2, 3, 4, 5, 6]]]) {
        await page.clock.runFor(16500); await check(brand, slugs);
      }
    }
    assert.equal(await page.locator('.tv-brand-measure').count(), 3, 'empty brands do not enter the header or rotation');
    assert.equal(await page.locator('.tv-pagination > strong').count(), 0);
    const stable = await finishPositionCheck(page);
    assert.deepEqual(errors, []);
    summaries.push({ brandCycle: 'PASS', completeCycles: 3, skipsEmptyBrands: 'PASS', pages: [6, 2, 6, 1, 1], slowBrandLogoHoldsPreviousPage: 'PASS', noBrandRotationRequests: true, stable });
    // Exercise new server props without remounting the TV client component.
    // Next's installed publicAppRouterInstance is exposed here for diagnostics.
    const beforeServerRefresh = calls.length;
    const beforeRefreshToken = await page.locator('.tv-board--active').getAttribute('data-token');
    const serverRefresh = page.waitForResponse(response => new URL(response.url()).pathname === '/TV' &&
      response.request().headers()['rsc'] === '1' && response.status() === 200);
    await page.evaluate(() => window.next.router.refresh());
    // A Flight stream may stay open after React commits the new server props.
    // Wait for the matching active buffer rather than response.finished().
    await serverRefresh;
    await pumpUntil(page, async () => await page.locator('.tv-board--active').getAttribute('data-token') !== beforeRefreshToken &&
      await page.locator('.tv-stage').getAttribute('data-ready') === 'true' &&
      await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count() === 1);
    await page.clock.runFor(16500);
    await pumpUntil(page, async () => await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').count() === 1);
    assert.equal(calls.length - beforeServerRefresh, 6, 'only the requested server refresh reads');
    assert.deepEqual(errors, []);
    summaries.push({ newServerPropsDoNotFreezeRotation: 'PASS' });
    await context.close();
    // Broken transform + original logo hides only the optional logo.
    const broken = await createPage();
    await broken.context.route(/tv-brands\/toyota\.png/, route => route.fulfill({ status: 404, body: '' }));
    await broken.page.goto(`${base}/TV`);
    await broken.page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.equal(await broken.page.locator('.tv-brand--active img[data-tv-failed="true"]').count(), 1);
    assert.equal(await broken.page.locator('.tv-brand--active strong').innerText(), 'TOYOTA');
    summaries.push({ optionalBrandLogoFailure: 'PASS' });
    await broken.context.close(); mixedBrands = false;
  }
  // A long carousel crosses the five-minute refresh without restarting at page 0.
  {
    mixedBrands = true;
    tvConfig = { logoUrl: '', title: 'Bảng giá xe đang bán', hotlineTitle: 'Hotline',
      carIntervalSeconds: 300, hotlineIntervalSeconds: 120, syncSalesContacts: true, hotlines: [] };
    const { context, page } = await createPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const expected of [7, 9, 15, 16, 1]) {
        const reads = calls.length;
        const refreshed = page.waitForResponse(response => response.url().endsWith('/api/tv') && response.status() === 200);
        await page.clock.fastForward(300100);
        await (await refreshed).json();
        await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="tv-car-${expected}"]`).count() === 1);
        assert.equal(calls.length - reads, 6, 'only the existing five-minute refresh reads');
        const showing = await page.locator('.tv-brand--active').getAttribute('data-brand-slug');
        assert.equal(showing, expected <= 8 ? 'toyota' : expected <= 15 ? 'mercedes-benz' : 'hyundai');
        assert.equal(await page.locator('.tv-brand-summary--active').getAttribute('data-brand-slug'), showing);
      }
    }
    assert.deepEqual(errors, []);
    summaries.push({ cyclesAcrossRefresh: 'PASS', completeCycles: 2, refreshes: 10, skipsEmptyBrands: 'PASS' });
    await context.close(); mixedBrands = false; tvConfig = null;
  }
  if (!rotationOnly) {
  // Separate clocks: phones change every 5s without moving cars or fetching data.
  {
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    const reads = calls.length;
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0777262607');
    await page.clock.runFor(5000);
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0777393913');
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 1);
    await page.clock.runFor(5000);
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0777262607');
    assert.equal(calls.length, reads);
    summaries.push({ independentFiveSecondHotlines: 'PASS', salesOnly: 'PASS', noPhoneRotationAPIReads: true });
    await context.close();
  }
  // Custom header/list and both custom intervals use the saved config.
  {
    tvConfig = { logoUrl: '/upload/photo/logo-tt-gold-6981.webp', title: 'Xe đang bán tại showroom', hotlineTitle: 'Liên hệ bán hàng',
      carIntervalSeconds: 8, hotlineIntervalSeconds: 3, syncSalesContacts: false,
      hotlines: [{ name: 'A', phone: '0901234567' }, { name: 'B', phone: '+84901234568' }] };
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`); await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.match(await page.locator('.tv-heading').innerText(), /XE ĐANG BÁN TẠI SHOWROOM/);
    assert.match(await page.locator('.tv-hotline').innerText(), /Liên hệ bán hàng/);
    const reads = calls.length;
    await page.clock.runFor(3000);
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '+84901234568');
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 1);
    await page.clock.runFor(5000);
    await pumpUntil(page, async () => await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').count() === 1);
    assert.equal(calls.length, reads);
    summaries.push({ customTVConfigurationAndIntervals: 'PASS' });
    await context.close(); tvConfig = null;
  }
  {
    tvConfig = { logoUrl: '', title: 'W'.repeat(60), hotlineTitle: 'W'.repeat(24), carIntervalSeconds: 15,
      hotlineIntervalSeconds: 5, syncSalesContacts: false, hotlines: [{ name: 'Long number', phone: '+841234567890' }] };
    const { context, page } = await createPage({ width: 1366, height: 768 });
    await page.goto(`${base}/TV`); await page.locator('.tv-stage[data-ready="true"]').waitFor();
    await page.waitForTimeout(150);
    const clipped = await page.locator('.tv-heading h1, .tv-hotline > div > span, .tv-hotline__number--active').evaluateAll(nodes =>
      nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
    assert.deepEqual(clipped, [], 'long configured titles and international phones fit their fixed header/footer regions');
    summaries.push({ longConfiguredHeaderFits: 'PASS' });
    await context.close(); tvConfig = null;
  }
  // Real 15-second interval; a deliberately slow next image holds the first page.
  {
    const { context, page } = await createPage();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await context.route(/tv-car-7\.jpg/, async route => { await gate; await route.fulfill({ contentType: 'image/jpeg', body: photo }).catch(() => {}); });
    await page.goto(`${base}/TV`);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    const reads = calls.length;
    await page.waitForTimeout(16000);
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 1);
    release();
    await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').waitFor();
    assert.ok(await page.locator('.tv-board--active img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
    assert.equal(calls.length, reads, 'no API reads during page rotation');
    summaries.push({ slowNextImage: 'PASS', noRotationAPIReads: true });
    await context.close();
  }

  }
  // Accelerated five-minute wall clock, while requests and GSAP still run normally.
  {
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`);
    await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    await context.route(/missing-logo\.jpg/, route => route.fulfill({ status: 404, body: '' }));
    tvConfig = { logoUrl: 'https://cdn.toantrungxeluot.io.vn/tv-test/missing-logo.jpg', title: 'Cập nhật TV', hotlineTitle: 'Hotline mới',
      carIntervalSeconds: 15, hotlineIntervalSeconds: 2, syncSalesContacts: false, hotlines: [{ name: 'New', phone: '0901111222' }] };
    revision = 1;
    const refreshed = page.waitForResponse(response => response.url().endsWith('/api/tv') && response.status() === 200);
    await page.clock.fastForward(300100);
    assert.equal((await (await refreshed).json()).cars.length, 127);
    // During the crossfade, the incoming footer text is visible before the
    // active-class handoff. Wait for the committed summary, not that text.
    await pumpUntil(page, async () => await page.locator('.tv-brand-summary--active').getAttribute('data-brand-count') === '127');
    assert.match(await page.locator('.tv-pagination').innerText(), /127/);
    assert.equal(await page.locator('.tv-board--active [data-car-slug="tv-car-1"]').count(), 0);
    assert.match(await page.locator('.tv-board--active .tv-car__price').first().innerText(), /333/);
    await pumpUntil(page, async () => await page.locator('.tv-heading h1').innerText() === 'CẬP NHẬT TV');
    await pumpUntil(page, async () => (await page.locator('.tv-logo').getAttribute('src')).includes('logo-tt-gold-6981.webp'));
    assert.equal(await page.locator('.tv-hotline__number--active').innerText(), '0901111222');
    failure = true;
    const unavailable = page.waitForResponse(response => response.url().endsWith('/api/tv') && response.status() === 503);
    await page.clock.fastForward(300100);
    await unavailable;
    await pumpUntil(page, () => page.locator('.tv-pagination small').isVisible());
    assert.equal(await page.locator('.tv-board--active [data-tv-card]').count(), 6);
    assert.ok(await page.locator('.tv-pagination small').isVisible());
    summaries.push({ refresh: 'PASS', updatedTVConfigurationAndLogoFallback: 'PASS', failureKeepsLastGoodData: 'PASS' });
    failure = false; revision = 0; tvConfig = null;
    await context.close();
  }

  if (!rotationOnly) {
  // Reuse both animation buffers, reach the partial last page, then wrap cleanly.
  {
    inventoryLimit = 13;
    const { context, page } = await createPage();
    await page.clock.install();
    await page.goto(`${base}/TV`);
    await page.clock.runFor(1800);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    await startPositionCheck(page);
    const seen = new Set();
    for (const expected of ['tv-car-1', 'tv-car-7', 'tv-car-13', 'tv-car-1']) {
      await pumpUntil(page, async () => await page.locator(`.tv-board--active [data-car-slug="${expected}"]`).count() === 1);
      for (const slug of await page.locator('.tv-board--active [data-car-slug]').evaluateAll(nodes => nodes.map(node => node.dataset.carSlug))) seen.add(slug);
      await page.waitForTimeout(100);
      await page.clock.runFor(16500);
    }
    assert.equal(seen.size, 13);
    summaries.push({ completeCycleIncludingPartialLastPage: 'PASS', stableSlots: await finishPositionCheck(page) });
    await context.close();
    inventoryLimit = 0;
    const empty = await createPage();
    await empty.page.goto(`${base}/TV`);
    await empty.page.locator('.tv-empty').waitFor();
    assert.match(await empty.page.locator('.tv-pagination').innerText(), /0 xe/);
    assert.equal(await empty.page.locator('.tv-board--active [data-tv-card]').count(), 0);
    summaries.push({ emptyInventory: 'PASS' });
    await empty.context.close();
    inventoryLimit = 128;
  }

  {
    const { context, page } = await createPage(undefined, { reducedMotion: 'reduce' });
    await context.route(/tv-car-2\.jpg/, route => route.fulfill({ status: 404, body: '' }));
    await page.goto(`${base}/TV`);
    await page.locator('.tv-stage[data-ready="true"]').waitFor();
    assert.equal(await page.locator('.tv-board--active img[data-tv-failed="true"]').count(), 1);
    await page.waitForTimeout(15500);
    await page.locator('.tv-board--active [data-car-slug="tv-car-7"]').waitFor();
    summaries.push({ missingImage: 'PASS', reducedMotionRotation: 'PASS' });
    await page.goto(`${base}/ve-chung-toi`);
    await page.locator('.wap_header').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.tv-screen').count(), 0);
    assert.equal(await page.locator('link[rel="stylesheet"][href="/assets/css/style.css"]').count(), 1);
    summaries.push({ normalWebsiteLayout: 'PASS' });
    await context.close();
  }
  }
  }
  await writeFile(`${artifactDir}/${marqueeOnly ? 'marquee-results' : anniversaryOnly ? 'anniversary-results' : themeOnly ? 'theme-results' : rotationOnly ? 'rotation-results' : headerOnly ? 'header-results' : process.argv.includes('--smoke') ? 'smoke-results' : 'results'}.json`, JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify(summaries, null, 2));
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  server.kill();
  if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  await new Promise(resolve => api.close(resolve));
  await writeFile(`${artifactDir}/server.log`, output.join(''));
}
