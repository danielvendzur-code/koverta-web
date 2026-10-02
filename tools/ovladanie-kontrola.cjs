/* Používateľské ovládanie a právne odkazy v kópii formulára.
 * Formuláre sa neodosielajú. Používa existujúci Playwright a CHROME_PATH. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=spawn('python3',['-m','http.server','8093'],{cwd:root,stdio:'ignore'});
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
    for(const width of [390,1366])for(const slug of ['','zahradne-pristresky']){
      const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
      const page=await context.newPage();const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://**/*',r=>r.abort());
      await page.goto('http://127.0.0.1:8093/'+(slug?slug+'/':''),{waitUntil:'load'});
      await page.waitForFunction(()=>document.querySelector('[data-k-dopyt-modal]'));
      await page.locator('.kh-hero a.k-btn--primary').first().click();
      await page.getByRole('dialog').waitFor({state:'visible'});
      for(const form of await page.locator('form[data-k-dopyt]').all()){
        assert.match(await form.getByRole('link',{name:'spracovaním údajov',exact:true}).getAttribute('href'),/ochrana-sukromia|zasady-ochrany-osobnych-udajov/);
        assert.match(await form.getByRole('link',{name:'podmienkami',exact:true}).getAttribute('href'),/obchodne-podmienky|vseobecne-obchodne-podmienky/);
      }
      await page.getByRole('dialog').getByRole('button',{name:'Zavrieť',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});
      if(!slug){
        const wrap=page.locator('[data-k-rail]').first();
        const track=wrap.locator('[data-k-rail-track]');
        await track.scrollIntoViewIfNeeded();
        const before=await track.evaluate(e=>e.scrollLeft);
        await wrap.locator('[data-k-rail-next]').click();
        await page.waitForFunction(x=>document.querySelector('[data-k-rail-track]').scrollLeft>x,before);
        assert.equal(await wrap.locator('[data-k-rail-prev]').isDisabled(),false);
        await wrap.locator('[data-k-rail-prev]').click();
        await page.waitForFunction(()=>document.querySelector('[data-k-rail-track]').scrollLeft<=2);
        await page.waitForFunction(()=>document.querySelector('[data-k-rail-prev]').disabled);
      }
      assert.deepEqual(errors,[]);
      console.log('OVLADANIE_OK',width,slug||'uvod');
      await context.close();
    }
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exit(1)});
