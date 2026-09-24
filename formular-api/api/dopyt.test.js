import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './dopyt.js';

/* Testy nikdy nesmú poslať skutočný e-mail. Aj keď je v prostredí ostrý
   kľúč (napr. po `vercel env pull`), tu sa zahodí — handler si ho číta až
   pri požiadavke, takže platí pre všetky testy nižšie. Testovacie údaje
   (Test, +421 900 000 000) by inak prišli obchodu ako skutočný dopyt. */
delete process.env.RESEND_API_KEY;
delete process.env.BLOB_READ_WRITE_TOKEN;

function odpoved() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(kod) { this.statusCode = kod; return this; },
    json(telo) { this.body = telo; return this; },
    end() { return this; }
  };
}

function poziadavka(body = {}, origin = 'https://koverta.sk', method = 'POST') {
  return { method, body, headers: { origin, 'x-forwarded-for': `127.0.0.${Math.floor(Math.random() * 200 + 1)}` }, socket: {} };
}

test('CORS preflight povolí produkčnú doménu', async () => {
  const res = odpoved();
  await handler(poziadavka({}, 'https://www.koverta.sk', 'OPTIONS'), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://www.koverta.sk');
});

test('CORS preflight povolí verejný GitHub Pages náhľad', async () => {
  const req = { method: 'OPTIONS', headers: { origin: 'https://danielvendzur-code.github.io' } };
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://danielvendzur-code.github.io');
});

test('odmietne cudzí origin', async () => {
  const res = odpoved();
  await handler(poziadavka({}, 'https://example.com'), res);
  assert.equal(res.statusCode, 403);
});

test('honeypot skončí potichu úspechom', async () => {
  const res = odpoved();
  await handler(poziadavka({ website: 'spam.example' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});

test('platný dopyt bez serverového kľúča nič nepredstiera', async () => {
  const res = odpoved();
  await handler(poziadavka({
    meno: 'Test', telefon: '+421900000001', email: 'jana.novakova@gmail.com',
    suhlas: 'áno', startedAt: Date.now() - 5000, prilohy: []
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'EMAIL_NOT_CONFIGURED');
});

const zaklad = () => ({
  meno: 'Test', telefon: '+421900000001', email: 'jana.novakova@gmail.com',
  suhlas: 'áno', startedAt: Date.now() - 5000
});

test('odmietne prílohu, ktorá nie je fotka ani PDF, aj keď sa tvári ako .jpg', async () => {
  const res = odpoved();
  const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1').toString('base64');
  await handler(poziadavka({ ...zaklad(), prilohy: [{ filename: 'fotka.jpg', contentType: 'image/jpeg', content: exe }] }), res);
  assert.equal(res.statusCode, 415);
  assert.equal(res.body.code, 'FILE_TYPE_NOT_ALLOWED');
});

test('fotku a PDF pustí ďalej (bez kľúča skončí až na nastavení servera)', async () => {
  const res = odpoved();
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString('base64');
  const pdf = Buffer.from('%PDF-1.7\n', 'latin1').toString('base64');
  await handler(poziadavka({ ...zaklad(), prilohy: [
    { filename: 'IMG_1.JPG', content: jpg }, { filename: 'navrh', content: pdf }] }), res);
  assert.equal(res.statusCode, 503);
});

test('lokálny vývoj nemá na produkcii prístup', async () => {
  const povodne = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  const res = odpoved();
  await handler(poziadavka(zaklad(), 'http://localhost:3000'), res);
  process.env.VERCEL_ENV = povodne;
  assert.equal(res.statusCode, 403);
});

test('limit: siedmy dopyt z jednej adresy za 10 minút dostane 429', async () => {
  let posledny;
  for (let i = 0; i < 7; i++) {
    posledny = odpoved();
    await handler({ method: 'POST', body: { website: 'x' }, headers: { origin: 'https://koverta.sk', 'x-real-ip': '203.0.113.9' }, socket: {} }, posledny);
  }
  assert.equal(posledny.statusCode, 429);
});

test('odmietnutie zanechá v logu stopu odosielateľa bez samotnej IP', async () => {
  const riadky = [];
  const povodny = console.log;
  console.log = (r) => riadky.push(String(r));
  try {
    const res = odpoved();
    await handler({ method: 'POST', body: {}, headers: { origin: 'https://zly.example', 'x-real-ip': '198.51.100.7', 'user-agent': 'curl/8.0' }, socket: {} }, res);
    assert.equal(res.statusCode, 403);
  } finally { console.log = povodny; }
  const z = JSON.parse(riadky.find((r) => r.includes('"udalost":"dopyt"')));
  assert.equal(z.vysledok, 'ORIGIN_NOT_ALLOWED');
  assert.equal(z.prehliadac, 'curl/8.0');
  assert.match(z.ip, /^[0-9a-f]{12}$/);
  assert.ok(!riadky.join('').includes('198.51.100.7'), 'IP sa nesmie logovať v čitateľnej podobe');
});

test('testovací dopyt (vyhradená doména) dostane úspech, ale nič sa neodošle', async () => {
  for (const email of ['qa@example.invalid', 'jozef@example.sk', 'a@b.test']) {
    const res = odpoved();
    await handler(poziadavka({ ...zaklad(), email }), res);
    assert.equal(res.statusCode, 200, email);
    assert.equal(res.body.test, true, email);
  }
});

test('povinné sú len meno a telefón: bez e-mailu a súhlasu prejde ďalej', async () => {
  const res = odpoved();
  await handler(poziadavka({ meno: 'Ján', telefon: '+421900000001', startedAt: Date.now() - 5000 }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'EMAIL_NOT_CONFIGURED');
});

test('bez telefónu alebo s neplatným e-mailom vráti 422', async () => {
  for (const telo of [{ meno: 'Ján' }, { meno: 'Ján', telefon: '0900', email: 'nie-je-email' }]) {
    const res = odpoved();
    await handler(poziadavka({ ...telo, startedAt: Date.now() - 5000 }), res);
    assert.equal(res.statusCode, 422);
  }
});

test('vymyslené číslo 0900 000 000 sa berie ako test a nič sa neodošle', async () => {
  const res = odpoved();
  await handler(poziadavka({ meno: 'Test', telefon: '+421 900 000 000', startedAt: Date.now() - 5000 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.test, true);
});
