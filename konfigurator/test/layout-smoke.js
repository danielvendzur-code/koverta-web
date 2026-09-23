const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
fs.mkdirSync('qa-artifacts', { recursive: true });

async function revealPage(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  const installAnalyticsStubs = require('./browser-qa').prepareContext;

  /* Dve zlyhania nehovoria nič o stránke a test by na nich padal náhodne.
     `ERR_ABORTED` znamená, že prehliadač požiadavku zrušil, lebo sme medzitým
     odišli na ďalšiu stránku — pri prechode piatich stránok za sebou je to
     bežné. `ERR_TUNNEL_CONNECTION_FAILED` je brána prostredia, v ktorom test
     beží, nie chyba webu. Všetko ostatné musí test zhodiť. */
  const SUM = /ERR_ABORTED|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED/;
  const zaznam = (zoznam, predpona) => (page) => {
    page.on('pageerror', (e) => zoznam.push(predpona + ' pageerror: ' + e.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      if (SUM.test(t) || t === 'Failed to load resource: net::ERR_ABORTED') return;
      zoznam.push(predpona + ' console: ' + t);
    });
    page.on('requestfailed', (r) => {
      const d = r.failure() ? r.failure().errorText : 'unknown';
      if (SUM.test(d)) return;
      zoznam.push(predpona + ' request: ' + d + ' ' + r.url());
    });
  };
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
    zaznam(errors, 'desktop')(page);

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
      ['.kh-mat', 'home-material.png'],
      ['.kh-znacky', 'home-brands.png'],
      ['.kh-work', 'home-references-map.png'],
      ['.kh-faq', 'home-faq.png'],
      ['.kh-cta', 'home-form.png'],
      ['footer', 'home-footer.png']
    ]) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1200);
        await locator.screenshot({ path: 'qa-artifacts/' + name });
      }
    }
    await revealPage(page);
    await page.screenshot({ path: 'qa-artifacts/home-desktop.png', fullPage: true });
    assert(home.overflow <= 4, 'Desktop homepage has horizontal overflow: ' + home.overflow);
    assert(home.heroRating && home.heroRating.width > 150 && home.heroRating.height > 25, 'Hero Google rating is not visible');
    assert(home.barPhone && home.barPhone.display !== 'none' && home.barPhone.visibility !== 'hidden' && home.barPhone.opacity > .9, 'Desktop main-nav phone is not visible');
    assert(home.topPhone && home.topPhone.display === 'none', 'Desktop duplicates the phone in topbar and main nav');
    assert(home.cards.length === 2 && home.cards.every(c => c.width >= 190), 'Brand information cards are too narrow for desktop');
    assert(Math.abs(home.cards[0].y - home.cards[1].y) < 8, 'Brand cards are not aligned in one desktop row');
    assert(home.brandMoreVisible, 'Brand explanatory text is hidden behind hover');
    assert(home.kovertaCfg && home.kovertaCfg.width > 180 && home.kovertaCfg.height > 120, 'Koverta configurator card is missing or collapsed');

    /* Test nesmie poslať skutočný dopyt. Každý beh inak odoslal obchodu
       e-mail a potvrdenie na qa@example.invalid a vyčerpal denný limit
       Resendu. Ostrý server sa preto na sieti zablokuje (a stránka na
       localhoste aj tak neodosiela — len zapíše window.__kvDopytSkusobny). */
    let odoslane = 0;
    await desktop.route(/koverta-formular\.vercel\.app|koverta\.sk\/(contact|cart|search)/, async route => { odoslane++; await route.abort(); });
    const form = page.locator('form[data-k-dopyt]').first();
    await form.locator('[type="submit"]').click();
    assert(!(await page.evaluate(() => (window.__kvDopytSkusobny || []).length)), 'Empty contact form bypassed validation');
    await form.locator('[name="contact[name]"]').fill('Koverta audit test');
    await form.locator('[name="contact[phone]"]').fill('+421900000000');
    await form.locator('[name="contact[email]"]').fill('qa@example.invalid');
    await form.locator('[name="contact[body]"]').fill('Client-side QA; nothing is delivered.');
    /* Povinné sú len meno a telefón; súhlas je odoslaním (text pod
       tlačidlom), žiadne zaškrtávanie. */
    const telo = await page.evaluate(() => new Promise((ok) => {
      const f = document.querySelector('form[data-k-dopyt]');
      /* časová poistka formulára (startedAt) žiada aspoň 1,2 s od otvorenia */
      setTimeout(() => { f.querySelector('[type="submit"]').click();
        const t = Date.now(); (function cakaj() { const z = window.__kvDopytSkusobny || [];
          if (z.length || Date.now() - t > 4000) ok(z[0] || null); else setTimeout(cakaj, 50); })(); }, 1300);
    }));
    assert(odoslane === 0, 'Contact form sent an enquiry to the live server from a test');
    assert(telo, 'Contact form did not submit with name and phone');
    for (const [k, v] of [['meno', 'Koverta audit test'], ['email', 'qa@example.invalid'], ['telefon', '+421900000000']]) {
      assert(telo[k] === v, 'Enquiry lost a field: ' + k);
    }
    await page.waitForURL(/dakujeme\/\?contact_posted=true/, { timeout: 5000 });
    console.log('FORM_PASS validation, name+phone required, all fields, thank-you page, nothing sent to a server');

    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installAnalyticsStubs(mobile);
    const mp = await mobile.newPage();
    zaznam(errors, 'mobile')(mp);
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
        heroRating: (() => {
          const el = document.querySelector('.kh-hero__rating');
          if (!el) return null;
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          const score = el.querySelector('strong');
          const stars = [...el.querySelectorAll('.k-stars svg')]
            .map(v => v.getBoundingClientRect().width);
          return {
            display: s.display, visibility: s.visibility, width: r.width, height: r.height,
            score: score ? score.textContent.trim() : null,
            scoreWidth: score ? score.getBoundingClientRect().width : 0,
            stars
          };
        })()
      };
    });
    console.log('MOBILE_METRICS ' + JSON.stringify(mob));
    await revealPage(mp);
    await mp.screenshot({ path: 'qa-artifacts/home-mobile.png', fullPage: true });
    assert(mob.overflow <= 4, 'Mobile homepage has horizontal overflow: ' + mob.overflow);
    assert(mob.cards.length === 2 && mob.cards[1].y > mob.cards[0].bottom, 'Brand cards do not stack on mobile');
    assert(mob.phone && mob.phone.display === 'none', 'Main-nav phone should not consume mobile header space');
    assert(mob.burger && mob.burger.display !== 'none' && mob.burger.width > 30, 'Mobile burger is missing');
    /* Na mobile je hodnotenie zámerne holý riadok — značka Google, číslo a päť
       hviezd, bez rámu a bez popisky. Meria sa preto, či je naozaj vidieť to,
       čo návštevníka presviedča, nie či riadok presiahne nejakú šírku. */
    assert(mob.heroRating && mob.heroRating.display !== 'none' && mob.heroRating.visibility === 'visible',
      'Mobile hero rating is missing');
    assert(mob.heroRating.height >= 28 && mob.heroRating.width >= 100,
      'Mobile hero rating collapsed: ' + mob.heroRating.width + '×' + mob.heroRating.height);
    assert(/^5[.,]0$/.test(mob.heroRating.score || '') && mob.heroRating.scoreWidth > 10,
      'Mobile hero rating does not show the score: ' + mob.heroRating.score);
    assert(mob.heroRating.stars.length === 5 && mob.heroRating.stars.every(w => w >= 10),
      'Mobile hero rating does not show five stars: ' + JSON.stringify(mob.heroRating.stars));
    await mobile.close();

    // Product-page regression: all category heroes must keep the same layout,
    // stay within the viewport and preserve at least one clear enquiry action.
    const productCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installAnalyticsStubs(productCtx);
    const pp = await productCtx.newPage();
    zaznam(errors, 'product')(pp);
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
      await revealPage(pp);
      await pp.screenshot({ path: 'qa-artifacts/product-' + key + '-desktop.png', fullPage: true });
    }
    const dimensionPages = [
      ['pristresky-pre-auta/rozmer/2500x5200/', 'auto-size'],
      ['zahradne-pristresky/rozmer/8000x4000/', 'garden-size']
    ];
    for (const [path, key] of dimensionPages) {
      await pp.goto('http://127.0.0.1:8901/' + path, { waitUntil: 'load', timeout: 60000 });
      await dismissConsent(pp);
      const metrics = await pp.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        heading: document.querySelector('h1')?.textContent.trim(),
        hasBasePrice: /Základná cena s DPH/.test(document.body.innerText),
        productSchemas: [...document.querySelectorAll('script[type="application/ld+json"]')]
          .filter(node => /"@type"\s*:\s*"Product"/.test(node.textContent)).length
      }));
      assert(metrics.overflow <= 4, key + ' page has horizontal overflow: ' + metrics.overflow);
      assert(metrics.heading, key + ' page heading is missing');
      assert(metrics.hasBasePrice, key + ' page does not label its price as a base price');
      assert(metrics.productSchemas === 1, key + ' page must expose exactly one Product schema');
      await revealPage(pp);
      await pp.screenshot({ path: 'qa-artifacts/product-' + key + '-desktop.png', fullPage: true });
    }
    await productCtx.close();

    const productMobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installAnalyticsStubs(productMobileCtx);
    const pmp = await productMobileCtx.newPage();
    zaznam(errors, 'product-mobile')(pmp);
    for (const [path, key] of productPages.slice(0, 5)) {
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
      await revealPage(pmp);
      await pmp.screenshot({ path: 'qa-artifacts/product-' + key + '-mobile.png', fullPage: true });
    }
    for (const [path, key] of dimensionPages) {
      await pmp.goto('http://127.0.0.1:8901/' + path, { waitUntil: 'load', timeout: 60000 });
      await dismissConsent(pmp);
      const overflow = await pmp.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      assert(overflow <= 4, key + ' mobile page has horizontal overflow: ' + overflow);
      await revealPage(pmp);
      await pmp.screenshot({ path: 'qa-artifacts/product-' + key + '-mobile.png', fullPage: true });
    }
    await productMobileCtx.close();

    const cfgCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await installAnalyticsStubs(cfgCtx);
    const cp = await cfgCtx.newPage();
    zaznam(errors, 'config')(cp);
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

    await require('./routing-smoke')(browser);
    assert(errors.length === 0, 'Browser errors:\n' + errors.join('\n'));
    console.log('Layout smoke test passed.');
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err.stack || err); process.exit(1); });
