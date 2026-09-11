'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { prepareContext } = require('./browser-qa');
(async () => {
  fs.mkdirSync('qa-artifacts/depth', {recursive:true});
  const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const report = [];
  try {
    for (const mobile of [false,true]) {
      const context = await browser.newContext({ viewport:mobile ? {width:390,height:844} : {width:1440,height:1000}, deviceScaleFactor:mobile?2:1 });
      await prepareContext(context);
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      for (const kind of ['koverta','carport','canopy','bio']) {
        await page.goto('http://127.0.0.1:8901/konfigurator/?page='+kind,{waitUntil:'load'});
        const stage = page.locator('[data-sp-canvas]').first();
        await stage.scrollIntoViewIfNeeded();
        await page.locator('[data-sp-cfg]').first().dispatchEvent('pointerdown',{pointerId:1,pointerType:'mouse'});
        await page.waitForFunction(()=>document.querySelector('[data-sp-canvas]')?.dataset.renderer==='webgl-depth');
        const models = await page.locator('[data-sp-model]').evaluateAll(nodes=>nodes.map(n=>n.dataset.spModel));
        for (const key of (models.length ? models : [null])) {
          if (key) await page.locator('[data-sp-model="'+key+'"]').click({force:true});
          const times=[];
          for (let i=0;i<48;i++) {
            times.push(await page.evaluate(i=>{
              const t=performance.now();
              window.SP_TEST.setView(i*Math.PI*2/48,-0.18+1.3*(i%12)/11);
              window.SP_TEST.redrawStage();
              const el=document.querySelector('[data-sp-canvas]');
              if(el.dataset.renderer!=='webgl-depth'||+el.dataset.faceCount<20) throw new Error('Missing model');
              return performance.now()-t;
            },i));
          }
          for (const [name,el] of [['front',0.28],['top',1.12],['under',-0.18]]) {
            await page.evaluate(el=>{window.SP_TEST.setView(0.82,el); window.SP_TEST.redrawStage();},el);
            await stage.screenshot({path:`qa-artifacts/depth/${kind}-${key||'K'}-${mobile?'mobile':'desktop'}-${name}.png`});
          }
          if(kind==='bio') {
            const range=page.locator('[data-sp-louver-range]').first();
            for(const value of [100,50,10,1,0]) {
              await range.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
              await page.waitForTimeout(60);
              await stage.screenshot({path:`qa-artifacts/depth/bio-${key}-${mobile?'mobile':'desktop'}-louver-${value}.png`});
            }
          }
          times.sort((a,b)=>a-b);
          report.push({kind,key,mobile,medianMs:times[24],p95Ms:times[45],faces:await stage.getAttribute('data-face-count')});
        }
        assert.deepEqual(errors,[],'Runtime exceptions');
      }
      await context.close();
    }
  } finally {
    fs.writeFileSync('qa-artifacts/depth/report.json',JSON.stringify(report,null,2));
    await browser.close();
  }
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
