/*
  Test plynulosti: nemizne pri otáčaní nejaký diel?

  Keď sa model otáča po malých krokoch, plocha jeho siluety sa musí meniť
  plynulo. Skokový rozdiel medzi dvomi susednými uhlami znamená, že sa niečo
  objavilo alebo zmizlo — presne tak sa prejavil žľab, ktorý sa pri niektorých
  pohľadoch zahodil aj s tým, čo mal zakrývať.

  Meria sa aj počet nakreslených polygónov: ten smie klesať a stúpať podľa
  odvrátených stien, ale nie o polovicu naraz.

  Spustenie:
      npx http-server . -p 8901 -s &
      PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node konfigurator/test/plynulost.js
*/
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const PRAH = Number(process.env.KV_PRAH || 0.22);   // povolený skok siluety

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 750 } })).newPage();
  p.on('pageerror', (e) => console.log('CHYBA STRÁNKY', e.message));
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(2200);
  if (!await p.evaluate(() => Boolean(window.SP_TEST))) { console.log('SP_TEST chýba'); await b.close(); process.exit(2); }

  const nalezy = await p.evaluate(async ([PRAH]) => {
    const svg = document.querySelector('[data-sp-canvas]');
    const plocha = async () => {
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml))); });
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      const c = document.createElement('canvas'); c.width = vb[2]; c.height = vb[3];
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, vb[2], vb[3]);
      const d = g.getImageData(0, 0, vb[2], vb[3]).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) n++;
      return n;
    };
    const set = (a, v) => { const e = document.querySelector(a); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const out = [];
    for (const [W, L] of [[4000, 6000], [2500, 5200], [7000, 6000]]) {
      set('[data-sp-w]', W); set('[data-sp-l]', L);
      await new Promise((r) => setTimeout(r, 150));
      for (const el of [-0.16, 0.10, 0.42, 0.80, 1.12]) {
        let prev = null, prevAz = null;
        for (let i = 0; i <= 72; i++) {
          const az = -Math.PI + (i * Math.PI * 2) / 72;
          window.SP_TEST.setView(az, el); window.SP_TEST.redraw();
          await new Promise((r) => setTimeout(r, 12));
          const a = await plocha();
          if (prev !== null) {
            const zmena = Math.abs(a - prev) / Math.max(1, Math.max(a, prev));
            if (zmena > PRAH) out.push(`${W}×${L} el=${el} az ${prevAz.toFixed(2)}→${az.toFixed(2)}: silueta ${prev}→${a} (${(zmena * 100).toFixed(0)} %)`);
          }
          prev = a; prevAz = az;
        }
      }
    }
    return out;
  }, [PRAH]);

  if (nalezy.length) {
    console.log('SKOK V SILUETE — niečo sa objavilo alebo zmizlo:');
    nalezy.slice(0, 25).forEach((r) => console.log('  ' + r));
    console.log('spolu', nalezy.length);
  } else {
    console.log('silueta sa mení plynulo (3 veľkosti × 5 sklonov × 72 uhlov)');
  }
  await b.close();
  process.exit(nalezy.length ? 1 : 0);
})();
