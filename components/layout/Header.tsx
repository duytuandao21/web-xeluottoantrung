"use client";
import { useEffect, useState, type MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import shared from '@/data/shared.json';
import { SaleLoginButton } from '@/components/sale/SaleAccess';
import type { Service } from '@/lib/public-api';

interface MenuItem { label:string;href?:string;target?:string;className?:string;children:MenuItem[]; }
function MenuList({items,mobile=false,close}:{items:MenuItem[];mobile?:boolean;close:()=>void}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const pathname=usePathname();
  const legacyActive=(shared.activeMenus as Record<string,string>)[pathname];
  const active=pathname === '/bai-viet' || pathname === '/tin-tuc' || pathname.startsWith('/cau-hoi') || pathname.startsWith('/kinh-nghiem-su-dung-xe/') || legacyActive === 'Tin tức' ? 'Bài viết' : pathname === '/dich-vu' || pathname.startsWith('/dich-vu/') ? 'Dịch vụ' : pathname === '/tuyen-dung' || pathname.startsWith('/tuyen-dung/') ? 'Tuyển dụng' : legacyActive;
  return <ul>{items.map(item=>{
    const hasSubmenu=item.label === 'Dịch vụ' ? item.children.length > 0 : item.children.length > 1;
    const destination=item.children.length===1?item.children[0]:item;
    const directHref=item.label==='Mua xe'?'/san-pham':item.label==='Bán xe'?'/ban-xe':undefined;
    const isExpanded=mobile&&expanded===item.label;
    return <li className={[item.className,hasSubmenu?'has-submenu':'',directHref?'has-direct-link':''].filter(Boolean).join(' ')} key={item.label}>
      <a href={directHref||(hasSubmenu?undefined:destination.href)} target={destination.target} rel={destination.target?'noreferrer':undefined} title={item.label}
        role={hasSubmenu&&!directHref?'button':undefined} tabIndex={hasSubmenu&&!directHref?0:undefined}
        aria-haspopup={hasSubmenu&&!directHref?'menu':undefined} aria-expanded={hasSubmenu&&mobile&&!directHref?isExpanded:undefined}
        className={[isExpanded?'active2':'',active===item.label.trim()?'active':''].filter(Boolean).join(' ')}
        onClick={event=>{if(hasSubmenu&&!directHref){event.preventDefault();if(mobile)setExpanded(isExpanded?null:item.label);}else close();}}
        onKeyDown={event=>{if(hasSubmenu&&!directHref&&event.key===' '){event.preventDefault();if(mobile)setExpanded(isExpanded?null:item.label);}}}>
        {item.label}{hasSubmenu&&mobile&&!directHref&&<span className="mobile-menu-chevron" aria-hidden="true"/>}
      </a>
      {hasSubmenu&&mobile&&directHref&&<button type="button" className={`mobile-submenu-toggle${isExpanded?' is-expanded':''}`} aria-label={`Danh sách ${item.label.toLowerCase()}`} aria-expanded={isExpanded} onClick={()=>setExpanded(isExpanded?null:item.label)}><span className="mobile-menu-chevron" aria-hidden="true"/></button>}
      {hasSubmenu&&<ul style={mobile?{display:isExpanded?'block':'none'}:undefined}>{item.children.map(child=><li key={child.label}>{child.href?<a href={child.href} target={child.target} rel={child.target?'noreferrer':undefined} onClick={close}>{child.label}</a>:<span className="menu-coming-soon" title="Tính năng đang được xây dựng">{child.label}</span>}</li>)}</ul>}
    </li>;
  })}</ul>;
}
function HeaderActions({ phone, onSaleAction }: { phone?: string; onSaleAction?: () => void }) {
  return <div className="header-actions">
    <p className="hotline">{phone || '0777393913'}</p>
    <SaleLoginButton onAction={onSaleAction} />
  </div>;
}
export default function Header({ phone, services = [], logoUrl, mobileLogoUrl }: { phone?: string; services?: Service[]; logoUrl: string; mobileLogoUrl: string }) {
  const [open,setOpen]=useState(false);const pathname=usePathname();
  useEffect(()=>setOpen(false),[pathname]);
  useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[open]);
  const logo=<img src={logoUrl} alt="Logo Toàn Trung" data-header-logo />;
  const mobileLogo=<img src={mobileLogoUrl} alt="Logo Toàn Trung" data-header-logo />;
  const goHomeTop = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setOpen(false);
    if (pathname === '/') {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };
  const menu:MenuItem[] = shared.menu.map(item => item.label === 'Dịch vụ' ? {
    ...item,
    href: '/dich-vu',
    children: services.map(service => ({ label: service.title, href: `/dich-vu/${service.slug}`, children: [] })),
  } : item.label === 'Tin tức' ? { ...item, label: 'Bài viết', href: '/bai-viet', children: [] } : item.label === 'Tuyển dụng' ? { ...item, href: '/tuyen-dung', children: [] } : item);
  return <>
    <div className="wap_header clear hidden_m"><div className="wap_header2 main_fix">
      <div className="header"><a className="logo" href="/#top" aria-label="Về đầu trang chủ" onClick={goHomeTop}>{logo}</a></div>
      <div className="wap_menu clear"><div className="menu" role="navigation" aria-label="Điều hướng chính">
        <MenuList items={menu} close={()=>setOpen(false)}/>
        <HeaderActions phone={phone} />
      </div></div>
    </div></div>
    <div className={`menu_mobi_add hidden_d${open?' menu_mobi_active':''}`} aria-hidden={!open}>
      <div className="logo_m logo"><a href="/#top" aria-label="Về đầu trang chủ" onClick={goHomeTop}>{mobileLogo}</a><span className="close_menu" role="button" tabIndex={0} aria-label="Đóng menu" onClick={()=>setOpen(false)}/></div>
      <MenuList items={menu} mobile close={()=>setOpen(false)}/><HeaderActions phone={phone} onSaleAction={()=>setOpen(false)} />
    </div>
    <div className="menu_mobi hidden_d">
      <p className="menu_baophu" style={{display:open?'block':'none'}} onClick={()=>setOpen(false)}/>
      <p className="icon_menu_mobi" role="button" tabIndex={0} aria-label="Mở menu" aria-expanded={open} onClick={()=>setOpen(true)}><i className="fas fa-bars"/></p>
      <a className="logo" href="/#top" aria-label="Về đầu trang chủ" onClick={goHomeTop}>{mobileLogo}</a><SaleLoginButton onAction={()=>setOpen(false)} />
    </div>
  </>;
}
