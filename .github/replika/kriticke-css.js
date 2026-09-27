// Kritický štýl: pravidlá, ktoré potrebuje hlavička a úvodná obrazovka.
// Pravidlo ostane, ak zasiahne prvok mimo nižších sekcií a pätičky (aj
// skrytý — zatvorené menu musí ostať zatvorené), alebo prvok, ktorý je
// v niektorej šírke okna v prvej obrazovke.
// @font-face, :root, @keyframes a pod. ostávajú vždy.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [adresa, vystup] = process.argv.slice(2);

(async () => {
  const b = await chromium.launch();
  const vybrane = new Set();
  let css = null;
  for (const vp of [{ width: 360, height: 640 }, { width: 412, height: 823 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1350, height: 940 }, { width: 1920, height: 1080 }]) {
    const p = await b.newPage({ viewport: vp });
    await p.goto(adresa, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const list = [...document.styleSheets].find((s) => s.href && /koverta-2026[^/]*\.css/.test(s.href));
      if (!list) return { chyba: 'štýl nenájdený' };
      // Potrebné hneď je všetko okrem nižších sekcií stránky a pätičky:
      // hlavička, úvod, prilepený pás, okná a menu (aj skryté — musia ostať
      // skryté a nesmú posunúť úvod).
      const main = document.querySelector('main');
      const neskor = [...(main ? main.children : [])].slice(1).concat([...document.querySelectorAll('footer')]);
      const hore = new Set();
      document.querySelectorAll('html, html *').forEach((e) => { if (!neskor.some((n) => n.contains(e))) hore.add(e); });
      document.querySelectorAll('body *').forEach((e) => { const q = e.getBoundingClientRect(); if (q.width && q.height && q.top < innerHeight && q.bottom > 0) hore.add(e); });
      const zasiahne = (sel) => sel.split(',').some((cast) => {
        const cista = cast.replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').trim() || '*';
        try { for (const e of document.querySelectorAll(cista)) if (hore.has(e)) return true; return false; } catch (e) { return true; }
      });
      const ids = [];
      let i = 0;
      const prejdi = (rules) => { for (const r of rules) { const id = i++; if (r instanceof CSSStyleRule) { if (zasiahne(r.selectorText)) ids.push(id); } else if (r instanceof CSSMediaRule || r instanceof CSSSupportsRule) prejdi(r.cssRules); } };
      prejdi(list.cssRules);
      return { ids, href: list.href };
    });
    if (r.chyba) throw new Error(r.chyba);
    r.ids.forEach((x) => vybrane.add(x));
    if (!css) css = p;
  }
  // Zloženie výstupu v poradí pôvodného štýlu (z prvej stránky).
  const vysl = await css.evaluate((ids) => {
    const set = new Set(ids);
    const list = [...document.styleSheets].find((s) => s.href && /koverta-2026[^/]*\.css/.test(s.href));
    let i = 0, spolu = 0, nechane = 0;
    const prejdi = (rules) => {
      let von = '';
      for (const r of rules) {
        const id = i++;
        if (r instanceof CSSStyleRule) { spolu++; if (set.has(id)) { nechane++; von += r.cssText; } }
        else if (r instanceof CSSMediaRule) { const v = prejdi(r.cssRules); if (v) von += '@media ' + r.conditionText + '{' + v + '}'; }
        else if (r instanceof CSSSupportsRule) { const v = prejdi(r.cssRules); if (v) von += '@supports ' + r.conditionText + '{' + v + '}'; }
        else von += r.cssText;
      }
      return von;
    };
    // url() v štýle je relatívna k súboru štýlu; vložený do stránky by
    // ukazoval inam (písmo by sa nenačítalo), preto sa urobí absolútnou.
    const abs = prejdi(list.cssRules).replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => /^(data:|https?:|\/\/)/.test(u) ? m : 'url("' + new URL(u, list.href).href + '")');
    return { css: abs, spolu, nechane };
  }, [...vybrane]);
  fs.writeFileSync(vystup, vysl.css);
  console.log('kritický štýl: pravidiel', vysl.spolu, 'nechaných', vysl.nechane, 'bajtov', Buffer.byteLength(vysl.css));
  await b.close();
})();
