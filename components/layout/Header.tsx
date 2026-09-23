"use client";
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import shared from '@/data/shared.json';

interface MenuItem { label:string;href?:string;target?:string;className?:string;children:MenuItem[]; }
function MenuList({items,mobile=false,close}:{items:MenuItem[];mobile?:boolean;close:()=>void}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const pathname=usePathname();
  const active=(shared.activeMenus as Record<string,string>)[pathname];
  return <ul>{items.map(item=><li className={item.className} key={item.label}>
    <a href={item.href} target={item.target} rel={item.target?'noreferrer':undefined} title={item.label} className={[mobile&&expanded===item.label?'active2':'',active===item.label.trim()?'active':''].join(' ')}
      onClick={event=>{if(mobile && item.children.length && (!item.href || (event.target as HTMLElement).closest('i'))) {event.preventDefault();setExpanded(expanded===item.label?null:item.label);} else if(item.href) close();}}>
      {item.label}{mobile && item.children.length>0 && <i className="fas fa-chevron-right"/>}
    </a>
    {item.children.length>0 && <ul style={mobile?{display:expanded===item.label?'block':'none'}:undefined}>{item.children.map(child=><li key={child.label}><a href={child.href} target={child.target} rel={child.target?'noreferrer':undefined} onClick={close}>{child.label}</a></li>)}</ul>}
  </li>)}</ul>;
}
export default function Header() {
  const [open,setOpen]=useState(false);const pathname=usePathname();
  useEffect(()=>setOpen(false),[pathname]);
  useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[open]);
  const logo=<img src="/upload/photo/logo-tt-gold-6981.png" alt="Logo"/>;
  return <>
    <div className="wap_header clear hidden_m"><div className="wap_header2 main_fix">
      <div className="header"><a className="logo" href="/">{logo}</a></div>
      <div className="wap_menu clear"><div className="menu" role="navigation" aria-label="Điều hướng chính">
        <MenuList items={shared.menu} close={()=>setOpen(false)}/>
        <p className="hotline">0777393913</p>
        <div className="user_login"><a href="/account/dang-nhap"><span>Đăng nhập</span></a>/{' '}<a href="/account/dang-ky"><span>Đăng ký</span></a></div>
      </div></div>
    </div></div>
    <div className={`menu_mobi_add hidden_d${open?' menu_mobi_active':''}`} aria-hidden={!open}>
      <div className="logo_m logo">{logo}<span className="close_menu" role="button" tabIndex={0} aria-label="Đóng menu" onClick={()=>setOpen(false)}/></div>
      <MenuList items={shared.menu} mobile close={()=>setOpen(false)}/><p className="hotline">0777393913</p>
    </div>
    <div className="menu_mobi hidden_d">
      <p className="menu_baophu" style={{display:open?'block':'none'}} onClick={()=>setOpen(false)}/>
      <p className="icon_menu_mobi" role="button" tabIndex={0} aria-label="Mở menu" aria-expanded={open} onClick={()=>setOpen(true)}><i className="fas fa-bars"/></p>
      <a className="logo" href="/">{logo}</a><a href="/account/dang-nhap" className="icon_login" aria-label="Đăng nhập"/>
    </div>
  </>;
}
