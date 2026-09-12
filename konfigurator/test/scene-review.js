const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const {prepareContext}=require('./browser-qa');
(async()=>{
  fs.mkdirSync('qa-artifacts/scene-review',{recursive:true});
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const report=[];
  try{for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:mobile?2:1});
    await prepareContext(context);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const family of ['koverta','carport','bio','canopy']) {
      await page.goto('http://127.0.0.1:8901/konfigurator/?page='+family,{waitUntil:'load'});
      const consent=page.getByRole('button',{name:'Iba nevyhnutné',exact:true});if(await consent.isVisible())await consent.click();
      const stage=page.locator('[data-sp-canvas]').first();await stage.scrollIntoViewIfNeeded();
      await page.locator('[data-sp-cfg]').first().dispatchEvent('pointerdown',{pointerId:1,pointerType:'mouse'});
      await page.waitForFunction(()=>window.SP_TEST?.scene&&document.querySelector('[data-sp-canvas]').dataset.renderer==='webgl-depth');
      await page.evaluate(({garden})=>{
        for(const [sel,value] of [['[data-sp-w]',garden?4500:6000],['[data-sp-l]',6000]]){
          const e=document.querySelector(sel);if(!e)continue;
          e.value=String(Math.min(Number(e.max)||value,Math.max(Number(e.min)||0,value)));
          e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
        }
        document.querySelector('.sp-scene').open=true;
      },{garden:family==='bio'||family==='canopy'});
      const car=family==='koverta'||family==='carport';
      await page.locator('[data-scene-mode="'+(car?'car':'bistro')+'"]').click();
      await page.waitForFunction(()=>{const s=SP_TEST.scene();return s.count>0&&s.items.every(i=>s.loaded.includes(i.key));},{},{timeout:30000});
      const originalPrice=await page.evaluate(()=>SP_TEST.snapshot().price);
      if(car&&await page.locator('#sp-scene-count option[value="2"]').isEnabled())await page.locator('#sp-scene-count').selectOption('2');
      await page.evaluate(()=>{SP_TEST.setView(.82,.08);SP_TEST.redrawStage();});
      await page.waitForTimeout(220);
      await stage.screenshot({path:`qa-artifacts/scene-review/${family}-${mobile?'mobile':'desktop'}-front.png`});
      if(!car){await page.evaluate(()=>{SP_TEST.setView(.82,.65);SP_TEST.redrawStage();});await stage.screenshot({path:`qa-artifacts/scene-review/${family}-${mobile?'mobile':'desktop'}-seating.png`});}
      const zoom=page.locator('[data-sp-zoom-toggle]');await zoom.click();
      await page.locator('[data-zoom-step="in"]').click();await page.locator('[data-zoom-step="in"]').click();
      await page.waitForFunction(()=>SP_TEST.snapshot().zoom>1.3);await page.waitForTimeout(300);
      await stage.screenshot({path:`qa-artifacts/scene-review/${family}-${mobile?'mobile':'desktop'}-detail.png`});
      await page.locator('[data-zoom-step="reset"]').click();await page.waitForFunction(()=>SP_TEST.snapshot().zoom===1);
      await zoom.click();
      await page.getByRole('button',{name:'Dážď',exact:true}).click();
      await page.getByLabel('Sila dažďa').selectOption('heavy');
      await page.waitForTimeout(800);
      await page.getByRole('button',{name:'Pozastaviť dážď',exact:true}).click();
      await page.getByLabel('Ukázať odtok vody').check();
      await page.waitForTimeout(250);
      await stage.screenshot({path:`qa-artifacts/scene-review/${family}-${mobile?'mobile':'desktop'}-rain.png`});
      await page.screenshot({path:`qa-artifacts/scene-review/${family}-${mobile?'mobile':'desktop'}-ui.png`});
      const result=await page.evaluate(()=>({scene:SP_TEST.scene(),price:SP_TEST.snapshot().price,overflow:document.documentElement.scrollWidth>innerWidth+1}));
      assert(!result.overflow,'page overflow');assert(result.scene.collisionTriangles>0,'rain must use actual surface mesh');assert.deepEqual(result.price,originalPrice,'display settings changed price');
      assert(!errors.length,errors.join('\n'));report.push({family,mobile,...result.scene});
    }await context.close();
  }}finally{fs.writeFileSync('qa-artifacts/scene-review/report.json',JSON.stringify(report,null,2));await browser.close();}
  console.log('Scene review PASS: every family, shared depth, zoom, scenery, precipitation, mobile layout, unchanged price.');
})().catch(e=>{console.error(e);process.exit(1);});
