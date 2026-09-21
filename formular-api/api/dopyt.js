import crypto from 'node:crypto';
import { put } from '@vercel/blob';

const LIMITY = new Map();
const POVOLENE_ORIGINY = [
  /^https:\/\/(?:www\.)?koverta\.sk$/i,
  /^https:\/\/danielvendzur-code\.github\.io$/i,
  /^https:\/\/maleprojekty-sk\.myshopify\.com$/i,
  /^https:\/\/[a-z0-9-]+\.shopifypreview\.com$/i,
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i
];

function povolenyOrigin(origin = '') {
  return POVOLENE_ORIGINY.some((vzor) => vzor.test(origin));
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

function html(hodnota) {
  return text(hodnota, 10000).replace(/[&<>"']/g, (znak) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[znak]));
}

function platnyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function prilohy(vstup) {
  if (!Array.isArray(vstup)) return [];
  if (vstup.length > 4) throw new Error('TOO_MANY_FILES');
  let spolu = 0;
  return vstup.map((polozka, index) => {
    const filename = text(polozka && polozka.filename, 120).replace(/[\r\n/\\]/g, '_') || `priloha-${index + 1}`;
    const content = String(polozka && polozka.content || '');
    const contentType = text(polozka && polozka.contentType, 100) || 'application/octet-stream';
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('INVALID_FILE');
    spolu += Math.ceil(content.length * .75);
    if (spolu > 3000000) throw new Error('FILES_TOO_LARGE');
    return { filename, content, content_type: contentType };
  });
}

function prekrocilLimit(req) {
  const ip = text(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'nezname', 100).split(',')[0];
  const teraz = Date.now();
  const zaznam = LIMITY.get(ip) || { od: teraz, pocet: 0 };
  if (teraz - zaznam.od > 10 * 60 * 1000) { zaznam.od = teraz; zaznam.pocet = 0; }
  zaznam.pocet += 1;
  LIMITY.set(ip, zaznam);
  return zaznam.pocet > 6;
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

async function archivujDopyt(data, attachments, id, stavEmailu) {
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
  const zaznam = { id, prijateAt: datum, stavEmailu, ...data, prilohy: subory };
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
  if (!povolenyOrigin(origin)) return res.status(403).json({ ok: false, code: 'ORIGIN_NOT_ALLOWED' });
  if (prekrocilLimit(req)) return res.status(429).json({ ok: false, code: 'RATE_LIMIT' });

  let telo;
  try { telo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch (_) { return res.status(400).json({ ok: false, code: 'INVALID_JSON' }); }
  /* Honeypot: robot dostane úspech, aby sa nepokúšal meniť payload. */
  if (text(telo.website, 200)) return res.status(200).json({ ok: true });

  const elapsed = Date.now() - Number(telo.startedAt || 0);
  if (!Number.isFinite(elapsed) || elapsed < 1200 || elapsed > 7 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ ok: false, code: 'INVALID_TIMING' });
  }

  const data = {
    typ: text(telo.typ, 120), meno: text(telo.meno, 160), telefon: text(telo.telefon, 80),
    email: text(telo.email, 254), miesto: text(telo.miesto, 200), sprava: text(telo.sprava, 5000),
    suhlas: text(telo.suhlas, 300), stranka: text(telo.stranka, 800)
  };
  if (!data.meno || !data.telefon || !platnyEmail(data.email) || !data.suhlas) {
    return res.status(422).json({ ok: false, code: 'MISSING_FIELDS' });
  }

  let attachments;
  try { attachments = prilohy(telo.prilohy); }
  catch (chyba) { return res.status(413).json({ ok: false, code: chyba.message }); }

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
    const archiv = await archivujDopyt(data, attachments, id, 'čaká na odoslanie');
    const vysledok = await odosliResend(apiKey, {
      from, to: [to], reply_to: data.email, subject: predmet, html: obsah, attachments
    }, `dopyt-${id}`);

    if (String(process.env.POSLAT_POTVRDENIE || 'true').toLowerCase() !== 'false') {
      const potvrdenie = `<!doctype html><html lang="sk"><body style="margin:0;background:#f6f5f2;font-family:Arial,sans-serif;color:#12171a"><div style="max-width:620px;margin:auto;padding:32px 20px"><div style="background:#12171a;color:white;padding:18px 24px;font-weight:700;letter-spacing:.08em">KOVER<span style="color:#ffcc00">TA</span></div><div style="background:white;padding:30px 24px"><h1 style="font-size:25px;margin:0 0 16px">Dopyt sme prijali</h1><p style="line-height:1.65">Dobrý deň, ${html(data.meno)}, ďakujeme za váš dopyt. Ozveme sa vám telefonicky alebo e-mailom spravidla do jedného pracovného dňa.</p><p style="line-height:1.65">Ak niečo súri, zavolajte na <a href="tel:+421948482266" style="color:#12171a;font-weight:700">+421 948 482 266</a>.</p><p style="margin-top:26px;color:#6b7174">Koverta · obchod@koverta.sk</p></div></div></body></html>`;
      await odosliResend(apiKey, { from, to: [data.email], reply_to: to, subject: 'Koverta – dopyt sme prijali', html: potvrdenie }, `potvrdenie-${id}`).catch(() => null);
    }
    await put(archiv.archivePath, JSON.stringify({ ...archiv, stavEmailu: 'odoslaný' }, null, 2), {
      access: 'private', contentType: 'application/json; charset=utf-8', addRandomSuffix: false, allowOverwrite: true
    }).catch(() => null);
    return res.status(200).json({ ok: true, id: vysledok.id });
  } catch (chyba) {
    console.error('Dopyt sa nepodarilo odoslať:', chyba.message);
    return res.status(502).json({ ok: false, code: 'EMAIL_SEND_FAILED' });
  }
}
