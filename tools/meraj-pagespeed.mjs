#!/usr/bin/env node
/* Lighthouse: tri nezávislé behy každého zariadenia, výsledkom je medián.
 * Nenasadzuje web ani neodosiela formuláre. Výstupy patria mimo repozitára.
 * npm install --no-save lighthouse@12.8.2
 * CHROME_PATH=/cesta/chrome node tools/meraj-pagespeed.mjs --zaklad=http://localhost:8080 --vystup=/tmp/lh
 * --nove meria požadované /pages/nove-…; --obchod skutočné canonical adresy.
 * Behy sú zámerne postupné, aby si navzájom nebrali procesor.
 */
import fs from 'node:fs';
import path from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import desktop from 'lighthouse/core/config/desktop-config.js';
const volby = Object.fromEntries(process.argv.slice(2).map((p) => p.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)).map(([kluc, hodnota]) => [kluc, hodnota ?? true]));
const zaklad = (volby.zaklad || 'https://koverta.sk').replace(/\/$/, '');
const vystup = path.resolve(volby.vystup || '/tmp/koverta-lighthouse-' + Date.now());
const pocet = Number(volby.behy || 3);
if (!Number.isInteger(pocet) || pocet < 3) throw new Error('Medián vyžaduje aspoň tri behy.');
const zariadenia = volby.zariadenie ? [volby.zariadenie] : ['mobil', 'desktop'];
if (zariadenia.some((z) => !['mobil', 'desktop'].includes(z))) throw new Error('Zariadenie musí byť mobil alebo desktop.');
const mapa = JSON.parse(fs.readFileSync(new URL('./adresy-obchodu.json', import.meta.url), 'utf8')).stranky;
const vsetkyCesty = ['', 'pristresky-pre-auta', 'zahradne-pristresky', 'bioklimaticke-pergoly', 'realizacie', 'kontakt'];
const cesty = volby.cesta !== undefined ? [volby.cesta === 'uvod' ? '' : volby.cesta] : vsetkyCesty;
if (cesty.some((c) => !vsetkyCesty.includes(c))) throw new Error('Neznáma stránka.');
const median = (hodnoty) => {
  const v = [...hodnoty].sort((a, b) => a - b), i = Math.floor(v.length / 2);
  return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
};
fs.mkdirSync(vystup, { recursive: true });
const suhrn = [];
for (const cesta of cesty) for (const druh of zariadenia) {
  const ciel = volby.nove !== undefined ? (cesta ? '/pages/nove-' + cesta : '/')
    : volby.obchod !== undefined ? mapa[cesta].url || (mapa[cesta].typ === 'kolekcia' ? '/collections/' : '/pages/') + mapa[cesta].handle
    : '/' + (cesta ? cesta + '/' : '');
  const behy = [];
  const opakovane = new Set();
  for (let i = 1; i <= pocet; i++) {
    let chrome;
    try {
      chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] });
      const { lhr } = await lighthouse(zaklad + ciel, { port: chrome.port, output: 'json', logLevel: 'error' }, druh === 'desktop' ? desktop : undefined);
      if (lhr.runtimeError) throw new Error(lhr.runtimeError.message);
      const subor = `${cesta || 'uvod'}-${druh}-${i}.json`;
      fs.writeFileSync(path.join(vystup, subor), JSON.stringify(lhr));
      const a = lhr.audits;
      const beh = { subor, url: lhr.finalDisplayedUrl, verzia: lhr.lighthouseVersion,
        skore: Math.round(lhr.categories.performance.score * 100),
        lcp: a['largest-contentful-paint'].numericValue, cls: a['cumulative-layout-shift'].numericValue,
        tbt: a['total-blocking-time'].numericValue,
        kategorie: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
        lcpPrvok: a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node,
        diagnostika: Object.fromEntries(['render-blocking-insight', 'unused-css-rules', 'unused-javascript', 'image-delivery-insight', 'long-tasks', 'layout-shifts', 'third-party-summary', 'lcp-breakdown-insight'].map((k) => [k, a[k]?.details])),
        benchmark: lhr.environment.benchmarkIndex,
        neuspesneZdroje: a['network-requests'].details.items.filter((x) => x.statusCode < 0 || x.statusCode >= 400).map((x) => ({ url: x.url, stav: x.statusCode }))
      };
      behy.push(beh);
      console.log(JSON.stringify({ cesta: cesta || '/', druh, beh: i, skore: beh.skore, lcp: Math.round(beh.lcp), cls: beh.cls, tbt: Math.round(beh.tbt) }));
    } catch (e) {
      // Opakuje sa iba pád spojenia s Chrome, nikdy úspešný nameraný beh.
      if (e.code === 'ECONNREFUSED' && !opakovane.has(i)) {
        opakovane.add(i);
        console.warn('Chrome prerušil spojenie, nový čistý beh ' + i);
        i--;
      } else throw e;
    } finally { if (chrome) await chrome.kill(); }
  }
  suhrn.push({ cesta: cesta || '/', druh, behy, median: Object.fromEntries(['skore', 'lcp', 'cls', 'tbt'].map((k) => [k, median(behy.map((b) => b[k]))])) });
  fs.writeFileSync(path.join(vystup, 'median.json'), JSON.stringify(suhrn, null, 2));
}
console.log('Výsledky: ' + vystup);
