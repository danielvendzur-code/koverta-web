const {chromium} = require('playwright');
const fs = require('node:fs');
const app = 'https://cdn.shopify.com/extensions/01a0ee83-5f2f-7cf3-81e7-4eff32b918da/ez-terms-and-conditions-checkbox-177/assets/style.min.css';
const variants = ['povodne','poster','poster-app-vopred'];
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH||'/tmp/koverta-chromium',args:['--no-sandbox']});
  try {
    for (const variant of variants) for(let beh=1;beh<=3;beh++) {
      const context = await browser.newContext({viewport:{width:412,height:823},isMobile:true,deviceScaleFactor:1.75});
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});
      await page.addInitScript(() => {
        window.kMerenie={lcp:[],paint:[],dlhe:[]};
        new PerformanceObserver(l=>{for(const e of l.getEntries())window.kMerenie.lcp.push({cas:e.startTime,tag:e.element?.tagName,src:e.url});}).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(l=>{for(const e of l.getEntries())window.kMerenie.paint.push({name:e.name,cas:e.startTime});}).observe({type:'paint',buffered:true});
        new PerformanceObserver(l=>{for(const e of l.getEntries())window.kMerenie.dlhe.push({cas:e.startTime,dlzka:e.duration});}).observe({type:'longtask',buffered:true});
      });
      if (variant.includes('poster')) await page.route('**/koverta-2026.js?*', async route=>{const response=await route.fetch();let js=await response.text();js=js.replace("e.removeAttribute('poster'),e.style.opacity=!e.paused&&e.readyState>=2?'1':'0'","e.style.opacity='1'");await route.fulfill({response,body:js});});
      if (variant !== 'povodne') await page.route('https://koverta.sk/', async route => {
        const response = await route.fetch();
        let html = await response.text();
        if (variant.includes('poster')) {html=html.replace("v.style.opacity='0'","v.style.opacity='1'");html=html.replace("if(!u)return;v.muted=true;","if(!u)return;var pic=v.previousElementSibling;var src=m?pic.querySelector('source'):pic.querySelector('img');var parts=(src.getAttribute('srcset')||'').split(',').map(function(x){var p=x.trim().split(/\\s+/);return{u:p[0],w:parseFloat(p[1])}}).filter(function(p){return p.u&&p.w}).sort(function(a,b){return a.w-b.w});var chosen=parts.find(function(p){return p.w>=innerWidth*(devicePixelRatio||1)})||parts[parts.length-1];v.poster=chosen?chosen.u:pic.querySelector('img').src;v.muted=true;");}
        if (variant.includes('app-vopred')) html = html.replace('<meta charset="utf-8">',`<meta charset="utf-8"><link rel="preconnect" href="https://cdn.shopify.com"><link rel="preload" as="style" href="${app}">`);
        if (variant === 'app-asynchronne') html = html.replace(new RegExp('(<link[^>]*ez-terms-and-conditions[^>]* )media="all"'),'$1media="print" onload="this.media=\'all\'"');
        await route.fulfill({response,body:html});
      });
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('https://koverta.sk/',{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(6000);
      const result=await page.evaluate(()=>({...window.kMerenie,video:[...document.querySelectorAll('video')].map(v=>({cas:v.currentTime,paused:v.paused,ready:v.readyState,src:v.currentSrc})),fonts:document.fonts.status}));
      fs.writeFileSync(`${process.env.KOVER_QA_OUT||'/workspace/scratch/a70afad1c840/qa'}/experiment-${variant}-${beh}.json`,JSON.stringify({variant,beh,result,errors},null,2));
      console.log(JSON.stringify({variant,beh,lcp:result.lcp,paint:result.paint,dlhe:result.dlhe.reduce((s,t)=>s+Math.max(0,t.dlzka-50),0),video:result.video,errors}));
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
