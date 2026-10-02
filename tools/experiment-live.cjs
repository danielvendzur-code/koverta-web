const {chromium} = require('playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH||'/tmp/koverta-chromium',args:['--no-sandbox']});
  try {
    for(let beh=1;beh<=3;beh++) for(const variant of ['povodne','galeria']) {
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
      if(variant==='galeria') await page.route('**/koverta-2026.js?*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:fs.readFileSync('tools/galeria-kandidat.js','utf8')});
      });
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('https://koverta.sk/',{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(6000);
      const result=await page.evaluate(()=>({...window.kMerenie,video:[...document.querySelectorAll('video')].map(v=>({cas:v.currentTime,paused:v.paused,poster:v.poster,src:v.currentSrc})),fonts:document.fonts.status}));
      fs.writeFileSync(`${process.env.KOVER_QA_OUT||'/workspace/scratch/a70afad1c840/qa'}/experiment-${variant}-${beh}.json`,JSON.stringify({variant,beh,result,errors},null,2));
      console.log(JSON.stringify({variant,beh,lcp:result.lcp,paint:result.paint,dlhe:result.dlhe.reduce((s,t)=>s+Math.max(0,t.dlzka-50),0),cls:result.cls.reduce((s,x)=>s+x,0),video:result.video,errors}));
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
