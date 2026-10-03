"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PageResult, PublicCar } from '@/lib/public-api';

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
  signOut: () => Promise<void>;
};
const SaleContext = createContext<SaleContextValue | null>(null);
export function useSaleAccess() { return useContext(SaleContext); }

export function SaleAccessProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState<string[]>([]);
  const [plates, setPlates] = useState<Record<string, string>>({});

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const auth = client();
      void auth.auth.getSession().then(({ data }) => setToken(data.session?.access_token || ''));
      subscription = auth.auth.onAuthStateChange((_event, session) => {
        setAuthorized(false); setPlates({});
        setToken(session?.access_token || '');
      }).data.subscription;
    } catch { /* Login dialog shows the configuration error. */ }
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) { setAuthorized(false); return; }
    const controller = new AbortController();
    void fetch('/api/v1/sale/cars/license-plates', {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? 'Tài khoản này chưa được cấp quyền nhân viên sale.' : 'Không xác thực được tài khoản sale.');
      setAuthorized(true); setError(''); setOpen(false);
    }).catch(() => { if (!controller.signal.aborted) { setAuthorized(false); setPlates({}); setError('Tài khoản này chưa được cấp quyền nhân viên sale hoặc phiên đăng nhập đã hết hạn.'); } });
    return () => controller.abort();
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
        if (!response.ok) throw new Error('Không thể tải biển số xe');
        return response.json() as Promise<Record<string, string>>;
      })).then(results => { if (!controller.signal.aborted) setPlates(Object.assign({}, ...results)); })
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
    if (!response.ok) throw new Error('Không thể tìm xe theo biển số. Vui lòng thử lại.');
    return response.json() as Promise<PageResult<PublicCar>>;
  }, [authorized, token]);
  const signOut = useCallback(async () => {
    setAuthorized(false); setToken(''); setPlates({}); setUsername('');
    await client().auth.signOut();
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
    plateFor: slug => plates[slug], searchCars, register, signOut }), [authorized, username, plates, searchCars, register, signOut]);

  return <SaleContext.Provider value={context}>
    {children}
    {open && <div className="sale-login-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="sale-login-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-login-title">
        <button className="sale-login-close" type="button" onClick={() => setOpen(false)} aria-label="Đóng">×</button>
        <h2 id="sale-login-title">Đăng nhập</h2>
        <p>Nhân viên sale đăng nhập</p>
        <form data-skip-legacy-submit onSubmit={event => void submit(event)}>
          <label>Tên đăng nhập<input autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
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
    onClick={() => { onAction?.(); if (sale.authorized) void sale.signOut(); else sale.openLogin(); }}>
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
