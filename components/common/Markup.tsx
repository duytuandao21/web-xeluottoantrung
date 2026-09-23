"use client";
import parse, { attributesToProps, domToReact, Element, type DOMNode, type HTMLReactParserOptions } from 'html-react-parser';
import { createElement } from 'react';
import Carousel from './Carousel';
import CarCard from '@/components/car/CarCard';
import CarGallery from '@/components/car/CarGallery';
import type { Car } from '@/types/car';

export default function Markup({html,cars={}}:{html:string;cars?:Record<string,Car>}) {
  const options:HTMLReactParserOptions={replace(node){
    if(!(node instanceof Element)) return;
    const cls=node.attribs.class || '';
    if(node.name==='script') return <></>;
    if(node.name==='car-card') {const car=cars[node.attribs['data-key']];return car?<CarCard car={car}/>:<></>;}
    if(cls.split(' ').includes('left-pro-detail')) {
      const gallery=node.children.find(child=>child instanceof Element && child.attribs.class==='album_pro');
      if(gallery instanceof Element) {
        const images=gallery.children.filter(child=>child instanceof Element && child.name==='a').map(child=>{
          const anchor=child as Element; const img=anchor.children.find(el=>el instanceof Element && el.name==='img') as Element|undefined;
          return {href:anchor.attribs.href,src:img?.attribs.src || '',alt:img?.attribs.alt || ''};
        });
        return <div {...attributesToProps(node.attribs)}><CarGallery images={images}/>{domToReact(node.children.filter(child=>!(child instanceof Element && ['album_pro','album_pro2'].includes(child.attribs.class))) as DOMNode[],options)}</div>;
      }
    }
    if(cls.split(' ').some(name=>['slider_slick','slick_hinhthem','slick321','slick4321','slick4322','thuonghieu','sanpham'].includes(name))) {
      return <Carousel className={cls}>{domToReact(node.children.filter(child=>child instanceof Element) as DOMNode[],options)}</Carousel>;
    }
    // React requires the parent select to own the initial selected option.
    if(node.name==='select') {
      const selected=node.children.find(child=>child instanceof Element && 'selected' in child.attribs) as Element|undefined;
      return <select {...attributesToProps(node.attribs)} defaultValue={selected?.attribs.value}>{domToReact(node.children as DOMNode[],options)}</select>;
    }
    if(node.name==='option' && 'selected' in node.attribs) {const {selected,...attrs}=node.attribs;return <option {...attributesToProps(attrs)}>{domToReact(node.children as DOMNode[],options)}</option>;}
    if(node.name==='input' || node.name==='textarea') {const {value,checked,...props}=attributesToProps(node.attribs);return createElement(node.name,{...props,defaultValue:value,defaultChecked:checked},node.name==='textarea'?domToReact(node.children as DOMNode[],options):undefined);}
  }};
  return <>{parse(html,options)}</>;
}
