"use client";
import { useState } from 'react';
import Slider from 'react-slick';
import {useResponsiveSettings} from '@/components/common/Carousel';

export default function CarGallery({images}:{images:{src:string;alt:string;href:string}[]}) {
  const [main,setMain]=useState<Slider|null>(null);
  const [thumbs,setThumbs]=useState<Slider|null>(null);
  const settings=useResponsiveSettings({slidesToShow:6,slidesToScroll:1,arrows:false,dots:false,focusOnSelect:true,responsive:[{breakpoint:500,settings:{slidesToShow:4}},{breakpoint:376,settings:{slidesToShow:3}}]});
  return <>
    <Slider className="album_pro" ref={setMain} asNavFor={thumbs??undefined} slidesToShow={1} slidesToScroll={1} arrows fade autoplay={false}>
      {images.map((image,index)=><a className="MagicZoom" key={index} href={image.href} data-gallery="vehicle" data-index={index}><img className="cloudzoom no_lazy" src={image.src} alt={image.alt}/></a>)}
    </Slider>
    <Slider className="album_pro2" ref={setThumbs} asNavFor={main??undefined} {...settings}>
      {images.map((image,index)=><p key={index}><img className="cloudzoom no_lazy" src={image.src} alt={image.alt}/></p>)}
    </Slider>
  </>;
}
