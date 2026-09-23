"use client";
import parse from 'html-react-parser';
import Carousel from '@/components/common/Carousel';
import type { Car } from '@/types/car';

export default function CarCard({car}:{car:Car}) {
  return <div className={car.className} data-car-id={car.id}>
    {car.compare && <p className="id_ss" data-id={car.id} role="button" tabIndex={0}><span />So sánh</p>}
    <div className={car.imageClass}>
      <Carousel className="slick_hinhthem">{car.images.map((image,index)=><p key={index} onClick={()=>{window.location.href=car.href;}}><img src={image.src} alt={image.alt} /></p>)}</Carousel>
      {car.status && <span className="tinhtrang">{car.status}</span>}
    </div>
    <div className="mota"><div className="gia_sp">{parse(car.priceHtml || '')}</div>
      <h3 className={car.nameClass}><a href={car.href} title={car.title}>{car.name}</a></h3>
      <ul>{car.specs.map((spec,index)=><li key={index}>{spec.icon && <img src={spec.icon} alt={spec.alt || ''} />}{spec.text}</li>)}</ul>
    </div>
  </div>;
}
