const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.join(__dirname, 'about-redesign');
let runningBrowser;
fs.mkdirSync(out, { recursive: true });
const threeChunks = fs.readdirSync('.next/static/chunks').filter(n => n.endsWith('.js') && fs.readFileSync(`.next/static/chunks/${n}`, 'utf8').includes('WebGLRenderer'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  runningBrowser=browser;
  const results = [];
  for (const run of [
    {name:'desktop',width:1440,height:1000}, {name:'laptop',width:1024,height:900},
    {name:'tablet',width:768,height:1000}, {name:'mobile',width:390,height:844,mobile:true},
    {name:'small',width:360,height:800,mobile:true}, {name:'reduced',width:1440,height:900,reduced:true},
    {name:'no-js',width:390,height:844,noJs:true}, {name:'no-webgl',width:1440,height:900,noWebgl:true},
  ]) {
    const context=await browser.newContext({viewport:{width:run.width,height:run.height},isMobile:!!run.mobile,hasTouch:!!run.mobile,
      deviceScaleFactor:run.mobile?3:1,javaScriptEnabled:!run.noJs,reducedMotion:run.reduced?'reduce':'no-preference',serviceWorkers:'block'});
    await context.route('**/*', route => route.request().method()!=='GET'||route.request().headers()['next-router-prefetch'] ? route.abort() : route.continue());
    await context.addInitScript(({noWebgl})=>{
      window.__draws=0;
      const get=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        if(noWebgl&&String(type).startsWith('webgl'))return null;
        const gl=get.call(this,type,...args);
        if(gl&&String(type).startsWith('webgl')&&!gl.__counted){gl.__counted=true;for(const name of ['clear','drawArrays','drawElements']){const orig=gl[name];gl[name]=function(...a){window.__draws++;return orig.apply(this,a);};}}
        return gl;
      };
    }, {noWebgl:!!run.noWebgl});
    const page=await context.newPage(); const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    const response=await page.goto('http://localhost:3111/ve-chung-toi',{waitUntil:'load',timeout:60000});
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(1600);
    if(run.name==='desktop')await page.waitForFunction(()=>document.querySelector('.tt-story__sculpture')?.dataset.webgl==='on',{},{timeout:12000});
    const info=await page.evaluate(()=>({h1:document.querySelectorAll('h1').length,chapters:document.querySelectorAll('.tt-story > section').length,
      milestones:document.querySelectorAll('.tt-story__milestone').length,overflow:document.documentElement.scrollWidth>innerWidth,
      h1font:getComputedStyle(document.querySelector('.tt-story h1')).fontFamily,h1weight:getComputedStyle(document.querySelector('.tt-story h1')).fontWeight,
      bodyfont:getComputedStyle(document.querySelector('.tt-story__hero-body')).fontFamily,
      heroLoaded:document.querySelector('.tt-story__hero-picture img').naturalWidth>0,
      canvas:document.querySelectorAll('.tt-story__sculpture canvas').length,draws:window.__draws||0}));
    assert.equal(response.status(),200);assert.equal(info.h1,1);assert.equal(info.milestones,12);assert.equal(info.overflow,false);assert.equal(info.heroLoaded,true);
    assert.match(info.h1font,/tieude/);assert.match(info.bodyfont,/body/);assert.equal(info.h1weight,'400');assert.deepEqual(errors,[]);
    if(run.mobile||run.reduced||run.noJs||run.width<1024){assert.equal(info.canvas,0);assert.equal(requests.some(u=>threeChunks.some(n=>u.includes(n))),false,'3D bundle must not load for fallback');}
    await page.screenshot({path:path.join(out,`${run.name}-hero.png`)});
    if(run.name==='desktop'){
      const a=await page.evaluate(()=>window.__draws);await page.waitForTimeout(700);const b=await page.evaluate(()=>window.__draws);assert.equal(a,b,'No continuous WebGL rendering at idle');
      await page.keyboard.press('Escape');
      await page.locator('.tt-story__hero').dispatchEvent('pointermove',{clientX:1000,clientY:400});
      await page.waitForFunction(previous=>window.__draws>previous,b,{timeout:5000});
      await page.locator('#tt-story-stage-2018-2022').scrollIntoViewIfNeeded();await page.waitForTimeout(450);
      const c=await page.evaluate(()=>window.__draws);await page.waitForTimeout(700);assert.equal(c,await page.evaluate(()=>window.__draws),'Offscreen WebGL must stop');
      await page.screenshot({path:path.join(out,'desktop-timeline.png')});
      await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(250);
      await page.evaluate(()=>{const c=document.querySelector('.tt-story__sculpture canvas');c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();});
      await page.waitForTimeout(300);assert.equal(await page.locator('.tt-story__sculpture canvas').count(),0,'Context loss returns to CSS');
      await page.screenshot({path:path.join(out,'desktop-context-loss.png')});
    }
    if(run.name==='mobile'){await page.locator('#tt-story-stage-2018-2022').scrollIntoViewIfNeeded();await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'mobile-timeline.png')});}
    results.push({name:run.name,...info,errors});await context.close();
  }
  await browser.close();fs.writeFileSync(path.join(out,'web-results.json'),JSON.stringify({threeChunks,results},null,2));console.log(JSON.stringify(results));
})().catch(async e=>{console.error(e.stack);await runningBrowser?.close();process.exitCode=1;});
