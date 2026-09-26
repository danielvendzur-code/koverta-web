/* Koverta · produktová stránka: galéria, farba a lepivý pruh na telefóne.
   Dopyt aj jeho predvyplnenie rieši koverta-2026.js (data-k-dopyt); tu sa
   len drží aktuálna farba v texte, ktorý sa do dopytu vloží. */
(function () {
  'use strict';

  function galeria(root) {
    const g = root.querySelector('[data-kp-gallery]');
    if (!g) return;
    const track = g.querySelector('[data-kp-track]');
    const slides = [...g.querySelectorAll('[data-kp-slide]')];
    const thumbs = [...g.querySelectorAll('[data-kp-thumb]')];
    const count = g.querySelector('[data-kp-count]');
    if (!track || !slides.length) return;
    let index = 0;

    /* Na telefóne a tablete nie sú náhľady ani šípky — bodky ukážu, koľko
       fotiek je a ktorá sa práve ukazuje (CSS ich zobrazí len tam). */
    const bodky = [];
    if (slides.length > 1 && slides.length <= 10) {
      const rad = document.createElement('div');
      rad.className = 'kp-gal__bodky';
      rad.setAttribute('aria-hidden', 'true');
      slides.forEach(() => { const b = document.createElement('span'); rad.appendChild(b); bodky.push(b); });
      (count ? count.parentNode : track.parentNode).appendChild(rad);
      g.classList.add('ma-bodky');
    }

    const oznac = (i) => {
      index = i;
      if (count) count.textContent = (i + 1) + ' / ' + slides.length;
      thumbs.forEach((t, n) => {
        t.classList.toggle('is-active', n === i);
        t.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      bodky.forEach((b, n) => b.classList.toggle('is-active', n === i));
    };
    const chod = (i) => {
      const n = (i + slides.length) % slides.length;
      track.scrollTo({ left: slides[n].offsetLeft, behavior: 'smooth' });
      oznac(n);
    };

    /* Poloha sa číta zo skutočného posunu pásu, takže sedí aj pri potiahnutí
       prstom, nielen pri kliknutí na šípku. */
    let cakaj = 0;
    track.addEventListener('scroll', () => {
      window.cancelAnimationFrame(cakaj);
      cakaj = window.requestAnimationFrame(() => {
        const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        if (i !== index && i >= 0 && i < slides.length) oznac(i);
      });
    }, { passive: true });

    const spat = g.querySelector('[data-kp-prev]');
    const dalej = g.querySelector('[data-kp-next]');
    oznac(0);
    if (slides.length < 2) g.classList.add('je-jedna');
    if (spat) spat.addEventListener('click', () => chod(index - 1));
    if (dalej) dalej.addEventListener('click', () => chod(index + 1));
    thumbs.forEach((t) => t.addEventListener('click', () => chod(Number(t.dataset.index) || 0)));
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); chod(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); chod(index + 1); }
    });
  }

  function farba(root) {
    const form = root.querySelector('.kp-farba');
    if (!form) return;
    const input = form.querySelector('[data-kp-variant]');
    const nazov = form.querySelector('[data-kp-color-name]');
    const ceny = root.querySelectorAll('[data-kp-price], [data-kp-sticky-price]');
    const cta = root.querySelectorAll('[data-kp-cta]');

    form.querySelectorAll('[data-kp-swatch]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const stara = nazov ? nazov.textContent.trim() : '';
        const nova = b.getAttribute('title') || '';
        form.querySelectorAll('[data-kp-swatch]').forEach((x) => {
          x.classList.toggle('is-active', x === b);
          x.setAttribute('aria-checked', x === b ? 'true' : 'false');
        });
        if (input) input.value = b.dataset.variantId;
        if (nazov) nazov.textContent = nova;
        if (b.dataset.price) {
          ceny.forEach((c) => { c.textContent = b.dataset.price; });
        }
        /* Text dopytu nesie farbu, ktorú človek práve vybral. */
        cta.forEach((a) => {
          ['kDopyt', 'kDopytKontext'].forEach((k) => {
            if (a.dataset[k] && stara) a.dataset[k] = a.dataset[k].split(stara).join(nova);
          });
        });
        const url = new URL(window.location.href);
        url.searchParams.set('variant', b.dataset.variantId);
        window.history.replaceState({}, '', url);
      });
    });
  }

  /* Pruh s cenou a tlačidlom sa na telefóne ukáže, keď hlavné tlačidlo
     odíde z obrazovky, a zmizne pri formulári, aby ho neprekrýval. */
  function lista(root) {
    const pruh = root.querySelector('[data-kp-sticky]');
    const hlavne = root.querySelector('.kp-kosik');
    const ponuka = root.querySelector('#ponuka');
    if (!pruh || !hlavne || !('IntersectionObserver' in window)) return;
    pruh.hidden = false;
    let hore = true, pri = false;
    const prepni = () => pruh.classList.toggle('is-on', !hore && !pri);
    new IntersectionObserver(([z]) => { hore = z.isIntersecting || z.boundingClientRect.top > 0; prepni(); }).observe(hlavne);
    if (ponuka) new IntersectionObserver(([z]) => { pri = z.isIntersecting; prepni(); }, { threshold: 0.05 }).observe(ponuka);
  }

  function posun(root) {
    root.querySelectorAll('[data-kp-scroll]').forEach((b) => b.addEventListener('click', () => {
      const ciel = document.querySelector(b.dataset.kpScroll);
      if (ciel) ciel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  /* Na telefóne ostane otvorená len skupina rozmerov s aktuálnym rozmerom. */
  function rozmery(root) {
    if (!window.matchMedia('(max-width: 899px)').matches) return;
    const skupiny = [...root.querySelectorAll('.kp-size__skupina')];
    if (skupiny.length < 2) return;
    skupiny.forEach((d) => { if (!d.querySelector('[aria-current="page"]')) d.open = false; });
  }

  /* Realizácie pod produktom: klik na fotku ju otvorí zväčšenú s obcou
     a rozmerom, šípkami (aj na klávesnici) sa prechádza na ďalšie. Natívny
     <dialog> rieši zameranie aj Esc sám. Bez skriptu ostávajú obyčajné
     fotky, nič sa nerozbije. */
  function realizacie(root) {
    const figury = [...root.querySelectorAll('.kr-gallery__grid figure')];
    if (!figury.length || typeof HTMLDialogElement !== 'function') return;
    const velka = (img) => {
      const zdroje = (img.getAttribute('srcset') || '').split(',').map((x) => x.trim().split(/\s+/));
      zdroje.sort((x, y) => (parseInt(y[1], 10) || 0) - (parseInt(x[1], 10) || 0));
      return (zdroje[0] && zdroje[0][0]) || img.currentSrc || img.src;
    };
    const d = document.createElement('dialog');
    d.className = 'kp-lb';
    d.setAttribute('aria-label', 'Realizácia');
    d.innerHTML = '<figure class="kp-lb__fig"><img alt=""><figcaption><strong></strong><span></span><small></small></figcaption></figure>'
      + '<button type="button" class="kp-lb__btn kp-lb__btn--spat" aria-label="Predchádzajúca realizácia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>'
      + '<button type="button" class="kp-lb__btn kp-lb__btn--dalej" aria-label="Ďalšia realizácia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>'
      + '<button type="button" class="kp-lb__zavriet" aria-label="Zavrieť"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    document.body.appendChild(d);
    const obr = d.querySelector('img');
    const [nazov, popis, poradie] = d.querySelectorAll('figcaption > *');
    let i = 0;
    const ukaz = (n) => {
      i = (n + figury.length) % figury.length;
      const f = figury[i], img = f.querySelector('img');
      obr.src = velka(img);
      obr.alt = img.alt;
      nazov.textContent = (f.querySelector('figcaption strong') || {}).textContent || '';
      popis.textContent = (f.querySelector('figcaption span') || {}).textContent || '';
      poradie.textContent = (i + 1) + ' / ' + figury.length;
    };
    figury.forEach((f, n) => {
      f.tabIndex = 0;
      f.setAttribute('role', 'button');
      f.setAttribute('aria-label', 'Zväčšiť fotku: ' + ((f.querySelector('img') || {}).alt || 'realizácia'));
      const otvor = () => { ukaz(n); d.showModal(); };
      f.addEventListener('click', otvor);
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otvor(); } });
    });
    d.querySelector('.kp-lb__btn--spat').addEventListener('click', () => ukaz(i - 1));
    d.querySelector('.kp-lb__btn--dalej').addEventListener('click', () => ukaz(i + 1));
    d.querySelector('.kp-lb__zavriet').addEventListener('click', () => d.close());
    /* Klik mimo fotky (na tmavé pozadie) zatvára. */
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') ukaz(i - 1);
      if (e.key === 'ArrowRight') ukaz(i + 1);
    });
    /* Na telefóne sa listuje potiahnutím prsta. */
    let x0 = null;
    d.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    d.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) ukaz(i + (dx < 0 ? 1 : -1));
    });
  }

  function init() {
    const root = document.querySelector('[data-kp-product]');
    if (!root || root.dataset.kpReady === 'true') return;
    root.dataset.kpReady = 'true';
    galeria(root); farba(root); lista(root); posun(root); rozmery(root); realizacie(root);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
