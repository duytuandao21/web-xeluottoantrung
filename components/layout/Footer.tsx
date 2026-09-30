"use client";

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import shared from '@/data/shared.json';
import Markup from '@/components/common/Markup';
import { submitPublic } from '@/lib/public-client';
import { zaloHref } from '@/lib/contact-links';

const serviceLinks = [
  { label: 'Mua xe', href: '/san-pham' },
  { label: 'Bán xe', href: '/ban-xe' },
  { label: 'Lên đời xe', href: '/len-doi' },
  { label: 'Bảo hiểm', href: 'https://baohiemtasco.com/san-pham/bao-hiem-o-to-xe-may/' },
  { label: 'Cứu hộ RSA' },
];

const aboutLinks = [
  { label: 'Về chúng tôi', href: '/ve-chung-toi' },
  { label: 'Hệ thống showroom', href: '#tt-showrooms' },
  { label: 'Liên hệ', href: '#tt-footer-contact' },
  { label: 'Chính sách quyền riêng tư', href: '/chinh-sach-quyen-rieng-tu' },
];

const socials = [
  { label: 'Facebook', href: 'https://www.facebook.com/ototoantrung', image: '/upload/photo/20673-8148.png' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@toantrunggialai', image: '/upload/photo/4138198-7894.png' },
  { label: 'YouTube', href: 'https://www.youtube.com/@ototoantrung', image: '/upload/photo/youtube-150-4900.png' },
];

const fallbackForLegacyEmpty = new Set(['footerAbout', 'footerAddress', 'footerPhone']);
const safeHref = (href?: string) => href && (/^https:\/\/[^\s]+$/i.test(href) || /^\/(?!\/)[^\s]*$/.test(href) || /^#[a-z0-9-]+$/i.test(href) || /^mailto:[^\s@]+@[^\s@]+$/i.test(href)) ? href : undefined;

function FooterLinks({ links }: { links: { label: string; href?: string }[] }) {
  return <ul className="tt-footer-links">{links.map(link => <li key={link.label}>
    {link.href ? <a href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel={link.href.startsWith('http') ? 'noreferrer' : undefined}>{link.label}</a> : <span>{link.label}</span>}
  </li>)}</ul>;
}

function RegisteredBadge() {
  return <svg className="tt-footer-badge" viewBox="0 0 1405 527" role="img" aria-label="Đã thông báo Bộ Công Thương">
    <defs><path id="tt-footer-badge-arc" d="M 111 239 A 166 166 0 0 1 399 171" /></defs>
    <rect x="340" y="105" width="1065" height="320" rx="55" fill="#0878bc" />
    <circle cx="263.5" cy="263.5" r="263.5" fill="#fff" />
    <circle cx="263.5" cy="263.5" r="205" fill="#0878bc" />
    <path d="M 132 290 L 246 402 L 450 197" fill="none" stroke="#fff" strokeWidth="72" strokeLinecap="round" strokeLinejoin="round" />
    <text fill="#fff" fontSize="42" fontWeight="800" letterSpacing="3" fontFamily="Arial, sans-serif"><textPath href="#tt-footer-badge-arc">ONLINE.GOV.VN</textPath></text>
    <text x="585" y="258" fill="#fff" fontSize="140" fontWeight="800" textLength="760" lengthAdjust="spacingAndGlyphs" fontFamily="Arial, sans-serif">ĐÃ THÔNG BÁO</text>
    <path d="M 593 295 H 1343" stroke="#fff" strokeWidth="7" />
    <text x="590" y="394" fill="#fff" fontSize="88" fontWeight="400" textLength="755" lengthAdjust="spacingAndGlyphs" fontFamily="Arial, sans-serif">BỘ CÔNG THƯƠNG</text>
  </svg>;
}

export default function Footer({ showrooms, phone, address, zalo, settings }: { showrooms: { region: string; locations: { name: string; address: string; mapUrl?: string | null }[] }[]; phone?: string; address?: string; zalo?: string; settings: Record<string, string> }) {
  const [newsletterNotice, setNewsletterNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const value = (key: string, fallback: string) => settings[key] === undefined || (settings[key] === '' && fallbackForLegacyEmpty.has(key)) ? fallback : settings[key];
  const footerPhone = value('footerPhone', phone || '0777 393 913');
  const footerAddress = value('footerAddress', address || '338–340–342–344 Hùng Vương, Phường Pleiku, Tỉnh Gia Lai');
  const services = serviceLinks.map((link, index) => ({ label: value(`serviceLink${index + 1}Label`, link.label) || link.label, href: safeHref(value(`serviceLink${index + 1}Href`, link.href || '')) }));
  const about = aboutLinks.map((link, index) => ({ label: value(`aboutLink${index + 1}Label`, link.label) || link.label, href: safeHref(value(`aboutLink${index + 1}Href`, link.href || '')) }));
  const socialLinks = socials.map(social => ({ ...social, href: safeHref(value(`${social.label.toLowerCase()}Url`, social.href)) || social.href }));
  const certificateUrl = safeHref(value('certificateUrl', ''));
  const submitNewsletter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const form = event.currentTarget;
    setSubmitting(true);
    try {
      await submitPublic('/newsletter-subscriptions', { email: String(new FormData(form).get('email') || '') });
      form.reset();
      setNewsletterNotice('Đăng ký nhận tin thành công.');
    } catch (error) {
      setNewsletterNotice(error instanceof Error ? error.message : 'Không thể đăng ký nhận tin. Vui lòng thử lại.');
    } finally { setSubmitting(false); }
  };

  return <>
    <footer className="tt-footer" id="tt-footer">
      <div className="tt-footer-topline" />
      <div className="tt-footer-wrap">
        <div className="tt-footer-main">
          <div className="tt-footer-brand">
            <Link href="/" aria-label="Về trang chủ Toàn Trung"><img src="/upload/photo/logo-tt-gold-6981.png" alt="Auto Toàn Trung" /></Link>
            <p>{value('footerAbout', 'Hệ thống mua bán ô tô đã qua sử dụng, hướng tới trải nghiệm minh bạch, thuận tiện và chuyên nghiệp cho khách hàng.')}</p>
            <div className="tt-footer-social" aria-label="Mạng xã hội">{socialLinks.map(social => <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label} title={social.label}><img src={social.image} alt="" /></a>)}</div>
          </div>
          <div><h2 className="tt-footer-heading">{value('serviceTitle', 'Dịch vụ')}</h2><FooterLinks links={services} /></div>
          <div><h2 className="tt-footer-heading">{value('aboutTitle', 'Về Toàn Trung')}</h2><FooterLinks links={about} /></div>
          <div className="tt-footer-contact" id="tt-footer-contact">
            <h2 className="tt-footer-heading">{value('contactTitle', 'Liên hệ nhanh')}</h2>
            <div className="tt-footer-contact-row"><span className="tt-footer-contact-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16.4v3a2 2 0 0 1-2.2 2A18.8 18.8 0 0 1 2.6 5.2 2 2 0 0 1 4.6 3h3a2 2 0 0 1 2 1.7l.4 2.7a2 2 0 0 1-.6 1.8L7.8 10.8a15.6 15.6 0 0 0 5.4 5.4l1.6-1.6a2 2 0 0 1 1.8-.6l2.7.4A2 2 0 0 1 21 16.4Z" /></svg></span><div><small>{value('quickPhoneLabel', 'Tổng đài hỗ trợ')}</small><a href={`tel:${footerPhone.replace(/\D/g, '')}`}>{footerPhone}</a></div></div>
            <div className="tt-footer-contact-row"><span className="tt-footer-contact-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg></span><div><small>{value('quickAddressLabel', 'Trụ sở')}</small><span>{footerAddress}</span></div></div>
          </div>
        </div>

        <section className="tt-footer-news-cert" aria-label="Chứng nhận và đăng ký nhận tin">
          <div className="tt-footer-cert">
            <h2 className="tt-footer-heading">{value('certificateTitle', 'Chứng nhận')}</h2>
            {certificateUrl ? <a href={certificateUrl} target="_blank" rel="noopener noreferrer" aria-label="Xem chứng nhận của Toàn Trung"><RegisteredBadge /></a> : <RegisteredBadge />}
          </div>
          <div className="tt-footer-news">
            <h2 className="tt-footer-heading">{value('newsletterTitle', 'Đăng ký nhận tin từ Toàn Trung')}</h2>
            <p>{value('newsletterDescription', 'Nhận thông tin xe mới về, chương trình ưu đãi và những cập nhật mới nhất.')}</p>
            <form className="tt-footer-news-form" onSubmit={submitNewsletter}>
              <input type="email" name="email" autoComplete="email" required aria-label="Địa chỉ email" placeholder={value('newsletterPlaceholder', 'Nhập email của bạn')} onChange={() => setNewsletterNotice('')} />
              <button type="submit" disabled={submitting}>{submitting ? 'Đang gửi...' : value('newsletterButton', 'Đăng ký')}</button>
            </form>
            {newsletterNotice && <p className="tt-footer-news-notice" role="status">{newsletterNotice}</p>}
          </div>
        </section>

        <section className="tt-footer-showrooms" id="tt-showrooms">
          <h2 className="tt-footer-heading">{value('showroomTitle', 'Hệ thống showroom')}</h2>
          <div className="tt-footer-showroom-grid">{showrooms.map(group => <div className="tt-footer-showroom-card" key={group.region}>
            <div className="tt-footer-showroom-region"><span className="tt-footer-showroom-pin" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg></span><h3>{group.region}</h3></div>
            <ul>{group.locations.map(location => <li key={location.name}><strong>{safeHref(location.mapUrl || '') ? <a href={safeHref(location.mapUrl || '')} target="_blank" rel="noopener noreferrer">{location.name}</a> : location.name}</strong><span>{location.address}</span></li>)}</ul>
          </div>)}</div>
        </section>

        <section className="tt-footer-legal" aria-label="Thông tin doanh nghiệp">
          <div><span className="tt-footer-legal-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 21V7h8v14M10 10h.01M14 10h.01M10 13h.01M14 13h.01M10 16h.01M14 16h.01"/></svg></span><div><h2>{value('businessName', 'CÔNG TY TNHH MỘT THÀNH VIÊN TOÀN TRUNG')}</h2><p>{value('businessDescription', 'Thông tin pháp lý doanh nghiệp')}</p></div></div>
          <div><span className="tt-footer-legal-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5M8 12h8M8 16h8M8 20h5"/></svg></span><div><small>{value('businessTaxLabel', 'GCNĐKDN / MST')}</small><strong>{value('businessTaxId', '5900674378')}</strong><span>{value('businessIssueDate', 'Ngày cấp: 06/01/2010')}</span></div></div>
          <div><span className="tt-footer-legal-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16.4v3a2 2 0 0 1-2.2 2A18.8 18.8 0 0 1 2.6 5.2 2 2 0 0 1 4.6 3h3a2 2 0 0 1 2 1.7l.4 2.7a2 2 0 0 1-.6 1.8L7.8 10.8a15.6 15.6 0 0 0 5.4 5.4l1.6-1.6a2 2 0 0 1 1.8-.6l2.7.4A2 2 0 0 1 21 16.4Z"/></svg></span><div><small>{value('businessPhoneLabel', 'Điện thoại')}</small><a href={`tel:${value('businessPhone', '0777 393 912').replace(/\D/g, '')}`}>{value('businessPhone', '0777 393 912')}</a></div></div>
          <div><span className="tt-footer-legal-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><div><small>{value('businessAddressLabel', 'Địa chỉ trụ sở')}</small><span>{value('businessAddress', footerAddress)}</span></div></div>
        </section>

        <div className="tt-footer-bottom"><span>{value('footerCopyright', '© Auto Toàn Trung. All rights reserved.')}</span><nav aria-label="Chính sách"><a href={safeHref(value('legalTermsHref', '/dieu-khoan-su-dung')) || '/dieu-khoan-su-dung'}>{value('legalTermsLabel', 'Điều khoản sử dụng')}</a><a href={safeHref(value('legalPrivacyHref', '/chinh-sach-quyen-rieng-tu')) || '/chinh-sach-quyen-rieng-tu'}>{value('legalPrivacyLabel', 'Chính sách quyền riêng tư')}</a></nav></div>
      </div>
    </footer>
    <a className="btn-zalo btn-frame text-decoration-none hidden_m2" target="_blank" rel="noreferrer" href={zaloHref(zalo)}>
      <div className="animated infinite zoomIn kenit-alo-circle"/><div className="animated infinite pulse kenit-alo-circle-fill"/><i><img src="/assets/images/zl.png" alt="Zalo" className="no_lazy"/></i>
    </a>
    <a className="btn-phone btn-frame text-decoration-none hidden_m2" href="#" data-fancybox data-src="#nutgoi">
      <div className="animated infinite zoomIn kenit-alo-circle"/><div className="animated infinite pulse kenit-alo-circle-fill"/><i><img src="/assets/images/hl.png" alt="Hotline" className="no_lazy"/></i>
    </a>
    <div id="nutgoi"><Markup html={shared.contacts}/></div>
  </>;
}
