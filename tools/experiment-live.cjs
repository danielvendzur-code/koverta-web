const {chromium} = require('playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH||'/tmp/koverta-chromium',args:['--no-sandbox']});
  try {
    for(const url of ['https://koverta.sk/','https://koverta.sk/collections/zahradne-pristresky']) for(let beh=1;beh<=3;beh++) for(const variant of ['povodne','css-vopred','css-plny']) {
      const context = await browser.newContext({viewport:{width:412,height:823},isMobile:true,deviceScaleFactor:1.75});
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});
      await page.addInitScript(() => {
        window.kMerenie={lcp:[],paint:[],dlhe:[],cls:[]};
        new PerformanceObserver(l=>{for(const e of l.getEntries())window.kMerenie.lcp.push({cas:e.startTime,tag:e.element?.tagName,src:e.url});}).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(l=>{for(const e of l.getEntries())window.kMerenie.paint.push({name:e.name,cas:e.startTime});}).observe({type:'paint',buffered:true});
        new PerformanceObserver(l=>{for(const e of l.getEntries())window.kMerenie.dlhe.push({cas:e.startTime,dlzka:e.duration});}).observe({type:'longtask',buffered:true});
        new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.kMerenie.cls.push(e.value)}).observe({type:'layout-shift',buffered:true});
      });
      await page.route('**/koverta-2026.js?*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()});
      });
      await page.route(url,async route=>{
        const response=await route.fetch();let body=await response.text();
        const css=body.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]*koverta-2026-(?:uvod|zahradne-pristresky)\.css[^"]*)"[^>]*>/);
        if(!css)throw Error('Stylesheet missing');
        if(variant!=='povodne')body=body.replace('<meta charset="utf-8">','<meta charset="utf-8"><link rel="preload" as="style" href="'+css[1]+'">');
        if(variant==='css-plny'){
          body=body.replace(/<style data-k-kriticky="[^"]+">[\s\S]*?<\/style>/g,'');
          body=body.replace(css[0],css[0].replace(/\smedia="print"|\sonload="[^"]*"/g,''));
        }
        await route.fulfill({response,body});
      });
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(6000);
      const result=await page.evaluate(()=>({...window.kMerenie,video:[...document.querySelectorAll('video')].map(v=>({cas:v.currentTime,paused:v.paused,poster:v.poster,src:v.currentSrc})),fonts:document.fonts.status}));
      fs.writeFileSync(`${process.env.KOVER_QA_OUT||'/workspace/scratch/a70afad1c840/qa'}/experiment-${url.includes('collections')?'zahrada':'uvod'}-${variant}-${beh}.json`,JSON.stringify({url,variant,beh,result,errors},null,2));
      console.log(JSON.stringify({url,variant,beh,lcp:result.lcp,paint:result.paint,dlhe:result.dlhe.reduce((s,t)=>s+Math.max(0,t.dlzka-50),0),cls:result.cls.reduce((s,x)=>s+x,0),video:result.video,errors}));
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
