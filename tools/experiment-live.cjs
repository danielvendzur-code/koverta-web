const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const out=process.env.KOVER_QA_OUT||'vysledky';
const pages=['/','/collections/pristresky-pre-auta','/collections/zahradne-pristresky','/collections/bioklimaticke-pergoly','/pages/galeria-pristresky-pre-auta','/pages/kontakt'];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const path of ['/','/collections/zahradne-pristresky'])for(let beh=1;beh<=3;beh++)for(const variant of ['povodne','dekodovanie-sync','bez-blur']){
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
    if(variant==='dekodovanie-sync'){
     body=body.replace(/<img\b[^>]*fetchpriority="high"[^>]*>/g,t=>t.replace('decoding="async"','decoding="sync"'));
    }
    if(variant==='bez-blur'){
     body=body.replace('</head>','<style>@media(max-width:759px){.kh-hero::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}}</style></head>');
    }

    await route.fulfill({response,body});
   });
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(6000);
   const result=await page.evaluate(()=>({...window.kM,video:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,paused:v.paused})),resources:performance.getEntriesByType('resource').filter(r=>/koverta-2026|woff|consentik|style.min|grob-mobil/.test(r.name)).map(r=>({name:r.name,start:r.startTime,end:r.responseEnd,duration:r.duration,transfer:r.transferSize})),dom:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,blur:document.querySelector('.kh-hero')?getComputedStyle(document.querySelector('.kh-hero'),'::after').backdropFilter:null}));
   console.log('LIVE_PERF '+JSON.stringify({path,variant,beh,lcp:result.lcp,paint:result.paint,long:result.long.reduce((s,t)=>s+Math.max(0,t.duration-50),0),cls:result.cls.reduce((s,v)=>s+v,0),video:result.video,resources:result.resources,longTasks:result.long,errors}));
   fs.writeFileSync(out+'/'+(path==='/'?'uvod':'zahrada')+'-'+variant+'-'+beh+'.json',JSON.stringify(result,null,2));await ctx.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
