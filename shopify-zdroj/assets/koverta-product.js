(() => {
  function init(root) {
    const product = root.matches?.('[data-kp-product]') ? root : root.querySelector?.('[data-kp-product]');
    if (!product || product.dataset.kpReady === '1') return;
    product.dataset.kpReady = '1';
    const main = product.querySelector('[data-kp-main]');
    const lightbox = product.querySelector('[data-kp-lightbox]');
    const lightboxImg = product.querySelector('[data-kp-lightbox-image]');
    const thumbs = [...product.querySelectorAll('[data-kp-thumb]')];
    const count = product.querySelector('[data-kp-count]');
    let current = 0;
    function show(index) {
      if (!main || !thumbs.length) return;
      current = (index + thumbs.length) % thumbs.length;
      const thumb = thumbs[current];
      main.src = thumb.dataset.full || main.src;
      if (thumb.dataset.srcset) main.srcset = thumb.dataset.srcset;
      main.alt = thumb.dataset.alt || main.alt;
      thumbs.forEach((el, i) => el.classList.toggle('is-active', i === current));
      if (count) count.textContent = (current + 1) + ' / ' + thumbs.length;
      if (lightboxImg) { lightboxImg.src = main.src; lightboxImg.alt = main.alt; }
    }
    thumbs.forEach((thumb, index) => thumb.addEventListener('click', () => show(index)));
    product.querySelector('[data-kp-prev]')?.addEventListener('click', () => show(current - 1));
    product.querySelector('[data-kp-next]')?.addEventListener('click', () => show(current + 1));
    product.querySelector('[data-kp-lightbox-open]')?.addEventListener('click', () => {
      if (!lightbox || typeof lightbox.showModal !== 'function') return;
      if (lightboxImg && main) { lightboxImg.src = main.currentSrc || main.src; lightboxImg.alt = main.alt; }
      lightbox.showModal();
    });
    product.querySelector('[data-kp-lightbox-close]')?.addEventListener('click', () => lightbox?.close());
    lightbox?.addEventListener('click', (event) => { if (event.target === lightbox) lightbox.close(); });

    const select = product.querySelector('[data-kp-variant]');
    const price = product.querySelector('[data-kp-price]');
    const stickyPrice = product.querySelector('[data-kp-sticky-price]');
    const buttonPrice = product.querySelector('[data-kp-button-price]');
    const add = product.querySelector('[data-kp-add]');
    const label = product.querySelector('[data-kp-add-label]');
    const colorName = product.querySelector('[data-kp-color-name]');
    const swatches = [...product.querySelectorAll('[data-kp-swatch]')];
    function syncVariant() {
      if (!select) return;
      const option = select.options[select.selectedIndex];
      const formatted = option?.dataset.price || '';
      const available = option?.dataset.available === 'true';
      if (price && formatted) price.textContent = formatted;
      if (stickyPrice && formatted) stickyPrice.textContent = formatted;
      if (buttonPrice && formatted) buttonPrice.textContent = formatted;
      if (add) add.disabled = !available;
      if (label) label.textContent = available ? 'Pridať do košíka' : 'Momentálne nedostupné';
      if (colorName && option) colorName.textContent = option.textContent.replace(/\s+—\s+momentálne nedostupné$/, '').trim();
      swatches.forEach((swatch) => {
        const active = swatch.dataset.variantId === select.value;
        swatch.classList.toggle('is-active', active);
        swatch.setAttribute('aria-checked', active ? 'true' : 'false');
        swatch.tabIndex = active ? 0 : -1;
      });
    }
    select?.addEventListener('change', syncVariant);
    swatches.forEach((swatch, index) => {
      swatch.addEventListener('click', () => {
        if (!select || swatch.disabled) return;
        select.value = swatch.dataset.variantId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      swatch.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        let next = index;
        do next = (next + direction + swatches.length) % swatches.length;
        while (swatches[next]?.disabled && next !== index);
        swatches[next]?.focus();
        swatches[next]?.click();
      });
    });
    syncVariant();
  }
  function boot(root = document) {
    if (root.matches?.('[data-kp-product]')) init(root);
    root.querySelectorAll?.('[data-kp-product]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  else boot();
  document.addEventListener('shopify:section:load', (event) => boot(event.target));
})();
