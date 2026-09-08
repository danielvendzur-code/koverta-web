/* Stĺp musí byť zvonku vidieť. Sonda číta pixel na vonkajšom líci stĺpa v
   polovici výšky; keď tam je farba podhľadu alebo pozadia, stĺp je prekrytý. */
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(2200);
  const out = await p.evaluate(async () => {
    const svg = document.querySelector('[data-sp-canvas]');
    const snap = async () => {
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml))); });
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      const c = document.createElement('canvas'); c.width = vb[2]; c.height = vb[3];
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, vb[2], vb[3]);
      return { g, w: vb[2], h: vb[3] };
    };
    const set = (a, v) => { const e = document.querySelector(a); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const bio = JSON.parse(document.querySelector('[data-sp-bio-data]').textContent);
    const geom = bio.models.K.kvGeom;
    const zle = [];
    for (const [W, L] of [[2500,5200],[4000,6000],[6200,6000],[6600,6000],[7000,6000]]) {
      set('[data-sp-w]', W); set('[data-sp-l]', L);
      await new Promise(r => setTimeout(r, 150));
      const band = geom.find(g => W <= g.max) || geom[geom.length-1];
      const rows = band.poDlzke[String(L)].rows;
      const pd = band.postD, pw = band.postW, vsun = bio.models.K.postInset;
      const body = [];
      for (const r of rows) for (const [y, n] of [[vsun + pw/2, 'y0'], [W - vsun - pw/2, 'yW']])
        for (const z of [500, 1200, 2000]) body.push([r + pd/2, y, z, `rad ${r} ${n} z${z}`]);
      for (let ai = 0; ai < 8; ai++) {
        const az = -Math.PI + (ai * Math.PI * 2) / 8;
        for (const el of [0.10, 0.42]) {
          window.SP_TEST.setView(az, el); window.SP_TEST.redraw();
          await new Promise(r => setTimeout(r, 40));
          const s = await snap();
          for (const [x, y, z, n] of body) {
            const q = window.SP_TEST.project(x, y, z);
            const px = Math.round(q.x), py = Math.round(q.y);
            if (px < 1 || py < 1 || px >= s.w-1 || py >= s.h-1) continue;
            const d = s.g.getImageData(px, py, 1, 1).data;
            // podhľad je svetlosivý (~150-200), pozadie ~226-246, stĺp je tmavý
            if (d[0] > 140 && d[1] > 140 && d[2] > 140) zle.push(`${W}×${L} az=${az.toFixed(2)} el=${el} ${n}: rgb(${d[0]},${d[1]},${d[2]})`);
          }
        }
      }
    }
    return zle;
  });
  console.log(out.length ? out.slice(0, 20).join('\n') + `\nspolu ${out.length}` : 'stĺpy nikde neprekryté');
  await b.close();
  process.exit(out.length ? 1 : 0);
})();
