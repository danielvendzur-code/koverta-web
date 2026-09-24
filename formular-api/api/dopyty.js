import crypto from 'node:crypto';
import { get, list } from '@vercel/blob';

function escapeHtml(v) {
  return String(v || '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[z]));
}

export function autorizovany(req) {
  const heslo = process.env.LEADS_ADMIN_PASSWORD || '';
  const hlavicka = String(req.headers.authorization || '');
  if (!heslo || !hlavicka.startsWith('Basic ')) return false;
  let zadane = '';
  try { zadane = Buffer.from(hlavicka.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':'); }
  catch (_) { return false; }
  const a = Buffer.from(zadane), b = Buffer.from(heslo);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Zlé heslo: najviac 10 pokusov za 15 minút z jednej adresy. */
const POKUSY = new Map();
export function zablokovany(req) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const teraz = Date.now(), z = POKUSY.get(ip);
  return Boolean(z && teraz - z.od < 15 * 60 * 1000 && z.pocet >= 10);
}
export function zlyPokus(req) {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const teraz = Date.now();
  const z = POKUSY.get(ip) && teraz - POKUSY.get(ip).od < 15 * 60 * 1000 ? POKUSY.get(ip) : { od: teraz, pocet: 0 };
  z.pocet += 1; POKUSY.set(ip, z);
}

export function vyziadajPrihlasenie(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Koverta dopyty", charset="UTF-8"');
  return res.status(401).send('Prihlásenie je potrebné.');
}

async function nacitajDopyty() {
  const { blobs } = await list({ prefix: 'dopyty/', limit: 1000 });
  const jsony = blobs.filter((b) => b.pathname.endsWith('/dopyt.json'))
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  const vysledky = [];
  for (const blob of jsony.slice(0, 500)) {
    /* `get` bez volieb v @vercel/blob 2.x vyhodí „missing options" — zoznam
       sa preto nikdy nenačítal. Archív je súkromný. */
    const subor = await get(blob.url, { access: 'private' });
    if (!subor || !subor.stream) continue;
    vysledky.push(await new Response(subor.stream).json());
  }
  return vysledky;
}

function csv(dopyty) {
  const hlavicka = ['Prijaté','Meno','Telefón','E-mail','Miesto','Typ','Správa','Stav e-mailu','Stránka','IP odtlačok','Origin','Prehliadač'];
  /* Bunka začínajúca =, +, - alebo @ by sa v Exceli spustila ako vzorec. */
  const bunka = (v) => `"${String(v || '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  return '\ufeff' + [hlavicka, ...dopyty.map((d) => [d.prijateAt,d.meno,d.telefon,d.email,d.miesto,d.typ,d.sprava,d.stavEmailu,d.stranka,d.zdroj?.ip,d.zdroj?.origin,d.zdroj?.prehliadac])]
    .map((r) => r.map(bunka).join(';')).join('\r\n');
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https://cdn.jsdelivr.net; style-src 'unsafe-inline'; frame-ancestors 'none'");
  if (zablokovany(req)) return res.status(429).send('Príliš veľa pokusov. Skúste o 15 minút.');
  if (!autorizovany(req)) {
    if (req.headers.authorization) zlyPokus(req);
    return vyziadajPrihlasenie(res);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).send('Archív nie je nastavený.');
  const dopyty = await nacitajDopyty();
  if (String(req.query?.format || '') === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="koverta-dopyty.csv"');
    return res.status(200).send(csv(dopyty));
  }
  const neodoslane = dopyty.filter((d) => !/^odoslaný/.test(String(d.stavEmailu || ''))).length;
  const riadky = dopyty.map((d) => `<tr><td>${escapeHtml(new Date(d.prijateAt).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' }))}</td><td><strong>${escapeHtml(d.meno)}</strong><br><small>${escapeHtml(d.typ)}</small></td><td><a href="tel:${escapeHtml(d.telefon)}">${escapeHtml(d.telefon)}</a><br><a href="mailto:${escapeHtml(d.email)}">${escapeHtml(d.email)}</a></td><td>${escapeHtml(d.miesto)}</td><td class="sprava">${escapeHtml(d.sprava)}</td><td>${escapeHtml(d.stavEmailu)}<br><small>${(d.prilohy || []).length} príloh</small>${d.zdroj ? `<br><small title="${escapeHtml(d.zdroj.prehliadac)}">IP ${escapeHtml(d.zdroj.ip)} · ${escapeHtml(d.zdroj.origin)}</small>` : ''}</td></tr>`).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(`<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Koverta dopyty</title><style>body{margin:0;background:#f6f5f2;color:#12171a;font:15px Arial,sans-serif}header{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px 4vw;background:#12171a;color:#fff}header b{letter-spacing:.08em}header b.znacka{display:flex;align-items:center;gap:12px}header b.znacka img{display:block;height:40px;width:auto}header b span{color:#fff;font-size:13px;letter-spacing:.08em;text-transform:uppercase}header nav{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}header a.druhe{background:#fff}header a{padding:10px 16px;border-radius:999px;background:#fc0;color:#12171a;text-decoration:none;font-weight:700}main{padding:28px 4vw}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:14px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}th{font-size:12px;text-transform:uppercase;color:#6b7174}.sprava{max-width:420px;white-space:pre-wrap}a{color:#12171a}@media(max-width:800px){table,tbody,tr,td{display:block}thead{display:none}tr{padding:14px;border-bottom:1px solid #ccc}td{padding:6px 0;border:0}.sprava{max-width:none}}</style></head><body><header><b class="znacka"><img src="https://cdn.jsdelivr.net/gh/danielvendzur-code/koverta-web@0002d10e0530d0ec3e3da4e0d35306af8a458c5a/assets/koverta-logo-email.png" width="156" height="40" alt="Koverta"><span>Dopyty</span></b><nav><a href="/api/suhrn" class="druhe">Poslať neodoslané e-mailom</a><a href="?format=csv">Stiahnuť CSV</a></nav></header><main><p>Uložených dopytov: <strong>${dopyty.length}</strong>${neodoslane ? ` · Neodišli e-mailom: <strong>${neodoslane}</strong> (prídu ráno v súhrne alebo hneď tlačidlom hore)` : ''}</p><table><thead><tr><th>Prijaté</th><th>Zákazník</th><th>Kontakt</th><th>Miesto</th><th>Správa</th><th>Stav</th></tr></thead><tbody>${riadky || '<tr><td>Zatiaľ tu nie je žiadny dopyt.</td></tr>'}</tbody></table></main></body></html>`);
}
