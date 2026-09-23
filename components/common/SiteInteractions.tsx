"use client";
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import Markup from './Markup';

type Dialog = {html?:string;className?:string;id?:string;images?:{src:string;alt:string}[];index?:number};

export default function SiteInteractions() {
  const pathname=usePathname(); const query=useSearchParams();
  const [dialog,setDialog]=useState<Dialog|null>(null);
  const [showTop,setShowTop]=useState(false);
  const [comparison,setComparison]=useState<{id:string;html:string}[]>([]);
  const [comparisonHost,setComparisonHost]=useState<HTMLElement|null>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const sourceRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!dialog)return;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialogRef.current?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape')setDialog(null);
      if(dialog.images && ['ArrowLeft','ArrowRight'].includes(e.key)) setDialog(d=>d?.images?{...d,index:((d.index||0)+(e.key==='ArrowLeft'?-1:1)+d.images.length)%d.images.length}:d);
      if(e.key==='Tab') {
        const controls=dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button,input:not([type=hidden]),select,textarea,[tabindex="0"]');
        if(!controls?.length)return;
        const first=controls[0],last=controls[controls.length-1];
        if(e.shiftKey && (document.activeElement===first || document.activeElement===dialogRef.current)){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);if(sourceRef.current&&dialog.id){sourceRef.current.id=dialog.id;sourceRef.current=null;}previous?.focus();};
  },[dialog]);

  useEffect(()=>{
    setDialog(null);document.body.classList.remove('ss');
    setComparison([]);setComparisonHost(document.querySelector<HTMLElement>('.wap_sosanhxe'));
    const cleanups:(()=>void)[]=[];
    const selectTab=(selector:string)=>{
      document.querySelectorAll<HTMLElement>('.tab_bl').forEach(el=>{el.style.display=el.matches(selector)?'block':'none';});
      document.querySelectorAll<HTMLElement>('.boloc_l li').forEach(el=>el.classList.toggle('active',el.dataset.id===selector));
    };
    if(document.querySelector('.hangxe_tk')) selectTab('.hangxe_tk');
    for(const kind of ['ngansach','nam','sokm']) {
      const track=document.getElementById(`${kind}-range`);
      const lower=document.querySelector<HTMLInputElement>(`.gt_${kind}1`),upper=document.querySelector<HTMLInputElement>(`.gt_${kind}2`);
      if(!track||!lower||!upper)continue;
      const min=kind==='ngansach'?300:kind==='sokm'?0:Number(lower.defaultValue)||2011;
      const max=kind==='ngansach'?5000:kind==='sokm'?170000:Number(upper.defaultValue)||2024;
      const step=kind==='ngansach'?10:kind==='sokm'?1000:1;
      track.className='ui-slider ui-corner-all ui-slider-horizontal ui-widget ui-widget-content migrated-range';
      const fill=document.createElement('div');fill.className='ui-slider-range ui-corner-all ui-widget-header';track.append(fill);
      const inputs=[lower,upper];
      const handles=inputs.map((input,index)=>{const handle=document.createElement('span');handle.className='ui-slider-handle ui-corner-all ui-state-default';handle.tabIndex=0;handle.setAttribute('role','slider');handle.setAttribute('aria-label',`${kind} ${index===0?'tối thiểu':'tối đa'}`);track.append(handle);return handle;});
      const update=()=>{
        const vals=inputs.map(el=>Number(el.value)||min);
        handles.forEach((handle,index)=>{const value=vals[index];handle.style.left=`${(value-min)/(max-min)*100}%`;handle.textContent=kind==='ngansach'?(value>=1000?`${(value/1000).toFixed(1)} tỷ`:`${value} triệu`):kind==='sokm'?`${value.toLocaleString('vi-VN')} km`:String(value);handle.setAttribute('aria-valuenow',String(value));handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));});
        fill.style.left=handles[0].style.left;fill.style.width=`${(vals[1]-vals[0])/(max-min)*100}%`;
      };
      handles.forEach((handle,index)=>{
        const move=(e:PointerEvent)=>{const rect=track.getBoundingClientRect();const value=Math.round((min+(e.clientX-rect.left)/rect.width*(max-min))/step)*step;inputs[index].value=String(Math.max(index===1?Number(lower.value):min,Math.min(index===0?Number(upper.value):max,value)));update();};
        const down=(e:PointerEvent)=>{e.preventDefault();handle.setPointerCapture(e.pointerId);move(e);handle.addEventListener('pointermove',move);};
        const up=()=>handle.removeEventListener('pointermove',move);
        const key=(e:KeyboardEvent)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();inputs[index].value=String(Math.max(index===1?Number(lower.value):min,Math.min(index===0?Number(upper.value):max,Number(inputs[index].value)+(['ArrowRight','ArrowUp'].includes(e.key)?step:-step))));update();};
        handle.addEventListener('pointerdown',down);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);handle.addEventListener('keydown',key);
        cleanups.push(()=>{handle.removeEventListener('pointerdown',down);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);handle.removeEventListener('pointermove',move);handle.removeEventListener('keydown',key);handle.remove();});
      });
      inputs.forEach(input=>{input.addEventListener('input',update);cleanups.push(()=>input.removeEventListener('input',update));});
      update();cleanups.push(()=>fill.remove());
    }
    const notify=(text:string)=>setDialog({html:`<p>${text}</p>`});
    const updateComparison=()=>{
      setComparison([...document.querySelectorAll<HTMLElement>('.id_ss_active')].map(el=>{
        const card=el.closest('.item')!;
        const image=card.querySelector('.slick-slide:not(.slick-cloned) img')?.outerHTML||'';
        return {id:el.dataset.id!,html:image+(card.querySelector('.mota')?.outerHTML||'')};
      }));
    };
    const onClick=(event:MouseEvent)=>{
      const target=event.target as HTMLElement;
      if(target.closest('.fancybox-container'))return;
      const trigger=target.closest<HTMLElement>('[data-src^="#"]');
      if(trigger){const modal=document.querySelector<HTMLElement>(trigger.dataset.src!);if(modal){event.preventDefault();const id=modal.id;sourceRef.current=modal;modal.id=`${id}-source`;modal.style.display='none';setDialog({html:modal.innerHTML,className:modal.className,id});return;}}
      const gallery=target.closest<HTMLElement>('[data-gallery="vehicle"]');
      if(gallery){event.preventDefault();const links=[...document.querySelectorAll<HTMLAnchorElement>('.album_pro .slick-slide:not(.slick-cloned) a')];setDialog({images:links.map(a=>({src:a.href,alt:a.querySelector('img')?.alt||''})),index:Number(gallery.dataset.index)});return;}
      const footer=target.closest('.title_f i');if(footer){footer.closest('.item_f')?.classList.toggle('item_f_active');return;}
      const read=target.closest('.noidung_anhien .xemthem,.noidung_anhien .anbot');if(read){event.preventDefault();read.closest('.noidung_anhien')?.classList.toggle('noidung_anhien_active',read.classList.contains('xemthem'));return;}
      const staff=target.closest('.item_tv .ten');if(staff){const parent=staff.closest('.item_tv');const was=parent?.classList.contains('item_tv_active');document.querySelectorAll('.item_tv_active').forEach(el=>el.classList.remove('item_tv_active'));if(!was)parent?.classList.add('item_tv_active');window.scrollTo({top:staff.getBoundingClientRect().top+scrollY-80,behavior:'smooth'});return;}
      const filter=target.closest<HTMLElement>('.chonloc li,.boloc_l li');if(filter){selectTab(filter.dataset.id||'.hangxe_tk');document.querySelector('.wap_boloc')?.classList.add('wap_boloc_active');return;}
      if(target.closest('.dong_boloc,.close_boloc')){document.querySelector('.wap_boloc')?.classList.remove('wap_boloc_active');document.querySelector('.wap_sosanhxe')?.classList.remove('wap_sosanhxe_active');return;}
      const choice=target.closest<HTMLElement>('.goiy_hangxe p,.goiy_kieudang p,.goiy_hopso p,.goiy_mausac p,.goiy_mucgia p');
      if(choice){const active=choice.classList.contains('active_tk');if(choice.closest('.goiy_mucgia'))choice.parentElement?.querySelectorAll('p').forEach(el=>el.classList.remove('active_tk'));choice.classList.toggle('active_tk',!active);return;}
      const preset=target.closest<HTMLElement>('[data-gia1]');if(preset){const group=preset.parentElement!;group.querySelectorAll('p').forEach(el=>el.classList.remove('active_tk'));preset.classList.add('active_tk');const kind=['ngansach','nam','sokm'].find(k=>group.classList.contains(`goiy_${k}`));if(kind)[1,2].forEach(n=>{const input=document.querySelector<HTMLInputElement>(`.gt_${kind}${n}`);if(input){input.value=preset.dataset[`gia${n}`]||'';input.dispatchEvent(new Event('input'));}});return;}
      if(target.closest('.lammoi')){document.querySelectorAll('.boloc_r .active_tk').forEach(el=>el.classList.remove('active_tk'));document.querySelectorAll<HTMLInputElement>('.gt_ngansach input').forEach(el=>{el.value=el.defaultValue;el.dispatchEvent(new Event('input'));});return;}
      if(target.closest('.apdung')){
        const params=new URLSearchParams();
        for(const [name,key] of [['hangxe','hang-xe'],['kieudang','kieu-dang'],['hopso','hop-so'],['mausac','mau-sac'],['mucgia','gia']]) {const values=[...document.querySelectorAll<HTMLElement>(`.goiy_${name} .active_tk`)].map(el=>el.dataset.id);if(values.length)params.set(key,values.join(','));}
        for(const [name,key] of [['ngansach','ngan-sach'],['nam','nam-san-xuat'],['sokm','so-km']]) {const a=document.querySelector<HTMLInputElement>(`.gt_${name}1`),b=document.querySelector<HTMLInputElement>(`.gt_${name}2`);if(a&&b)params.set(key,`${a.value}-${b.value}`);}
        window.location.href=`/tim-kiem-nang-cao?${params}`;return;
      }
      if(target.closest('.c_sosanh')){document.body.classList.toggle('ss');return;}
      if(target.closest('.wap_sosanhxe .td')){document.querySelector('.wap_sosanhxe')?.classList.toggle('wap_sosanhxe_active');return;}
      const remove=target.closest<HTMLElement>('.xoa_ss');if(remove){document.querySelectorAll<HTMLElement>('.id_ss_active').forEach(el=>{if(el.dataset.id===remove.dataset.id)el.classList.remove('id_ss_active');});updateComparison();return;}
      const compare=target.closest<HTMLElement>('.id_ss');if(compare){const selected=document.querySelectorAll('.id_ss_active');if(!compare.classList.contains('id_ss_active')&&selected.length>=2){notify('Chỉ so sánh 2 xe. Vui lòng tắt bớt xe.');return;}compare.classList.toggle('id_ss_active');document.querySelector('.wap_sosanhxe')?.classList.add('wap_sosanhxe_active');updateComparison();return;}
      const service=target.closest<HTMLElement>('.cap1 li');if(service && !service.classList.contains('active')){const routes:Record<string,string>={'buoc-mua-xe':'/san-pham','buoc-ban-xe':'/ban-xe','buoc-len-doi':'/len-doi'};const route=routes[service.dataset.id||''];if(route)window.location.href=route;return;}
      if(target.closest('.load_them')){event.preventDefault();notify('Vui lòng xem các xe hiện có trong mục Mua xe.');return;}
      if(target.closest('.c_tragop')){notify('Vui lòng liên hệ 0777393913 để được tư vấn trả góp.');return;}
    };
    const submit=(event:SubmitEvent)=>{
      const form=event.target as HTMLFormElement;event.preventDefault();
      form.classList.add('was-validated');if(!form.checkValidity()){form.reportValidity();return;}
      if(form.closest('.banxe')){window.location.href='/ban-xe';return;}
      notify('Hiện chưa thể gửi yêu cầu trực tuyến. Vui lòng liên hệ 0777393913 để được hỗ trợ.');
    };
    const keys=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){document.querySelector('.wap_boloc')?.classList.remove('wap_boloc_active');}
      if(e.key==='Enter' && (e.target as HTMLElement).id==='keyword'){e.preventDefault();const value=(e.target as HTMLInputElement).value.trim();if(value)window.location.href=`/san-pham?keyword=${encodeURIComponent(value)}`;else notify('Chưa nhập từ khóa tìm kiếm');}
    };
    const scroll=()=>setShowTop(scrollY>100);scroll();
    document.addEventListener('click',onClick);document.addEventListener('submit',submit);document.addEventListener('keydown',keys);window.addEventListener('scroll',scroll,{passive:true});
    return()=>{cleanups.forEach(fn=>fn());document.removeEventListener('click',onClick);document.removeEventListener('submit',submit);document.removeEventListener('keydown',keys);window.removeEventListener('scroll',scroll);};
  },[pathname,query]);
  const image=dialog?.images?.[dialog.index||0];
  return <>
    {comparisonHost && createPortal(<div className="sosanhxe2">{comparison.map(car=><div className="item_ss" key={car.id}><button className="xoa_ss" data-id={car.id} aria-label="Bỏ xe khỏi so sánh"/><Markup html={car.html}/></div>)}</div>,comparisonHost)}
    {showTop && <div className="scrollToTop" role="button" tabIndex={0} onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} style={{display:'block'}}><img src="/assets/images/top.png" alt="Go Top"/></div>}
    {dialog && createPortal(<div className="fancybox-container fancybox-is-open migrated-dialog" role="dialog" aria-modal="true" aria-label={image?'Ảnh xe':'Thông tin'} tabIndex={-1} ref={dialogRef}>
      <div className="fancybox-bg"/><div className="fancybox-inner"><div className="fancybox-stage"><div className="fancybox-slide fancybox-slide--html fancybox-slide--current fancybox-slide--complete" onClick={e=>{if(e.target===e.currentTarget)setDialog(null);}}>
        <div className={`fancybox-content ${image?'dialog-gallery':dialog.className||''}`} id={dialog.id}>
          {image?<img className="dialog-image" src={image.src} alt={image.alt}/>:<Markup html={dialog.html||''}/>}
          <button type="button" className="fancybox-button fancybox-close-small" aria-label="Đóng" onClick={()=>setDialog(null)}><svg viewBox="0 0 24 24"><path d="M12 10.6l6-6 1.4 1.4-6 6 6 6-1.4 1.4-6-6-6 6-1.4-1.4 6-6-6-6L6 4.6z"/></svg></button>
        </div>
        {dialog.images && dialog.images.length>1 && <>{[-1,1].map(dir=><button key={dir} className={`fancybox-button fancybox-button--arrow_${dir===-1?'left':'right'}`} aria-label={dir===-1?'Ảnh trước':'Ảnh tiếp theo'} onClick={()=>setDialog(d=>d?.images?{...d,index:((d.index||0)+dir+d.images.length)%d.images.length}:d)} style={{position:'absolute',top:'50%',left:dir===-1?0:undefined,right:dir===1?0:undefined}}>{dir===-1?'‹':'›'}</button>)}</>}
      </div></div></div>
    </div>,document.body)}
  </>;
}
