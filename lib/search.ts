import 'server-only';
import {load} from 'cheerio';
import inventory from '@/data/cars.json';
import categories from '@/data/categories.json';
import type {Car} from '@/types/car';
import type {LegacyPageData,SearchParams} from '@/types/legacy';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('đ','d').toLowerCase();
const numeric=(text:string)=>Number(text.replace(/[^0-9]/g,''));
function price(car:Car) {
  const text=load(car.priceHtml).text();const billions=text.match(/([\d.]+)\s*Tỷ/i)?.[1];const millions=text.match(/([\d.]+)\s*Triệu/i)?.[1];
  return (billions?numeric(billions)*1000:0)+(millions?numeric(millions):0);
}
export function searchSnapshot(base:LegacyPageData,params:SearchParams):LegacyPageData {
  const $=load(base.content,{},false);
  const textParam=(name:string)=>Array.isArray(params[name])?(params[name] as string[])[0]:params[name] as string|undefined;
  const keywords=normalize(textParam('keyword')||'').split(/\s+/).filter(Boolean);
  const entries=Object.entries(inventory as Record<string,Car>);
  const seen=new Set<string>();
  let matches=entries.filter(([,car])=>{if(seen.has(car.href))return false;seen.add(car.href);return true;});
  if(keywords.length) matches=matches.filter(([,car])=>keywords.every(word=>normalize(car.name).includes(word)));
  for(const [param,group] of [['hang-xe','hangxe'],['kieu-dang','kieudang'],['hop-so','hopso'],['mau-sac','mausac']]) {
    const ids=(textParam(param)||'').split(',').filter(Boolean);if(!ids.length)continue;
    $(`.goiy_${group} p`).removeClass('active_tk').each((_,el)=>{if(ids.includes($(el).attr('data-id')||''))$(el).addClass('active_tk');});
    const labels=ids.map(id=>$(`.goiy_${group} p[data-id="${id}"]`).text().trim()).filter(Boolean);
    matches=matches.filter(([,car])=>labels.some(label=>{
      if(param==='hop-so')return car.specs.some(spec=>spec.alt==='Hộp số'&&normalize(spec.text)===normalize(label));
      const route='/'+normalize(label).replaceAll(' ','-');
      return ((categories as Record<string,string[]>)[route]||[]).includes(car.href.split('?')[0]);
    }));
  }
  for(const [param,kind,read] of [
    ['ngan-sach','ngansach',price],
    ['nam-san-xuat','nam',(car:Car)=>numeric(car.specs.find(spec=>spec.alt==='Biển số')?.text||'')],
    ['so-km','sokm',(car:Car)=>numeric(car.specs.find(spec=>spec.alt==='Km')?.text||'')],
  ] as const) {
    const value=textParam(param);if(!value)continue;const [min,max]=value.split('-').map(Number);if(!Number.isFinite(min)||!Number.isFinite(max))continue;
    $(`.gt_${kind}1`).attr('value',String(min));$(`.gt_${kind}2`).attr('value',String(max));
    matches=matches.filter(([,car])=>read(car)>=min&&read(car)<=max);
  }
  const sort=textParam('gia');if(sort)matches.sort((a,b)=>(price(a[1])-price(b[1]))*(sort==='gia desc'?-1:1));
  $('.wap_item').first().html(matches.map(([key])=>`<car-card data-key="${key}"></car-card>`).join(''));
  $('.td_dem span').text(String(matches.length));$('.pagination-home').remove();$('#keyword').attr('value',textParam('keyword')||'');
  return {...base,route:base.route+'?'+new URLSearchParams(Object.entries(params).filter((entry):entry is [string,string]=>typeof entry[1]==='string')).toString(),content:$.html()};
}
