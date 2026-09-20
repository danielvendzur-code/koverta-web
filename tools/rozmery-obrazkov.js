#!/usr/bin/env node
/* Rozmery obrázkov v značkovaní musia sedieť so súbormi.
 *
 * `width` a `height` na `<img>` nie sú ozdoba: prehliadač si z nich ešte pred
 * stiahnutím súboru vyhradí miesto. Keď nesedí pomer strán, vyhradí miesto
 * nesprávnej výšky a po dotiahnutí obrázka stránka poskočí — najviac to vidno
 * na hlavičke, ktorá je prvá a najväčšia. Šírkové popisy v `srcset`
 * a `imagesrcset` rozhodujú o tom, ktorý súbor sa vôbec stiahne: keď je
 * v popise 2400w a súbor má 1600 px, prehliadač si vyberie zbytočne veľký
 * súbor a ešte ho roztiahne. `og:image:width` a `og:image:height` čítajú
 * sociálne siete, keď skladajú náhľad zdieľaného odkazu.
 *
 * Všetky štyri sa dajú odvodiť zo súboru, takže sa neudržiavajú ručne:
 *
 *   node tools/rozmery-obrazkov.js          skontroluje a vypíše nesúlad
 *   node tools/rozmery-obrazkov.js --oprav  prepíše hodnoty podľa súborov
 *
 * Číta sa len hlavička súboru, nie celý obrázok — PNG, JPEG, WebP a GIF.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.resolve(__dirname, '..');
const OPRAV = process.argv.includes('--oprav');
const PRESKOC = new Set(['node_modules', '.git', 'coordination', 'qa-artifacts', 'archiv-expivi']);

function html(adresar, zoznam = []) {
  for (const p of fs.readdirSync(adresar, { withFileTypes: true })) {
    if (PRESKOC.has(p.name)) continue;
    const cesta = path.join(adresar, p.name);
    if (p.isDirectory()) html(cesta, zoznam);
    else if (p.name.endsWith('.html')) zoznam.push(cesta);
  }
  return zoznam;
}

/* Rozmer z hlavičky súboru. Vracia null, keď formát nepoznáme. */
function rozmerSuboru(subor) {
  const b = fs.readFileSync(subor);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {          // PNG
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {  // GIF
    return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const druh = b.toString('ascii', 12, 16);
    if (druh === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (druh === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (druh === 'VP8L') {
      const n = b.readUInt32LE(21);
      return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {              // JPEG
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const znacka = b[i + 1];
      if (znacka === 0xd8 || znacka === 0x01 || (znacka >= 0xd0 && znacka <= 0xd7)) { i += 2; continue; }
      const dlzka = b.readUInt16BE(i + 2);
      /* SOF0–SOF15 okrem DHT (C4), DNL (C8) a DAC (CC) nesú rozmer. */
      if (znacka >= 0xc0 && znacka <= 0xcf && znacka !== 0xc4 && znacka !== 0xc8 && znacka !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + dlzka;
    }
  }
  return null;
}

const pamat = new Map();
function rozmer(subor) {
  if (!pamat.has(subor)) {
    let r = null;
    try { r = rozmerSuboru(subor); } catch (e) { r = null; }
    pamat.set(subor, r);
  }
  return pamat.get(subor);
}

/* Adresa v značkovaní na súbor na disku. Cudzie a vložené adresy vracajú null. */
function naDisk(stranka, adresa) {
  if (!adresa || /^(?:[a-z]+:)?\/\//i.test(adresa) || adresa.startsWith('data:')) return null;
  const bezOtazky = adresa.split('?')[0].split('#')[0];
  if (!bezOtazky) return null;
  const cesta = bezOtazky.startsWith('/')
    ? path.join(KOREN, bezOtazky)
    : path.resolve(path.dirname(stranka), bezOtazky);
  return fs.existsSync(cesta) ? cesta : null;
}

/* Šírkové popisy v zozname `srcset`/`imagesrcset`. Hustotné (`2x`) sa nechávajú. */
function popisy(stranka, hodnota) {
  let zmenene = false;
  const kusy = hodnota.split(',').map(kus => {
    const t = kus.trim();
    if (!t) return kus;
    const m = t.match(/^(\S+)\s+(\d+)w$/);
    if (!m) return kus;
    const subor = naDisk(stranka, m[1]);
    const r = subor && rozmer(subor);
    if (!r || r.w === Number(m[2])) return kus;
    zmenene = true;
    return ' ' + m[1] + ' ' + r.w + 'w';
  });
  return zmenene ? kusy.join(',').trim() : null;
}

const nalezy = [];
let opravenych = 0;


for (const stranka of html(KOREN)) {
  const povodne = fs.readFileSync(stranka, 'utf8');
  let text = povodne;
  const zapis = (co) => nalezy.push({ stranka, ...co });

  /* 1 · width/height na <img> */
  text = text.replace(/<img\b[^>]*>/g, (znacka) => {
    /* Obrázky v mega-menu nemajú `src`, ale `data-k-menu-src` — skript ich
       doplní až pri otvorení ponuky. Rozmer si však nesú rovnako a rovnako
       podľa neho prehliadač vyhradzuje miesto, takže platí to isté. */
    const src = znacka.match(/\bsrc="([^"]+)"/) || znacka.match(/\bdata-k-menu-src="([^"]+)"/);
    const w = znacka.match(/\bwidth="(\d+)"/);
    const h = znacka.match(/\bheight="(\d+)"/);
    if (!src || !w || !h) return znacka;
    const subor = naDisk(stranka, src[1]);
    const r = subor && rozmer(subor);
    if (!r || (Number(w[1]) === r.w && Number(h[1]) === r.h)) return znacka;
    /* Presné čísla sa nevyžadujú, stačí pomer strán: obrázok sa smie
       uvádzať v inej mierke, len nesmie klamať o tvare. */
    if (Math.abs(Number(w[1]) / Number(h[1]) - r.w / r.h) < 0.01) return znacka;
    zapis({ co: path.basename(src[1]), uvadza: w[1] + '×' + h[1], ma: r.w + '×' + r.h });
    return znacka.replace(/\bwidth="\d+"/, 'width="' + r.w + '"').replace(/\bheight="\d+"/, 'height="' + r.h + '"');
  });

  /* 2 · šírkové popisy v srcset a imagesrcset */
  text = text.replace(/\b(imagesrcset|srcset)="([^"]*)"/g, (cele, meno, hodnota) => {
    const nove = popisy(stranka, hodnota);
    if (!nove) return cele;
    zapis({ co: meno, uvadza: 'iné šírky', ma: 'podľa súborov' });
    return meno + '="' + nove + '"';
  });

  /* 3 · og:image:width a og:image:height */
  const obrazok = text.match(/<meta property="og:image" content="([^"]+)"/);
  if (obrazok) {
    const adresa = obrazok[1].replace(/^https?:\/\/[^/]+/, '');
    const subor = naDisk(stranka, adresa.startsWith('/') ? adresa : '/' + adresa);
    const r = subor && rozmer(subor);
    if (r) {
      for (const [meno, hodnota] of [['width', r.w], ['height', r.h]]) {
        const vzor = new RegExp('(<meta property="og:image:' + meno + '" content=")(\\d+)(")');
        const m = text.match(vzor);
        if (m && Number(m[2]) !== hodnota) {
          zapis({ co: 'og:image:' + meno, uvadza: m[2], ma: String(hodnota) });
          text = text.replace(vzor, '$1' + hodnota + '$3');
        }
      }
    }
  }

  if (OPRAV && text !== povodne) { fs.writeFileSync(stranka, text); opravenych++; }
}

if (OPRAV) {
  console.log('Prepísaných stránok: ' + opravenych + ', hodnôt: ' + nalezy.length);
  process.exit(0);
}

if (!nalezy.length) {
  console.log('Rozmery obrázkov v značkovaní sedia so súbormi.');
  process.exit(0);
}

const podla = new Map();
for (const n of nalezy) {
  const kluc = n.co + ' — uvádza ' + n.uvadza + ', má ' + n.ma;
  podla.set(kluc, (podla.get(kluc) || 0) + 1);
}
console.error('Rozmer v značkovaní nesedí so súborom. Prehliadač si vyhradí miesto');
console.error('nesprávnej výšky a stránka po dotiahnutí obrázka poskočí.\n');
for (const [kluc, pocet] of [...podla].sort()) console.error('  ' + kluc + '   (' + pocet + '× )');
console.error('\nSpravte to príkazom: node tools/rozmery-obrazkov.js --oprav');
process.exit(1);
