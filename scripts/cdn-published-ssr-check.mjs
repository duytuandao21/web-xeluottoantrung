import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load} from 'cheerio';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3107',out='../toi-uu-hieu-suat-website/cdn-rollout';
const get=async path=>{const r=await fetch(base+'/api/v1'+path);assert(r.ok,path);return r.json();};
const [cars,accessories,articles,services,jobs]=await Promise.all(['/cars?limit=100','/accessories?limit=100','/articles?limit=100','/services?limit=100','/recruitments?limit=100'].map(get));
const routes=[...cars.data.map(x=>'/'+x.slug),...accessories.data.map(x=>'/phu-kien-o-to/'+x.id),...articles.data.map(x=>'/'+x.slug),...services.data.map(x=>'/dich-vu/'+x.slug),...jobs.data.map(x=>'/tuyen-dung/'+x.slug),'/tim-kiem?q=xe'];
const rows=[],queue=[...routes];
await Promise.all(Array.from({length:3},async()=>{while(queue.length){const route=queue.shift(),r=await fetch(base+route,{signal:AbortSignal.timeout(90000)});assert.equal(r.status,200,route);const $=load(await r.text());
const images=$('img').map((_,el)=>({src:$(el).attr('src'),srcset:$(el).attr('srcset'),original:$(el).attr('data-image-original')})).get();
for(const image of images){assert(!image.src?.includes('.r2.dev/'),`${route}: old R2 img ${image.src}`);assert(!image.srcset?.includes('.r2.dev/'),`${route}: old R2 srcset`);if(image.original?.includes('pub-edb90463be404b1d8b79b79517518131.r2.dev')||image.original?.startsWith('/'))assert(image.src?.startsWith('https://cdn.toantrungxeluot.io.vn/'),`${route}: managed local image not on CDN ${image.original}`);}
const metadata=$('meta[property="og:image"],meta[name="twitter:image"],link[rel="icon"]').map((_,el)=>$(el).attr('content')||$(el).attr('href')).get();assert(metadata.every(x=>!x.includes('.r2.dev/')),`${route}: metadata old R2`);
rows.push({route,status:r.status,images:images.length,transformed:images.filter(x=>x.src.includes('/cdn-cgi/image/')).length,metadata});console.log(`PASS SSR ${route} (${images.length} images)`);}}));
fs.writeFileSync(`${out}/published-ssr-check.json`,JSON.stringify(rows,null,2));console.log(`PASS: all ${rows.length} published product/content URLs and search metadata use managed CDN images.`);
