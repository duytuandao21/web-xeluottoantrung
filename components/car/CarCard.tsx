"use client";
import { useEffect, useRef, useState } from 'react';
import parse from 'html-react-parser';
import { getPublic } from '@/lib/public-client';
import type { Car } from '@/types/car';
import ResponsiveImage from '@/components/common/ResponsiveImage';
import { responsiveImage } from '@/lib/image-delivery';
import { observeCardCover } from '@/lib/card-cover-loading';
import { SalePlate } from '@/components/sale/SaleAccess';
import { isNewArrival, newArrivalExpiresAt } from '@/lib/car-new-arrival';

type Motion = { direction: -1 | 1; target: number; phase: 'ready' | 'go' };

export default function CarCard({car,imageLoading}:{car:Car;imageLoading?:'eager'|'lazy'}) {
  return <CarCardState key={JSON.stringify([car.id,car.images])} car={car} imageLoading={imageLoading}/>;
}

function CardImage({src,alt,loading}:{src:string;alt:string;loading?:'eager'|'lazy'}) {
  const [failed,setFailed]=useState(false);
  const imageRef=useRef<HTMLImageElement>(null);
  useEffect(()=>{
    const img=imageRef.current;
    if(!img)return;
    let disposed=false;
    const loaded=()=>{if(!disposed)setFailed(false);};
    img.addEventListener('load',loaded);
    // SSR images can finish loading before hydration attaches event handlers.
    if(img.complete && img.currentSrc)setFailed(img.naturalWidth===0);
    return ()=>{
      disposed=true;
      img.removeEventListener('load',loaded);
    };
  },[src]);
  return <>
    {/* Let the browser paint SSR covers without waiting for hydration/decode(). */}
    <ResponsiveImage ref={imageRef} src={src} profile="card" alt={alt} loading={loading} decoding="async" onError={()=>setFailed(true)} style={failed?{visibility:'hidden'}:undefined}/>
    {failed&&<span className="car-card-gallery__placeholder" role="status">Không tải được ảnh xe</span>}
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
    img.onerror=()=>{
      if (img.src!==delivery.original && delivery.src!==delivery.original) {
        img.removeAttribute('srcset');img.removeAttribute('sizes');img.src=delivery.original;
      } else finish(new Error('Image failed'));
    };
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    const delivery=responsiveImage(src,'card');
    if(delivery.srcSet)img.srcset=delivery.srcSet;
    if(delivery.sizes)img.sizes=delivery.sizes;
    img.src=delivery.src;
  });
}

function CarCardState({car,imageLoading}:{car:Car;imageLoading?:'eager'|'lazy'}) {
  // The mapped initial flag survives SSR/hydration without comparing two clocks.
  const [recentArrival,setRecentArrival]=useState(car.isNewArrival || false);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const update=()=>{
      clearTimeout(timer);
      const recent=car.newArrival===true && isNewArrival(car.createdAt);
      setRecentArrival(recent);
      const expires=newArrivalExpiresAt(car.createdAt);
      if(recent && expires!==null)timer=setTimeout(update,Math.max(1,expires-Date.now()));
    };
    const visible=()=>{if(!document.hidden)update();};
    update();
    if(car.newArrival!==true || !isNewArrival(car.createdAt))return ()=>clearTimeout(timer);
    window.addEventListener('focus',update);
    document.addEventListener('visibilitychange',visible);
    return ()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',visible);};
  },[car.createdAt,car.newArrival]);
  const [images,setImages]=useState(car.images);
  const [activeIndex,setActiveIndex]=useState(0);
  const [galleryLoaded,setGalleryLoaded]=useState(false);
  const [galleryError,setGalleryError]=useState('');
  const [motion,setMotion]=useState<Motion|null>(null);
  const loadingRef=useRef(false);
  const movingRef=useRef(false);
  const requestRef=useRef<AbortController|null>(null);
  const swipeStartRef=useRef<{x:number;y:number}|null>(null);
  const suppressClickUntilRef=useRef(0);
  const [loading,setLoading]=useState(false);
  const viewportRef=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>requestRef.current?.abort(),[]);
  useEffect(()=>{
    if(imageLoading!=='lazy'||galleryLoaded||!viewportRef.current)return;
    return observeCardCover(viewportRef.current);
  },[imageLoading,galleryLoaded]);

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
  const discounted=typeof car.originalPrice==='number' && Number.isFinite(car.originalPrice) && car.originalPrice>0;
  const onTouchStart=(event:React.TouchEvent<HTMLDivElement>)=>{
    if(event.touches.length!==1){swipeStartRef.current=null;return;}
    swipeStartRef.current={x:event.touches[0].clientX,y:event.touches[0].clientY};
  };
  const onTouchEnd=(event:React.TouchEvent<HTMLDivElement>)=>{
    const start=swipeStartRef.current;
    swipeStartRef.current=null;
    if(!start||event.changedTouches.length!==1)return;
    const dx=event.changedTouches[0].clientX-start.x;
    const dy=event.changedTouches[0].clientY-start.y;
    if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.3)return;
    suppressClickUntilRef.current=Date.now()+700;
    void moveImage(dx<0?1:-1);
  };

  return <div className={car.className} data-car-id={car.id}>
    {car.compare && <p className="id_ss" data-id={car.id} role="button" tabIndex={0}><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>So sánh</p>}
    <div className={car.imageClass}>
      {recentArrival && <span className={`car-card-new-arrival${car.status?' car-card-new-arrival--with-status':''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        Xe mới về
      </span>}
      <div className="slick_hinhthem car-card-gallery" aria-busy={loading}>
        <div className="car-card-gallery__viewport" ref={viewportRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={()=>{swipeStartRef.current=null;}}>
          <div className={`car-card-gallery__track${motion?.phase==='go'?' is-moving':''}`} style={{transform:`translateX(${offset}%)`}} onTransitionEnd={event=>{
            if(event.target!==event.currentTarget||event.propertyName!=='transform'||!motion)return;
            setActiveIndex(motion.target);
            setMotion(null);
            movingRef.current=false;
          }}>
            {/* Only the initial cover may be lazy. Keep adjacent gallery images eager after interaction. */}
            {[previous,current,next].map((image,index)=><p className="slick-slide" key={index} data-current={index===1} onClick={event=>{if(Date.now()<suppressClickUntilRef.current){event.preventDefault();return;}window.location.href=car.href;}}><CardImage key={image.src} src={image.src} alt={image.alt} loading={galleryLoaded?undefined:imageLoading}/></p>)}
          </div>
        </div>
        <button type="button" className="slick-arrow slick-prev" disabled={loading||motion!==null} aria-label={`Ảnh trước của ${car.name}`} onClick={()=>void moveImage(-1)}>Previous</button>
        <button type="button" className="slick-arrow slick-next" disabled={loading||motion!==null} aria-label={`Ảnh tiếp theo của ${car.name}`} onClick={()=>void moveImage(1)}>Next</button>
        {galleryError&&<span className="car-card-gallery__error" role="status">{galleryError}</span>}
      </div>
      {car.status && <span className="tinhtrang">{car.status}</span>}
    </div>
    <div className="mota"><div className={`gia_sp${discounted?' gia_sp--discount':''}`}>
      <span className="car-card-price" data-long-price={(car.priceHtml || '').replace(/<[^>]*>/g,'').trim().length>9 || undefined}>{parse(car.priceHtml || '')}</span>
      {discounted && <span className="car-card-discount">
        <svg viewBox="0 0 48 48" strokeOpacity="0.7" aria-hidden="true" focusable="false">
          <path d="m31 7 9 7-5 25a4 4 0 0 1-5 3L12 35Z" fill="#eeb323" stroke="#171717" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M30 3h12l3 14-27 27a4 4 0 0 1-6 0L3 35a4 4 0 0 1 0-6L27 5a4 4 0 0 1 3-2Z" fill="#ffd447" stroke="#171717" strokeWidth="2.5" strokeLinejoin="round"/>
          <circle cx="36" cy="10" r="3" fill="#e00000" stroke="#171717" strokeWidth="2"/>
          <path d="M36 10V1" stroke="#171717" strokeWidth="2.5" strokeLinecap="round"/>
          <text x="23" y="29" fill="#171717" fontFamily="Arial,sans-serif" fontSize="10" fontWeight="800" textAnchor="middle" transform="rotate(-45 23 25)">SALE</text>
        </svg>
        <span>Giảm giá</span>
      </span>}
    </div>
      <h3 className={car.nameClass}><a href={car.href} title={car.title}>{car.name}</a></h3>
      <ul>{car.specs.map((spec,index)=>{
        const text=spec.alt==='Showroom'?spec.text.replace(/^\s*showroom\s+/i,'').trim():spec.text;
        const showroom=spec.alt==='Showroom'?text.match(/^(Toàn\s+Trung)\s+(.+)$/i):null;
        return <li key={index} data-spec={spec.alt}>
          {spec.icon && <ResponsiveImage src={spec.icon} profile="icon" sizes="18px" alt={spec.alt || ''} />}
          <span className="car-card-spec__value" title={spec.text}>{showroom
            ? <><span className="car-card-showroom__name">{showroom[1]}</span>{' '}<span className="car-card-showroom__branch">{showroom[2]}</span></>
            : spec.alt==='Km'&&text.endsWith(' km')?<>{text.slice(0,-3)}<span className="car-card-spec__unit"> km</span></>:text}</span>
        </li>;
      })}</ul>
      <SalePlate slug={car.id} />
    </div>
  </div>;
}
