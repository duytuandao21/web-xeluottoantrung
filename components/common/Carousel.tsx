"use client";

import Slider, { type Settings } from 'react-slick';
import { type ReactNode, useEffect, useRef, useState } from 'react';

const base: Settings = { infinite:true, accessibility:false, slidesToShow:1, slidesToScroll:1, autoplay:false, autoplaySpeed:3000, speed:1000, arrows:true, dots:false, draggable:true, pauseOnHover:true };
const responsive = (pairs: number[][]) => pairs.map(([breakpoint,slidesToShow,slidesToScroll=1]) => ({breakpoint,settings:{slidesToShow,slidesToScroll}}));
export function settingsFor(className:string): Settings {
  if(className.includes('slider_slick')) return {...base,fade:true,autoplay:true,speed:1500,arrows:false,pauseOnHover:false};
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
  const resolved=useResponsiveSettings({...settingsFor(className),...settings});
  useEffect(()=>setReady(true),[]);
  // Apply responsive settings before revealing slides; avoids desktop columns
  // flashing during hydration on phones. Slick owns and cleans up its timers.
  return <Slider ref={ref} className={`${className}${ready?'':' carousel-hydrating'}`} {...resolved}>{children}</Slider>;
}
