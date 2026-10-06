"use client";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import shared from '@/data/shared.json';
import { SaleLoginButton } from '@/components/sale/SaleAccess';
import type { Service } from '@/lib/public-api';

interface MenuItem { label:string;title?:string;href?:string;target?:string;className?:string;children:MenuItem[]; }
function MenuList({items,mobile=false,close,depth=0,className,style}:{items:MenuItem[];mobile?:boolean;close:()=>void;depth?:number;className?:string;style?:CSSProperties}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const pathname=usePathname();
  const legacyActive=(shared.activeMenus as Record<string,string>)[pathname];
  const active=pathname === '/tien-ich/tra-cuu-phat-nguoi' ? 'Phạt nguội' : pathname.startsWith('/tien-ich/') || pathname === '/bai-viet' || pathname === '/tin-tuc' || pathname.startsWith('/cau-hoi') || pathname.startsWith('/kinh-nghiem-su-dung-xe/') || legacyActive === 'Tin tức' ? 'Khám phá' : pathname === '/dich-vu' || pathname.startsWith('/dich-vu/') || pathname.startsWith('/phu-kien-o-to') ? 'Dịch vụ' : pathname === '/tuyen-dung' || pathname.startsWith('/tuyen-dung/') ? 'Tuyển dụng' : legacyActive;
  return <ul className={className} style={style}>{items.map(item=>{
    const hasSubmenu=(depth > 0 || item.label === 'Dịch vụ') ? item.children.length > 0 : item.children.length > 1;
    const destination=item.children.length===1?item.children[0]:item;
    const directHref=depth===0?(item.label==='Mua xe'?'/san-pham':item.label==='Bán xe'?'/ban-xe':undefined):undefined;
    const isExpanded=mobile&&expanded===item.label;
    return <li className={[item.className,hasSubmenu?'has-submenu':'',directHref?'has-direct-link':''].filter(Boolean).join(' ')} key={item.label}>
      <a href={directHref||(hasSubmenu?undefined:destination.href)} target={destination.target} rel={destination.target?'noreferrer':undefined} title={item.title||item.label}
        role={hasSubmenu&&!directHref?'button':undefined} tabIndex={hasSubmenu&&!directHref?0:undefined}
        aria-haspopup={hasSubmenu&&!directHref?'menu':undefined} aria-expanded={hasSubmenu&&mobile&&!directHref?isExpanded:undefined}
        className={[isExpanded?'active2':'',active===item.label.trim()||destination.href===pathname?'active':''].filter(Boolean).join(' ')}
        onClick={event=>{if(hasSubmenu&&!directHref){event.preventDefault();if(mobile)setExpanded(isExpanded?null:item.label);}else close();}}
        onKeyDown={event=>{if(hasSubmenu&&!directHref&&(event.key===' '||event.key==='Enter')){event.preventDefault();if(mobile)setExpanded(isExpanded?null:item.label);}}}>
        {item.label}{hasSubmenu&&mobile&&!directHref&&<span className="mobile-menu-chevron" aria-hidden="true"/>}
      </a>
      {hasSubmenu&&mobile&&directHref&&<button type="button" className={`mobile-submenu-toggle${isExpanded?' is-expanded':''}`} aria-label={`Danh sách ${item.label.toLowerCase()}`} aria-expanded={isExpanded} onClick={()=>setExpanded(isExpanded?null:item.label)}><span className="mobile-menu-chevron" aria-hidden="true"/></button>}
      {hasSubmenu&&<MenuList items={item.children} mobile={mobile} close={close} depth={depth+1} className={item.label==='Tiện ích'?'menu-utilities':undefined} style={mobile?{display:isExpanded?'block':'none'}:undefined}/>}
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
  const pendingHomeTop = useRef(false);
  useEffect(() => {
    if (pathname !== '/' || !pendingHomeTop.current) return;
    pendingHomeTop.current = false;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
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
    } else {
      pendingHomeTop.current = true;
    }
  };
  const existingMenu = (label:string) => shared.menu.find(item => item.label===label)!;
  const repair = services.find(service => /sửa chữa/i.test(service.title)) || services.find(service => service.slug==='tram-dich-vu-toan-trung');
  const transport = services.find(service => /vận chuyển/i.test(service.title) || service.slug==='dich-vu-van-chuyen');
  const utilityMenu = existingMenu('Tiện ích');
  const utility = (href:string,label:string):MenuItem => ({ ...utilityMenu.children.find(item=>item.href===href), label, href, children:[] });
  const menu:MenuItem[] = [
    existingMenu('Mua xe'), existingMenu('Bán xe'),
    { label:'Dịch vụ', href:'/dich-vu', children:[
      { label:'Sửa chữa ô tô', href:repair?`/dich-vu/${repair.slug}`:'/dich-vu', children:[] },
      { label:'Nâng cấp - Lắp đặt phụ kiện', href:'/phu-kien-o-to', children:[] },
      { label:'Vận chuyển', href:transport?`/dich-vu/${transport.slug}`:'/dich-vu', children:[] },
    ] },
    { ...utility('/tien-ich/tra-cuu-phat-nguoi','Phạt nguội'), title:'Tra cứu phạt nguội' },
    existingMenu('Giới thiệu'), { label:'Tuyển dụng', href:'/tuyen-dung', children:[] },
    { label:'Khám phá', className:'menu-discovery', children:[
      { label:'Bài viết', href:'/bai-viet', children:[] },
      { label:'Tiện ích', children:[
        utility('/tien-ich/xem-ngay-mua-xe','Xem ngày mua xe'),
        utility('/tien-ich/xem-gia-xang-dau','Xem giá xăng dầu'),
        utility('/tien-ich/dinh-gia-xe','Định giá xe cũ'),
        utility('/tien-ich/mua-xe-theo-nhu-cau','Mua xe theo nhu cầu'),
      ] },
    ] },
  ];
  return <>
    <div className="wap_header clear hidden_m"><div className="wap_header2 main_fix">
      <div className="header"><Link className="logo" href="/" scroll={false} aria-label="Về đầu trang chủ" onClick={goHomeTop}>{logo}</Link></div>
      <div className="wap_menu clear"><div className="menu" role="navigation" aria-label="Điều hướng chính">
        <MenuList items={menu} close={()=>setOpen(false)}/>
        <HeaderActions phone={phone} />
      </div></div>
    </div></div>
    <div className={`menu_mobi_add hidden_d${open?' menu_mobi_active':''}`} aria-hidden={!open}>
      <div className="logo_m logo"><Link href="/" scroll={false} aria-label="Về đầu trang chủ" onClick={goHomeTop}>{mobileLogo}</Link><span className="close_menu" role="button" tabIndex={0} aria-label="Đóng menu" onClick={()=>setOpen(false)}/></div>
      <MenuList items={menu} mobile close={()=>setOpen(false)}/><HeaderActions phone={phone} onSaleAction={()=>setOpen(false)} />
    </div>
    <div className="menu_mobi hidden_d">
      <p className="menu_baophu" style={{display:open?'block':'none'}} onClick={()=>setOpen(false)}/>
      <p className="icon_menu_mobi" role="button" tabIndex={0} aria-label="Mở menu" aria-expanded={open} onClick={()=>setOpen(true)}><i className="fas fa-bars"/></p>
      <Link className="logo" href="/" scroll={false} aria-label="Về đầu trang chủ" onClick={goHomeTop}>{mobileLogo}</Link><SaleLoginButton onAction={()=>setOpen(false)} />
    </div>
  </>;
}
