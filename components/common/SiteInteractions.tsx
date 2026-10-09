"use client";
import ResponsiveImage from '@/components/common/ResponsiveImage';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import Markup from './Markup';
import { getPublic, submitPublic } from '@/lib/public-client';
import { calculateInstallment } from '@/lib/installment-calculator';
import CarComparison from '@/components/car/CarComparison';

type Dialog = {html?:string;className?:string;id?:string;label?:string;images?:{src:string;alt:string}[];index?:number};

export default function SiteInteractions() {
  const pathname=usePathname(); const query=useSearchParams();
  const router=useRouter();
  const [filterPending,startFilterTransition]=useTransition();
  useEffect(()=>{
    const filters=document.querySelector('.vehicle-filter-panel');
    filters?.setAttribute('aria-busy',String(filterPending));
  },[filterPending,pathname,query]);
  const [dialog,setDialog]=useState<Dialog|null>(null);
  const [showTop,setShowTop]=useState(false);
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
    setDialog(null);
    const cleanups:(()=>void)[]=[];
    const installment=document.querySelector<HTMLElement>('.vehicle-installment .tragop[data-price]');
    if(installment){
      const price=Number(installment.dataset.price);
      const loan=installment.querySelector<HTMLSelectElement>('.sotienvay');
      const term=installment.querySelector<HTMLSelectElement>('.thoigianvay');
      const rate=installment.querySelector<HTMLInputElement>('.laisuat');
      const downPayment=installment.querySelector<HTMLInputElement>('#tratruoc');
      const estimate=installment.querySelector<HTMLElement>('.tragop_r .sotien');
      const details=installment.querySelector<HTMLButtonElement>('.c_tragop');
      if(loan&&term&&rate&&downPayment&&estimate&&details){
        const money=(value:number)=>`${Math.round(value).toLocaleString('vi-VN')} VNĐ`;
        let result:ReturnType<typeof calculateInstallment>=null;
        const showSchedule=()=>{
          if(!result)return;
          setDialog({className:'installment-schedule-dialog',html:`<div class="installment-schedule"><h3 id="installment-schedule-title">Bảng trả góp dự kiến</h3>
            <p>Khoản vay: <strong>${money(result.loanAmount)}</strong> · Tổng lãi: <strong>${money(result.totalInterest)}</strong></p>
            <div class="installment-schedule__scroll" tabindex="0" aria-label="Bảng trả góp theo tháng, có thể cuộn ngang">
              <table><thead><tr><th>Tháng</th><th>Tiền gốc</th><th>Tiền lãi</th><th>Tổng trả</th><th>Dư nợ còn lại</th></tr></thead>
              <tbody>${result.rows.map(row=>`<tr><td>${row.month}</td><td>${money(row.principal)}</td><td>${money(row.interest)}</td><td>${money(row.payment)}</td><td>${money(row.balance)}</td></tr>`).join('')}</tbody></table>
            </div><small>Khoản trả kỳ cuối có thể chênh lệch do làm tròn đến đồng.</small></div>`});
        };
        const update=()=>{
          const loanAmount=Number(loan.value);
          downPayment.value=Number.isFinite(price-loanAmount)&&loanAmount>=0&&loanAmount<=price?money(price-loanAmount):'—';
          const rateText=rate.value.trim().replace(',','.');
          const validRate=/^\d+(?:\.\d{1,2})?$/.test(rateText);
          result=validRate?calculateInstallment(price,loanAmount,Number(term.value),Number(rateText)):null;
          estimate.textContent=result?`${money(result.monthlyPayment)} / tháng`:
            rateText?'Vui lòng nhập lãi suất từ 0 đến 100%/năm':'Nhập lãi suất để xem mức trả góp ước tính';
        };
        const openSchedule=()=>{
          if(!result){rate.focus();return;}
          showSchedule();
        };
        loan.addEventListener('change',update);term.addEventListener('change',update);
        rate.addEventListener('input',update);details.addEventListener('click',openSchedule);
        cleanups.push(()=>{loan.removeEventListener('change',update);term.removeEventListener('change',update);
          rate.removeEventListener('input',update);details.removeEventListener('click',openSchedule);});
        update();
      }
    }
    const showBrandFallback=(image:HTMLImageElement)=>{
      if(!image.matches('[data-brand-logo]'))return;
      image.hidden=true;
      image.closest('.vehicle-brands__option')?.querySelector<HTMLElement>('.vehicle-brands__fallback')?.removeAttribute('hidden');
    };
    const imageError=(event:Event)=>{const image=event.target;if(image instanceof HTMLImageElement)queueMicrotask(()=>{
      if(image.complete && image.naturalWidth===0)showBrandFallback(image);
    });};
    document.addEventListener('error',imageError,true);
    document.querySelectorAll<HTMLImageElement>('[data-brand-logo]').forEach(image=>{
      if(image.complete && image.naturalWidth===0)showBrandFallback(image);
    });
    cleanups.push(()=>document.removeEventListener('error',imageError,true));
    document.querySelectorAll<HTMLElement>('.vehicle-brands__track,.vehicle-filter-options').forEach(track=>{
      const selected=track.querySelector<HTMLElement>('.is-selected');
      if(!selected)return;
      const row=track.getBoundingClientRect(),choice=selected.getBoundingClientRect();
      if(choice.left<row.left||choice.right>row.right)track.scrollTo({left:track.scrollLeft+choice.left-row.left-8,behavior:'instant'});
    });
    const selectTab=(selector:string)=>{
      document.querySelectorAll<HTMLElement>('.tab_bl').forEach(el=>{el.style.display=el.matches(selector)?'block':'none';});
      document.querySelectorAll<HTMLElement>('.boloc_l li').forEach(el=>el.classList.toggle('active',el.dataset.id===selector));
    };
    if(document.querySelector('.hangxe_tk')) selectTab('.hangxe_tk');
    for(const kind of ['ngansach','nam','sokm']) {
      const track=document.getElementById(`${kind}-range`);
      const lower=document.querySelector<HTMLInputElement>(`.gt_${kind}1`),upper=document.querySelector<HTMLInputElement>(`.gt_${kind}2`);
      if(!track||!lower||!upper)continue;
      const min=Number(track.dataset.min);
      const max=Number(track.dataset.max);
      if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)continue;
      const step=kind==='ngansach'?10:kind==='sokm'?1000:1;
      track.className='ui-slider ui-corner-all ui-slider-horizontal ui-widget ui-widget-content migrated-range';
      const fill=document.createElement('div');fill.className='ui-slider-range ui-corner-all ui-widget-header';track.append(fill);
      const inputs=[lower,upper];
      const handles=inputs.map((input,index)=>{const handle=document.createElement('span');handle.className='ui-slider-handle ui-corner-all ui-state-default';handle.tabIndex=0;handle.setAttribute('role','slider');handle.setAttribute('aria-label',`${kind} ${index===0?'tối thiểu':'tối đa'}`);track.append(handle);return handle;});
      const update=()=>{
        const vals=inputs.map((el,index)=>Math.max(min,Math.min(max,el.value.trim()!==''&&Number.isFinite(Number(el.value))?Number(el.value):index===0?min:max)));
        handles.forEach((handle,index)=>{const value=vals[index];handle.style.left=`${(value-min)/(max-min)*100}%`;handle.textContent=kind==='ngansach'?(value>=1000?`${(value/1000).toFixed(1)} tỷ`:`${value} triệu`):kind==='sokm'?`${value.toLocaleString('vi-VN')} km`:String(value);handle.setAttribute('aria-valuenow',String(value));handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));});
        fill.style.left=handles[0].style.left;fill.style.width=`${(vals[1]-vals[0])/(max-min)*100}%`;
      };
      const changed=()=>{
        track.dataset.filterActive='true';track.dataset.openMin='false';track.dataset.openMax='false';
        document.querySelectorAll(`.goiy_${kind} .active_tk`).forEach(el=>el.classList.remove('active_tk'));
        update();
      };
      handles.forEach((handle,index)=>{
        const move=(e:PointerEvent)=>{const rect=track.getBoundingClientRect();const value=Math.round((min+(e.clientX-rect.left)/rect.width*(max-min))/step)*step;inputs[index].value=String(Math.max(index===1?Number(lower.value):min,Math.min(index===0?Number(upper.value):max,value)));changed();};
        const down=(e:PointerEvent)=>{e.preventDefault();handle.setPointerCapture(e.pointerId);move(e);handle.addEventListener('pointermove',move);};
        const up=()=>handle.removeEventListener('pointermove',move);
        const key=(e:KeyboardEvent)=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();inputs[index].value=String(Math.max(index===1?Number(lower.value):min,Math.min(index===0?Number(upper.value):max,Number(inputs[index].value)+(['ArrowRight','ArrowUp'].includes(e.key)?step:-step))));changed();};
        handle.addEventListener('pointerdown',down);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);handle.addEventListener('keydown',key);
        cleanups.push(()=>{handle.removeEventListener('pointerdown',down);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);handle.removeEventListener('pointermove',move);handle.removeEventListener('keydown',key);handle.remove();});
      });
      inputs.forEach(input=>{input.addEventListener('input',changed);cleanups.push(()=>input.removeEventListener('input',changed));});
      update();cleanups.push(()=>fill.remove());
    }
    const notify=(text:string)=>setDialog({html:`<p>${text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</p>`});
    let activeFilterTrigger:HTMLButtonElement|null=null;
    let filterPositionFrame=0;
    let filterHoverCloseTimer=0;
    const closeFilterPopovers=()=>{
      window.clearTimeout(filterHoverCloseTimer);
      activeFilterTrigger=null;
      document.querySelectorAll<HTMLElement>('.vehicle-filter-popover').forEach(el=>{el.hidden=true;});
      document.querySelectorAll<HTMLElement>('[data-filter-popover-trigger]').forEach(el=>el.setAttribute('aria-expanded','false'));
    };
    const positionFilterPopover=()=>{
      filterPositionFrame=0;
      const trigger=activeFilterTrigger;
      const popover=trigger&&document.getElementById(trigger.getAttribute('aria-controls')||'');
      if(!trigger?.isConnected||!popover||popover.hidden){closeFilterPopovers();return;}
      const rect=trigger.getBoundingClientRect();
      const trackRect=trigger.closest('.vehicle-filter-bar__track')?.getBoundingClientRect();
      if(rect.right<=0||rect.left>=innerWidth||rect.bottom<=0||rect.top>=innerHeight||
        (trackRect&&(rect.right<=trackRect.left||rect.left>=trackRect.right))){closeFilterPopovers();return;}
      popover.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-popover.offsetWidth-12))}px`;
      popover.style.top=`${rect.bottom+8}px`;
      popover.style.maxHeight=`${Math.max(40,Math.min(420,innerHeight*.7,innerHeight-rect.bottom-20))}px`;
    };
    const scheduleFilterPopoverPosition=()=>{
      if(activeFilterTrigger&&!filterPositionFrame)filterPositionFrame=requestAnimationFrame(positionFilterPopover);
    };
    const openFilterPopover=(trigger:HTMLButtonElement)=>{
      const popover=document.getElementById(trigger.getAttribute('aria-controls')||'');
      if(!popover)return;
      if(activeFilterTrigger===trigger&&!popover.hidden){window.clearTimeout(filterHoverCloseTimer);return;}
      closeFilterPopovers();
      popover.hidden=false;
      trigger.setAttribute('aria-expanded','true');
      activeFilterTrigger=trigger;
      positionFilterPopover();
    };
    const hoverableFilters=window.matchMedia('(hover: hover) and (pointer: fine)');
    const onFilterPointerOver=(event:PointerEvent)=>{
      if(!hoverableFilters.matches||event.pointerType!=='mouse')return;
      const target=event.target;
      if(!(target instanceof Element))return;
      if(target.closest('.vehicle-filter-popover')){window.clearTimeout(filterHoverCloseTimer);return;}
      const trigger=target.closest<HTMLButtonElement>('[data-filter-popover-trigger]');
      if(trigger)openFilterPopover(trigger);
    };
    const onFilterPointerOut=(event:PointerEvent)=>{
      if(!hoverableFilters.matches||event.pointerType!=='mouse'||!activeFilterTrigger)return;
      const chip=activeFilterTrigger.closest('.vehicle-filter-chip');
      const popover=document.getElementById(activeFilterTrigger.getAttribute('aria-controls')||'');
      const from=event.target,to=event.relatedTarget;
      if(!(from instanceof Node)||!(chip?.contains(from)||popover?.contains(from)))return;
      if(to instanceof Node&&(chip?.contains(to)||popover?.contains(to)))return;
      window.clearTimeout(filterHoverCloseTimer);
      filterHoverCloseTimer=window.setTimeout(closeFilterPopovers,160);
    };
    const submitKeyword=()=>{
      const value=document.querySelector<HTMLInputElement>('#keyword')?.value.trim()||'';
      const params=new URL(document.querySelector<HTMLElement>('.vehicle-filter-panel')?.dataset.filterBase||location.href,location.origin).searchParams;params.delete('page');
      if(value)params.set('keyword',value);else params.delete('keyword');
      startFilterTransition(()=>router.push(`/san-pham${params.size?`?${params}`:''}`,{scroll:false}));
    };
    const filterTrack=document.querySelector<HTMLElement>('.vehicle-filter-bar__track');
    filterTrack?.addEventListener('scroll',scheduleFilterPopoverPosition,{passive:true});
    window.addEventListener('scroll',scheduleFilterPopoverPosition,{passive:true});
    window.addEventListener('resize',scheduleFilterPopoverPosition);
    cleanups.push(()=>{
      filterTrack?.removeEventListener('scroll',scheduleFilterPopoverPosition);
      window.removeEventListener('scroll',scheduleFilterPopoverPosition);
      window.removeEventListener('resize',scheduleFilterPopoverPosition);
      cancelAnimationFrame(filterPositionFrame);
      window.clearTimeout(filterHoverCloseTimer);
    });
    document.addEventListener('pointerover',onFilterPointerOver);
    document.addEventListener('pointerout',onFilterPointerOut);
    cleanups.push(()=>{document.removeEventListener('pointerover',onFilterPointerOver);document.removeEventListener('pointerout',onFilterPointerOut);});
    const onClick=(event:MouseEvent)=>{
      const target=event.target as HTMLElement;
      if(target.closest('[data-vehicle-search-submit]')){submitKeyword();return;}
      const scroll=target.closest<HTMLElement>('[data-filter-scroll]');
      if(scroll){const track=scroll.closest('.vehicle-brands')?.querySelector('.vehicle-brands__track');track?.scrollBy({left:Number(scroll.dataset.filterScroll)*track.clientWidth*.75,behavior:'smooth'});return;}
      const popoverTrigger=target.closest<HTMLButtonElement>('[data-filter-popover-trigger]');
      if(popoverTrigger){
        const popover=document.getElementById(popoverTrigger.getAttribute('aria-controls')||'');
        const wasOpen=popover && !popover.hidden;
        if(wasOpen&&(event.detail===0||!hoverableFilters.matches))closeFilterPopovers();
        else openFilterPopover(popoverTrigger);
        return;
      }
      const filterLink=target.closest<HTMLAnchorElement>('a[data-filter-link]');
      if(filterLink&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
        event.preventDefault();
        startFilterTransition(()=>router.push(filterLink.href,{scroll:false}));
        return;
      }
      if(!target.closest('.vehicle-filter-chip'))closeFilterPopovers();
      if(target.closest('.fancybox-container'))return;
      const trigger=target.closest<HTMLElement>('[data-src^="#"]');
      if(trigger){const modal=document.querySelector<HTMLElement>(trigger.dataset.src!);if(modal){event.preventDefault();const id=modal.id;sourceRef.current=modal;modal.id=`${id}-source`;modal.style.display='none';setDialog({html:modal.innerHTML,className:modal.className,id,label:modal.classList.contains('tt-faq-dialog')?modal.querySelector('h2')?.textContent||'Câu hỏi thường gặp':undefined});return;}}
      const gallery=target.closest<HTMLElement>('[data-gallery="vehicle"]');
      if(gallery){event.preventDefault();const links=[...document.querySelectorAll<HTMLAnchorElement>('.album_pro .slick-slide:not(.slick-cloned) a')];setDialog({images:links.map(a=>({src:a.href,alt:a.querySelector('img')?.alt||''})),index:Number(gallery.dataset.index)});return;}
      const footer=target.closest('.title_f i');if(footer){footer.closest('.item_f')?.classList.toggle('item_f_active');return;}
      const read=target.closest('.noidung_anhien .xemthem,.noidung_anhien .anbot');if(read){event.preventDefault();read.closest('.noidung_anhien')?.classList.toggle('noidung_anhien_active',read.classList.contains('xemthem'));return;}
      const staff=target.closest('.item_tv .ten');if(staff){const parent=staff.closest('.item_tv');const was=parent?.classList.contains('item_tv_active');document.querySelectorAll('.item_tv_active').forEach(el=>el.classList.remove('item_tv_active'));if(!was)parent?.classList.add('item_tv_active');window.scrollTo({top:staff.getBoundingClientRect().top+scrollY-80,behavior:'smooth'});return;}
      const filter=target.closest<HTMLElement>('.vehicle-filter-panel__open,.chonloc li,.boloc_l li');if(filter){selectTab(filter.dataset.id||'.hangxe_tk');document.querySelector('.wap_boloc')?.classList.add('wap_boloc_active');return;}
      if(target.closest('.dong_boloc,.close_boloc')){document.querySelector('.wap_boloc')?.classList.remove('wap_boloc_active');document.querySelector('.wap_sosanhxe')?.classList.remove('wap_sosanhxe_active');return;}
      const choice=target.closest<HTMLElement>('.goiy_hangxe p,.goiy_kieudang p,.goiy_hopso p,.goiy_mausac p,.goiy_mucgia p,.goiy_chinhanh p');
      if(choice){const active=choice.classList.contains('active_tk');if(choice.closest('.goiy_hangxe,.goiy_mucgia,.goiy_chinhanh'))choice.parentElement?.querySelectorAll('p').forEach(el=>el.classList.remove('active_tk'));choice.classList.toggle('active_tk',!active);return;}
      const preset=target.closest<HTMLElement>('[data-gia1]');if(preset){const group=preset.parentElement!;group.querySelectorAll('p').forEach(el=>el.classList.remove('active_tk'));const kind=['ngansach','nam','sokm'].find(k=>group.classList.contains(`goiy_${k}`));if(kind){[1,2].forEach(n=>{const input=document.querySelector<HTMLInputElement>(`.gt_${kind}${n}`);if(input){input.value=preset.dataset[`gia${n}`]||'';input.dispatchEvent(new Event('input'));}});const track=document.getElementById(`${kind}-range`);if(track){track.dataset.openMin=preset.dataset.openMin;track.dataset.openMax=preset.dataset.openMax;}}preset.classList.add('active_tk');return;}
      if(target.closest('.lammoi')){
        document.querySelectorAll('.boloc_r .active_tk').forEach(el=>el.classList.remove('active_tk'));
        for(const kind of ['ngansach','nam','sokm']){
          document.querySelectorAll<HTMLInputElement>(`.gt_${kind}1,.gt_${kind}2`).forEach(el=>{el.value=el.dataset.reset||el.defaultValue;el.dispatchEvent(new Event('input'));});
          const track=document.getElementById(`${kind}-range`);if(track){track.dataset.filterActive='false';track.dataset.openMin='false';track.dataset.openMax='false';}
        }
        return;
      }
      if(target.closest('.apdung')){
        const params=new URLSearchParams();
        for(const [name,key] of [['hangxe','hang-xe'],['kieudang','kieu-dang'],['hopso','hop-so'],['mausac','mau-sac'],['mucgia','gia'],['chinhanh','chi-nhanh']]) {const values=[...document.querySelectorAll<HTMLElement>(`.goiy_${name} .active_tk`)].map(el=>el.dataset.id);if(values.length)params.set(key,name==='hangxe'?values[0]!:values.join(','));}
        for(const [name,key] of [['ngansach','ngan-sach'],['nam','nam-san-xuat'],['sokm','so-km']]) {
          const track=document.getElementById(`${name}-range`);
          const a=document.querySelector<HTMLInputElement>(`.gt_${name}1`),b=document.querySelector<HTMLInputElement>(`.gt_${name}2`);
          if(a&&b&&track?.dataset.filterActive==='true'){
            const lower=Number(a.value),upper=Number(b.value);
            if(!a.value.trim()||!b.value.trim()||!Number.isFinite(lower)||!Number.isFinite(upper)||lower<0||upper<lower||
              (name!=='ngansach'&&(!Number.isInteger(lower)||!Number.isInteger(upper)))||(name==='nam'&&(lower<1886||upper>2100))){
              notify('Vui lòng nhập khoảng lọc hợp lệ: giá trị từ không được lớn hơn giá trị đến.');return;
            }
            params.set(key,`${track.dataset.openMin==='true'?'':lower}-${track.dataset.openMax==='true'?'':upper}`);
          }
        }
        const keyword=document.querySelector<HTMLInputElement>('#keyword')?.value.trim();if(keyword)params.set('keyword',keyword);
        if(query.get('dong-xe'))params.set('dong-xe',query.get('dong-xe')!);
        window.location.href=`/tim-kiem-nang-cao?${params}`;return;
      }
      const service=target.closest<HTMLElement>('.wap_dichvu .cap1 li,.wap_dichvu2 .cap1 li');if(service){
        const id=service.dataset.id||'';
        const section=service.closest<HTMLElement>('.wap_dichvu,.wap_dichvu2');
        const panels=[...section?.querySelectorAll<HTMLElement>(':scope > .dichvu[data-service]')||[]];
        if(panels.some(panel=>panel.dataset.service===id)){
          section?.querySelectorAll<HTMLElement>('.cap1 li').forEach(tab=>{const active=tab===service;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
          panels.forEach(panel=>{panel.hidden=panel.dataset.service!==id;});
          window.dispatchEvent(new Event('resize'));
          return;
        }
        if(!service.classList.contains('active')){const routes:Record<string,string>={'buoc-mua-xe':'/san-pham','buoc-ban-xe':'/ban-xe','buoc-len-doi':'/len-doi'};const route=routes[id];if(route)window.location.href=route;}
        return;
      }
      if(target.closest('.load_them')){event.preventDefault();notify('Vui lòng xem các xe hiện có trong mục Mua xe.');return;}
    };
    const submit=(event:SubmitEvent)=>{
      const form=event.target as HTMLFormElement;
      if(form.matches('.tt-footer-news-form,[data-skip-legacy-submit]'))return;
      event.preventDefault();
      if(form.matches('[data-filter-range]')){
        const key=form.dataset.rangeKey;
        if(!key)return;
        const values=new FormData(form);
        const min=String(values.get('min')||'').trim(),max=String(values.get('max')||'').trim();
        const lower=min?Number(min):undefined,upper=max?Number(max):undefined;
        const year=key==='nam-san-xuat';
        if((lower===undefined&&upper===undefined)||[lower,upper].some(value=>value!==undefined&&(!Number.isFinite(value)||value<0||!Number.isInteger(value)))||
          (lower!==undefined&&upper!==undefined&&lower>upper)||(year&&[lower,upper].some(value=>value!==undefined&&(value<1886||value>2100)))){
          notify('Vui lòng nhập khoảng lọc hợp lệ.');return;
        }
        const params=new URL(document.querySelector<HTMLElement>('.vehicle-filter-panel')?.dataset.filterBase||location.href,location.origin).searchParams;
        params.delete('page');params.set(key,`${min}-${max}`);
        startFilterTransition(()=>router.push(`/san-pham?${params}`,{scroll:false}));return;
      }
      form.classList.add('was-validated');if(!form.checkValidity()){form.reportValidity();return;}
      if(form.matches('.validation-laithu,.validation-contact')) {
        const values=new FormData(form);
        const text=(name:string)=>{
          const element=form.elements.namedItem(name);
          return element instanceof HTMLSelectElement ? element.selectedOptions[0]?.textContent?.trim()||'' : String(values.get(name)||'').trim();
        };
        const phone=String(values.get('dienthoai')||'').trim();
        const button=form.querySelector<HTMLButtonElement>('button[type="submit"],input[type="submit"]');
        if(button)button.disabled=true;
        const payload=form.matches('.validation-laithu') ? {
          type:form.closest('.wap_lendoi') && pathname==='/len-doi' ? 'trade_in' : 'sell', phone,
          offeredBrand:text('hangxe_lendoi'), offeredModel:text('dongxe_lendoi'), offeredYear:text('nsx_lendoi'),
          offeredVersion:text('phienban_lendoi')||undefined, offeredMileage:String(values.get('km')||'').replace(/\D/g,'')||undefined,
          desiredCar:[text('hangxe_lendoimm'),text('dongxe_lendoimm')].filter(Boolean).join(' ')||undefined,
        } : { type:'callback', phone, name:String(values.get('ten')||'').trim(),
          carName:document.querySelector('.right-pro-detail .name_sp')?.textContent?.trim()||undefined };
        void submitPublic('/leads',payload).then(()=>{form.reset();notify('Đã gửi yêu cầu. Nhân viên Toàn Trung sẽ liên hệ với bạn.');})
          .catch(error=>notify(error instanceof Error?error.message:'Không thể gửi yêu cầu. Vui lòng thử lại.'))
          .finally(()=>{if(button)button.disabled=false;});
        return;
      }
      if(form.closest('.banxe')){window.location.href='/ban-xe';return;}
      notify('Hiện chưa thể gửi yêu cầu trực tuyến. Vui lòng liên hệ 0777393913 để được hỗ trợ.');
    };
    const change=(event:Event)=>{
      const select=event.target;
      if(!(select instanceof HTMLSelectElement))return;
      if(select.id==='vehicle-sort'){
        const params=new URL(document.querySelector<HTMLElement>('.vehicle-filter-panel')?.dataset.filterBase||location.href,location.origin).searchParams;
        params.delete('page');
        if(select.value==='newest')params.delete('gia');else params.set('gia',select.value);
        startFilterTransition(()=>router.push(`${pathname}${params.size?`?${params}`:''}`,{scroll:false}));return;
      }
      const form=select.form;
      if(!form)return;
      if(select.name==='hangxe_lendoi'||select.name==='hangxe_lendoimm'){
        const desired=select.name==='hangxe_lendoimm';
        const model=form.elements.namedItem(desired?'dongxe_lendoimm':'dongxe_lendoi');
        const version=form.elements.namedItem('phienban_lendoi');
        if(!(model instanceof HTMLSelectElement))return;
        model.replaceChildren(new Option('Chọn dòng xe',''));
        if(!desired && version instanceof HTMLSelectElement)version.replaceChildren(new Option('Chọn phiên bản',''));
        const slug=select.value;
        if(!slug)return;
        void getPublic<{id:string;name:string}[]>(`/brands/${encodeURIComponent(slug)}/models`).then(models=>{
          if(select.value!==slug)return;
          for(const item of models)model.add(new Option(item.name,item.id));
        }).catch(error=>notify(error instanceof Error?error.message:'Không thể tải dòng xe.'));
      }
      if(select.name==='dongxe_lendoi'){
        const version=form.elements.namedItem('phienban_lendoi');
        if(!(version instanceof HTMLSelectElement))return;
        version.replaceChildren(new Option('Chọn phiên bản',''));
        const modelId=select.value;
        if(!modelId)return;
        void getPublic<{data:{id:string;name:string}[]}>(`/lookups/car-versions?modelId=${encodeURIComponent(modelId)}&limit=100`).then(result=>{
          if(select.value!==modelId)return;
          for(const item of result.data)version.add(new Option(item.name,item.id));
        }).catch(error=>notify(error instanceof Error?error.message:'Không thể tải phiên bản xe.'));
      }
    };
    const keys=(e:KeyboardEvent)=>{
      if(['Enter',' '].includes(e.key) && (e.target as HTMLElement).matches('.wap_dichvu .cap1 [role="tab"],.wap_dichvu2 .cap1 [role="tab"]')){e.preventDefault();(e.target as HTMLElement).click();return;}
      if(e.key==='Escape'){
        document.querySelector('.wap_boloc')?.classList.remove('wap_boloc_active');
        closeFilterPopovers();
      }
      if(e.key==='Enter' && (e.target as HTMLElement).id==='keyword'){
        e.preventDefault();submitKeyword();
      }
    };
    const scroll=()=>setShowTop(scrollY>100);scroll();
    document.addEventListener('click',onClick);document.addEventListener('submit',submit);document.addEventListener('change',change);document.addEventListener('keydown',keys);window.addEventListener('scroll',scroll,{passive:true});
    return()=>{cleanups.forEach(fn=>fn());document.removeEventListener('click',onClick);document.removeEventListener('submit',submit);document.removeEventListener('change',change);document.removeEventListener('keydown',keys);window.removeEventListener('scroll',scroll);};
  },[pathname,query,router]);
  const image=dialog?.images?.[dialog.index||0];
  return <>
    <CarComparison />
    {showTop && <button type="button" className="scrollToTop" aria-label="Về đầu trang" onClick={()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button>}
    {dialog && createPortal(<div className="fancybox-container fancybox-is-open migrated-dialog" role="dialog" aria-modal="true" aria-label={dialog.label || (image?'Ảnh xe':dialog.id==='nutgoi'?'Liên hệ Toàn Trung':dialog.className==='installment-schedule-dialog'?'Chi tiết khoản trả góp hàng tháng':'Thông tin')} tabIndex={-1} ref={dialogRef}>
      <div className="fancybox-bg"/><div className="fancybox-inner"><div className="fancybox-stage"><div className="fancybox-slide fancybox-slide--html fancybox-slide--current fancybox-slide--complete" onClick={e=>{if(e.target===e.currentTarget)setDialog(null);}}>
        <div className={`fancybox-content ${image?'dialog-gallery':dialog.className||''}`} id={dialog.id}>
          {image?<ResponsiveImage profile="content" className="dialog-image" src={image.src} alt={image.alt}/>:<Markup html={dialog.html||''}/>}
          <button type="button" className="fancybox-button fancybox-close-small" aria-label="Đóng" onClick={()=>setDialog(null)}><svg viewBox="0 0 24 24"><path d="M12 10.6l6-6 1.4 1.4-6 6 6 6-1.4 1.4-6-6-6 6-1.4-1.4 6-6-6-6L6 4.6z"/></svg></button>
        </div>
        {dialog.images && dialog.images.length>1 && <>{[-1,1].map(dir=><button key={dir} className={`fancybox-button fancybox-button--arrow_${dir===-1?'left':'right'}`} aria-label={dir===-1?'Ảnh trước':'Ảnh tiếp theo'} onClick={()=>setDialog(d=>d?.images?{...d,index:((d.index||0)+dir+d.images.length)%d.images.length}:d)} style={{position:'absolute',top:'50%',left:dir===-1?0:undefined,right:dir===1?0:undefined}}>{dir===-1?'‹':'›'}</button>)}</>}
      </div></div></div>
    </div>,document.body)}
  </>;
}
