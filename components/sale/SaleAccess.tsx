"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PageResult, PublicCar } from '@/lib/public-api';
import SaleLogoutConfirmation from './SaleLogoutConfirmation';

const saleEmailDomain = 'sales.xeluottoantrung.com';
let authClient: SupabaseClient | null = null;
function client() {
  if (!authClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Chưa cấu hình Supabase cho trang web.');
    authClient = createClient(url, key);
  }
  return authClient;
}

type SaleContextValue = {
  openLogin: () => void;
  authorized: boolean;
  username: string;
  plateFor: (slug: string) => string | undefined;
  searchCars: (query: URLSearchParams, signal: AbortSignal) => Promise<PageResult<PublicCar>>;
  register: (slug: string) => void;
  requestSignOut: () => void;
};
const SaleContext = createContext<SaleContextValue | null>(null);
export function useSaleAccess() { return useContext(SaleContext); }

export function SaleAccessProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  const [requested, setRequested] = useState<string[]>([]);
  const [plates, setPlates] = useState<Record<string, string>>({});
  const currentToken = useRef('');
  const signingOut = useRef(false);
  const recheckAccess = useRef<() => void>(() => {});

  useEffect(() => {
    if (open && !window.matchMedia('(max-width: 767px), (pointer: coarse)').matches) {
      usernameInput.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;
    let live = true, revision = 0, restoring = false;
    let removeListeners = () => {};
    try {
      const auth = client();
      const applyToken = (next: string) => {
        if (!live || next === currentToken.current) return;
        currentToken.current = next;
        setAuthorized(false); setPlates({});
        setToken(next);
      };
      // INITIAL_SESSION already restores persisted login. Reading getSession in
      // parallel used to race this notification and undo a successful check.
      subscription = auth.auth.onAuthStateChange((event, session) => {
        revision++;
        if (signingOut.current && event !== 'SIGNED_OUT') return;
        const next = event === 'SIGNED_OUT' ? '' : session?.access_token || '';
        const unchanged = next && next === currentToken.current;
        applyToken(next);
        if (unchanged && event !== 'INITIAL_SESSION') recheckAccess.current();
      }).data.subscription;
      const restore = () => {
        if (!live || restoring || signingOut.current) return;
        restoring = true;
        const startedAt = revision;
        void auth.auth.getSession().then(({ data, error: sessionError }) => {
          if (!live || signingOut.current) return;
          // A newer auth event takes precedence over an older session read.
          if (startedAt !== revision) return;
          if (!sessionError) applyToken(data.session?.access_token || '');
          recheckAccess.current();
        }).catch(() => { if (live && !signingOut.current) recheckAccess.current(); })
          .finally(() => { restoring = false; });
      };
      const visible = () => { if (document.visibilityState === 'visible') restore(); };
      const restored = (event: PageTransitionEvent) => { if (event.persisted) restore(); };
      window.addEventListener('visibilitychange', visible);
      window.addEventListener('pageshow', restored);
      window.addEventListener('popstate', restore);
      window.addEventListener('online', restore);
      removeListeners = () => {
        window.removeEventListener('visibilitychange', visible);
        window.removeEventListener('pageshow', restored);
        window.removeEventListener('popstate', restore);
        window.removeEventListener('online', restore);
      };
    } catch { /* Login dialog shows the configuration error. */ }
    return () => { live = false; revision++; removeListeners(); subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!token) { setAuthorized(false); return; }
    const controller = new AbortController();
    let checking = false, retryNotBefore = 0;
    const current = () => !controller.signal.aborted && currentToken.current === token && !signingOut.current;
    const pause = (delay: number) => new Promise<void>(resolve => {
      if (controller.signal.aborted) { resolve(); return; }
      const finish = () => { window.clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
      const timer = window.setTimeout(finish, delay);
      controller.signal.addEventListener('abort', finish, { once: true });
    });
    const check = async () => {
      if (!current() || checking || Date.now() < retryNotBefore) return;
      checking = true;
      let message = 'Tạm thời chưa kiểm tra được quyền sale. Vui lòng thử lại khi kết nối ổn định.';
      try {
        for (let attempt = 0; attempt < 3 && current(); attempt++) {
          const request = new AbortController();
          const abort = () => request.abort();
          controller.signal.addEventListener('abort', abort, { once: true });
          const timeout = window.setTimeout(abort, 5000);
          let response: Response | undefined;
          try {
            response = await fetch('/api/v1/sale/cars/license-plates', {
              headers: { Authorization: `Bearer ${token}` }, signal: request.signal, cache: 'no-store',
            });
          } catch { /* Network failures/timeouts share the bounded retry budget. */ }
          finally { window.clearTimeout(timeout); controller.signal.removeEventListener('abort', abort); }
          if (!current()) return;
          if (response?.ok) { retryNotBefore = 0; setAuthorized(true); setError(''); setOpen(false); return; }
          if (response?.status === 401 || response?.status === 403) {
            message = 'Tài khoản này chưa được cấp quyền nhân viên sale hoặc phiên đăng nhập đã hết hạn.';
            break;
          }
          if (response && ![429, 502, 503, 504].includes(response.status)) break;
          const header = response?.headers.get('Retry-After');
          const retryAfter = header ? (/^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
          const delay = Math.max(350 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter : 0);
          retryNotBefore = Date.now() + Math.max(0, Number.isFinite(retryAfter) ? retryAfter : 0);
          // Do not retry early if the server requests a longer pause. A later
          // foreground/online event can recheck after this deadline.
          if (attempt === 2 || delay > 5000) break;
          await pause(delay);
        }
        if (current()) { setAuthorized(false); setPlates({}); setError(message); }
      } finally { checking = false; }
    };
    const recheck = () => { void check(); };
    recheckAccess.current = recheck;
    recheck();
    return () => {
      controller.abort();
      if (recheckAccess.current === recheck) recheckAccess.current = () => {};
    };
  }, [token]);

  useEffect(() => {
    if (!authorized || !token || requested.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const batches = Array.from({ length: Math.ceil(requested.length / 50) }, (_, index) => requested.slice(index * 50, (index + 1) * 50));
      void Promise.all(batches.map(async batch => {
        const slugs = batch.map(encodeURIComponent).join(',');
        const response = await fetch(`/api/v1/sale/cars/license-plates?slugs=${slugs}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted && currentToken.current === token) { setAuthorized(false); setPlates({}); }
        }
        if (!response.ok) throw new Error('Không thể tải biển số xe');
        return response.json() as Promise<Record<string, string>>;
      })).then(results => { if (!controller.signal.aborted && currentToken.current === token) setPlates(Object.assign({}, ...results)); })
        .catch(() => { /* Keep plates hidden if access changes or the request fails. */ });
    }, 80);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authorized, token, requested]);

  const register = useCallback((slug: string) => {
    setRequested(current => current.includes(slug) ? current : [...current, slug]);
  }, []);
  const searchCars = useCallback(async (query: URLSearchParams, signal: AbortSignal): Promise<PageResult<PublicCar>> => {
    if (!authorized || !token) throw new Error('Bạn cần đăng nhập bằng tài khoản sale.');
    const response = await fetch(`/api/v1/sale/cars?${query}`, {
      headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) {
      if (!signal.aborted && currentToken.current === token) { setAuthorized(false); setPlates({}); }
    }
    if (!response.ok) throw new Error('Không thể tìm xe theo biển số. Vui lòng thử lại.');
    return response.json() as Promise<PageResult<PublicCar>>;
  }, [authorized, token]);
  const signOut = useCallback(async () => {
    signingOut.current = true; currentToken.current = '';
    setAuthorized(false); setToken(''); setPlates({}); setUsername('');
    try { await client().auth.signOut(); }
    finally { signingOut.current = false; }
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const name = username.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(name)) throw new Error('Tên đăng nhập cần 3–32 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');
      const { error: signInError } = await client().auth.signInWithPassword({ email: `${name}@${saleEmailDomain}`, password });
      if (signInError) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng.');
      setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập.'); }
    finally { setBusy(false); }
  };
  const context = useMemo<SaleContextValue>(() => ({ openLogin: () => { setError(''); setOpen(true); }, authorized, username,
    plateFor: slug => plates[slug], searchCars, register, requestSignOut: () => setLogoutOpen(true) }), [authorized, username, plates, searchCars, register]);

  return <SaleContext.Provider value={context}>
    {children}
    {logoutOpen && <SaleLogoutConfirmation onCancel={() => setLogoutOpen(false)} onConfirm={async () => { await signOut(); setLogoutOpen(false); }} />}
    {open && <div className="sale-login-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="sale-login-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-login-title">
        <button className="sale-login-close" type="button" onClick={() => setOpen(false)} aria-label="Đóng">×</button>
        <h2 id="sale-login-title">Đăng nhập</h2>
        <p>Nhân viên sale đăng nhập</p>
        <form data-skip-legacy-submit onSubmit={event => void submit(event)}>
          <label>Tên đăng nhập<input ref={usernameInput} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
          <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          {error && <div className="sale-login-error" role="alert">{error}</div>}
          <button type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        </form>
      </section>
    </div>}
  </SaleContext.Provider>;
}

export function SaleLoginButton({ onAction }: { onAction?: () => void } = {}) {
  const sale = useSaleAccess();
  if (!sale) return null;
  return <button type="button" className={`sale-header-button${sale.authorized ? ' is-authenticated' : ''}`}
    aria-label={sale.authorized ? 'Đăng xuất' : 'Đăng nhập'} title={sale.authorized ? 'Đăng xuất nhân viên sale' : 'Đăng nhập'}
    onClick={() => { onAction?.(); if (sale.authorized) sale.requestSignOut(); else sale.openLogin(); }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="8.4" r="3.7" />
      <path d="M5.6 19.6c.6-3.7 2.9-5.8 6.4-5.8s5.8 2.1 6.4 5.8" />
    </svg>
  </button>;
}

function formatLicensePlate(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[\s.-]/g, '');
  const parts = /^([0-9]{2}[A-Z])([0-9]{3})([0-9]{2})$/.exec(compact);
  return parts ? `${parts[1]}-${parts[2]}.${parts[3]}` : value.trim();
}

export function SalePlate({ slug }: { slug: string }) {
  const sale = useSaleAccess();
  const register = sale?.register;
  useEffect(() => { register?.(slug); }, [register, slug]);
  const plate = sale?.authorized ? sale.plateFor(slug) : undefined;
  if (!plate) return null;
  return <div className="car-license-plate"><span className="car-license-plate__label">Biển số xe</span><strong className="car-license-plate__value">{formatLicensePlate(plate)}</strong></div>;
}
