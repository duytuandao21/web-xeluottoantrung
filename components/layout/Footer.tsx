"use client";

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import shared from '@/data/shared.json';
import Markup from '@/components/common/Markup';
import { submitPublic } from '@/lib/public-client';

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

export default function Footer({ showrooms, phone, address }: { showrooms: { region: string; locations: { name: string; address: string }[] }[]; phone?: string; address?: string }) {
  const [newsletterNotice, setNewsletterNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
            <p>Hệ thống mua bán ô tô đã qua sử dụng, hướng tới trải nghiệm minh bạch, thuận tiện và chuyên nghiệp cho khách hàng.</p>
            <div className="tt-footer-social" aria-label="Mạng xã hội">{socials.map(social => <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} title={social.label}><img src={social.image} alt="" /></a>)}</div>
          </div>
          <div><h2 className="tt-footer-heading">Dịch vụ</h2><FooterLinks links={serviceLinks} /></div>
          <div><h2 className="tt-footer-heading">Về Toàn Trung</h2><FooterLinks links={aboutLinks} /></div>
          <div className="tt-footer-contact" id="tt-footer-contact">
            <h2 className="tt-footer-heading">Liên hệ nhanh</h2>
            <div className="tt-footer-contact-row"><span className="tt-footer-contact-icon" aria-hidden="true">☎</span><div><small>Tổng đài hỗ trợ</small><a href={`tel:${(phone || '0777393913').replace(/\D/g, '')}`}>{phone || '0777 393 913'}</a></div></div>
            <div className="tt-footer-contact-row"><span className="tt-footer-contact-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg></span><div><small>Trụ sở</small><span>{address || '338–340–342–344 Hùng Vương, Phường Pleiku, Tỉnh Gia Lai'}</span></div></div>
            <div className="tt-footer-contact-row"><span className="tt-footer-contact-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9Z" /></svg></span><div><small>Website</small><Link href="/">xeluottoantrung.com</Link></div></div>
          </div>
        </div>

        <section className="tt-footer-news-cert" aria-label="Chứng nhận và đăng ký nhận tin">
          <div className="tt-footer-cert">
            <h2 className="tt-footer-heading">Chứng nhận</h2>
            <RegisteredBadge />
          </div>
          <div className="tt-footer-news">
            <h2 className="tt-footer-heading">Đăng ký nhận tin từ Toàn Trung</h2>
            <p>Nhận thông tin xe mới về, chương trình ưu đãi và những cập nhật mới nhất.</p>
            <form className="tt-footer-news-form" onSubmit={submitNewsletter}>
              <input type="email" name="email" autoComplete="email" required aria-label="Địa chỉ email" placeholder="Nhập email của bạn" onChange={() => setNewsletterNotice('')} />
              <button type="submit" disabled={submitting}>{submitting ? 'Đang gửi...' : 'Đăng ký'}</button>
            </form>
            {newsletterNotice && <p className="tt-footer-news-notice" role="status">{newsletterNotice}</p>}
          </div>
        </section>

        <section className="tt-footer-showrooms" id="tt-showrooms">
          <h2 className="tt-footer-heading">Hệ thống showroom</h2>
          <div className="tt-footer-showroom-grid">{showrooms.map(group => <div className="tt-footer-showroom-card" key={group.region}>
            <h3>{group.region}</h3>
            <ul>{group.locations.map(location => <li key={location.name}><strong>{location.name}</strong><span>{location.address}</span></li>)}</ul>
          </div>)}</div>
        </section>

        <section className="tt-footer-legal" aria-label="Thông tin doanh nghiệp">
          <div><h2>CÔNG TY TNHH MỘT THÀNH VIÊN TOÀN TRUNG</h2><p>Thông tin pháp lý doanh nghiệp</p></div>
          <div><small>GCNĐKDN / MST</small><strong>5900674378</strong><span>Ngày cấp: 06/01/2010</span></div>
          <div><small>Điện thoại</small><a href="tel:0777393912">0777 393 912</a></div>
          <div><small>Địa chỉ trụ sở</small><span>{address || '338–340–342–344 Hùng Vương, Phường Pleiku, Tỉnh Gia Lai, Việt Nam'}</span></div>
        </section>

        <div className="tt-footer-bottom"><span>© Auto Toàn Trung. All rights reserved.</span><nav aria-label="Chính sách"><Link href="/dieu-khoan-su-dung">Điều khoản sử dụng</Link><Link href="/chinh-sach-quyen-rieng-tu">Chính sách quyền riêng tư</Link></nav></div>
      </div>
    </footer>
    <a className="btn-zalo btn-frame text-decoration-none hidden_m2" target="_blank" rel="noreferrer" href="https://zalo.me/0777393913">
      <div className="animated infinite zoomIn kenit-alo-circle"/><div className="animated infinite pulse kenit-alo-circle-fill"/><i><img src="/assets/images/zl.png" alt="Zalo" className="no_lazy"/></i>
    </a>
    <a className="btn-phone btn-frame text-decoration-none hidden_m2" href="#" data-fancybox data-src="#nutgoi">
      <div className="animated infinite zoomIn kenit-alo-circle"/><div className="animated infinite pulse kenit-alo-circle-fill"/><i><img src="/assets/images/hl.png" alt="Hotline" className="no_lazy"/></i>
    </a>
    <div id="nutgoi"><Markup html={shared.contacts}/></div>
  </>;
}
