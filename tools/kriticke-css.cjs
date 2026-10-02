/* Pravidlá prvej obrazovky zo skutočného DOM pri šiestich veľkostiach okna.
 * Zachováva poradie kaskády, skryté menu aj všetky fonty a animácie.
 * npm install --no-save playwright@1.58.2; CHROME_PATH=/cesta/chrome
 * Plný štýl sa vždy načíta; tento výber len odstráni čakanie pri prvom paint.
 */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const { STRANKY } = require('./css-stranky');
const { zmensiCss } = require('./zmensi-css');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8089'], { cwd: root, stdio: 'ignore' });
  let browser;
  try {
    await new Promise(r => setTimeout(r, 400));
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
    for (const [name, file] of Object.entries(STRANKY)) {
      const ids = new Set(); let first;
      for (const [width, height] of [[360,640],[390,844],[768,1024],[1024,768],[1366,940],[1920,1080]]) {
        const p = await browser.newPage({ viewport: { width, height } });
        await p.route('https://**/*', r => r.abort());
        await p.goto('http://127.0.0.1:8089/' + file, { waitUntil: 'load' });
        await p.waitForFunction(() => document.querySelector('[data-k-root]')?.dataset.kReady === 'true');
        await p.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
        const used = await p.evaluate(() => {
          const sheet = [...document.styleSheets].find(s => s.href && /koverta-2026[^/]*\.css/.test(s.href));
          const main = document.querySelector('main');
          const lower = [...main.children].slice(1).concat([...document.querySelectorAll('footer')]);
          const top = new Set([...document.querySelectorAll('html, html *')].filter(e => !lower.some(n => n.contains(e))));
          for (const e of document.querySelectorAll('body *')) {
            const r = e.getBoundingClientRect();
            if (r.width && r.height && r.top < innerHeight && r.bottom > 0) top.add(e);
          }
          // Pseudostavy odstránime konzervatívne: menu potrebuje aj hover/focus.
          const matches = selector => selector.split(',').some(s => {
            const clean = s.replace(/\.(?:is-|je-|ma-)[\w-]+/g, '').replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, '').trim() || '*';
            try { return [...document.querySelectorAll(clean)].some(e => top.has(e)); }
            catch { return true; }
          });
          let id = 0; const result = [];
          const walk = rules => { for (const r of rules) {
            const current = id++;
            if (r instanceof CSSStyleRule) { if (matches(r.selectorText)) result.push(current); }
            else if (r instanceof CSSMediaRule || r instanceof CSSSupportsRule) walk(r.cssRules);
          }};
          walk(sheet.cssRules); return result;
        });
        used.forEach(id => ids.add(id));
        if (!first) first = p; else await p.close();
      }
      const css = await first.evaluate(selected => {
        const ids = new Set(selected);
        const sheet = [...document.styleSheets].find(s => s.href && /koverta-2026[^/]*\.css/.test(s.href));
        let id = 0;
        const walk = rules => { let output = ''; for (const r of rules) {
          const current = id++;
          if (r instanceof CSSStyleRule) { if (ids.has(current)) output += r.cssText; }
          else if (r instanceof CSSMediaRule || r instanceof CSSSupportsRule) {
            const inner = walk(r.cssRules);
            if (inner) output += (r instanceof CSSMediaRule ? '@media ' : '@supports ') + r.conditionText + '{' + inner + '}';
          } else output += r.cssText;
        } return output; };
        return walk(sheet.cssRules);
      }, [...ids]);
      const small = zmensiCss(css);
      fs.writeFileSync(path.join(root, 'assets', 'koverta-kriticky-' + name + '.css'), small + '\n');
      if (process.argv.includes('--vloz')) {
        const filename = path.join(root, file);
        let html = fs.readFileSync(filename, 'utf8').replace(/<!-- KOVERTA-KRITICKY-ZACIATOK -->[\s\S]*?<!-- KOVERTA-KRITICKY-KONIEC -->\n?/g, '');
        const link = html.match(/<link[^>]+href="([^"]*assets\/koverta-2026-[a-z-]+\.css[^\"]*)"[^>]*>/);
        if (!link) throw new Error(file + ': chýba štýl');
        const original = link[0].replace(/ media="print" onload="[^"]*"/, '');
        const base = link[1].split('koverta-2026-')[0];
        const inline = small.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (tag,q,u) => /^(https?:|data:|\/\/|\/|#)/.test(u) ? tag : 'url(' + base + u + ')');
        html = html.replace(link[0], '<!-- KOVERTA-KRITICKY-ZACIATOK -->\n<style data-k-kriticky="' + name + '">' + inline + '</style>\n<!-- KOVERTA-KRITICKY-KONIEC -->\n' + original.replace('<link ', '<link media="print" onload="this.media=\'all\';var s=document.querySelector(\'style[data-k-kriticky]\');if(s)s.remove()" '));
        // Noscript je súčasťou bloku, aby ďalšie zostavenie nevytvorilo duplikát.
        html = html.replace('<!-- KOVERTA-KRITICKY-KONIEC -->', '<noscript>' + original + '</noscript>\n<!-- KOVERTA-KRITICKY-KONIEC -->');
        fs.writeFileSync(filename, html);
      }
      console.log(name + ': kritický štýl ' + Buffer.byteLength(zmensiCss(css)) + ' B');
      await first.close();
    }
  } finally { if (browser) await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
