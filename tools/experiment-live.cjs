const {chromium}=require('playwright');const fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
console.log('CHROME '+browser.version());
try{
 for(const path of ['/','/collections/zahradne-pristresky']){
 const ctx=await browser.newContext({viewport:{width:412,height:823},isMobile:true,deviceScaleFactor:1.75});
 const page=await ctx.newPage();const cdp=await ctx.newCDPSession(page);
 await page.addInitScript(()=>{
 window.kM={lcp:[],paint:[],long:[]};
 new PerformanceObserver(l=>{for(const e of l.getEntries())window.kM.lcp.push({time:e.startTime,tag:e.element?.tagName,url:e.url})}).observe({type:'largest-contentful-paint',buffered:true});
 new PerformanceObserver(l=>{for(const e of l.getEntries())window.kM.paint.push({name:e.name,time:e.startTime})}).observe({type:'paint',buffered:true});
 new PerformanceObserver(l=>{for(const e of l.getEntries())window.kM.long.push({time:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true});
 });
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,loading,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
 await page.goto('https://koverta.sk'+path,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(8000);
 const result=await page.evaluate(()=>({...window.kM,resources:performance.getEntriesByType('resource').map(r=>({url:r.name,start:r.startTime,end:r.responseEnd,transfer:r.transferSize})),video:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,poster:v.poster,paused:v.paused})),css:[...document.querySelectorAll('link[rel="stylesheet"][href*="koverta-2026"]')].map(l=>({url:l.href,early:[...document.head.children].indexOf(l)}))}));
 const profile=(await cdp.send('Profiler.stop')).profile;
 const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const event=await complete;let trace='';
 while(true){const chunk=await cdp.send('IO.read',{handle:event.stream});trace+=chunk.data;if(chunk.eof)break}await cdp.send('IO.close',{handle:event.stream});
 const parsed=JSON.parse(trace);
 const tasks=parsed.traceEvents.filter(e=>e.ph==='X'&&e.dur>40000).sort((a,b)=>b.dur-a.dur).slice(0,30).map(e=>({name:e.name,ms:e.dur/1000,args:e.args}));
 const byid=new Map(profile.nodes.map(n=>[n.id,n]));const weights=new Map();
 profile.samples.forEach((id,i)=>weights.set(id,(weights.get(id)||0)+(profile.timeDeltas[i]||0)));
 const top=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id,d])=>({ms:d/1000,function:byid.get(id).callFrame.functionName,url:byid.get(id).callFrame.url,line:byid.get(id).callFrame.lineNumber}));
 const name=path==='/'?'uvod':'zahrada';const out=process.env.KOVER_QA_OUT||'vysledky';
 fs.writeFileSync(out+'/'+name+'-trace.json',trace);fs.writeFileSync(out+'/'+name+'-profile.json',JSON.stringify(profile));fs.writeFileSync(out+'/'+name+'-timing.json',JSON.stringify(result));
 console.log('TRACE '+JSON.stringify({path,result,tasks,top}));await ctx.close();
 }
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
