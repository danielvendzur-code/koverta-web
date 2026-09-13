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
        /* Lišta súhlasu sa pridáva až v `requestAnimationFrame`, takže hneď po
           `load` ešte nemusí byť v DOM — a keď sa objaví neskôr, sadne na spodok
           okna a prekryje ovládanie na kresbe. Preto sa na ňu počká, klikne a počká
           sa, kým naozaj zmizne. */
        const consent = page.getByRole('button',{name:'Iba nevyhnutné',exact:true});
        await consent.waitFor({state:'visible',timeout:10000}).catch(()=>{});
        if(await consent.count() && await consent.isVisible()) await consent.click();
        await page.locator('.kv-suhlas').waitFor({state:'detached',timeout:10000}).catch(()=>{});
        const stage = page.locator('[data-sp-canvas]').first();
        await stage.scrollIntoViewIfNeeded();
        await page.locator('[data-sp-cfg]').first().dispatchEvent('pointerdown',{pointerId:1,pointerType:'mouse'});
        await page.waitForFunction(()=>document.querySelector('[data-sp-canvas]')?.dataset.renderer==='webgl-depth');
        const layer = await page.evaluate(() => {
          const svg = document.querySelector('[data-sp-canvas]');
          const surface = document.querySelector('[data-sp-depth-canvas]');
          const sr = svg && svg.getBoundingClientRect();
          const cr = surface && surface.getBoundingClientRect();
          return {
            exists: Boolean(surface), outsideSvg: Boolean(surface && !svg.contains(surface)),
            sameStage: Boolean(surface && surface.parentElement === svg.parentElement),
            foreignObjects: svg.querySelectorAll('foreignObject').length,
            hidden: Boolean(surface && surface.hidden),
            pointerEvents: surface && getComputedStyle(surface).pointerEvents,
            delta: sr && cr ? {
              left: Math.abs(sr.left - cr.left), top: Math.abs(sr.top - cr.top),
              width: Math.abs(sr.width - cr.width), height: Math.abs(sr.height - cr.height)
            } : null
          };
        });
        assert(layer.exists && layer.outsideSvg && layer.sameStage, 'WebGL canvas must be a sibling layer above the SVG');
        assert.equal(layer.foreignObjects, 0, 'The render path must not use SVG foreignObject');
        assert.equal(layer.hidden, false, 'The WebGL layer must be visible');
        assert.equal(layer.pointerEvents, 'none', 'The SVG must remain the interaction surface');
        assert(layer.delta && Object.values(layer.delta).every(value => value <= 1), 'WebGL and SVG layers must be aligned: '+JSON.stringify(layer.delta));
        const models = await page.locator('[data-sp-model]').evaluateAll(nodes=>nodes.map(n=>n.dataset.spModel));
        for (const key of (models.length ? models : [null])) {
          /* Kľúč modelu môže obsahovať lomku („170/28"), a tá by v názve
             súboru založila neexistujúci priečinok. */
          const slug = String(key || 'K').replace(/[^a-z0-9]+/gi, '-');
          if (key) {
            await page.locator('[data-sp-model="'+key+'"]').click({force:true});
            await page.waitForFunction(key=>window.SP_TEST.snapshot().model===key,key);
          }
          if (kind === 'carport' && /^SL/i.test(String(key))) {
            assert(Number(await stage.getAttribute('data-panel-seam-count')) > 0, 'SL roof must show its ISO panel joints');
          }
          // Zoom is opt-in; detail controls appear only after enabling it.
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
          assert((await page.evaluate(()=>SP_TEST.snapshot().zoom))<=3.5,'Manual zoom must stay inside its limit');
          await toggle.click();
          await page.waitForFunction(()=>SP_TEST.snapshot().zoom===1);
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
            await page.locator('.sp-stage').first().screenshot({path:`qa-artifacts/depth/${kind}-${slug}-${mobile?'mobile':'desktop'}-${name}.png`});
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
              await page.locator('.sp-stage').first().screenshot({path:`qa-artifacts/depth/bio-${key}-${mobile?'mobile':'desktop'}-louver-${value}.png`});
            }
          }
          if(kind==='bio') {
            await page.waitForTimeout(220);
            /* Bublina s nápovedou sa po prejdení myšou rozsvecuje 0,25 s a leží
               nad plátnom. Pri pevných 220 ms padol prvý záber doprostred toho
               prechodu a druhý až po ňom — porovnávala sa nápoveda, nie model.
               Čaká sa, kým sa jej krytie ustáli. */
            await page.waitForFunction(()=>{
              const h=document.querySelector('.sp-stage__hint');
              if(!h)return true;
              const o=getComputedStyle(h).opacity,same=h.dataset.qaOpacity===o;
              h.dataset.qaOpacity=o;return same;
            },null,{polling:120,timeout:6000});
            /* Lamely sa po poslednom nastavení ešte dobiehajú do cieľovej
               polohy. Kým dobiehajú, líšia sa dva zábery o samotný model — a
               to je práve to, čo sa tu overovať nemá. */
            await page.waitForFunction(()=>{
              const t=window.SP_TEST.snapshot().louverT, same=window.__qaLouver===t;
              window.__qaLouver=t; return same;
            },null,{polling:140,timeout:10000});
            await page.evaluate(()=>{SP_TEST.setView(.82,-.18);SP_TEST.redrawStage();});
            /* Rozlíšenie zastaveného snímku sa prispôsobuje výkonu stroja a po
               prvých kresbách ešte stúpa. Keď sa zmení medzi dvoma zábermi,
               líšia sa v každom pixeli — a netvrdí to nič o modeli. Kreslí sa
               teda dovtedy, kým veľkosť vyrovnávacej pamäte neprestane rásť. */
            for (let settle = 0, last = ''; settle < 12; settle++) {
              const size = await page.evaluate(() => {
                SP_TEST.redrawStage();
                const c = document.querySelector('[data-sp-depth-canvas]');
                return c ? c.width + 'x' + c.height : 'none';
              });
              if (size === last) break;
              last = size;
            }
            /* Číta sa priamo kresliaca pamäť, nie záber stránky. Záber prvku
               vracia výrez stránky, takže doň spadne aj to, čo nad plátnom
               leží: pravý dolný roh mal pruh 116 × 2 pixelov, ktorý sa medzi
               dvoma zábermi menil o viac než 25 hodnôt — dvakrát po sebe,
               presne ten istý pruh, na dvoch rôznych modeloch. Nebol to model.
               Vykreslenie aj čítanie preto bežia v jednej úlohe prehliadača,
               kým je kresliaca pamäť ešte platná, a porovnáva sa naozaj len to,
               čo renderer nakreslil. */
            const grab = (moves) => page.evaluate((moves) => {
              for (const [az, el] of moves) { SP_TEST.setView(az, el); SP_TEST.redrawStage(); }
              const c = document.querySelector('[data-sp-depth-canvas]');
              const gl = c.getContext('webgl');
              const px = new Uint8Array(c.width * c.height * 4);
              gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
              /* Prázdna kresliaca pamäť by prešla ako „rovnaké pixely" — a
                 nemerala by nič. Počíta sa preto, koľko pixelov je vôbec
                 nakreslených. */
              let painted = 0;
              for (let i = 3; i < px.length; i += 4) if (px[i]) painted++;
              const base = window.__qaFrame;
              if (!base) { window.__qaFrame = { w: c.width, h: c.height, px }; return { stored: [c.width, c.height], painted }; }
              window.__qaFrame = null;
              if (base.w !== c.width || base.h !== c.height)
                return { sizeChanged: [base.w, base.h, c.width, c.height] };
              let n = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
              for (let i = 0; i < px.length; i += 4) {
                let d = 0;
                for (let k = 0; k < 4; k++) { const dk = Math.abs(px[i + k] - base.px[i + k]); if (dk > d) d = dk; }
                if (d) {
                  n++; if (d > max) max = d;
                  const q = i >> 2, x = q % c.width, y = (q / c.width) | 0;
                  if (x < x0) x0 = x; if (x > x1) x1 = x;
                  if (y < y0) y0 = y; if (y > y1) y1 = y;
                }
              }
              return { differing: n, max, painted, total: px.length / 4, box: n ? [x0, y0, x1, y1] : null };
            }, moves);
            await page.evaluate(()=>{window.__qaFrame=null;});
            const baseFrame = await grab([[.82,-.18]]);
            const orbit = await grab([[2.1,.7],[.82,-.18]]);
            assert(baseFrame.painted > orbit.total * 0.05 && orbit.painted > orbit.total * 0.05,
              'The drawing buffer came back all but empty, so the comparison would prove nothing: '
              + JSON.stringify({base: baseFrame, after: orbit}));
            assert(!orbit.sizeChanged,
              'Render resolution changed during the orbit comparison: '+JSON.stringify(orbit.sizeChanged));
            if (orbit.differing) {
              console.log('ORBIT MISMATCH', kind, key, mobile?'mobile':'desktop', JSON.stringify(orbit));
              await page.locator('[data-sp-depth-canvas]').first()
                .screenshot({path:`qa-artifacts/depth/ORBIT-${kind}-${slug}-${mobile?'mobile':'desktop'}.png`});
            }
            assert.equal(orbit.differing, 0,
              'Closed lamellas and lighting must return to identical pixels after orbit: '+JSON.stringify(orbit));
          }
          if(kind==='carport') {
            const box=page.locator('[data-sp-add-on="box"]');
            if(await box.count() && await box.isEnabled()){
              await box.evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
              await page.waitForTimeout(220);
              await page.locator('.sp-stage').first().screenshot({path:`qa-artifacts/depth/box-${key}-${mobile?'mobile':'desktop'}.png`});
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
            await page.locator('.sp-stage').first().screenshot({path:`qa-artifacts/depth/timber-${mobile?'mobile':'desktop'}-${value}.png`});
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
