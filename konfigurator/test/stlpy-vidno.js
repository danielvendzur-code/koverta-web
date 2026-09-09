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
      /* Rady stĺpov aj ich prierezy dá tá istá osnova, akú kreslí engine —
         čelné rámy majú os 52 a 196 mm od hrán strechy, väznice delia
         rozpätie medzi nimi na rovnaké polia a stĺpy stoja pod osami tej
         istej osnovy. Krajný stĺp je štvorec, stredný má hlbší prierez. */
      const band = geom.find(g => W <= g.max) || geom[geom.length-1];
      const R = bio.models.K.kvRef, vsun = bio.models.K.postInset;
      const zad = R.ramZad + R.ramW / 2, odk = L - R.ramOdkvap - R.ramW / 2;
      const stred = (zad + odk) / 2;
      let vaz, osi;
      if (band.vaznicStred) {
        /* štvorstĺpová: tri väznice v strede ± (L/4 + 250), stĺpy pod krajnými */
        const sm = L / 4 + band.vaznicStred;
        vaz = [stred - sm, stred, stred + sm];
        osi = [vaz[0], vaz[2]];
      } else {
        const nv = band.vaznicPole > 0
          ? Math.max(1, Math.ceil((odk - zad) / band.vaznicPole) - 1)
          : Math.max(1, band.vaznic);
        const pole = (odk - zad) / (nv + 1);
        vaz = []; for (let k = 1; k <= nv; k++) vaz.push(zad + pole * k);
        const n = Math.max(2, band.postsPerSide);
        osi = [zad];
        for (let k = 1; k < n - 1; k++) osi.push(vaz[Math.round(((vaz.length - 1) * k) / (n - 1))]);
        osi.push(odk);
      }
      const body = [];
      osi.forEach((os, i) => {
        const naVaznici = band.stlpyNaVaznici || (i !== 0 && i !== osi.length - 1);
        const pd = naVaznici ? R.stredD : R.postD, pw = naVaznici ? R.stredW : R.postW;
        const x = Math.min(Math.max(os, pd / 2), L - pd / 2);
        for (const [y, nm] of [[vsun + pw/2, 'y0'], [W - vsun - pw/2, 'yW']])
          for (const z of [500, 1200, 2000]) body.push([x, y, z, `rad ${Math.round(os)} ${nm} z${z}`]);
      });
      for (let ai = 0; ai < 8; ai++) {
        const az = -Math.PI + (ai * Math.PI * 2) / 8;
        for (const el of [0.10, 0.42]) {
          /* Strecha smie stĺp zakryť — pri pohľade zhora zakryje ten, čo
             stojí pri jej odvrátenej hrane, a je to tak správne. Lúč do
             kamery ide smerom VIEWDIR = (−sin az · cos el, cos az · cos el,
             sin el); keď na výške strechy padne ešte do jej pôdorysu, je bod
             za strechou a nekontroluje sa. */
          const V = [-Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
          const zaStrechou = (x, y, z) => {
            if (V[2] <= 0.02) return false;
            const t = (bio.models.K.fixedHeight - z) / V[2];
            const rx = x + V[0] * t, ry = y + V[1] * t;
            return rx > 0 && rx < L && ry > 0 && ry < W;
          };
          window.SP_TEST.setView(az, el); window.SP_TEST.redraw();
          await new Promise(r => setTimeout(r, 40));
          const s = await snap();
          for (const [x, y, z, n] of body) {
            if (zaStrechou(x, y, z)) continue;
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
