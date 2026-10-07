import Link from 'next/link';
import ValuationLeadForm from './ValuationLeadForm';
import { type ValuationResult as Result } from '@/lib/valuation';
export interface ValuationContact { phone: string; phoneHref: string | null; zaloHref: string | null }
export function ContactActions({ contact, label }: { contact: ValuationContact; label: string }) {
  return <div className="tt-valuation-contact"><p>{label || 'Đăng ký kiểm định xe'}</p><div>
    {contact.phoneHref && <a className="tt-date-button" href={contact.phoneHref}>Gọi tư vấn{contact.phone ? ` · ${contact.phone}` : ''}</a>}
    {contact.zaloHref && <a className="tt-date-button tt-date-button--secondary" href={contact.zaloHref} target="_blank" rel="noopener noreferrer">Liên hệ qua Zalo</a>}
    <Link className="tt-date-button tt-date-button--secondary" href="/ban-xe">{!contact.phoneHref && !contact.zaloHref ? label || 'Đăng ký kiểm định xe' : 'Gửi thông tin xe'}</Link>
  </div></div>;
}
export default function ValuationResult({ result, odometerKm, onEdit, contactSent, onContactSent }: { result: Result; odometerKm?: number; onEdit: () => void; contactSent: boolean; onContactSent: () => void }) {
  const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
  const prices = [
    { label: 'Giá thu mua tại Toàn Trung', range: result.dealerBuyingRange, dealer: true },
    { label: 'Giá thị trường tham khảo', range: result.marketRange, dealer: false },
  ];
  return <article className="tt-valuation-result">
    <div className="tt-valuation-result__summary"><h3>{result.vehicle.brandName} {result.vehicle.modelName}</h3><p>{result.vehicle.variantName} · Năm {result.vehicle.modelYear}</p></div>
    <div className="tt-valuation-result__prices">{prices.map(({ label, range, dealer }) =>
      <section key={label} className={`tt-valuation-price${dealer ? ' tt-valuation-price--dealer' : ''}`}>
        <h3>{label}</h3>
        {range ? <><strong>{number.format(range.min / 1000000)} – {number.format(range.max / 1000000)}</strong><small>triệu đồng</small></>
          : <p className="tt-valuation-price__unavailable">Cần kiểm tra xe trực tiếp</p>}
      </section>)}</div>
    {result.manualInspectionRequired && <p className="tt-valuation-result__inspection">Xe cần được kiểm tra trực tiếp để xác nhận giá thu mua.</p>}
    <ValuationLeadForm key={result.recordId} result={result} odometerKm={odometerKm} sent={contactSent} onSent={onContactSent} onEdit={onEdit} />
  </article>;
}
