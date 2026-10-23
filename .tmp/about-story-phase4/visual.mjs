import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
const photo = await readFile('public/upload/photo/img8444-2-7758.jpg');
const browser = await chromium.launch({channel:'chrome',headless:true});
const cases = [
  {name:'mobile-360',width:360,height:780,dpr:3},
  {name:'mobile-390',width:390,height:844,dpr:3},
  {name:'tablet-768',width:768,height:1024,dpr:2},
  {name:'laptop-1024',width:1024,height:768,dpr:1},
  {name:'desktop-1440',width:1440,height:900,dpr:1},
];
const results=[];
for(const item of cases){
  const context=await browser.newContext({viewport:{width:item.width,height:item.height},deviceScaleFactor:item.dpr,serviceWorkers:'block'});
  await context.route(/https:\/\/cdn\.toantrungxeluot\.io\.vn\/.*ea9236a66bd8731eff71456b3663688d059e8a35eca1b31bdb38dfe544aa0f27\.jpg/,route=>route.fulfill({status:200,contentType:'image/jpeg',body:photo}));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto('http://127.0.0.1:3111/ve-chung-toi',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('.tt-story__hero').waitFor({timeout:15000});
  await page.evaluate(()=>document.fonts.ready);
  const result=await page.evaluate(()=>({
    title:document.title,h1:[...document.querySelectorAll('.tt-story h1')].map(node=>node.textContent),
    h2:[...document.querySelectorAll('.tt-story h2')].map(node=>node.textContent),
    stages:document.querySelectorAll('.tt-story__stage').length,milestones:document.querySelectorAll('.tt-story__milestone').length,
    horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
    heroImage:(document.querySelector('.tt-story__hero img')?.getAttribute('src')||''),
    heroLoaded:document.querySelector('.tt-story__hero img')?.complete,
    heroImageHeight:document.querySelector('.tt-story__hero img')?.getBoundingClientRect().height,
    heroHeight:document.querySelector('.tt-story__hero')?.getBoundingClientRect().height,
  }));
  const out=`.tmp/about-story-phase4/${item.name}-hero.png`;
  await mkdir(dirname(out),{recursive:true});
  await page.screenshot({path:out});
  await page.locator('#tt-story-history').scrollIntoViewIfNeeded();
  await page.screenshot({path:`.tmp/about-story-phase4/${item.name}-timeline.png`});
  results.push({case:item.name,http:response?.status(),...result,errors});
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results,null,2));
if(results.some(row=>row.http!==200||row.h1.length!==1||row.h2.length!==4||row.stages!==4||row.milestones!==12||row.horizontalOverflow>1||Math.abs(row.heroImageHeight-row.heroHeight)>1||row.errors.length))process.exitCode=1;
