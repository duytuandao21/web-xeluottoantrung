"use client";
import { forwardRef, useEffect, useRef, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { getImageOriginalUrl, imageDimensions, responsiveImage, type ImageProfile } from '@/lib/image-delivery';

type Props = ImgHTMLAttributes<HTMLImageElement> & { src: string; profile?: ImageProfile };

// Same <img>, CSS, attributes and loading lifecycle. Native srcset handles DPR;
// verified source aspect ratio avoids layout drift from rounded resize heights.
const ResponsiveImage = forwardRef<HTMLImageElement, Props>(function ResponsiveImage({src,profile='content',sizes,style,srcSet,onError,...props},ref) {
  const delivery=responsiveImage(src,profile,sizes);
  const imageRef=useRef<HTMLImageElement>(null);
  useEffect(()=>{
    const image=imageRef.current;
    if(image?.complete && image.naturalWidth===0 && image.currentSrc && image.src!==delivery.original && delivery.src!==delivery.original){
      image.removeAttribute('srcset');image.removeAttribute('sizes');image.src=delivery.original;
    }
  },[delivery.src,delivery.original]);
  const sourceDimensions=imageDimensions(src);
  // Multi-frame metadata can expose stacked heights. Preserve native frame sizing.
  const dimensions=sourceDimensions?.animated ? undefined : sourceDimensions;
  const imageStyle=dimensions?.width&&dimensions.height
    ? {'--tt-image-source-ratio':`${dimensions.width} / ${dimensions.height}`,...style} as CSSProperties:style;
  return <img {...props} alt={props.alt ?? ''}
    width={props.width ?? (profile==='content' ? dimensions?.width : undefined)}
    height={props.height ?? (profile==='content' ? dimensions?.height : undefined)}
    ref={image=>{imageRef.current=image;if(typeof ref==='function')ref(image);else if(ref)ref.current=image;}}
    src={delivery.src} srcSet={delivery.srcSet||srcSet} sizes={delivery.sizes||sizes}
    data-image-original={src} style={imageStyle} onError={event=>{
      const image=event.currentTarget;
      if(image.src!==delivery.original && delivery.src!==delivery.original){image.removeAttribute('srcset');image.removeAttribute('sizes');image.src=delivery.original;}
      else if (image.dataset.deliveryFailed !== src) {
        image.dataset.deliveryFailed = src;
        onError?.(event);
        // Existing component fallbacks may assign a local URL directly to the DOM.
        const fallback = image.getAttribute('src');
        if (fallback) image.src = getImageOriginalUrl(fallback);
      }
    }}/>;
});
export default ResponsiveImage;
