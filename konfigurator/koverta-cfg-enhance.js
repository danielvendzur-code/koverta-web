/* ==========================================================================
   KOVERTA — doplnky ku konfigurátoru
   ==========================================================================
   Nadstavba nad `soltec-premium.js`. Nič v ňom neprepisuje ani nepatchuje —
   len pridáva ovládanie navrch a hovorí s konfigurátorom cez tie isté udalosti,
   aké posiela prehliadač pri ťahaní posuvníka. Keď sa runtime aktualizuje,
   tento súbor prežije.

   Čo pridáva:
   1) Rozmer sa dá napísať. Na presné číslo sa posuvníkom trafiť nedá.
   2) Fullscreen posunie pohľad rovno na konfigurátor, aby sa nemuselo scrollovať.
   3) Pri Koverta variante vie odoslať dopyt na atypický rozmer bez vymyslenej ceny.
   ========================================================================== */
(function () {
  'use strict';

  var ROOT_SEL = '#SoltecPremium';

  /* --- pomôcky ---------------------------------------------------------- */

  // „2 500 mm" → 2500. Konfigurátor píše čísla s pevnou medzerou aj s jednotkou.
  function toNumber(text) {
    if (!text) return null;
    var digits = String(text).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  function formatMm(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' mm';
  }

  /* --- 1 · zadanie rozmeru číslom --------------------------------------- */

  // Posuvník je indexový (0..N) a k nemu patrí výpis hodnoty v mm plus
  // popisky minima a maxima. Z tých troch sa dá spočítať, ktorý index
  // zodpovedá napísanému rozmeru; hodnota sa zaokrúhli na najbližší
  // povolený krok, takže sa nedá zadať rozmer, ktorý sa nevyrába.
  function wireNumberInput(slider) {
    if (slider.dataset.kvNum === '1') return;
    var field = slider.closest('.sp-field');
    if (!field) return;

    var out = field.querySelector('[data-sp-w-out], [data-sp-l-out], [data-sp-h-out], .sp-field__value');
    var scale = field.querySelector('.sp-scale');
    if (!out || !scale) return;

    var minEl = scale.children[0];
    var maxEl = scale.children[scale.children.length - 1];
    if (!minEl || !maxEl) return;

    slider.dataset.kvNum = '1';

    var box = document.createElement('span');
    box.className = 'kv-num';

    var input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.className = 'kv-num__in';
    input.setAttribute('aria-label', 'Zadajte rozmer v milimetroch');

    var unit = document.createElement('span');
    unit.className = 'kv-num__unit';
    unit.textContent = 'mm';

    box.appendChild(input);
    box.appendChild(unit);

    // Pole ide VEDĽA výpisu, nie doň. Konfigurátor výpis prepisuje cez
    // textContent a čokoľvek vnútri by pri každej zmene zmizlo.
    out.classList.add('kv-num__src');
    if (out.parentNode) out.parentNode.insertBefore(box, out.nextSibling);

    var syncing = false;

    function readRange() {
      var sMin = parseFloat(slider.min);
      var sMax = parseFloat(slider.max);
      var tMin = toNumber(minEl.textContent);
      var tMax = toNumber(maxEl.textContent);
      // Keď rozsah posuvníka zodpovedá rozmerom v mm, píšeme doň priamo.
      var priame = isFinite(sMin) && isFinite(sMax) && tMin !== null && tMax !== null
        && Math.abs(sMin - tMin) < 2 && Math.abs(sMax - tMax) < 2;
      return { min: tMin, max: tMax, sMin: sMin, sMax: sMax, priame: priame };
    }

    // Z konfigurátora späť do poľa — po každej zmene posuvníka aj po
    // prepnutí modelu, keď sa zmení rozsah.
    function pull() {
      if (syncing) return;
      var val = toNumber(out.textContent);
      if (val !== null && document.activeElement !== input) input.value = val;
      // Keby prekreslenie odstránilo pole, vrátime ho späť.
      if (box.parentNode !== out.parentNode && out.parentNode) {
        out.parentNode.insertBefore(box, out.nextSibling);
      }
    }

    function push() {
      var wanted = toNumber(input.value);
      var r = readRange();
      if (wanted === null || r.min === null || r.max === null) return;
      if (!isFinite(r.sMin) || !isFinite(r.sMax)) return;

      var clamped = Math.min(r.max, Math.max(r.min, wanted));
      var target;
      if (r.priame) {
        target = clamped;
      } else {
        var ratio = r.max === r.min ? 0 : (clamped - r.min) / (r.max - r.min);
        target = Math.round(ratio * (r.sMax - r.sMin)) + r.sMin;
      }

      syncing = true;
      slider.value = String(target);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      syncing = false;

      // Konfigurátor zaokrúhli na najbližší vyrábaný rozmer — ukážeme,
      // čo naozaj nastavil, nie čo bolo napísané.
      window.setTimeout(function () {
        var real = toNumber(out.textContent);
        if (real !== null) {
          input.value = real;
          if (real !== wanted) {
            box.classList.add('is-snapped');
            window.setTimeout(function () { box.classList.remove('is-snapped'); }, 900);
          }
        }
      }, 40);
    }

    input.addEventListener('change', push);
    input.addEventListener('blur', push);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); push(); input.blur(); }
    });
    slider.addEventListener('input', pull);

    // Rozsah aj hodnota sa menia aj mimo našich udalostí (výber modelu),
    // preto sledujeme výpis hodnoty.
    if ('MutationObserver' in window) {
      new MutationObserver(pull).observe(out.parentNode || out, { childList: true, characterData: true, subtree: true });
    }

    pull();
  }

  function wireAll() {
    var root = document.querySelector(ROOT_SEL);
    if (!root) return;
    root.querySelectorAll('.sp-slider').forEach(wireNumberInput);
  }

  /* --- 2 · otvoriť / zatvoriť všetko naraz ------------------------------
     Pri bioklimatickej pergole má zmysel vidieť ju celú zatvorenú alebo celú
     otvorenú jedným klikom. Ovládanie ide cez tie isté prvky, ktoré má
     používateľ — vyberie stranu, nastaví posuvník pohybu, ide na ďalšiu —
     takže sa nedotýkame vnútorného stavu konfigurátora. */

  function sideButtons(root) {
    return [].slice.call(root.querySelectorAll('[data-sp-side]'));
  }

  function setRange(el, value) {
    if (!el || el.disabled) return false;
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /* Strecha aj všetky pohyblivé strany sa majú rozbehnúť naraz a plynulo.
     Predtým to prepínalo stranu po strane a každej nastavilo koncovú hodnotu
     skokom — na obrazovke z toho bol len iný obrázok, hoci práve ten pohyb
     je na bioklimatickej pergole to, čo predáva. Beh si vypýtame od runtimu
     udalosťou; keď runtime hák nemá (staršia verzia), ide sa pôvodnou cestou. */
  function setAll(root, open) {
    var hook = root.querySelector('[data-sp-move-hook]');
    if (hook && typeof window.CustomEvent === 'function') {
      hook.dispatchEvent(new CustomEvent('sp:move', {
        bubbles: true,
        detail: { channel: 'all', to: open ? 1 : 0 }
      }));
      return;
    }

    var pct = open ? 100 : 0;
    var sides = sideButtons(root);
    // Tlačidlá strán sa označujú cez aria-expanded, nie aria-pressed —
    // s nesprávnym atribútom sa pôvodná strana nikdy nevrátila späť.
    var povodna = root.querySelector('[data-sp-side][aria-expanded="true"]');

    sides.forEach(function (btn) {
      if (btn.getAttribute('aria-expanded') !== 'true') btn.click();
      var host = root.querySelector('[data-sp-side-move]');
      if (host && host.hidden) return;          // strana sa nedá hýbať
      setRange(root.querySelector('[data-sp-side-range]'), pct);
    });

    // Vrátiť výber tam, kde bol; keď nebolo nič otvorené, zavrieť posledné.
    if (povodna) {
      if (povodna.getAttribute('aria-expanded') !== 'true') povodna.click();
    } else {
      var posledna = sides[sides.length - 1];
      if (posledna && posledna.getAttribute('aria-expanded') === 'true') posledna.click();
    }

    setRange(root.querySelector('[data-sp-louver-range]'), pct);
  }

  function wireAllToggle() {
    var root = document.querySelector(ROOT_SEL);
    if (!root) return;
    var bar = root.querySelector('.sp-stage__bar');
    // Tlačidlo dáva zmysel len tam, kde sú lamely alebo pohyblivé strany.
    var maLamely = !!root.querySelector('[data-sp-louver-range]');
    if (!bar || !maLamely) return;
    if (bar.querySelector('.kv-allmove')) return;

    var wrap = document.createElement('div');
    wrap.className = 'kv-allmove';

    var zavri = document.createElement('button');
    zavri.type = 'button';
    zavri.className = 'kv-allmove__btn';
    zavri.textContent = 'Zavrieť všetko';

    var otvor = document.createElement('button');
    otvor.type = 'button';
    otvor.className = 'kv-allmove__btn';
    otvor.textContent = 'Otvoriť všetko';

    zavri.addEventListener('click', function () { setAll(root, false); });
    otvor.addEventListener('click', function () { setAll(root, true); });

    wrap.appendChild(zavri);
    wrap.appendChild(otvor);
    bar.appendChild(wrap);
  }

  /* --- 2 · fullscreen bez scrollovania ---------------------------------- */

  function scrollToConfigurator() {
    var el = document.querySelector('[data-sp-cfg]') || document.querySelector(ROOT_SEL);
    if (!el) return;
    window.requestAnimationFrame(function () {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }

  document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement) scrollToConfigurator();
  });

  /* --- 3 · Koverta obchodná logika a payload ---------------------------- */

  function isKovertaPage() {
    var root = document.querySelector(ROOT_SEL);
    return !!root && root.getAttribute('data-sp-page') === 'koverta';
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function rootText(root, selector) {
    var el = root && root.querySelector(selector);
    return el ? cleanText(el.textContent) : '';
  }

  function selectedPlacement(root) {
    var btn = root && root.querySelector('[data-sp-place][aria-pressed="true"]');
    if (!btn) return { id: '', label: 'neuvedené', quoteOnly: true };
    var span = btn.querySelector('span');
    var label = '';
    if (span) {
      var textNodes = [].slice.call(span.childNodes).filter(function (n) {
        return n.nodeType === 3 && cleanText(n.nodeValue);
      });
      label = textNodes.length ? cleanText(textNodes[textNodes.length - 1].nodeValue) : '';
    }
    if (!label) {
      label = cleanText(btn.textContent).replace(/^Možnosť\s+\d+\s*/i, '');
    }
    return {
      id: btn.dataset.spPlace || '',
      label: label || 'neuvedené',
      quoteOnly: (btn.dataset.spPlace || '') !== 'kv-free'
    };
  }

  function activePickRows(root) {
    var titles = { kotvenie: 'Kotvenie stĺpov', odkvap: 'Odkvap a zvod' };
    var rows = [];
    root.querySelectorAll('[data-sp-add-opt^="pick:"][aria-pressed="true"]').forEach(function (btn) {
      var key = String(btn.dataset.spAddOpt || '').slice(5);
      if (!key) return;
      rows.push({
        label: titles[key] || key,
        value: cleanText(btn.textContent)
      });
    });
    return rows;
  }

  function visibleQuoteRows(root) {
    var rows = [];
    root.querySelectorAll('[data-sp-lines] li').forEach(function (li) {
      var label = rootText(li, 'span');
      var value = rootText(li, 'b');
      if (label || value) rows.push({ label: label, value: value });
    });
    return rows;
  }

  function buildKovertaQuote(custom) {
    var root = document.querySelector(ROOT_SEL);
    if (!root || !isKovertaPage()) return null;

    var placement = selectedPlacement(root);
    var rows = visibleQuoteRows(root);
    var existing = {};
    rows.forEach(function (row) { existing[row.label] = true; });
    activePickRows(root).forEach(function (row) {
      var already = rows.some(function (x) {
        return x.label.indexOf(row.label) === 0;
      });
      if (!already) rows.push(row);
    });

    var configuredSize = [
      rootText(root, '[data-sp-w-out]'),
      rootText(root, '[data-sp-l-out]')
    ].filter(Boolean).join(' × ');
    var configuredHeight = rootText(root, '[data-sp-h-out]');
    var frameColor = rootText(root, '[data-sp-frame-val]');
    var total = rootText(root, '[data-sp-total]') || 'na nacenenie';

    var body = [];
    if (custom) {
      body.push('Mám záujem o oceľový prístrešok Koverta v rozmere na mieru.');
      body.push('Požadovaný rozmer: ' + formatMm(custom.w) + ' × ' + formatMm(custom.l) + ', výška ' + formatMm(custom.h) + '.');
      if (custom.note) body.push('Poznámka: ' + custom.note);
      body.push('');
      body.push('Najbližšia katalógová zostava použitá ako referencia: ' + configuredSize + (configuredHeight ? ', výška ' + configuredHeight : '') + '.');
    } else {
      body.push('Mám záujem o oceľový prístrešok Koverta.');
      body.push('Rozmer: ' + configuredSize + (configuredHeight ? ', výška ' + configuredHeight : '') + '.');
    }
    body.push('Umiestnenie: ' + placement.label + (placement.quoteOnly ? ' (na nacenenie)' : '') + '.');
    if (frameColor) body.push('Farba konštrukcie: ' + frameColor + '.');
    if (rows.length) {
      body.push('Zostava:');
      rows.forEach(function (row) {
        body.push('- ' + row.label + (row.value ? ': ' + row.value : ''));
      });
    }
    body.push('Orientačná cena z konfigurátora: ' + total + ', vrátane DPH.');
    body.push('Konečný rozsah montáže, dopravy a položiek označených „na nacenenie“ potvrdíme v ponuke.');
    body.push('');
    body.push('Meno:');
    body.push('Telefón:');
    body.push('Obec realizácie:');

    return {
      body: body.join('\n'),
      subject: custom
        ? 'Prístrešok Koverta — rozmer na mieru ' + custom.w + ' × ' + custom.l + ' mm'
        : 'Konfigurácia Koverta — ' + (configuredSize || 'dopyt'),
      placement: placement,
      total: total,
      rows: rows
    };
  }

  function sendKovertaQuote(custom) {
    var payload = buildKovertaQuote(custom);
    var root = document.querySelector(ROOT_SEL);
    if (!payload || !root) return false;
    var mailto = 'mailto:obchod@koverta.sk?subject='
      + encodeURIComponent(payload.subject)
      + '&body=' + encodeURIComponent(payload.body);
    root.dataset.spQuoteHref = mailto;
    root.dataset.kvQuotePayload = payload.body;
    if (custom) root.dataset.kvCustomQuotePayload = payload.body;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload.body).catch(function () {});
    }
    window.location.href = mailto;
    return true;
  }

  function syncPlacementQuoteState() {
    if (!isKovertaPage()) return;
    var root = document.querySelector(ROOT_SEL);
    var host = root.querySelector('[data-sp-lines]');
    if (!host) return;
    var placement = selectedPlacement(root);
    var old = host.querySelector('[data-kv-placement-line]');
    if (!placement.quoteOnly) {
      if (old) old.parentNode.removeChild(old);
      return;
    }
    if (!old) {
      old = document.createElement('li');
      old.setAttribute('data-kv-placement-line', '');
      host.appendChild(old);
    }
    var stamp = placement.id + '|' + placement.label;
    if (old.dataset.kvStamp !== stamp) {
      old.dataset.kvStamp = stamp;
      old.innerHTML = '<span>Umiestnenie — ' + placement.label + '</span><b>na nacenenie</b>';
    }
    ['[data-sp-total]', '[data-sp-mini-total]'].forEach(function (selector) {
      var el = root.querySelector(selector);
      if (!el) return;
      var value = cleanText(el.textContent);
      if (value && value !== '—' && value.indexOf('od ') !== 0) el.textContent = 'od ' + value;
    });
  }

  function wireReset() {
    if (!isKovertaPage()) return;
    var root = document.querySelector(ROOT_SEL);
    if (root.querySelector('[data-kv-reset]')) return;
    var cap = root.querySelector('.sp-railcap');
    if (!cap) return;
    var link = document.createElement('a');
    link.href = location.pathname + '?page=koverta';
    link.className = 'kv-linkbtn';
    link.setAttribute('data-kv-reset', '');
    link.setAttribute('aria-label', 'Resetovať konfiguráciu Koverta');
    link.textContent = 'Resetovať';
    cap.appendChild(document.createTextNode(' · '));
    cap.appendChild(link);
  }

  function wireKovertaPricing() {
    if (!isKovertaPage()) return;
    wireReset();
    syncPlacementQuoteState();
  }

  // Testovateľný čistý výstup payloadu bez otvárania e-mailového klienta.
  window.KVBuildKovertaQuote = function () {
    return buildKovertaQuote(null);
  };

  document.addEventListener('click', function (event) {
    if (!isKovertaPage()) return;
    var target = event.target.closest && event.target.closest('[data-sp-cfg-quote]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendKovertaQuote(null);
  }, true);

  /* --- 4 · rozmer na mieru ---------------------------------------------- */

  // Cenník má hotové veľkosti a posuvník po nich skáče, takže sa mimo nich
  // nedá nič nastaviť — a to je správne, cena by inak bola vymyslená. Kto
  // potrebuje iný rozmer, si ho tu napíše a odíde s ním do dopytu aj so
  // všetkým, čo si medzitým vyklikal.
  function textOf(sel) {
    var el = document.querySelector(sel);
    return el ? el.textContent.trim() : '';
  }

  function zostava() {
    var riadky = [];
    document.querySelectorAll('[data-sp-lines] li').forEach(function (li) {
      var t = li.textContent.replace(/\s+/g, ' ').trim();
      if (t) riadky.push('- ' + t);
    });
    return riadky;
  }

  function wireCustom() {
    var btn = document.querySelector('[data-kv-custom]');
    if (!btn || btn.dataset.kvWired === '1') return;
    btn.dataset.kvWired = '1';

    var panel = document.createElement('div');
    panel.className = 'kv-custom';
    panel.hidden = true;
    panel.innerHTML = ''
      + '<p class="sp-side-note">Napíšte rozmer, ktorý potrebujete. Pošleme naň cenu po zameraní.</p>'
      + '<div class="kv-custom__row">'
      + '<label>Šírka (mm)<input type="number" min="1" step="1" required data-kv-cw></label>'
      + '<label>Hĺbka (mm)<input type="number" min="1" step="1" required data-kv-cl></label>'
      + '<label>Výška (mm)<input type="number" min="1" step="1" required data-kv-ch></label>'
      + '</div>'
      + '<label class="kv-custom__note">Čo ešte treba vedieť<textarea rows="2" data-kv-cnote placeholder="Napríklad L-tvar, previs okolo stromu, prístrešok pre dodávku…"></textarea></label>'
      + '<p class="sp-side-note" data-kv-cerr role="alert" hidden>Vyplňte všetky tri rozmery kladným číslom v milimetroch.</p>'
      + '<button class="button" type="button" data-kv-csend>Poslať dopyt na tento rozmer</button>';
    btn.parentNode.insertBefore(panel, btn.nextSibling);

    btn.addEventListener('click', function (event) {
      // Zastaví zdieľaný runtime: ten má starší handler data-kv-custom, ktorý
      // inak otvorí mailto skôr, než používateľ zadá atypický rozmer.
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      if (panel.hidden) return;
      var w = document.querySelector('[data-sp-w]'), l = document.querySelector('[data-sp-l]'), h = document.querySelector('[data-sp-h]');
      if (w) panel.querySelector('[data-kv-cw]').value = w.value;
      if (l) panel.querySelector('[data-kv-cl]').value = l.value;
      if (h) panel.querySelector('[data-kv-ch]').value = h.value;
      panel.querySelector('[data-kv-cw]').focus();
    });

    panel.querySelector('[data-kv-csend]').addEventListener('click', function () {
      var wEl = panel.querySelector('[data-kv-cw]');
      var lEl = panel.querySelector('[data-kv-cl]');
      var hEl = panel.querySelector('[data-kv-ch]');
      var err = panel.querySelector('[data-kv-cerr]');
      var w = Number(wEl.value);
      var l = Number(lEl.value);
      var h = Number(hEl.value);
      var bad = !Number.isFinite(w) || w <= 0 || !Number.isFinite(l) || l <= 0 || !Number.isFinite(h) || h <= 0;
      if (bad) {
        if (err) err.hidden = false;
        var firstBad = [wEl, lEl, hEl].find(function (el) {
          var v = Number(el.value);
          return !Number.isFinite(v) || v <= 0;
        });
        if (firstBad) firstBad.focus();
        return;
      }
      if (err) err.hidden = true;
      sendKovertaQuote({
        w: Math.round(w),
        l: Math.round(l),
        h: Math.round(h),
        note: panel.querySelector('[data-kv-cnote]').value.trim()
      });
    });
  }

  /* --- štart ------------------------------------------------------------ */

  // Konfigurátor si obsah vykresľuje sám, preto čakáme, kým sa objaví,
  // a potom sledujeme ďalšie prekreslenia (prepnutie kroku, modelu, stránky).
  function boot() {
    wireAll();
    wireAllToggle();
    wireCustom();
    wireKovertaPricing();
    var root = document.getElementById('kv-root');
    if (root && 'MutationObserver' in window) {
      new MutationObserver(function () { wireAll(); wireAllToggle(); wireCustom(); wireKovertaPricing(); }).observe(root, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();


/* --- Lepivé časti pod lištou webu ----------------------------------------
   Runtime konfigurátora hľadá hlavičku ako `.section-header` — to je trieda
   z pôvodnej témy e-shopu, na tomto webe neexistuje, takže mu vyšlo
   `--sp-sticky-top: 0px` a lepivý panel s krokmi liezol pod lištu.
   Dopočítame to z `.kv-bar`, vrátane toho, že lišta pri scrollovaní nadol
   odchádza a pri návrate sa vracia. Runtime sa nemení. */
(function kvLepivyVrch() {
  var lista = document.querySelector('.kv-bar');
  if (!lista) return;
  var koren = null;
  var poslednaVyska = 0;
  var poslednyStav = null;

  var prepocitaj = function () {
    if (!koren) koren = document.getElementById('SoltecPremium');
    if (!koren) return;
    var r = lista.getBoundingClientRect();
    if (r.height > 0) poslednaVyska = Math.round(r.height);
    /* Lišta je vidieť, keď jej spodná hrana zasahuje do okna. Prepíname len
       medzi dvoma hodnotami, aby to pri každom snímku neposkakovalo. */
    var vidno = r.bottom > 4;
    if (vidno === poslednyStav) return;
    poslednyStav = vidno;
    koren.style.setProperty('--sp-sticky-top', vidno ? poslednaVyska + 'px' : '0px');
  };

  var caka = false;
  var naScroll = function () {
    if (caka) return;
    caka = true;
    requestAnimationFrame(function () { caka = false; prepocitaj(); });
  };

  prepocitaj();
  window.addEventListener('scroll', naScroll, { passive: true });
  window.addEventListener('resize', function () { poslednyStav = null; prepocitaj(); }, { passive: true });
  /* Konfigurátor sa vykresľuje skriptom, takže pri prvom behu ešte nemusí
     existovať — skúsime to znovu, keď dobehne. */
  window.addEventListener('load', function () { poslednyStav = null; prepocitaj(); });
})();
