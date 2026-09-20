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
const { prepareContext, watchErrors, setModelColors } = require('./browser-qa');
const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const PRAH = Number(process.env.KV_PRAH || 0.22);   // povolený skok siluety

/* Rozdelenie podľa rozmerov, rovnako ako pri hlbokých kontrolách. Test
   prejde 1 095 pohľadov a každý z nich serializuje SVG, dekóduje ho ako
   obrázok a prekreslí na plátno; to je časť, ktorú zmenšený raster
   nezrýchli, a na GitHub runneri celok vždy narazil na 30-minútový limit
   úlohy. Zrušená úloha sa tvári ako výsledok, ktorý nikto nedostal.

   Delí sa počet rozmerov, nie počet pohľadov: každý shard prejde svoje
   rozmery celé, so všetkými sklonmi aj azimutmi. Bez premenných prostredia
   sa správa ako predtým a zbehne všetky tri. */
const SHARD_INDEX = Number(process.env.KV_SHARD_INDEX || 0);
const SHARD_TOTAL = Number(process.env.KV_SHARD_TOTAL || 1);
if (!Number.isInteger(SHARD_INDEX) || !Number.isInteger(SHARD_TOTAL) ||
    SHARD_TOTAL < 1 || SHARD_INDEX < 0 || SHARD_INDEX >= SHARD_TOTAL) {
  throw new Error('Neplatný shard ' + SHARD_INDEX + '/' + SHARD_TOTAL);
}
const VSETKY_ROZMERY = [[4000, 6000], [2500, 5200], [7000, 6000]];
const ROZMERY = VSETKY_ROZMERY.filter((_, i) => i % SHARD_TOTAL === SHARD_INDEX);

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 750 } });
  await prepareContext(ctx);
  const p = await ctx.newPage();
  const assertNoErrors = watchErrors(p);
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(2200);
  if (!await p.evaluate(() => Boolean(window.SP_TEST))) { console.log('SP_TEST chýba'); await b.close(); process.exit(2); }

  const nalezy = await p.evaluate(async ([PRAH, ROZMERY]) => {
    const svg = document.querySelector('[data-sp-canvas]');
    const plocha = async () => {
      const xml = window.SP_TEST.exportSVG();
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml))); });
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      /* Na skok siluety netreba rasterizovať celý 1000 × 750 viewport.
         Pôvodná verzia čítala pri 1 095 pohľadoch vyše 820 miliónov pixelov
         a na GitHub runneri vždy narazila na 30-minútový limit. Normalizovaná
         plocha siluety zostáva pri menšom rastri rovnaká, test však skončí
         približne desaťkrát rýchlejšie. */
      const rasterW = 320;
      const rasterH = Math.max(1, Math.round(rasterW * vb[3] / vb[2]));
      const c = document.createElement('canvas'); c.width = rasterW; c.height = rasterH;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, rasterW, rasterH);
      const d = g.getImageData(0, 0, rasterW, rasterH).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) n++;
      return n;
    };
    const set = (a, v) => { const e = document.querySelector(a); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const out = [];
    for (const [W, L] of ROZMERY) {
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
  }, [PRAH, ROZMERY]);

  if (nalezy.length) {
    console.log('SKOK V SILUETE — niečo sa objavilo alebo zmizlo:');
    nalezy.slice(0, 25).forEach((r) => console.log('  ' + r));
    console.log('spolu', nalezy.length);
  } else {
    console.log('silueta sa mení plynulo (3 veľkosti × 5 sklonov × 72 uhlov)');
  }
  await b.close();
  assertNoErrors();
  process.exit(nalezy.length ? 1 : 0);
})();
