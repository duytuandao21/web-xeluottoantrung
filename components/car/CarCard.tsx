"use client";
import { useEffect, useRef, useState } from 'react';
import parse from 'html-react-parser';
import { getPublic } from '@/lib/public-client';
import type { Car } from '@/types/car';

type Motion = { direction: -1 | 1; target: number; phase: 'ready' | 'go' };

export default function CarCard({car}:{car:Car}) {
  return <CarCardState key={JSON.stringify([car.id,car.images])} car={car}/>;
}

function CardImage({src,alt}:{src:string;alt:string}) {
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const imageRef=useRef<HTMLImageElement>(null);
  useEffect(()=>{
    const img=imageRef.current;
    if(!img)return;
    let disposed=false;
    const failed=()=>{if(!disposed)setStatus('error');};
    const loaded=()=>{
      void img.decode().then(()=>{if(!disposed)setStatus('ready');}).catch(failed);
    };
    img.addEventListener('load',loaded);
    img.addEventListener('error',failed);
    // SSR images can finish loading before hydration attaches event handlers.
    if(img.complete){if(img.naturalWidth>0)loaded();else failed();}
    return ()=>{
      disposed=true;
      img.removeEventListener('load',loaded);
      img.removeEventListener('error',failed);
    };
  },[src]);
  return <>
    <img ref={imageRef} src={src} alt={alt} decoding="async" style={{visibility:status==='ready'?'visible':'hidden'}}/>
    {status!=='ready'&&<span className="car-card-gallery__placeholder" role="status">{status==='error'?'Không tải được ảnh xe':'Đang tải ảnh xe…'}</span>}
  </>;
}

function prepareImage(src:string,signal:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const finish=(error?:Error)=>{
      clearTimeout(timer);signal.removeEventListener('abort',abort);img.onload=null;img.onerror=null;
      if(error)reject(error);else resolve();
    };
    const abort=()=>{finish(new Error('Aborted'));img.src='';};
    const timer=setTimeout(()=>finish(new Error('Image timed out')),20000);
    img.onload=()=>{void img.decode().then(()=>finish()).catch(()=>finish(new Error('Image decode failed')));};
    img.onerror=()=>finish(new Error('Image failed'));
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    img.src=src;
  });
}

function CarCardState({car}:{car:Car}) {
  const [images,setImages]=useState(car.images);
  const [activeIndex,setActiveIndex]=useState(0);
  const [galleryLoaded,setGalleryLoaded]=useState(false);
  const [galleryError,setGalleryError]=useState('');
  const [motion,setMotion]=useState<Motion|null>(null);
  const loadingRef=useRef(false);
  const movingRef=useRef(false);
  const requestRef=useRef<AbortController|null>(null);
  const [loading,setLoading]=useState(false);
  useEffect(()=>()=>requestRef.current?.abort(),[]);

  useEffect(()=>{
    if(motion?.phase!=='ready')return;
    let secondFrame=0;
    const firstFrame=requestAnimationFrame(()=>{
      secondFrame=requestAnimationFrame(()=>setMotion(current=>current?{...current,phase:'go'}:null));
    });
    return ()=>{cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);};
  },[motion?.phase]);

  const moveImage=async(direction:-1|1)=>{
    if(loadingRef.current||movingRef.current)return;
    loadingRef.current=true;
    setLoading(true);
    const request=new AbortController();requestRef.current=request;
    let gallery=images;
    setGalleryError('');
    try {
    if(!galleryLoaded){
        const detail=await getPublic<{slug:string;media:{url:string;altText?:string|null}[]}>(`/cars/${encodeURIComponent(car.id)}`,{signal:request.signal});
        if(detail.slug!==car.id)throw new Error('Gallery does not belong to this car');
        gallery=detail.media.length?detail.media.map(media=>({src:media.url,alt:media.altText||car.name})):car.images;
        // Keep the displayed cover in place if media ordering changed after the list loaded.
        const coverIndex=gallery.findIndex(image=>image.src===images[activeIndex]?.src);
        if(coverIndex>0)gallery=[...gallery.slice(coverIndex),...gallery.slice(0,coverIndex)];
    }
    if(gallery.length<2)return;
    const target=(activeIndex+direction+gallery.length)%gallery.length;
    await prepareImage(gallery[target].src,request.signal);
    if(request.signal.aborted)return;
    setImages(gallery);setGalleryLoaded(true);
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      setActiveIndex(target);
      return;
    }
    movingRef.current=true;
    setMotion({direction,target,phase:'ready'});
    }catch{
      if(!request.signal.aborted)setGalleryError('Không thể tải ảnh xe. Vui lòng thử lại.');
    }finally{
      if(requestRef.current===request){loadingRef.current=false;setLoading(false);}
    }
  };

  const current=images[activeIndex]||car.images[0];
  const previous=images[(activeIndex-1+images.length)%images.length]||current;
  const next=images[(activeIndex+1)%images.length]||current;
  const offset=motion?.phase==='go'?(motion.direction===1?-200:0):-100;

  return <div className={car.className} data-car-id={car.id}>
    {car.compare && <p className="id_ss" data-id={car.id} role="button" tabIndex={0}><span />So sánh</p>}
    <div className={car.imageClass}>
      <div className="slick_hinhthem car-card-gallery" aria-busy={loading}>
        <div className="car-card-gallery__viewport">
          <div className={`car-card-gallery__track${motion?.phase==='go'?' is-moving':''}`} style={{transform:`translateX(${offset}%)`}} onTransitionEnd={event=>{
            if(event.target!==event.currentTarget||event.propertyName!=='transform'||!motion)return;
            setActiveIndex(motion.target);
            setMotion(null);
            movingRef.current=false;
          }}>
            {[previous,current,next].map((image,index)=><p className="slick-slide" key={index} data-current={index===1} onClick={()=>{window.location.href=car.href;}}><CardImage key={image.src} src={image.src} alt={image.alt}/></p>)}
          </div>
        </div>
        <button type="button" className="slick-arrow slick-prev" disabled={loading||motion!==null} aria-label={`Ảnh trước của ${car.name}`} onClick={()=>void moveImage(-1)}>Previous</button>
        <button type="button" className="slick-arrow slick-next" disabled={loading||motion!==null} aria-label={`Ảnh tiếp theo của ${car.name}`} onClick={()=>void moveImage(1)}>Next</button>
        {galleryError&&<span className="car-card-gallery__error" role="status">{galleryError}</span>}
      </div>
      {car.status && <span className="tinhtrang">{car.status}</span>}
    </div>
    <div className="mota"><div className="gia_sp">{parse(car.priceHtml || '')}</div>
      <h3 className={car.nameClass}><a href={car.href} title={car.title}>{car.name}</a></h3>
      <ul>{car.specs.map((spec,index)=><li key={index}>{spec.icon && <img src={spec.icon} alt={spec.alt || ''} />}{spec.text}</li>)}</ul>
    </div>
  </div>;
}
