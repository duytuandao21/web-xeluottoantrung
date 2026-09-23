import {access,readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';

const manifest=JSON.parse(await readFile('data/route-manifest.json','utf8'));
const routes=new Set(Object.keys(manifest).map(key=>key.split('?')[0]));
const assets=new Set(),links=new Set(),missing=[],known=[];
function inspect(html) {
  const $=load(html);
  $('[src],[data-lazy],[href]').each((_,el)=>{
    for(const attr of ['src','data-lazy','href']) {
      const value=$(el).attr(attr);if(!value?.startsWith('/'))continue;
      const url=decodeURIComponent(value.split(/[?#]/)[0]);
      if(/^\/(assets|upload|thumbs)\//.test(url))assets.add(url);
      else if(attr==='href')links.add(url.replace(/\/$/,'')||'/');
    }
  });
}
for(const filename of new Set(Object.values(manifest))) inspect(JSON.parse(await readFile(`data/pages/${filename}`,'utf8')).content);
const shared=JSON.parse(await readFile('data/shared.json','utf8'));
inspect(shared.footer+shared.copyright+shared.contacts);
function menu(items){for(const item of items){if(item.href?.startsWith('/'))links.add(item.href);menu(item.children);}}menu(shared.menu);
for(const car of Object.values(JSON.parse(await readFile('data/cars.json','utf8')))) {
  links.add(car.href.split('?')[0]);car.images.forEach(image=>assets.add(image.src));car.specs.forEach(spec=>{if(spec.icon)assets.add(spec.icon);});
}
async function styles(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await styles(file);else if(file.endsWith('.css')){const css=await readFile(file,'utf8');for(const match of css.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g)){if(/^(data:|https?:|#)/.test(match[1]))continue;const target=path.resolve(path.dirname(file),match[1].split(/[?#]/)[0]);assets.add('/'+path.relative(path.resolve('public'),target).replaceAll('\\','/'));}}}}
await styles('public/assets');
for(const asset of assets){try{await access(path.join('public',asset));}catch{
  // Unused jQuery UI theme sprites are also absent from the reference mirror.
  if(/\/images\/ui-bg_|\/images\/ui-icons_/.test(asset))known.push(asset);else missing.push(asset);
}}
for(const link of links)if(!routes.has(link)){if(link==='/cuu-ho')known.push(link);else missing.push(link);}
await mkdir('artifacts',{recursive:true});
const report={snapshots:Object.keys(manifest).length,routes:routes.size,assets:assets.size,missing,sourceGaps:known};
await writeFile('artifacts/asset-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(missing.length)process.exitCode=1;
