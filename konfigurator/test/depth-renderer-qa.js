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
        const consent = page.getByRole('button',{name:'Iba nevyhnutné',exact:true});
        if(await consent.isVisible()) await consent.click();
        const stage = page.locator('[data-sp-canvas]').first();
        await stage.scrollIntoViewIfNeeded();
        await page.locator('[data-sp-cfg]').first().dispatchEvent('pointerdown',{pointerId:1,pointerType:'mouse'});
        await page.waitForFunction(()=>document.querySelector('[data-sp-canvas]')?.dataset.renderer==='webgl-depth');
        const models = await page.locator('[data-sp-model]').evaluateAll(nodes=>nodes.map(n=>n.dataset.spModel));
        for (const key of (models.length ? models : [null])) {
          if (key) {
            await page.locator('[data-sp-model="'+key+'"]').click({force:true});
            await page.waitForFunction(key=>window.SP_TEST.snapshot().model===key,key);
          }
          // Zoom is an opt-in extra: one toggle, no percentage or +/- buttons.
          // While it is off the wheel must leave the page scrolling alone.
          const zoomBox=await page.locator('.sp-zoom').boundingBox(),stageBox=await page.locator('.sp-stage').boundingBox();
          assert(zoomBox.y>=stageBox.y && zoomBox.y+zoomBox.height<=stageBox.y+stageBox.height,'Zoom control escaped model stage');
          const toggle=page.locator('[data-sp-zoom-toggle]');
          assert.equal(await toggle.getAttribute('aria-pressed'),'false','Zoom must start switched off');
          await page.locator('[data-sp-canvas]').hover();
          await page.mouse.wheel(0,-240);
          assert.equal(await page.evaluate(()=>SP_TEST.snapshot().zoom),1,'Wheel must not zoom while the toggle is off');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-pressed'),'true');
          // Clicking the toggle parks the pointer on the button, which is a
          // sibling of the canvas, so put it back over the model first.
          await page.locator('[data-sp-canvas]').hover();
          await page.mouse.wheel(0,-240);
          await page.waitForTimeout(60);
          assert((await page.evaluate(()=>SP_TEST.snapshot().zoom))>1,'Manual zoom must work in every family once enabled');
          assert((await page.evaluate(()=>SP_TEST.snapshot().zoom))<=3,'Manual zoom must stay inside its limit');
          await toggle.click();
          assert.equal(await page.evaluate(()=>SP_TEST.snapshot().zoom),1,'Switching zoom off returns the whole model');
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
            const led=page.locator('[data-sp-add-on="led"]');
            if(await led.count()) {
              await led.evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
            }
            const range=page.locator('[data-sp-louver-range]').first();
            for(const value of [100,50,10,1,0]) {
              await range.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
              await page.waitForTimeout(60);
              await stage.screenshot({path:`qa-artifacts/depth/bio-${key}-${mobile?'mobile':'desktop'}-louver-${value}.png`});
            }
          }
          if(kind==='bio') {
            await page.waitForTimeout(220);
            await page.evaluate(()=>{SP_TEST.setView(.82,-.18);SP_TEST.redrawStage();});
            const before=await stage.screenshot();
            await page.evaluate(()=>{SP_TEST.setView(2.1,.7);SP_TEST.redrawStage();SP_TEST.setView(.82,-.18);SP_TEST.redrawStage();});
            const after=await stage.screenshot();
            assert(before.equals(after),'Closed lamellas and lighting must return to identical pixels after orbit');
          }
          if(kind==='carport') {
            const box=page.locator('[data-sp-add-on="box"]');
            if(await box.count() && await box.isEnabled()){
              await box.evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
              await page.waitForTimeout(220);
              await stage.screenshot({path:`qa-artifacts/depth/box-${key}-${mobile?'mobile':'desktop'}.png`});
              await box.evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
            }
          }
          times.sort((a,b)=>a-b);
          report.push({kind,key,mobile,medianMs:times[24],p95Ms:times[45],faces:await stage.getAttribute('data-face-count')});
        }
        await page.screenshot({path:`qa-artifacts/depth/ui-${kind}-${mobile?'mobile':'desktop'}.png`});
        if(kind==='bio') {
          const sideStep=await page.locator('[data-sp-side="rear"]').evaluate(el=>el.closest('[data-sp-stepno]').dataset.spStepno);
          await page.locator('[data-sp-goto="'+sideStep+'"]').click();
          await page.locator('[data-sp-side="rear"]').click();
          await page.locator('[data-sp-side-opt="h50l"]').click({force:true});
          const slider=page.locator('[data-sp-side-range]').first();
          for(const value of [0,25,50,75,100]) {
            await slider.evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
            await page.waitForTimeout(80);
            await page.evaluate(()=>{window.SP_TEST.setView(.82,.28);window.SP_TEST.redrawStage();});
            assert.equal(await stage.getAttribute('data-invalid-face-count'),'0','Invalid moving timber geometry');
            await stage.screenshot({path:`qa-artifacts/depth/timber-${mobile?'mobile':'desktop'}-${value}.png`});
          }
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
