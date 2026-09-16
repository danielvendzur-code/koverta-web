/* Nerovnaké polia medzi stĺpmi nie sú chyba, je to parkovací plán: trojstĺpová
   varianta delí frontu na kratšie a dlhšie pole, do kratšieho sa zaparkuje
   jedno auto a do dlhšieho dve. Auto pritom stojí dĺžkou naprieč šírkou
   prístrešku — keby stálo po dĺžke, nerovnaké polia by nedávali zmysel.

   Kontrola drží obe strany tej istej mince: katalógový odstup P5 sa nesmie
   „opraviť" na rovnomerné delenie a autá musia z tých polí vychádzať. */
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext, watchErrors } = require('./browser-qa');

const BASE = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await prepareContext(context);
  const page = await context.newPage();
  const assertNoErrors = watchErrors(page);
  const zle = [];
  let overených = 0;

  await page.goto(`${BASE}?page=carport`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const e = document.querySelector('[data-scene-mode="car"]'); if (e) e.click(); });
  await page.waitForTimeout(2500);

  const modely = await page.evaluate(() =>
    JSON.parse(document.querySelector('[data-sp-bio-data]').textContent).order.slice());

  for (const model of modely) {
    const údaje = await page.evaluate((m) => {
      const el = [...document.querySelectorAll('[data-sp-model]')].find(e => e.dataset.spModel === m);
      if (el) el.click();
      const d = JSON.parse(document.querySelector('[data-sp-bio-data]').textContent).models[m];
      return { p5: d.p5 || null, maxW: Math.max(...(d.widths || [d.width])), maxL: Math.max(...d.lengths) };
    }, model);
    if (!údaje.p5) continue;

    const snap = await page.evaluate(async ([W, L]) => {
      const w = document.querySelector('[data-sp-w]'); w.value = W; w.dispatchEvent(new Event('input', { bubbles: true }));
      const l = document.querySelector('[data-sp-l]'); l.value = L; l.dispatchEvent(new Event('input', { bubbles: true }));
      const c = document.querySelector('#sp-scene-count'); if (c) { c.value = '3'; c.dispatchEvent(new Event('change', { bubbles: true })); }
      await new Promise(r => setTimeout(r, 1400));
      const t = window.SP_TEST.snapshot();
      return { w: t.width, l: t.length, posts: t.posts, scene: window.SP_TEST.scene() };
    }, [údaje.maxW, údaje.maxL]);

    overených += 1;
    const menovka = `${model} ${snap.w}×${snap.l}`;
    /* Katalógový odstup drží: prostredný stĺp nestojí v strede rozpätia. */
    const xs = snap.posts.xs;
    if (xs.length === 3) {
      const a = xs[1] - xs[0], b = xs[2] - xs[1];
      if (Math.abs(a - b) < 200) {
        zle.push(`${menovka}: prostredný stĺp stojí v strede (${a} vs ${b} mm) — katalógový odstup P5 sa stratil`);
      }
    }
    const autá = snap.scene.items || [];
    if (!autá.length) { zle.push(`${menovka}: pod najväčší prístrešok sa nezmestilo ani jedno auto`); continue; }

    /* Autá musia stáť naprieč a každé celé v jednom poli medzi stĺpmi. */
    const polia = [];
    let od = 0;
    xs.forEach((x, i) => {
      const doX = x;
      if (i > 0 && doX - od > 0) polia.push([od, doX]);
      od = x + snap.posts.d;
    });
    if (od < snap.l) polia.push([od, snap.l]);

    autá.forEach((a, i) => {
      const bb = a.bounds;
      const tb = a.rotation ? [-bb[4], bb[0], bb[2], -bb[1], bb[3], bb[5]] : bb;
      const x0 = a.x + tb[0], x1 = a.x + tb[3], y0 = a.y + tb[1], y1 = a.y + tb[4];
      if (x0 < -1 || x1 > snap.l + 1 || y0 < -1 || y1 > snap.w + 1) {
        zle.push(`${menovka}: auto ${i + 1} (${a.key}) vyčnieva spod strechy`);
      }
      if (autá.length >= 3 && !a.rotation) {
        zle.push(`${menovka}: pri troch autách stojí auto ${i + 1} po dĺžke, má stáť naprieč`);
      }
      if (a.rotation && !polia.some(([lo, hi]) => x0 >= lo - 1 && x1 <= hi + 1)) {
        zle.push(`${menovka}: auto ${i + 1} nestojí celé v jednom poli medzi stĺpmi`
          + ` (${Math.round(x0)}–${Math.round(x1)}, polia ${polia.map(f => f.map(Math.round).join('–')).join(', ')})`);
      }
    });

    /* Rozdelenie do polí: kratšie pole jedno auto, dlhšie dve. */
    if (autá.length === 3 && autá.every(a => a.rotation)) {
      const počet = polia.map(([lo, hi]) => autá.filter(a => {
        const bb = a.bounds, tb = [-bb[4], bb[0], bb[2], -bb[1], bb[3], bb[5]];
        return a.x + tb[0] >= lo - 1 && a.x + tb[3] <= hi + 1;
      }).length).filter(n => n > 0).sort();
      if (počet.join(',') !== '1,2') {
        zle.push(`${menovka}: tri autá sa nerozdelili 1 + 2, ale ${počet.join(' + ') || 'nijako'}`);
      }
    }
  }

  await browser.close();
  assertNoErrors();
  if (!overených) throw new Error('Rozostup stĺpov: neoveril sa ani jeden model s katalógovým odstupom P5');
  if (zle.length) {
    console.error(zle.join('\n'));
    throw new Error(`Rozostup stĺpov: ${zle.length} nezrovnalostí`);
  }
  console.log(`Post bays PASS: ${overených} modelov — P5 drží, autá stoja naprieč a delia sa medzi polia.`);
})().catch((error) => { console.error(error.message || error); process.exit(1); });
