import { zaloHref } from '@/lib/contact-links';

export interface ContactMethodDetails { phone: string; name: string }

export default function ContactMethods({ contact, onBack }: { contact: ContactMethodDetails; onBack?: () => void }) {
  return <section className="tt-contact-methods">
    <h2>Liên hệ Toàn Trung</h2>
    <p className="tt-contact-methods__intro">Bạn muốn liên hệ bằng cách nào?</p>
    <div className="tt-contact-methods__person">
      <strong>{contact.name}</strong>
      <span>{contact.phone}</span>
    </div>
    <div className="tt-contact-methods__actions">
      <a className="tt-contact-methods__action tt-contact-methods__action--phone" href={`tel:${contact.phone}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 16.4v3a2 2 0 0 1-2.2 2A18.8 18.8 0 0 1 2.6 5.2 2 2 0 0 1 4.6 3h3a2 2 0 0 1 2 1.7l.4 2.7a2 2 0 0 1-.6 1.8L7.8 10.8a15.6 15.6 0 0 0 5.4 5.4l1.6-1.6a2 2 0 0 1 1.8-.6l2.7.4A2 2 0 0 1 21 16.4Z"/></svg>
        <span>Gọi điện</span>
      </a>
      <a className="tt-contact-methods__action tt-contact-methods__action--zalo" href={zaloHref(contact.phone)} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"/><path d="M9 8h7l-7 7h7"/></svg>
        <span>Zalo</span>
      </a>
    </div>
    {onBack && <button type="button" className="tt-contact-methods__back" onClick={onBack}><span aria-hidden="true">←</span> Chọn người liên hệ khác</button>}
  </section>;
}
