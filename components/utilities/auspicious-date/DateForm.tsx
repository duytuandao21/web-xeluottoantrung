'use client';
import { useState } from 'react';
import DateInput from './DateInput';
import { purposeLabels, type DateConfig, type Purpose, type SearchInput } from '@/lib/auspicious-date';
export default function DateForm({ config, busy, onSearch }: { config: DateConfig; busy: boolean; onSearch: (input: SearchInput) => void }) {
  const [from, setFrom] = useState(config.defaultFrom), [to, setTo] = useState(config.defaultTo);
  const [birthDate, setBirthDate] = useState('');
  return <form className="tt-date-form tt-date-panel" data-skip-legacy-submit onSubmit={event => {
    event.preventDefault(); if (busy) return;
    const values = new FormData(event.currentTarget), gender = String(values.get('gender') ?? '');
    onSearch({ birthDate, purpose: String(values.get('purpose')) as Purpose, from, to, ...(gender ? { gender } : {}) });
  }}>
    <h2>Thông tin tra cứu</h2>
    <fieldset disabled={busy}>
      <DateInput className="tt-date-form__full" name="birthDate" label="Ngày sinh" min={config.minDate} max={config.currentDate < config.maxDate ? config.currentDate : config.maxDate} autoComplete="bday" onChange={setBirthDate} />
      <label><span>Giới tính <small>(không bắt buộc)</small></span><select name="gender" defaultValue=""><option value="">Không cung cấp</option><option value="MALE">Nam</option><option value="FEMALE">Nữ</option><option value="OTHER">Khác</option></select></label>
      <label><span>Mục đích <span aria-hidden="true">*</span></span><select name="purpose" defaultValue={config.defaultPurpose} required>{config.purposes.map(purpose => <option key={purpose} value={purpose}>{purposeLabels[purpose]}</option>)}</select></label>
      <DateInput name="from" label="Từ ngày" min={config.minDate} max={config.maxDate} defaultValue={config.defaultFrom} onChange={setFrom} />
      <DateInput name="to" label="Đến ngày" min={from || config.minDate} max={config.maxDate} defaultValue={config.defaultTo} onChange={setTo} />
      <p className="tt-date-form__full tt-date-muted">Xem tối đa {config.maxSearchDays} ngày, tính cả ngày đầu và cuối. Ngày sinh chỉ dùng cho lần tra cứu này.</p>
      <button className="tt-date-button tt-date-form__full" type="submit" aria-busy={busy}>{busy ? 'Đang tìm ngày phù hợp…' : 'Xem ngày phù hợp'}</button>
    </fieldset>
  </form>;
}
