import crypto from 'node:crypto';
import { del, get, list } from '@vercel/blob';
import { testovaciDopyt } from './dopyt.js';

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

/* `list` vráti najviac 1 000 súborov naraz, zoradených podľa cesty, teda od
   najstaršieho dňa. Bez stránkovania sa do zoznamu dostali len staré dopyty
   a dnešné v ňom chýbali. */
export async function vsetkyBloby(prefix) {
  const bloby = [];
  let cursor;
  do {
    const strana = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    bloby.push(...strana.blobs);
    cursor = strana.hasMore ? strana.cursor : undefined;
  } while (cursor);
  return bloby;
}

/* Jeden uložený dopyt. `get` bez volieb v @vercel/blob 2.x vyhodí „missing
   options". Archív je súkromný. */
export async function precitajZaznam(blob) {
  const subor = await get(blob.url, { access: 'private', useCache: false });
  if (!subor || !subor.stream) return null;
  const zaznam = await new Response(subor.stream).json().catch(() => null);
  return zaznam ? { ...zaznam, archivePath: blob.pathname } : null;
}

/* Zmaže testovacie dopyty (testovaciDopyt v api/dopyt.js: vymyslené číslo
   +421 900 000 000, testovacie domény). Maže sa len priečinok takého dopytu
   (dopyt.json a jeho prílohy), nič iné. Vráti počet zmazaných dopytov. */
export async function zmazTestovacie(zaznamy, bloby) {
  const priecinky = zaznamy
    .filter((z) => z && testovaciDopyt(z) && /^dopyty\/\d{4}-\d{2}-\d{2}\/[^/]+\/dopyt\.json$/.test(String(z.archivePath || '')))
    .map((z) => z.archivePath.slice(0, -'dopyt.json'.length));
  if (!priecinky.length) return 0;
  const vPriecinku = new Set(priecinky);
  const url = bloby.filter((b) => vPriecinku.has(b.pathname.replace(/(\/prilohy)?\/[^/]+$/, '/'))).map((b) => b.url);
  for (let i = 0; i < url.length; i += 500) await del(url.slice(i, i + 500));
  console.log(JSON.stringify({ udalost: 'testy', vysledok: 'ZMAZANE', dopytov: priecinky.length, suborov: url.length }));
  return priecinky.length;
}

async function precitajVsetky(jsony) {
  const vysledky = [];
  for (let i = 0; i < jsony.length; i += 16) {
    const davka = await Promise.all(jsony.slice(i, i + 16).map((b) => precitajZaznam(b).catch(() => null)));
    vysledky.push(...davka.filter(Boolean));
  }
  return vysledky;
}

/* Všetky dopyty: testovacie sa zmažú, vráti sa najviac 500 skutočných,
   najnovšie hore (cesta začína dátumom a časom prijatia). */
export async function nacitajDopyty() {
  const bloby = await vsetkyBloby('dopyty/');
  const jsony = bloby.filter((b) => b.pathname.endsWith('/dopyt.json'))
    .sort((a, b) => b.pathname.localeCompare(a.pathname));
  const zaznamy = await precitajVsetky(jsony);
  await zmazTestovacie(zaznamy, bloby).catch((chyba) => console.error('Testy sa nepodarilo zmazať:', chyba.message));
  return zaznamy.filter((z) => !testovaciDopyt(z)).slice(0, 500);
}

/* Dopyty, ktoré server vyhodnotil ako automat (neodoslané), za 7 dní. */
async function nacitajZachytene(teraz = Date.now()) {
  const jsony = [];
  for (let d = 0; d < 7; d += 1) {
    const den = new Date(teraz - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    jsony.push(...(await vsetkyBloby(`zachytene/${den}/`)).filter((b) => b.pathname.endsWith('.json')));
  }
  jsony.sort((a, b) => b.pathname.localeCompare(a.pathname));
  return (await precitajVsetky(jsony.slice(0, 200))).filter((z) => !testovaciDopyt(z));
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
  const zachytene = await nacitajZachytene().catch(() => []);
  if (String(req.query?.format || '') === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="koverta-dopyty.csv"');
    return res.status(200).send(csv(dopyty));
  }
  const neodoslane = dopyty.filter((d) => !/^odoslaný/.test(String(d.stavEmailu || ''))).length;
  const dnesKey = new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' });
  const jeDnes = (d) => new Date(d.prijateAt).toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' }) === dnesKey;
  const dnesPocet = dopyty.filter(jeDnes).length;
  const riadokDopytu = (d) => `<tr><td>${escapeHtml(new Date(d.prijateAt).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' }))}</td><td><strong>${escapeHtml(d.meno)}</strong><br><small>${escapeHtml(d.typ)}</small></td><td><a href="tel:${escapeHtml(d.telefon)}">${escapeHtml(d.telefon)}</a><br><a href="mailto:${escapeHtml(d.email)}">${escapeHtml(d.email)}</a></td><td>${escapeHtml(d.miesto)}</td><td class="sprava">${escapeHtml(d.sprava)}</td><td>${escapeHtml(d.stavEmailu)}<br><small>${(d.prilohy || []).length} príloh</small>${d.zdroj ? `<br><small title="${escapeHtml(d.zdroj.prehliadac)}">IP ${escapeHtml(d.zdroj.ip)} · ${escapeHtml(d.zdroj.origin)}</small>` : ''}</td></tr>`;
  const riadky = dopyty.map(riadokDopytu).join('');
  const riadkyZachytene = zachytene.map(riadokDopytu).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(`<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Koverta dopyty</title><style>body{margin:0;background:#f6f5f2;color:#12171a;font:15px Arial,sans-serif}header{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px 4vw;background:#12171a;color:#fff}header b{letter-spacing:.08em}header b.znacka{display:flex;align-items:center;gap:12px}header b.znacka img{display:block;height:40px;width:auto}header b span{color:#fff;font-size:13px;letter-spacing:.08em;text-transform:uppercase}header nav{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}header a.druhe{background:#fff}header a{padding:10px 16px;border-radius:999px;background:#fc0;color:#12171a;text-decoration:none;font-weight:700}main{padding:28px 4vw}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:14px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}th{font-size:12px;text-transform:uppercase;color:#6b7174}.sprava{max-width:420px;white-space:pre-wrap}a{color:#12171a}@media(max-width:800px){table,tbody,tr,td{display:block}thead{display:none}tr{padding:14px;border-bottom:1px solid #ccc}td{padding:6px 0;border:0}.sprava{max-width:none}}</style></head><body><header><b class="znacka"><img src="https://cdn.jsdelivr.net/gh/danielvendzur-code/koverta-web@0002d10e0530d0ec3e3da4e0d35306af8a458c5a/assets/koverta-logo-email.png" width="156" height="40" alt="Koverta"><span>Dopyty</span></b><nav><a href="/api/suhrn" class="druhe">Poslať neodoslané e-mailom</a><a href="?format=csv">Stiahnuť CSV</a></nav></header><main><p>Uložených dopytov: <strong>${dopyty.length}</strong> · Dnes: <strong>${dnesPocet}</strong>${neodoslane ? ` · Neodišli e-mailom: <strong>${neodoslane}</strong> (prídu ráno v súhrne alebo hneď tlačidlom hore)` : ''}</p><table><thead><tr><th>Prijaté</th><th>Zákazník</th><th>Kontakt</th><th>Miesto</th><th>Správa</th><th>Stav</th></tr></thead><tbody>${riadky || '<tr><td>Zatiaľ tu nie je žiadny dopyt.</td></tr>'}</tbody></table>${zachytene.length ? `<h2 style="margin:36px 0 6px;font-size:18px">Zachytené ako automat (${zachytene.length})</h2><p style="margin:0 0 14px;color:#6b7174">Server ich vyhodnotil ako automatický prehliadač alebo skript, preto neodišli e-mailom. Ak je medzi nimi skutočný zákazník, ozvite sa mu.</p><table><thead><tr><th>Prijaté</th><th>Zákazník</th><th>Kontakt</th><th>Miesto</th><th>Správa</th><th>Stav</th></tr></thead><tbody>${riadkyZachytene}</tbody></table>` : ''}</main></body></html>`);
}
