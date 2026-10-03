import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Browser contract fixtures only. No database changes; the real engine is covered by API tests.
const config = { enabled:true, name:'Xem ngày mua xe', maxSearchDays:90, purposes:['BUY_CAR','RECEIVE_CAR','SIGN_CONTRACT'], defaultPurpose:'BUY_CAR', display:{showLunarDate:true,showCanChi:true,showGoodHours:true,showExplanation:true,showScore:false}, disclaimer:'Thông tin chỉ mang tính tham khảo.', ctaLabel:'Xem xe đang bán tại Toàn Trung', currentDate:'2026-10-03', minDate:'1900-01-01', maxDate:'2099-12-31', defaultFrom:'2026-10-01', defaultTo:'2026-10-31' };
const labels = { VERY_GOOD:'Rất phù hợp', GOOD:'Phù hợp', NORMAL:'Bình thường', NOT_RECOMMENDED:'Ít phù hợp', AVOID:'Nên tránh' };
const days = Array.from({length:31},(_,i) => ({ date:`2026-10-${String(i+1).padStart(2,'0')}`, classification:Object.keys(labels)[i%5], criticalViolations:i%5===4?1:0, lunar:{day:i%29+1,month:8,year:2026,leap:false}, summaryReasons:[{code:'TEST',effect:'POSITIVE',title:'Lý do từ backend',shortDescription:'Nội dung tham khảo.'}] }));
const result = { rulesetVersion:'1.0.0',from:'2026-10-01',to:'2026-10-31',results:days,months:[{key:'2026-10',label:'Tháng 10/2026',cells:[null,null,null,...days.map((d,i)=>({date:d.date,day:i+1,classification:d.classification}))]}],recommended:days.filter(d=>d.classification==='VERY_GOOD').slice(0,3),disclaimer:config.disclaimer,ctaLabel:config.ctaLabel };
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('.next',{recursive:true});
try {
 for(const width of [1440,1024,768,390,360]) {
  const context=await browser.newContext({viewport:{width,height:960}}), page=await context.newPage();
  let mode='normal', searches=0, searchInput, detailInput;
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|unique.*key/.test(m.text()))errors.push(m.text());});
  await context.route('**/*',async route=>{
   const request=route.request(), path=new URL(request.url()).pathname;
   if(request.headers()['next-router-prefetch']==='1') return route.abort();
   if(!path.startsWith('/api/v1/auspicious-dates/')) return route.continue();
   let body=config,status=200;
   if(path.endsWith('/config')) body={...config,enabled:mode!=='disabled'};
   if(path.endsWith('/search')) { searches++;searchInput=request.postDataJSON();await new Promise(resolve=>setTimeout(resolve,150));if(mode==='error'){status=400;body={message:'Chỉ được xem tối đa 90 ngày.'};}else body=result; }
   if(path.endsWith('/detail')) {
    detailInput=request.postDataJSON();const day=days.find(d=>d.date===detailInput.targetDate);
    body={...day,calendar:{solarDate:day.date,lunar:day.lunar,canChi:{year:{label:'Bính Ngọ'},month:{label:'Đinh Dậu'},day:{label:'Giáp Tý'}},solarTerm:'Thu phân'},reasonGroups:[{category:'COMPATIBILITY',reasons:[{code:'TEST',effect:'POSITIVE',title:'Lý do từ backend',detailDescription:'Mô tả chi tiết do admin quản lý.'}]}],goodHours:[{branch:'Tý',start:'23:00',end:'01:00',crossesMidnight:true}],rulesetVersion:'1.0.0',disclaimer:config.disclaimer,ctaLabel:config.ctaLabel};
   }
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const response=await page.goto('http://localhost:3001/tien-ich/xem-ngay-mua-xe',{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await page.locator('input[name="birthDate"]').waitFor();
  await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();assert.equal(searches,0,'required birthday');
  assert.equal(await page.locator('input[name="from"]').inputValue(),'01/10/2026');
  assert.equal(await page.locator('input[name="to"]').inputValue(),'31/10/2026');
  await page.locator('input[name="birthDate"]').fill('31/02/1998');
  await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();assert.equal(searches,0,'invalid civil date');
  await page.locator('input[name="birthDate"]').fill('15081998');
  assert.equal(await page.locator('input[name="birthDate"]').inputValue(),'15/08/1998','numeric keyboard separators');
  await page.locator('input[name="to"]').fill('30/09/2026');
  await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();assert.equal(searches,0,'end before start');
  await page.getByLabel('Chọn đến ngày bằng lịch',{exact:true}).fill('2026-10-31');
  assert.equal(await page.locator('input[name="to"]').inputValue(),'31/10/2026','calendar updates visible format');
  await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();
  const confirmation = page.getByRole('dialog',{name:'Thông tin tham khảo',exact:true});
  await confirmation.waitFor();
  assert.equal(await confirmation.locator('p').textContent(),'Kết quả chỉ là gợi ý theo một số tiêu chí lịch và quan niệm truyền thống, không bảo đảm may mắn, tài lộc hay an toàn. Hãy ưu tiên kiểm tra xe, giấy tờ và lịch hẹn thực tế.');
  assert.equal(searches,0,'no request before agreement');
  assert.equal(await confirmation.getByRole('button',{name:'Hủy',exact:true}).evaluate(el=>el===document.activeElement),true,'initial dialog focus');
  await page.screenshot({path:`.next/auspicious-confirmation-${width}.png`});
  await confirmation.getByRole('button',{name:'Hủy',exact:true}).click();
  await confirmation.waitFor({state:'hidden'});
  assert.equal(searches,0,'cancel does not search');
  assert.equal(await page.locator('input[name="birthDate"]').inputValue(),'15/08/1998','cancel preserves form');
  assert.equal(await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).evaluate(el=>el===document.activeElement),true,'cancel restores focus');
  await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();
  await confirmation.waitFor();await page.keyboard.press('Escape');await confirmation.waitFor({state:'hidden'});
  assert.equal(searches,0,'Escape does not search');
  await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();
  await confirmation.getByRole('button',{name:'Đồng ý',exact:true}).click();
  await page.getByRole('heading',{name:'Ngày phù hợp trong khoảng',exact:true}).waitFor();
  assert.equal(searches,1,'one request after agreement');
  assert.equal(await page.getByRole('heading',{name:'Ngày gợi ý',exact:true}).count(),0);
  const calendarBox = await page.locator('.tt-date-calendar').boundingBox();
  if(width>900) assert.ok(calendarBox.width>720,'desktop calendar expanded');
  if(width<600) {
   assert.equal(await page.locator('.tt-date-calendar__day.is-VERY_GOOD').first().evaluate(el=>getComputedStyle(el,'::after').content),'"✓"','single mobile tick');
   assert.equal(await page.locator('.tt-date-calendar__day').first().evaluate(el=>getComputedStyle(el).minHeight),'54px','mobile day size retained');
  }
  assert.equal(searchInput.birthDate,'1998-08-15');assert.equal(searchInput.from,'2026-10-01');assert.equal(searchInput.to,'2026-10-31');assert.equal('gender' in searchInput,false);
  assert.equal(await page.locator('.tt-date-calendar__day').count(),31);
  assert.deepEqual(await page.locator('.tt-date-legend li').allTextContents(),['Rất phù hợp','Bình thường','Nên tránh']);
  for(const [date,label,color] of [['02/10/2026','Rất phù hợp','VERY_GOOD'],['03/10/2026','Bình thường','NORMAL'],['04/10/2026','Nên tránh','AVOID'],['05/10/2026','Nên tránh','AVOID']]) {
   assert.ok((await page.getByRole('button',{name:`${date}: ${label}`,exact:true}).getAttribute('class')).includes(`is-${color}`));
  }
  assert.equal(await page.locator('.tt-date-calendar .is-GOOD,.tt-date-calendar .is-NOT_RECOMMENDED').count(),0);
  for(const [date,label] of [['02/10/2026','Rất phù hợp'],['04/10/2026','Nên tránh']]) {
   await page.getByRole('button',{name:`${date}: ${label}`,exact:true}).click();
   await page.getByRole('heading',{name:`Ngày ${date}`,exact:true}).waitFor();
   assert.equal(await page.locator('#tt-date-detail .tt-date-status').textContent(),label);
  }
  await page.getByRole('button',{name:'01/10/2026: Rất phù hợp',exact:true}).click();
  await page.getByRole('heading',{name:'Ngày 01/10/2026',exact:true}).waitFor();
  assert.equal(detailInput.expectedRulesetVersion,'1.0.0');assert.equal('from' in detailInput,false);
  assert.equal(await page.locator('#tt-date-detail a').getAttribute('href'),'/san-pham');
  assert.equal(await page.locator('#tt-date-detail').evaluate(el=>el===document.activeElement),true,'detail focus');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
  await page.screenshot({path:`.next/auspicious-web-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();
  await confirmation.getByRole('button',{name:'Hủy',exact:true}).click();
  assert.equal(searches,1,'cancel new search keeps previous result');
  assert.equal(await page.locator('.tt-date-calendar__day').count(),31);
  mode='error';await page.getByRole('button',{name:'Xem ngày phù hợp',exact:true}).click();await confirmation.getByRole('button',{name:'Đồng ý',exact:true}).click();await page.getByText('Chỉ được xem tối đa 90 ngày.',{exact:true}).waitFor();
  mode='normal';await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByRole('heading',{name:'Ngày phù hợp trong khoảng',exact:true}).waitFor();
  mode='disabled';await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Tiện ích đang tạm bảo trì.',exact:true}).waitFor();
  assert.equal(await page.locator('input[name="birthDate"]').count(),0);assert.deepEqual(errors,[]);
  console.log(`Passed ${width}px: form, search, calendar, details, focus, error/retry, maintenance, CTA, no overflow.`);
  await context.close();
 }
} finally {await browser.close();}
