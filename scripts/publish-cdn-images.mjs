import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import sharp from 'sharp';

// Explicit deployment tool, never imported by the website or its build.
// Copy referenced local images to NEW content-addressed R2 keys. Never overwrite
// or delete an existing object. Credentials stay server-side and are not logged.
const publish=process.argv.includes('--publish');
const root=process.cwd(),publicRoot=path.resolve('public');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sources=[...['app','components','lib','public/assets'].flatMap(walk),'data/shared.json'].filter(f=>/\.(?:tsx?|jsx?|json|css)$/.test(f));
const referenced=new Set();
const publishedInventory='../toi-uu-hieu-suat-website/cdn-rollout/published-image-inventory.json';
if(fs.existsSync(publishedInventory))for(const url of JSON.parse(fs.readFileSync(publishedInventory)).urls)if(url.startsWith('/')||url.startsWith('https://xeluottoantrung.com/upload/'))referenced.add(url.split(/[?#]/)[0]);
// Retain previously published local mappings when styles now reference CDN URLs.
if(fs.existsSync('config/cdn-local-images.json'))for(const src of Object.keys(JSON.parse(fs.readFileSync('config/cdn-local-images.json'))))referenced.add(src);
const auditFile='../toi-uu-hieu-suat-website/cdn-rollout/browser-before.json';
if(fs.existsSync(auditFile))for(const {url} of JSON.parse(fs.readFileSync(auditFile)).urls){try{const parsed=new URL(url,'http://127.0.0.1:3107');if(parsed.hostname==='127.0.0.1')referenced.add(parsed.pathname);}catch{}}
for(const file of sources){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/(?:\/(?:images|assets|upload|thumbs)\/[^\s"'<>`\\;,)]+?\.(?:png|jpe?g|webp|avif|gif|svg|ico))(?:[?#][^\s"'<>`\\]*)?/gi))referenced.add(match[0].split(/[?#]/)[0]);
 if(file.endsWith('.css'))for(const match of text.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)){if(/^(?:https?:|data:|#)/.test(match[1]))continue;const target=path.resolve(path.dirname(file),match[1].split(/[?#]/)[0]);if(target.startsWith(publicRoot+path.sep)&&/\.(png|jpe?g|webp|avif|gif|svg|ico)$/i.test(target))referenced.add('/'+path.relative(publicRoot,target).replaceAll('\\','/'));}}
// Dynamic utility filenames share this directory and are not string literals.
for(const file of walk('public/images'))if(/\.(png|jpe?g|webp|avif|gif|svg|ico)$/i.test(file))referenced.add('/'+path.relative(publicRoot,path.resolve(file)).replaceAll('\\','/'));
const entries={};const unique=new Map();
for(const src of [...referenced].sort()){
 const legacy=src.startsWith('https://xeluottoantrung.com/upload/');
 const file=path.resolve(publicRoot,legacy?decodeURIComponent(new URL(src).pathname).slice(1):src.slice(1));assert(file.startsWith(publicRoot+path.sep));if(!legacy&&!fs.existsSync(file))continue;
 let body;
 if(legacy){const response=await fetch(src,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,src);body=Buffer.from(await response.arrayBuffer());}
 else body=fs.readFileSync(file);
 const sha256=crypto.createHash('sha256').update(body).digest('hex'),extension=path.extname(file).slice(1).toLowerCase();
 const key=`website-static/${sha256}.${extension}`,meta=await sharp(body,{animated:true}).metadata().catch(()=>({}));
 if(legacy)assert(meta.width&&meta.height,'Legacy import must decode as a valid image');
 const flip=meta.orientation>=5&&meta.orientation<=8;
 entries[src]={key,sha256,bytes:body.length,width:(flip?meta.height:meta.width)||0,height:(flip?meta.width:meta.height)||0,animated:(meta.pages||1)>1};unique.set(key,{key,file,body,sha256,extension});
}
const bytes=[...unique.values()].reduce((n,o)=>n+o.body.length,0);console.log(JSON.stringify({referencedPaths:Object.keys(entries).length,uniqueObjects:unique.size,bytes,publish}));
fs.mkdirSync('../toi-uu-hieu-suat-website/cdn-rollout',{recursive:true});
if(!publish){fs.writeFileSync('../toi-uu-hieu-suat-website/cdn-rollout/local-image-plan.json',JSON.stringify(entries,null,2));process.exit(0);}
const env={};for(const line of fs.readFileSync('../api-xeluottoantrung/.env','utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m)env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}
for(const name of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_BASE_URL'])assert(env[name],`Missing server configuration: ${name}`);
const cdn=new URL(env.R2_PUBLIC_BASE_URL);assert.equal(cdn.origin,'https://cdn.toantrungxeluot.io.vn');
const require=createRequire(path.resolve('../api-xeluottoantrung/package.json'));const {S3Client,HeadObjectCommand,PutObjectCommand}=require('@aws-sdk/client-s3');
const client=new S3Client({region:'auto',endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY},forcePathStyle:true});
const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',svg:'image/svg+xml',ico:'image/x-icon'};
let created=0,reused=0;const queue=[...unique.values()];const statuses=[];
await Promise.all(Array.from({length:4},async()=>{while(queue.length){const object=queue.shift();let exists=false;
 try{const current=await client.send(new HeadObjectCommand({Bucket:env.R2_BUCKET,Key:object.key}));assert.equal(current.ContentLength,object.body.length);assert.equal(current.Metadata?.sha256,object.sha256,'Existing content-addressed object cannot be overwritten');exists=true;reused++;}catch(error){if(!['NotFound','NoSuchKey'].includes(error?.name)&&error?.$metadata?.httpStatusCode!==404)throw error;}
 if(!exists){await client.send(new PutObjectCommand({Bucket:env.R2_BUCKET,Key:object.key,Body:object.body,ContentType:mime[object.extension],CacheControl:'public, max-age=31536000, immutable',Metadata:{sha256:object.sha256},IfNoneMatch:'*'}));created++;}
 statuses.push({key:object.key,bytes:object.body.length,reused:exists});if(statuses.length%25===0)console.log(`Published/verified ${statuses.length}/${unique.size}`);
}}));
const urls=Object.fromEntries(Object.entries(entries).map(([src,entry])=>[src,{...entry,url:`${cdn.origin}/${entry.key}`} ]));
fs.mkdirSync('config',{recursive:true});fs.writeFileSync('config/cdn-local-images.json',JSON.stringify(urls,null,2)+'\n');
fs.writeFileSync('../toi-uu-hieu-suat-website/cdn-rollout/local-image-publish.json',JSON.stringify({created,reused,bytes,objects:statuses},null,2));console.log(`PASS: ${created} new immutable objects, ${reused} reused; manifest contains no credentials.`);
