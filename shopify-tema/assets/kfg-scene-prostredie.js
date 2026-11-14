/* ============================================================================
   KOVERTA · REÁLNA SCÉNA KONFIGURÁTORA
   ============================================================================

   Štúdio (biele pozadie) je predvolené a ostáva také, aké je. Toto je voľba
   navyše: prístrešok alebo pergola na skutočnom pozemku — obloha
   z fotografie, trávnik, spevnená plocha a podľa scény dom.

   Scény
     dom      fasáda domu za stavbou (okná, vstup / posuvné dvere), dlažba
              a trávnik — „takto by to stálo pri mojom dome“
     zahrada  bez domu: spevnená plocha v trávniku a živý plot v pozadí

   Podklady (licencia CC0, uvedené v scene-assets/CREDITS.md)
     obloha.jpg, obloha-4k.jpg  Poly Haven „Kloofendal 48d Partly Cloudy (Pure Sky)“,
                 2048 × 1024, uložené kódovaním x/(1+x) s gamou 2,2
     trava.jpg   ambientCG „Grass001“, farebná mapa 1024 × 1024

   Modul nič nekreslí sám. Dáva vykresľovaču (kv-render3d.js) nastavenie
   prostredia a konfigurátoru (soltec-premium.js) plochy kulís v tom istom
   formáte, v akom má plochy stavba: { w: [[x, y, z], …], fill, normal,
   cull, kulisa: true, mat3d }. Súradnice sú milimetre, x = dĺžka,
   y = šírka, z = výška; dom stojí za stavbou na strane y < 0.
   ============================================================================ */

(function (global) {
  'use strict';

  const base = global.KV_SCENE_ASSETS
    ? new URL(global.KV_SCENE_ASSETS, location.href)
    : new URL('./scene-assets/', document.currentScript.src);

  /* Hodnoty odmerané z mapy oblohy (scratch skript prípravy podkladov):
     ožiarenie z hornej pologule a z boku pri vystrihnutom slnku, poloha
     slnka u = 0,5950, výška 47,9°. Slnko sa natočí na ten istý azimut, aký
     má štúdio, aby tiene padali rovnako v oboch režimoch. */
  const AZIMUT_STUDIA = Math.atan2(0.42, -0.30);
  const VYSKA_SLNKA = 47.9 * Math.PI / 180;
  const OBLOHA = {
    otocenie: 0.5950 - 0.5 - AZIMUT_STUDIA / (2 * Math.PI),
    slnko: [Math.cos(VYSKA_SLNKA) * Math.cos(AZIMUT_STUDIA),
            Math.cos(VYSKA_SLNKA) * Math.sin(AZIMUT_STUDIA),
            Math.sin(VYSKA_SLNKA)],
    ozarenie: { hore: [0.4222, 0.4861, 0.6994], bok: [0.2898, 0.3405, 0.4932] },
    jas: 0.85,
    travaJas: 1.02,
    /* Vzdialený trávnik osvetlený tým istým slnkom a oblohou — zem pri
       horizonte, kam sa podklad rozplynie. */
    zemDalka: [0.084, 0.126, 0.060],
    odrazivostZeme: [0.16, 0.20, 0.12]
  };

  const SCENY = {
    studio: { nazov: 'Štúdio' },
    dom: { nazov: 'Pri dome', dom: true },
    zahrada: { nazov: 'Záhrada', plot: true }
  };

  const obrazky = {};
  function obrazok(meno) {
    if (!obrazky[meno]) {
      obrazky[meno] = new Promise((ok, chyba) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.decoding = 'async';
        im.onload = () => ok(im);
        im.onerror = () => chyba(new Error('prostredie: ' + meno));
        im.src = new URL('prostredie/' + meno, base).href;
      });
    }
    return obrazky[meno];
  }

  /* Nastavenie pre vykresľovač. Pri štúdiu null. */
  /* Silný stroj dostane ostrú oblohu 4K (len horná pologuľa, 4096 × 1152)
     a dlažbu 2K — v detailoch na telefóne bola 1K dlažba aj 2K obloha
     zväčšená a rozmazaná. Slabší stroj (moznosti.lite) ostáva pri
     pôvodných 1K/2K súboroch, aby mu nedošla grafická pamäť. */
  function nacitaj(scena, moznosti) {
    if (!SCENY[scena] || scena === 'studio') return Promise.resolve(null);
    const lite = Boolean(moznosti && moznosti.lite);
    const oblohaSubor = lite ? 'obloha.jpg' : 'obloha-4k.jpg';
    return Promise.all([obrazok(oblohaSubor), obrazok('trava.jpg'), obrazok('trava2.jpg'),
      obrazok('trava-n.jpg'), obrazok('listy.webp'), obrazok(lite ? 'dlazba.jpg' : 'dlazba-2k.jpg'),
      obrazok(lite ? 'dlazba-n.jpg' : 'dlazba-n-2k.jpg')])
      .then(([obloha, trava, trava2, travaN, listy, dlazba, dlazbaN]) =>
        Object.assign({ scena, obloha, trava, trava2, travaN, listy, dlazba, dlazbaN,
          oblohaV: lite ? 1 : 0.5625, oblohaLod: lite ? 0 : 1 }, OBLOHA));
  }

  /* ------------------------------------------------------------ TVARY

     Zeleň a drobnosti sú skutočné telesá, nie obrázky na doske: koruna
     stromu je zvlnená guľa, plot je zaoblený kváder s nerovným povrchom.
     Tvar sa generuje tu, v prehliadači — nič sa nesťahuje a jeden strom má
     okolo tisíc trojuholníkov. Šum je deterministický (rovnaké semienko =
     rovnaký strom), takže sa scéna pri každom prekreslení nemení. */
  function hash3(x, y, z, s) {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function sum3(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    let r = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      r += hash3(xi + dx, yi + dy, zi + dz, s) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    }
    return r * 2 - 1;
  }
  const fbm = (x, y, z, s) => sum3(x, y, z, s) * 0.62 + sum3(x * 2.13, y * 2.13, z * 2.13, s + 7) * 0.27
    + sum3(x * 4.7, y * 4.7, z * 4.7, s + 13) * 0.11;
  const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  /* Teleso z mriežky zemepisných súradníc. `e` je zaoblenie: 1 = elipsoid,
     menej = kváder so zaoblenými hranami (plot). `amp` a `frek` sú zvlnenie
     povrchu v metroch na meter polomeru. Normály vrcholov sa počítajú
     z hotového, zvlneného povrchu, takže svetlo kopíruje každú hrču. */
  function teleso(push, c, r, o) {
    const rows = o.rows || 10, cols = o.cols || 16, e = o.e || 1, seed = o.seed || 1;
    const amp = o.amp === undefined ? 0.16 : o.amp, frek = o.frek || 1.6;
    const zDole = o.zDole === undefined ? -1 : o.zDole;
    const P = [];
    for (let i = 0; i <= rows; i++) {
      const th = -Math.PI / 2 + Math.PI * (zDole > -1 ? (Math.asin(zDole) / Math.PI + 0.5) + (1 - (Math.asin(zDole) / Math.PI + 0.5)) * i / rows : i / rows);
      const row = [];
      for (let j = 0; j < cols; j++) {
        const ph = 2 * Math.PI * j / cols;
        const dx = sgnPow(Math.cos(th), e) * sgnPow(Math.cos(ph), e);
        const dy = sgnPow(Math.cos(th), e) * sgnPow(Math.sin(ph), e);
        const dz = sgnPow(Math.sin(th), e);
        const px = dx * r[0], py = dy * r[1], pz = dz * r[2];
        const k = 1 + amp * fbm(px / 1000 * frek, py / 1000 * frek, pz / 1000 * frek, seed);
        row.push([c[0] + px * k, c[1] + py * k, c[2] + pz * k]);
      }
      P.push(row);
    }
    const N = P.map((row, i) => row.map((q, j) => {
      const a = row[(j + 1) % cols], b = row[(j + cols - 1) % cols];
      const u = P[Math.min(rows, i + 1)][j], d = P[Math.max(0, i - 1)][j];
      const t1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], t2 = [u[0] - d[0], u[1] - d[1], u[2] - d[2]];
      let n = [t1[1] * t2[2] - t1[2] * t2[1], t1[2] * t2[0] - t1[0] * t2[2], t1[0] * t2[1] - t1[1] * t2[0]];
      let m = Math.hypot(n[0], n[1], n[2]);
      if (m < 1e-9) { n = [q[0] - c[0], q[1] - c[1], q[2] - c[2]]; m = Math.hypot(n[0], n[1], n[2]) || 1; }
      n = [n[0] / m, n[1] / m, n[2] / m];
      if (n[0] * (q[0] - c[0]) + n[1] * (q[1] - c[1]) + n[2] * (q[2] - c[2]) < 0) n = [-n[0], -n[1], -n[2]];
      return n;
    }));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const j1 = (j + 1) % cols;
      push([P[i][j], P[i][j1], P[i + 1][j1], P[i + 1][j]], [N[i][j], N[i][j1], N[i + 1][j1], N[i + 1][j]]);
    }
    if (zDole > -1) {
      /* Odrezaný spodok (plot stojí na zemi): uzavrie sa jednou plochou. */
      push(P[0].slice().reverse(), null);
    }
  }

  /* Valec (kmeň, kvetináč) — spodný a horný polomer, počet strán. */
  function valec(push, c, r0, r1, z0, z1, strany) {
    for (let j = 0; j < strany; j++) {
      const a = 2 * Math.PI * j / strany, b = 2 * Math.PI * (j + 1) / strany;
      const P = (ang, r, z) => [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r, z];
      const n = (ang) => [Math.cos(ang), Math.sin(ang), (r0 - r1) / Math.max(1, z1 - z0)];
      push([P(a, r0, z0), P(b, r0, z0), P(b, r1, z1), P(a, r1, z1)], [n(a), n(b), n(b), n(a)]);
    }
    const vrch = [];
    for (let j = 0; j < strany; j++) { const a = 2 * Math.PI * j / strany; vrch.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1, z1]); }
    push(vrch, null, [0, 0, 1]);
  }

  function kvader(push, a, b) {
    const [x0, y0, z0] = a, [x1, y1, z1] = b;
    push([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], null, [0, 1, 0]);
    push([[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]], null, [0, -1, 0]);
    push([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], null, [0, 0, 1]);
    push([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], null, [0, 0, -1]);
    push([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], null, [-1, 0, 0]);
    push([[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]], null, [1, 0, 0]);
  }

  /* Karty s listami. Každá je štvorec s textúrou vetvičky (listy.png,
     dve varianty vedľa seba). Normála vrcholov sa ohne smerom od stredu
     koruny: koruna sa potom tieňuje ako jedno teleso — svetlá strana k
     slnku, tmavá odvrátená — a nie ako kopa plochých papierikov. */
  let lite = false;
  /* Trsy trávy pri dlažbe pôsobili ako tmavý lem burín — vypnuté
     (rozhodnutie majiteľa). Kód ostáva pre prípadné neskoršie použitie. */
  const TRSY = false;
  function karty(push, c, r, pocet, velkost, seed, o) {
    const opt = o || {};
    if (lite) pocet = Math.round(pocet * 0.3);
    for (let i = 0; i < pocet; i++) {
      const h = (k) => hash3(seed, i, k, 5);
      /* poloha v obale: rovnomerne po smere, hustejšie pri povrchu */
      const zN = h(1) * 2 - 1, ang = h(2) * Math.PI * 2, rN = Math.sqrt(1 - zN * zN);
      let d = [rN * Math.cos(ang), rN * Math.sin(ang), zN];
      if (opt.smer) d = opt.smer(d, h);
      const hlbka = opt.plocha ? 1 : 0.62 + 0.38 * Math.sqrt(h(3));
      const q = [c[0] + d[0] * r[0] * hlbka, c[1] + d[1] * r[1] * hlbka, c[2] + d[2] * r[2] * hlbka];
      if (opt.zMin !== undefined && q[2] < opt.zMin) continue;
      /* náhodná orientácia karty, mierne natočená von */
      let nk = [d[0] + (h(4) - 0.5) * 1.6, d[1] + (h(5) - 0.5) * 1.6, d[2] + (h(6) - 0.5) * 1.6];
      const m = Math.hypot(nk[0], nk[1], nk[2]) || 1; nk = nk.map((v) => v / m);
      const pom = Math.abs(nk[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      let u = [pom[1] * nk[2] - pom[2] * nk[1], pom[2] * nk[0] - pom[0] * nk[2], pom[0] * nk[1] - pom[1] * nk[0]];
      const mu = Math.hypot(u[0], u[1], u[2]) || 1; u = u.map((v) => v / mu);
      let v = [nk[1] * u[2] - nk[2] * u[1], nk[2] * u[0] - nk[0] * u[2], nk[0] * u[1] - nk[1] * u[0]];
      const rot = h(7) * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
      const uu = u.map((x, k) => x * cr + v[k] * sr), vv = v.map((x, k) => -u[k] * sr + x * cr);
      const sz = velkost * (0.75 + h(8) * 0.5) / 2;
      const P = (a, b) => [q[0] + (uu[0] * a + vv[0] * b) * sz, q[1] + (uu[1] * a + vv[1] * b) * sz, q[2] + (uu[2] * a + vv[2] * b) * sz];
      const nObal = [d[0] * 0.75 + nk[0] * 0.25, d[1] * 0.75 + nk[1] * 0.25, d[2] * 0.75 + nk[2] * 0.25];
      const mn = Math.hypot(nObal[0], nObal[1], nObal[2]) || 1;
      const nv = [nObal[0] / mn, nObal[1] / mn, nObal[2] / mn];
      const u0 = h(9) < 0.5 ? 0 : 0.5;
      push([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], [nv, nv, nv, nv], nk,
        [[u0, 0.5], [u0 + 0.5, 0.5], [u0 + 0.5, 0], [u0, 0]]);
    }
  }

  /* Listnatý strom: kmeň, pár hlavných konárov a koruna z kariet okolo
     tmavého jadra (jadro zakryje priezory, cez ktoré by bolo vidieť
     oblohu tam, kde ju v skutočnej korune nevidno). */
  function strom(pridaj, x, y, vyska, seed) {
    const rnd = (k) => hash3(seed, k, 3, 11);
    const kmenH = vyska * (0.34 + rnd(1) * 0.08);
    valec(pridaj('#5a4a3c', 'kmen'), [x, y], 160 + rnd(2) * 60, 100, 0, kmenH + 900, 9);
    const R = vyska * (0.30 + rnd(3) * 0.05);
    const zc = kmenH + R * 0.92;
    for (let i = 0; i < 4; i++) {
      const a = rnd(50 + i) * Math.PI * 2, d = R * 0.55;
      const z0 = kmenH + 300 + i * 220;
      const konar = pridaj('#5a4a3c', 'kmen');
      konar([[x - 40, y, z0], [x + 40, y, z0], [x + Math.cos(a) * d + 20, y + Math.sin(a) * d, z0 + R * 0.55], [x + Math.cos(a) * d - 20, y + Math.sin(a) * d, z0 + R * 0.55]], null, null);
    }
    teleso(pridaj('#2f4524', 'listie'), [x, y, zc], [R * 0.80, R * 0.80, R * 0.70],
      { rows: 8, cols: 12, amp: 0.18, frek: 1.4, seed: seed * 31 });
    karty(pridaj('#9aa77f', 'karta'), [x, y, zc], [R, R, R * 0.86], 300, R * 0.62, seed);
    tienNaZemi(x + R * 0.25, y - R * 0.15, R * 1.05);
  }

  function ker(pridaj, x, y, r, seed, ton) {
    teleso(pridaj('#34492a', 'listie'), [x, y, r * 0.5], [r * 0.85, r * 0.85, r * 0.6],
      { rows: 7, cols: 12, amp: 0.20, frek: 3.4, seed, zDole: -0.6 });
    karty(pridaj(ton === '#6c8a4f' ? '#a6b07f' : '#93a27a', 'karta'), [x, y, r * 0.55], [r, r, r * 0.75],
      Math.round(30 + r * r / 9000), Math.max(380, r * 0.75), seed, { zMin: 40 });
    tienNaZemi(x, y, r * 1.15);
  }

  /* Trsy trávy: dve prekrížené zvislé karty s textúrou stebiel (spodná
     polovica atlasu). Na rovnej ploche trávnika robia to, čo textúra
     nevie — steblá, ktoré trčia nad zem a vrhajú obrys proti dlažbe.
     Normála smeruje hore, aby sa trs svietil ako trávnik pod ním. */
  function trs(push, x, y, vyska, seed) {
    const h = (k) => hash3(seed, k, 9, 2);
    const sirka = vyska * (0.9 + h(1) * 0.5), u0 = h(2) < 0.5 ? 0 : 0.5;
    const nv = [0, 0, 1];
    for (let k = 0; k < 2; k++) {
      const a = h(3) * Math.PI + k * Math.PI / 2;
      const dx = Math.cos(a) * sirka / 2, dy = Math.sin(a) * sirka / 2;
      push([[x - dx, y - dy, 0], [x + dx, y + dy, 0], [x + dx, y + dy, vyska], [x - dx, y - dy, vyska]],
        [nv, nv, nv, nv], [-Math.sin(a), Math.cos(a), 0],
        [[u0, 1], [u0 + 0.5, 1], [u0 + 0.5, 0.5], [u0, 0.5]]);
    }
  }

  /* Mäkký tieň pod zeleňou. Kulisy do tieňovej mapy nekreslia (zväčšili by
     jej záber a zhoršili tiene výrobku), takže by strom visel nad trávou.
     Tri priesvitné sústredné kruhy dajú tmavý stred a rozplynutý okraj. */
  let tienNaZemi = () => {};

  /* ---------------------------------------------------------------- KULISY */

  let OMIETKA = '#e9e6df', SOKEL = '#5d6064', ATIKA = '#3b3f43',
        SKLO = '#6d7b84', RAM = '#2f3437', SOKEL_V = 300;
  /* Farby domu sa dajú pre nahrávanie videa nastaviť tak, aby sa podobali
     domu na fotke realizácie (window.KV_SCENA_FARBY = { omietka, sokel,
     atika, ram }). V konfigurátore na webe ostávajú predvolené. */
  function farbyDomu() {
    const z = { omietka: '#e9e6df', sokel: '#5d6064', atika: '#3b3f43', ram: '#2f3437' };
    let f = {};
    try { f = global.KV_SCENA_FARBY || {}; } catch (e) {}
    const ok = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    OMIETKA = ok(f.omietka) ? f.omietka : z.omietka;
    SOKEL = ok(f.sokel) ? f.sokel : z.sokel;
    ATIKA = ok(f.atika) ? f.atika : z.atika;
    RAM = ok(f.ram) ? f.ram : z.ram;
    /* Výška sokla v mm — pri dome s tehlovým prízemím ako na fotke až po
       strop prízemia (napr. 2900). */
    SOKEL_V = Number.isFinite(Number(f.sokelVyska)) ? Math.max(0, Math.min(6000, Number(f.sokelVyska))) : 300;
  }

  function kulisy(scena, obal, moznosti) {
    const S = SCENY[scena];
    if (!S || scena === 'studio' || !obal) return { plochy: [], dlazba: null };
    const o = moznosti || {};
    lite = Boolean(o.lite);
    /* Kamera obieha stred stavby po kružnici s polomerom dosahKamery.
       Stromy musia stáť za ňou, inak by nimi pri otáčaní prešla —
       poloha sa preto posunie od stredu von, smer ostáva. */
    const Rk = Number(o.dosahKamery) > 0 ? Number(o.dosahKamery) : 18000;
    const cxS = (obal[0] + obal[3]) / 2, cyS = (obal[1] + obal[4]) / 2;
    const zaKamerou = (x, y, rezerva) => {
      const dx = x - cxS, dy = y - cyS, d = Math.hypot(dx, dy) || 1;
      const min = Rk + (rezerva || 6500);
      return d >= min ? [x, y] : [cxS + dx / d * min, cyS + dy / d * min];
    };
    /* Koruna aj s kartami listov siaha ~0,45 výšky stromu od kmeňa. Kým
       bola rezerva 0,42 výšky + 3 m, kamera sa pri nízkom pohľade dostala
       do pásma, kde sa listy pri oku rozplývajú, a na oblohe viseli úlomky
       koruny. Teraz je medzi korunou a obletom kamery vždy aspoň 4,5 m. */
    const stromZa = (x, y, vyska, seed) => { const q = zaKamerou(x, y, vyska * 0.48 + 4500); strom(pridaj, q[0], q[1], vyska, seed); };
    farbyDomu();
    const [x0, y0, , x1, y1, z1] = obal;
    const L = x1 - x0, W = y1 - y0;
    const plochy = [];
    const quad = (w, fill, normal, mat3d, extra) =>
      plochy.push(Object.assign({ w, fill, sourceFill: fill, normal, cull: true, kulisa: true, domova: Boolean(S.dom), mat3d, edge: false }, extra || {}));
    /* Zeleň a predmety: nie sú súčasťou domu, takže ostávajú aj pri
       pohľade spoza domu. Zaoblené telesá sa neorezávajú (cull: false),
       inak by na obryse s hladkými normálami vznikali diery. */
    tienNaZemi = (x, y, r) => {
      [[1.0, 0.16], [0.72, 0.16], [0.45, 0.18]].forEach(([k, a], i) => {
        const w = [];
        for (let j = 0; j < 20; j++) { const u = 2 * Math.PI * j / 20; w.push([x + Math.cos(u) * r * k, y + Math.sin(u) * r * k, 3 + i]); }
        const fill = 'rgba(12,20,8,' + a + ')';
        plochy.push({ w, fill, sourceFill: fill, normal: [0, 0, 1], cull: false, kulisa: true, mat3d: 'tien', edge: false, depthAvg: 0 });
      });
    };
    const pridaj = (fill, mat3d, domova) => (w, nv, normal, uv) => {
      let n = normal;
      if (!n) {
        const a = w[0], b = w[1], c = w[2];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const m = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / m, n[1] / m, n[2] / m];
      }
      plochy.push({ w, nv: nv || undefined, uv: uv || undefined, fill, sourceFill: fill, normal: n, cull: false, kulisa: true,
        domova: Boolean(domova), mat3d, edge: false });
    };

    /* Spevnená plocha: pod stavbou a meter okolo, pri prístrešku pre autá
       aj príjazd smerom k ulici (+y). Mimo nej je trávnik. */
    const okraj = 1000;
    /* Rovina fasády — pri stavbe napojenej na stenu leží na nej. */
    const yFas = o.naStene ? y0 : y0 - (o.prijazd ? 350 : 600);
    /* Príjazd vedie od čela prístrešku na strane x0 — tam, odkiaľ sa na
       prístrešok s autami prirodzene pozerá (a odkiaľ býva fotená väčšina
       realizácií): kamera tak stojí na dlažbe dvora, nie v tráve. */
    const dlazba = o.prijazd && S.dom
      ? [x0 - 5200, (o.naStene ? y0 : y0 - 350), x1 + 600, y1 + 4500]
      : [x0 - okraj, y0 - (S.dom ? 2600 : okraj), x1 + okraj, y1 + okraj];

    if (S.dom) {
      /* Fasáda. Pri stavbe napojenej na stenu leží na jej rovine (y0),
         inak o kúsok za ňou. Dom je širší než stavba, aby ju zarámoval,
         a dvojpodlažný s rovnou strechou — moderný rodinný dom, na ktorom
         sa nič nebije s výrobkom.

         Dve rozloženia:
           terasa  pergola / záhradný prístrešok: za stavbou veľké posuvné
                   okno do obývačky, dlažba terasy, kvetináče pri vstupe
           auto    prístrešok pre autá: stavba stojí pri dome, za ňou je
                   vchod do domu, pred ňou príjazd z dlažby až k ulici
                   (smer +x, odkiaľ auto vchádza) a za ním cesta */
      const auto = Boolean(o.prijazd);
      const yF = yFas;
      const u0 = x0 - Math.max(2600, L * 0.35), u1 = x1 + (auto ? Math.max(1800, L * 0.2) : Math.max(2600, L * 0.35));
      const vyskaDomu = Math.max(6300, z1 + 3400);
      const hlbka = 9000;
      const nF = [0, 1, 0];
      const P = (u, z, d) => [u, yF + (d || 0), z];

      /* Otvory [u0, u1, z0, z1]. */
      const stred = (x0 + x1) / 2;
      const otvory = [];
      if (auto) {
        /* Vchodové dvere pod prístreškom bližšie k vjazdu, vedľa úzke
           okno; na poschodí rad okien. */
        const dv = Math.max(x0 + 300, Math.min(x1 - 1400, x0 + 1500));
        otvory.push([dv, dv + 1100, 0, 2250, 'dvere']);
        otvory.push([dv - 900, dv - 300, 300, 2250]);
        otvory.push([u0 + 900, u0 + 900 + 1500, 900, 2350]);
      } else {
        const sirkaPosuv = Math.min(4800, Math.max(2400, L * 0.55));
        otvory.push([stred - sirkaPosuv / 2, stred + sirkaPosuv / 2, 0, 2350]);
        otvory.push([u0 + 900, u0 + 900 + 1500, 900, 2350]);
        otvory.push([u1 - 900 - 1500, u1 - 900, 900, 2350]);
      }
      const zP = 3300, zP1 = zP + 1500;
      const nOkien = Math.max(2, Math.round((u1 - u0) / 3200));
      for (let i = 0; i < nOkien; i++) {
        const c = u0 + (u1 - u0) * (i + 0.5) / nOkien;
        otvory.push([c - 750, c + 750, zP, zP1]);
      }

      /* Stena s otvormi: rozdelí sa na zvislé pásy podľa hrán otvorov a
         v každom páse sa vynechajú výšky otvorov. Všetko sú obdĺžniky,
         takže vejárové delenie vo vykresľovači stačí. */
      const hranyU = [u0, u1];
      otvory.forEach((q) => { hranyU.push(q[0], q[1]); });
      const us = [...new Set(hranyU)].sort((a, b) => a - b);
      for (let i = 0; i < us.length - 1; i++) {
        const a = us[i], b = us[i + 1], m = (a + b) / 2;
        const diery = otvory.filter((q) => q[0] <= m && q[1] >= m).sort((p, q) => p[2] - q[2]);
        let z = 0;
        const pas = (za, zb) => {
          if (zb - za < 1) return;
          /* Sokel: tmavý pás pri zemi, ako má každý dom. */
          const zs = Math.min(zb, Math.max(za, SOKEL_V));
          if (zs > za) quad([P(a, za), P(b, za), P(b, zs), P(a, zs)], SOKEL, nF, 'omietka');
          if (zb > zs) quad([P(a, zs), P(b, zs), P(b, zb), P(a, zb)], OMIETKA, nF, 'omietka');
        };
        for (const q of diery) { pas(z, q[2]); z = q[3]; }
        pas(z, vyskaDomu);
      }

      /* Otvory: ostenie (hĺbka 180 mm), rám a sklo alebo dvere. */
      const ost = 180;
      otvory.forEach(([a, b, za, zb, druh]) => {
        quad([P(a, za, 0), P(a, za, -ost), P(a, zb, -ost), P(a, zb, 0)], OMIETKA, [1, 0, 0], 'omietka', { cull: false });
        quad([P(b, za, -ost), P(b, za, 0), P(b, zb, 0), P(b, zb, -ost)], OMIETKA, [-1, 0, 0], 'omietka', { cull: false });
        quad([P(a, zb, 0), P(b, zb, 0), P(b, zb, -ost), P(a, zb, -ost)], OMIETKA, [0, 0, -1], 'omietka', { cull: false });
        if (za > 0) quad([P(a, za, -ost), P(b, za, -ost), P(b, za, 0), P(a, za, 0)], '#cfccc6', [0, 0, 1], 'omietka', { cull: false });
        const r = 70;
        if (druh === 'dvere') {
          quad([P(a, za, -ost), P(b, za, -ost), P(b, zb, -ost), P(a, zb, -ost)], RAM, nF, 'lak');
          /* Vchodové dvere: plné krídlo v antracite s úzkym svetlíkom
             a zvislou madlovou tyčou. */
          quad([P(a + r, za, -ost + 8), P(b - r, za, -ost + 8), P(b - r, zb - r, -ost + 8), P(a + r, zb - r, -ost + 8)], '#33383c', nF, 'lak');
          quad([P(a + r + 120, za + 300, -ost + 10), P(a + r + 260, za + 300, -ost + 10), P(a + r + 260, zb - r - 220, -ost + 10), P(a + r + 120, zb - r - 220, -ost + 10)], SKLO, nF, 'okno');
          kvader(pridaj('#b9bcbf', 'hlinik', true), [b - r - 170, yF - ost + 10, 700], [b - r - 140, yF - ost + 70, 1900]);
          return;
        }
        /* Rám len po obvode — za sklom je izba, nie plná doska. */
        quad([P(a, za, -ost), P(b, za, -ost), P(b, za + r, -ost), P(a, za + r, -ost)], RAM, nF, 'lak');
        quad([P(a, zb - r, -ost), P(b, zb - r, -ost), P(b, zb, -ost), P(a, zb, -ost)], RAM, nF, 'lak');
        quad([P(a, za + r, -ost), P(a + r, za + r, -ost), P(a + r, zb - r, -ost), P(a, zb - r, -ost)], RAM, nF, 'lak');
        quad([P(b - r, za + r, -ost), P(b, za + r, -ost), P(b, zb - r, -ost), P(b - r, zb - r, -ost)], RAM, nF, 'lak');
        /* Izba za oknom: zadná stena, podlaha, strop a boky. Je v dome, kam
           priame slnko takmer nedopadne, preto má materiál „interier“
           s nízkou odrazivosťou — cez sklo pôsobí ako šerá miestnosť, tak
           ako na fotke domu cez deň. Po bokoch svetlé záclony. */
        {
          const d0 = -ost - 20, d1 = -ost - 3400;
          const zF = za > 0 ? za - 900 : 40, zC = Math.max(zb + 350, zF + 2650);
          const ua = Math.max(u0 + 30, a - 1600), ub = Math.min(u1 - 30, b + 1600);
          quad([P(ua, zF, d1), P(ub, zF, d1), P(ub, zC, d1), P(ua, zC, d1)], '#d9d3c9', nF, 'interier', { cull: false });
          quad([P(ua, zF, d0), P(ub, zF, d0), P(ub, zF, d1), P(ua, zF, d1)], '#8b7258', [0, 0, 1], 'interier', { cull: false });
          quad([P(ua, zC, d1), P(ub, zC, d1), P(ub, zC, d0), P(ua, zC, d0)], '#ebe8e2', [0, 0, -1], 'interier', { cull: false });
          quad([P(ua, zF, d1), P(ua, zF, d0), P(ua, zC, d0), P(ua, zC, d1)], '#d4cec4', [1, 0, 0], 'interier', { cull: false });
          quad([P(ub, zF, d0), P(ub, zF, d1), P(ub, zC, d1), P(ub, zC, d0)], '#d4cec4', [-1, 0, 0], 'interier', { cull: false });
          /* Záclony: dva závesy po krajoch okna, mierne zvlnené. */
          const sz = Math.min(700, (b - a) * 0.24), dz = -ost - 140;
          for (const [c0, c1] of [[a + r, a + r + sz], [b - r - sz, b - r]]) {
            /* Záhyby ako sínusovka: normála v každom vrchole, aby sa
               záves tieňoval hladko a nie ako harmonika. */
            const kus = 14, w = (c1 - c0) / kus, hl = 38;
            const bod = (k) => dz + Math.sin(k / kus * Math.PI * 5) * hl;
            const nrm = (k) => { const t = Math.cos(k / kus * Math.PI * 5) * hl * Math.PI * 5 / (c1 - c0); const m = Math.hypot(t, 1); return [t / m, 1 / m, 0]; };
            for (let k = 0; k < kus; k++) {
              const q = [P(c0 + k * w, za + r + 30, bod(k)), P(c0 + (k + 1) * w, za + r + 30, bod(k + 1)), P(c0 + (k + 1) * w, zb - r, bod(k + 1)), P(c0 + k * w, zb - r, bod(k))];
              const nn = [nrm(k), nrm(k + 1), nrm(k + 1), nrm(k)];
              plochy.push({ w: q, nv: nn, fill: '#f1ede5', sourceFill: '#f1ede5', normal: [0, 1, 0], cull: false, kulisa: true, domova: true, mat3d: 'zaclona', edge: false });
            }
          }
        }
        /* Sklo: skutočne priehľadné, odraz podľa Fresnela. */
        quad([P(a + r, za + r, -ost + 6), P(b - r, za + r, -ost + 6), P(b - r, zb - r, -ost + 6), P(a + r, zb - r, -ost + 6)],
          'rgba(128,142,150,.5)', nF, 'sklo', { depthAvg: 1e9 });
        /* Široké posuvné okno má uprostred stĺpik krídla. */
        if (b - a > 2000) {
          const c = (a + b) / 2;
          quad([P(c - 45, za + r, -ost + 12), P(c + 45, za + r, -ost + 12), P(c + 45, zb - r, -ost + 12), P(c - 45, zb - r, -ost + 12)], RAM, nF, 'lak');
        }
      });

      /* Parapety pod oknami: tenká doska, čo vystúpi z fasády. */
      otvory.filter((q) => q[2] > 0).forEach(([a, b, za]) => {
        kvader(pridaj('#d6d3cc', 'omietka', true), [a - 40, yF, za - 45], [b + 40, yF + 70, za]);
      });

      if (auto) {
        /* Príjazd končí na hranici pozemku: tam je plot s vjazdom, za ním
           chodník, obrubník a ulica. Dlažba tak vedie odniekiaľ niekam
           a nie je len vydláždený štvorec pod autom. */
        /* Hranica pozemku (xH), chodník po xU, za ním ulica — smerom k −x. */
        const xH = dlazba[0], sirkaCh = 1600, xU = xH - sirkaCh, sirkaU = 6500;
        const ya = y0 - 30000, yb = y1 + 30000;
        quad([[xU, ya, 3], [xH, ya, 3], [xH, yb, 3], [xU, yb, 3]], '#8e8c87', [0, 0, 1], 'omietka', { cull: false });
        for (let yy = ya; yy < yb; yy += 2000) {
          quad([[xU, yy, 4], [xH, yy, 4], [xH, yy + 25, 4], [xU, yy + 25, 4]], '#6f6d69', [0, 0, 1], 'omietka', { cull: false });
        }
        quad([[xU - sirkaU, ya, 1], [xU, ya, 1], [xU, yb, 1], [xU - sirkaU, yb, 1]], '#3c3e40', [0, 0, 1], 'asfalt', { cull: false });
        kvader(pridaj('#a9a7a2', 'omietka'), [xU, ya, 0], [xU + 150, yb, 130]);
        /* Plot na hranici pozemku: antracitové stĺpiky a vodorovné lamely,
           s medzerou na vjazd. */
        const plotZ = 950, vjazd0 = dlazba[1] - 200, vjazd1 = dlazba[3] + 200;
        const pl = pridaj('#2f3437', 'lak');
        const plot = (ua, ub) => {
          if (ub - ua < 300) return;
          for (let yy = ua; yy <= ub + 1; yy += 2000) kvader(pl, [xH - 30, Math.min(yy, ub) - 30, 0], [xH + 30, Math.min(yy, ub) + 30, plotZ + 40]);
          for (let zz = 140; zz < plotZ; zz += 165) kvader(pl, [xH - 10, ua, zz], [xH + 10, ub, zz + 70]);
        };
        /* Plot len na strane domu — na voľnej strane by stál medzi kamerou
           a prístreškom. */
        plot(Math.min(yF, y0) - 9000, vjazd0);
        /* Biela prerušovaná čiara v strede ulice. */
        for (let yy = ya; yy < yb; yy += 6000) {
          quad([[xU - sirkaU / 2 - 60, yy, 6], [xU - sirkaU / 2 + 60, yy, 6], [xU - sirkaU / 2 + 60, yy + 3000, 6], [xU - sirkaU / 2 - 60, yy + 3000, 6]], '#e8e6e0', [0, 0, 1], 'omietka', { cull: false });
        }
        /* Kríky pri fasáde mimo príjazdu. */
        /* Zeleň je na strane záhrady (x1), dvor s príjazdom ostáva voľný. */
        ker(pridaj, u1 - 700, yF + 650, 560, 31);
        ker(pridaj, x1 + 1500, y1 + 1400, 520, 32, '#6c8a4f');
        stromZa(u1 + 4200, yF + 2600, 8400, 5);
        stromZa(x1 + 2500, yF - 5200, 7600, 13);
      } else {
        /* Záhon pri fasáde mimo dlažby a kvetináče pri vstupe na terasu. */
        const ker1 = Math.max(u0 + 700, x0 - 1000 - 1800), ker2 = Math.min(u1 - 700, x1 + 1000 + 1800);
        ker(pridaj, u0 + 900, yF + 650, 560, 31);
        if (ker1 - (u0 + 900) > 1200) ker(pridaj, (u0 + 900 + ker1) / 2, yF + 600, 470, 32, '#6c8a4f');
        ker(pridaj, u1 - 900, yF + 650, 600, 33);
        if ((u1 - 900) - ker2 > 1200) ker(pridaj, (u1 - 900 + ker2) / 2, yF + 600, 450, 34, '#6c8a4f');
        for (const xk of [x0 - 650, x1 + 650]) {
          valec(pridaj('#3a3e42', 'lak'), [xk, yF + 520], 210, 260, 0, 620, 16);
          teleso(pridaj('#2f4524', 'listie'), [xk, yF + 520, 1050], [290, 290, 370], { rows: 8, cols: 12, amp: 0.12, frek: 2.6, seed: Math.round(xk) });
          karty(pridaj('#9aa77f', 'karta'), [xk, yF + 520, 1050], [340, 340, 420], 46, 300, Math.round(Math.abs(xk)) % 997, { plocha: true });
        }
        stromZa(u1 + 4200, yF + 2200, 8200, 5);
        stromZa(u0 - 5200, yF - 3500, 9000, 9);
      }

      /* Atika rovnej strechy a bočné steny domu, aby bol dom telesom aj
         pri pohľade zboku. Zozadu sa nekreslí (pozri soltec-premium.js). */
      quad([P(u0, vyskaDomu, 0), P(u1, vyskaDomu, 0), P(u1, vyskaDomu + 260, 0), P(u0, vyskaDomu + 260, 0)], ATIKA, nF, 'lak');
      quad([P(u0, vyskaDomu + 260, 0), P(u1, vyskaDomu + 260, 0), P(u1, vyskaDomu + 260, -hlbka), P(u0, vyskaDomu + 260, -hlbka)], '#8a8d90', [0, 0, 1], 'omietka');
      quad([P(u0, 0, -hlbka), P(u0, 0, 0), P(u0, vyskaDomu + 260, 0), P(u0, vyskaDomu + 260, -hlbka)], OMIETKA, [-1, 0, 0], 'omietka');
      quad([P(u1, 0, 0), P(u1, 0, -hlbka), P(u1, vyskaDomu + 260, -hlbka), P(u1, vyskaDomu + 260, 0)], OMIETKA, [1, 0, 0], 'omietka');
      /* Zadná stena: dom je uzavreté teleso, aby pri obletení kamerou
         nemusel miznúť. Čo z neho zakrýva výrobok, rozplynie vykresľovač. */
      quad([P(u1, 0, -hlbka), P(u0, 0, -hlbka), P(u0, SOKEL_V, -hlbka), P(u1, SOKEL_V, -hlbka)], SOKEL, [0, -1, 0], 'omietka');
      quad([P(u1, SOKEL_V, -hlbka), P(u0, SOKEL_V, -hlbka), P(u0, vyskaDomu + 260, -hlbka), P(u1, vyskaDomu + 260, -hlbka)], OMIETKA, [0, -1, 0], 'omietka');
      for (let i = 0; i < nOkien; i++) {
        const c = u0 + (u1 - u0) * (i + 0.5) / nOkien;
        for (const [za, zb] of [[900, 2300], [zP, zP1]]) {
          quad([P(c + 650, za, -hlbka - 8), P(c - 650, za, -hlbka - 8), P(c - 650, zb, -hlbka - 8), P(c + 650, zb, -hlbka - 8)], RAM, [0, -1, 0], 'lak');
          quad([P(c + 580, za + 70, -hlbka - 14), P(c - 580, za + 70, -hlbka - 14), P(c - 580, zb - 70, -hlbka - 14), P(c + 580, zb - 70, -hlbka - 14)], SKLO, [0, -1, 0], 'okno');
        }
      }
    }

    if (S.plot) {
      /* Strihaný živý plot za stavbou: zaoblený kváder s nerovným
         povrchom, delený na úseky, aby sa šum neopakoval. Dá scéne pozadie
         a mierku a nič nezakryje. */
      /* Plot stojí za kružnicou obletu kamery, aby ním nikdy neprešla. */
      const yP = Math.min(y0 - 5200, cyS - (Rk + 2200)), h = 1750, d = 1000;
      const a = x0 - 10000, b = x1 + 10000;
      const useky = Math.max(3, Math.round((b - a) / 6000));
      for (let i = 0; i < useky; i++) {
        const ua = a + (b - a) * i / useky, ub = a + (b - a) * (i + 1) / useky;
        teleso(pridaj('#41592f', 'listie'), [(ua + ub) / 2, yP, 0],
          [(ub - ua) / 2 + 120, d / 2 - 60, h - 60], { e: 0.28, rows: 8, cols: 40, amp: 0.035, frek: 2.4, seed: 50 + i, zDole: 0 });
        /* Povrch plotu z kariet: predná stena a vrch, zadnú nikto nevidí. */
        const sirka = ub - ua;
        karty(pridaj('#8f9e72', 'karta'), [(ua + ub) / 2, yP, h / 2], [sirka / 2 + 60, d / 2, h / 2],
          Math.round(sirka / 1000 * 70), 620, 70 + i, {
            plocha: true,
            smer: (dd, hh) => {
              const t = hh(11);
              /* 70 % predná stena, 30 % vrch */
              if (t < 0.7) return [hh(12) * 2 - 1, 1, hh(13) * 2 - 1];
              return [hh(12) * 2 - 1, hh(13) * 2 - 1, 1];
            }
          });
      }
      stromZa(x0 - 6500, yP - 2600, 7800, 3);
      stromZa(x1 + 5200, yP - 3400, 9200, 7);
      stromZa((x0 + x1) / 2 + 1800, yP - 5200, 8400, 11);
      ker(pridaj, x0 - 2600, y1 + 1600, 650, 21);
      ker(pridaj, x0 - 3300, y1 + 900, 480, 22, '#6c8a4f');
      ker(pridaj, x1 + 2800, y0 - 1800, 720, 23);
    }

    /* Veľký trávnik pod celou scénou. Podklad konfigurátora siaha len
       ~12 m od stavby; stromy a plot stoja za kružnicou obletu kamery
       (20–30 m) a bez tejto plochy by viseli nad vzdialenou zemou oblohy.
       Leží 4 mm pod podkladom, takže tam, kde sa prekrývajú, vyhrá
       podklad konfigurátora. */
    {
      /* 400 m: okraj trávnika musí byť až pri horizonte, kde ho schová
         opar. Pri 40 m bol pri nízkom pohľade vidieť ako vodorovná čiara
         a za ňou pás pozadia namiesto trávy. */
      const R = Rk + 400000;
      /* V tej istej rovine ako podklad, s najnižším poradím hĺbky: kde sa
         prekrývajú, vyhrá podklad. Kým ležal 4 mm nižšie, bol na okraji
         podkladu v diaľke tmavý jednopixelový lem (schodík). */
      plochy.push({ w: [[cxS - R, cyS - R, 0], [cxS + R, cyS - R, 0], [cxS + R, cyS + R, 0], [cxS - R, cyS + R, 0]],
        fill: '#7a8a6a', sourceFill: '#7a8a6a', normal: [0, 0, 1], bg: true, kulisa: true, cull: false, edge: false, mat3d: 'dlazba',
        bias: -1e6 });
    }

    /* Trsy pri okraji dlažby a riedko v trávniku okolo terasy. */
    {
      const pTrs = pridaj('#93a874', 'karta');
      const [dx0, dy0, dx1, dy1] = dlazba;
      let n = 0;
      for (let i = 0; i < 1400 && n < (TRSY ? 700 : 0); i++) {
        const h = (k) => hash3(i, k, 77, 3);
        /* poloha: pás 0–4 m okolo dlažby, hustejšie pri obrubníku */
        const strana = Math.floor(h(1) * 4), t = h(2), d = 60 + Math.pow(h(3), 2.6) * 900;
        let x, y;
        if (strana === 0) { x = dx0 + (dx1 - dx0) * t; y = dy1 + d; }
        else if (strana === 1) { x = dx0 + (dx1 - dx0) * t; y = dy0 - d; }
        else if (strana === 2) { x = dx0 - d; y = dy0 + (dy1 - dy0) * t; }
        else { x = dx1 + d; y = dy0 + (dy1 - dy0) * t; }
        if (S.dom && y < (o.naStene ? y0 : y0 - 600) + 200) continue;
        trs(pTrs, x, y, 70 + h(4) * 90, i);
        n++;
      }
    }
    /* Steny, na ktoré je stavba pripevnená: v rohu, pri stene pozdĺž,
       medzi stenami. Rovina, rozsah aj výška sú tie isté ako v štúdiu,
       takže sa stavby dotýkajú presne tam, kde má byť pripevnená. Jednoduchá
       biela omietnutá stena so soklom a krycou doskou, 240 mm hrubá, smerom
       von od stavby. Zadnú stenu pri dome tvorí fasáda; bočná stena vedie
       od fasády. Na rozdiel od kulís vrhá tieň — stena pri pergole ho na
       dlažbu a na stavbu naozaj hádže. */
    const steny = Array.isArray(o.steny) ? o.steny : [];
    for (const st of steny) {
      const n = st.n || [0, 0, 0];
      if (S.dom && n[1] > 0.5) continue;
      const hr = 240, h = Math.max(2200, Number(st.vyska) || 3000);
      const pozdlzX = Math.abs(n[1]) > 0.5;
      let a = Number(st.a), b = Number(st.b);
      /* Bočná stena pri dome začína na fasáde. */
      if (S.dom && !pozdlzX) a = Math.min(a, yFas);
      const sg = pozdlzX ? n[1] : n[0];
      const box = (d0, d1, u0, u1, z0, z1, fill) => {
        /* uv nesie vnútornú normálu steny: shader podľa nej stenu plynulo
           rozplynie, keď kamera prejde za ňu (bez prestavby siete). */
        const push = (w, nv, normal) => plochy.push({ w, fill, sourceFill: fill, normal, cull: false, kulisa: false,
          stena: true, stenaSkry: true, uv: w.map(() => [n[0], n[1]]), domova: true, mat3d: 'omietka', edge: false });
        /* d0..d1 je hrúbka kolmo na stenu (od jej roviny von), u0..u1 dĺžka. */
        const vA = st.v - sg * d1, vB = st.v - sg * d0;
        const lo = Math.min(vA, vB), hi = Math.max(vA, vB);
        if (pozdlzX) kvader(push, [u0, lo, z0], [u1, hi, z1]);
        else kvader(push, [lo, u0, z0], [hi, u1, z1]);
      };
      box(0, hr, a, b, 0, h, OMIETKA);
      /* sokel o kúsok predsadený pred líce, ako na fasáde */
      if (SOKEL_V > 0) box(-12, hr + 12, a, b + 12, 0, Math.min(SOKEL_V, h), SOKEL);
      /* krycia doska koruny steny */
      box(-30, hr + 30, a, b + 30, h, h + 50, '#d6d3cc');
    }
    return { plochy, dlazba };
  }

  global.KvProstredie = { SCENY, nacitaj, kulisy };
})(window);
