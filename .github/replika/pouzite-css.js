// Strop pre menší štýl: zo štýlu témy nechá len pravidlá, ktoré na úvode
// po načítaní (a 3 s behu skriptov) zasiahnu aspoň jeden prvok. Pseudotriedy
// (:hover, ::before…) sa pri skúške odstránia, takže ich pravidlá ostanú.
// Stavy, ktoré pridá až klik (otvorené menu, okno dopytu), tu vypadnú —
// preto je to len meranie stropu, nie súbor na nasadenie.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [adresa, vystup] = process.argv.slice(2);

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 412, height: 823 }]) {
    const p = await b.newPage({ viewport: vp });
    await p.goto(adresa, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    const vysledok = await p.evaluate(() => {
      const list = [...document.styleSheets].find((s) => s.href && /koverta-2026\.css/.test(s.href));
      if (!list) return { chyba: 'štýl nenájdený' };
      let spolu = 0, nechane = 0;
      const test = (sel) => sel.split(',').some((cast) => {
        const cista = cast.replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').trim() || '*';
        try { return !!document.querySelector(cista); } catch (e) { return true; }
      });
      const prejdi = (rules) => {
        let von = '';
        for (const r of rules) {
          if (r instanceof CSSStyleRule) { spolu++; if (test(r.selectorText)) { nechane++; von += r.cssText; } }
          else if (r instanceof CSSMediaRule) { const vnutro = prejdi(r.cssRules); if (vnutro) von += '@media ' + r.conditionText + '{' + vnutro + '}'; }
          else if (r instanceof CSSSupportsRule) { const vnutro = prejdi(r.cssRules); if (vnutro) von += '@supports ' + r.conditionText + '{' + vnutro + '}'; }
          else von += r.cssText;
        }
        return von;
      };
      const css = prejdi(list.cssRules);
      return { css, spolu, nechane };
    });
    if (vysledok.chyba) throw new Error(vysledok.chyba);
    fs.writeFileSync(vystup, vysledok.css);
    console.log('pravidiel', vysledok.spolu, 'nechaných', vysledok.nechane, 'bajtov', Buffer.byteLength(vysledok.css));
  }
  await b.close();
})();
