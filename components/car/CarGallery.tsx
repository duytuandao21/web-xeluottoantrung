"use client";
import { useState } from 'react';
import Slider from 'react-slick';
import {useResponsiveSettings} from '@/components/common/Carousel';
import VehicleLightbox from './VehicleLightbox';

export default function CarGallery({images}:{images:{src:string;alt:string;href:string}[]}) {
  const [main,setMain]=useState<Slider|null>(null);
  const [thumbs,setThumbs]=useState<Slider|null>(null);
  const [openIndex,setOpenIndex]=useState<number|null>(null);
  const [activeIndex,setActiveIndex]=useState(0);
  const settings=useResponsiveSettings({slidesToShow:6,slidesToScroll:1,arrows:false,dots:false,focusOnSelect:true,responsive:[{breakpoint:500,settings:{slidesToShow:4}},{breakpoint:376,settings:{slidesToShow:3}}]});
  return <div className="car-gallery" onClickCapture={event=>{
    const anchor=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-gallery="vehicle"]');
    if(!anchor)return;
    event.preventDefault();event.stopPropagation();
    setOpenIndex(Number(anchor.dataset.index)||0);
  }}>
    <Slider className="album_pro" ref={setMain} asNavFor={thumbs??undefined} slidesToShow={1} slidesToScroll={1} arrows infinite speed={600} cssEase="ease-in-out" autoplay={false} beforeChange={(_,next)=>setActiveIndex(next)}>
      {images.map((image,index)=><a className="MagicZoom" key={index} href={image.href} data-gallery="vehicle" data-index={index}><img className="cloudzoom no_lazy" src={image.src} alt={image.alt}/></a>)}
    </Slider>
    <Slider className="album_pro2" ref={setThumbs} asNavFor={main??undefined} {...settings}>
      {images.map((image,index)=><button type="button" key={index} className={`car-gallery__thumbnail${activeIndex===index?' is-active':''}`} aria-label={`Xem ảnh ${index+1}`} aria-pressed={activeIndex===index}><img className="cloudzoom no_lazy" src={image.src} alt={image.alt}/></button>)}
    </Slider>
    {openIndex!==null && images.length>0 && <VehicleLightbox images={images} initialIndex={openIndex} onClose={()=>setOpenIndex(null)}/>}
  </div>;
}
