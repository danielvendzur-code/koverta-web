const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await desktop.newPage();
    page.on('pageerror', e => errors.push('desktop pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push('desktop console: ' + msg.text()); });

    await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1000);

    const home = await page.evaluate(() => {
      const rect = sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:cs.display,visibility:cs.visibility,opacity:Number(cs.opacity) };
      };
      const cards = [...document.querySelectorAll('.kh-znacky__kus')].map(el => {
        const r = el.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
      });
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        heroRating: rect('.kh-hero__rating'),
        barPhone: rect('.kv-bar__tel'),
        topPhone: rect('.kv-topbar__side a[href^="tel:"]'),
        cards,
        brandMoreVisible: [...document.querySelectorAll('.kh-znacky__viac')].every(el => {
          const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > .9 && r.height > 20;
        }),
        kovertaCfg: rect('a[href="./konfigurator/?page=koverta"]')
      };
    });

    assert(home.overflow <= 4, 'Desktop homepage has horizontal overflow: ' + home.overflow);
    assert(home.heroRating && home.heroRating.width > 150 && home.heroRating.height > 25, 'Hero Google rating is not visible');
    assert(home.barPhone && home.barPhone.display !== 'none' && home.barPhone.visibility !== 'hidden' && home.barPhone.opacity > .9, 'Desktop main-nav phone is not visible');
    assert(home.topPhone && home.topPhone.display === 'none', 'Desktop duplicates the phone in topbar and main nav');
    assert(home.cards.length === 2 && home.cards.every(c => c.width > 250), 'Brand information cards are not laid out as two useful desktop cards');
    assert(Math.abs(home.cards[0].y - home.cards[1].y) < 8, 'Brand cards are not aligned in one desktop row');
    assert(home.brandMoreVisible, 'Brand explanatory text is hidden behind hover');
    assert(home.kovertaCfg && home.kovertaCfg.width > 180 && home.kovertaCfg.height > 120, 'Koverta configurator card is missing or collapsed');

    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await mobile.newPage();
    mp.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
    mp.on('console', msg => { if (msg.type() === 'error') errors.push('mobile console: ' + msg.text()); });
    await mp.goto('http://127.0.0.1:8901/', { waitUntil: 'load', timeout: 60000 });
    await mp.waitForTimeout(800);
    const mob = await mp.evaluate(() => {
      const cards = [...document.querySelectorAll('.kh-znacky__kus')].map(el => {
        const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};
      });
      const css = sel => { const el=document.querySelector(sel); if(!el) return null; const s=getComputedStyle(el); const r=el.getBoundingClientRect(); return {display:s.display,visibility:s.visibility,width:r.width,height:r.height}; };
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cards,
        phone: css('.kv-bar__tel'),
        burger: css('.kv-burger'),
        heroRating: css('.kh-hero__rating')
      };
    });
    assert(mob.overflow <= 4, 'Mobile homepage has horizontal overflow: ' + mob.overflow);
    assert(mob.cards.length === 2 && mob.cards[1].y > mob.cards[0].bottom, 'Brand cards do not stack on mobile');
    assert(mob.phone && mob.phone.display === 'none', 'Main-nav phone should not consume mobile header space');
    assert(mob.burger && mob.burger.display !== 'none' && mob.burger.width > 30, 'Mobile burger is missing');
    assert(mob.heroRating && mob.heroRating.display !== 'none' && mob.heroRating.width > 120, 'Mobile hero rating is missing');
    await mobile.close();

    const cfgCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const cp = await cfgCtx.newPage();
    cp.on('pageerror', e => errors.push('config pageerror: ' + e.message));
    cp.on('console', msg => { if (msg.type() === 'error') errors.push('config console: ' + msg.text()); });
    await cp.goto('http://127.0.0.1:8901/konfigurator/?page=koverta', { waitUntil: 'load', timeout: 60000 });
    await cp.waitForTimeout(2200);
    const cfg = await cp.evaluate(() => {
      const stage=document.querySelector('[data-sp-canvas]');
      const r=stage && stage.getBoundingClientRect();
      const tab=document.querySelector('[data-kv-tab="koverta"]');
      const custom=document.querySelector('[data-kv-custom]');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tabCurrent: tab && tab.getAttribute('aria-current'),
        stage: r && {width:r.width,height:r.height},
        customText: custom && custom.textContent.trim(),
        spTest: Boolean(window.SP_TEST && window.SP_TEST.setView && window.SP_TEST.redraw),
        title: document.title,
        bodyText: document.body.innerText
      };
    });
    assert(cfg.overflow <= 4, 'Configurator has horizontal overflow: ' + cfg.overflow);
    assert(cfg.tabCurrent === 'page', 'Koverta product tab is not current');
    assert(cfg.stage && cfg.stage.width > 500 && cfg.stage.height > 300, '3D stage is missing/collapsed');
    assert(cfg.customText && cfg.customText.length > 5, 'Custom-size enquiry entry point is missing');
    assert(cfg.spTest, 'Koverta geometry test hooks are not available');
    assert(/Prístrešky Koverta/.test(cfg.title), 'Document title does not reflect Koverta configurator');
    assert(/Prístrešok Koverta|prístrešok Koverta/i.test(cfg.bodyText), 'Koverta configurator content is not rendered');
    await cfgCtx.close();

    assert(errors.length === 0, 'Browser errors:\n' + errors.join('\n'));
    console.log('Layout smoke test passed.');
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err.stack || err); process.exit(1); });
