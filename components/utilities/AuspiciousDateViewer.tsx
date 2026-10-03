'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { displayClassification, dateApi, formatDate, type DateConfig, type DetailResult, type SearchInput, type SearchResult } from '@/lib/auspicious-date';
import DateForm from './auspicious-date/DateForm';
import ResultCalendar from './auspicious-date/ResultCalendar';
import DateDetail from './auspicious-date/DateDetail';
import SearchConfirmation from './auspicious-date/SearchConfirmation';

export default function AuspiciousDateViewer() {
  const [config, setConfig] = useState<DateConfig | null>(null), [configError, setConfigError] = useState(''), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<SearchResult | null>(null), [query, setQuery] = useState<SearchInput | null>(null);
  const [detail, setDetail] = useState<DetailResult | null>(null), [detailBusy, setDetailBusy] = useState(false), [detailError, setDetailError] = useState(''), [selected, setSelected] = useState('');
  const [pendingQuery, setPendingQuery] = useState<SearchInput | null>(null);
  const generation = useRef(0), mounted = useRef(true), resultsRef = useRef<HTMLElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    dateApi<DateConfig>('config', undefined, abort.signal).then(value => { setConfig(value); setConfigError(''); }).catch(failure => { if (!abort.signal.aborted) setConfigError(failure instanceof Error ? failure.message : 'Không thể tải tiện ích.'); });
    return () => abort.abort();
  }, [reload]);
  useEffect(() => {
    if (!result) return;
    // Scroll after React has mounted the calendar and the confirmation has closed.
    const frame = requestAnimationFrame(() => {
      const element = resultsRef.current;
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);
  const search = async (input: SearchInput) => {
    if (busy) return; const current = ++generation.current;
    setBusy(true); setError(''); setResult(null); setDetail(null); setSelected(''); setDetailError(''); setDetailBusy(false); setQuery(input);
    try {
      const data = await dateApi<SearchResult>('search', input);
      if (!mounted.current || current !== generation.current) return;
      setResult(data);
    } catch (failure) { if (mounted.current && current === generation.current) setError(failure instanceof Error ? failure.message : 'Không thể tra cứu.'); }
    finally { if (mounted.current && current === generation.current) setBusy(false); }
  };
  const selectDate = async (date: string) => {
    if (!query || !result || detailBusy) return;
    const current = generation.current;
    setSelected(date); setDetailBusy(true); setDetailError(''); setDetail(null);
    try {
      const value = await dateApi<DetailResult>('detail', { birthDate: query.birthDate, purpose: query.purpose, ...(query.gender ? { gender: query.gender } : {}), targetDate: date, expectedRulesetVersion: result.rulesetVersion });
      if (!mounted.current || current !== generation.current) return;
      setDetail(value);
      requestAnimationFrame(() => { const element = document.getElementById('tt-date-detail'); element?.focus({ preventScroll: true }); element?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });
    } catch (failure) { if (mounted.current && current === generation.current) setDetailError(failure instanceof Error ? failure.message : 'Không thể tải chi tiết.'); }
    finally { if (mounted.current && current === generation.current) setDetailBusy(false); }
  };
  return <>
    <header className="tt-date-hero"><div><h1>{config?.name || 'Xem ngày mua xe'}</h1><p>Tham khảo ngày phù hợp để mua xe, nhận xe hoặc ký hợp đồng.</p></div><div className="tt-date-hero__icon" aria-hidden="true"><Image src="/images/utilities/test-icon-tien-ich/xem-ngay-mua-xe.png" alt="" width={1280} height={1280} /></div></header>
    {configError ? <div className="tt-date-panel" role="alert"><p>{configError}</p><button type="button" className="tt-date-button" onClick={() => { setConfigError(''); setReload(value => value + 1); }}>Thử lại</button></div>
      : !config ? <div className="tt-date-panel tt-date-skeleton" role="status">Đang tải tiện ích…</div>
      : !config.enabled ? <div className="tt-date-panel tt-date-maintenance"><h2>Tiện ích đang tạm bảo trì.</h2><p>Vui lòng quay lại sau.</p><Link className="tt-date-button" href="/san-pham">{config.ctaLabel}</Link></div>
      : <>
        <div className="tt-date-intro"><DateForm config={config} busy={busy} onSearch={setPendingQuery} /><aside className="tt-date-help"><h2>Hướng dẫn tra cứu</h2><ol><li>Nhập ngày sinh và chọn mục đích.</li><li>Chọn khoảng thời gian cần xem (tối đa {config.maxSearchDays} ngày).</li><li>Đọc thông báo và chọn Đồng ý để xem kết quả.</li><li>Bấm vào một ngày để xem thông tin chi tiết.</li></ol><p>{config.disclaimer}</p></aside></div>
        {error && <div className="tt-date-panel" role="alert"><p>{error}</p><button type="button" className="tt-date-button" onClick={() => query && void search(query)}>Thử lại</button></div>}
        {result && <section ref={resultsRef} className="tt-date-results" aria-labelledby="tt-date-results-title" tabIndex={-1}>
          <header><h2 id="tt-date-results-title">Ngày phù hợp trong khoảng</h2><p>{formatDate(result.from)} – {formatDate(result.to)}</p><p className="tt-date-muted" role="status">Có {result.results.filter(day => displayClassification(day.classification) === 'VERY_GOOD').length} ngày rất phù hợp trong {result.results.length} ngày đã xem.</p></header>
          <ResultCalendar key={`${result.from}-${result.to}-${result.rulesetVersion}`} months={result.months} selected={selected} busy={detailBusy} onSelect={date => void selectDate(date)} />
          {!detail && <p className="tt-date-disclaimer">{result.disclaimer}</p>}
          {detailBusy && <div className="tt-date-panel" role="status">Đang tải ngày {formatDate(selected)}…</div>}
          {detailError && <div className="tt-date-panel" role="alert"><p>{detailError}</p><button className="tt-date-text-button" type="button" onClick={() => void selectDate(selected)}>Thử lại</button></div>}
          {detail && <DateDetail detail={detail} />}
          {!detail && <Link className="tt-date-button" href="/san-pham">{result.ctaLabel}</Link>}
        </section>}
      </>}
    {pendingQuery && <SearchConfirmation onCancel={() => setPendingQuery(null)} onAgree={() => { const input = pendingQuery; setPendingQuery(null); void search(input); }} />}
  </>;
}
