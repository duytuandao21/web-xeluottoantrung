"use client";
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import shared from '@/data/shared.json';

interface MenuItem { label:string;href?:string;target?:string;className?:string;children:MenuItem[]; }
function MenuList({items,mobile=false,close}:{items:MenuItem[];mobile?:boolean;close:()=>void}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const pathname=usePathname();
  const active=(shared.activeMenus as Record<string,string>)[pathname];
  return <ul>{items.map(item=>{
    const hasSubmenu=item.children.length>1;
    const destination=item.children.length===1?item.children[0]:item;
    const isExpanded=mobile&&expanded===item.label;
    return <li className={[item.className,hasSubmenu?'has-submenu':''].filter(Boolean).join(' ')} key={item.label}>
      <a href={hasSubmenu?undefined:destination.href} target={destination.target} rel={destination.target?'noreferrer':undefined} title={item.label}
        role={hasSubmenu?'button':undefined} tabIndex={hasSubmenu?0:undefined}
        aria-haspopup={hasSubmenu?'menu':undefined} aria-expanded={hasSubmenu&&mobile?isExpanded:undefined}
        className={[isExpanded?'active2':'',active===item.label.trim()?'active':''].filter(Boolean).join(' ')}
        onClick={event=>{if(hasSubmenu){event.preventDefault();if(mobile)setExpanded(isExpanded?null:item.label);}else close();}}
        onKeyDown={event=>{if(hasSubmenu&&event.key===' '){event.preventDefault();if(mobile)setExpanded(isExpanded?null:item.label);}}}>
        {item.label}{hasSubmenu&&mobile&&<span className="mobile-menu-chevron" aria-hidden="true"/>}
      </a>
      {hasSubmenu&&<ul style={mobile?{display:isExpanded?'block':'none'}:undefined}>{item.children.map(child=><li key={child.label}>{child.href?<a href={child.href} target={child.target} rel={child.target?'noreferrer':undefined} onClick={close}>{child.label}</a>:<span className="menu-coming-soon" title="Tính năng đang được xây dựng">{child.label}</span>}</li>)}</ul>}
    </li>;
  })}</ul>;
}
function HeaderActions({ phone }: { phone?: string }) {
  return <div className="header-actions">
    <p className="hotline">{phone || '0777393913'}</p>
  </div>;
}
export default function Header({ phone }: { phone?: string }) {
  const [open,setOpen]=useState(false);const pathname=usePathname();
  useEffect(()=>setOpen(false),[pathname]);
  useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[open]);
  const logo=<img src="/upload/photo/logo-tt-gold-6981.png" alt="Logo"/>;
  return <>
    <div className="wap_header clear hidden_m"><div className="wap_header2 main_fix">
      <div className="header"><Link className="logo" href="/">{logo}</Link></div>
      <div className="wap_menu clear"><div className="menu" role="navigation" aria-label="Điều hướng chính">
        <MenuList items={shared.menu} close={()=>setOpen(false)}/>
        <HeaderActions phone={phone} />
      </div></div>
    </div></div>
    <div className={`menu_mobi_add hidden_d${open?' menu_mobi_active':''}`} aria-hidden={!open}>
      <div className="logo_m logo">{logo}<span className="close_menu" role="button" tabIndex={0} aria-label="Đóng menu" onClick={()=>setOpen(false)}/></div>
      <MenuList items={shared.menu} mobile close={()=>setOpen(false)}/><HeaderActions phone={phone} />
    </div>
    <div className="menu_mobi hidden_d">
      <p className="menu_baophu" style={{display:open?'block':'none'}} onClick={()=>setOpen(false)}/>
      <p className="icon_menu_mobi" role="button" tabIndex={0} aria-label="Mở menu" aria-expanded={open} onClick={()=>setOpen(true)}><i className="fas fa-bars"/></p>
      <Link className="logo" href="/">{logo}</Link><span className="menu-mobile-spacer" aria-hidden="true"/>
    </div>
  </>;
}
