const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const config of [{width:1440,height:900}, {width:390,height:844}, {width:390,height:844,reducedMotion:'reduce'}]) {
      const context = await browser.newContext({viewport:{width:config.width,height:config.height}, reducedMotion:config.reducedMotion, isMobile:config.width<700});
      const photo = fs.readFileSync('public/upload/photo/img8444-2-7758.jpg');
      await context.route('https://cdn.toantrungxeluot.io.vn/**',route => route.fulfill({contentType:'image/jpeg',body:photo}));
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:3111/ve-chung-toi');
      await page.waitForTimeout(1400);
      const bar = page.getByRole('progressbar');
      await bar.waitFor({state:'visible'});
      const samples=[];
      for (const ratio of [0,.5,1,.25,0]) {
        await page.evaluate(ratio=>{
          const rect=document.querySelector('.tt-story').getBoundingClientRect();
          const bottom=Math.max(...[...document.querySelectorAll('.wap_header,.menu_mobi')].map(n=>n.getBoundingClientRect().bottom));
          const start=Math.max(0,rect.top+scrollY-bottom);
          const end=rect.bottom+scrollY-innerHeight;
          scrollTo({top:start+(end-start)*ratio,behavior:'instant'});
        },ratio);
        await page.waitForTimeout(250);
        const value=Number(await bar.getAttribute('aria-valuenow'));
        assert.ok(Math.abs(value-ratio*100)<=1,`${JSON.stringify(config)} ${ratio}: ${value}`);
        const geometry=await page.evaluate(()=>{
          const rect=document.querySelector('.tt-story__reading-progress').getBoundingClientRect();
          const headerBottom=Math.max(...[...document.querySelectorAll('.wap_header,.menu_mobi')].map(n=>n.getBoundingClientRect().bottom));
          return {top:rect.top,headerBottom,height:rect.height,width:rect.width,viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};
        });
        assert.ok(Math.abs(geometry.top-geometry.headerBottom)<1);
        assert.equal(geometry.height,3);
        assert.equal(geometry.width,geometry.viewport);
        assert.ok(geometry.overflow<=1);
        samples.push(value);
      }
      if (config.width===1440) {
        await page.setViewportSize({width:390,height:844});
        await page.waitForTimeout(350);
        const offset=await page.evaluate(()=>document.querySelector('.tt-story__reading-progress').getBoundingClientRect().top-document.querySelector('.menu_mobi').getBoundingClientRect().bottom);
        assert.ok(Math.abs(offset)<1,'offset updates across breakpoints');
      }
      await page.screenshot({path:`.tmp/about-progress-${config.width}-${config.reducedMotion||'normal'}.png`});
      await page.reload();
      await bar.waitFor({state:'visible'});
      assert.equal(await bar.getAttribute('aria-valuenow'),'0');
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({config,samples,errors}));
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
