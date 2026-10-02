const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const out=process.env.KOVER_QA_OUT||'vysledky';
const pages=['/','/collections/pristresky-pre-auta','/collections/zahradne-pristresky','/collections/bioklimaticke-pergoly','/pages/galeria-pristresky-pre-auta','/pages/kontakt'];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [360,390,430,1366])for(const path of pages){
   const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width<760,hasTouch:width<760});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://koverta.sk'+path,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>document.querySelector('form[data-k-dopyt]')?.dataset.kJednoduchy==='true');
   await page.evaluate(()=>document.fonts.ready);
   const data=await page.evaluate(async()=>{
    const f=document.querySelector('.k form[data-k-dopyt]');
    const a=f.querySelector('[name="contact[email]"]').getBoundingClientRect(),b=f.querySelector('[name="contact[Miesto realizácie]"]').getBoundingClientRect();
    const img=document.querySelector('.kh-hero__bg img');
    return {polia:Math.abs(a.top-b.top),img:img?{src:img.currentSrc,rect:img.getBoundingClientRect().toJSON(),height:getComputedStyle(img).height}:null,
     css:[...document.querySelectorAll('link[rel="stylesheet"][href*="koverta-2026"]')].map(x=>({media:x.media,url:x.href})),critical:!!document.querySelector('style[data-k-kriticky]'),video:[...document.querySelectorAll('video')].map(v=>({paused:v.paused,time:v.currentTime,poster:v.poster}))};
   });
   assert(data.polia<1,'Polia sa rozchádzajú '+data.polia);
   assert(!data.critical,'Stará téma');assert(data.css.every(x=>!x.media),'Neaktívny štýl');
   await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   if(width<760)await page.waitForFunction(()=>{const d=document.querySelector('.kh-dock');return d.dataset.kReady==='true'&&getComputedStyle(d).transform==='none'&&!d.classList.contains('je-hero-skryty')});
   const dock=await page.evaluate(async()=>{
    const d=document.querySelector('.kh-dock');const bs=[];
    for(let i=0;i<30;i++){window.scrollBy({top:i%2?20:-5,behavior:'instant'});await new Promise(requestAnimationFrame);bs.push(d.getBoundingClientRect().bottom);}
    const r=d.getBoundingClientRect();return {posun:Math.max(...bs)-Math.min(...bs),bottom:r.bottom,height:r.height,padding:parseFloat(getComputedStyle(document.body).paddingBottom),overflow:document.documentElement.scrollWidth>innerWidth,viewport:innerHeight};
   });
   assert(!dock.overflow,'Horizontálny presah');if(width<760){assert(dock.posun<1,'Lišta skáče');assert(Math.abs(dock.bottom-dock.viewport)<1,'Lišta mimo spodku');assert(dock.padding>=dock.height,'Pätička zakrytá');}
   const faq=page.locator('[data-k-faq] details');
   if(await faq.count()>1){
    await faq.first().scrollIntoViewIfNeeded();await page.evaluate(()=>document.querySelector('[data-k-faq] summary').click());
    await page.waitForFunction(()=>![...document.querySelectorAll('[data-k-faq] details')].some(d=>d.__kBeh));
    const jump=await page.evaluate(async()=>{
     const ds=[...document.querySelectorAll('[data-k-faq] details')];ds[1].querySelector('summary').click();const hs=[];
     do{await new Promise(requestAnimationFrame);hs.push(ds[0].getBoundingClientRect().height)}while(ds.some(d=>d.__kBeh));return Math.abs(hs.at(-1)-hs.at(-2));
    });assert(jump<2,'FAQ skáče '+jump);
   }
   if(width===390&&path.includes('zahradne')){await page.locator('.kh-cta__card').first().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/formular-zivy-mobil.png'});}
   assert.deepEqual(errors,[],'JS chyby');console.log('LIVE_UI_OK '+JSON.stringify({width,path,...data,dock}));await ctx.close();
  }
  for(const path of ['/','/collections/zahradne-pristresky'])for(let beh=1;beh<=3;beh++)for(const variant of ['povodne','styl-hned','styl-inline']){
   const ctx=await browser.newContext({viewport:{width:412,height:823},isMobile:true,deviceScaleFactor:1.75});
   const page=await ctx.newPage();const cdp=await ctx.newCDPSession(page);
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});
   await page.addInitScript(()=>{
    window.kM={lcp:[],paint:[],long:[],cls:[]};
    new PerformanceObserver(l=>{for(const e of l.getEntries())window.kM.lcp.push({time:e.startTime,tag:e.element?.tagName,src:e.url})}).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(l=>{for(const e of l.getEntries())window.kM.paint.push({name:e.name,time:e.startTime})}).observe({type:'paint',buffered:true});
    new PerformanceObserver(l=>{for(const e of l.getEntries())window.kM.long.push({time:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true});
    new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.kM.cls.push(e.value)}).observe({type:'layout-shift',buffered:true});
   });
   const url='https://koverta.sk'+path;
   await page.route(url,async route=>{
    const response=await route.fetch();let body=await response.text();
    const match=body.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]*koverta-2026-(?:uvod|zahradne-pristresky)\.css[^"]*)"[^>]*>/);
    if(!match)throw Error('Chýba štýl');
    if(variant!=='povodne'){
     body=body.replace(match[0],'');
     let early=match[0];
     if(variant==='styl-inline'){
      const cssUrl=new URL(match[1],url).href;const res=await page.request.get(cssUrl);let css=await res.text();
      css=css.replace(/url\(([^)]+)\)/g,(m,v)=>{const raw=v.trim().replace(/^['"]|['"]$/g,'');return /^data:|^#/.test(raw)?m:'url("'+new URL(raw,cssUrl).href+'")'});
      early='<style data-k-experiment="inline-full">'+css+'</style>';
     }
     body=body.replace('<meta charset="utf-8">','<meta charset="utf-8">'+early);
    }
    await route.fulfill({response,body});
   });
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(6000);
   const result=await page.evaluate(()=>({...window.kM,video:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,paused:v.paused})),resources:performance.getEntriesByType('resource').filter(r=>/koverta-2026|woff|consentik|style.min|grob-mobil/.test(r.name)).map(r=>({name:r.name,start:r.startTime,end:r.responseEnd,duration:r.duration,transfer:r.transferSize})),dom:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}));
   console.log('LIVE_PERF '+JSON.stringify({path,variant,beh,lcp:result.lcp,paint:result.paint,long:result.long.reduce((s,t)=>s+Math.max(0,t.duration-50),0),cls:result.cls.reduce((s,v)=>s+v,0),video:result.video,errors}));
   fs.writeFileSync(out+'/'+(path==='/'?'uvod':'zahrada')+'-'+variant+'-'+beh+'.json',JSON.stringify(result,null,2));await ctx.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
