/* Počasie a odtok vody.

   Dážď nesmie byť len efekt nad scénou: cez panelovú strechu ani cez
   zatvorené lamely neprejde ani kvapka, otvorenými lamelami prejsť musí.
   Meria sa pohľadom spod podhľadu — v tom kuželi je vidieť práve priestor
   pod strechou — porovnaním rovnakého záberu s dažďom a bez neho.

   Počíta sa len to, čo padne dovnútra premietnutého obrysu strechy stiahnutého
   k jeho stredu. Bez tejto masky sa dážď za prístreškom premietal do tej istej
   časti obrázka a nedal sa odlíšiť od presakovania — pri otvorených lamelách
   takých bodov býva niekoľko a test ich vypisuje zvlášť.

   Odtok sa drží skutočnej geometrie z `lastKvAccessoryGeometry`: hladina
   leží v priereze žľabu, kaluž pod ústím zvodu a nikde inde. Vnútro zvodu
   a stĺpa ostáva bez vody, lebo cez plný profil nemá čo presvitať. */
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const assert = require('node:assert/strict');
const { prepareContext, watchErrors } = require('./browser-qa');

const BASE = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const pageUrl = (name) => (/page=[a-z]+/.test(BASE) ? BASE.replace(/page=[a-z]+/, 'page=' + name) : BASE + '?page=' + name);

const HELPERS = () => {
  /* Záber sa číta priamo z hĺbkového rendereru v tom istom snímku, v akom sa
     kreslil — inak by bol back buffer už vymenený a prázdny. */
  window.__shot = (slot) => new Promise((done) => {
    requestAnimationFrame(() => {
      const s = window.SP_TEST.snapshot();
      const svg = document.querySelector('[data-sp-canvas]');
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      [0.4, 0.6].forEach((fx) => [0.4, 0.6].forEach((fy) => {
        const q = window.SP_TEST.project(s.length * fx, s.width * fy, s.height * 0.55);
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
      }));
      /* Obrys strechy premietnutý do obrazovky a stiahnutý k stredu. Počíta sa
         len to, čo padne dovnútra neho: dážď mimo prístrešku sa pri pohľade
         zdola premieta do rovnakej časti obrázka a bez tejto masky by sa
         nedalo rozlíšiť od skutočného presakovania. */
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]]
        .map(([u, v]) => window.SP_TEST.project(s.length * u, s.width * v, s.height));
      const cx = corners.reduce((a, q) => a + q.x, 0) / 4;
      const cy = corners.reduce((a, q) => a + q.y, 0) / 4;
      window.SP_TEST.redrawStage();
      const canvas = svg.querySelector('canvas');
      if (!canvas) { window['__slot' + slot] = null; done(null); return; }
      const gl = canvas.getContext('webgl');
      const w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const sx = w / vb[2], sy = h / vb[3];
      window['__slot' + slot] = { w, h, px,
        roof: corners.map((q) => [(cx + (q.x - cx) * 0.8) * sx, h - (cy + (q.y - cy) * 0.8) * sy]),
        region: [
        Math.max(0, Math.round(x0 * sx)), Math.max(0, Math.round(h - y1 * sy)),
        Math.min(w, Math.round(x1 * sx)), Math.min(h, Math.round(h - y0 * sy))] };
      done({ w, h });
    });
  });
  window.__diff = () => {
    const a = window.__slotA, b = window.__slotB;
    if (!a || !b) return { error: 'chýba záber' };
    if (a.w !== b.w || a.h !== b.h) return { error: 'rôzna veľkosť plátna', a: [a.w, a.h], b: [b.w, b.h] };
    const inside = (px, py) => {
      let hit = false;
      for (let i = 0, j = a.roof.length - 1; i < a.roof.length; j = i++) {
        const [xi, yi] = a.roof[i], [xj, yj] = a.roof[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    const [x0, y0, x1, y1] = a.region;
    let n = 0, outside = 0, t = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * a.w + x) * 4; t++;
      const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i+1] - b.px[i+1])
        + Math.abs(a.px[i+2] - b.px[i+2]) + Math.abs(a.px[i+3] - b.px[i+3]);
      if (d <= 18) continue;
      if (inside(x, y)) n++; else outside++;
    }
    return { n, outside, t };
  };
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await prepareContext(context);
  const bad = [];

  const openPage = async (name) => {
    const page = await context.newPage();
    const assertNoErrors = watchErrors(page);
    await page.goto(pageUrl(name), { waitUntil: 'load', timeout: 60000 });
    const consent = page.getByRole('button', { name: 'Iba nevyhnutné' });
    if (await consent.count()) await consent.first().click();
    await page.waitForTimeout(2400);
    await page.evaluate(HELPERS);
    /* Karta ovládania stojí na kresbe pootvorená a rozbalí sa až pod myšou.
       Test si ju rozbalí natrvalo, inak by na jej tlačidlá nedosiahol. */
    await page.evaluate(() => { const c = document.querySelector('.sp-scene'); c.open = true; c.classList.remove('is-peek'); });
    return { page, assertNoErrors };
  };
  const weather = async (page, on) => {
    await page.getByRole('button', { name: on ? 'Dážď' : 'Zamračené', exact: true }).click();
    await page.waitForTimeout(600);
  };
  const pause = async (page) => {
    const button = page.getByRole('button', { name: 'Pozastaviť', exact: true });
    if (await button.count()) await button.click();
    await page.waitForTimeout(500);
  };
  const resume = async (page) => {
    const button = page.getByRole('button', { name: 'Spustiť', exact: true });
    if (await button.count()) await button.click();
    await page.waitForTimeout(300);
  };
  /* Rovnaký záber s dažďom a bez neho. Dážď sa pozastaví, takže obe snímky
     idú v plnom rozlíšení a líšia sa výhradne vodou. Meria sa niekoľko fáz
     dažďa a berie sa najsilnejšia: v jednom zamrznutom snímku môže cez medzeru
     práve nič nepadať a z takej náhody nemá test robiť chybu. */
  const waterUnderRoof = async (page, samples = 5) => {
    await weather(page, false);
    await page.evaluate(() => window.__shot('A'));
    await weather(page, true);
    let most = 0;
    for (let i = 0; i < samples; i++) {
      await pause(page);
      await page.evaluate(() => window.__shot('B'));
      const out = await page.evaluate(() => window.__diff());
      assert(!out.error, 'meranie dažďa zlyhalo: ' + JSON.stringify(out));
      most = Math.max(most, out.n);
      if (process.env.KV_RAIN_DEBUG) console.log('  vzorka', i, 'pod strechou', out.n, 'mimo obrysu', out.outside, 'z', out.t);
      if (i < samples - 1) { await resume(page); await page.waitForTimeout(280); }
    }
    await weather(page, false);
    return most;
  };

  // ---- bioklimatická pergola: lamely rozhodujú, či dážď prejde -------------
  {
    const { page, assertNoErrors } = await openPage('bio');
    const hidden = await page.evaluate(() => {
      const row = document.querySelector('[data-scene-weatherrow]');
      return !row || row.hidden || Boolean(document.querySelector('[data-scene-weather-pending]'));
    });
    assert(!hidden, 'ovládanie počasia musí byť dostupné, nie odložené');
    await page.evaluate(() => { window.SP_TEST.setView(-0.6, -1.05); window.SP_TEST.redrawStage(); });
    await page.waitForTimeout(400);
    const setLouver = async (v) => {
      await page.evaluate((value) => {
        const range = document.querySelector('[data-sp-louver-range]');
        range.value = String(value);
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }, v);
      await page.waitForTimeout(700);
    };

    await setLouver(100);
    const open = await waterUnderRoof(page);
    await setLouver(0);
    const shut = await waterUnderRoof(page);
    /* Koľko kvapiek prejde medzerou, závisí od fázy, v ktorej sa dážď zastaví:
       nameralo sa 16 až 130 bodov. Prah je pod tým rozpätím, ale ďaleko nad
       nulou, ktorú dáva zatvorená aj panelová strecha — rozhoduje rozdiel medzi
       otvorenou a zatvorenou strechou, nie presné číslo. */
    if (!(open >= 15)) bad.push(`otvorenými lamelami musí pršať pod strechu, nameraných ${open} bodov pod obrysom strechy`);
    if (!(shut <= 4 && shut * 6 <= open)) bad.push(`zatvorené lamely musia dážď zadržať, nameraných ${shut} bodov pod obrysom strechy proti ${open} pri otvorených`);

    // Voda po lamelách tečie, až keď sa zatvárajú; otvorená lamela ju neudrží.
    await weather(page, true);
    await resume(page);
    await page.getByLabel('Odtok vody').check();
    await page.waitForTimeout(500);
    await setLouver(0);
    const shutFlow = await page.evaluate(() => window.SP_TEST.scene());
    await setLouver(100);
    const openFlow = await page.evaluate(() => window.SP_TEST.scene());
    if (!(shutFlow.flowParts.filter((q) => q.kind === 0).length > 0)) bad.push('zatvorené lamely majú odvádzať vodu žliabkom');
    if (openFlow.flowParts.length) bad.push('otvorená lamela vodu neudrží, nemá po nej tiecť');

    // Animácia beží a pauza ju naozaj zastaví.
    await setLouver(84);
    await page.waitForTimeout(400);
    const running = await page.evaluate(() => window.SP_TEST.scene());
    await page.waitForTimeout(700);
    const later = await page.evaluate(() => window.SP_TEST.scene());
    if (!running.animating || !running.animates) bad.push('dážď sa nerozbehol: ' + JSON.stringify({ a: running.animating, b: running.animates }));
    if (!(later.clock > running.clock)) bad.push(`hodiny dažďa stoja: ${running.clock} → ${later.clock}`);
    await pause(page);
    const paused = await page.evaluate(() => window.SP_TEST.scene());
    if (paused.animating) bad.push('pauza dažďa nezastavila animáciu');
    assertNoErrors();
    await page.close();
  }

  // ---- Koverta: panel zadrží všetko, voda ide po skutočnom odtoku ---------
  {
    const { page, assertNoErrors } = await openPage('koverta');
    await page.evaluate(() => { window.SP_TEST.setView(-0.6, -1.05); window.SP_TEST.redrawStage(); });
    await page.waitForTimeout(400);
    const panel = await waterUnderRoof(page);
    if (!(panel <= 4)) bad.push(`pod panelovú strechu nesmie pršať, nameraných ${panel} bodov pod obrysom strechy`);

    await weather(page, true);
    await resume(page);
    await page.getByLabel('Odtok vody').check();
    await page.waitForTimeout(600);
    const scene = await page.evaluate(() => window.SP_TEST.scene());
    const acc = await page.evaluate(() => window.SP_TEST.snapshot().geometry.accessories);
    const gutter = acc && acc.gutter, pipe = acc && acc.downpipe;
    assert(gutter && gutter.enabled, 'Koverta má mať žľab v geometrii');
    assert(pipe && pipe.enabled, 'Koverta má mať zvod v geometrii');
    const parts = scene.flowParts;
    const film = parts.filter((q) => q.kind === 0);
    const run = parts.filter((q) => q.kind === 1);
    const pool = parts.filter((q) => q.kind === 3);
    if (film.length < 5) bad.push('po panelovej streche má tiecť voda k odkvapu');
    /* Film leží na krytine, nie na vrchu lemovania. `roof.z` je horná hrana
       lemovacieho plechu — o 35 mm vyššie než trapéz, po ktorom voda naozaj
       tečie — takže porovnávať film s ňou znamenalo žiadať, aby voda tiekla po
       lemovaní. Meria sa proti skutočnej výške krytiny a s tolerantnosťou len
       na vlnu trapézu. */
    const deck = scene.roof.surfaceZ;
    assert(typeof deck === 'number', 'scéna musí povedať, kde leží krytina');
    for (const q of film) {
      if (q.box[5] < deck - 40) bad.push(`film s vodou je pod krytinou: ${JSON.stringify(q.box)} proti ${deck}`);
      if (q.box[2] > scene.roof.z + 30) bad.push(`film s vodou sa vznáša nad strechou: ${JSON.stringify(q.box)}`);
      if (q.box[3] > gutter.x0 + 1) bad.push('voda po streche má končiť pri žľabe, nie za ním');
    }
    if (run.length < 1) bad.push('v žľabe má byť hladina');
    for (const q of run) {
      if (q.box[0] < gutter.x0 - 1 || q.box[3] > gutter.x1 + 1) bad.push(`hladina prečnieva žľab: ${JSON.stringify(q.box)}`);
      if (q.box[2] < gutter.zBottom || q.box[5] > gutter.zTop) bad.push(`hladina nie je vo výške žľabu: ${JSON.stringify(q.box)}`);
    }
    if (pool.length !== 1) bad.push(`pod ústím zvodu má byť práve jedna kaluž, je ${pool.length}`);
    for (const q of pool) {
      if (Math.abs((q.box[0] + q.box[3]) / 2 - pipe.pipeCenter[0]) > 3
        || Math.abs((q.box[1] + q.box[4]) / 2 - pipe.pipeCenter[1]) > 3) bad.push('kaluž nesedí na ústie zvodu');
      if (q.box[5] > 12) bad.push('kaluž má ležať na dlažbe');
    }
    /* Skryté trasy: nad pätkou stĺpa ani v priereze zvodu sa voda nekreslí. */
    for (const q of parts) {
      /* Nad pätkou aj v priereze zvodu sa sleduje len pásmo medzi dlažbou a
         žľabom — po streche voda tečie ponad stĺp a to je v poriadku. */
      const overPost = q.box[0] < pipe.post.x1 && q.box[3] > pipe.post.x0
        && q.box[1] < pipe.post.y1 && q.box[4] > pipe.post.y0
        && q.box[5] > 12 && q.box[2] < gutter.zBottom;
      if (overPost) bad.push(`voda cez stĺp: ${JSON.stringify(q.box)}`);
      const inPipe = q.box[0] < pipe.pipeCenter[0] + pipe.radius && q.box[3] > pipe.pipeCenter[0] - pipe.radius
        && q.box[1] < pipe.pipeCenter[1] + pipe.radius && q.box[4] > pipe.pipeCenter[1] - pipe.radius
        && q.box[5] > 12 && q.box[2] < gutter.zBottom;
      if (inPipe) bad.push(`voda vnútri zvodu: ${JSON.stringify(q.box)}`);
    }
    /* Trasu vody má ukázať voda, nie odsek textu vedľa kresby. Slovná schéma
       odtoku bola odstránená na žiadosť vlastníka a nemá sa vrátiť: kontroly
       vyššie už merajú, že voda naozaj tečie žľabom a zvodom a nie po lemovaní
       ani vnútrom profilu. */
    const prose = await page.evaluate(() => ({
      guide: Boolean(document.querySelector('.sp-drain-guide')),
      note: Boolean(document.querySelector('.sp-scene__note')),
      hidden: /Popis skrytej trasy|Cez odkvapovú hranu/i.test(document.body.textContent)
    }));
    if (prose.guide) bad.push('slovná schéma odtoku sa vrátila do panela');
    if (prose.note) bad.push('vysvetľujúci odsek pod ovládaním sa vrátil');
    if (prose.hidden) bad.push('popis skrytej trasy sa vrátil na stránku');
    assertNoErrors();
    await page.close();
  }

  await browser.close();
  if (bad.length) { console.error('POCASIE_ODTOK_FAIL\n- ' + bad.join('\n- ')); process.exit(1); }
  console.log('POCASIE_ODTOK_PASS dážď rešpektuje panel aj lamely, voda tečie po skutočnom žľabe a zvode, skryté trasy ostávajú suché.');
})().catch((error) => { console.error(error); process.exit(1); });
