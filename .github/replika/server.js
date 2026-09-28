// Replika: "/" je upravené HTML koverta.sk, /lokalne/* súbory z tejto vetvy,
// všetko ostatné sa preposiela naživo na https://koverta.sk (tá istá cesta).
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [html, port] = [process.argv[2], +process.argv[3]];
const KOREN = path.resolve(__dirname, '..', '..');
const PAMAT = new Map();
const TYPY = { '.css': 'text/css', '.js': 'application/javascript', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/') {
    let b = fs.readFileSync(html);
    const h = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
    if (/gzip/.test(q.headers['accept-encoding'] || '')) { h['content-encoding'] = 'gzip'; b = zlib.gzipSync(b); }
    s.writeHead(200, h); return s.end(b);
  }
  if (u.pathname.startsWith('/lokalne/')) {
    const meno = path.basename(u.pathname);
    const kde = [process.env.LOKALNE_DIR && path.join(process.env.LOKALNE_DIR, meno), path.join(KOREN, 'shopify-tema', 'assets', meno), path.join(KOREN, 'assets', meno)].filter(Boolean).find(fs.existsSync);
    if (!kde) { s.writeHead(404); return s.end(); }
    let b = fs.readFileSync(kde);
    const t = TYPY[path.extname(meno)] || 'application/octet-stream';
    const h = { 'content-type': t, 'cache-control': 'max-age=31536000', 'access-control-allow-origin': '*' };
    if (/css|javascript|svg/.test(t) && /gzip/.test(q.headers['accept-encoding'] || '')) { h['content-encoding'] = 'gzip'; b = zlib.gzipSync(b); }
    s.writeHead(200, h); return s.end(b);
  }
  // Statické súbory obchodu (/cdn/...) sa po prvom stiahnutí držia v pamäti,
  // aby meranie nekolísalo podľa toho, ako rýchlo práve odpovie koverta.sk.
  const kluc = q.method === 'GET' && u.pathname.startsWith('/cdn/') ? q.url + '|' + (q.headers['accept-encoding'] || '') : null;
  if (kluc && PAMAT.has(kluc)) { const z = PAMAT.get(kluc); s.writeHead(z.st, z.h); return s.end(z.b); }
  const hlavicky = { ...q.headers, host: 'koverta.sk' };
  delete hlavicky.origin; delete hlavicky.referer;
  const p = https.request({ host: 'koverta.sk', path: q.url, method: q.method, headers: hlavicky }, (r) => {
    const h = { ...r.headers };
    delete h['content-security-policy']; delete h['strict-transport-security'];
    if (h.location) h.location = h.location.replace(/^https:\/\/koverta\.sk/, '');
    s.writeHead(r.statusCode, h);
    if (kluc && r.statusCode === 200) { const k = []; r.on('data', (d) => { k.push(d); s.write(d); }); r.on('end', () => { PAMAT.set(kluc, { st: 200, h, b: Buffer.concat(k) }); s.end(); }); }
    else r.pipe(s);
  });
  p.on('error', () => { try { s.writeHead(502); s.end(); } catch (e) {} });
  q.pipe(p);
}).listen(port);
