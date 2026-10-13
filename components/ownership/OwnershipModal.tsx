'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Answers, Calculation, OwnershipConfig } from '@/lib/ownership-types';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import OwnershipResults from './OwnershipResults';
import FormattedNumberInput from './FormattedNumberInput';
import './ownership.css';
const vnd = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const newInteraction = () => ({ interactionId: requestId(), capability: Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join(''), revision: 0 });
export default function OwnershipModal({ carId, open, confirmed, onConfirm, onClose, returnFocus }: { carId: string; open: boolean; confirmed: boolean; onConfirm: () => void; onClose: () => void; returnFocus: RefObject<HTMLAnchorElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null), closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [config, setConfig] = useState<OwnershipConfig | null>(null), [answers, setAnswers] = useState<Answers | null>(null);
  const [step, setStep] = useState(0), [result, setResult] = useState<Calculation | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [closing, setClosing] = useState(false), [retry, setRetry] = useState(0);
  const interaction = useRef<ReturnType<typeof newInteraction> | null>(null), pending = useRef<{ signature: string; requestId: string } | null>(null), calculating = useRef(false);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current, opener = returnFocus.current; if (!element) return;
    setClosing(false);
    const previousOverflow = document.body.style.overflow, previousPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden'; if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    element.showModal(); element.querySelector<HTMLButtonElement>('[data-close]')?.focus({ preventScroll: true });
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null; element.close(); document.body.style.overflow = previousOverflow; document.body.style.paddingRight = previousPadding; opener?.focus({ preventScroll: true }); };
  }, [open, returnFocus]);
  useEffect(() => {
    if (!open || !confirmed) return;
    const abort = new AbortController();
    setLoading(true); setError(''); setClosing(false);
    fetch(`/api/v1/cars/${encodeURIComponent(carId)}/ownership-config`, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Không tải được dữ liệu xe.'); if (!data.enabled) throw new Error('Bộ dự toán đang tạm ngừng. Vui lòng quay lại sau.'); return data as OwnershipConfig; })
      .then(data => { setConfig(data); setAnswers(old => old || data.defaults); setResult(old => old && (old.vehicle.price !== data.vehicle.price || old.vehicle.mileage !== data.vehicle.mileage || old.vehicle.fuel !== data.vehicle.fuel) ? null : old); })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Không thể kết nối.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [open, confirmed, carId, retry]);
  useEffect(() => { body.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [step, result, confirmed]);
  const close = useCallback(() => {
    if (closeTimer.current) return;
    setClosing(true); closeTimer.current = setTimeout(() => { closeTimer.current = null; onClose(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }, [onClose]);
  const update = <K extends keyof Answers>(key: K, value: Answers[K]) => setAnswers(a => a ? { ...a, [key]: value } : a);
  const calculate = async () => {
    if (!answers || calculating.current) return;
    calculating.current = true; setBusy(true); setError('');
    interaction.current ||= newInteraction();
    const signature = JSON.stringify(answers);
    if (!pending.current || pending.current.signature !== signature) pending.current = { signature, requestId: requestId() };
    try {
      const response = await fetch(`/api/v1/cars/${encodeURIComponent(carId)}/ownership-calculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ ...interaction.current, expectedRevision: interaction.current.revision, revision: undefined, requestId: pending.current.requestId, answers }) });
      const data = await response.json();
      if (!response.ok) {
        const revision = data.details?.revision ?? data.revision;
        if (response.status === 409 && typeof revision === 'number') { interaction.current.revision = revision; pending.current = null; }
        throw new Error(typeof data.message === 'string' ? data.message : 'Thông tin chưa hợp lệ; hãy kiểm tra và thử lại.');
      }
      interaction.current.revision = data.revision; pending.current = null; setResult(data.result);
    } catch (e) { setError(e instanceof TypeError ? 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.' : e instanceof Error && e.name === 'TimeoutError' ? 'Máy chủ phản hồi chậm. Vui lòng thử lại.' : e instanceof Error ? e.message : 'Không thể tính toán. Vui lòng thử lại.'); }
    finally { calculating.current = false; setBusy(false); }
  };
  const reset = () => { if (!config) return; interaction.current = null; pending.current = null; setAnswers(config.defaults); setResult(null); setStep(0); setError(''); };
  const numberField = (key: keyof Pick<Answers, 'monthlyKm' | 'energyPrice' | 'parking' | 'wash' | 'toll' | 'downPct' | 'termMonths' | 'annualRate' | 'years'>, label: string, min: number, max: number, increment = 1, hint?: string) => <label className="tt-own-field" key={key}><span>{label}</span>{['monthlyKm', 'energyPrice', 'parking', 'wash', 'toll'].includes(key)
    ? <FormattedNumberInput name={key} value={answers?.[key] ?? NaN} min={min} max={max} onChange={value => update(key, value)} />
    : <input name={key} type="number" inputMode={increment < 1 ? 'decimal' : 'numeric'} min={min} max={max} step={increment} required value={Number.isFinite(answers?.[key]) ? answers![key]! : ''} onChange={e => update(key, e.target.value === '' ? NaN : Number(e.target.value))} />}{hint && <small>{hint}</small>}</label>;
  const choices = (key: 'parking' | 'wash' | 'toll', label: string) => <div className="tt-own-choice-field"><span>{label}</span><div className="tt-own-chips">{config!.options[key].map(n => <button type="button" key={n} aria-pressed={answers![key] === n} onClick={() => update(key, n)}>{n === 0 ? 'Miễn phí' : vnd(n)}</button>)}</div>{numberField(key, 'Hoặc nhập ngân sách / tháng (VNĐ)', 0, 20000000)}</div>;
  if (!open) return null;
  return createPortal(<dialog ref={dialog} className={`tt-own-dialog${!confirmed ? ' is-intro' : ''}${closing ? ' is-closing' : ''}`} aria-modal="true" aria-labelledby="tt-own-title" aria-describedby={!confirmed ? 'tt-own-estimate-notice' : undefined}
    onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }}
    onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close(); } }}>
    <header className="tt-own-header">{confirmed && <h2 id="tt-own-title">Tính toán chi phí sử dụng</h2>}<button type="button" data-close aria-label="Đóng dự toán" onClick={close}>×</button></header>
    {confirmed && config && <section className="tt-own-car" aria-label="Xe đang tính chi phí">{config.vehicle.cover && <ResponsiveImage src={config.vehicle.cover} profile="thumbnail" alt={config.vehicle.name} width={80} height={60} />}
      <h3>{config.vehicle.name}</h3></section>}
    <div className="tt-own-body" ref={body}>
      {!confirmed ? <div className="tt-own-intro">
        <span className="tt-own-intro-icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2.5" width="14" height="19" rx="3" /><path d="M8.5 6.5h7M8.5 11h1M14.5 11h1M8.5 14.5h1M14.5 14.5h1M8.5 18h1M14.5 18h1" /></svg></span>
        <h2 id="tt-own-title">Tính toán chi phí sử dụng</h2>
        <p className="tt-own-intro-subtitle">Chủ động dự trù ngân sách trước khi mua xe.</p>
        <div className="tt-own-intro-notice">
          <div className="tt-own-intro-notice-heading"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>
            <h3>Chi phí chỉ mang tính ước tính</h3>
          </div>
          <p id="tt-own-estimate-notice">Kết quả dựa trên thông tin bạn nhập và các mức chi phí dự kiến, chỉ để tham khảo. Chi phí thực tế có thể khác và không được đảm bảo chính xác hoàn toàn.</p>
        </div>
      </div> : <>
      {loading && <p role="status">Đang cập nhật thông số xe…</p>}
      {error && <div className="tt-own-error" role="alert">{error}{!config && <button type="button" onClick={() => setRetry(n => n + 1)}>Thử lại</button>}</div>}
      {!loading && config && answers && (result ? <OwnershipResults result={result} onEdit={() => { setResult(null); setStep(0); }} onReset={reset} onRecalculate={calculate} busy={busy} /> : <>
        <nav className="tt-own-progress" aria-label="Các bước khảo sát">{['Thói quen sử dụng', 'Chi phí thường kỳ', 'Kế hoạch tài chính'].map((name, index) => <div key={name} aria-current={step === index ? 'step' : undefined} className={index <= step ? 'is-active' : ''}><b>{index + 1}</b><span>{name}</span></div>)}</nav>
        <form id="tt-own-survey" data-skip-legacy-submit onSubmit={e => { e.preventDefault(); e.stopPropagation(); if (step < 2) setStep(s => s + 1); else void calculate(); }}>
          <section key={step} className="tt-own-step"><h3>{['Bạn sử dụng xe thế nào?', 'Ngân sách thường kỳ của bạn', 'Kế hoạch mua và sở hữu'][step]}</h3>
            {step === 0 && <>
              {numberField('monthlyKm', 'Quãng đường mỗi tháng (km)', 0, 20000)}
              <input type="range" min="0" max="20000" step="100" value={Number.isFinite(answers.monthlyKm) ? answers.monthlyKm : 0} aria-label="Điều chỉnh km mỗi tháng" onChange={e => update('monthlyKm', Number(e.target.value))} />
              <label className="tt-own-field"><span>Điều kiện di chuyển</span><select value={answers.driving} onChange={e => update('driving', e.target.value as Answers['driving'])}><option value="city">Thành phố</option><option value="mixed">Hỗn hợp</option><option value="highway">Đường trường</option></select></label>
              {numberField('energyPrice', config.fuel === 'electric' ? 'Giá điện (VNĐ/kWh)' : `Giá ${config.fuel === 'diesel' ? 'dầu' : 'xăng'} (VNĐ/lít)`, 1, 100000, 1, 'Bạn có thể chỉnh theo mức giá dự kiến của mình.')}
              <div className="tt-own-note"><strong>Định mức tiêu hao nhiên liệu: {config.consumption} {config.fuel === 'electric' ? 'kWh' : 'lít'}/100 km — ước tính</strong>{config.fuel === 'electric' && <p>Điện mua thêm {(config.chargingLoss * 100).toFixed(1)}% để dự phòng hao hụt sạc.</p>}</div>
            </>}
            {step === 1 && <>
              {choices('parking', 'Gửi xe')}{choices('wash', 'Rửa xe')}{choices('toll', 'Cầu đường / phí đỗ phát sinh')}
              <label className="tt-own-field"><span>Ngân sách bảo hiểm</span><select value={answers.insurance} onChange={e => update('insurance', e.target.value as Answers['insurance'])}><option value="mandatory">Bảo hiểm bắt buộc</option><option value="comprehensive">Bắt buộc + vật chất</option></select></label>
            </>}
            {step === 2 && <>
              <div className="tt-own-chips"><button type="button" aria-pressed={!answers.financed} onClick={() => setAnswers(a => a && ({ ...a, financed: false, downPct: null, termMonths: null, annualRate: null }))}>Thanh toán toàn bộ</button><button type="button" aria-pressed={answers.financed} onClick={() => setAnswers(a => a && ({ ...a, financed: true, ...config.loanDefaults }))}>Trả góp</button></div>
              {answers.financed && <div className="tt-own-grid">{numberField('downPct', 'Trả trước (%)', 0, 100, 0.01)}{numberField('termMonths', 'Kỳ hạn vay (tháng)', 1, 240)}{numberField('annualRate', 'Lãi suất danh nghĩa (%/năm)', 0, 40, 0.01)}<p className="tt-own-hint">Trả đều, lãi cố định trên dư nợ giảm dần. Chưa phải báo giá ngân hàng.</p></div>}
              <div className="tt-own-choice-field"><span>Thời gian dự định sở hữu</span><div className="tt-own-chips">{config.options.years.map(n => <button type="button" key={n} aria-pressed={answers.years === n} onClick={() => update('years', n)}>{n} năm</button>)}</div>{numberField('years', 'Hoặc nhập thời gian sở hữu (năm)', 1, 20)}</div>
              <div className="tt-own-grid"><label className="tt-own-field"><span>Khu vực giao dịch</span><select value={answers.region} onChange={e => update('region', e.target.value)}>{config.options.regions.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label><label className="tt-own-field"><span>Trường hợp giao dịch</span><select value={answers.transaction} onChange={e => update('transaction', e.target.value)}>{config.options.transactions.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label></div>
            </>}
          </section>
        </form>
      </>)}
      </>}
    </div>
    <footer className="tt-own-footer">{!confirmed ? <><button type="button" className="tt-own-secondary" onClick={close}>Hủy</button><button type="button" className="tt-own-primary" onClick={onConfirm}>Đồng ý</button></> : !result && answers && !loading ? <><button type="button" className="tt-own-secondary" onClick={() => step > 0 ? setStep(s => s - 1) : close()} disabled={busy}>{step > 0 ? 'Quay lại' : 'Đóng'}</button><button type="submit" form="tt-own-survey" className="tt-own-primary" disabled={busy}>{busy ? 'Đang tính…' : step < 2 ? 'Tiếp tục' : 'Xem kết quả'}</button></> : <button type="button" className="tt-own-secondary" onClick={close}>Đóng</button>}</footer>
  </dialog>, document.body);
}
