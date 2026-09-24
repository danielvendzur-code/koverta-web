import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/* Odosielanie s úložiskom a Resendom nahradenými v pamäti. Nič nejde na
   internet: fetch pustí len adresu Resendu a tú vybaví tento test sám. */
const ULOZISKO = new Map();
let etag = 0;
const cesta = (adresa) => (String(adresa).startsWith('https://') ? new URL(adresa).pathname.slice(1) : String(adresa));

mock.module('@vercel/blob', {
  namedExports: {
    async get(adresa) {
      const zaznam = ULOZISKO.get(cesta(adresa));
      if (!zaznam) return null;
      return { stream: new Response(zaznam.telo).body, blob: { etag: zaznam.etag, pathname: cesta(adresa) } };
    },
    async put(kam, obsah, volby = {}) {
      const stary = ULOZISKO.get(kam);
      if (volby.ifMatch && (!stary || stary.etag !== volby.ifMatch)) throw new Error('PRECONDITION_FAILED');
      if (volby.allowOverwrite === false && stary) throw new Error('ALREADY_EXISTS');
      ULOZISKO.set(kam, { telo: typeof obsah === 'string' ? obsah : Buffer.from(obsah), etag: String(++etag), uploadedAt: new Date().toISOString() });
      return { url: 'https://ulozisko.test/' + kam, pathname: kam };
    },
    async list({ prefix }) {
      const blobs = [...ULOZISKO.entries()].filter(([k]) => k.startsWith(prefix))
        .map(([k, z]) => ({ pathname: k, url: 'https://ulozisko.test/' + k, uploadedAt: z.uploadedAt }));
      return { blobs, hasMore: false };
    }
  }
});

process.env.RESEND_API_KEY = 're_test_nic_neodosiela';
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
delete process.env.CRON_SECRET;
delete process.env.IP_SOL;

const POSLANE = [];
let odpovedResendu = () => ({ status: 200, telo: { id: 'em_' + (POSLANE.length + 1) } });
let volaniResendu = 0;
globalThis.fetch = async (adresa, volby) => {
  if (String(adresa) !== 'https://api.resend.com/emails') throw new Error('Test nesmie ísť na internet: ' + adresa);
  volaniResendu += 1;
  const sprava = JSON.parse(volby.body);
  const { status, telo } = odpovedResendu(sprava, volaniResendu);
  if (status === 200) POSLANE.push(sprava);
  return new Response(JSON.stringify(telo), { status, headers: { 'content-type': 'application/json' } });
};

const { default: handler } = await import('../api/dopyt.js');
const { default: suhrn } = await import('../api/suhrn.js');

const PREHLIADAC = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const dnes = () => new Date().toISOString().slice(0, 10);
const odtlacok = (ip) => crypto.createHash('sha256').update('koverta-formular|' + ip).digest('hex').slice(0, 12);
let poradie = 0;

function odpoved() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(kod) { this.statusCode = kod; return this; },
    json(telo) { this.body = telo; return this; },
    send(telo) { this.body = telo; return this; },
    end() { return this; }
  };
}

function dopyt(navyse = {}, hlavicky = {}) {
  poradie += 1;
  const ip = `198.51.100.${poradie}`;
  return {
    ip,
    req: {
      method: 'POST',
      headers: { origin: 'https://koverta.sk', 'user-agent': PREHLIADAC, 'x-real-ip': ip, ...hlavicky },
      body: { meno: `Zákazník ${poradie}`, telefon: `0948 111 ${String(100 + poradie)}`, email: `zakaznik${poradie}@gmail.com`,
        typ: 'Pergola', sprava: 'Dobrý deň, mám záujem.', startedAt: Date.now() - 8000, prilohy: [], ...navyse },
      socket: {}
    }
  };
}

function ulozeneDopyty() {
  return [...ULOZISKO.entries()].filter(([k]) => k.startsWith('dopyty/') && k.endsWith('/dopyt.json'))
    .map(([, z]) => JSON.parse(String(z.telo)));
}

function pocitadlo() {
  const z = ULOZISKO.get(`limity/${dnes()}.json`);
  return z ? JSON.parse(String(z.telo)) : null;
}

function nastavPocitadlo(obsah) {
  ULOZISKO.set(`limity/${dnes()}.json`, { telo: JSON.stringify(obsah), etag: String(++etag), uploadedAt: new Date().toISOString() });
}

beforeEach(() => {
  ULOZISKO.clear();
  POSLANE.length = 0;
  volaniResendu = 0;
  odpovedResendu = () => ({ status: 200, telo: { id: 'em_' + (POSLANE.length + 1) } });
});

test('bežný dopyt: e-mail obchodu aj potvrdenie, počítadlo +2 a zariadenie +1', async () => {
  const { ip, req } = dopyt();
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(POSLANE.length, 2);
  assert.deepEqual(POSLANE[0].to, ['obchod@koverta.sk']);
  assert.deepEqual(POSLANE[1].to, [req.body.email]);
  assert.equal(pocitadlo().odoslane, 2);
  assert.equal(pocitadlo().zariadenia[odtlacok(ip)], 1);
  assert.equal(ulozeneDopyty()[0].stavEmailu, 'odoslaný');
});

test('automatický prehliadač (HeadlessChrome) nič neodošle ani neuloží', async () => {
  const { req } = dopyt({}, { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36' });
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.test, true);
  assert.equal(volaniResendu, 0);
  assert.equal(ulozeneDopyty().length, 0);
  assert.equal(pocitadlo(), null);
});

test('skript bez prehliadača (Node, curl, bez hlavičky) nič neodošle', async () => {
  for (const ua of ['node', 'curl/8.9.1', 'python-requests/2.32', undefined]) {
    const { req } = dopyt({}, { 'user-agent': ua });
    if (ua === undefined) delete req.headers['user-agent'];
    const res = odpoved();
    await handler(req, res);
    assert.equal(res.body.test, true, String(ua));
  }
  assert.equal(volaniResendu, 0);
});

test('web nahlási riadený prehliadač (navigator.webdriver) — nič sa neodošle', async () => {
  const { req } = dopyt({ automat: true });
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.body.test, true);
  assert.equal(volaniResendu, 0);
});

test('šiesty dopyt z jedného zariadenia za deň sa uloží bez e-mailu a návštevník dostane úspech', async () => {
  const { ip, req } = dopyt();
  nastavPocitadlo({ odoslane: 10, zariadenia: { [odtlacok(ip)]: 5 } });
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(volaniResendu, 0);
  assert.equal(ulozeneDopyty()[0].stavEmailu, 'neodoslaný – veľa dopytov z jedného zariadenia');
});

test('nad stropom potvrdení ide už len e-mail obchodu', async () => {
  nastavPocitadlo({ odoslane: 85, zariadenia: {} });
  const { req } = dopyt();
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(POSLANE.length, 1);
  assert.deepEqual(POSLANE[0].to, ['obchod@koverta.sk']);
  assert.equal(pocitadlo().odoslane, 86);
});

test('nad starým denným stropom (90) sa dopyt pre obchod stále skúsi poslať', async () => {
  nastavPocitadlo({ odoslane: 94, zariadenia: {} });
  const { req } = dopyt();
  const res = odpoved();
  await handler(req, res);
  assert.equal(POSLANE.length, 1);
  assert.equal(ulozeneDopyty()[0].stavEmailu, 'odoslaný');
});

test('vyčerpaný denný limit Resendu: dopyt sa uloží, návštevník dostane úspech, bez opakovania', async () => {
  odpovedResendu = () => ({ status: 429, telo: { name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' } });
  const { req } = dopyt();
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(volaniResendu, 1);
  assert.equal(ulozeneDopyty()[0].stavEmailu, 'neodoslaný – denný limit e-mailov');
});

test('priveľa požiadaviek za sekundu: počká a pošle', async () => {
  odpovedResendu = (_, n) => (n === 1
    ? { status: 429, telo: { name: 'rate_limit_exceeded', message: 'Too many requests.' } }
    : { status: 200, telo: { id: 'em_ok' } });
  const { req } = dopyt({ email: '' });
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(volaniResendu, 2);
  assert.equal(POSLANE.length, 1);
});

test('iná chyba Resendu: návštevník vidí chybu (zavolá), dopyt ostane uložený na súhrn', async () => {
  odpovedResendu = () => ({ status: 500, telo: { message: 'Internal error' } });
  const { req } = dopyt();
  const res = odpoved();
  await handler(req, res);
  assert.equal(res.statusCode, 502);
  assert.equal(ulozeneDopyty()[0].stavEmailu, 'čaká na odoslanie');
});

test('súhrn: jeden e-mail so všetkými neodoslanými, odoslané vynechá, potom už nič', async () => {
  odpovedResendu = () => ({ status: 429, telo: { name: 'daily_quota_exceeded', message: 'quota' } });
  const a = dopyt({ meno: 'Ján Horváth', telefon: '0905 123 456' });
  const b = dopyt({ meno: 'Eva Kováčová', telefon: '0911 222 333' });
  await handler(a.req, odpoved());
  await handler(b.req, odpoved());
  odpovedResendu = () => ({ status: 200, telo: { id: 'em_ok' } });
  const c = dopyt({ meno: 'Už odoslaný' });
  await handler(c.req, odpoved());
  POSLANE.length = 0;

  const res = odpoved();
  await suhrn({ method: 'GET', headers: { 'user-agent': 'vercel-cron/1.0' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.poslane, 2);
  assert.equal(POSLANE.length, 1);
  assert.deepEqual(POSLANE[0].to, ['obchod@koverta.sk']);
  assert.match(POSLANE[0].html, /Ján Horváth/);
  assert.match(POSLANE[0].html, /Eva Kováčová/);
  assert.match(POSLANE[0].html, /tel:0905123456/);
  assert.doesNotMatch(POSLANE[0].html, /Už odoslaný/);
  assert.ok(ulozeneDopyty().every((d) => d.stavEmailu.startsWith('odoslaný')));

  const znova = odpoved();
  await suhrn({ method: 'GET', headers: { 'user-agent': 'vercel-cron/1.0' } }, znova);
  assert.equal(znova.body.poslane, 0);
  assert.equal(POSLANE.length, 1);
});

test('súhrn zahrnie aj dnešné dopyty, ktoré starý server uložil nad stropom', async () => {
  const kam = `dopyty/${dnes()}/stary/dopyt.json`;
  ULOZISKO.set(kam, { telo: JSON.stringify({ id: 'x', prijateAt: new Date(Date.now() - 3600e3).toISOString(), stavEmailu: 'neodoslaný – denný strop e-mailov', meno: 'Peter Starý', telefon: '0907 000 111', email: '', typ: 'Prístrešok' }), etag: '1', uploadedAt: new Date().toISOString() });
  const res = odpoved();
  await suhrn({ method: 'GET', headers: { 'user-agent': 'vercel-cron/1.0' } }, res);
  assert.equal(res.body.poslane, 1);
  assert.match(POSLANE[0].html, /Peter Starý/);
  assert.match(POSLANE[0].html, /denný limit e-mailov bol vyčerpaný/);
});

test('súhrn bez oprávnenia pýta heslo a nič nepošle', async () => {
  const res = odpoved();
  await suhrn({ method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(volaniResendu, 0);
});

test('súhrn s tajomstvom cronu pustí len správny kľúč', async () => {
  process.env.CRON_SECRET = 'tajne-123';
  try {
    const zly = odpoved();
    await suhrn({ method: 'GET', headers: { 'user-agent': 'vercel-cron/1.0' } }, zly);
    assert.equal(zly.statusCode, 401);
    const dobry = odpoved();
    await suhrn({ method: 'GET', headers: { authorization: 'Bearer tajne-123' } }, dobry);
    assert.equal(dobry.statusCode, 200);
  } finally {
    delete process.env.CRON_SECRET;
  }
});
