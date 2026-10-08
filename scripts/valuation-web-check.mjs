// Run from web root after compiling API tests:
// cd ../api-xeluottoantrung; npx tsc -p tsconfig.test.json
// cd ../web-xeluottoantrung; VALUATION_TEST_URL=http://localhost:3003 node scripts/valuation-web-check.mjs
// Synthetic prices are confined to in-memory PGlite. No network DB writes.
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
const { ValuationModule } = await load('src/modules/valuation/valuation.module.js'), { ValuationAdminService } = await load('src/modules/valuation/valuation.service.js');
const { seedValuation } = await load('src/database/seed/valuation.js'), { fixtureId, valuationFixture } = await load('test/valuation-fixture.js');
const pg = new PGlite(); let app, browser;
try {
  for (const file of (await readdir(resolve(apiRoot, 'drizzle'))).filter(file => file.endsWith('.sql')).sort()) await pg.exec((await readFile(resolve(apiRoot, 'drizzle', file), 'utf8')).replaceAll('--> statement-breakpoint', ''));
  const db = drizzle(pg, { schema }), { policyId } = await seedValuation(db), { input, snapshot } = valuationFixture();
  input.modelYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date())) - 3;
  const [profile] = await db.insert(schema.profiles).values({ authUserId: fixtureId(300), fullName: 'Public form fixture' }).returning();
  await db.insert(schema.brands).values([{ id: input.brandId, name: 'Toyota', slug: 'toyota' }, { id: fixtureId(301), name: 'Ford', slug: 'ford' }]);
  await db.insert(schema.carModels).values([{ id: input.modelId, brandId: input.brandId, name: 'Fortuner', slug: 'fortuner' }, { id: fixtureId(302), brandId: fixtureId(301), name: 'Ranger', slug: 'ranger' }]);
  await db.insert(schema.carVersions).values([{ id: input.variantId, modelId: input.modelId, name: '2.8L AT 4WD phiên bản có tên dài để kiểm tra hiển thị', slug: 'fortuner-at' }, { id: fixtureId(303), modelId: fixtureId(302), name: 'Wildtrak', slug: 'wildtrak' }]);
  await db.insert(schema.carColors).values({ id: input.colorId, name: 'Trắng', slug: 'white' });
  await db.insert(schema.valuationReferencePrices).values([
    { ...snapshot.references[0], policyId, modelYear: input.modelYear },
    { ...snapshot.references[0], id: fixtureId(201), policyId, modelYear: input.modelYear - 1 },
    { ...snapshot.references[0], id: fixtureId(202), policyId, variantId: fixtureId(303), modelYear: input.modelYear },
  ]);
  class FixtureModule {}
  Global()(FixtureModule); Module({ imports: [ValuationModule], providers: [{ provide: DatabaseService, useValue: { db } }], exports: [DatabaseService] })(FixtureModule);
  app = await NestFactory.create(FixtureModule, new FastifyAdapter(), { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init(); await app.getHttpAdapter().getInstance().ready();
  const actor = { actorProfileId: profile.id, ipAddress: '127.0.0.1', userAgent: 'Phase 3 isolated test', requestId: 'phase-3' };
  const admin = app.get(ValuationAdminService), validated = await admin.validate(policyId, { expectedRevision: 1, reason: 'Validate synthetic UI fixture' }, actor);
  assert.equal(validated.report.passed, true, JSON.stringify(validated.report));
  await admin.publish(policyId, { expectedRevision: 1, reason: 'Publish isolated UI fixture only', confirmed: true }, actor);
  await db.update(schema.valuationSettings).set({ isEnabled: true });
  const server = app.getHttpAdapter().getInstance(), url = process.env.VALUATION_TEST_URL || 'http://localhost:3003';
  await mkdir('.next/valuation-check', { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [1440, 1024, 768, 430, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, locale: 'vi-VN', reducedMotion: width === 360 ? 'reduce' : 'no-preference' });
    const page = await context.newPage(), errors = [], requests = [], bodies = [];
    let mode = '', delayToyota = false, holdEstimate = false, holdContact = false;
    page.on('pageerror', failure => errors.push(failure.message)); page.setDefaultTimeout(20000);
    const root = page.locator('.tt-valuation-page'), next = () => root.getByRole('button', { name: 'Tiếp tục', exact: true }), back = () => root.getByRole('button', { name: 'Quay lại', exact: true });
    const field = name => root.locator(`#valuation-${name}`);
    await page.route('**/api/v1/valuation/**', async route => {
      const request = route.request(), path = new URL(request.url()), endpoint = path.pathname.split('/').at(-1);
      requests.push({ endpoint, method: request.method(), query: path.search });
      if (endpoint === 'estimate') bodies.push(JSON.parse(request.postData()));
      if (holdEstimate && endpoint === 'estimate') await new Promise(resolve => setTimeout(resolve, 800));
      if (holdContact && endpoint === 'lead') await new Promise(resolve => setTimeout(resolve, 800));
      if (mode === 'contact-503' && endpoint === 'lead') return route.fulfill({ status: 503, json: { message: 'Request failed' } });
      if ((mode === '503' || mode === '429') && endpoint === 'estimate') return route.fulfill({ status: Number(mode), json: { message: 'Request failed' } });
      if (mode === 'offline-config' && endpoint === 'config') return route.abort('failed');
      if (mode === 'empty' && endpoint === 'brands') return route.fulfill({ json: { policyVersion: '0.1.0', configurationKey: `${policyId}:1`, data: [] } });
      if (delayToyota && endpoint === 'models' && path.searchParams.get('brandId') === input.brandId) await new Promise(resolve => setTimeout(resolve, 500));
      const response = await server.inject({ method: request.method(), url: path.pathname + path.search, ...(request.postData() ? { payload: request.postData() } : {}), headers: { 'content-type': 'application/json' } });
      try { await route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body }); } catch (error) { if (!/closed|cancel|disposed/i.test(error.message)) throw error; }
    });
    await page.goto(`${url}/tien-ich/dinh-gia-xe`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await field('brandId').waitFor(); await page.waitForFunction(() => !document.querySelector('#valuation-brandId').disabled);
    assert.equal(await next().isDisabled(), true, 'Missing required vehicle disables Next');
    assert.equal(await field('modelId').isDisabled(), true);
    assert.match(await page.title(), /Định giá xe/, 'Existing admin SEO may override the default title');
    assert.match(await page.locator('link[rel="canonical"]').getAttribute('href'), /\/tien-ich\/dinh-gia-xe$/);
    assert.ok(await page.locator('meta[property="og:image"]').count());
    if (width === 1440) {
      delayToyota = true;
      await field('brandId').selectOption(input.brandId); await field('brandId').selectOption(fixtureId(301));
      await field('modelId').selectOption(fixtureId(302)); await field('variantId').selectOption(fixtureId(303));
      await new Promise(resolve => setTimeout(resolve, 600));
      assert.equal(await field('modelId').inputValue(), fixtureId(302), 'Late response must not overwrite the new brand'); delayToyota = false;
      await field('brandId').selectOption(input.brandId); assert.equal(await field('modelId').inputValue(), ''); assert.equal(await field('variantId').inputValue(), ''); assert.equal(await field('modelYear').inputValue(), '');
    } else await field('brandId').selectOption(input.brandId);
    await field('modelId').selectOption(input.modelId); await field('variantId').selectOption(input.variantId);
    await field('modelYear').selectOption(String(input.modelYear));
    await field('modelId').focus(); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'valuation-variantId', 'Keyboard advances to the next enabled select');
    assert.deepEqual(await field('modelYear').locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean)), [String(input.modelYear), String(input.modelYear - 1)]);
    assert.equal(await next().isEnabled(), true);
    await page.screenshot({ path: `.next/valuation-check/form-${width}.png`, fullPage: true });
    await next().click(); await field('odometerKm').waitFor(); assert.equal(await next().isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'valuation-step-title', 'Step focuses heading, not an input/mobile keyboard');
    for (const invalid of ['-1', '1.5', '2000001']) { await field('odometerKm').fill(invalid); assert.equal(await next().isDisabled(), true, `Invalid ODO ${invalid}`); }
    await field('odometerKm').fill('45000'); assert.equal(await field('odometerKm').inputValue(), '45.000', 'ODO formats while typing, before blur');
    const odoBounds = await field('odometerKm').boundingBox(), unknownBounds = await root.getByRole('checkbox', { name: 'Chưa rõ số km', exact: true }).boundingBox();
    assert(odoBounds && unknownBounds && unknownBounds.y >= odoBounds.y + odoBounds.height, 'Unknown ODO checkbox belongs below the input');
    await field('odometerKm').blur();
    await back().click(); assert.equal(await field('variantId').inputValue(), input.variantId);
    const catalogCalls = requests.length; await next().click(); assert.equal(await field('odometerKm').inputValue(), '45.000'); assert.equal(requests.length, catalogCalls, 'Returning to a step should reuse catalog data');
    await next().click(); for (const name of ['exteriorCondition', 'interiorCondition', 'accidentLevel', 'floodLevel']) await field(name).selectOption(input[name]);
    await next().click(); for (const name of ['engineCondition', 'transmissionCondition', 'serviceHistory']) await field(name).selectOption(input[name]);
    await next().click(); await field('usageType').selectOption(input.usageType); await field('ownerCount').fill('0');
    assert.equal(await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).isDisabled(), true);
    await field('ownerCount').fill('2'); await field('colorId').selectOption(input.colorId);
    if (width === 1440) {
      holdEstimate = true;
      await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).evaluate(button => { button.click(); button.click(); });
      await root.getByRole('button', { name: 'Đang tính giá tham khảo…', exact: true }).waitFor();
      assert.equal(await field('ownerCount').isDisabled(), true, 'Inputs are locked during calculation');
    } else await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).click();
    await root.getByRole('heading', { name: 'Kết quả định giá', exact: true }).waitFor();
    holdEstimate = false;
    assert.equal(bodies.length, 1, 'Double click must not create duplicate estimates'); assert.deepEqual(bodies[0], input);
    assert.match(await root.locator('.tt-valuation-price:not(.tt-valuation-price--dealer)').innerText(), /663 – 705/);
    assert.match(await root.locator('.tt-valuation-price--dealer').innerText(), /636 – 657/);
    assert.equal(await root.getByRole('meter').count(), 0);
    assert.equal(await root.locator('.tt-valuation-result__actions a').getAttribute('href'), 'tel:0777393913');
    assert.equal(await root.locator('.tt-valuation-disclaimer').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px must not overflow horizontally`);
    if (width === 360) assert.equal(await root.locator('.tt-valuation-result').evaluate(element => getComputedStyle(element).animationName), 'none', 'Reduced motion disables transitions');
    await page.screenshot({ path: `.next/valuation-check/result-${width}.png`, fullPage: true });
    if (width === 1440 || width === 390) {
      const countBefore = (await db.select().from(schema.leads)).length;
      assert.equal(await page.locator('#valuation-contact-phone').isVisible(), false, 'Contact does not gate the result');
      await root.getByRole('button', { name: 'Gửi thông tin xe', exact: true }).click();
      const contactDialog = page.getByRole('dialog', { name: 'Gửi thông tin xe', exact: true }), contactForm = contactDialog.locator('form'), sendContact = () => contactForm.getByRole('button', { name: 'Gửi thông tin', exact: true });
      await page.locator('#valuation-contact-phone').fill('123');
      assert.equal(await sendContact().isDisabled(), true); await page.locator('#valuation-contact-phone').fill('0901 234 567');
      assert.equal(await sendContact().isDisabled(), true, 'Consent is required');
      assert.equal(await page.locator('#valuation-contact-brand').inputValue(), 'Toyota'); assert.equal(await page.locator('#valuation-contact-mileage').inputValue(), '45.000 km');
      await contactForm.getByRole('checkbox').check();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `.next/valuation-check/lead-form-${width}.png`, fullPage: true });
      if (width === 1440) {
        mode = 'contact-503'; await sendContact().click(); await contactForm.getByRole('alert').waitFor(); assert.equal(await page.locator('#valuation-contact-phone').inputValue(), '0901 234 567');
        mode = ''; holdContact = true;
        await contactForm.getByRole('button', { name: 'Thử gửi lại', exact: true }).evaluate(button => { button.click(); button.click(); });
        await contactForm.getByRole('button', { name: 'Đang gửi thông tin…', exact: true }).waitFor(); assert.equal(await page.locator('#valuation-contact-phone').isDisabled(), true);
      } else await sendContact().click();
      await root.getByRole('status').filter({ hasText: 'Đã gửi thông tin xe.' }).waitFor(); holdContact = false;
      const leads = await db.select().from(schema.leads); assert.equal(leads.length, countBefore + 1); assert.equal(leads.at(-1).phone, '0901234567');
      const [record] = await db.select().from(schema.valuationRecords).where(eq(schema.valuationRecords.leadId, leads.at(-1).id));
      assert.equal(record.leadStatus, 'NEW'); assert.deepEqual(record.snapshot.input, input); assert.equal(record.snapshot.result.estimatedMarketValue, 684000000);
    }
    await root.getByRole('button', { name: 'Chỉnh sửa: Xe của bạn', exact: true }).click();
    for (let i = 0; i < 4; i++) await next().click();
    await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).click();
    await root.getByRole('heading', { name: 'Kết quả định giá', exact: true }).waitFor(); assert.equal(bodies.length, 1, 'Same answers reuse recent result instead of a duplicate POST');
    if (width === 1440 || width === 390) await root.getByRole('status').filter({ hasText: 'Đã gửi thông tin xe.' }).waitFor();
    if (width === 1440 || width === 390) {
      await root.getByRole('button', { name: 'Chỉnh sửa: Xe của bạn', exact: true }).click(); await next().click(); await next().click();
      await field('floodLevel').selectOption('HYDROLOCK'); await next().click(); await next().click();
      await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).click();
      await root.getByText('Xe cần được kiểm tra trực tiếp để xác nhận giá thu mua.', { exact: true }).waitFor();
      assert.equal(await root.locator('.tt-valuation-price > strong').count(), 0, 'Severe condition must not display a confident range');
      await page.screenshot({ path: `.next/valuation-check/inspection-${width}.png`, fullPage: true });
    }
    if (width === 1440) {
      await root.getByRole('button', { name: 'Chỉnh sửa: Xe của bạn', exact: true }).click(); await next().click(); await next().click();
      await field('floodLevel').selectOption('NONE'); await next().click(); await next().click();
      await back().click(); await back().click(); await back().click();
      await root.getByRole('checkbox', { name: 'Chưa rõ số km', exact: true }).check();
      await next().click(); await next().click(); await next().click();
      await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).click();
      await root.getByRole('heading', { name: 'Kết quả định giá', exact: true }).waitFor();
      assert.equal('odometerKm' in bodies.at(-1), false, 'Unknown ODO is omitted, not sent as zero');
      assert.equal(await root.getByRole('meter').count(), 0);
      assert.equal(await root.locator('.tt-valuation-result__details').count(), 0);
      await root.getByRole('button', { name: 'Chỉnh sửa: Xe của bạn', exact: true }).click(); await next().click();
      await root.getByRole('checkbox', { name: 'Chưa rõ số km', exact: true }).uncheck();
      await next().click(); await next().click(); await next().click();
      // Simulate a selected reference disappearing between catalog loading and
      // submission, only within this fixture. Reload the published snapshot via
      // its updatedAt key; production policy data is never changed.
      await db.update(schema.valuationReferencePrices).set({ active: false }).where(eq(schema.valuationReferencePrices.id, fixtureId(2)));
      await db.update(schema.valuationPolicies).set({ updatedAt: new Date() }).where(eq(schema.valuationPolicies.id, policyId));
      await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).click();
      await root.getByText('Cần kiểm tra xe trực tiếp', { exact: true }).first().waitFor();
      assert.equal(await root.locator('.tt-valuation-price > strong').count(), 0, 'Missing reference never becomes a zero-price range');
      await db.update(schema.valuationReferencePrices).set({ active: true }).where(eq(schema.valuationReferencePrices.id, fixtureId(2)));
      await db.update(schema.valuationPolicies).set({ updatedAt: new Date() }).where(eq(schema.valuationPolicies.id, policyId));
      await root.getByRole('button', { name: 'Chỉnh sửa: Xe của bạn', exact: true }).click();
      for (let i = 0; i < 4; i++) await next().click();
      // Change ODO so the recent-result deduplication does not bypass the API error scenario.
      await back().click(); await back().click(); await back().click(); await field('odometerKm').fill('50000');
      await field('odometerKm').blur();
      for (let index = 0; index < 3; index++) {
        await next().click();
      }
      mode = '503'; await root.getByRole('button', { name: 'Xem giá tham khảo', exact: true }).click();
      await root.getByRole('alert').filter({ hasText: 'Tiện ích chưa sẵn sàng' }).waitFor(); assert.equal(await field('ownerCount').inputValue(), '2');
      mode = '429'; await root.getByRole('button', { name: 'Thử định giá lại', exact: true }).click();
      await root.getByRole('button', { name: /Thử lại sau \d+s/ }).waitFor(); assert.equal(await root.getByRole('button', { name: /Thử lại sau \d+s/ }).isDisabled(), true);
      mode = 'offline-config'; await page.reload({ waitUntil: 'domcontentloaded' }); await root.getByRole('heading', { name: 'Chưa thể tải tiện ích' }).waitFor();
      mode = ''; await root.getByRole('button', { name: 'Thử lại', exact: true }).click(); await field('brandId').waitFor();
      mode = 'empty'; await page.reload({ waitUntil: 'domcontentloaded' }); await root.getByRole('heading', { name: 'Chưa có dữ liệu tham chiếu phù hợp' }).waitFor();
      mode = ''; await db.update(schema.valuationSettings).set({ isEnabled: false }); await page.reload({ waitUntil: 'domcontentloaded' });
      await root.getByRole('heading', { name: 'Tiện ích đang được chuẩn bị' }).waitFor(); assert.equal(await root.locator('form').count(), 0);
      await db.update(schema.valuationSettings).set({ isEnabled: true });
    }
    assert.deepEqual(errors, []); console.log(`PASS ${width}px: cascading catalog, validation, back/data preservation, live fixture estimate, result deduplication, responsive layout, metadata, keyboard, no JS errors${width === 1440 ? ', unknown ODO/missing reference/race/error/retry/disabled/429 handling' : ''}${width === 360 ? ', reduced motion' : ''}.`);
    await context.close();
  }
  assert.equal((await db.select().from(schema.leads)).length, 2, 'Only explicitly submitted contact forms create leads');
  assert.ok((await db.select().from(schema.valuationRecords)).length >= 5, 'Public estimates save history snapshots');
} finally { if (browser) await browser.close(); if (app) await app.close(); await pg.close(); }
