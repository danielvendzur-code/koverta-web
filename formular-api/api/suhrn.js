import crypto from 'node:crypto';
import { get, list } from '@vercel/blob';
import {
  odosliResend, zapisStav, zapocitaj, emailKostra, emailTlacidlo, telOdkaz, odkazStranky, html, PISMO,
  STAV_ODOSLANY, STAV_CAKA, testovaciDopyt
} from './dopyt.js';
import { autorizovany, zablokovany, zlyPokus, vyziadajPrihlasenie, zmazTestovacie } from './dopyty.js';

/* Ranný súhrn dopytov, ktoré neodišli e-mailom: vyčerpaný denný limit
   Resendu, priveľa dopytov z jedného zariadenia alebo výpadok. Spúšťa ho
   Vercel Cron každé ráno (vercel.json). Majiteľ ho spustí aj sám: otvorí
   /api/suhrn (tlačidlo v zozname dopytov) a prihlási sa tým istým heslom.
   Všetky dopyty idú v jednom e-maile, aby súhrn sám nevyčerpal limit. */

const DNI_SPAT = 7;
const PODROBNE = 40;
const NAJVIAC = 300;
const STAV_V_SUHRNE = 'odoslaný v súhrne';
const PRAVE_SA_POSIELA = 10 * 60 * 1000;

function spustilCron(req) {
  const tajomstvo = process.env.CRON_SECRET;
  const hlavicka = String(req.headers.authorization || '');
  if (tajomstvo) {
    const a = Buffer.from(hlavicka), b = Buffer.from(`Bearer ${tajomstvo}`);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return /^vercel-cron\//i.test(String(req.headers['user-agent'] || ''));
}

export async function neodoslaneDopyty(teraz = Date.now()) {
  const dopyty = [];
  for (let d = 0; d <= DNI_SPAT; d += 1) {
    const den = new Date(teraz - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const testy = [], bloby = [];
    let cursor;
    do {
      const strana = await list({ prefix: `dopyty/${den}/`, limit: 1000, ...(cursor ? { cursor } : {}) });
      bloby.push(...strana.blobs);
      for (const blob of strana.blobs) {
        if (!blob.pathname.endsWith('/dopyt.json')) continue;
        const subor = await get(blob.url, { access: 'private', useCache: false });
        if (!subor || !subor.stream) continue;
        const zaznam = await new Response(subor.stream).json().catch(() => null);
        if (!zaznam) continue;
        /* Testovací dopyt do súhrnu nepatrí — zmaže sa. */
        if (testovaciDopyt(zaznam)) { testy.push({ ...zaznam, archivePath: blob.pathname }); continue; }
        const stav = String(zaznam.stavEmailu || '');
        if (stav === STAV_ODOSLANY || stav.startsWith(STAV_V_SUHRNE)) continue;
        /* Dopyt, ktorý práve odchádza, necháme tak. */
        if (stav === STAV_CAKA && teraz - Date.parse(zaznam.prijateAt || 0) < PRAVE_SA_POSIELA) continue;
        dopyty.push({ ...zaznam, archivePath: blob.pathname });
      }
      cursor = strana.hasMore ? strana.cursor : undefined;
    } while (cursor);
    await zmazTestovacie(testy, bloby).catch((chyba) => console.error('Testy sa nepodarilo zmazať:', chyba.message));
  }
  return dopyty.sort((a, b) => String(a.prijateAt).localeCompare(String(b.prijateAt)));
}

function cas(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dovod(stav) {
  if (/limit e-mailov|denný strop/.test(stav)) return 'denný limit e-mailov bol vyčerpaný';
  if (/jedného zariadenia/.test(stav)) return 'veľa dopytov z jedného zariadenia';
  return 'e-mail sa nepodarilo odoslať';
}

export function emailSuhrnu(dopyty) {
  const riadok = (nazov, hodnota) => hodnota
    ? `<tr><td style="padding:6px 14px 6px 0;vertical-align:top;width:78px;font-family:${PISMO};font-size:13px;color:#6b7174">${nazov}</td>`
      + `<td style="padding:6px 0;vertical-align:top;font-family:${PISMO};font-size:15px;line-height:1.5;color:#12171a">${hodnota}</td></tr>`
    : '';
  const podrobne = dopyty.slice(0, PODROBNE).map((d) => {
    const telefon = d.telefon ? `<a href="${telOdkaz(d.telefon)}" style="color:#12171a;font-weight:700;text-decoration:none">${html(d.telefon)}</a>` : '';
    const email = d.email ? `<a href="mailto:${html(d.email)}" style="color:#12171a">${html(d.email)}</a>` : '';
    const sprava = d.sprava ? html(d.sprava).replace(/\r?\n/g, '<br>') : '';
    const prilohy = (d.prilohy || []).length;
    return `<div style="margin:0 0 18px;padding:16px 18px;border:1px solid #e6e2d9;border-radius:12px">`
      + `<p style="margin:0 0 8px;font-family:${PISMO};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a6600">${html(cas(d.prijateAt))}${d.typ ? ' · ' + html(d.typ) : ''}</p>`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed">`
      + riadok('Meno', `<strong>${html(d.meno)}</strong>`) + riadok('Telefón', telefon) + riadok('E-mail', email)
      + riadok('Miesto', html(d.miesto)) + riadok('Správa', sprava) + riadok('Stránka', d.stranka ? odkazStranky(d.stranka) : '')
      + riadok('Prílohy', prilohy ? `${prilohy} (v zozname dopytov)` : '')
      + `</table><p style="margin:10px 0 0;font-family:${PISMO};font-size:12px;color:#6b7174">Prečo neodišiel hneď: ${html(dovod(String(d.stavEmailu || '')))}</p>`
      + (d.telefon ? `<div style="margin-top:12px">${emailTlacidlo(telOdkaz(d.telefon), 'Zavolať ' + html(d.telefon), true)}</div>` : '')
      + `</div>`;
  }).join('');
  const zvysok = dopyty.slice(PODROBNE);
  const kratko = zvysok.length
    ? `<p style="margin:8px 0 6px;font-family:${PISMO};font-size:14px;font-weight:700;color:#12171a">Ďalšie dopyty (${zvysok.length})</p>`
      + zvysok.map((d) => `<p style="margin:0 0 4px;font-family:${PISMO};font-size:14px;line-height:1.5;color:#12171a">${html(cas(d.prijateAt))} · <strong>${html(d.meno)}</strong> · <a href="${telOdkaz(d.telefon)}" style="color:#12171a">${html(d.telefon)}</a>${d.typ ? ' · ' + html(d.typ) : ''}</p>`).join('')
    : '';
  const pocet = dopyty.length;
  const telo = `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a6600">Súhrn</p>`
    + `<h1 style="margin:0 0 10px;font-family:${PISMO};font-size:24px;line-height:1.25;color:#12171a">${pocet === 1 ? 'Dopyt, ktorý neodišiel <span style="white-space:nowrap">e-mailom</span>' : `Dopyty, ktoré neodišli <span style="white-space:nowrap">e-mailom (${pocet})</span>`}</h1>`
    + `<p style="margin:0 0 20px;font-family:${PISMO};font-size:15px;line-height:1.6;color:#12171a">Tieto dopyty prišli cez web, uložili sa, ale <span style="white-space:nowrap">e-mail</span> o nich vtedy neodišiel. Tu sú všetky naraz.</p>`
    + podrobne + kratko
    + `<div style="margin-top:8px">${emailTlacidlo('https://koverta-formular.vercel.app/api/dopyty', 'Otvoriť zoznam dopytov', false)}</div>`;
  const pata = 'Súhrn z formulára na koverta.sk · posiela sa ráno, keď niektorý dopyt neodišiel hneď';
  return emailKostra({ titulok: 'Dopyty, ktoré neodišli e-mailom', predhlavicka: dopyty.slice(0, 3).map((d) => `${d.meno} · ${d.telefon}`).join(' | '), telo, pata });
}

/* Majiteľ otvára súhrn v prehliadači — dostane krátku stránku, cron JSON. */
function odpovedz(req, res, kod, telo) {
  if (!/text\/html/.test(String(req.headers.accept || ''))) return res.status(kod).json(telo);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  return res.status(kod).send(`<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Koverta – súhrn dopytov</title><style>body{margin:0;background:#f6f5f2;color:#12171a;font:17px/1.5 Arial,sans-serif}main{max-width:560px;margin:0 auto;padding:40px 20px}p{margin:0 0 22px}a{display:inline-block;padding:12px 20px;border-radius:999px;background:#fc0;color:#12171a;font-weight:700;text-decoration:none}</style></head><body><main><p>${html(telo.sprava)}</p><a href="/api/dopyty">Späť na zoznam dopytov</a></main></body></html>`);
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!spustilCron(req)) {
    if (zablokovany(req)) return odpovedz(req, res, 429, { ok: false, sprava: 'Príliš veľa pokusov. Skúste o 15 minút.' });
    if (!autorizovany(req)) {
      if (req.headers.authorization) zlyPokus(req);
      return vyziadajPrihlasenie(res);
    }
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !process.env.BLOB_READ_WRITE_TOKEN) return odpovedz(req, res, 503, { ok: false, sprava: 'Server nie je nastavený.' });

  const vsetky = await neodoslaneDopyty();
  if (!vsetky.length) return odpovedz(req, res, 200, { ok: true, poslane: 0, sprava: 'Nič na doposlanie — všetky dopyty odišli e-mailom.' });
  const dopyty = vsetky.slice(0, NAJVIAC);
  const from = process.env.RESEND_FROM || 'Koverta web <dopyt@koverta.sk>';
  const to = process.env.DOPYT_TO || 'obchod@koverta.sk';
  const kluc = crypto.createHash('sha256').update(dopyty.map((d) => d.id + d.prijateAt).join('|')).digest('hex').slice(0, 32);
  try {
    await odosliResend(apiKey, {
      from, to: [to],
      subject: dopyty.length === 1 ? `Dopyt z webu, ktorý neodišiel – ${dopyty[0].meno}` : `Dopyty z webu, ktoré neodišli e-mailom (${dopyty.length})`,
      html: emailSuhrnu(dopyty)
    }, `suhrn-${kluc}`);
  } catch (chyba) {
    console.log(JSON.stringify({ udalost: 'suhrn', vysledok: 'ZLYHAL', pocet: dopyty.length, chyba: String(chyba.message).slice(0, 200) }));
    return odpovedz(req, res, 503, { ok: false, sprava: chyba.status === 429
      ? 'Resend teraz e-mail neprijal (denný limit). Súhrn sa skúsi znova ráno.'
      : 'Súhrn sa nepodarilo odoslať. Skúsi sa znova ráno.' });
  }
  const dnes = new Date().toISOString().slice(0, 10);
  for (const d of dopyty) await zapisStav(d, `${STAV_V_SUHRNE} ${dnes}`).catch(() => null);
  await zapocitaj(1).catch(() => null);
  console.log(JSON.stringify({ udalost: 'suhrn', vysledok: 'ODOSLANY', pocet: dopyty.length }));
  return odpovedz(req, res, 200, { ok: true, poslane: dopyty.length, sprava: `Súhrn odoslaný na ${to}: ${dopyty.length} ${dopyty.length === 1 ? 'dopyt' : dopyty.length < 5 ? 'dopyty' : 'dopytov'}.` });
}
