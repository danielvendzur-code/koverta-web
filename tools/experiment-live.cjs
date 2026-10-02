const fs=require('node:fs');const {spawn}=require('node:child_process');const {chromium}=require('playwright');
(async()=>{
 const out=process.env.KOVER_QA_OUT||'vysledky';
 for(const [slug,url] of [['uvod','https://koverta.sk/'],['zahrada','https://koverta.sk/collections/zahradne-pristresky']]){
  await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['node_modules/lighthouse/cli/index.js',url,'--only-categories=performance','--output=json','--output-path='+out+'/'+slug+'.json','--save-assets','--quiet','--chrome-flags=--headless --no-sandbox'],{stdio:'inherit',env:process.env});p.on('exit',code=>code===0?resolve():reject(Error('Lighthouse '+code)));p.on('error',reject)});
  const r=JSON.parse(fs.readFileSync(out+'/'+slug+'.json','utf8')),a=r.audits;
  const pick={};for(const key of ['metrics','lcp-breakdown-insight','render-blocking-insight','largest-contentful-paint-element','lcp-discovery-insight'])if(a[key])pick[key]={score:a[key].score,displayValue:a[key].displayValue,details:a[key].details};
  const network=a['network-requests']?.details?.items.filter(x=>/koverta-2026|woff|grob-mobil|hero.*poster|hero.*mp4|style.min.css/.test(x.url))||[];
  console.log('LH_MATCH '+JSON.stringify({slug,score:r.categories.performance.score*100,version:r.lighthouseVersion,ua:r.environment.hostUserAgent,warnings:r.runWarnings,settings:r.configSettings.throttling,metrics:['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'].map(k=>({name:k,value:a[k].numericValue})),pick,network}));
 }
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});console.log('CHROME_MATCH '+browser.version());
 try{
  for(const url of ['https://koverta.sk/','https://koverta.sk/collections/zahradne-pristresky']){
   const ctx=await browser.newContext({viewport:{width:412,height:823},isMobile:true,deviceScaleFactor:1.75});const page=await ctx.newPage();
   await page.addInitScript(()=>{window.kM=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.kM.push({time:e.startTime,url:e.url,tag:e.element?.tagName})}).observe({type:'largest-contentful-paint',buffered:true})});
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(6000);
   console.log('CHROME_DOM '+JSON.stringify(await page.evaluate(()=>({url:location.href,lcp:window.kM,css:[...document.querySelectorAll('link[rel="stylesheet"][href*="koverta-2026"]')].map(l=>({position:[...document.head.children].indexOf(l),url:l.href})),video:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,paused:v.paused,poster:v.poster})),images:performance.getEntriesByType('resource').filter(r=>/grob-mobil|hero.*poster/.test(r.name)).map(r=>({url:r.name,start:r.startTime,end:r.responseEnd,transfer:r.transferSize}))}))));
   await ctx.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
