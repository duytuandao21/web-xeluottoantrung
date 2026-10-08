import parse, { attributesToProps, Element } from 'html-react-parser';
import ResponsiveImage from './ResponsiveImage';
import { getImageOriginalUrl, imageProfile } from '@/lib/image-delivery';

/** Server-rendered CMS body: image delivery without importing interactive car/slider components. */
export default function ImageMarkup({ html }: { html: string }) {
  return <>{parse(html, { replace(node) {
    if (!(node instanceof Element)) return;
    if (node.name === 'a' && /\.(?:jpe?g|png|webp|avif|gif|svg)(?:[?#]|$)/i.test(node.attribs.href || '')) {
      node.attribs.href = getImageOriginalUrl(node.attribs.href);
    }
    if (node.name !== 'img') return;
    const { fetchpriority, ...attrs } = node.attribs;
    const classes = [attrs.class || ''];
    let parent = node.parent;
    while (parent instanceof Element) { classes.push(parent.attribs.class || ''); parent = parent.parent; }
    return <ResponsiveImage {...attributesToProps(attrs)} src={attrs.src || ''} profile={imageProfile(classes.join(' '))}
      fetchPriority={fetchpriority === 'high' ? 'high' : fetchpriority === 'low' ? 'low' : undefined} />;
  } })}</>;
}
