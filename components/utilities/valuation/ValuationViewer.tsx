'use client';
import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { fieldLabels, formatKm, formatKmInput, kmDigits, ValuationApiError, valuationApi, type CatalogItem, type ConditionField, type EstimateInput, type ValuationConfig, type ValuationResult as Result } from '@/lib/valuation';
import useCatalog from './useCatalog';
import ValuationResult, { ContactActions, type ValuationContact } from './ValuationResult';
import './valuation.css';

const steps = ['Xe của bạn', 'Quãng đường', 'Tình trạng xe', 'Vận hành', 'Bổ sung', 'Kết quả'];
const conditionGroups: ConditionField[][] = [[], [], ['exteriorCondition', 'interiorCondition', 'accidentLevel', 'floodLevel'], ['engineCondition', 'transmissionCondition', 'serviceHistory'], ['usageType']];
const allConditionFields = conditionGroups.flat();
function Field({ name, label, children, required = false, hint }: { name: string; label: string; children: ReactNode; required?: boolean; hint?: string }) {
  return <div className="tt-valuation-field"><label htmlFor={`valuation-${name}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>{children}{hint && <small id={`valuation-${name}-hint`}>{hint}</small>}</div>;
}

export default function ValuationViewer({ contact }: { contact: ValuationContact }) {
  const [config, setConfig] = useState<ValuationConfig | null>(null), [configError, setConfigError] = useState(''), [epoch, setEpoch] = useState(0);
  const [step, setStep] = useState(0), [brandId, setBrand] = useState(''), [modelId, setModel] = useState(''), [variantId, setVariant] = useState(''), [modelYear, setYear] = useState('');
  const [odo, setOdo] = useState(''), [unknownOdo, setUnknownOdo] = useState(false), [conditions, setConditions] = useState<Partial<Record<ConditionField, string>>>({});
  const odoInput = useRef<HTMLInputElement>(null), odoCaret = useRef<number | null>(null);
  const [ownerCount, setOwners] = useState(''), [colorId, setColor] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<Result | null>(null), [cooldown, setCooldown] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null), needsFocus = useRef(false), busyLock = useRef(false), estimateAbort = useRef<AbortController | null>(null);
  const lastResult = useRef<{ key: string; at: number; result: Result } | null>(null);
  const [contactedRecords, setContactedRecords] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => {
    if (odoCaret.current !== null && odoInput.current === document.activeElement) {
      odoInput.current?.setSelectionRange(odoCaret.current, odoCaret.current);
    }
    odoCaret.current = null;
  }, [odo]);
  const changeOdo = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget, edit = event.nativeEvent as InputEvent;
    if (edit.isComposing) { setOdo(input.value); return; }
    const formatted = formatKmInput(odo, input.value, input.selectionStart ?? input.value.length, edit.inputType ?? '', edit.data ?? null);
    if (formatted.value === odo) {
      input.value = formatted.value; input.setSelectionRange(formatted.caret, formatted.caret);
    } else {
      odoCaret.current = formatted.caret; setOdo(formatted.value);
    }
  };
  useEffect(() => {
    const abort = new AbortController();
    valuationApi<ValuationConfig>('config', { signal: abort.signal }).then(value => {
      if (value.enabled && (!value.policyVersion || !value.limits || allConditionFields.some(field => !value.conditionOptions?.some(option => option.field === field)))) throw new Error('Cấu hình tiện ích chưa đầy đủ. Vui lòng thử lại sau.');
      if (!abort.signal.aborted) { setConfig(value); setConfigError(''); }
    }).catch(failure => { if (!abort.signal.aborted) setConfigError(failure instanceof Error ? failure.message : 'Không tải được tiện ích.'); });
    return () => abort.abort();
  }, [epoch]);
  useEffect(() => () => estimateAbort.current?.abort(), []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (!needsFocus.current) return; needsFocus.current = false;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      const box = heading.current?.getBoundingClientRect();
      if (box && (box.top < 110 || box.bottom > window.innerHeight)) heading.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const enabled = !!config?.enabled, version = config?.configurationKey || config?.policyVersion || '';
  const brands = useCatalog<CatalogItem>(enabled ? 'brands' : null, version, epoch);
  const models = useCatalog<CatalogItem>(enabled && brandId ? `models?brandId=${encodeURIComponent(brandId)}` : null, version, epoch);
  const variants = useCatalog<CatalogItem>(enabled && modelId ? `variants?modelId=${encodeURIComponent(modelId)}` : null, version, epoch);
  const years = useCatalog<number>(enabled && variantId ? `years?variantId=${encodeURIComponent(variantId)}` : null, version, epoch);
  const limits = config?.limits;
  const odoValue = kmDigits(odo);
  const odoValid = unknownOdo || /^\d+$/.test(odoValue) && Number.isSafeInteger(Number(odoValue)) && Number(odoValue) <= (limits?.maxOdometerKm ?? 0);
  const ownersValid = ownerCount === '' || /^\d+$/.test(ownerCount) && Number(ownerCount) >= 1 && Number(ownerCount) <= 100;
  const vehicleValid = brands.data.some(item => item.id === brandId) && models.data.some(item => item.id === modelId) && variants.data.some(item => item.id === variantId) && years.data.includes(Number(modelYear)) && modelYear !== '';
  const conditionCode = (field: ConditionField) => conditions[field] || config?.conditionOptions?.find(option => option.field === field && option.isUnknown)?.code || '';
  const validConditions = (fields: ConditionField[]) => fields.every(field => config?.conditionOptions?.some(option => option.field === field && option.code === conditionCode(field)));
  const canNext = step === 0 ? vehicleValid : step === 1 ? odoValid : step === 4 ? ownersValid && validConditions(conditionGroups[4]) && (!colorId || !!config?.colors?.some(item => item.id === colorId)) : validConditions(conditionGroups[step] || []);
  const move = (value: number) => { needsFocus.current = true; setStep(value); setError(''); };
  const refresh = () => { setConfig(null); setConfigError(''); setEpoch(value => value + 1); lastResult.current = null; move(0); };
  const submit = async () => {
    if (!vehicleValid || !odoValid || !ownersValid || !validConditions(allConditionFields) || busyLock.current || cooldown) return;
    const input: EstimateInput = { brandId, modelId, variantId, modelYear: Number(modelYear),
      ...(!unknownOdo ? { odometerKm: Number(odoValue) } : {}), ...(ownerCount ? { ownerCount: Number(ownerCount) } : {}), ...(colorId ? { colorId } : {}),
      ...Object.fromEntries(allConditionFields.map(field => [field, conditionCode(field)])) };
    const key = `${version}:${JSON.stringify(input)}`, cached = lastResult.current;
    if (cached?.key === key && Date.now() - cached.at < 60000) { setResult(cached.result); move(5); return; }
    busyLock.current = true; setBusy(true); setError('');
    const abort = new AbortController(); estimateAbort.current = abort;
    try {
      const value = await valuationApi<Result>('estimate', { body: input, signal: abort.signal });
      if (abort.signal.aborted) return;
      lastResult.current = { key, at: Date.now(), result: value }; setResult(value); move(5);
    } catch (failure) {
      if (!abort.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Không thể định giá. Vui lòng thử lại.'); if (failure instanceof ValuationApiError && failure.status === 429) setCooldown(60); }
    } finally { busyLock.current = false; if (!abort.signal.aborted) setBusy(false); }
  };
  const catalogSelect = (name: string, label: string, value: string, data: CatalogItem[], loading: boolean, onChange: (value: string) => void, ready = true) => <Field name={name} label={label} required>
    <select id={`valuation-${name}`} name={name} value={value} onChange={event => onChange(event.target.value)} disabled={!ready || loading || busy || !data.length} required>
      <option value="">{loading ? 'Đang tải…' : `Chọn ${label.toLocaleLowerCase('vi-VN')}`}</option>{data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></Field>;
  const conditionSelect = (field: ConditionField) => <Field key={field} name={field} label={fieldLabels[field]} hint="Chọn “Chưa rõ” nếu chưa có thông tin.">
    <select id={`valuation-${field}`} name={field} value={conditionCode(field)} onChange={event => setConditions(old => ({ ...old, [field]: event.target.value }))}>
      {(config?.conditionOptions || []).filter(option => option.field === field).map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
    </select></Field>;
  const catalogErrors = [brands, models, variants, years].filter(item => item.error);
  const noSupport = !brands.loading && !brands.error && enabled && !brands.data.length;
  return <>
    <header className="tt-valuation-hero"><div><span className="tt-valuation-accent" aria-hidden="true" /><h1>Định giá xe cũ</h1><p>Hiểu hơn giá trị chiếc xe của bạn trước khi quyết định bán hoặc lên đời.</p></div>
      <div className="tt-valuation-hero__icon" aria-hidden="true"><Image src="/images/utilities/test-icon-tien-ich/dinh-gia-xe-cu.png" alt="" width={1254} height={1254} /></div></header>
    {configError ? <section className="tt-date-panel" role="alert"><h2>Chưa thể tải tiện ích</h2><p>{configError}</p><button type="button" className="tt-date-button" onClick={refresh}>Thử lại</button><ContactActions contact={contact} label="Liên hệ tư vấn giá xe" /></section>
      : !config ? <section className="tt-date-panel tt-valuation-loading" role="status"><span className="tt-valuation-skeleton" />Đang tải tiện ích định giá…</section>
      : !enabled ? <section className="tt-date-panel"><h2>Tiện ích đang được chuẩn bị</h2><p>Toàn Trung đang cập nhật dữ liệu giá tham chiếu. Bạn có thể liên hệ để được tư vấn và kiểm định xe trực tiếp.</p><ContactActions contact={contact} label={config.ctaLabel} /></section>
      : <>
        <nav className="tt-valuation-progress" aria-label="Tiến trình định giá"><ol>{steps.map((label, index) => <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}><span aria-hidden="true">{index < step ? '✓' : index + 1}</span><span>{label}</span>{index < step && <button type="button" className="tt-valuation-progress__edit" aria-label={`Ch?nh s?a: ${label}`} disabled={busy} onClick={() => move(index)} />}</li>)}</ol><p role="status">Bước {step + 1}/{steps.length}: {steps[step]}</p></nav>
        <div className={`tt-valuation-layout${step === 5 ? ' is-result' : ''}`}>
          <section className="tt-date-panel tt-valuation-panel" aria-labelledby="valuation-step-title" aria-busy={busy}>
            <header className="tt-valuation-panel__heading"><h2 ref={heading} id="valuation-step-title" tabIndex={-1}>{step === 5 ? 'Kết quả định giá' : steps[step]}</h2><p>{['Chọn đúng phiên bản để có mức tham khảo phù hợp.', 'Nhập số km trên đồng hồ xe, hoặc chọn chưa rõ.', 'Thông tin đúng giúp kết quả có ý nghĩa hơn.', 'Chọn tình trạng vận hành và lịch sử bảo dưỡng.', 'Bổ sung thông tin nếu bạn biết, sau đó xem kết quả.', 'Dựa trên thông tin đã cung cấp và dữ liệu tham chiếu.'][step]}</p></header>
            {step === 5 && result ? <ValuationResult result={result} odometerKm={unknownOdo ? undefined : Number(odoValue)} onEdit={() => move(0)} contactSent={!!result.recordId && contactedRecords.has(result.recordId)} onContactSent={() => { if (result.recordId) setContactedRecords(old => new Set(old).add(result.recordId!)); }} /> : <form data-skip-legacy-submit noValidate onSubmit={event => { event.preventDefault(); if (!canNext || busyLock.current) return; if (step === 4) void submit(); else move(step + 1); }}>
              <fieldset disabled={busy} className="tt-valuation-fields" key={step}>
                <legend className="tt-valuation-sr-only">{steps[step]}</legend>
                {step === 0 && <>
                  {catalogSelect('brandId', 'Hãng xe', brandId, brands.data, brands.loading, value => { setBrand(value); setModel(''); setVariant(''); setYear(''); })}
                  {catalogSelect('modelId', 'Dòng xe', modelId, models.data, models.loading, value => { setModel(value); setVariant(''); setYear(''); }, !!brandId)}
                  {catalogSelect('variantId', 'Phiên bản', variantId, variants.data, variants.loading, value => { setVariant(value); setYear(''); }, !!modelId)}
                  <Field name="modelYear" label="Năm sản xuất" required><select id="valuation-modelYear" name="modelYear" value={modelYear} onChange={event => setYear(event.target.value)} disabled={!variantId || years.loading || !years.data.length} required><option value="">{years.loading ? 'Đang tải…' : 'Chọn năm sản xuất'}</option>{years.data.map(year => <option key={year} value={year}>{year}</option>)}</select></Field>
                </>}
                {step === 1 && <div className="tt-valuation-odometer">
                  <Field name="odometerKm" label="Số km đã sử dụng" required={!unknownOdo} hint={`Tối đa ${formatKm(limits!.maxOdometerKm)} km.`}>
                    <div className="tt-valuation-input-unit"><input ref={odoInput} id="valuation-odometerKm" name="odometerKm" type="text" inputMode="numeric" autoComplete="off" value={odo} disabled={unknownOdo} required={!unknownOdo} aria-invalid={!unknownOdo && !!odo && !odoValid} aria-describedby="valuation-odometerKm-hint" onChange={changeOdo} /><span>km</span></div>
                  </Field>
                  <label className="tt-valuation-checkbox"><input type="checkbox" checked={unknownOdo} onChange={event => setUnknownOdo(event.target.checked)} />Chưa rõ số km</label>
                  {!odoValid && odo && <p className="tt-valuation-field-error" role="alert">Nhập số km nguyên, không âm và không vượt giới hạn cho phép.</p>}
                </div>}
                {step >= 2 && step < 5 && conditionGroups[step].map(conditionSelect)}
                {step === 4 && <><Field name="ownerCount" label="Số chủ sở hữu" hint="Không bắt buộc; để trống nếu chưa rõ."><input id="valuation-ownerCount" name="ownerCount" type="number" inputMode="numeric" min={1} max={100} step={1} value={ownerCount} onChange={event => setOwners(event.target.value)} aria-invalid={!ownersValid} aria-describedby="valuation-ownerCount-hint" /></Field><Field name="colorId" label="Màu xe"><select id="valuation-colorId" name="colorId" value={colorId} onChange={event => setColor(event.target.value)}><option value="">Chưa rõ</option>{config.colors?.map(color => <option key={color.id} value={color.id}>{color.name}</option>)}</select></Field>{!ownersValid && <p className="tt-valuation-field-error" role="alert">Số chủ phải là số nguyên từ 1 đến 100.</p>}</>}
              </fieldset>
              {step === 0 && <>
                {catalogErrors.map((item, index) => <div role="alert" className="tt-valuation-notice" key={index}><p>{item.error}</p><button type="button" className="tt-date-button tt-date-button--secondary" onClick={item.retry}>Thử tải lại</button></div>)}
                {(noSupport || brandId && !models.loading && !models.error && !models.data.length || modelId && !variants.loading && !variants.error && !variants.data.length || variantId && !years.loading && !years.error && !years.data.length) && <div className="tt-valuation-notice"><h3>Chưa có dữ liệu tham chiếu phù hợp</h3><p>Nếu chưa thấy xe của bạn, hãy liên hệ Toàn Trung để được tư vấn trực tiếp.</p><ContactActions contact={contact} label="Liên hệ tư vấn giá xe" /></div>}
              </>}
              {error && <div className="tt-valuation-notice" role="alert"><p>{error}</p><button type="button" className="tt-valuation-text-button" disabled={busy || !!cooldown} onClick={() => move(0)}>Kiểm tra lại thông tin</button></div>}
              <footer className="tt-valuation-actions">{step > 0 && <button type="button" className="tt-date-button tt-date-button--secondary" disabled={busy} onClick={() => move(step - 1)}>Quay lại</button>}<button type="submit" className="tt-date-button" disabled={!canNext || busy || !!cooldown} aria-busy={busy}>{busy ? 'Đang tính giá tham khảo…' : cooldown ? `Thử lại sau ${cooldown}s` : step === 4 ? error ? 'Thử định giá lại' : 'Xem giá tham khảo' : 'Tiếp tục'}</button></footer>
            </form>}
          </section>
          {step < 5 && <aside className="tt-valuation-help"><h2>Thông tin xe của bạn</h2><dl>{[['Hãng xe', brands.data.find(row => row.id === brandId)?.name], ['Dòng xe', models.data.find(row => row.id === modelId)?.name], ['Phiên bản', variants.data.find(row => row.id === variantId)?.name], ['Năm sản xuất', modelYear], ['Số km', unknownOdo ? 'Chưa rõ' : odo ? `${formatKm(odoValue)} km` : '']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa chọn'}</dd></div>)}</dl><h3>Để có mức tham khảo phù hợp</h3><p>Chọn đúng xe và cung cấp tình trạng thực tế. Xe có vấn đề nghiêm trọng sẽ cần được kiểm định trực tiếp.</p><p className="tt-valuation-muted">Lựa chọn được giữ khi chuyển bước. Kết quả định giá được lưu để hỗ trợ tư vấn; thông tin liên hệ chỉ được gửi khi bạn đồng ý.</p><button type="button" disabled={busy} className="tt-valuation-text-button" onClick={refresh}>Cập nhật danh mục</button></aside>}
        </div>
      </>}
  </>;
}
