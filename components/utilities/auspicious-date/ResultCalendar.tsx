'use client';
import { useState } from 'react';
import { classificationLabels, displayClassification, formatDate, type CalendarMonth } from '@/lib/auspicious-date';
export default function ResultCalendar({ months, selected, busy, onSelect }: { months: CalendarMonth[]; selected: string; busy: boolean; onSelect: (date: string) => void }) {
  const [index, setIndex] = useState(0);
  const month = months[index];
  if (!month) return null;
  return <section className="tt-date-panel tt-date-calendar" aria-label="Lịch kết quả">
    <div className="tt-date-calendar__header"><button type="button" disabled={index === 0} onClick={() => setIndex(value => value - 1)} aria-label="Tháng trước">‹</button><h3>{month.label}</h3><button type="button" disabled={index === months.length - 1} onClick={() => setIndex(value => value + 1)} aria-label="Tháng sau">›</button></div>
    <div className="tt-date-calendar__grid"><div className="tt-date-calendar__week" aria-hidden="true">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(label => <span key={label}>{label}</span>)}</div>
      {month.cells.map((cell, i) => {
        if (!cell) return <span key={`${month.key}-empty-${i}`} aria-hidden="true" />;
        const classification = cell.classification ? displayClassification(cell.classification) : null;
        return <button key={cell.date} type="button" className={`tt-date-calendar__day ${classification ? `is-${classification}` : 'is-outside'}`} disabled={!classification || busy} aria-pressed={selected === cell.date} aria-label={`${formatDate(cell.date)}: ${classification ? classificationLabels[classification] : 'Ngoài khoảng tra cứu'}`} onClick={() => onSelect(cell.date)}><strong>{cell.day}</strong>{classification && <span aria-hidden="true">{classificationLabels[classification]}</span>}</button>;
      })}
    </div>
    <ul className="tt-date-legend">{Object.entries(classificationLabels).map(([key, label]) => <li key={key}><i className={`is-${key}`} aria-hidden="true" />{label}</li>)}</ul>
  </section>;
}
