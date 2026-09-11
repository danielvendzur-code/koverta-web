from pathlib import Path
import re
import subprocess

JS = Path('assets/koverta-2026.js')
CSS = Path('assets/koverta-2026.css')
js = JS.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

JS_MARKER = '/* BATCH 5 · HEADER MENU INFORMATION ARCHITECTURE */'
CSS_MARKER = '/* BATCH 5 · HEADER MENU INFORMATION ARCHITECTURE */'
if JS_MARKER in js or CSS_MARKER in css:
    raise SystemExit('batch 5 marker already present')

anchor = '    /* mega menu — otvára sa hoverom aj klávesnicou, zatvára Escapom */\n'
if js.count(anchor) != 1:
    raise SystemExit(f'expected one mega-menu anchor, got {js.count(anchor)}')

batch5_js = r'''    /* BATCH 5 · HEADER MENU INFORMATION ARCHITECTURE */
    /*
       HTML zostáva funkčný aj bez skriptu. Tu sa iba preskupí už existujúci
       obsah do značiek Koverta / Soltec, doplnia sa orientačné vety a
       obrazové položky realizácií. Odkazy sa nemenia.
    */
    const menuAsset = (name) => {
      const link = document.querySelector('link[rel="stylesheet"][href*="koverta-2026.css"]');
      const href = link ? (link.getAttribute('href') || '') : '';
      const base = href ? href.replace(/koverta-2026\.css.*$/, '') : './assets/';
      return base + name;
    };

    const menuLabel = (item) => {
      const t = item && item.querySelector('[data-k-mega-trigger]');
      return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
    };

    const setMenuPhoto = (li, filename) => {
      const img = li && li.querySelector('.kv-mega__foto img');
      if (!img || !filename) return;
      img.removeAttribute('src');
      img.removeAttribute('srcset');
      img.setAttribute('data-k-menu-src', menuAsset(filename));
    };

    const setDrawerPhoto = (hrefPart, filename) => {
      header.querySelectorAll('.kv-drawer__rad a').forEach((a) => {
        if (!(a.getAttribute('href') || '').includes(hrefPart)) return;
        const img = a.querySelector('.kv-drawer__foto img');
        if (img) img.setAttribute('src', menuAsset(filename));
      });
    };

    const addDesc = (li, text) => {
      if (!li || !text) return;
      const a = li.querySelector(':scope > a');
      const strong = a && a.querySelector(':scope > strong');
      if (!a || !strong || a.querySelector('.kv-mega__desc')) return;
      const d = document.createElement('span');
      d.className = 'kv-mega__desc';
      d.textContent = text;
      strong.insertAdjacentElement('afterend', d);
    };

    const makeBrand = (name, lis) => {
      if (!lis.length) return null;
      const section = document.createElement('section');
      section.className = 'kv-mega__brand kv-mega__brand--' + name.toLowerCase();
      section.setAttribute('aria-label', name);

      const head = document.createElement('div');
      head.className = 'kv-mega__brand-head';
      const sourceLogo = lis[0].querySelector('.kv-mega__znacka img');
      if (sourceLogo) {
        const logoWrap = document.createElement('span');
        logoWrap.className = 'kv-mega__brand-logo';
        const logo = sourceLogo.cloneNode(true);
        logo.alt = name;
        logoWrap.appendChild(logo);
        head.appendChild(logoWrap);
      } else {
        const label = document.createElement('strong');
        label.textContent = name;
        head.appendChild(label);
      }
      section.appendChild(head);

      const list = document.createElement('ul');
      list.className = 'kv-mega__brand-grid';
      lis.forEach((li) => list.appendChild(li));
      section.appendChild(list);
      return section;
    };

    const enhanceProducts = (item, kind) => {
      if (!item || item.dataset.kBatch5 === 'true') return;
      const panel = item.querySelector('.kv-mega');
      const oldList = panel && panel.querySelector(':scope > .kv-mega__rad');
      if (!panel || !oldList) return;
      const lis = [].slice.call(oldList.children).filter((n) => n.tagName === 'LI');
      if (!lis.length) return;

      const groups = { Koverta: [], Soltec: [] };
      lis.forEach((li) => {
        const logo = li.querySelector('.kv-mega__znacka img');
        const brand = logo && /soltec/i.test(logo.alt || '') ? 'Soltec' : 'Koverta';
        groups[brand].push(li);
      });

      const wrap = document.createElement('div');
      wrap.className = 'kv-mega__brands';
      const k = makeBrand('Koverta', groups.Koverta);
      const s = makeBrand('Soltec', groups.Soltec);
      if (k) wrap.appendChild(k);
      if (s) wrap.appendChild(s);
      panel.insertBefore(wrap, oldList);
      oldList.remove();
      panel.classList.add('kv-mega--batch5', 'kv-mega--' + kind);
      item.dataset.kBatch5 = 'true';
    };

    const megaItemsBatch5 = [].slice.call(header.querySelectorAll('[data-k-mega-item]'));
    const autaItem = megaItemsBatch5.find((item) => /^Pre autá$/.test(menuLabel(item)));
    const domItem = megaItemsBatch5.find((item) => /^Pre dom a záhradu$/.test(menuLabel(item)));
    const realItem = megaItemsBatch5.find((item) => /^Realizácie$/.test(menuLabel(item)));

    if (autaItem) {
      const lis = autaItem.querySelectorAll('.kv-mega__rad > li');
      if (lis[0]) {
        setMenuPhoto(lis[0], 'koverta-pristresok-auto-trnava-sikmy.jpg');
        addDesc(lis[0], 'Pre 1 až 3 autá, oceľ a hliník z vlastnej výroby.');
      }
      if (lis[1]) {
        setMenuPhoto(lis[1], 'soltec-carport-toth-nitra-hero.jpg');
        addDesc(lis[1], 'Prémiový hliníkový systém s čistou architektúrou.');
      }
      enhanceProducts(autaItem, 'cars');
    }

    if (domItem) {
      const lis = [].slice.call(domItem.querySelectorAll('.kv-mega__rad > li'));
      const byHref = (part) => lis.find((li) => ((li.querySelector('a') || {}).href || '').includes(part));
      setMenuPhoto(byHref('zahradne-pristresky'), 'koverta-zahradny-pristresok-bratislava-hero.jpg');
      setMenuPhoto(byHref('pevne-prestresenia'), 'soltec-pevne-prestresenie-mokrance.jpg');
      setMenuPhoto(byHref('bioklimaticke-pergoly'), 'soltec-bioklimaticka-pergola-limbach.jpg');
      setMenuPhoto(byHref('tienenie'), 'soltec-accessory-zip.jpg');
      setMenuPhoto(byHref('outdoor-kuchyne'), 'soltec-outdoor-kuchyna-graz.jpg');
      addDesc(byHref('zahradne-pristresky'), 'Oceľové prestrešenie terasy, vstupu alebo posedenia.');
      addDesc(byHref('pevne-prestresenia'), 'Pevná strecha s čistou hliníkovou konštrukciou.');
      addDesc(byHref('bioklimaticke-pergoly'), 'Otočné lamely pre tienenie aj ochranu pred dažďom.');
      addDesc(byHref('tienenie'), 'ZIP rolety, panely a brisoleje.');
      addDesc(byHref('outdoor-kuchyne'), 'Modulové zostavy z nerezu a hliníka.');
      enhanceProducts(domItem, 'home');
    }

    if (realItem && realItem.dataset.kBatch5 !== 'true') {
      const panel = realItem.querySelector('.kv-mega');
      const list = panel && panel.querySelector('.kv-pod');
      if (panel && list) {
        const photos = ['koverta-pristresok-auto-trnava-sikmy.jpg', 'koverta-carport-lamely-stena.jpg'];
        [].slice.call(list.querySelectorAll(':scope > li')).forEach((li, i) => {
          const a = li.querySelector(':scope > a');
          if (!a) return;
          const photo = document.createElement('span');
          photo.className = 'kv-mega__foto';
          const img = document.createElement('img');
          img.setAttribute('data-k-menu-src', menuAsset(photos[i] || photos[0]));
          img.loading = 'lazy';
          img.decoding = 'async';
          img.alt = i === 0 ? 'Realizácia prístrešku Koverta pri rodinnom dome' : 'Detail realizácie prístrešku Koverta';
          photo.appendChild(img);
          a.insertBefore(photo, a.firstChild);

          const text = document.createElement('span');
          text.className = 'kv-mega__real-text';
          while (photo.nextSibling) text.appendChild(photo.nextSibling);
          a.appendChild(text);
        });
        list.classList.remove('kv-pod');
        list.classList.add('kv-mega__real-grid');
        panel.classList.remove('kv-mega--uzke');
        panel.classList.add('kv-mega--batch5', 'kv-mega--real');
        realItem.dataset.kBatch5 = 'true';
      }
    }

    /* Rovnaké overené fotografie aj v mobilnej zásuvke. */
    setDrawerPhoto('pristresky-pre-auta', 'koverta-pristresok-auto-trnava-sikmy.jpg');
    setDrawerPhoto('carport-soltec', 'soltec-carport-toth-nitra-hero.jpg');
    setDrawerPhoto('zahradne-pristresky', 'koverta-zahradny-pristresok-bratislava-hero.jpg');
    setDrawerPhoto('pevne-prestresenia', 'soltec-pevne-prestresenie-mokrance.jpg');
    setDrawerPhoto('bioklimaticke-pergoly', 'soltec-bioklimaticka-pergola-limbach.jpg');
    setDrawerPhoto('tienenie', 'soltec-accessory-zip.jpg');
    setDrawerPhoto('outdoor-kuchyne', 'soltec-outdoor-kuchyna-graz.jpg');

    const drawerReal = [].slice.call(header.querySelectorAll('.kv-drawer__sk')).find((d) => {
      const s = d.querySelector(':scope > summary');
      return s && /^Realizácie/.test(s.textContent.trim());
    });
    if (drawerReal && drawerReal.dataset.kBatch5 !== 'true') {
      const list = drawerReal.querySelector('.kv-drawer__rad');
      const photos = ['koverta-pristresok-auto-trnava-sikmy.jpg', 'koverta-carport-lamely-stena.jpg'];
      if (list) {
        list.classList.remove('kv-drawer__rad--text');
        list.classList.add('kv-drawer__rad--real');
        [].slice.call(list.querySelectorAll(':scope > li')).forEach((li, i) => {
          const a = li.querySelector(':scope > a');
          if (!a || a.querySelector('.kv-drawer__foto')) return;
          const photo = document.createElement('span');
          photo.className = 'kv-drawer__foto';
          const img = document.createElement('img');
          img.src = menuAsset(photos[i] || photos[0]);
          img.loading = 'lazy';
          img.decoding = 'async';
          img.alt = i === 0 ? 'Realizácia prístrešku Koverta' : 'Detail realizácie prístrešku Koverta';
          photo.appendChild(img);
          const body = document.createElement('span');
          body.className = 'kv-drawer__telo';
          while (a.firstChild) body.appendChild(a.firstChild);
          a.appendChild(photo);
          a.appendChild(body);
        });
      }
      drawerReal.dataset.kBatch5 = 'true';
    }

'''

js = js.replace(anchor, batch5_js + anchor, 1)

css += r'''

/* BATCH 5 · HEADER MENU INFORMATION ARCHITECTURE */
@media (min-width: 1024px) {
  .kv-header .kv-mega--batch5 {
    left: 0;
    right: 0;
    width: auto;
    max-width: none;
    top: calc(100% + 8px);
    padding: clamp(18px, 1.8vw, 24px);
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 18px 42px rgba(18, 23, 26, .11);
    overflow: auto;
    max-height: min(50vh, 390px);
  }

  .kv-header .kv-mega__brands {
    display: grid;
    gap: clamp(20px, 2vw, 30px);
    min-width: 0;
  }
  .kv-header .kv-mega--cars .kv-mega__brands { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kv-header .kv-mega--home .kv-mega__brands { grid-template-columns: minmax(260px, .8fr) minmax(0, 1.7fr); }

  .kv-header .kv-mega__brand { min-width: 0; }
  .kv-header .kv-mega__brand + .kv-mega__brand {
    border-left: 1px solid var(--k-hair);
    padding-left: clamp(20px, 2vw, 30px);
  }
  .kv-header .kv-mega__brand-head {
    display: flex;
    align-items: center;
    min-height: 25px;
    margin-bottom: 12px;
  }
  .kv-header .kv-mega__brand-logo { display: inline-flex; align-items: center; }
  .kv-header .kv-mega__brand-logo img {
    display: block;
    width: auto;
    max-width: 108px;
    height: 18px;
    object-fit: contain;
    object-position: left center;
  }
  .kv-header .kv-mega__brand--soltec .kv-mega__brand-logo img { height: 20px; max-width: 94px; }

  .kv-header .kv-mega__brand-grid,
  .kv-header .kv-mega__real-grid {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .kv-header .kv-mega__brand-grid > li,
  .kv-header .kv-mega__real-grid > li { margin: 0; min-width: 0; }
  .kv-header .kv-mega__brand-grid > li::before,
  .kv-header .kv-mega__real-grid > li::before { content: none; }
  .kv-header .kv-mega__brand-grid .kv-mega__znacka { display: none; }

  .kv-header .kv-mega__brand-grid a,
  .kv-header .kv-mega__real-grid a {
    color: var(--k-ink);
    border-radius: 12px;
    transition: background-color 170ms var(--k-ease), transform 170ms var(--k-ease);
  }
  .kv-header .kv-mega__brand-grid a:hover,
  .kv-header .kv-mega__brand-grid a:focus-visible,
  .kv-header .kv-mega__real-grid a:hover,
  .kv-header .kv-mega__real-grid a:focus-visible {
    background: var(--k-bone);
    transform: translateY(-1px);
  }

  .kv-header .kv-mega--cars .kv-mega__brand-grid a {
    display: grid;
    grid-template-columns: minmax(150px, 42%) minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 14px;
    padding: 8px;
  }
  .kv-header .kv-mega--cars .kv-mega__foto {
    grid-row: 1 / 3;
    display: block;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border-radius: 9px;
    background: var(--k-bone-deep);
  }
  .kv-header .kv-mega--cars .kv-mega__foto img,
  .kv-header .kv-mega--home .kv-mega__foto img,
  .kv-header .kv-mega--real .kv-mega__foto img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .kv-header .kv-mega__brand-grid strong,
  .kv-header .kv-mega__real-grid strong {
    display: block;
    min-width: 0;
    font-family: var(--k-head);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.22;
    letter-spacing: -.015em;
  }
  .kv-header .kv-mega__desc,
  .kv-header .kv-mega__real-text > span {
    display: block;
    margin-top: 4px;
    color: var(--k-muted);
    font-size: 12px;
    line-height: 1.38;
  }

  .kv-header .kv-mega--home .kv-mega__brand--koverta .kv-mega__brand-grid a {
    display: grid;
    gap: 10px;
    padding: 8px;
  }
  .kv-header .kv-mega--home .kv-mega__brand--koverta .kv-mega__foto {
    display: block;
    overflow: hidden;
    aspect-ratio: 16 / 8.6;
    border-radius: 9px;
    background: var(--k-bone-deep);
  }
  .kv-header .kv-mega--home .kv-mega__brand--soltec .kv-mega__brand-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .kv-header .kv-mega--home .kv-mega__brand--soltec .kv-mega__brand-grid a {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 11px;
    padding: 7px;
    min-height: 82px;
  }
  .kv-header .kv-mega--home .kv-mega__brand--soltec .kv-mega__foto {
    grid-row: 1 / 3;
    display: block;
    overflow: hidden;
    width: 104px;
    height: 68px;
    border-radius: 8px;
    background: var(--k-bone-deep);
  }
  .kv-header .kv-mega--home .kv-mega__brand--soltec .kv-mega__desc {
    margin-top: 2px;
    font-size: 11.5px;
  }

  .kv-header .kv-mega--real { max-width: 920px; right: auto; }
  .kv-header .kv-mega__real-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .kv-header .kv-mega__real-grid a {
    display: grid;
    grid-template-columns: 156px minmax(0, 1fr);
    align-items: center;
    gap: 14px;
    padding: 8px;
  }
  .kv-header .kv-mega--real .kv-mega__foto {
    display: block;
    overflow: hidden;
    width: 156px;
    aspect-ratio: 16 / 9;
    border-radius: 9px;
    background: var(--k-bone-deep);
  }
  .kv-header .kv-mega__real-text { display: block; min-width: 0; }

  /* Staré ploché menu sa po JS transformácii nesmie presadiť neskoršími
     historickými override pravidlami. */
  .kv-header .kv-mega--batch5 .kv-mega__brand-grid > li { max-width: none; flex: none; }
}

/* Mobil ostáva zásuvka: rovnaká navigácia, kratší vizuálny rytmus. */
@media (max-width: 1023px) {
  .kv-drawer__rad--real a {
    grid-template-columns: 96px minmax(0, 1fr);
    padding: 7px;
  }
  .kv-drawer__rad--real .kv-drawer__telo { gap: 4px; }
}
'''

JS.write_text(js, encoding='utf-8')
CSS.write_text(css, encoding='utf-8')

# Global assets changed, so every public HTML page that references them gets
# the same cache key. No navigation/content URLs are touched.
VERSION = '2026091105'
html_changed = []
for path in sorted(Path('.').rglob('*.html')):
    if any(part in {'.git', 'node_modules', 'qa', 'artifacts'} for part in path.parts):
        continue
    text = path.read_text(encoding='utf-8')
    if 'koverta-2026.css' not in text and 'koverta-2026.js' not in text:
        continue
    new = re.sub(r'(koverta-2026\.(?:css|js))(?:\?v=[^"\'<>\s]*)?', rf'\1?v={VERSION}', text)
    if new != text:
        path.write_text(new, encoding='utf-8')
        html_changed.append(str(path))

if not html_changed:
    raise SystemExit('no HTML cache references changed')

# Guard the scope before CI proceeds.
changed = set(subprocess.check_output(['git', 'diff', '--name-only'], text=True).splitlines())
required = {'assets/koverta-2026.js', 'assets/koverta-2026.css'}
if not required.issubset(changed):
    raise SystemExit(f'missing required product files: {sorted(required - changed)}')
for p in changed - required:
    if not p.endswith('.html'):
        raise SystemExit(f'unexpected batch 5 scope: {p}')

# Hard source-level postconditions.
js_after = JS.read_text(encoding='utf-8')
css_after = CSS.read_text(encoding='utf-8')
for token in [
    JS_MARKER,
    "enhanceProducts(autaItem, 'cars')",
    "enhanceProducts(domItem, 'home')",
    "kv-mega__real-grid",
    "koverta-zahradny-pristresok-bratislava-hero.jpg",
    "soltec-outdoor-kuchyna-graz.jpg",
]:
    if token not in js_after:
        raise SystemExit('missing JS postcondition: ' + token)
for token in [CSS_MARKER, '.kv-mega--home', '.kv-mega__brand--soltec', '.kv-mega__real-grid']:
    if token not in css_after:
        raise SystemExit('missing CSS postcondition: ' + token)

# All HTML references in changed pages must carry the new key.
for p in html_changed:
    text = Path(p).read_text(encoding='utf-8')
    for m in re.finditer(r'koverta-2026\.(?:css|js)(?:\?v=[^"\'<>\s]*)?', text):
        if f'?v={VERSION}' not in m.group(0):
            raise SystemExit(f'{p}: stale asset reference {m.group(0)}')
