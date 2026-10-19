import 'server-only';
import type { load } from 'cheerio';
import { formatKm, kmDigits } from './valuation';

// Reuse the live form and its controls so catalog loading and submission remain native.
export function styleServiceForm($: ReturnType<typeof load>, service: '/ban-xe' | '/len-doi') {
  const panel = $('.lendoi_r').first();
  const form = panel.find('form.validation-laithu').first();
  if (!form.length) return;
  form.removeAttr('novalidate');
  const selling = service === '/ban-xe';
  const headingId = selling ? 'selling-form-heading' : 'trade-in-form-heading';
  panel.addClass('tt-trade-in-form').attr({ role: 'region', 'aria-labelledby': headingId });
  const badge = selling
    ? '<path d="m18 23 5-5h5v5l-5 5-5-5Z"/><circle cx="25.7" cy="20.3" r=".8" fill="currentColor" stroke="none"/>'
    : '<path d="M19 23a5 5 0 0 1 8-3l2 2m0-4v4h-4M29 25a5 5 0 0 1-8 3l-2-2m0 4v-4h4"/>';
  panel.children('.td').replaceWith(`<div class="tt-trade-in-form__eyebrow"><span class="tt-trade-in-form__symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 14 2-7a2 2 0 0 1 2-1h12a2 2 0 0 1 2 1l2 7M4 14h20a2 2 0 0 1 2 2v6H2v-6a2 2 0 0 1 2-2ZM6 18h3m10 0h3"/><rect x="3" y="21" width="4" height="6" rx="1.2" fill="currentColor" stroke="none"/><rect x="21" y="21" width="4" height="6" rx="1.2" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="8" fill="#fff3df" stroke="none"/>${badge}</svg></span><span>${selling ? 'Bán xe' : 'Lên đời'}</span></div>`);
  const title = panel.children('.title-main').first();
  const heading = title.text().trim() || 'Nhập thông tin chi tiết xe của bạn';
  title.empty().append($('<h2></h2>').attr('id', headingId).text(heading));
  form.find('.thanhtrai').remove();

  const icons: Record<string, string> = {
    hangxe_lendoi: '/assets/images/socho.png', dongxe_lendoi: '/assets/images/socho.png',
    nsx_lendoi: '/assets/images/bienso.png', km: '/assets/images/km.png',
    dienthoai: '/assets/images/phone.svg', hangxe_lendoimm: '/assets/images/socho.png', dongxe_lendoimm: '/assets/images/socho.png',
  };
  form.find('.input-contact').each((_, element) => {
    const field = $(element), control = field.children('select,input:not([type="hidden"])').first();
    if (!control.length) return;
    const name = control.attr('name') || '', id = control.attr('id') || `trade-in-${name}`;
    control.attr({ id, required: 'required' });
    const oldLabel = field.children('p').first();
    oldLabel.replaceWith($('<label></label>').attr('for', id).text(oldLabel.text()));
    const icon = $('<span class="tt-trade-in-form__field-icon" aria-hidden="true"></span>');
    if (icons[name]) icon.append($('<img alt="" decoding="async">').attr('src', icons[name]));
    else icon.append('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg>');
    field.append($('<div class="tt-trade-in-form__control"></div>').append(icon, control.remove()));
    if (name === 'dienthoai') control.attr({ type: 'tel', inputmode: 'tel', autocomplete: 'tel' });
    if (name === 'km') control.attr({
      inputmode: 'numeric', maxlength: '11',
      pattern: '(?:[0-9]{1,9}|[0-9]{1,3}(?:\\.[0-9]{3}){1,2})',
      value: formatKm(kmDigits(control.attr('value') || '')),
    });
  });
  form.find('input[type="submit"]').replaceWith('<button type="submit" class="btn btn-primary tt-trade-in-form__submit"><svg class="tt-trade-in-form__send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9L2 9 22 2ZM11 13 22 2"/></svg><span>Gửi thông tin</span></button>');
}
