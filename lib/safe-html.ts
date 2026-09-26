import { load } from 'cheerio';

const allowed = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'img']);
const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input', 'button']);

export function safeHtml(html: string): string {
  const $ = load(html, {}, false);
  $('*').each((_, element) => {
    if (!('tagName' in element) || !('attribs' in element)) return;
    const tag = element.tagName.toLowerCase();
    if (blocked.has(tag)) { $(element).remove(); return; }
    if (!allowed.has(tag)) { $(element).replaceWith($(element).contents()); return; }
    for (const attribute of Object.keys(element.attribs)) {
      const value = element.attribs[attribute];
      const validLink = tag === 'a' && attribute === 'href' && /^(https?:\/\/|mailto:|tel:|\/[^/]|#)/i.test(value);
      const validImage = tag === 'img' && attribute === 'src' && /^(https?:\/\/|\/[^/])/i.test(value);
      if (!validLink && !validImage && !(tag === 'img' && attribute === 'alt')) $(element).removeAttr(attribute);
    }
    if (tag === 'a' && $(element).attr('href')) $(element).attr({ target: '_blank', rel: 'noopener noreferrer' });
  });
  return $.html();
}
