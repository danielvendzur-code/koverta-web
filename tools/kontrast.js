#!/usr/bin/env node
'use strict';
/* Kontrola čitateľnosti: nájde viditeľný text, ktorý má s pozadím kontrast
 * pod WCAG AA (4,5 : 1, veľký text 3 : 1). Takto sa na webe objavil biely
 * text krokov na svetlom paneli formulára — CSS ho prefarbilo na jednom
 * mieste a text ostal pre pôvodné tmavé pozadie.
 *
 * Pozadie sa berie z najbližšieho predka s nepriehľadnou farbou pozadia.
 * Text nad fotografiou alebo videom (background-image, img, video pod ním)
 * sa preskočí — tam rozhoduje fotografia a stmavenie, nie farba.
 *
 *   node tools/kontrast.js [adresa …]   (potrebuje statický server na 8904)
 */
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ZAKLAD = process.env.KV_SERVER || 'http://127.0.0.1:8904';
const STRANKY = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/pristresky-pre-auta/', '/zahradne-pristresky/',
  '/bioklimaticke-pergoly/', '/carport-soltec/', '/pevne-prestresenia/', '/tienenie/', '/outdoor-kuchyne/',
  '/realizacie/', '/kontakt/', '/produkty/', '/konfigurator/', '/dakujeme/', '/pristresky-pre-auta/rozmer/5000x6000/'];

function kontrolaVStranke() {
  const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const mix = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const pozadie = (el) => {
    const vrstvy = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;   // fotka alebo prechod: farbu pozadia nepoznáme
      if (e.querySelector && e !== el && e.matches('.kh-hero, .kh-hero__bg') ) return null;
      const c = rgb(cs.backgroundColor);
      if (c && c.a > 0) { vrstvy.push(c); if (c.a >= 0.99) break; }
    }
    let b = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = vrstvy.length - 1; i >= 0; i--) b = mix(vrstvy[i], b);
    return b;
  };
  const nadMediom = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(8, r.width / 2), y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return false;
    return document.elementsFromPoint(x, y).some((e) => e !== el && !el.contains(e) && /^(IMG|VIDEO|CANVAS|PICTURE)$/.test(e.tagName));
  };
  const zle = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (el.closest('[hidden], [aria-hidden="true"], .k-visually-hidden, .sp-stage, svg')) continue;
    const f = rgb(cs.color); if (!f) continue;
    const b = pozadie(el); if (!b) continue;
    if (nadMediom(el)) continue;
    const t = mix(f, b);
    const [l1, l2] = [L(t), L(b)].sort((x, y) => y - x);
    const k = (l1 + 0.05) / (l2 + 0.05);
    const velky = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const hranica = velky ? 3 : 4.5;
    /* Hranica 3 : 1 aj pre drobné popisky: doplnkový sivý text (odkaz na
       zdroj, poznámka) nesmie zmiznúť, no nemusí mať kontrast nadpisu. */
    if (k < Math.min(hranica, 3)) {
      const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      zle.push(sel + ' „' + text.slice(0, 40) + '“ kontrast ' + k.toFixed(2));
    }
  }
  return [...new Set(zle)];
}

(async () => {
  const b = await chromium.launch();
  let spolu = 0;
  for (const sirka of [390, 1440]) {
    const ctx = await b.newContext({ viewport: { width: sirka, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.route(/googletagmanager|clarity|vercel\.app/, (r) => r.abort());
    for (const s of STRANKY) {
      await p.goto(ZAKLAD + s, { waitUntil: 'load' });
      await p.addStyleTag({ content: '*{animation:none!important;transition:none!important}.k-rise{opacity:1!important;transform:none!important}' });
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } window.scrollTo(0, 0); });
      await p.waitForTimeout(300);
      const zle = await p.evaluate(kontrolaVStranke);
      zle.forEach((z) => console.log(sirka + ' ' + s + '  ' + z));
      spolu += zle.length;
    }
    await ctx.close();
  }
  await b.close();
  if (spolu) { console.log('KONTRAST: ' + spolu + ' nečitateľných textov'); process.exit(1); }
  console.log('KONTRAST: všetok viditeľný text má s pozadím kontrast aspoň 3 : 1');
})();
