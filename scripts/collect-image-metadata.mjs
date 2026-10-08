import fs from 'node:fs';
import sharp from 'sharp';
const out='../toi-uu-hieu-suat-website/cdn-rollout';
const baseline=JSON.parse(fs.readFileSync(`${out}/browser-before.json`));
const publishedInventory=`${out}/published-image-inventory.json`;
if(fs.existsSync(publishedInventory))baseline.urls.push(...JSON.parse(fs.readFileSync(publishedInventory)).urls.map(url=>({url,width:0,height:0})));
const entries=fs.existsSync('config/cdn-image-dimensions.json')?JSON.parse(fs.readFileSync('config/cdn-image-dimensions.json')):{};
for(const item of JSON.parse(fs.readFileSync('../toi-uu-hieu-suat-website/phase-2a/image-inventory.json'))){const dimensions=item.natural?.find(v=>/^\d+×\d+$/.test(v));if(dimensions){const [width,height]=dimensions.split('×').map(Number);entries[item.url]={width,height};}}
for(const item of baseline.urls)if(item.url?.startsWith('https://')&&item.width&&item.height)entries[item.url]={width:item.width,height:item.height};
const unknown=[...new Set(baseline.urls.map(v=>v.url))].filter(url=>/^https:\/\/(?:pub-edb90463be404b1d8b79b79517518131\.r2\.dev|cdn\.toantrungxeluot\.io\.vn)\//.test(url)&&/\.(jpe?g|png|webp|avif)$/i.test(new URL(url).pathname)&&!entries[url]);
await Promise.all(Array.from({length:3},async()=>{while(unknown.length){const url=unknown.shift(),target=new URL(url);target.hostname='cdn.toantrungxeluot.io.vn';const r=await fetch(target,{headers:{Range:'bytes=0-65535'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Source image failed: ${url} ${r.status}`);let meta;try{meta=await sharp(Buffer.from(await r.arrayBuffer())).metadata();}catch{const full=await fetch(target,{signal:AbortSignal.timeout(30000)});if(!full.ok)throw new Error(`Source image failed: ${url} ${full.status}`);meta=await sharp(Buffer.from(await full.arrayBuffer())).metadata();}const flip=meta.orientation>=5&&meta.orientation<=8;entries[url]={width:flip?meta.height:meta.width,height:flip?meta.width:meta.height,animated:(meta.pages||1)>1};}}));
for(const [src,dimensions] of Object.entries(entries))if(src.startsWith('https://pub-edb90463be404b1d8b79b79517518131.r2.dev/'))entries[src.replace('https://pub-edb90463be404b1d8b79b79517518131.r2.dev','https://cdn.toantrungxeluot.io.vn')]=dimensions;
fs.mkdirSync('config',{recursive:true});fs.writeFileSync('config/cdn-image-dimensions.json',JSON.stringify(entries,null,2)+'\n');console.log(`PASS: verified source dimensions for ${Object.keys(entries).length} remote URLs; no runtime metadata requests.`);
