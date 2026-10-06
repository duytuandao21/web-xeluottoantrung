import { safeChatUrl, type ChatSource } from '@/lib/chatbot';

function searchSuggestions(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,form,input,meta,base,link').forEach(node => node.remove());
  parsed.querySelectorAll('*').forEach(node => {
    for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name) || ['srcdoc', 'formaction', 'xlink:href'].includes(attribute.name)) node.removeAttribute(attribute.name);
  });
  parsed.querySelectorAll('a').forEach(link => {
    const url = safeChatUrl(link.getAttribute('href') || '');
    if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    else link.removeAttribute('href');
  });
  return parsed.head.innerHTML + parsed.body.innerHTML;
}

export default function ChatSources({ sources = [], searchEntryPoint }: { sources?: ChatSource[]; searchEntryPoint?: string }) {
  const valid = sources.filter(source => safeChatUrl(source.url));
  // Google-provided Search Suggestions are isolated from the site. Scripts,
  // forms, embedded pages and top navigation are forbidden by sandbox/CSP.
  const document = searchEntryPoint ? `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.google.com https://www.gstatic.com; base-uri 'none'; form-action 'none'"><base target="_blank"></head><body style="margin:0;font-family:Arial,sans-serif">${searchSuggestions(searchEntryPoint)}</body></html>` : undefined;
  if (!valid.length && !document) return null;
  return <div className="tt-chat-sources">
    {valid.length > 0 && <><h4>Nguồn tham khảo</h4><div>{valid.map((source, index) => <a key={source.url} href={safeChatUrl(source.url)} title={source.title} target="_blank" rel="noopener noreferrer">[{index + 1}] {source.title} <span aria-hidden="true">↗</span></a>)}</div></>}
    {document && <iframe title="Gợi ý tìm kiếm từ Google" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={document} />}
  </div>;
}
