"use client";
import parse, { attributesToProps, domToReact, Element, type DOMNode, type HTMLReactParserOptions } from 'html-react-parser';
import { createElement } from 'react';
import Carousel from './Carousel';
import BuySellBanner, { type BannerSlide } from './BuySellBanner';
import CarCard from '@/components/car/CarCard';
import CarGallery from '@/components/car/CarGallery';
import type { Car } from '@/types/car';
import { SalePlate } from '@/components/sale/SaleAccess';
import CarListing from '@/components/car/CarListing';
import type { PageResult, PublicCar } from '@/lib/public-api';
import ResponsiveImage from './ResponsiveImage';
import { getImageOriginalUrl, imageProfile } from '@/lib/image-delivery';
import InstallationStoreCard, { type InstallationStore } from '@/components/accessories/InstallationStoreCard';

export default function Markup({html,cars={}}:{html:string;cars?:Record<string,Car>}) {
  const options:HTMLReactParserOptions={replace(node){
    if(!(node instanceof Element)) return;
    const cls=node.attribs.class || '';
    if(node.name==='script') return <></>;
    // Preserve every CSS declaration; only normalize managed inline image URLs.
    if(node.attribs.style?.includes('url(')) {
      node.attribs.style=node.attribs.style.replace(/url\((["']?)([^"')]+)\1\)/g,(_match,quote,url)=>`url(${quote}${getImageOriginalUrl(url)}${quote})`);
    }
    // react-property does not yet map fetchpriority to React's fetchPriority.
    // Normalize it explicitly so React SSR also respects the image preload hint.
    if(node.name==='img') {
      const {fetchpriority,...attrs}=node.attribs;
      const classes=[cls];let parent=node.parent;while(parent instanceof Element){classes.push(parent.attribs.class||'');parent=parent.parent;}
      const profile=imageProfile(classes.join(' '));
      return <ResponsiveImage {...attributesToProps(attrs)} src={attrs.src||''} profile={profile}
        sizes={profile==='logo'?'71px':profile==='thumbnail'?'100px':undefined}
        fetchPriority={fetchpriority==='high'?'high':fetchpriority==='low'?'low':undefined} />;
    }
    if(cls.split(' ').includes('home-buy-banner')) return <BuySellBanner slides={JSON.parse(node.attribs['data-slides'] || '[]') as BannerSlide[]} />;
    if(node.name==='car-card') {const car=cars[node.attribs['data-key']];return car?<CarCard key={car.id} car={car} imageLoading={node.attribs['data-image-loading']==='lazy'?'lazy':undefined}/>:<></>;}
    if(node.name==='sale-plate') return <SalePlate slug={node.attribs['data-slug'] || ''} />;
    if(node.name==='vehicle-branch-card') return <InstallationStoreCard kind="branch" store={JSON.parse(node.attribs['data-store']) as InstallationStore} />;
    if(cls.split(' ').includes('wap_item') && node.attribs['data-car-list-query']) {
      const query=JSON.parse(node.attribs['data-car-list-query']) as Record<string,string|number|undefined>;
      const initialResult=JSON.parse(node.attribs['data-car-list-result']) as PageResult<PublicCar>;
      return <CarListing key={JSON.stringify(query)} query={query} initialResult={initialResult} />;
    }
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
      return <select key={node.attribs.id==='vehicle-sort'?selected?.attribs.value:undefined} {...attributesToProps(node.attribs)} defaultValue={selected?.attribs.value}>{domToReact(node.children as DOMNode[],options)}</select>;
    }
    if(node.name==='option' && 'selected' in node.attribs) {const attrs={...node.attribs};delete attrs.selected;return <option {...attributesToProps(attrs)}>{domToReact(node.children as DOMNode[],options)}</option>;}
    if(node.name==='input' && ['submit','reset','button'].includes(node.attribs.type || '')) {
      return createElement('input',attributesToProps(node.attribs));
    }
    if(node.name==='input' || node.name==='textarea') {const {value,checked,...props}=attributesToProps(node.attribs);return createElement(node.name,{...props,defaultValue:value,defaultChecked:checked},node.name==='textarea'?domToReact(node.children as DOMNode[],options):undefined);}
  }};
  return <>{parse(html,options)}</>;
}
