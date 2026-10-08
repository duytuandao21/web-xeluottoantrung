'use client';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { alignRecommendationAnswers, blankRecommendationAnswers, RecommendationApiError, recommendationApi, recommendationStorageKey, recommendationRequestId, requestCapability, type RecommendationAnswers, type RecommendationConfig, type RecommendationQuestion, type RecommendationResult, type SurveyState, type TechnicalKey } from '@/lib/car-recommendations';
import SurveyResults from './SurveyResults';
import PriorityOrder from './PriorityOrder';
import './needs-survey.css';
const technicalLabels: Record<TechnicalKey, string> = { brand: 'Hãng xe', bodyStyle: 'Kiểu dáng', transmission: 'Hộp số', fuel: 'Nhiên liệu' };
const initial = (): SurveyState => ({ answers: blankRecommendationAnswers(), step: -1, startedAt: Date.now(), noticeAccepted: false });
const amount = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
function answersFor(question: RecommendationQuestion, answers: RecommendationAnswers): string[] {
  const value = question.key === 'purposes' || question.key === 'priorities' ? answers[question.key] : question.key === 'passengers' || question.key === 'environment' || question.key === 'style' ? answers[question.key] : answers.extras[question.key];
  return Array.isArray(value) ? value : value ? [value] : [];
}
export default function NeedsSurvey() {
  const pathname = usePathname();
  const [config, setConfig] = useState<RecommendationConfig | null>(null), [configError, setConfigError] = useState(''), [reload, setReload] = useState(0);
  const [state, setState] = useState<SurveyState>(initial), [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [cooldown, setCooldown] = useState(0);
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  const lock = useRef(false), request = useRef<AbortController | null>(null), heading = useRef<HTMLHeadingElement>(null), focusNeeded = useRef(false);
  useEffect(() => {
    const reset = () => {
      request.current?.abort(); lock.current = false; focusNeeded.current = false;
      setState(initial()); setResult(null); setBusy(false); setError(''); setCooldown(0); setReloadNeeded(false); setDirection('next');
      // Remove progress saved by earlier versions; new progress exists only in component memory.
      try { sessionStorage.removeItem(recommendationStorageKey); } catch { /* Storage may be unavailable. */ }
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) reset(); };
    reset();
    window.addEventListener('pagehide', reset);
    window.addEventListener('pageshow', restored);
    return () => {
      request.current?.abort();
      window.removeEventListener('pagehide', reset);
      window.removeEventListener('pageshow', restored);
    };
  }, [pathname]);
  useEffect(() => {
    const abort = new AbortController(); setConfigError('');
    recommendationApi<RecommendationConfig>('config', { signal: abort.signal }).then(value => { if (!abort.signal.aborted) {
      setConfig(value);
      if (value.enabled) setState(old => ({ ...old, answers: alignRecommendationAnswers(old.answers, value), step: Math.min(old.step, value.questions.length - 1) }));
    } }).catch(failure => { if (!abort.signal.aborted) setConfigError(failure instanceof Error ? failure.message : 'Không thể tải khảo sát.'); });
    return () => abort.abort();
  }, [reload]);
  useEffect(() => {
    if (!result || !state.pending) return;
    void recommendationApi(`sessions/${encodeURIComponent(result.sessionId)}/events`, { body: { capability: state.pending.capability, type: 'result_viewed' }, keepalive: true }).catch(() => {});
  }, [result, state.pending]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (!focusNeeded.current) return;
    focusNeeded.current = false;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      const box = heading.current?.getBoundingClientRect();
      if (box && (box.top < 110 || box.bottom > innerHeight)) heading.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.step, result]);
  const questions = config?.questions || [], step = Math.max(0, Math.min(state.step, questions.length - 1)), question = questions[step], answers = state.answers;
  const updateAnswers = (next: RecommendationAnswers) => { setState(old => ({ ...old, answers: next })); setError(''); };
  const move = (index: number) => { setDirection(index < state.step ? 'back' : 'next'); focusNeeded.current = true; setState(old => ({ ...old, step: index })); setError(''); };
  const event = (type: string, carId?: string) => {
    if (!result || !state.pending) return;
    void recommendationApi(`sessions/${encodeURIComponent(result.sessionId)}/events`, { body: { capability: state.pending.capability, type, ...(carId ? { carId } : {}) }, keepalive: true }).catch(() => {});
  };
  const select = (q: RecommendationQuestion, key: string) => {
    const selected = answersFor(q, answers);
    const next = q.type === 'multi' ? selected.includes(key) ? selected.filter(value => value !== key) : selected.length < q.maxSelections ? [...selected, key] : selected : [key];
    if (q.key in answers && ['purposes', 'priorities', 'passengers', 'environment', 'style'].includes(q.key)) updateAnswers({ ...answers, [q.key]: q.type === 'multi' ? next : key });
    else updateAnswers({ ...answers, extras: { ...answers.extras, [q.key]: q.type === 'multi' ? next : key } });
  };
  const budgetValid = !!config && Number.isSafeInteger(answers.budget.min) && Number.isSafeInteger(answers.budget.max) && answers.budget.min >= config.minBudget && answers.budget.max <= config.maxBudget && answers.budget.max > 0 && answers.budget.max >= answers.budget.min;
  const canContinue = question?.type === 'budget' ? budgetValid : !question?.required || answersFor(question, answers).length > 0;
  const submit = async () => {
    if (lock.current || !state.noticeAccepted || !budgetValid || cooldown) return;
    const answersKey = JSON.stringify(answers), pending = state.pending?.answersKey === answersKey ? state.pending : { requestId: recommendationRequestId(), capability: requestCapability(), answersKey, configUpdatedAt: config?.updatedAt };
    const nextState = { ...state, pending };
    setState(nextState); lock.current = true; setBusy(true); setError(''); setReloadNeeded(false);
    const abort = new AbortController(); request.current = abort;
    try {
      const value = await recommendationApi<RecommendationResult>('sessions', { body: { requestId: pending.requestId, capability: pending.capability, configUpdatedAt: pending.configUpdatedAt || config?.updatedAt, answers, noticeAccepted: true, completionMs: Math.min(86400000, Math.max(0, Date.now() - state.startedAt)) }, signal: abort.signal });
      if (!abort.signal.aborted) { focusNeeded.current = true; setResult(value); }
    } catch (failure) {
      if (!abort.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Không thể gửi khảo sát.'); if (failure instanceof RecommendationApiError) { if (failure.status === 429) setCooldown(60); if (failure.status === 409) setReloadNeeded(true); } }
    } finally { lock.current = false; if (!abort.signal.aborted) setBusy(false); }
  };
  const skip = () => {
    if (!question || question.required) return;
    if (question.key === 'technical') updateAnswers({ ...answers, technical: { required: [] } });
    else if (question.key === 'style') updateAnswers({ ...answers, style: '' });
    else { const extras = { ...answers.extras }; delete extras[question.key]; updateAnswers({ ...answers, extras }); }
    if (step < questions.length - 1) move(step + 1);
  };
  return <>
    <header className="tt-needs-hero"><div><span className="tt-needs-accent" aria-hidden="true" /><h1>Mua xe theo nhu cầu</h1></div><span className="tt-needs-hero__icon" aria-hidden="true"><ResponsiveImage profile="icon" sizes="(max-width:600px) 90px, 160px" loading="lazy" src="/images/utilities/test-icon-tien-ich/mua-xe-theo-nhu-cau.lossless-v1.webp" width={1254} height={1254} alt="" /></span></header>
    {configError ? <section className="tt-date-panel" role="alert"><h2>Chưa thể tải khảo sát</h2><p>{configError}</p><button className="tt-date-button" onClick={() => setReload(value => value + 1)}>Thử lại</button></section>
      : !config ? <section className="tt-date-panel tt-needs-loading" role="status">Đang tải khảo sát…</section>
      : !config.enabled ? <section className="tt-date-panel"><h2>Tiện ích đang được chuẩn bị</h2><p>Bạn có thể xem kho xe hoặc liên hệ Toàn Trung để được tư vấn.</p><Link className="tt-date-button" href="/san-pham">Xem xe đang bán</Link></section>
      : result ? <SurveyResults key={result.sessionId} result={result} capability={state.pending?.capability} event={event} headingRef={heading}
        restart={() => { event('quiz_restarted'); setResult(null); setDirection('next'); const fresh = { ...initial(), step: 0 }; focusNeeded.current = true; setState(fresh); setError(''); }} />
      : state.step < 0 ? <section className="tt-date-panel tt-needs-intro">
        <h2>Tìm chiếc xe phù hợp với bạn</h2>
        <p>Chỉ cần trả lời một vài câu hỏi về ngân sách, nhu cầu sử dụng và những điều bạn quan tâm nhất khi chọn xe. Toàn Trung sẽ gợi ý những mẫu xe đang có sẵn và phù hợp nhất với mong muốn của bạn.</p>
        <ul>
          <li>Chỉ mất vài phút với khoảng 7 câu hỏi đơn giản.</li>
          <li>Không cần đăng nhập hay để lại số điện thoại.</li>
          <li>Có thể quay lại thay đổi câu trả lời hoặc bỏ qua những câu không bắt buộc.</li>
          <li>Kết quả chỉ đề xuất những xe đang bán, đồng thời tôn trọng ngân sách và các yêu cầu quan trọng bạn đã lựa chọn.</li>
          <li>Mỗi gợi ý đều đi kèm lý do cụ thể để bạn dễ so sánh và lựa chọn.</li>
        </ul>
        <button className="tt-date-button" type="button" onClick={() => move(0)}>Bắt đầu tìm xe</button>
      </section>
      : question && <>
        <div className="tt-needs-progress"><p role="status">Bước {step + 1}/{questions.length}</p><div role="progressbar" aria-label="Tiến trình khảo sát" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / questions.length * 100}%` }} /></div></div>
        <section key={question.key} className={`tt-date-panel tt-needs-question tt-needs-question--${direction}`} aria-labelledby="tt-needs-question-title" aria-busy={busy}>
          <h2 ref={heading} id="tt-needs-question-title" tabIndex={-1}>{question.title}</h2>{question.description && <p>{question.description}</p>}{question.helpText && <p className="tt-needs-help">{question.helpText}</p>}
          <form data-skip-legacy-submit onSubmit={e => { e.preventDefault(); if (!canContinue || busy) return; if (step === questions.length - 1) void submit(); else move(step + 1); }}>
            <fieldset disabled={busy} className="tt-needs-fields"><legend className="tt-needs-sr-only">{question.title}</legend>
              {['single', 'multi'].includes(question.type) && <div className="tt-needs-options">{question.options.map(option => {
                const selected = answersFor(question, answers), active = selected.includes(option.key);
                return <button type="button" key={option.key} className={`tt-needs-option${active ? ' is-selected' : ''}`} aria-pressed={active} disabled={!active && question.type === 'multi' && selected.length >= question.maxSelections} onClick={() => select(question, option.key)}>
                  {question.key === 'priorities' && active && <span className="tt-needs-option__order">{selected.indexOf(option.key) + 1}</span>}{option.label}{active && <span className="tt-needs-option__check" aria-hidden="true">✓</span>}
                </button>;
              })}</div>}
              {question.key === 'priorities' && answers.priorities.length > 1 && <PriorityOrder items={answers.priorities.map(key => ({ key, label: question.options.find(o => o.key === key)?.label || key }))} onMove={(key, direction) => {
                setState(old => {
                  const values = [...old.answers.priorities], index = values.indexOf(key), target = index + direction;
                  if (index < 0 || target < 0 || target >= values.length) return old;
                  [values[index], values[target]] = [values[target], values[index]];
                  return { ...old, answers: { ...old.answers, priorities: values } };
                });
                setError('');
              }} />}
              {question.type === 'budget' && <><div className="tt-needs-budget-presets">{config.budgetPresets.map(preset => <button type="button" className="tt-needs-option" aria-pressed={answers.budget.min === preset.min && answers.budget.max === preset.max} key={preset.label} onClick={() => updateAnswers({ ...answers, budget: { min: preset.min, max: preset.max } })}>{preset.label}</button>)}</div>
                <div className="tt-needs-budget-inputs">{(['min', 'max'] as const).map(key => <label key={key}>{key === 'min' ? 'Ngân sách từ' : 'Tối đa (bắt buộc)'}<span className="tt-needs-input-unit"><input name={`budget-${key}`} type="text" inputMode="numeric" autoComplete="off" value={Number.isFinite(answers.budget[key]) ? amount(answers.budget[key]) : ''} onChange={e => { const digits = e.target.value.replaceAll('.', '').replace(/[^0-9]/g, ''); updateAnswers({ ...answers, budget: { ...answers.budget, [key]: digits ? Number(digits) : NaN } }); }} /><span>đ</span></span></label>)}</div>{!budgetValid && <p role="alert" className="tt-needs-error">Nhập khoảng ngân sách hợp lệ, tối đa {amount(config.maxBudget)} đồng.</p>}</>}
              {question.key === 'passengers' && <label className="tt-needs-checkbox"><input type="checkbox" checked={answers.requireSeats} onChange={e => updateAnswers({ ...answers, requireSeats: e.target.checked })} />Xe bắt buộc đủ số ghế cho nhóm người đã chọn</label>}
              {question.type === 'technical' && <div className="tt-needs-technical">{(Object.keys(technicalLabels) as TechnicalKey[]).map(key => <div key={key}><label htmlFor={`tt-needs-${key}`}>{technicalLabels[key]}</label><select id={`tt-needs-${key}`} value={answers.technical[key] || ''} onChange={e => { const required = e.target.value ? answers.technical.required : answers.technical.required.filter(value => value !== key); updateAnswers({ ...answers, technical: { ...answers.technical, [key]: e.target.value, required } }); }}><option value="">Không quan trọng</option>{config.technicalOptions[key].map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select>{answers.technical[key] && <label className="tt-needs-checkbox"><input type="checkbox" checked={answers.technical.required.includes(key)} onChange={e => updateAnswers({ ...answers, technical: { ...answers.technical, required: e.target.checked ? [...answers.technical.required, key] : answers.technical.required.filter(value => value !== key) } })} />Bắt buộc</label>}</div>)}</div>}
              {step === questions.length - 1 && <label className="tt-needs-checkbox tt-needs-disclosure"><input type="checkbox" checked={state.noticeAccepted} onChange={e => setState(old => ({ ...old, noticeAccepted: e.target.checked }))} /><span>Tôi đồng ý lưu câu trả lời và thao tác trên kết quả để tư vấn, cải thiện dịch vụ. Không thu thập thông tin liên hệ trong khảo sát. <Link href="/chinh-sach-quyen-rieng-tu" target="_blank" rel="noopener noreferrer">Chính sách quyền riêng tư</Link>.</span></label>}
            </fieldset>
            {error && <div><p role="alert" className="tt-needs-error">{error}</p>{reloadNeeded && <button className="tt-needs-skip" type="button" disabled={busy} onClick={() => { setState(old => ({ ...old, step: 0, pending: undefined })); setError(''); setReloadNeeded(false); setReload(n => n + 1); }}>Tải lại khảo sát</button>}</div>}
            <footer className="tt-needs-actions"><button className="tt-date-button tt-date-button--secondary" type="button" disabled={busy} onClick={() => move(step - 1)}>Quay lại</button>{!question.required && <button className="tt-needs-skip" type="button" disabled={busy} onClick={skip}>Bỏ qua</button>}<button className="tt-date-button" type="submit" disabled={!canContinue || busy || !!cooldown || step === questions.length - 1 && !state.noticeAccepted}>{busy ? 'Đang tìm xe phù hợp…' : cooldown ? `Thử lại sau ${cooldown}s` : step === questions.length - 1 ? error ? 'Thử gửi lại' : 'Xem xe phù hợp' : 'Tiếp tục'}</button></footer>
          </form>
        </section>
      </>}
  </>;
}
