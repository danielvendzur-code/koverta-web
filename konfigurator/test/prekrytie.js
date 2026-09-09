/*
  Test prekrytia: prekrýva plech strechy lemovanie?

  Táto trieda chýb sa od oka nedá spoľahlivo nájsť — plech prerazí cez rameno
  lemovania len pri niektorých uhloch a len o pár pixelov, ale zákazník to na
  modeli vidí ako „trapéz pretŕča cez lemovanie". Test preto zafarbí strechu
  a lemovanie kontrastne, scénu vykreslí do plátna a v bodoch, kde má byť
  lemovanie, prečíta skutočnú farbu pixela.

  Spustenie (server musí bežať nad koreňom repozitára):
      npx http-server . -p 8901 -s &
      node konfigurator/test/prekrytie.js
*/
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext, watchErrors, setModelColors } = require('./browser-qa');
const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  await prepareContext(ctx);
  const p = await ctx.newPage();
  const assertNoErrors = watchErrors(p);
  await setModelColors(ctx, { trapezTopHex: '#00ff00', trapezSoffitHex: '#ff00ff' });
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(2200);

  const ok = await p.evaluate(() => Boolean(window.SP_TEST && window.SP_TEST.setView && window.SP_TEST.project));
  if (!ok) { console.log('SP_TEST nie je k dispozícii — engine sa nenačítal'); await b.close(); process.exit(2); }

  const zle = await p.evaluate(async () => {
    const svg = document.querySelector('[data-sp-canvas]');
    const snap = async () => {
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res; img.onerror = rej;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
      });
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      const c = document.createElement('canvas'); c.width = vb[2]; c.height = vb[3];
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, vb[2], vb[3]);
      return { g, w: vb[2], h: vb[3] };
    };
    const set = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const nalezy = [];
    for (const [W, L] of [[4000, 6000], [2500, 5200], [7000, 6000]]) {
      set('[data-sp-w]', W); set('[data-sp-l]', L);
      await new Promise((r) => setTimeout(r, 120));
      const zTop = 2398 + 260;      // horná hrana lemovania
      const body = [];
      for (let t = 0.02; t <= 0.99; t += 0.06) {
        for (const d of [25, 70, 120, 165]) { body.push([d, t * W]); body.push([L - d, t * W]); }
        for (const d of [30, 70, 120, 165]) { body.push([t * L, d]); body.push([t * L, W - d]); }
      }
      for (let ai = 0; ai < 12; ai++) {
        for (const el of [-0.15, 0.15, 0.42, 0.75, 1.12]) {
          const az = -Math.PI + (ai * Math.PI * 2) / 12;
          window.SP_TEST.setView(az, el); window.SP_TEST.redraw();
          await new Promise((r) => setTimeout(r, 40));
          const s = await snap();
          let zlych = 0, prvy = null;
          for (const [x, y] of body) {
            const q = window.SP_TEST.project(x, y, zTop);
            const px = Math.round(q.x), py = Math.round(q.y);
            if (px < 1 || py < 1 || px >= s.w - 1 || py >= s.h - 1) continue;
            const d = s.g.getImageData(px, py, 1, 1).data;
            if (d[1] > 150 && d[0] < 130 && d[2] < 130) { zlych++; if (!prvy) prvy = Math.round(x) + ',' + Math.round(y); }
          }
          if (zlych) nalezy.push(`${W}×${L} az=${az.toFixed(2)} el=${el}: ${zlych} bodov, prvý ${prvy}`);
        }
      }
    }
    return nalezy;
  });

  if (zle.length) {
    console.log('PLECH PREKRÝVA LEMOVANIE:');
    zle.slice(0, 30).forEach((r) => console.log('  ' + r));
    console.log('zlých pohľadov spolu:', zle.length);
  } else {
    console.log('lemovanie nikde neprekryté (180 pohľadov × ~270 bodov)');
  }
  await b.close();
  assertNoErrors();
  process.exit(zle.length ? 1 : 0);
})();
