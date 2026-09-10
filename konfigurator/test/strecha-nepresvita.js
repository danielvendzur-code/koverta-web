/*
  Presvitá cez strechu niečo, čo tam nemá byť?

  Plech strechy je nepriehľadný. Pri pohľade zhora teda nesmie byť na ňom
  vidieť ani pozinkovaný diel (rám, väznicu, spojku), ani podklad, ani
  pozadie — a práve to sa stávalo: rovina zvislého líca väznice rozdelila
  veľkú plochu strechy na dva kusy a samo sa kreslilo medzi ne, takže mu na
  spoji vykukol pixel a cez celú strechu z toho bola tenká svetlá čiara.

  Test prefarbí pozinkované diely a podhľad na sýte farby, ktoré sa na
  streche nemajú kde vziať, scénu vykreslí do plátna a spočíta, koľko takých
  pixelov je vnútri obrysu strechy. Musí ich byť nula.

  Spustenie:
      npx http-server . -p 8901 -s &
      PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright \
        node konfigurator/test/strecha-nepresvita.js
*/
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext, watchErrors, setModelColors } = require('./browser-qa');
const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';

/* Farby, ktoré sa dajú na streche spoznať na prvý pohľad. */
const BARVY = { rimSoffitHex: '#ffcc00', trapezSoffitHex: '#ff00ff' };

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  await prepareContext(ctx);
  await setModelColors(ctx, BARVY);
  const p = await ctx.newPage();
  const assertNoErrors = watchErrors(p);
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(2200);

  const zle = await p.evaluate(async () => {
    const snap = async () => {
      const svg = document.querySelector('[data-sp-canvas]');
      const txt = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(txt))); });
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      const c = document.createElement('canvas'); c.width = vb[2]; c.height = vb[3];
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, vb[2], vb[3]);
      return g.getImageData(0, 0, vb[2], vb[3]);
    };
    const set = (a, v) => { const e = document.querySelector(a); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const out = [];
    for (const [W, L] of [[2500, 6000], [4000, 5200], [6000, 5600], [7000, 6000]]) {
      set('[data-sp-w]', W); set('[data-sp-l]', L);
      await new Promise((r) => setTimeout(r, 150));
      /* Len pohľady zhora — zdola je pozink a podhľad vidieť právom. */
      for (let ai = 0; ai < 12; ai++) {
        const az = -Math.PI + (ai * Math.PI * 2) / 12;
        for (const el of [0.30, 0.45, 0.70, 1.10]) {
          window.SP_TEST.setView(az, el); window.SP_TEST.redraw();
          await new Promise((r) => setTimeout(r, 30));
          const d = (await snap()).data;
          let zlt = 0, mag = 0;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], bl = d[i + 2];
            if (r > 200 && g > 140 && g < 230 && bl < 120) zlt += 1;          // pozink
            if (r > 200 && g < 120 && bl > 200) mag += 1;                     // podhľad
          }
          if (zlt + mag > 0) out.push(`${W}×${L} az=${az.toFixed(2)} el=${el}: pozink ${zlt}, podhľad ${mag}`);
        }
      }
    }
    return out;
  });

  console.log(zle.length
    ? zle.slice(0, 15).join('\n') + `\nspolu ${zle.length} pohľadov`
    : 'cez strechu nič nepresvitá (4 veľkosti × 12 uhlov × 4 sklony zhora)');
  await b.close();
  assertNoErrors();
  process.exit(zle.length ? 1 : 0);
})();
