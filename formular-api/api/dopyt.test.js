import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './dopyt.js';

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
    meno: 'Test', telefon: '+421900000000', email: 'test@example.com',
    suhlas: 'áno', startedAt: Date.now() - 5000, prilohy: []
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'EMAIL_NOT_CONFIGURED');
});

const zaklad = () => ({
  meno: 'Test', telefon: '+421900000000', email: 'test@example.com',
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
