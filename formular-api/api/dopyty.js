import crypto from 'node:crypto';
import { get, list } from '@vercel/blob';

function escapeHtml(v) {
  return String(v || '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[z]));
}

function autorizovany(req) {
  const heslo = process.env.LEADS_ADMIN_PASSWORD || '';
  const hlavicka = String(req.headers.authorization || '');
  if (!heslo || !hlavicka.startsWith('Basic ')) return false;
  let zadane = '';
  try { zadane = Buffer.from(hlavicka.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':'); }
  catch (_) { return false; }
  const a = Buffer.from(zadane), b = Buffer.from(heslo);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function vyziadajPrihlasenie(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="Koverta dopyty", charset="UTF-8"');
  return res.status(401).send('Prihlásenie je potrebné.');
}

async function nacitajDopyty() {
  const { blobs } = await list({ prefix: 'dopyty/', limit: 1000 });
  const jsony = blobs.filter((b) => b.pathname.endsWith('/dopyt.json'))
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  const vysledky = [];
  for (const blob of jsony.slice(0, 500)) {
    const subor = await get(blob.url);
    if (!subor || !subor.stream) continue;
    vysledky.push(await new Response(subor.stream).json());
  }
  return vysledky;
}

function csv(dopyty) {
  const hlavicka = ['Prijaté','Meno','Telefón','E-mail','Miesto','Typ','Správa','Stav e-mailu','Stránka'];
  const bunka = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  return '\ufeff' + [hlavicka, ...dopyty.map((d) => [d.prijateAt,d.meno,d.telefon,d.email,d.miesto,d.typ,d.sprava,d.stavEmailu,d.stranka])]
    .map((r) => r.map(bunka).join(';')).join('\r\n');
}

export default async function handler(req, res) {
  if (!autorizovany(req)) return vyziadajPrihlasenie(res);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).send('Archív nie je nastavený.');
  const dopyty = await nacitajDopyty();
  if (String(req.query?.format || '') === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="koverta-dopyty.csv"');
    return res.status(200).send(csv(dopyty));
  }
  const riadky = dopyty.map((d) => `<tr><td>${escapeHtml(new Date(d.prijateAt).toLocaleString('sk-SK'))}</td><td><strong>${escapeHtml(d.meno)}</strong><br><small>${escapeHtml(d.typ)}</small></td><td><a href="tel:${escapeHtml(d.telefon)}">${escapeHtml(d.telefon)}</a><br><a href="mailto:${escapeHtml(d.email)}">${escapeHtml(d.email)}</a></td><td>${escapeHtml(d.miesto)}</td><td class="sprava">${escapeHtml(d.sprava)}</td><td>${escapeHtml(d.stavEmailu)}<br><small>${(d.prilohy || []).length} príloh</small></td></tr>`).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(`<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Koverta dopyty</title><style>body{margin:0;background:#f6f5f2;color:#12171a;font:15px Arial,sans-serif}header{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px 4vw;background:#12171a;color:#fff}header b{letter-spacing:.08em}header b span{color:#fc0}header a{padding:10px 16px;border-radius:999px;background:#fc0;color:#12171a;text-decoration:none;font-weight:700}main{padding:28px 4vw}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:14px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}th{font-size:12px;text-transform:uppercase;color:#6b7174}.sprava{max-width:420px;white-space:pre-wrap}a{color:#12171a}@media(max-width:800px){table,tbody,tr,td{display:block}thead{display:none}tr{padding:14px;border-bottom:1px solid #ccc}td{padding:6px 0;border:0}.sprava{max-width:none}}</style></head><body><header><b>KOVER<span>TA</span> · DOPYTY</b><a href="?format=csv">Stiahnuť CSV</a></header><main><p>Uložených dopytov: <strong>${dopyty.length}</strong></p><table><thead><tr><th>Prijaté</th><th>Zákazník</th><th>Kontakt</th><th>Miesto</th><th>Správa</th><th>Stav</th></tr></thead><tbody>${riadky || '<tr><td>Zatiaľ tu nie je žiadny dopyt.</td></tr>'}</tbody></table></main></body></html>`);
}
