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

    const oznac = (i) => {
      index = i;
      if (count) count.textContent = (i + 1) + ' / ' + slides.length;
      thumbs.forEach((t, n) => {
        t.classList.toggle('is-active', n === i);
        t.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
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
    const add = form.querySelector('[data-kp-add]');
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
          if (add) add.textContent = 'Objednať online za ' + b.dataset.price;
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
    const hlavne = root.querySelector('.kp-akcie');
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

  function init() {
    const root = document.querySelector('[data-kp-product]');
    if (!root || root.dataset.kpReady === 'true') return;
    root.dataset.kpReady = 'true';
    galeria(root); farba(root); lista(root); posun(root);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
