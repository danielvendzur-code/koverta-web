import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';

const LIMITY = new Map();
const POVOLENE_ORIGINY = [
  /^https:\/\/(?:www\.)?koverta\.sk$/i,
  /^https:\/\/danielvendzur-code\.github\.io$/i,
  /^https:\/\/maleprojekty-sk\.myshopify\.com$/i,
  /^https:\/\/[a-z0-9-]+\.shopifypreview\.com$/i
];
/* Lokálny vývoj len mimo produkcie — na produkcii by localhost otváral
   formulár každej stránke spustenej na počítači útočníka. */
const LOKALNY = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

function povolenyOrigin(origin = '') {
  if (POVOLENE_ORIGINY.some((vzor) => vzor.test(origin))) return true;
  return process.env.VERCEL_ENV !== 'production' && LOKALNY.test(origin);
}

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  if (povolenyOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function text(hodnota, maximum = 3000) {
  return String(hodnota || '').trim().slice(0, maximum);
}

/* Jeden riadok: do predmetu e-mailu sa nesmie dostať zalomenie. */
function jedenRiadok(hodnota, maximum) {
  return text(hodnota, maximum).replace(/[\r\n\t]+/g, ' ');
}

function html(hodnota) {
  return text(hodnota, 10000).replace(/[&<>"']/g, (znak) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[znak]));
}

/* Testovacie dopyty. Domény .invalid, .test, .example, .localhost
   a example.com/.org/.net sú podľa RFC 2606 / 6761 vyhradené na skúšky —
   skutočný zákazník z nich nepíše a e-mail na ne sa vráti ako nedoručený
   (a zhorší povesť odosielateľa). Taký dopyt dostane úspech, aby test prešiel,
   ale nič sa neodošle ani neuloží. Rovnako automatické kontroly z repozitára
   („Koverta audit test“, „QA; nothing is delivered“). */
function testovaciDopyt(data) {
  const domena = (data.email.split('@')[1] || '').toLowerCase();
  if (/(^|\.)(invalid|test|example|localhost)$/.test(domena)) return true;
  if (/^example\.(com|org|net|sk)$/.test(domena)) return true;
  return /koverta audit test|nothing is delivered|client-side qa/i.test(data.meno + ' ' + data.sprava);
}

function platnyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/* Prílohy idú priamo do schránky obchodu — len fotky a PDF, nikdy
   spustiteľné súbory ani dokumenty s makrami. Typ sa určí z prvých bajtov
   obsahu, nie z názvu ani z toho, čo tvrdí prehliadač; prípona názvu sa
   podľa neho opraví, aby sa .exe nedalo vydávať za fotku. */
const PRIPONY = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };

function typPodlaObsahu(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b.slice(4, 8).toString('latin1') === 'ftyp'
    && /^(heic|heix|heim|heis|hevc|mif1|msf1)$/.test(b.slice(8, 12).toString('latin1'))) return 'image/heic';
  return null;
}

function prilohy(vstup) {
  if (!Array.isArray(vstup)) return [];
  if (vstup.length > 4) throw new Error('TOO_MANY_FILES');
  let spolu = 0;
  return vstup.map((polozka, index) => {
    const filename = text(polozka && polozka.filename, 120).replace(/[\r\n/\\]/g, '_') || `priloha-${index + 1}`;
    const content = String(polozka && polozka.content || '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('INVALID_FILE');
    spolu += Math.ceil(content.length * .75);
    if (spolu > 3000000) throw new Error('FILES_TOO_LARGE');
    const typ = typPodlaObsahu(Buffer.from(content.slice(0, 32), 'base64'));
    if (!typ) throw new Error('FILE_TYPE_NOT_ALLOWED');
    const pripona = PRIPONY[typ];
    const zaklad = filename.replace(/\.[^.]*$/, '') || `priloha-${index + 1}`;
    const spravne = new RegExp(`\\.(${pripona}${pripona === 'jpg' ? '|jpeg' : pripona === 'heic' ? '|heif' : ''})$`, 'i').test(filename);
    return { filename: spravne ? filename : `${zaklad}.${pripona}`, content, content_type: typ };
  });
}

/* Limity v pamäti jednej inštancie: nie sú nepriestrelné, ale zastavia
   opakované odosielanie z jedného miesta. IP berie z hlavičky, ktorú
   nastavuje Vercel (klient ju nevie podvrhnúť). */
function prekrocilLimit(kluc, maximum, okno = 10 * 60 * 1000) {
  const teraz = Date.now();
  if (LIMITY.size > 5000) for (const [k, z] of LIMITY) if (teraz - z.od > okno) LIMITY.delete(k);
  const zaznam = LIMITY.get(kluc) || { od: teraz, pocet: 0 };
  if (teraz - zaznam.od > okno) { zaznam.od = teraz; zaznam.pocet = 0; }
  zaznam.pocet += 1;
  LIMITY.set(kluc, zaznam);
  return zaznam.pocet > maximum;
}

function ipKlienta(req) {
  return text(req.headers['x-real-ip'] || req.headers['x-vercel-forwarded-for']
    || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'nezname', 100).split(',')[0].trim();
}

/* Stopa odosielateľa. Do logu Vercelu aj do archívu dopytu ide odtlačok IP
   (nie adresa samotná), prehliadač, origin a odkiaľ prišiel. Keď sa minie
   denný limit Resendu, dá sa podľa toho povedať, či posielali ľudia z webu,
   alebo jeden stroj priamo na API. */
function stopa(req) {
  const sol = process.env.IP_SOL || 'koverta-formular';
  return {
    ip: crypto.createHash('sha256').update(sol + '|' + ipKlienta(req)).digest('hex').slice(0, 12),
    prehliadac: jedenRiadok(req.headers['user-agent'], 200),
    origin: jedenRiadok(req.headers.origin, 120),
    odkial: jedenRiadok(req.headers.referer, 300)
  };
}

function zaznamenaj(vysledok, zdroj, navyse = {}) {
  console.log(JSON.stringify({ udalost: 'dopyt', vysledok, ...zdroj, ...navyse }));
}

/* Denný strop odoslaných e-mailov, spoločný pre všetky inštancie funkcie.
   Limity v pamäti platia len v jednej inštancii a Vercel ich pri náraze
   spustí viac; Resend má pritom jeden denný limit na celý účet. Počítadlo
   leží v úložisku Blob. Potvrdenia návštevníkom sa vypnú skôr (nie sú
   nutné), dopyt pre obchod ide do posledného slotu a aj nad stropom sa
   uloží do archívu, takže sa nestratí. */
const DENNY_STROP = () => Number(process.env.MAX_EMAILOV_DEN || 90);
const STROP_POTVRDENI = () => Number(process.env.MAX_EMAILOV_S_POTVRDENIM || 60);
const cestaPocitadla = () => `limity/${new Date().toISOString().slice(0, 10)}.json`;

async function nacitajPocitadlo() {
  try {
    const r = await get(cestaPocitadla(), { access: 'private', useCache: false });
    if (!r || !r.stream) return { odoslane: 0, etag: null };
    const data = await new Response(r.stream).json();
    return { odoslane: Number(data.odoslane) || 0, etag: r.blob.etag };
  } catch (_) {
    return null;   /* počítadlo nie je dostupné: strop sa neuplatní, dopyt áno */
  }
}

async function zapocitaj(kolko) {
  for (let pokus = 0; pokus < 3; pokus += 1) {
    const stav = await nacitajPocitadlo();
    if (!stav) return;
    try {
      await put(cestaPocitadla(), JSON.stringify({ odoslane: stav.odoslane + kolko, zmenene: new Date().toISOString() }), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        ...(stav.etag ? { ifMatch: stav.etag } : { allowOverwrite: false })
      });
      return;
    } catch (_) { /* súbežný zápis: skúsi sa znova s novým stavom */ }
  }
}

async function odosliResend(apiKey, sprava, idempotencyKey) {
  const odpoved = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(sprava)
  });
  const data = await odpoved.json().catch(() => ({}));
  if (!odpoved.ok) throw new Error(`RESEND_${odpoved.status}:${data.message || 'odoslanie zlyhalo'}`);
  return data;
}

async function archivujDopyt(data, attachments, id, stavEmailu, zdroj) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('ARCHIVE_NOT_CONFIGURED');
  const datum = new Date().toISOString();
  const zaklad = `dopyty/${datum.slice(0, 10)}/${datum.replace(/[:.]/g, '-')}-${id}`;
  const subory = [];
  for (let i = 0; i < attachments.length; i += 1) {
    const a = attachments[i];
    const blob = await put(`${zaklad}/prilohy/${String(i + 1).padStart(2, '0')}-${a.filename}`,
      Buffer.from(a.content, 'base64'), {
        access: 'private', contentType: a.content_type, addRandomSuffix: false, allowOverwrite: true
      });
    subory.push({ nazov: a.filename, typ: a.content_type, url: blob.url });
  }
  const zaznam = { id, prijateAt: datum, stavEmailu, ...data, prilohy: subory, zdroj };
  const blob = await put(`${zaklad}/dopyt.json`, JSON.stringify(zaznam, null, 2), {
    access: 'private', contentType: 'application/json; charset=utf-8', addRandomSuffix: false, allowOverwrite: true
  });
  return { ...zaznam, archiveUrl: blob.url, archivePath: `${zaklad}/dopyt.json` };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
  const origin = String(req.headers.origin || '');
  const zdroj = stopa(req);
  if (!povolenyOrigin(origin)) { zaznamenaj('ORIGIN_NOT_ALLOWED', zdroj); return res.status(403).json({ ok: false, code: 'ORIGIN_NOT_ALLOWED' }); }
  if (prekrocilLimit('ip:' + ipKlienta(req), 6)) { zaznamenaj('RATE_LIMIT', zdroj); return res.status(429).json({ ok: false, code: 'RATE_LIMIT' }); }

  let telo;
  try { telo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch (_) { return res.status(400).json({ ok: false, code: 'INVALID_JSON' }); }
  /* Honeypot: robot dostane úspech, aby sa nepokúšal meniť payload. */
  if (text(telo.website, 200)) { zaznamenaj('HONEYPOT', zdroj); return res.status(200).json({ ok: true }); }

  const elapsed = Date.now() - Number(telo.startedAt || 0);
  if (!Number.isFinite(elapsed) || elapsed < 1200 || elapsed > 7 * 24 * 60 * 60 * 1000) {
    zaznamenaj('INVALID_TIMING', zdroj);
    return res.status(400).json({ ok: false, code: 'INVALID_TIMING' });
  }

  const data = {
    typ: jedenRiadok(telo.typ, 120), meno: jedenRiadok(telo.meno, 160), telefon: jedenRiadok(telo.telefon, 80),
    email: jedenRiadok(telo.email, 254), miesto: jedenRiadok(telo.miesto, 200), sprava: text(telo.sprava, 5000),
    suhlas: text(telo.suhlas, 300), stranka: text(telo.stranka, 800)
  };
  /* Povinné sú len meno a telefón. E-mail je nepovinný, ak ho však
     návštevník vyplní, musí byť platný. */
  if (!data.meno || !data.telefon || (data.email && !platnyEmail(data.email))) {
    zaznamenaj('MISSING_FIELDS', zdroj);
    return res.status(422).json({ ok: false, code: 'MISSING_FIELDS' });
  }
  if (testovaciDopyt(data)) {
    zaznamenaj('TEST_ZAHODENY', zdroj, { domenaNavstevnika: data.email.split('@')[1] || '' });
    return res.status(200).json({ ok: true, test: true });
  }

  let attachments;
  try { attachments = prilohy(telo.prilohy); }
  catch (chyba) {
    return res.status(chyba.message === 'FILE_TYPE_NOT_ALLOWED' ? 415 : 413).json({ ok: false, code: chyba.message });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(503).json({ ok: false, code: 'EMAIL_NOT_CONFIGURED' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ ok: false, code: 'ARCHIVE_NOT_CONFIGURED' });
  const from = process.env.RESEND_FROM || 'Koverta web <dopyt@koverta.sk>';
  const to = process.env.DOPYT_TO || 'obchod@koverta.sk';
  const id = crypto.createHash('sha256').update(`${data.email}|${telo.startedAt}|${data.telefon}`).digest('hex').slice(0, 32);
  const predmet = `Nový dopyt z webu – ${data.typ || 'Koverta'}${data.miesto ? ` – ${data.miesto}` : ''}`;
  const riadok = (nazov, hodnota) => hodnota ? `<tr><th style="padding:8px 16px 8px 0;text-align:left;vertical-align:top;color:#6b7174">${nazov}</th><td style="padding:8px 0;color:#12171a">${html(hodnota)}</td></tr>` : '';
  const obsah = `<!doctype html><html lang="sk"><body style="margin:0;background:#f6f5f2;font-family:Arial,sans-serif;color:#12171a"><div style="max-width:680px;margin:auto;padding:32px 20px"><div style="background:#12171a;color:white;padding:18px 24px;font-weight:700;letter-spacing:.08em">KOVER<span style="color:#ffcc00">TA</span></div><div style="background:white;padding:28px 24px"><h1 style="font-size:25px;margin:0 0 20px">Nový dopyt z webu</h1><table style="border-collapse:collapse;width:100%">${riadok('Čo rieši', data.typ)}${riadok('Meno', data.meno)}${riadok('Telefón', data.telefon)}${riadok('E-mail', data.email)}${riadok('Miesto', data.miesto)}${riadok('Správa', data.sprava)}${riadok('Stránka', data.stranka)}</table><p style="margin:24px 0 0;color:#6b7174;font-size:13px">Prílohy: ${attachments.length}</p></div></div></body></html>`;

  try {
    const pocitadlo = await nacitajPocitadlo();
    const odoslaneDnes = pocitadlo ? pocitadlo.odoslane : 0;
    if (odoslaneDnes >= DENNY_STROP()) {
      /* Nad stropom sa e-mail neposiela, dopyt sa však uloží a je v zozname
         dopytov. Návštevník dostane úspech — dopyt naozaj máme. */
      await archivujDopyt(data, attachments, id, 'neodoslaný – denný strop e-mailov', zdroj);
      zaznamenaj('STROP_EMAILOV', zdroj, { odoslaneDnes });
      return res.status(200).json({ ok: true, id });
    }
    const archiv = await archivujDopyt(data, attachments, id, 'čaká na odoslanie', zdroj);
    const vysledok = await odosliResend(apiKey, {
      from, to: [to], ...(data.email ? { reply_to: data.email } : {}), subject: predmet, html: obsah, attachments
    }, `dopyt-${id}`);
    let odoslane = 1;

    /* Potvrdenie ide na adresu, ktorú zadal návštevník. Aby sa formulár nedal
       zneužiť na posielanie správ cudzím ľuďom, dostane jedna adresa najviac
       dve potvrdenia za deň a meno sa do textu vloží len vtedy, keď vyzerá
       ako meno (bez odkazov, najviac 60 znakov). */
    const menoOk = data.meno.length <= 60 && !/https?:|www\.|[<>@]|\.[a-z]{2,}\//i.test(data.meno);
    const oslovenie = menoOk ? `Dobrý deň, ${html(data.meno)},` : 'Dobrý deň,';
    if (data.email && String(process.env.POSLAT_POTVRDENIE || 'true').toLowerCase() !== 'false'
      && odoslaneDnes + 1 < STROP_POTVRDENI()
      && !prekrocilLimit('email:' + data.email.toLowerCase(), 2, 24 * 60 * 60 * 1000)) {
      const potvrdenie = `<!doctype html><html lang="sk"><body style="margin:0;background:#f6f5f2;font-family:Arial,sans-serif;color:#12171a"><div style="max-width:620px;margin:auto;padding:32px 20px"><div style="background:#12171a;color:white;padding:18px 24px;font-weight:700;letter-spacing:.08em">KOVER<span style="color:#ffcc00">TA</span></div><div style="background:white;padding:30px 24px"><h1 style="font-size:25px;margin:0 0 16px">Dopyt sme prijali</h1><p style="line-height:1.65">${oslovenie} ďakujeme za váš dopyt. Ozveme sa vám telefonicky alebo e-mailom spravidla do jedného pracovného dňa.</p><p style="line-height:1.65">Ak niečo súri, zavolajte na <a href="tel:+421948482266" style="color:#12171a;font-weight:700">+421 948 482 266</a>.</p><p style="margin-top:26px;color:#6b7174">Koverta · obchod@koverta.sk</p></div></div></body></html>`;
      if (await odosliResend(apiKey, { from, to: [data.email], reply_to: to, subject: 'Koverta – dopyt sme prijali', html: potvrdenie }, `potvrdenie-${id}`).catch(() => null)) odoslane += 1;
    }
    await zapocitaj(odoslane).catch(() => null);
    zaznamenaj('ODOSLANE', zdroj, { emailov: odoslane, odoslaneDnes: odoslaneDnes + odoslane, domenaNavstevnika: data.email.split('@')[1] || '' });
    await put(archiv.archivePath, JSON.stringify({ ...archiv, stavEmailu: 'odoslaný' }, null, 2), {
      access: 'private', contentType: 'application/json; charset=utf-8', addRandomSuffix: false, allowOverwrite: true
    }).catch(() => null);
    return res.status(200).json({ ok: true, id: vysledok.id });
  } catch (chyba) {
    console.error('Dopyt sa nepodarilo odoslať:', chyba.message);
    zaznamenaj('EMAIL_SEND_FAILED', zdroj, { chyba: String(chyba.message).slice(0, 200) });
    return res.status(502).json({ ok: false, code: 'EMAIL_SEND_FAILED' });
  }
}
