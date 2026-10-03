import Link from 'next/link';
import { classificationLabels, displayClassification, formatDate, type DetailResult } from '@/lib/auspicious-date';
export default function DateDetail({ detail }: { detail: DetailResult }) {
  const lunar = detail.calendar.lunar, canChi = detail.calendar.canChi;
  const classification = displayClassification(detail.classification);
  return <section id="tt-date-detail" className="tt-date-panel tt-date-detail" aria-labelledby="tt-date-detail-title" tabIndex={-1}>
    <div className="tt-date-detail__header"><h2 id="tt-date-detail-title">Ngày {formatDate(detail.date)}</h2><span className={`tt-date-status is-${classification}`}>{classificationLabels[classification]}</span></div>
    <dl className="tt-date-detail__facts">
      {lunar && <div><dt>Âm lịch</dt><dd>{lunar.day}/{lunar.month}{lunar.leap ? ' (nhuận)' : ''}/{lunar.year}</dd></div>}
      {canChi && <><div><dt>Can Chi ngày</dt><dd>{canChi.day.label}</dd></div><div><dt>Tháng / năm</dt><dd>{canChi.month.label} / {canChi.year.label}</dd></div></>}
      {detail.calendar.solarTerm && <div><dt>Tiết khí tại đầu ngày</dt><dd>{detail.calendar.solarTerm}</dd></div>}
    </dl>
    {detail.goodHours.length > 0 && <div className="tt-date-detail__group"><h3>Giờ tham khảo</h3><div className="tt-date-hours">{detail.goodHours.map(hour => <span key={hour.branch}>{hour.branch}: {hour.start}–{hour.end}{hour.crossesMidnight ? ' (qua nửa đêm)' : ''}</span>)}</div></div>}
    <p className="tt-date-disclaimer">{detail.disclaimer}</p><Link className="tt-date-button" href="/san-pham">{detail.ctaLabel}</Link>
  </section>;
}
