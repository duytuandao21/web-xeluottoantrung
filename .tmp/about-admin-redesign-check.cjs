const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const out=path.join(__dirname,'about-redesign');fs.mkdirSync(out,{recursive:true});
let runningBrowser;
(async()=>{
  const publicData=await (await fetch('http://localhost:4111/api/v1/about-story',{signal:AbortSignal.timeout(10000)})).json();
  console.log('Fixture ready');
  const base={revision:1,updatedAt:new Date().toISOString(),sections:publicData.chapters.map(c=>({...c,id:`s-${c.key}`,chapterKey:c.key})),milestones:publicData.milestones.map((m,i)=>({...m,sortOrder:i,sourceNote:null})),stories:[],assets:publicData.chapters.flatMap(c=>c.images.map((a,i)=>({...a,publicUrl:a.url,ownerType:'section',ownerKey:c.key,altText:a.alt,sortOrder:i})))};
  const env=fs.readFileSync('../admin-xeluottoantrung/.env','utf8');const url=env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
  const storageKey=`sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const id='11111111-1111-4111-8111-111111111111';
  const token=[{alg:'HS256',typ:'JWT'},{sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+36000}].map(o=>Buffer.from(JSON.stringify(o)).toString('base64url')).join('.')+'.fixture';
  const session={access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,user:{id,email:'fixture@example.test',aud:'authenticated',app_metadata:{},user_metadata:{}}};
  const browser=await chromium.launch({channel:'chrome',headless:true});let mutations=0;
  runningBrowser=browser;
  const results=[];
  for(const run of [{name:'admin-desktop',width:1440,height:1000},{name:'admin-mobile',width:390,height:844},{name:'admin-dark',width:1440,height:1000,dark:true}]){
    let state=structuredClone(base),conflict=false;
    const c=await browser.newContext({viewport:{width:run.width,height:run.height},serviceWorkers:'block'});
    await c.addInitScript(({storageKey,session,dark,mobile})=>{localStorage.setItem(storageKey,JSON.stringify(session));if(dark)localStorage.setItem('admin-theme','dark');if(mobile)localStorage.setItem('admin-sidebar','false');},{storageKey,session,dark:!!run.dark,mobile:run.width<700});
    await c.route('**/api/v1/admin/**',async route=>{
      const req=route.request(),u=new URL(req.url()),p=u.pathname.replace('/api/v1/admin/','');
      const send=(obj,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(obj)});
      if(p==='me')return send({profile:{id,fullName:'Quản trị viên',status:'active'},roles:['admin'],permissions:['content.read','content.update','content.create','content.delete']});
      if(!p.startsWith('about-story'))return send({data:[],meta:{total:0,totalPages:1,page:1,perPage:10}});
      if(req.method()==='GET')return send(state);
      mutations++;const data=req.postDataJSON();
      assert.equal('publishStatus' in data,false);assert.equal('verificationStatus' in data,false);assert.equal('consentStatus' in data,false);assert.equal('rightsStatus' in data,false);
      if(conflict||data.expectedRevision!==state.revision)return send({message:'Nội dung đã thay đổi',statusCode:409},409);
      delete data.expectedRevision;
      if(p.includes('/sections/')){const key=p.split('/').pop();state.sections=state.sections.map(s=>s.chapterKey===key?{...s,...data}:s);}
      else if(p.includes('/milestones/')){const key=p.split('/').pop();state.milestones=state.milestones.map(m=>m.id===key?{...m,...data}:m);}
      state.revision++;return send({...data,revision:state.revision});
    });
    await c.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
    console.log('Navigating',run.name);
    await p.goto('http://localhost:3112/quan-ly/gioi-thieu',{waitUntil:'domcontentloaded'});
    console.log('Loaded',p.url());
    await p.getByRole('heading',{name:'Giới thiệu Toàn Trung',exact:true}).waitFor({timeout:20000});
    if(run.dark)await p.evaluate(()=>document.documentElement.classList.add('dark'));
    assert.equal(await p.getByRole('button',{name:/Xuất bản|Lưu nháp|Gỡ xuất bản/}).count(),0);
    await p.getByLabel(/^Tiêu đề/).fill('Hành trình Toàn Trung');
    await p.getByRole('button',{name:'Áp dụng thay đổi',exact:true}).click();
    await p.waitForFunction(()=>!document.querySelector('[role="status"]'));
    assert.equal(state.sections[0].title,'Hành trình Toàn Trung');
    await p.screenshot({path:path.join(out,`${run.name}.png`),fullPage:true});
    if(run.name==='admin-desktop'){
      await p.getByRole('button',{name:'Cột mốc lịch sử',exact:true}).click();
      // Select by the record's text, independently of whitespace inserted by its label.
      await p.locator('li').filter({hasText:state.milestones[0].title}).getByRole('button').first().click();
      await p.getByLabel(/^Tóm tắt/).fill('Tóm tắt đã cập nhật');
      await p.getByRole('button',{name:'Áp dụng thay đổi',exact:true}).last().click();
      await p.getByRole('button',{name:'Mở đầu',exact:true}).click();
      await p.getByLabel(/^Tiêu đề/).fill('Nội dung cần giữ khi lỗi');conflict=true;
      await p.getByRole('button',{name:'Áp dụng thay đổi',exact:true}).click();
      await p.locator('main [role="alert"]').waitFor();assert.equal(await p.getByLabel(/^Tiêu đề/).inputValue(),'Nội dung cần giữ khi lỗi');
    }
    assert.deepEqual(errors,[]);const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
    results.push({name:run.name,overflow,errors});await c.close();
  }
  await browser.close();fs.writeFileSync(path.join(out,'admin-results.json'),JSON.stringify({results,mutations},null,2));console.log(JSON.stringify({results,mutations}));
})().catch(async e=>{console.error(e.stack);await runningBrowser?.close();process.exitCode=1;});
