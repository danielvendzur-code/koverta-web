/* Rozmerové produktové stránky Koverta.
   Funguje nad existujúcim generovaným HTML. Bez skriptu ostáva stránka plne
   použiteľná; skript ju iba preskladá a doplní o spoločné predajné sekcie. */
(function () {
  'use strict';

  function start() {
    const match = location.pathname.match(/\/(pristresky-pre-auta|zahradne-pristresky)\/rozmer\/(\d+)x(\d+)\/?$/) ||
      location.pathname.match(/\/pages\/(?:nove-)?(pristresky-pre-auta|zahradne-pristresky)-rozmer-(\d+)x(\d+)\/?$/);
    if (!match) return;
    const main = document.querySelector('main[data-k-root]');
    const band = main && main.querySelector(':scope > .k-band');
    const wrap = band && band.querySelector(':scope > .k-wrap');
    if (!main || !band || !wrap || main.dataset.krHotovo === 'true') return;
    main.dataset.krHotovo = 'true';
    document.body.classList.add('kr-page');
    main.classList.add('kr-main');
    band.classList.add('kr-hero');

    const crumbs = wrap.querySelector('nav[aria-label="Omrvinky"]');
    const title = wrap.querySelector('h1');
    const lead = wrap.querySelector('.k-lead');
    const facts = wrap.querySelector('.kh-fakty__rad');
    const photo = wrap.querySelector('figure');
    const actions = wrap.querySelector('.kh-hero__actions');
    const paragraphs = [].slice.call(wrap.querySelectorAll(':scope > .k-copy'));
    const relatedTitle = wrap.querySelector(':scope > h2');
    const relatedList = wrap.querySelector(':scope > .kv-related');
    if (!crumbs || !title || !lead || !facts || !photo || !actions) return;

    const garden = match[1] === 'zahradne-pristresky';
    const width = Number(match[2]) / 1000;
    const depth = Number(match[3]) / 1000;
    const price = facts.querySelector('.kh-fakty__cislo');

    const grid = document.createElement('div');
    grid.className = 'kr-hero__grid';
    const copy = document.createElement('div');
    copy.className = 'kr-hero__copy';
    const media = document.createElement('div');
    media.className = 'kr-hero__media';

    crumbs.classList.add('kr-crumbs');
    title.classList.add('kr-title');
    lead.classList.add('kr-lead');
    actions.classList.add('kr-hero__actions');

    const kicker = document.createElement('p');
    kicker.className = 'kr-kicker';
    kicker.textContent = garden ? 'Koverta · záhradný prístrešok' : 'Koverta · prístrešok pre autá';
    const priceBox = document.createElement('div');
    priceBox.className = 'kr-price';
    priceBox.innerHTML = '<strong>' + (price ? price.textContent : 'Cena na vyžiadanie') +
      '</strong><span>s DPH, dopravou a montážou</span>';

    copy.appendChild(crumbs);
    copy.appendChild(kicker);
    copy.appendChild(title);
    copy.appendChild(lead);
    copy.appendChild(priceBox);
    copy.appendChild(actions);

    const image = photo.querySelector('img');
    if (image) {
      image.loading = 'eager';
      image.fetchPriority = 'high';
    }
    media.appendChild(photo);
    const label = document.createElement('div');
    label.className = 'kr-media__label';
    label.innerHTML = '<strong>' + String(width).replace('.', ',') + ' × ' +
      String(depth).replace('.', ',') + ' m</strong><span>katalógový rozmer · výroba na mieru</span>';
    media.appendChild(label);
    grid.appendChild(copy);
    grid.appendChild(media);
    wrap.insertBefore(grid, wrap.firstChild);
    facts.classList.add('kr-facts');
    wrap.appendChild(facts);

    const content = document.createElement('section');
    content.className = 'kr-content';
    const contentWrap = document.createElement('div');
    contentWrap.className = 'k-wrap kr-content__grid';
    const intro = document.createElement('div');
    intro.className = 'kr-content__intro';
    intro.innerHTML = '<p class="k-eyebrow">Navrhnuté pre tento rozmer</p>' +
      '<h2 class="k-h2">' + (garden ? 'Celá terasa zostáva použiteľná.' : 'Miesto pre auto bez kompromisov.') + '</h2>' +
      '<p class="k-copy">Rozmer, konštrukciu aj odvodnenie pred výrobou preveríme na mieste. Zameranie aj cenová ponuka sú bezplatné.</p>';
    const body = document.createElement('div');
    body.className = 'kr-content__copy';
    paragraphs.forEach(function (p) { body.appendChild(p); });

    const gardenItems = [
      ['01', 'Nosná oceľová konštrukcia', 'Vlastná výroba, žiarovo zinkované a lakované diely.'],
      ['02', 'Strecha s odvodnením', 'Voda odchádza žľabom do zvodu pri stĺpe.'],
      ['03', 'Voľná plocha pod strechou', 'Stĺpy stoja na okraji a sedenie neobmedzujú.'],
      ['04', 'Doprava a montáž', 'Hotovú konštrukciu osadí náš montážny tím.']
    ];
    const carItems = [
      ['01', 'Nosná oceľová konštrukcia', 'Vlastná výroba, žiarovo zinkované a lakované diely.'],
      ['02', 'Trapézová strecha', 'Chráni pred dažďom, snehom, slnkom aj krúpami.'],
      ['03', 'Žľab a zvod vody', 'Dažďová voda odchádza kontrolovane pri vybranom stĺpe.'],
      ['04', 'Doprava a montáž', 'Cena zahŕňa dopravu aj odborné osadenie.']
    ];
    const included = document.createElement('div');
    included.className = 'kr-included';
    (garden ? gardenItems : carItems).forEach(function (row) {
      const item = document.createElement('article');
      item.className = 'kr-included__item';
      item.innerHTML = '<span class="kr-included__n">' + row[0] + '</span><strong>' + row[1] +
        '</strong><p>' + row[2] + '</p>';
      included.appendChild(item);
    });
    body.appendChild(included);
    contentWrap.appendChild(intro);
    contentWrap.appendChild(body);
    content.appendChild(contentWrap);
    main.appendChild(content);

    const base = 'https://danielvendzur-code.github.io/koverta-web/assets/';
    const photos = garden ? [
      ['koverta-zahradny-pristresok-bratislava-hero-w1600.webp', 'Záhradný prístrešok Koverta nad terasou'],
      ['koverta-zahradny-pristresok-bratislava-detail.jpg', 'Detail konštrukcie záhradného prístrešku'],
      ['foto/20250522_144729-w1200.jpg', 'Zastrešené záhradné posedenie Koverta']
    ] : [
      ['koverta-pristresok-vahovce-takac-upscaled-w1600.webp', 'Dvojitý prístrešok Koverta pri rodinnom dome'],
      ['koverta-pristresok-drevene-lamely-bocna-vypln-w1000.webp', 'Drevená lamelová výplň prístrešku Koverta'],
      ['koverta-pristresok-pre-auto-pred-domom-w1000.webp', 'Prístrešok Koverta pre auto pred domom']
    ];
    const gallery = document.createElement('section');
    gallery.className = 'kr-gallery';
    const galleryWrap = document.createElement('div');
    galleryWrap.className = 'k-wrap';
    const realizationUrl = location.hostname.indexOf('github.io') > -1
      ? '/koverta-web/realizacie/' : '/pages/nove-realizacie';
    galleryWrap.innerHTML = '<header class="kr-gallery__head"><div><p class="k-eyebrow">Reálne realizácie</p>' +
      '<h2 class="k-h2">Takto vyzerá Koverta pri dome.</h2></div>' +
      '<a class="k-btn k-btn--line" href="' + realizationUrl + '">Pozrieť všetky realizácie</a></header>';
    const galleryGrid = document.createElement('div');
    galleryGrid.className = 'kr-gallery__grid';
    photos.forEach(function (row) {
      const figure = document.createElement('figure');
      figure.innerHTML = '<img src="' + base + row[0] + '" alt="' + row[1] + '" loading="lazy" decoding="async">';
      galleryGrid.appendChild(figure);
    });
    galleryWrap.appendChild(galleryGrid);
    gallery.appendChild(galleryWrap);
    main.appendChild(gallery);

    if (relatedTitle && relatedList) {
      const related = document.createElement('section');
      related.className = 'kr-related';
      const relatedWrap = document.createElement('div');
      relatedWrap.className = 'k-wrap';
      relatedWrap.appendChild(relatedTitle);
      relatedWrap.appendChild(relatedList);
      related.appendChild(relatedWrap);
      main.appendChild(related);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  document.addEventListener('shopify:section:load', start);
})();
