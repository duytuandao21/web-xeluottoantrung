"use client";

import Slider, { type Settings } from 'react-slick';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';

const base: Settings = { infinite:true, accessibility:false, slidesToShow:1, slidesToScroll:1, autoplay:false, autoplaySpeed:3000, speed:1000, arrows:true, dots:false, draggable:true, pauseOnHover:true };
const responsive = (pairs: number[][]) => pairs.map(([breakpoint,slidesToShow,slidesToScroll=1]) => ({breakpoint,settings:{slidesToShow,slidesToScroll}}));
function heroDots(dots: ReactNode) {
  return <ul aria-label="Chọn banner trang chủ">{Children.map(dots, dot => {
    if(!isValidElement<{ className?: string; children: ReactElement<{ 'aria-current'?: 'true' }> }>(dot)) return dot;
    const active = dot.props.className?.includes('slick-active');
    return cloneElement(dot, {}, cloneElement(dot.props.children, { 'aria-current': active ? 'true' : undefined }));
  })}</ul>;
}
export function settingsFor(className:string): Settings {
  if(className.includes('slider_slick')) return {...base,fade:true,autoplay:true,speed:650,waitForAnimate:false,arrows:false,pauseOnHover:false,
    dots:true,dotsClass:'slick-dots hero-dots',pauseOnDotsHover:true,appendDots:heroDots,
    customPaging:index => <button type="button" aria-label={`Xem banner ${index + 1}`} />};
  if(className.includes('thuonghieu')) return {...base,slidesToShow:7,slidesToScroll:7,responsive:responsive([[1025,6,6],[600,5,5],[461,4,4]])};
  if(className.includes('slick432')) return {...base,autoplay:true,slidesToShow:4,responsive:responsive([[960,3],[800,2],[490,className.includes('slick4322')?2:1]])};
  if(className.includes('slick321') || className.split(' ').includes('sanpham')) return {...base,autoplay:className.includes('slick321'),slidesToShow:3,responsive:responsive([[800,2],[490,1]])};
  return base;
}

export function useResponsiveSettings(settings:Settings):Settings {
  const [width,setWidth]=useState<number|null>(null);
  useEffect(()=>{const update=()=>setWidth(window.innerWidth);update();window.addEventListener('resize',update,{passive:true});return()=>window.removeEventListener('resize',update);},[]);
  const {responsive,...baseSettings}=settings;
  const match=width===null?undefined:responsive?.slice().sort((a,b)=>a.breakpoint-b.breakpoint).find(rule=>width<rule.breakpoint);
  return {...baseSettings,...(match && match.settings!=='unslick'?match.settings:{})};
}

export default function Carousel({className,children,settings}: {className:string;children:ReactNode;settings?:Settings}) {
  const ref=useRef<Slider>(null);
  const [ready,setReady]=useState(false);
  const [mobileLookups,setMobileLookups]=useState(false);
  const isLookupRow=className.split(' ').includes('thuonghieu');
  const isHero=className.split(' ').includes('slider_slick');
  const resolved=useResponsiveSettings({...settingsFor(className),...settings});
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{
    if(!isLookupRow){setMobileLookups(false);return;}
    const media=window.matchMedia('(max-width:960px)');
    const update=()=>setMobileLookups(media.matches);
    update();
    media.addEventListener('change',update);
    return ()=>media.removeEventListener('change',update);
  },[isLookupRow]);
  if(mobileLookups) return <div className={`${className} lookup-carousel-mobile`} role="group" aria-label="Danh sách lựa chọn xe" tabIndex={0}>{children}</div>;
  // Apply responsive settings before revealing slides; avoids desktop columns
  // flashing during hydration on phones. Slick owns and cleans up its timers.
  // Show the hero's SSR slide and correct Slick's pre-mount track offset.
  return <Slider ref={ref} className={`${className}${ready?'':isHero?' hero-ssr':' carousel-hydrating'}`} {...resolved} dots={isHero ? resolved.dots && Children.count(children) > 1 : resolved.dots}>{children}</Slider>;
}
