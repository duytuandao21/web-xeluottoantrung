// Compile API tests first. Run with a temporary Next server at NEEDS_TEST_URL (default :3003).
// Actual UI + actual API use isolated in-memory PostgreSQL only; no network DB writes.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const apiRoot = resolve('../api-xeluottoantrung'), requireApi = createRequire(resolve(apiRoot, 'package.json'));
requireApi('reflect-metadata');
const { PGlite } = requireApi('@electric-sql/pglite'), { drizzle } = requireApi('drizzle-orm/pglite'), { eq } = requireApi('drizzle-orm');
const { Global, Module, ValidationPipe } = requireApi('@nestjs/common'), { NestFactory } = requireApi('@nestjs/core'), { FastifyAdapter } = requireApi('@nestjs/platform-fastify');
const load = file => import(pathToFileURL(resolve(apiRoot, '.test-dist', file)).href);
const schema = await load('src/database/schema/index.js'), { DatabaseService } = await load('src/database/database.service.js');
const { CarRecommendationsModule } = await load('src/modules/car-recommendations/module.js'), { seedCarRecommendations } = await load('src/database/seed/car-recommendations.js');
const pg = new PGlite(); let app, browser;
try {
  for (const file of (await readdir(resolve(apiRoot, 'drizzle'))).filter(file => file.endsWith('.sql')).sort()) await pg.exec((await readFile(resolve(apiRoot, 'drizzle', file), 'utf8')).replaceAll('--> statement-breakpoint', ''));
  const db = drizzle(pg, { schema }); await seedCarRecommendations(db);
  const [brand] = await db.insert(schema.brands).values({ name: 'Toyota', slug: 'toyota' }).returning();
  const [model] = await db.insert(schema.carModels).values({ brandId: brand.id, name: 'Vios', slug: 'vios' }).returning();
  const cars = await db.insert(schema.cars).values(Array.from({ length: 14 }, (_, i) => ({ brandId: brand.id, modelId: model.id, name: `Toyota Vios ${i + 1}`, slug: `xe-ui-${i + 1}`, year: 2023, price: 300000000 + i * 10000000, seatCount: 5, mileage: 40000, fuel: 'Xăng', status: 'active', publishedAt: new Date() }))).returning();
  class FixtureModule {}
  Global()(FixtureModule); Module({ imports: [CarRecommendationsModule], providers: [{ provide: DatabaseService, useValue: { db } }], exports: [DatabaseService] })(FixtureModule);
  app = await NestFactory.create(FixtureModule, new FastifyAdapter(), { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // Optional isolated HTTP fixture for server-rendered SEO/CMS shells. This never connects to the live DB.
  if (process.env.NEEDS_FIXTURE_PORT) {
    app.getHttpAdapter().getInstance().get('/api/v1/*', (request, reply) => {
      const path = new URL(request.url, 'http://fixture.test').pathname.replace('/api/v1', '');
      if (path === '/seo' || path.startsWith('/pages/') || path.startsWith('/car-recommendations/')) return reply.code(404).send({ message: 'Fixture: no record' });
      if (path.startsWith('/site-settings/') || path === '/content' || path === '/brands' || /\/brands\/[^/]+\/models$/.test(path)) return reply.send([]);
      return reply.send({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } });
    });
  }
  await app.init(); await app.getHttpAdapter().getInstance().ready();
  if (process.env.NEEDS_FIXTURE_PORT) await app.listen(Number(process.env.NEEDS_FIXTURE_PORT), '127.0.0.1');
  const server = app.getHttpAdapter().getInstance(), url = process.env.NEEDS_TEST_URL || 'http://127.0.0.1:3003';
  await mkdir('artifacts/car-recommendations-check', { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of process.env.NEEDS_TEST_WIDTHS ? process.env.NEEDS_TEST_WIDTHS.split(',').map(Number) : [1440, 768, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, locale: 'vi-VN', reducedMotion: width === 1440 ? 'no-preference' : 'reduce' });
    // Test fallback for mobile access via HTTP LAN IP, where randomUUID is unavailable.
    await context.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined }); });
    const page = await context.newPage(), errors = [], submits = [], moreRequests = []; let failOnce = width === 1440, failMoreOnce = width === 1440, offline = false;
    page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(25000);
    await page.route('**/api/v1/car-recommendations/**', async route => {
      const request = route.request(), path = new URL(request.url()), payload = request.postData();
      if (offline && path.pathname.endsWith('/config')) return route.abort('failed');
      if (path.pathname.endsWith('/sessions')) {
        submits.push(JSON.parse(payload));
        if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { message: 'Fixture network failure' } }); }
      }
      if (path.pathname.endsWith('/results')) {
        moreRequests.push(JSON.parse(payload));
        if (failMoreOnce) { failMoreOnce = false; return route.fulfill({ status: 503, json: { message: 'Fixture page failure' } }); }
      }
      const response = await server.inject({ method: request.method(), url: path.pathname + path.search, ...(payload ? { payload } : {}), headers: { 'content-type': 'application/json' } });
      await route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
    });
    await page.route('**/xe-ui-*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Fixture detail destination</h1>' }));
    const root = page.locator('.tt-needs-page'), next = () => root.getByRole('button', { name: 'Tiếp tục', exact: true }), back = () => root.getByRole('button', { name: 'Quay lại', exact: true });
    const intro = () => root.getByRole('button', { name: 'Bắt đầu tìm xe', exact: true });
    const finish = async (max = 500000000) => {
      if (await intro().count()) await intro().click();
      await root.getByRole('button', { name: 'Đưa đón gia đình', exact: false }).click(); await next().click();
      await root.locator('input[name="budget-min"]').fill('0'); await root.locator('input[name="budget-max"]').fill(String(max)); await next().click();
      await root.getByRole('button', { name: '3 – 5 người', exact: true }).click(); await next().click();
      await root.getByRole('button', { name: 'Trong đô thị', exact: true }).click(); await next().click();
      await root.getByRole('button', { name: 'An toàn', exact: true }).click(); await next().click();
      await root.getByRole('button', { name: 'Bỏ qua', exact: true }).click();
      await root.getByRole('checkbox').check(); await root.getByRole('button', { name: 'Xem xe phù hợp', exact: true }).click();
      await root.getByRole('heading', { name: max === 1 ? 'Chưa có xe phù hợp trong kho' : 'Xe phù hợp với nhu cầu của bạn', exact: true }).waitFor();
    };
    await page.goto(`${url}/tien-ich/mua-xe-theo-nhu-cau`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await root.getByRole('button', { name: 'Bắt đầu tìm xe' }).click();
    assert.equal(await root.locator('.tt-needs-question').evaluate(el => getComputedStyle(el).animationName), width === 1440 ? 'tt-needs-next' : 'none');
    assert.equal(await root.getByText('Trả lời vài câu để tìm xe đang có tại Toàn Trung.', { exact: true }).count(), 0);
    // The shared legacy stylesheet forces img max-width:100% !important; the icon must override it.
    const icon = await root.locator('.tt-needs-hero__icon').evaluate(el => {
      const image = el.querySelector('img'), frame = el.getBoundingClientRect(), rect = image.getBoundingClientRect();
      // Visible artwork bounds in the existing transparent 1254px PNG.
      return { maxWidth: getComputedStyle(image).maxWidth, inside: rect.left + 218 / 1254 * rect.width >= frame.left && rect.right - (1254 - 1084) / 1254 * rect.width <= frame.right && rect.top + 358 / 1254 * rect.height >= frame.top && rect.bottom - (1254 - 1000) / 1254 * rect.height <= frame.bottom };
    });
    assert.equal(icon.maxWidth, 'none'); assert.equal(icon.inside, true, `Full artwork visible at ${width}`);
    await root.locator('.tt-needs-hero').screenshot({ path: `artifacts/car-recommendations-check/hero-${width}.png` });
    assert.equal(await next().isDisabled(), true);
    await root.getByRole('button', { name: 'Đưa đón gia đình', exact: false }).click();
    await root.getByRole('button', { name: 'Đi làm hằng ngày', exact: false }).click();
    assert.equal(await root.getByRole('button', { name: 'Chạy dịch vụ', exact: true }).isDisabled(), true);
    await next().click(); await root.locator('input[name="budget-max"]').fill('500000000');
    assert.equal(await root.locator('input[name="budget-max"]').inputValue(), '500.000.000');
    await root.locator('input[name="budget-min"]').fill('600000000'); assert.equal(await next().isDisabled(), true);
    await root.locator('input[name="budget-min"]').fill('200000000'); await next().click();
    await root.getByRole('button', { name: '3 – 5 người', exact: true }).click(); await root.getByRole('checkbox').check(); await back().click();
    assert.equal(await root.locator('.tt-needs-question').evaluate(el => getComputedStyle(el).animationName), width === 1440 ? 'tt-needs-back' : 'none');
    assert.equal(await root.locator('input[name="budget-max"]').inputValue(), '500.000.000'); await next().click(); assert.equal(await root.getByRole('checkbox').isChecked(), true); await next().click();
    await root.getByRole('button', { name: 'Trong đô thị', exact: true }).click(); await next().click();
    await root.getByRole('button', { name: 'An toàn', exact: true }).click(); await root.getByRole('button', { name: 'Rộng rãi', exact: true }).click(); await root.getByRole('button', { name: 'Thoải mái', exact: true }).click();
    assert.equal(await root.getByRole('button', { name: 'Giữ giá', exact: true }).isDisabled(), true);
    await root.getByRole('button', { name: 'Tăng ưu tiên Rộng rãi', exact: true }).click(); assert.match(await root.locator('.tt-needs-priority-order li').first().innerText(), /1\. Rộng rãi/); await next().click();
    await root.locator('#tt-needs-brand').selectOption('toyota'); await root.getByRole('checkbox', { name: 'Bắt buộc', exact: true }).check();
    await page.screenshot({ path: `artifacts/car-recommendations-check/technical-${width}.png`, fullPage: true });
    await root.getByRole('button', { name: 'Bỏ qua', exact: true }).click();
    assert.equal(await root.getByRole('button', { name: 'Xem xe phù hợp', exact: true }).isDisabled(), true);
    await root.getByRole('checkbox').check(); await root.getByRole('button', { name: 'Xem xe phù hợp', exact: true }).click();
    if (width === 1440) { await root.getByRole('button', { name: 'Thử gửi lại', exact: true }).click(); assert.equal(submits[0].requestId, submits[1].requestId); assert.equal(submits[0].capability, submits[1].capability); }
    await root.locator('.tt-needs-result-card').first().waitFor(); assert.equal(await root.locator('.tt-needs-result-card').count(), 6);
    await page.waitForFunction(() => document.activeElement?.id === 'tt-needs-results-title');
    assert.equal(await root.locator('.tt-needs-caveat,.tt-needs-coverage,.tt-needs-card-actions').count(), 0);
    assert.equal(await root.getByText(/Mức độ phù hợp là điểm xếp hạng/).count(), 0);
    assert.equal(await root.locator('.tt-needs-results__actions').getByRole('button').count(), 1);
    assert.equal(await root.locator('.tt-needs-results__actions').getByRole('link').count(), 1);
    const firstIds = await root.locator('.tt-needs-car').evaluateAll(els => els.map(el => el.dataset.carId));
    await root.getByRole('button', { name: 'Xem thêm', exact: true }).click();
    if (width === 1440) {
      await root.locator('.car-load-more').getByRole('button', { name: 'Thử lại', exact: true }).click();
      assert.deepEqual(moreRequests[0], moreRequests[1], 'Retry uses the same authenticated cursor');
    }
    await page.waitForFunction(() => document.querySelectorAll('.tt-needs-result-card').length === 12);
    await root.getByRole('button', { name: 'Xem thêm', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tt-needs-result-card').length === 14);
    assert.equal(await root.getByRole('button', { name: 'Xem thêm', exact: true }).count(), 0);
    const allIds = await root.locator('.tt-needs-car').evaluateAll(els => els.map(el => el.dataset.carId));
    assert.deepEqual(allIds.slice(0, 6), firstIds); assert.equal(new Set(allIds).size, 14);
    assert.equal(submits.at(-1).answers.technical.brand, undefined, 'Skipping technical clears preferences'); assert.deepEqual(submits.at(-1).answers.priorities, ['space', 'safety', 'comfort']);
    const overflow = await root.evaluate(el => el.scrollWidth > el.clientWidth + 2); assert.equal(overflow, false, `No horizontal overflow at ${width}`);
    await page.screenshot({ path: `artifacts/car-recommendations-check/results-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('tt-car-needs-survey')), null);
    const [original] = await db.select().from(schema.recommendationSessions).where(eq(schema.recommendationSessions.requestId, submits.at(-1).requestId));
    await root.getByRole('button', { name: 'Làm lại khảo sát', exact: true }).click(); await next().waitFor();
    assert.equal(await root.locator('.tt-needs-option[aria-pressed=true]').count(), 0);
    await page.waitForTimeout(250);
    const events = await db.select().from(schema.recommendationEvents).where(eq(schema.recommendationEvents.sessionId, original.id));
    assert.deepEqual(events.map(e => e.type).sort(), ['quiz_restarted', 'result_viewed']);
    await finish();
    const [clicked] = await db.select().from(schema.recommendationSessions).where(eq(schema.recommendationSessions.requestId, submits.at(-1).requestId));
    await root.locator('.tt-needs-result-card').first().locator('.name_sp a').click(); await page.waitForURL('**/xe-ui-*'); await page.goBack({ waitUntil: 'domcontentloaded' }); await intro().waitFor();
    assert.equal(await root.locator('.tt-needs-result-card').count(), 0, 'Back from car detail starts fresh');
    assert.ok((await db.select().from(schema.recommendationEvents).where(eq(schema.recommendationEvents.sessionId, clicked.id))).some(e => e.type === 'car_clicked'));
    if (width === 1440) {
      await finish(); await root.locator('.tt-needs-result-card__score').first().click(); await page.waitForURL('**/xe-ui-*'); await page.goBack({ waitUntil: 'domcontentloaded' }); await intro().waitFor();
    }
    await finish();
    const before = (await db.select().from(schema.recommendationSessions)).length, requestCount = submits.length;
    await page.reload({ waitUntil: 'domcontentloaded' }); await intro().waitFor();
    assert.equal(submits.length, requestCount); assert.equal((await db.select().from(schema.recommendationSessions)).length, before, 'Reload clears progress without auto-submitting');
    await intro().click(); await root.getByRole('button', { name: 'Đưa đón gia đình', exact: false }).click(); await next().click();
    await root.locator('input[name="budget-max"]').fill('123456789');
    await page.locator('.site-breadcrumb a').first().click(); await page.waitForURL(`${url}/`);
    await page.goBack({ waitUntil: 'domcontentloaded' }); await intro().waitFor();
    await intro().click(); assert.equal(await root.locator('.tt-needs-option[aria-pressed=true]').count(), 0);
    await root.getByRole('button', { name: 'Đưa đón gia đình', exact: false }).click(); await next().click();
    assert.equal(await root.locator('input[name="budget-max"]').inputValue(), '500.000.000', 'Internal navigation clears edited budget');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await intro().waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('tt-car-needs-survey')), null);
    await finish(1);
    await root.getByRole('heading', { name: 'Chưa có xe phù hợp trong kho', exact: true }).waitFor(); assert.equal(await root.locator('.tt-needs-result-card').count(), 0);
    offline = true; await page.reload({ waitUntil: 'domcontentloaded' }); await root.getByRole('heading', { name: 'Chưa thể tải khảo sát' }).waitFor(); offline = false; await root.getByRole('button', { name: 'Thử lại', exact: true }).click(); await intro().waitFor();
    assert.deepEqual(errors, [], `No runtime errors at ${width}`); console.log({ width, checks: 'animation/back/skip/priority/budget/consent/retry/pages-6-12-14/refresh-reset/internal-navigation-reset/history-back-reset/bfcache-reset/cards/events/empty/offline', sessions: before }); await context.close();
  }
  // Admin-configured question order/limits/hiding/additions and stale open quiz.
  {
    const settings = (await db.select().from(schema.recommendationSettings))[0], config = structuredClone(settings.config);
    config.questions.find(q => q.key === 'technical').enabled = false;
    config.questions.find(q => q.key === 'style').enabled = false;
    config.questions.find(q => q.key === 'purposes').maxSelections = 1;
    config.questions.find(q => q.key === 'priorities').maxSelections = 2;
    config.questions.sort((a, b) => Number(b.key === 'budget') - Number(a.key === 'budget'));
    config.questions.push({ key: 'custom_advice', title: 'Bạn cần tư vấn thêm?', description: '', helpText: '', type: 'single', required: true, enabled: true, maxSelections: 1, options: [{ key: 'yes', label: 'Cần tư vấn' }] });
    await db.update(schema.recommendationSettings).set({ config, updatedAt: new Date() });
    const context = await browser.newContext({ viewport: { width: 390, height: 850 } }), page = await context.newPage(), submits = [];
    await page.addInitScript(() => sessionStorage.setItem('tt-car-needs-survey', JSON.stringify({ answers: { purposes: ['family', 'commute'], budget: { min: 0, max: 500000000 }, passengers: '3_5', requireSeats: false, environment: 'city', priorities: ['space', 'safety', 'comfort'], technical: { brand: 'toyota', required: ['brand'] }, style: 'sporty', extras: { custom_removed: 'old' } }, step: 6, startedAt: Date.now(), noticeAccepted: true })));
    await page.route('**/api/v1/car-recommendations/**', async route => {
      const r = route.request(), u = new URL(r.url()); if (u.pathname.endsWith('/sessions')) submits.push(JSON.parse(r.postData()));
      const response = await server.inject({ method: r.method(), url: u.pathname + u.search, ...(r.postData() ? { payload: r.postData() } : {}), headers: { 'content-type': 'application/json' } });
      await route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
    });
    await page.goto(`${url}/tien-ich/mua-xe-theo-nhu-cau`, { waitUntil: 'domcontentloaded' });
    const root = page.locator('.tt-needs-page'); await root.getByRole('button', { name: 'Bắt đầu tìm xe', exact: true }).click();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('tt-car-needs-survey')), null, 'Legacy saved progress is removed and ignored');
    const next = () => root.getByRole('button', { name: 'Tiếp tục', exact: true });
    await next().click();
    await root.getByRole('button', { name: 'Đưa đón gia đình', exact: false }).click();
    assert.equal(await root.getByRole('button', { name: 'Đi làm hằng ngày', exact: true }).isDisabled(), true); await next().click();
    await root.getByRole('button', { name: '3 – 5 người', exact: true }).click(); await next().click();
    await root.getByRole('button', { name: 'Trong đô thị', exact: true }).click(); await next().click();
    await root.getByRole('button', { name: 'Rộng rãi', exact: true }).click(); await root.getByRole('button', { name: 'An toàn', exact: true }).click();
    assert.equal(await root.getByRole('button', { name: 'Thoải mái', exact: true }).isDisabled(), true); await next().click();
    await root.getByRole('button', { name: 'Cần tư vấn', exact: true }).click();
    await root.getByRole('checkbox').check();
    const newer = structuredClone(config); newer.questions[0].title = 'Ngân sách đã cập nhật';
    await db.update(schema.recommendationSettings).set({ config: newer, updatedAt: new Date(Date.now() + 1000) });
    await root.getByRole('button', { name: 'Xem xe phù hợp', exact: true }).click();
    await root.getByText('Bộ câu hỏi đã được cập nhật. Vui lòng tải lại khảo sát và kiểm tra câu trả lời.', { exact: true }).waitFor();
    assert.equal(submits.length, 1); assert.deepEqual(submits[0].answers.purposes, ['family']); assert.deepEqual(submits[0].answers.priorities, ['space', 'safety']); assert.deepEqual(submits[0].answers.technical, { required: [] }); assert.equal(submits[0].answers.style, ''); assert.deepEqual(submits[0].answers.extras, { custom_advice: 'yes' });
    await root.getByRole('button', { name: 'Tải lại khảo sát', exact: true }).click(); await root.getByRole('heading', { name: 'Ngân sách đã cập nhật', exact: true }).waitFor();
    for (let i = 0; i < 5; i++) await root.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await root.getByRole('button', { name: 'Xem xe phù hợp', exact: true }).click(); await root.locator('.tt-needs-result-card').first().waitFor();
    assert.equal(submits.length, 2); assert.notEqual(submits[0].requestId, submits[1].requestId);
    await context.close(); await db.update(schema.recommendationSettings).set({ config: settings.config, updatedAt: new Date() });
    console.log({ adminConfigCompatibility: 'PASS: changed order, smaller limits, hidden optional fields, added required question, removed answers, stale config conflict and reload' });
  }
  // Existing public route shells still render; no API process is started by this test.
  const page = await browser.newPage();
  for (const path of ['/', '/san-pham', '/ban-xe', '/len-doi', '/tien-ich/xem-ngay-mua-xe', '/tien-ich/dinh-gia-xe']) {
    const response = await page.goto(`${url}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); assert.equal(response.status(), 200, path); console.log({ existingRoute: path, status: 200 });
  }
  console.log({ passed: true, cars: cars.length, history: (await db.select().from(schema.recommendationSessions)).length, leads: (await db.select().from(schema.leads)).length });
} finally { await browser?.close(); await app?.close(); await pg.close(); }
