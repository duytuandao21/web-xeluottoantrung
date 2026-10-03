import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// API/Auth contract fixtures only; nothing is written to Supabase or PostgreSQL.
const env=await readFile('../admin-xeluottoantrung/.env','utf8');
const authUrl=env.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];assert(authUrl);
const key=`sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`, id='edb1c10d-f5f8-490d-95b5-7d5e648d45ae', secondId='edb1c10d-f5f8-490d-95b5-7d5e648d45af';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),expires=Math.floor(Date.now()/1000)+3600;
const session={access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:id,exp:expires,role:'authenticated'})}.fixture`,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:expires,user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}};
const permissions=['read','settings.update','rules.read','rules.update','content.update','sources.manage','versions.manage','publish','simulate','audit.read'].map(value=>`auspicious_date.${value}`);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session});
  let settings={id:1,isEnabled:false,name:'Xem ngày mua xe',maxSearchDays:90,defaultPurpose:'BUY_CAR',supportedPurposes:['BUY_CAR','RECEIVE_CAR','SIGN_CONTRACT'],showLunarDate:true,showCanChi:true,showGoodHours:false,showExplanation:true,showScore:false,disclaimer:'Thông tin chỉ mang tính tham khảo.',ctaLabel:'Xem xe đang bán',seoTitle:'Xem ngày mua xe',seoDescription:'Tham khảo ngày mua xe.',createdAt:'2026-10-03',updatedAt:'2026-10-03'};
  const versions=[{id,name:'Bộ quy tắc mua xe',purpose:'BUY_CAR',version:'1.0.0',status:'DRAFT',revision:1,validationReport:null},{id:secondId,name:'Bộ quy tắc nhận xe',purpose:'RECEIVE_CAR',version:'1.0.0',status:'VALIDATED',revision:1,validationReport:null}];
  const rule={id,code:'DIRECT_AGE_CONFLICT',category:'COMPATIBILITY',priority:'CRITICAL',effect:'NEGATIVE',weight:40,hardExclusion:true,isEnabled:true,engineHandler:'DIRECT_AGE_CONFLICT',sortOrder:0,parameters:{}};
  let contents=[{id,ruleId:id,title:'Ngày xung trực tiếp với tuổi',shortDescription:'Mô tả tham khảo',detailDescription:'Nội dung chi tiết'}],sources=[],savedSettings,simulationPayload,sourcePayload,deleted=false,readOnly=false;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/admin/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname,method=request.method(),payload=method==='GET'?null:request.postDataJSON();let result={};let status=200;
   if(path.endsWith('/admin/me')) result={profile:{id,fullName:'Calendar fixture',status:'active'},roles:['ADMIN'],permissions:readOnly?[]:permissions};
   else if(path.endsWith('/overview')) result={settings,versions};
   else if(path.endsWith('/settings')) {savedSettings=payload;settings={...settings,...payload};result=settings;}
   else if(path.endsWith('/simulate')) {simulationPayload=payload;result={primary:{date:payload.targetDate,classification:'AVOID',score:10,criticalViolations:1,rulesetVersion:'1.0.0',calendar:{lunar:{day:3,month:1,year:2026}},almanac:{tabooCodes:['TAM_NUONG']},trace:[{code:rule.code,matched:true,status:'MATCH',effect:'NEGATIVE',priority:'CRITICAL',scoreDelta:-40,hardExclusion:true}]},comparison:null};}
   else if(path.endsWith('/content')) {contents=[{...contents[0],...payload}];result=contents[0];}
   else if(path.endsWith('/sources')&&method==='POST') {sourcePayload=payload;sources=[{...payload,id,ruleId:id}];result=sources[0];}
   else if(path.endsWith(`/sources/${id}`)&&method==='DELETE') {deleted=true;sources=[];result={};}
   else if(path.endsWith('/validate')) {versions[0].status='REVIEW';result={version:versions[0],report:{passed:false,total:0,pass:0,fail:0,changed:0,cases:[],errors:['Chưa có nguồn được xác minh.']}};}
   else if(path.endsWith('/publish')) {status=409;result={message:'Không thể xuất bản vì ca tham chiếu chưa đạt.'};}
   else if(path.endsWith('/audit')) result={data:[{id,adminName:'Calendar fixture',action:'settings.update',entityType:'settings',entityId:'1',version:null,reason:'Đổi cấu hình kiểm thử',createdAt:'2026-10-03T00:00:00Z',beforeData:{maxSearchDays:90},afterData:{maxSearchDays:35}}],meta:{page:1,limit:20,total:1,totalPages:1}};
   else if(path.includes('/versions/')) result={set:versions[0],rules:[rule],contents,sources,cases:[]};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto('http://localhost:3000/tien-ich/xem-ngay-mua-xe',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Kiểm thử',exact:true}).click();
  await page.locator('input[name="birthDate"]').fill('1998-08-15');await page.locator('input[name="targetDate"]').fill('2026-02-19');
  await page.getByRole('button',{name:'Chạy kiểm thử',exact:true}).click();await page.getByRole('heading',{name:'1.0.0 · Nên tránh',exact:true}).waitFor();
  assert.equal(simulationPayload.ruleSetId,id);assert.equal('gender' in simulationPayload,false);
  await page.getByRole('button',{name:'Cấu hình',exact:true}).first().click();
  await page.locator('input[name="maxSearchDays"]').fill('35');await page.locator('input[name="reason"]').fill('Đổi khoảng ngày kiểm thử');await page.getByRole('button',{name:'Lưu cấu hình',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('input[name="reason"]')?.value==='');
  assert.equal(savedSettings.maxSearchDays,35);assert.equal('id' in savedSettings,false);assert.equal('updatedAt' in savedSettings,false);
  await page.getByRole('button',{name:'Nội dung',exact:true}).click();await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
  await page.locator('input[name="title"]').fill('Tiêu đề đã chỉnh');await page.locator('input[name="reason"]').fill('Cập nhật nội dung kiểm thử');await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.getByText('Tiêu đề đã chỉnh',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Nguồn tham chiếu',exact:true}).click();await page.getByLabel('Quy tắc',{exact:true}).selectOption(id);await page.getByRole('button',{name:'Thêm nguồn cho quy tắc đã chọn',exact:true}).click();
  await page.locator('input[name="title"]').fill('Nguồn kiểm chứng thử');await page.locator('input[name="url"]').fill('https://example.test/reference');await page.locator('textarea[name="note"]').fill('Đối chiếu chỉ trong test');await page.locator('input[name="reason"]').fill('Thêm nguồn kiểm thử');await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.getByText('Nguồn kiểm chứng thử',{exact:true}).waitFor();
  assert.equal(sourcePayload.verificationStatus,'UNVERIFIED');assert.equal('engineHandler' in sourcePayload,false);
  await page.getByRole('button',{name:'Xóa',exact:true}).click();await page.locator('input[name="reason"]').fill('Xóa nguồn kiểm thử');await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.getByText('Không có dữ liệu',{exact:true}).waitFor();assert.equal(deleted,true);
  await page.getByRole('button',{name:'Phiên bản',exact:true}).click();await page.getByRole('button',{name:'Xuất bản',exact:true}).click();
  await page.getByRole('dialog').waitFor();await page.getByRole('dialog').locator('input').fill('Xuất bản để kiểm tra lỗi');await page.getByRole('button',{name:'Xác nhận xuất bản',exact:true}).click();await page.getByText('Không thể xuất bản vì ca tham chiếu chưa đạt.',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').isVisible(),true);await page.getByRole('dialog').getByRole('button',{name:'Hủy',exact:true}).click();
  await page.getByRole('button',{name:'Ca tham chiếu',exact:true}).click();await page.getByText('Không có dữ liệu',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Nhật ký',exact:true}).click();await page.getByText('Đổi cấu hình kiểm thử',{exact:true}).waitFor();await page.getByText('Trước / sau',{exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`.next/auspicious-admin-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);
  readOnly=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Bạn không có quyền xem tiện ích này.',{exact:true}).waitFor();
  console.log(`Passed ${width}px: simulator, settings payload, content save, source add/delete, publish confirmation/failure, reference empty state, audit and permissions.`);await page.close();
 }
} finally {await browser.close();}
