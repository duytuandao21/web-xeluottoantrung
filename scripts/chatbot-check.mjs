import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const browser = process.env.CHAT_TEST_BROWSER === 'webkit'
  ? await webkit.launch({ headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true });
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const markdown = '# ABS là gì?\n\n**ABS** giúp *chống bó cứng* bánh xe.\n\n- Giữ khả năng đánh lái\n- Hỗ trợ phanh\n\n1. Kiểm tra đèn báo\n2. Đọc hướng dẫn\n\n| Hạng mục | Deluxe | Premium | Ghi chú |\n| --- | --- | --- | --- |\n| Trang bị | Tham khảo | Tham khảo | Tùy đời xe và thị trường |\n\n[Xem nguồn](https://toyota.com.vn/) và `ABS`.\n\n<script>window.chatXss=true</script>\n\n[Không an toàn](javascript:alert(1))';
try {
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ width }) => {
      if (window.top !== window) return;
      const viewport = Object.assign(new EventTarget(), { offsetLeft: 0, offsetTop: 0, width, height: 900 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      window.setChatTestViewport = value => { Object.assign(viewport, value); viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')); };
    }, { width });
    let scenario = 'normal'; let sent = 0;
    await page.route('**/api/v1/chat', async route => {
      const payload = route.request().postDataJSON();
      assert.deepEqual(Object.keys(payload).sort(), ['history', 'message']);
      assert(payload.history.length <= 16);
      assert(payload.history.reduce((sum, item) => sum + item.content.length, 0) <= 20000);
      assert(payload.history.every((item, i) => item.role === (i % 2 ? 'assistant' : 'user')));
      sent++;
      if (scenario === 'rate') return route.fulfill({ status: 429, json: { message: 'raw internal error' } });
      if (scenario === 'network') return route.abort('failed');
      if (scenario === 'quota') return route.fulfill({ status: 503, json: { code: 'AI_RATE_LIMIT', message: 'provider quota and secret' } });
      if (scenario === 'stream-quota') return route.fulfill({ contentType: 'text/event-stream', body: event('error', { code: 'AI_RATE_LIMIT', message: 'provider quota and secret' }) });
      if (scenario === 'interrupted') return route.fulfill({ contentType: 'text/event-stream', body: event('content', { text: 'Chưa hoàn tất...' }) });
      if (scenario === 'timeout') return route.fulfill({ contentType: 'text/event-stream', body: event('error', { code: 'AI_TIMEOUT', message: 'internal timeout' }) });
      return route.fulfill({ contentType: 'text/event-stream', body: event('content', { text: markdown.slice(0, 30) }) + event('content', { text: markdown.slice(30) })
        + event('sources', { sources: [{ title: 'Toyota Việt Nam', url: 'https://toyota.com.vn/' }, { title: 'Unsafe', url: 'javascript:alert(1)' }], searchEntryPoint: '<div>Google Search</div><script>parent.chatXss=true</script>' }) + event('done', { truncated: false }) });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const launcher = page.getByRole('button', { name: 'Mở trợ lý AI', exact: true });
    await launcher.waitFor();
    assert.equal(await page.locator('#tt-chat-panel').count(), 0);
    const before = await page.locator('.wapper').boundingBox();
    const rect = await launcher.boundingBox();
    assert(rect.width >= 44 && rect.height >= 44 && rect.x + rect.width <= width && rect.y >= 0);
    const phone = page.locator('.btn-phone');
    if (await phone.isVisible()) {
      const box = await phone.boundingBox();
      assert(rect.y + rect.height <= box.y - 12, 'Launcher is above the existing call button');
      const halo = await phone.locator('.kenit-alo-circle-fill').evaluate(el => el.offsetWidth);
      assert(Math.abs(rect.width - halo) <= 1 && Math.abs(rect.height - halo) <= 1, 'Launcher matches the visible contact ring');
      assert(Math.abs(rect.x + rect.width / 2 - (box.x + box.width / 2)) <= 1, 'Contact button centers align horizontally');
      const zalo = await page.locator('.btn-zalo').boundingBox();
      assert(Math.abs(box.y + box.height / 2 - (rect.y + rect.height / 2) - (zalo.y + zalo.height / 2 - (box.y + box.height / 2))) <= 1, 'All three buttons have equal spacing');
    }
    if (width === 390) await page.evaluate(() => window.scrollTo(0, 1200));
    const savedScrollY = await page.evaluate(() => window.scrollY);
    await launcher.click();
    const panel = page.locator('#tt-chat-panel');
    await panel.waitFor();
    assert.equal(await panel.locator('.tt-chat-suggestions button').count(), 4);
    const checkBounds = async (top = 0, height = 900, viewportWidth = width) => {
      await page.waitForFunction(({ top, height, width }) => {
        const panel = document.querySelector('#tt-chat-panel'); const input = document.querySelector('#tt-chat-input');
        const box = panel.getBoundingClientRect(); const composer = input.getBoundingClientRect();
        return box.left >= 0 && box.right <= width + 1 && box.top >= top && box.bottom <= top + height + 1 && composer.bottom <= top + height;
      }, { top, height, width: viewportWidth });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    };
    await checkBounds();
    const input = page.locator('#tt-chat-input');
    assert.equal(await input.evaluate(el => document.activeElement === el), false, 'Opening the chat never summons the keyboard');
    if (width < 768) {
      await page.evaluate(() => {
        window.chatInputFocusCalls = []; window.chatInputTouchEnds = [];
        const focus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function (options) {
          if (this.id === 'tt-chat-input') window.chatInputFocusCalls.push(options?.preventScroll === true);
          return focus.call(this, options);
        };
        document.addEventListener('touchend', event => {
          if (event.target.id === 'tt-chat-input') window.chatInputTouchEnds.push(event.defaultPrevented);
        });
      });
      // Directly tapping an empty composer must use the same non-scrolling focus
      // path as the working suggestion buttons, before native focus can pan Safari.
      await input.tap();
      assert.deepEqual(await page.evaluate(() => window.chatInputFocusCalls), [true], 'Direct touch focuses synchronously with preventScroll');
      assert.equal(await page.evaluate(() => window.chatInputTouchEnds.at(-1)), true, 'Initial touch cancels native scrolling focus');
      assert.equal(await input.inputValue(), '');
      assert.equal(await input.evaluate(el => document.activeElement === el), true);
      await page.evaluate(() => window.setChatTestViewport({ height: 410, offsetTop: 65 }));
      await checkBounds(65, 410);
      await input.fill('Draft to preserve');
      await input.tap();
      assert.deepEqual(await page.evaluate(() => window.chatInputFocusCalls), [true], 'Already focused input retains native caret placement');
      assert.equal(await page.evaluate(() => window.chatInputTouchEnds.at(-1)), false);
      await input.evaluate(el => el.blur());
      await page.evaluate(() => window.setChatTestViewport({ height: 900, offsetTop: 0 }));
      await checkBounds();
      await input.tap();
      assert.deepEqual(await page.evaluate(() => window.chatInputFocusCalls), [true, true], 'Touch after dismissing the keyboard also prevents focus scrolling');
      assert.equal(await input.inputValue(), 'Draft to preserve');
      await input.evaluate(el => el.blur());
      await input.fill('');
      await input.evaluate(el => el.blur());
    }
    if (width >= 768) {
      const box = await panel.boundingBox();
      assert(box.x + box.width <= rect.x - 12, 'Desktop panel opens to the left of the launcher');
      assert(box.height >= 630, 'Desktop panel uses full available height');
      await page.evaluate(() => window.setChatTestViewport({ height: 440 }));
      await checkBounds(0, 440);
      assert((await panel.boundingBox()).height >= 400, 'Short desktop viewport keeps the entire frame');
      // Some mobile browsers expose a wider layout viewport than the visible one.
      await page.evaluate(() => window.setChatTestViewport({ width: 390, height: 410, offsetTop: 65 }));
      await checkBounds(65, 410, 390);
      assert.equal(await panel.getAttribute('aria-modal'), 'true');
      assert.equal(await input.evaluate(el => document.activeElement === el), false);
      await page.evaluate(width => window.setChatTestViewport({ width, height: 900, offsetTop: 0 }), width);
      await checkBounds();
    }
    assert.equal(await panel.getByRole('button', { name: 'Gửi câu hỏi' }).isEnabled(), false);
    await panel.locator('.tt-chat-suggestions button').nth(1).click();
    assert((await input.inputValue()).includes('ABS'));
    if (width < 768) {
      await page.evaluate(() => window.setChatTestViewport({ height: 410, offsetTop: 65 }));
      await checkBounds(65, 410);
      // Native keyboard panning can shift a fixed layer after its last viewport event.
      await page.evaluate(() => new Promise(resolve => setTimeout(() => {
        document.querySelector('.tt-chat-layer').style.transform = 'translateY(-140px)'; resolve();
      }, 100)));
      await checkBounds(65, 410);
      assert.equal(await input.evaluate(el => document.activeElement === el), true, 'Keyboard positioning keeps input focus');
      if (width === 390) {
        // Safari can pan again while typing, long after the keyboard's opening animation.
        await page.waitForTimeout(1600);
        await page.evaluate(() => {
          document.querySelector('.tt-chat-layer').style.transform = 'translateY(-220px)';
          window.scrollTo(0, 1450);
        });
        await checkBounds(65, 410);
        assert.equal(await input.evaluate(el => document.activeElement === el), true);
      }
      await input.fill('Đang nhập khi bàn phím mở');
      await input.press('Enter');
      assert((await input.inputValue()).includes('\n'), 'Mobile Enter adds a new line');
      await checkBounds(65, 410);
      if (width === 390) await page.screenshot({ path: join(tmpdir(), 'chatbot-390-keyboard.png') });
      await page.evaluate(() => window.setChatTestViewport({ height: 230, offsetTop: 110 }));
      await input.fill(Array(8).fill('Nhập câu hỏi nhiều dòng').join('\n'));
      await checkBounds(110, 230);
      assert((await input.boundingBox()).height <= 72, 'Compact keyboard view caps composer height');
      assert.equal(await panel.locator('.tt-chat-header>button').isVisible(), true);
      await input.fill('ABS là gì?');
      await page.evaluate(() => window.setChatTestViewport({ height: 900, offsetTop: 0 }));
      await page.evaluate(() => new Promise(resolve => setTimeout(() => {
        document.querySelector('.tt-chat-layer').style.removeProperty('transform'); resolve();
      }, 100)));
      await checkBounds();
    }
    await panel.getByRole('button', { name: 'Gửi câu hỏi' }).click();
    await panel.locator('.tt-chat-markdown table').waitFor();
    await page.waitForFunction(() => document.querySelector('#tt-chat-panel [role="status"]')?.textContent === 'Trợ lý AI đã phản hồi');
    assert.equal(await panel.locator('.tt-chat-sources a').count(), 1);
    assert.equal(await panel.locator('.tt-chat-sources a').getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await panel.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.chatXss === true), false);
    assert.equal(await panel.locator('iframe').getAttribute('sandbox'), 'allow-popups allow-popups-to-escape-sandbox');
    assert(await panel.locator('.tt-chat-table').evaluate(el => el.scrollWidth >= el.clientWidth));
    if (width === 320) {
      const gestures = await page.evaluate(() => {
        const swipe = (node, dx, dy) => {
          const dispatch = (type, x, y) => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] });
            node.dispatchEvent(event); return event.defaultPrevented;
          };
          dispatch('touchstart', 100, 100); return dispatch('touchmove', 100 + dx, 100 + dy);
        };
        const table = document.querySelector('.tt-chat-table');
        return {
          backgroundBlocked: swipe(document.querySelector('.wapper'), 0, -40),
          tableOverflows: table.scrollWidth > table.clientWidth,
          tableBlocked: swipe(table.querySelector('td'), -40, 0),
          inputBlocked: swipe(document.querySelector('#tt-chat-input'), -40, 0),
        };
      });
      assert.equal(gestures.backgroundBlocked, true, 'Background touch scrolling is locked');
      assert.equal(gestures.tableOverflows, true, 'Narrow screen needs horizontal table scrolling');
      assert.equal(gestures.tableBlocked, false, 'Wide tables retain horizontal swipe');
      assert.equal(gestures.inputBlocked, false, 'Composer retains native caret selection');
    }
    await checkBounds();
    if (width === 390 || width === 1440) await page.screenshot({ path: join(tmpdir(), `chatbot-${width}.png`) });
    if (width === 1440) {
      await input.fill('Dòng đầu'); await input.press('Shift+Enter'); await input.press('a'); assert((await input.inputValue()).includes('\n'));
      await input.fill('Câu tiếp theo'); await input.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('.tt-chat-message').length === 4);
      await page.waitForFunction(() => document.querySelector('#tt-chat-panel [role="status"]')?.textContent === 'Trợ lý AI đã phản hồi');
      for (const name of ['quota', 'stream-quota', 'rate', 'network', 'timeout', 'interrupted']) {
        scenario = name; await input.fill(`Kiểm tra ${name}`); await panel.getByRole('button', { name: 'Gửi câu hỏi' }).click();
        const error = panel.locator('.tt-chat-error').last(); await error.waitFor();
        const text = await error.textContent(); assert(!text.includes('raw internal') && !text.includes('secret') && !text.includes('internal timeout'));
        if (name === 'rate') assert(text.includes('khá nhiều'));
        if (name === 'quota' || name === 'stream-quota') assert(text.includes('giới hạn sử dụng'));
        if (name === 'interrupted') assert(text.includes('gián đoạn'));
        const count = await panel.locator('.tt-chat-message').count();
        scenario = 'normal'; await error.getByRole('button', { name: 'Thử lại' }).click();
        await page.waitForFunction(() => !document.querySelector('.tt-chat-error'));
        await page.waitForFunction(() => document.querySelector('#tt-chat-panel [role="status"]')?.textContent === 'Trợ lý AI đã phản hồi');
        assert.equal(await panel.locator('.tt-chat-message').count(), count, 'Retry replaces the failed turn');
      }
      for (let index = 0; index < 5; index++) {
        await input.fill(`Câu hỏi ${index}`); await panel.getByRole('button', { name: 'Gửi câu hỏi' }).click();
        await page.waitForFunction(() => document.querySelector('#tt-chat-panel [role="status"]')?.textContent === 'Trợ lý AI đã phản hồi');
      }
      assert.equal(await panel.locator('.tt-chat-message').count(), 20);
    }
    await panel.getByRole('button', { name: 'Đóng trợ lý AI' }).click();
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    assert.deepEqual(await page.evaluate(() => ['overscroll-behavior-x', 'overscroll-behavior-y'].map(key => document.documentElement.style.getPropertyValue(key))), ['', '']);
    assert(Math.abs(await page.evaluate(() => window.scrollY) - savedScrollY) <= 1, 'Closing restores the page position before chat');
    assert.equal(await page.locator('.wapper').evaluate(el => Math.round(el.getBoundingClientRect().width)), Math.round(before.width));
    await launcher.click(); await panel.waitFor(); assert((await panel.locator('.tt-chat-message').count()) >= 2);
    await panel.getByRole('button', { name: 'Đóng trợ lý AI' }).click();
    assert(sent > 0); assert.deepEqual(errors, []);
    console.log(`PASS chatbot at ${width}px: left panel, contact button size, composer, Markdown/table, sources, keyboard viewport, close/reopen`);
    await page.close();
  }
} finally { await browser.close(); }
