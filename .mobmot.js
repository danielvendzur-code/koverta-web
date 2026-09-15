'use strict';
const { chromium, devices } = require('playwright');
const RATE = Number(process.env.THROTTLE || 4);
const PAGE = process.env.PAGE || 'bio';
const pct=(v,p)=>{const s=v.slice().sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(s.length*p)-1))];};
(async () => {
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ ...devices['Pixel 5'], hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:8901/konfigurator/?page=${PAGE}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.SP_TEST && window.SP_TEST.snapshot, null, { timeout: 40000 });
  await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page);
  if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const stage = page.locator('#SoltecPremium .sp-stage').first();
  await stage.scrollIntoViewIfNeeded();
  const box = await stage.boundingBox();
  await page.evaluate(() => {
    window.__f=[]; window.__r=[]; window.__a=true; let prev=performance.now();
    const cv=document.querySelector('#SoltecPremium [data-sp-depth-canvas]');
    const t=(now)=>{ if(!window.__a) return; window.__f.push(now-prev);
      window.__r.push(cv?cv.dataset.spRender||(cv.width+'x'+cv.height):''); prev=now; requestAnimationFrame(t); };
    requestAnimationFrame(t);
  });
  // skutočný prst, nie myš: na dotykovom zariadení sa myšou model neotáča
  const az0 = await page.evaluate(()=>window.SP_TEST.snapshot().view.az);
  const y = box.y + box.height * 0.22;
  const touch = (type, x, yy) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }] });
  await touch('touchStart', box.x + box.width*0.2, y);
  for (let i=0;i<40;i++){
    await touch('touchMove', box.x + box.width*(0.2+0.6*i/39), y + Math.sin(i/6)*10);
    await page.waitForTimeout(10);
  }
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(250);
  const az1 = await page.evaluate(()=>window.SP_TEST.snapshot().view.az);
  console.log('  azimut', az0.toFixed(3), '->', az1.toFixed(3), Math.abs(az1-az0)>0.05?'(otočilo sa)':'(NEOTOČILO SA)');
  const r = await page.evaluate(()=>{ window.__a=false; return {f:window.__f,r:window.__r}; });
  const f = r.f.filter(v=>v>0&&v<2000);
  const counts={}; r.r.forEach(x=>counts[x]=(counts[x]||0)+1);
  console.log(`throttle ${RATE}  n=${f.length}  p95=${pct(f,0.95).toFixed(1)}ms  median=${pct(f,0.5).toFixed(1)}ms  max=${Math.max(...f).toFixed(1)}ms  over100=${f.filter(v=>v>100).length}`);
  console.log('  render sizes:', JSON.stringify(counts));
  console.log('  dpr:', await page.evaluate(()=>devicePixelRatio), 'css stage:', Math.round(box.width)+'x'+Math.round(box.height));
  await br.close();
})();
