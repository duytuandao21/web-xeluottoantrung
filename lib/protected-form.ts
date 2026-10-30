'use client';

export type FormAction = 'sell_car' | 'trade_in' | 'callback' | 'newsletter';
type WidgetOptions = { sitekey: string; action: FormAction; execution: 'execute'; appearance: 'interaction-only';
  callback: (token: string) => void; 'error-callback': () => void; 'expired-callback': () => void };
type Turnstile = { render: (target: HTMLElement, options: WidgetOptions) => string; execute: (id: string) => void;
  reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }

const attempts = new WeakMap<HTMLFormElement, { body: string; id: string; cooldownUntil: number }>();
const cooldowns = new Map<FormAction, number>();
const widgets = new WeakMap<HTMLFormElement, { id: string; target: HTMLElement }>();
let scriptPromise: Promise<Turnstile> | undefined;
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Không thể tải xác minh bảo mật.'));
    script.onerror = () => reject(new Error('Không thể tải xác minh bảo mật.'));
    document.head.append(script);
  }).catch(error => { scriptPromise = undefined; throw error; });
  return scriptPromise!;
}

async function tokenFor(form: HTMLFormElement, action: FormAction): Promise<string | undefined> {
  if (!siteKey) return undefined;
  const turnstile = await loadTurnstile();
  const previous = widgets.get(form);
  if (previous) { turnstile.remove(previous.id); previous.target.remove(); widgets.delete(form); }
  const target = document.createElement('div');
  target.className = 'tt-form-turnstile';
  if (form.matches('.tt-footer-news-form, .migrated-dialog #goilai .validation-contact')) form.after(target);
  else form.querySelector('button[type="submit"], input[type="submit"]')?.before(target);
  if (!target.isConnected) form.append(target);
  try { return await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Xác minh bảo mật đã hết thời gian. Vui lòng thử lại.')), 90_000);
    const finish = (value?: string, error?: Error) => {
      window.clearTimeout(timeout);
      if (error) reject(error); else resolve(value!);
    };
    try {
      const id = turnstile.render(target, { sitekey: siteKey, action, execution: 'execute', appearance: 'interaction-only',
        callback: value => finish(value),
        'error-callback': () => finish(undefined, new Error('Xác minh bảo mật thất bại. Vui lòng thử lại.')),
        'expired-callback': () => finish(undefined, new Error('Xác minh bảo mật đã hết hạn. Vui lòng thử lại.')) });
      widgets.set(form, { id, target });
      turnstile.execute(id);
    } catch { finish(undefined, new Error('Không thể xác minh bảo mật. Vui lòng thử lại.')); }
  }); } finally {
    const widget = widgets.get(form);
    if (widget?.target === target) { try { turnstile.remove(widget.id); } catch {} widgets.delete(form); }
    target.remove();
  }
}

export class FormSubmitError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: number) { super(message); }
}

export async function submitProtectedForm(form: HTMLFormElement, action: FormAction, path: '/leads' | '/newsletter-subscriptions',
  payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const prior = attempts.get(form);
  const cooldownUntil = Math.max(prior?.cooldownUntil || 0, cooldowns.get(action) || 0);
  if (cooldownUntil > Date.now())
    throw new FormSubmitError(`Vui lòng chờ ${Math.ceil((cooldownUntil - Date.now()) / 1000)} giây trước khi gửi lại.`, 429,
      Math.ceil((cooldownUntil - Date.now()) / 1000));
  const attempt = prior?.body === body ? prior : { body, id: crypto.randomUUID(), cooldownUntil: 0 };
  attempts.set(form, attempt);
  const token = await tokenFor(form, action);
  const dialog = form.closest('dialog') as HTMLDialogElement | null;
  if (!form.isConnected || dialog && !dialog.open) return;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, submissionId: attempt.id, ...(token ? { turnstileToken: token } : {}) }) });
  } catch { throw new FormSubmitError('Lỗi kết nối. Dữ liệu đã được giữ lại, vui lòng thử gửi lần nữa.', 0, 0); }
  const result = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) {
    const retryAfter = Math.max(0, Number(response.headers.get('Retry-After')) || 0);
    throw new FormSubmitError(response.status === 429 && retryAfter ? `Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ ${retryAfter} giây.` :
      result.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.', response.status, retryAfter);
  }
  const nextAllowedAt = Date.now() + 30_000;
  cooldowns.set(action, nextAllowedAt);
  attempts.set(form, { body: '', id: '', cooldownUntil: nextAllowedAt });
}
