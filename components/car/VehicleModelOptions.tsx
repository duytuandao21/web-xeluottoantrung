'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicLookup } from '@/lib/public-api';

export type VehicleModelOptionsProps = {
  brandSlug: string; models: PublicLookup[]; href: string; error: boolean;
};
type State = VehicleModelOptionsProps & { loading: boolean };
type BrandChange = { brandSlug: string; href: string };
const catalogs = new Map<string, { models: PublicLookup[]; expiresAt: number }>();
function remember(brand: string, models: PublicLookup[]) {
  if (!brand) return;
  catalogs.delete(brand);
  catalogs.set(brand, { models, expiresAt: Date.now() + 60_000 });
  if (catalogs.size > 32) catalogs.delete(catalogs.keys().next().value!);
}

export default function VehicleModelOptions(initial: VehicleModelOptionsProps) {
  const router = useRouter(), initialRef = useRef(initial);
  initialRef.current = initial;
  const [state, setState] = useState<State>({ ...initial, loading: false });
  const sequence = useRef(0), abort = useRef<AbortController | null>(null);
  const requestedBrand = useRef<string | null>(null);
  const loadRef = useRef<(change: BrandChange, force?: boolean) => void>(() => {});

  useEffect(() => {
    // An older navigation must not replace a more recent brand choice.
    if (requestedBrand.current !== null && initial.brandSlug !== requestedBrand.current) return;
    requestedBrand.current = null;
    sequence.current++;
    abort.current?.abort();
    if (!initial.error) remember(initial.brandSlug, initial.models);
    setState({ ...initial, loading: false });
  }, [initial.brandSlug, initial.models, initial.href, initial.error]);

  useEffect(() => {
    const load = (change: BrandChange, force = false) => {
      const requestId = ++sequence.current;
      abort.current?.abort();
      requestedBrand.current = change.brandSlug;
      const cached = catalogs.get(change.brandSlug);
      if (!change.brandSlug || !force && cached && Date.now() < cached.expiresAt) {
        setState({ ...change, models: cached?.models || [], loading: false, error: false });
        return;
      }
      const controller = new AbortController();
      abort.current = controller;
      setState({ ...change, models: [], loading: true, error: false });
      void fetch(`/api/catalog/models?brand=${encodeURIComponent(change.brandSlug)}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
      }).then(async response => {
        if (!response.ok) throw new Error('MODEL_LOAD_FAILED');
        const result = await response.json() as { models: PublicLookup[] };
        if (!Array.isArray(result.models)) throw new Error('INVALID_MODELS');
        if (requestId !== sequence.current) return;
        remember(change.brandSlug, result.models);
        setState({ ...change, models: result.models, loading: false, error: false });
        if (force && initialRef.current.error && initialRef.current.brandSlug === change.brandSlug) router.refresh();
      }).catch(() => {
        if (requestId === sequence.current && !controller.signal.aborted) {
          setState({ ...change, models: [], loading: false, error: true });
        }
      });
    };
    loadRef.current = load;
    const change = (event: Event) => load((event as CustomEvent<BrandChange>).detail);
    window.addEventListener('tt:vehicle-brand-change', change);
    return () => {
      sequence.current++;
      abort.current?.abort();
      window.removeEventListener('tt:vehicle-brand-change', change);
    };
  }, [router]);

  if (!state.brandSlug) return null;
  const params = new URLSearchParams(state.href.split('?')[1] || '');
  const selected = params.get('dong-xe');
  const hrefFor = (model: string | null) => {
    const query = new URLSearchParams(params);
    if (selected !== model) {
      if (model) query.set('dong-xe', model); else query.delete('dong-xe');
      query.delete('phien-ban');
      const year = query.get('nam-san-xuat')?.split('-');
      if (year?.length === 2 && year[0] && year[0] === year[1]) query.delete('nam-san-xuat');
    }
    query.delete('page');
    return `/san-pham${query.size ? `?${query}` : ''}`;
  };
  const choices = [{ name: 'Tất cả', slug: '' }, ...state.models];
  return <section className="vehicle-filter-row" data-vehicle-row="models" data-model-brand={state.brandSlug}
    data-updating={state.brandSlug !== initial.brandSlug} aria-labelledby="vehicle-row-models-title" aria-busy={state.loading}>
    <h2 className="vehicle-filter-row__title" id="vehicle-row-models-title">Dòng xe</h2>
    {state.loading ? <div className="vehicle-model-status" role="status"><span className="vehicle-model-spinner" aria-hidden="true" />Đang tải dòng xe…</div>
      : state.error ? <div className="vehicle-model-status" role="status">Chưa tải được dòng xe.<button type="button" onClick={() => loadRef.current(state, true)}>Thử lại</button></div>
        : <div className="vehicle-filter-options">{choices.map(model => {
          const active = (selected || '') === model.slug;
          return <a key={model.slug} href={hrefFor(model.slug || null)} data-filter-link="true" aria-current={active ? 'true' : 'false'} className={active ? 'is-selected' : undefined}>{model.name}</a>;
        })}{!state.models.length && <span className="vehicle-model-empty">Chưa có dòng xe trong danh mục.</span>}</div>}
  </section>;
}
