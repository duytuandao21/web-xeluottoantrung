import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from 'playwright';

const original = await readFile('lib/protected-form.ts', 'utf8');
const source = ts.transpileModule(original.replace(
  'const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();', 'const siteKey = undefined;'),
{ compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<form><input name="email" value="customer@example.test"><button type="submit">Send</button></form>');
  const result = await page.evaluate(async code => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const mod = await import(url);
    URL.revokeObjectURL(url);
    // about:blank has no secure-context randomUUID; production HTTPS does.
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true,
      value: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` });
    const form = document.querySelector('form');
    const calls = [];
    window.fetch = async (_path, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) throw new Error('fixture network dropped response');
      return new Response(JSON.stringify({ accepted: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const payload = { email: 'customer@example.test' };
    let networkMessage = '';
    try { await mod.submitProtectedForm(form, 'newsletter', '/newsletter-subscriptions', payload); }
    catch (error) { networkMessage = error.message; }
    const retainedEmail = form.querySelector('input').value;
    await mod.submitProtectedForm(form, 'newsletter', '/newsletter-subscriptions', payload);
    let cooldown = false;
    try { await mod.submitProtectedForm(form, 'newsletter', '/newsletter-subscriptions', payload); }
    catch (error) { cooldown = error.status === 429; }
    const secondForm = document.createElement('form');
    secondForm.innerHTML = '<input value="second@example.test"><button type="submit">Send</button>';
    document.body.append(secondForm);
    const rateCalls = [];
    window.fetch = async (_path, options) => {
      rateCalls.push(JSON.parse(options.body));
      return rateCalls.length === 1 ? new Response(JSON.stringify({ message: 'wait' }), { status: 429,
        headers: { 'Retry-After': '42', 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ accepted: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    let retryAfter = 0;
    try { await mod.submitProtectedForm(secondForm, 'callback', '/leads', { type: 'callback', phone: '0900000000' }); }
    catch (error) { retryAfter = error.retryAfter; }
    await mod.submitProtectedForm(secondForm, 'callback', '/leads', { type: 'callback', phone: '0900000000' });
    return { calls, networkMessage, retainedEmail, cooldown, retryAfter, rateCalls };
  }, source);
  assert.equal(result.calls.length, 2);
  assert.match(result.networkMessage, /kết nối/i);
  assert.equal(result.retainedEmail, 'customer@example.test');
  assert.equal(result.calls[0].submissionId, result.calls[1].submissionId, 'retry keeps the same UUID');
  assert.equal(result.cooldown, true, 'success starts a 30-second cooldown');
  assert.equal(result.retryAfter, 42);
  assert.equal(result.rateCalls[0].submissionId, result.rateCalls[1].submissionId, '429 retry keeps the same UUID');
  assert.notEqual(result.calls[0].submissionId, result.rateCalls[0].submissionId, 'a different form uses a new UUID');
  console.log('PASS protected form network retry, retained input, submissionId, 429 and cooldown');
} finally { await browser.close(); }
