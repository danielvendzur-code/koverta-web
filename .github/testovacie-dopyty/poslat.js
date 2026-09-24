/* Tri skúšobné dopyty na ostrom webe koverta.sk — jednorazovo, na žiadosť
   majiteľa (24. 9. 2026). Každý ide iným formulárom a v správe má, čo
   testuje. Kontaktný e-mail je majiteľov, telefón je linka obchodu, takže
   nikoho cudzieho to neobťažuje. Ak by stránku nebolo možné načítať
   (napr. ochrana Cloudflare), dopyt sa pošle priamo na server formulára
   s tými istými údajmi, aby sa aspoň overili e-maily. */
const { chromium } = require('playwright');
const fs = require('fs');

const EMAIL = 'daniel.vendzur@gmail.com';
const TELEFON = '0948 482 266';
const SERVER = 'https://koverta-formular.vercel.app/api/dopyt';
fs.mkdirSync('vysledky', { recursive: true });

const vysledky = [];
const zapis = (nazov, stav, detail) => { vysledky.push({ nazov, stav, detail }); console.log(`${stav} · ${nazov} · ${detail || ''}`); };

async function priamo(nazov, typ, sprava, stranka) {
  const telo = { typ, meno: `Daniel – ${nazov}`, telefon: TELEFON, email: EMAIL, miesto: '', sprava, suhlas: 'Odoslaním súhlasí', website: '', startedAt: Date.now() - 8000, stranka, prilohy: [] };
  const r = await fetch(SERVER, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://koverta.sk' }, body: JSON.stringify(telo) });
  const j = await r.json().catch(() => ({}));
  zapis(nazov + ' (priamo na server)', r.ok ? 'ODOSLANÉ' : 'CHYBA', `HTTP ${r.status} ${JSON.stringify(j)}`);
}

async function suhlas(p) {
  for (const re of [/iba nevyhnutn/i, /odmietnu/i, /prija[ťt] všetk/i, /súhlasím/i]) {
    const b = p.getByRole('button', { name: re }).first();
    if (await b.count().catch(() => 0)) { await b.click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(600); return; }
  }
}

async function vyplnAOdosli(p, form, nazov, sprava) {
  await form.locator('input[name="contact[name]"]').fill(`Daniel – ${nazov}`);
  await form.locator('input[name="contact[phone]"]').fill(TELEFON);
  const email = form.locator('input[name="contact[email]"]');
  if (await email.count()) await email.fill(EMAIL);
  const pole = form.locator('textarea[name="contact[body]"]');
  if (await pole.count()) {
    const doteraz = (await pole.inputValue()).trim();
    await pole.fill(sprava + (doteraz ? '\n\n' + doteraz : ''));
  }
  await p.waitForTimeout(2500);   // server odmieta formulár vyplnený rýchlejšie než za 1,2 s
  const odpoved = p.waitForResponse((r) => r.url().startsWith(SERVER) && r.request().method() === 'POST', { timeout: 45000 });
  await form.locator('button[type="submit"]').first().click();
  const r = await odpoved;
  const j = await r.json().catch(() => ({}));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `vysledky/${nazov.replace(/[^\w]+/g, '-')}.png`, fullPage: false });
  zapis(nazov, r.ok() && j.ok && !j.test ? 'ODOSLANÉ' : 'CHYBA', `HTTP ${r.status()} ${JSON.stringify(j)} → ${p.url()}`);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'sk-SK', viewport: { width: 1280, height: 900 } });
  /* Cloudflare pred koverta.sk: presmerovania sa vybavia bez slučky. */
  await ctx.route(/^https:\/\/koverta\.sk\//, async (r) => r.fulfill({ response: await r.fetch({ maxRedirects: 0 }) }));

  const pokusy = [
    { nazov: 'test formulára na úvodnej stránke', url: 'https://koverta.sk/', typ: 'Prístrešok pre auto',
      sprava: 'Test: formulár na úvodnej stránke (koverta.sk). Nie je to skutočný dopyt.',
      krok: async (p) => { const f = p.locator('form#dopyt'); await f.scrollIntoViewIfNeeded(); return f; } },
    { nazov: 'test okna ponuky na produkte', url: 'https://koverta.sk/products/pristresok-koverta-3000x5200', typ: 'Prístrešok pre auto Koverta',
      sprava: 'Test: okno „Získajte ponuku šitú na mieru“ na produkte Prístrešok Koverta 3 × 5,2 m. Nie je to skutočný dopyt.',
      krok: async (p) => {
        const tl = p.locator('a[href*="#ponuka"], button[data-k-dopyt-open], [data-k-modal-open]').first();
        await tl.click();
        await p.waitForTimeout(900);
        return p.locator('.kh-modal form[data-k-dopyt]');
      } },
    { nazov: 'test konfigurátora so zostavou', url: 'https://koverta.sk/pages/konfigurator?page=carport', typ: 'Carport Soltec',
      sprava: 'Test: konfigurátor Soltec carport, tlačidlo Poslať túto zostavu s odkazom na 3D zostavu. Nie je to skutočný dopyt.',
      krok: async (p) => {
        await p.waitForFunction(() => document.querySelector('[data-sp-model]'), null, { timeout: 60000 });
        await p.evaluate(() => {
          const m = [...document.querySelectorAll('[data-sp-model]')]; if (m.length > 1) m[m.length - 1].click();
          const f = [...document.querySelectorAll('[data-sp-frame-color]')]; if (f.length > 3) f[3].click();
        });
        await p.waitForTimeout(1500);
        await p.locator('[data-kv-poslat]').first().click();
        await p.waitForTimeout(1500);
        return p.locator('form[data-k-dopyt]').first();
      } },
  ];

  for (const t of pokusy) {
    const p = await ctx.newPage();
    try {
      await p.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(2500);
      await suhlas(p);
      const form = await t.krok(p);
      await form.waitFor({ state: 'visible', timeout: 20000 });
      await vyplnAOdosli(p, form, t.nazov, t.sprava);
    } catch (e) {
      await p.screenshot({ path: `vysledky/chyba-${t.nazov.replace(/[^\w]+/g, '-')}.png` }).catch(() => {});
      zapis(t.nazov, 'STRÁNKA ZLYHALA', String(e.message).split('\n')[0]);
      await priamo(t.nazov, t.typ, t.sprava, t.url);
    }
    await p.close();
    await new Promise((res) => setTimeout(res, 4000));
  }
  fs.writeFileSync('vysledky/vysledky.json', JSON.stringify(vysledky, null, 2));
  await b.close();
})();
