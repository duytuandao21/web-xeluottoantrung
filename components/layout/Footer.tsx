"use client";
import shared from '@/data/shared.json';
import Markup from '@/components/common/Markup';

export default function Footer() {
  return <>
    <Markup html={shared.footer + shared.copyright}/>
    <a className="btn-zalo btn-frame text-decoration-none hidden_m2" target="_blank" rel="noreferrer" href="https://zalo.me/0777393913">
      <div className="animated infinite zoomIn kenit-alo-circle"/><div className="animated infinite pulse kenit-alo-circle-fill"/><i><img src="/assets/images/zl.png" alt="Zalo" className="no_lazy"/></i>
    </a>
    <a className="btn-phone btn-frame text-decoration-none hidden_m2" href="#" data-fancybox data-src="#nutgoi">
      <div className="animated infinite zoomIn kenit-alo-circle"/><div className="animated infinite pulse kenit-alo-circle-fill"/><i><img src="/assets/images/hl.png" alt="Hotline" className="no_lazy"/></i>
    </a>
    <div id="nutgoi"><Markup html={shared.contacts}/></div>
  </>;
}
