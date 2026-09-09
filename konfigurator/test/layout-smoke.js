const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
fs.mkdirSync('qa-artifacts', { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  const installAnalyticsStubs = require('./browser-qa').prepareContext;
  const dismissConsent = async (page) => {
    const reject = page.getByRole('button', { name: 'Iba nevyhnutné' });
    if (await reject.count()) {
      await reject.first().click();
      await page.waitForTimeout(150);
    }
  };
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installAnalyticsStubs(desktop);
    const page = await desktop.newPage();
    page.on('pageerror', e => errors.push('desktop pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push('desktop console: ' + msg.text()); });

    await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load', timeout: 60000 });
    await dismissConsent(page);
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

    console.log('HOME_METRICS ' + JSON.stringify(home));
    await page.screenshot({ path: 'qa-artifacts/home-desktop.png', fullPage: true });
    for (const [selector, name] of [
      ['.kh-hero', 'home-hero.png'],
      ['.kh-ponuka', 'home-offer.png'],
      ['.kh-kfg', 'home-configurator-section.png'],
      ['.kh-proc', 'home-process.png'],
      ['.kh-rev', 'home-reviews.png'],
      ['.kh-mat', 'home-material.png']
    ]) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(350);
        await locator.screenshot({ path: 'qa-artifacts/' + name });
      }
    }
    assert(home.overflow <= 4, 'Desktop homepage has horizontal overflow: ' + home.overflow);
    assert(home.heroRating && home.heroRating.width > 150 && home.heroRating.height > 25, 'Hero Google rating is not visible');
    assert(home.barPhone && home.barPhone.display !== 'none' && home.barPhone.visibility !== 'hidden' && home.barPhone.opacity > .9, 'Desktop main-nav phone is not visible');
    assert(home.topPhone && home.topPhone.display === 'none', 'Desktop duplicates the phone in topbar and main nav');
    assert(home.cards.length === 2 && home.cards.every(c => c.width >= 190), 'Brand information cards are too narrow for desktop');
    assert(Math.abs(home.cards[0].y - home.cards[1].y) < 8, 'Brand cards are not aligned in one desktop row');
    assert(home.brandMoreVisible, 'Brand explanatory text is hidden behind hover');
    assert(home.kovertaCfg && home.kovertaCfg.width > 180 && home.kovertaCfg.height > 120, 'Koverta configurator card is missing or collapsed');

    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installAnalyticsStubs(mobile);
    const mp = await mobile.newPage();
    mp.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
    mp.on('console', msg => { if (msg.type() === 'error') errors.push('mobile console: ' + msg.text()); });
    await mp.goto('http://127.0.0.1:8901/', { waitUntil: 'load', timeout: 60000 });
    await dismissConsent(mp);
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
    console.log('MOBILE_METRICS ' + JSON.stringify(mob));
    await mp.screenshot({ path: 'qa-artifacts/home-mobile.png', fullPage: true });
    assert(mob.overflow <= 4, 'Mobile homepage has horizontal overflow: ' + mob.overflow);
    assert(mob.cards.length === 2 && mob.cards[1].y > mob.cards[0].bottom, 'Brand cards do not stack on mobile');
    assert(mob.phone && mob.phone.display === 'none', 'Main-nav phone should not consume mobile header space');
    assert(mob.burger && mob.burger.display !== 'none' && mob.burger.width > 30, 'Mobile burger is missing');
    assert(mob.heroRating && mob.heroRating.display !== 'none' && mob.heroRating.width > 120, 'Mobile hero rating is missing');
    await mobile.close();

    // Product-page regression: all category heroes must keep the same layout,
    // stay within the viewport and preserve at least one clear enquiry action.
    const productCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installAnalyticsStubs(productCtx);
    const pp = await productCtx.newPage();
    pp.on('pageerror', e => errors.push('product pageerror: ' + e.message));
    pp.on('console', msg => { if (msg.type() === 'error') errors.push('product console: ' + msg.text()); });
    const productPages = [
      ['pristresky-pre-auta/', 'auto'],
      ['zahradne-pristresky/', 'garden'],
      ['carport-soltec/', 'carport'],
      ['pevne-prestresenia/', 'canopy'],
      ['bioklimaticke-pergoly/', 'bio'],
      ['tienenie/', 'shade'],
      ['outdoor-kuchyne/', 'kitchen']
    ];
    for (const [path, key] of productPages) {
      await pp.goto('http://127.0.0.1:8901/' + path, { waitUntil: 'load', timeout: 60000 });
      await dismissConsent(pp);
      await pp.waitForTimeout(450);
      const metrics = await pp.evaluate(() => {
        const hero = document.querySelector('.kh-hero');
        const h1 = hero && hero.querySelector('h1');
        const crumbs = hero && hero.querySelector('.kh-crumbs');
        const actions = hero ? [...hero.querySelectorAll('.kh-hero__actions a')] : [];
        const bg = hero && hero.querySelector('.kh-hero__bg img, .kh-hero__bg video');
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          hero: hero && hero.getBoundingClientRect().height,
          h1: h1 && h1.textContent.replace(/\\s+/g, ' ').trim(),
          crumbsBeforeH1: Boolean(crumbs && h1 && (crumbs.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING)),
          actions: actions.length,
          background: Boolean(bg),
          bodyText: document.body.innerText
        };
      });
      console.log('PRODUCT_METRICS ' + key + ' ' + JSON.stringify(metrics));
      assert(metrics.overflow <= 4, key + ' page has horizontal overflow: ' + metrics.overflow);
      assert(metrics.hero && metrics.hero > 420, key + ' hero is missing/collapsed');
      assert(metrics.h1 && metrics.h1.length > 12, key + ' hero heading is missing');
      assert(metrics.crumbsBeforeH1, key + ' breadcrumb is not placed before the hero heading');
      assert(metrics.actions >= 1, key + ' hero has no enquiry action');
      assert(metrics.background, key + ' hero media is missing');
      if (key === 'garden') {
        assert(/do 8 m/i.test(metrics.bodyText), 'Garden page does not expose the verified 8 m catalogue width');
        assert(!/Vydrží lamelová strecha sneh\?|Ako sa pergola čistí\?/i.test(metrics.bodyText),
          'Garden page still contains stale pergola/lamella FAQ wording');
      }
      if (key === 'auto' || key === 'garden') {
        await pp.locator('.kh-hero').screenshot({ path: 'qa-artifacts/product-' + key + '-hero.png' });
      }
    }
    await productCtx.close();

    const productMobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installAnalyticsStubs(productMobileCtx);
    const pmp = await productMobileCtx.newPage();
    pmp.on('pageerror', e => errors.push('product-mobile pageerror: ' + e.message));
    pmp.on('console', msg => { if (msg.type() === 'error') errors.push('product-mobile console: ' + msg.text()); });
    for (const [path, key] of [['pristresky-pre-auta/', 'auto'], ['zahradne-pristresky/', 'garden']]) {
      await pmp.goto('http://127.0.0.1:8901/' + path, { waitUntil: 'load', timeout: 60000 });
      await dismissConsent(pmp);
      await pmp.waitForTimeout(400);
      const metrics = await pmp.evaluate(() => {
        const hero = document.querySelector('.kh-hero');
        const h1 = hero && hero.querySelector('h1');
        const actions = hero ? [...hero.querySelectorAll('.kh-hero__actions a')].map(a => a.getBoundingClientRect()) : [];
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          heroHeight: hero && hero.getBoundingClientRect().height,
          h1Width: h1 && h1.getBoundingClientRect().width,
          actionWidths: actions.map(r => r.width),
          bodyWidth: document.body.getBoundingClientRect().width
        };
      });
      console.log('PRODUCT_MOBILE_METRICS ' + key + ' ' + JSON.stringify(metrics));
      assert(metrics.overflow <= 4, key + ' mobile page has horizontal overflow: ' + metrics.overflow);
      assert(metrics.heroHeight && metrics.heroHeight >= 560, key + ' mobile hero is too short/collapsed');
      assert(metrics.h1Width && metrics.h1Width <= 360, key + ' mobile hero heading overflows');
      assert(metrics.actionWidths.length >= 1 && metrics.actionWidths.every(w => w <= 360), key + ' mobile hero CTA overflows');
      await pmp.locator('.kh-hero').screenshot({ path: 'qa-artifacts/product-' + key + '-mobile-hero.png' });
    }
    await productMobileCtx.close();

    const cfgCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installAnalyticsStubs(cfgCtx);
    const cp = await cfgCtx.newPage();
    cp.on('pageerror', e => errors.push('config pageerror: ' + e.message));
    cp.on('console', msg => { if (msg.type() === 'error') errors.push('config console: ' + msg.text()); });
    await cp.goto('http://127.0.0.1:8901/konfigurator/?page=koverta', { waitUntil: 'load', timeout: 60000 });
    await dismissConsent(cp);
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
    console.log('CONFIG_METRICS ' + JSON.stringify(cfg));
    await cp.screenshot({ path: 'qa-artifacts/config-koverta.png', fullPage: true });
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
