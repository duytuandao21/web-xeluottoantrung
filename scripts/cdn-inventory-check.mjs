import fs from 'node:fs';
const base=process.env.AUDIT_API_URL||'http://52.65.173.30/api/v1';
const sources=[],urls=new Set();
const scan=x=>{if(typeof x==='string'){for(const m of x.matchAll(/(?:https?:\/\/[^\s"'<>]+|\/(?:upload|assets|thumbs|images)\/[^\s"'<>]+?)\.(?:jpe?g|png|webp|avif|gif|svg|ico)(?:\?[^\s"'<>]*)?/gi))urls.add(m[0].replaceAll('&amp;','&'));}else if(Array.isArray(x))x.forEach(scan);else if(x&&typeof x==='object')Object.values(x).forEach(scan);};
const get=async path=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${path} ${r.status}`);const j=await r.json();scan(j);sources.push({path,count:Array.isArray(j)?j.length:j.data?.length??1});return j;};
const catalogs={};
for(const path of ['/cars','/accessories','/articles','/services','/recruitments','/slides']){const first=await get(path+'?limit=100');let rows=first.data||first;for(let page=2;page<=(first.meta?.totalPages||1);page++)rows.push(...(await get(path+`?limit=100&page=${page}`)).data);catalogs[path]=rows;}
for(const path of ['/brands','/content','/lookups/body-styles','/lookups/transmissions','/lookups/branches','/site-settings/thiet-lap-logo','/site-settings/thiet-lap-favicon','/site-settings/thiet-lap-tai-sao-chon-chung-toi'])await get(path);
for(const c of catalogs['/cars'])await get('/cars/'+encodeURIComponent(c.slug));
for(const a of catalogs['/articles'])await get('/articles/'+encodeURIComponent(a.slug));
for(const s of catalogs['/services'])await get('/services/'+encodeURIComponent(s.slug));
for(const s of catalogs['/recruitments'])await get('/recruitments/'+encodeURIComponent(s.slug));
fs.writeFileSync('../toi-uu-hieu-suat-website/cdn-rollout/published-image-inventory.json',JSON.stringify({sources,urls:[...urls].sort()},null,2));
console.log(`PASS: ${sources.length} public API reads; ${urls.size} published image URLs; car/accessory/article/service/recruitment catalogs paginated.`);
