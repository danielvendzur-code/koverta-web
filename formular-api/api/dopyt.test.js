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
