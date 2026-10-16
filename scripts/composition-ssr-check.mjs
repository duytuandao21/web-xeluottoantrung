// Deterministic public HTTP fixture for golden SSR output and failure semantics.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { chromium } from 'playwright';
const mode = process.argv[2] || 'verify';
const resultTag = process.env.GOLDEN_RESULT_TAG || mode;
if (!/^[a-z0-9-]{1,40}$/.test(resultTag)) throw Error('Invalid result tag');
const suite = process.env.GOLDEN_ARTIFACT_SUITE || 'perf-composition-local-2026-10-15';
if (!/^[a-z0-9-]{1,80}$/.test(suite)) throw Error('Invalid artifact suite');
const serviceCheck = ['perf-dom-local-2026-10-16', 'perf-dom-ab-local-2026-10-16'].includes(suite);
const output = resolve('../docs/artifacts', suite, 'html');
await mkdir(output, { recursive: true });
const homeGroups = ['thiet-lap-nut-goi', 'thiet-lap-chinh-sach-dieu-kien', 'thiet-lap-mang-xa-hoi', 'thiet-lap-ung-dung', 'thiet-lap-quy-trinh-ban-xe', 'thiet-lap-cac-buoc-mua-xe', 'thiet-lap-cac-buoc-ban-xe', 'thiet-lap-cac-buoc-len-doi', 'thiet-lap-banner-dong-xe'];
let revision = 1, failedGroup, failStatus = 503, bundleUnavailable = false, scenario = 'populated';
const reads = [];
const car = () => ({ slug: 'golden-toyota', name: 'Golden Toyota Vios 2025', year: 2025, price: revision === 1 ? 433000000 : 423000000,
  originalPrice: 450000000, mileage: 20000, status: 'active', newArrival: false, fuel: 'Xang', transmission: 'Automatic', cover: '/images/logo.png',
  brand: { name: 'Toyota', slug: 'toyota' }, model: { name: 'Vios', slug: 'vios' } });
const cms = group => serviceCheck && scenario === 'empty' && group.startsWith('thiet-lap-cac-buoc-') ? [] : [{ id: group, key: group === 'thiet-lap-chinh-sach-dieu-kien' ? 'chinh-sach-quyen-rieng-tu' : 'first',
  title: `Golden ${group} ${revision}`, body: '<p>Golden content <strong>kept</strong></p>', imageUrl: '/images/logo.png',
  link: '/san-pham', phone: '0000000000', sortOrder: 0 }, ...(serviceCheck && group.startsWith('thiet-lap-cac-buoc-') ? [
    { id: `${group}-2`, title: 'A & B <title> "quoted"', body: '<p>Detail <a href="/san-pham">link</a><img src="/images/logo.png" alt="body image"><script>unsafe()</script></p>', imageUrl: null },
    { id: `${group}-3`, title: 'Third step', body: null, imageUrl: '/images/logo.png' },
  ] : [])];
const pageResult = data => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 } });
const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture.test'), path = url.pathname;
  reads.push({ path, group: url.searchParams.get('group') });
  let status = 200, data = pageResult([]), retryAfter;
  if (path === '/api/v1/content/home') {
    if (bundleUnavailable) { status = 404; data = {}; }
    else data = { groups: Object.fromEntries(homeGroups.map(group => [group, group === failedGroup
      ? { ok: false, status: failStatus, retryAfterSeconds: 60 } : { ok: true, data: cms(group) }])) };
  } else if (path === '/api/v1/content') {
    const group = url.searchParams.get('group');
    if (group === failedGroup) { status = failStatus; data = {}; retryAfter = '60'; }
    else data = cms(group);
  } else if (path === '/api/v1/cars') data = pageResult([car()]);
  else if (path === '/api/v1/brands') data = [{ id: 'golden-brand', name: 'Toyota', slug: 'toyota', stockCount: 1 }];
  else if (path.startsWith('/api/v1/site-settings/')) data = [{ key: path.endsWith('thiet-lap-thong-tin') ? 'site_name' : 'logo', value: 'Golden Toan Trung' }];
  else if (path === '/api/v1/seo') data = { metaTitle: `Golden SEO ${revision}`, metaDescription: 'Golden description', canonicalUrl: 'https://example.test/', robotsIndex: true, robotsFollow: true };
  else if (path === '/api/v1/slides') data = pageResult([{ id: 'golden-slide', title: 'Golden slide', imageUrl: '/images/xe-moi-ve-banner.png', link: '/san-pham' }]);
  else if (path === '/api/v1/testimonials') data = pageResult([{ id: 'golden-testimonial', name: 'Golden customer', content: 'Golden experience', rating: 5 }]);
  else if (path === '/api/v1/articles') data = pageResult([{ slug: 'golden-news', title: 'Golden news', content: '<p>News.</p>', status: 'published', imageUrl: '/images/logo.png' }]);
  else if (path === '/api/v1/accessories') data = pageResult([{ id: 'golden-accessory', name: 'Golden accessory', brand: 'Golden', price: revision * 1000000, imageUrl: '/images/logo.png', imageUrls: [] }]);
  response.writeHead(status, { 'Content-Type': 'application/json', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) });
  response.end(JSON.stringify(data));
});
const listen = server => new Promise(done => server.listen(0, '127.0.0.1', done));
let child, browser;
const normalize = html => {
  const $ = load(html);
  // Next transport/chunk IDs may change between builds. Keep all business DOM,
  // metadata, image hints, CSS links, scripts with structured business data.
  $('script').each((_, element) => { const node = $(element); if (node.attr('type') !== 'application/ld+json') node.remove(); });
  $('link[as="script"]').remove();
  // Next 15 may stream metadata into an S:/B: transport boundary or emit it in
  // head depending on timing. Compare EVERY metadata/resource-hint node by value;
  // preserve stylesheet cascade order and all business body markup exactly.
  const metadata = $('title,meta,link[rel="canonical"],link[rel="icon"]').toArray().map(node => $.html(node)).sort();
  const hints = $('link[rel="preload"]').toArray().map(node => $.html(node)).sort();
  $('title,meta,link[rel="canonical"],link[rel="icon"],link[rel="preload"]').remove();
  $('template[id^="B:"]').remove();
  $('[hidden][id^="S:"]').each((_, element) => { if (!$(element).children().length && !$(element).text()) $(element).remove(); });
  return JSON.stringify({ metadata, hints, html: $.html().replace(/<!--(?:\$\??|\/\$|\$!| )-->/g, '').replace(/\snonce="[^"]*"/g, '') }, null, 2);
};
try {
  await listen(api); const reservation = createServer(); await listen(reservation); const port = reservation.address().port; await new Promise(done => reservation.close(done));
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}`,
      HOME_CMS_COMPOSITION: serviceCheck || mode === 'capture' || mode === 'verify-off' ? 'false' : 'true', PERF_DIAGNOSTICS: 'false' },
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) { try { const r = await fetch(base + '/'); if (r.ok) { await r.text(); break; } } catch {} if (i > 180 || child.exitCode !== null) throw Error('Next startup failed'); await new Promise(done => setTimeout(done, 250)); }
  let goldenCases = 0;
  for (const fixtureCase of serviceCheck ? ['populated', 'empty'] : ['populated']) {
  scenario = fixtureCase;
  for (const [index, route] of ['/', '/san-pham', '/ban-xe', '/len-doi'].entries()) {
    const suffix = serviceCheck ? `${fixtureCase}-${index}` : String(index);
    const before = reads.length, response = await fetch(base + route), html = await response.text();
    assert.equal(response.status, 200); assert(html.includes('Golden Toyota') || index >= 2);
    const value = normalize(html), name = `${index}.html`;
    if (mode === 'capture') await writeFile(resolve(output, `baseline-${suffix}.snapshot.json`), value);
    else {
      let expected;
      try { expected = await readFile(resolve(output, `baseline-${suffix}.snapshot.json`), 'utf8'); }
      catch (error) { if (serviceCheck) throw error; expected = normalize(await readFile(resolve(output, name), 'utf8')); await writeFile(resolve(output, `baseline-${suffix}.snapshot.json`), expected); }
      await writeFile(resolve(output, `${resultTag === 'rollback' ? 'rollback' : 'candidate'}-${suffix}.snapshot.json`), value);
      assert(value === expected, `Business HTML/SEO differs: ${route}`);
    }
    const actual = reads.slice(before);
    if (route === '/') {
      const optimized = !serviceCheck && mode !== 'capture' && mode !== 'verify-off';
      assert.equal(actual.filter(r => r.path === '/api/v1/content/home').length, optimized ? 1 : 0);
      assert.equal(actual.filter(r => r.path === '/api/v1/content').length, optimized ? 0 : 9);
      assert.equal(actual.length, optimized ? 17 : 25);
    } else assert.equal(actual.filter(r => r.path === '/api/v1/content/home').length, 0, 'No composition overfetch on other pages');
    goldenCases++;
  }
  }
  scenario = 'populated';
  if (serviceCheck || !['capture', 'verify-off'].includes(mode)) {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const browserPage = await browser.newPage();
    await browserPage.route('**/*', route => {
      const url = new URL(route.request().url());
      if (route.request().headers()['next-router-prefetch']) return route.abort();
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
    });
    if (serviceCheck) {
      for (const fixtureCase of ['populated', 'empty']) {
      scenario = fixtureCase;
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        await browserPage.setViewportSize(viewport);
        await browserPage.emulateMedia({ reducedMotion: 'reduce' });
        await browserPage.goto(base + '/', { waitUntil: 'networkidle' });
        const tabs = browserPage.locator('.tt-home-services .cap1 [role="tab"]');
        const panels = browserPage.locator('.tt-home-services > .dichvu');
        assert.equal(await tabs.count(), 3); assert.equal(await panels.count(), 3);
        for (let index = 0; index < 3; index++) {
          await tabs.nth(index).click();
          assert.equal(await tabs.nth(index).getAttribute('aria-selected'), 'true');
          assert.equal(await panels.nth(index).evaluate(node => node.hidden), false);
          assert.equal(await panels.nth(index).locator('.tt-home-service-step').count(), fixtureCase === 'empty' ? 0 : 3);
          if (fixtureCase === 'empty') assert((await panels.nth(index).innerText()).includes('Nội dung đang được cập nhật.'));
          assert.equal(await panels.nth(index).locator('script').count(), 0);
          for (let other = 0; other < 3; other++) if (other !== index) assert.equal(await panels.nth(other).evaluate(node => node.hidden), true);
          assert.equal(await panels.nth(index).locator('.xemtatca a').getAttribute('href'), ['/san-pham', '/ban-xe', '/len-doi'][index]);
        }
        await tabs.nth(2).press('Home');
        assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
        await tabs.nth(0).press('ArrowRight');
        assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
        await tabs.nth(1).press('End');
        assert.equal(await tabs.nth(2).getAttribute('aria-selected'), 'true');
      }
      }
      scenario = 'populated';
    }
    revision = 2;
    const updated = await (await fetch(base + '/')).text();
    assert(updated.includes('423') && updated.includes('Golden SEO 2') && updated.includes('Golden thiet-lap-cac-buoc-mua-xe 2'), 'New request sees updated price, SEO and CMS');
    if (serviceCheck) assert.equal(load(updated)('.car-card-price').text().trim(), '423 Triệu', 'Exact displayed live car price after mutation');
    for (const status of [429, 503]) {
      failStatus = status; failedGroup = 'thiet-lap-mang-xa-hoi';
      const before = reads.length, optional = await (await fetch(base + '/')).text();
      assert(optional.includes('Golden Toyota') && !optional.includes('Tạm thời chưa tải được dữ liệu'));
      assert.equal(reads.slice(before).filter(r => r.path === '/api/v1/content').length, serviceCheck ? 9 : 0, 'Long Retry-After never replays successful groups');
      for (const requiredGroup of serviceCheck ? ['thiet-lap-chinh-sach-dieu-kien', 'thiet-lap-cac-buoc-ban-xe'] : ['thiet-lap-chinh-sach-dieu-kien']) {
      failedGroup = requiredGroup;
      await browserPage.goto(base + '/', { waitUntil: 'networkidle' });
      const alert = browserPage.locator('main[role="alert"]'); await alert.waitFor();
      const required = await browserPage.locator('body').innerText();
      assert(required.includes('Tạm thời chưa tải được dữ liệu') && !/Có\s*0\s*xe|Application error/.test(required));
      assert(await browserPage.locator('.wap_header').count());
      }
    }
    failedGroup = undefined;
    await browserPage.getByRole('button', { name: 'Thử lại' }).click();
    await browserPage.getByText('Golden Toyota Vios 2025').first().waitFor();
    assert.equal(await browserPage.locator('main[role="alert"]').count(), 0);
    bundleUnavailable = true;
    const legacy = await (await fetch(base + '/')).text();
    assert(legacy.includes('Golden Toyota') && legacy.includes('Golden SEO 2'), 'Old API 404 fallback preserves rolling deployment');
  }
  const result = { passed: true, mode, goldenCases, serviceInteractions: serviceCheck ? 'populated/empty desktop/mobile click + keyboard' : undefined,
    expectedHomeGets: serviceCheck || mode === 'capture' || mode === 'verify-off' ? 25 : 17 };
  if (serviceCheck) await writeFile(resolve(output, `${resultTag}-result.json`), JSON.stringify({ ...result, time: new Date().toISOString(),
    buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), newRequestSeesUpdatedPriceSeoCms: true,
    failureStatuses: [429, 503], requiredFailureGroups: ['policy', 'selling-steps'], optionalFailureGroup: 'social', resetRecovers: true }, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser?.close(); child?.kill(); await new Promise(done => api.close(done)); }
