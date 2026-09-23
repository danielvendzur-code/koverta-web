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
    input.name = 'rozmer-mm';
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

  /* Obchodná logika Koverty platí pre obidva jej výrobky: prístrešok pre auto
     aj záhradný prístrešok. Je to tá istá oceľová skladba, ten istý odkvap
     v zostave a tá istá veta o cene — líšia sa len rozmery, ceny a to, že
     záhradný má stĺpy vždy v rohoch. */
  var KOVERTA_PAGES = ['koverta', 'zahrada'];
  function isKovertaPage() {
    var root = document.querySelector(ROOT_SEL);
    return !!root && KOVERTA_PAGES.indexOf(root.getAttribute('data-sp-page')) > -1;
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
    if (!btn) return { id: 'kv-free', label: 'Samostatne stojaci', quoteOnly: false, pending: false };
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
        value: rootText(btn, 'strong') || cleanText(btn.textContent)
      });
    });
    return rows;
  }

  function visibleQuoteRows(root) {
    var rows = [];
    root.querySelectorAll('[data-sp-lines] li').forEach(function (li) {
      if (li.hasAttribute('data-kv-placement-line')) return;
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
      body.push('Najbližšia katalógová zostava použitá iba ako cenová referencia: ' + configuredSize + (configuredHeight ? ', výška ' + configuredHeight : '') + '.');
      body.push('Atypický rozmer je samostatný dopyt na technické posúdenie. Konfigurátor nepotvrdzuje jeho realizovateľnosť ani cenu.');
    } else {
      body.push('Mám záujem o oceľový prístrešok Koverta.');
      body.push('Rozmer: ' + configuredSize + (configuredHeight ? ', výška ' + configuredHeight : '') + '.');
    }
    body.push('Umiestnenie: ' + placement.label + (placement.quoteOnly ? ' (na nacenenie)' : '') + '.');
    if (frameColor) body.push('Farba konštrukcie: ' + frameColor + ' (cenový dopad na nacenenie).');
    if (rows.length) {
      body.push('Zostava:');
      rows.forEach(function (row) {
        body.push('- ' + row.label + (row.value ? ': ' + row.value : ''));
      });
    }
    body.push('Orientačná cena z konfigurátora: ' + total + ', vrátane DPH, dopravy aj montáže.');
    body.push('Položky označené „na nacenenie“ potvrdíme v ponuke.');
    body.push('');
    body.push('Meno:');
    body.push('Telefón:');
    body.push('Obec realizácie:');

    return {
      body: body.join('\n'),
      subject: custom
        ? 'Prístrešok Koverta, rozmer na mieru ' + custom.w + ' × ' + custom.l + ' mm'
        : 'Konfigurácia Koverta: ' + (configuredSize || 'dopyt'),
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

    /* Pod konfigurátorom stojí dopytový formulár. Kým tam nebol, jediná
       cesta viedla do poštového klienta — a to je pre človeka v prehliadači
       odbočka, z ktorej sa už väčšinou nevráti. Zostava sa preto zapíše do
       správy a stránka sa posunie na formulár. Poštu otvoríme len vtedy,
       keď formulár na stránke nie je. */
    var sprava = document.querySelector('#sp-dopyt textarea[name="contact[body]"]')
      || document.querySelector('textarea[name="contact[body]"]');
    if (sprava) {
      sprava.value = sprava.value.trim() ? sprava.value.trim() + '\n\n' + payload.body : payload.body;
      sprava.dispatchEvent(new Event('input', { bubbles: true }));
      var ciel = document.querySelector('#sp-dopyt');
      if (ciel) {
        var tichy = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        ciel.scrollIntoView({ behavior: tichy ? 'auto' : 'smooth', block: 'start' });
      }
      window.setTimeout(function () { sprava.focus({ preventScroll: true }); }, 700);
      return true;
    }

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
    if (placement.pending) return;

    var old = host.querySelector('[data-kv-placement-line]');
    if (placement.quoteOnly) {
      if (!old) {
        old = document.createElement('li');
        old.setAttribute('data-kv-placement-line', '');
        host.appendChild(old);
      }
      var stamp = placement.id + '|' + placement.label;
      if (old.dataset.kvStamp !== stamp) {
        old.dataset.kvStamp = stamp;
        old.innerHTML = '<span>Umiestnenie: ' + placement.label + '</span><b>na nacenenie</b>';
      }
    } else if (old) {
      old.parentNode.removeChild(old);
    }

    var hasOtherUnpriced = [].slice.call(host.querySelectorAll('li')).some(function (li) {
      if (li.hasAttribute('data-kv-placement-line')) return false;
      var price = li.querySelector('b');
      return cleanText(price && price.textContent) === 'na nacenenie';
    });
    var mustBeOpen = placement.quoteOnly || hasOtherUnpriced;

    ['[data-sp-total]', '[data-sp-mini-total]'].forEach(function (selector) {
      var el = root.querySelector(selector);
      if (!el) return;
      var value = cleanText(el.textContent);
      if (!value || value === '–') return;
      var baseValue = value.replace(/^od\s+/i, '');
      var nextValue = mustBeOpen ? 'od ' + baseValue : baseValue;
      if (cleanText(el.textContent) !== nextValue) el.textContent = nextValue;
    });
  }

  function wireKovertaSnapshotSemantics() {
    if (!isKovertaPage() || !window.SP_TEST || typeof window.SP_TEST.snapshot !== 'function') return;
    if (window.SP_TEST.kvPricingWrapped) return;
    var baseSnapshot = window.SP_TEST.snapshot;
    window.SP_TEST.snapshot = function () {
      var snap = baseSnapshot();
      if (!snap || KOVERTA_PAGES.indexOf(snap.page) < 0 || !snap.price || !snap.price.open) return snap;
      var subtotal = snap.price.total;
      snap.price = Object.assign({}, snap.price, {
        catalogueSubtotal: subtotal,
        total: null
      });
      return snap;
    };
    window.SP_TEST.kvPricingWrapped = true;
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
    wireKovertaSnapshotSemantics();
    wireReset();
    syncPlacementQuoteState();
  }

  // Testovateľný čistý výstup payloadu bez otvárania e-mailového klienta.
  window.KVBuildKovertaQuote = function (custom) {
    return buildKovertaQuote(custom || null);
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
  function wireCustom() {
    var btn = document.querySelector('[data-kv-custom]');
    if (!btn || btn.dataset.kvWired === '1') return;
    btn.dataset.kvWired = '1';

    var panel = document.createElement('div');
    panel.className = 'kv-custom';
    panel.hidden = true;
    panel.innerHTML = ''
      + '<p class="sp-side-note">Napíšte požadovaný rozmer. Je to samostatný dopyt na technické posúdenie; katalógová zostava ani jej cena nepotvrdzujú realizovateľnosť atypického rozmeru. Individuálne riešenia ako šikmé steny, kotvenie do steny, L-tvar alebo zelená strecha riešime samostatným posúdením a nacenením.</p>'
      + '<div class="kv-custom__row">'
      + '<label>Šírka (mm)<input type="number" inputmode="numeric" min="1" step="1" required data-kv-cw></label>'
      + '<label>Hĺbka (mm)<input type="number" inputmode="numeric" min="1" step="1" required data-kv-cl></label>'
      + '<label>Výška (mm)<input type="number" inputmode="numeric" min="1" step="1" required data-kv-ch></label>'
      + '</div>'
      + '<label class="kv-custom__note">Čo ešte treba vedieť<textarea rows="2" data-kv-cnote placeholder="Napríklad spôsob použitia, umiestnenie alebo iné požiadavky…"></textarea></label>'
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
        /* Až teraz smie byť políčko červené. Pred prvým odoslaním je prázdne
           políčko normálny stav, nie chyba. */
        panel.classList.add('je-overeny');
        if (err) err.hidden = false;
        var firstBad = [wEl, lEl, hEl].find(function (el) {
          var v = Number(el.value);
          return !Number.isFinite(v) || v <= 0;
        });
        if (firstBad) firstBad.focus();
        return;
      }
      if (err) err.hidden = true;
      panel.classList.remove('je-overeny');
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
    /* Runtime konfigurátora si --sp-sticky-top pri scrollovaní prepisuje
       sám (hľadá hlavičku starej témy a vychádza mu 0). Lepivé kroky na
       telefóne preto čítajú vlastnú premennú, do ktorej nezasahuje nič iné. */
    document.documentElement.style.setProperty('--kv-lista-vrch', vidno ? poslednaVyska + 'px' : '0px');
  };

  var caka = false;
  var naScroll = function () {
    if (caka) return;
    caka = true;
    requestAnimationFrame(function () { caka = false; prepocitaj(); });
  };

  prepocitaj();
  window.addEventListener('scroll', naScroll, { passive: true });
  /* Lišta sa skrýva a vracia animáciou, ktorá dobehne až po udalosti
     scroll — hodnota sa potom počítala z polohy uprostred pohybu a lepivé
     kroky na telefóne ostali schované pod lištou. Prepočíta sa preto aj po
     zmene triedy lišty a po dobehnutí jej animácie. */
  lista.addEventListener('transitionend', naScroll);
  if ('MutationObserver' in window) {
    new MutationObserver(naScroll).observe(lista, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  window.addEventListener('resize', function () { poslednyStav = null; prepocitaj(); }, { passive: true });
  /* Konfigurátor sa vykresľuje skriptom, takže pri prvom behu ešte nemusí
     existovať — skúsime to znovu, keď dobehne. */
  window.addEventListener('load', function () { poslednyStav = null; prepocitaj(); });
})();

/* --- Vybraný produkt v zábere --------------------------------------------
   Na telefóne je prepínač produktu vodorovne posúvaný pás. Keď niekto príde
   rovno na pergolu (posledná karta), vybraná karta by bola mimo obrazovky —
   posunieme pás tak, aby bola vidieť. Stránka sa pritom nehýbe. */
(function kvVybranyVZabere() {
  var pas = document.querySelector('.kv-cfg__tabs');
  var vybrany = pas && pas.querySelector('[aria-current="page"]');
  if (!pas || !vybrany || pas.scrollWidth <= pas.clientWidth) return;
  pas.scrollLeft = Math.max(0, vybrany.offsetLeft - pas.offsetLeft - 16);
})();

/* --- Poslať túto zostavu a zdieľať ---------------------------------------
   Pri cene v každom kroku sú dve tlačidlá:
   · „Poslať túto zostavu" — zostava aj cena sa zapíšu do dopytu pod
     konfigurátorom a stránka sa k nemu posunie. Robí to to isté tlačidlo
     „Chcem presnú ponuku", ktoré dovtedy stálo až v poslednom kroku; človek
     sa však rozhoduje pri cene, nie po šiestom kroku.
   · „Zdieľať" — odkaz s modelom, rozmerom aj farbou (adresu dopĺňa zápis
     rozmeru nižšie v stránke); na telefóne ponuka zdieľania systému, inde
     skopírovanie do schránky. */
(function kvPoslatAZdielat() {
  var ROOT = '#SoltecPremium';

  function farbaDoAdresy() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var vybrana = document.querySelector(ROOT + ' [data-sp-frame-color][aria-pressed="true"]');
    if (!vybrana) return;
    var index = vybrana.getAttribute('data-sp-frame-color');
    if (q.get('farba') === index) return;
    q.set('farba', index);
    try { history.replaceState(history.state, '', location.pathname + '?' + q.toString()); } catch (e) {}
  }

  function farbaZAdresy() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var index = q.get('farba');
    if (!/^\d{1,2}$/.test(index || '')) return;
    var pokusov = 0;
    (function skus() {
      var b = document.querySelector(ROOT + ' [data-sp-frame-color="' + index + '"]');
      if (!b) { if (++pokusov < 80) window.setTimeout(skus, 125); return; }
      if (b.getAttribute('aria-pressed') !== 'true') b.click();
    })();
  }

  function oznam(tlacidlo, text) {
    var povodny = tlacidlo.getAttribute('data-kv-text') || tlacidlo.textContent;
    tlacidlo.setAttribute('data-kv-text', povodny);
    tlacidlo.querySelector('span').textContent = text;
    window.setTimeout(function () { tlacidlo.querySelector('span').textContent = povodny.trim(); }, 2200);
  }

  function zdielaj(tlacidlo) {
    farbaDoAdresy();
    var url = location.href;
    var nadpis = (document.querySelector(ROOT + ' .sp-cfg__head h1') || {}).textContent || 'Konfigurátor Koverta';
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: nadpis.trim(), url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { oznam(tlacidlo, 'Odkaz skopírovaný'); },
        function () { window.prompt('Skopírujte odkaz:', url); });
    } else {
      window.prompt('Skopírujte odkaz:', url);
    }
  }

  var IKONA_POSLAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg>';
  var IKONA_ZDIELAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="17.5" cy="6" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="M8.2 10.9l7.1-3.8M8.2 13.1l7.1 3.8"/></svg>';

  function doplnTlacidla() {
    document.querySelectorAll(ROOT + ' .sp-navrow').forEach(function (rad) {
      if (rad.nextElementSibling && rad.nextElementSibling.classList.contains('kv-akcie')) return;
      var box = document.createElement('div');
      box.className = 'kv-akcie';
      box.innerHTML = '<button type="button" class="kv-akcie__poslat" data-kv-poslat>' + IKONA_POSLAT + '<span>Poslať túto zostavu</span></button>'
        + '<button type="button" class="kv-akcie__zdielat" data-kv-zdielat>' + IKONA_ZDIELAT + '<span>Zdieľať</span></button>';
      rad.insertAdjacentElement('afterend', box);
    });
  }

  document.addEventListener('click', function (e) {
    var poslat = e.target.closest && e.target.closest('[data-kv-poslat]');
    if (poslat) {
      var koren = poslat.closest(ROOT) || document;
      var ponuka = koren.querySelector('[data-sp-cfg-quote]');
      /* Veta „Mám záujem o rozmer…", ktorú do správy vložil odkaz s rozmerom,
         je súčasťou zostavy — keď ju nikto neupravil, zostava ju nahradí. */
      var sprava = document.querySelector('textarea[name="contact[body]"]');
      if (sprava && sprava.dataset.kAuto && sprava.value.trim() === sprava.dataset.kAuto.trim()) sprava.value = '';
      if (ponuka) ponuka.click();
      /* K zostave patrí aj odkaz, ktorým sa dá v konfigurátore otvoriť. */
      window.setTimeout(function () {
        farbaDoAdresy();
        var pole = document.querySelector('textarea[name="contact[body]"]');
        if (pole && pole.value.indexOf(location.href) === -1) pole.value = pole.value.replace(/\s+$/, '') + '\n\nOdkaz na zostavu: ' + location.href;
      }, 120);
      if (typeof window.kvMeraj === 'function') window.kvMeraj('konfigurator_poslat');
      return;
    }
    var zdielat = e.target.closest && e.target.closest('[data-kv-zdielat]');
    if (zdielat) {
      zdielaj(zdielat);
      if (typeof window.kvMeraj === 'function') window.kvMeraj('konfigurator_zdielat');
      return;
    }
    if (e.target.closest && e.target.closest(ROOT + ' [data-sp-frame-color]')) window.setTimeout(farbaDoAdresy, 50);
  });

  function start() {
    doplnTlacidla();
    farbaZAdresy();
    var koren = document.getElementById('kv-root');
    if (koren && 'MutationObserver' in window) {
      new MutationObserver(doplnTlacidla).observe(koren, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* --- Hranica rozmeru a väčší model ---------------------------------------
   Posuvník končí na najväčšom katalógovom rozmere modelu. Kto potom klikal
   na „+", nedialo sa nič a nevedel prečo. Teraz:
   · keď má Soltec väčší model, ktorý daný rozmer zvládne (F170 → F240,
     SL 170/28 → 170/36 …), prepne sa naň sám a povie to;
   · keď väčší model nie je, pod posuvníkom sa ukáže, že toto je najväčší
     katalógový rozmer, s odkazom na nacenenie rozmeru na mieru;
   · tlačidlo „+" na hranici vyzerá neaktívne. */
(function kvHranicaRozmeru() {
  var ROOT = '#SoltecPremium';
  var NAZOV = { w: 'šírku', l: 'dĺžku', h: 'výšku' };
  var POLE = { w: 'widths', l: 'lengths' };
  var MM = function (v) { return Number(v).toLocaleString('sk-SK').replace(/\s/g, ' ') + ' mm'; };

  function data() {
    var el = document.querySelector(ROOT + ' [data-sp-bio-data]');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }
  function posuvnik(rozmer) { return document.querySelector(ROOT + ' [data-sp-' + rozmer + ']'); }
  function naHranici(rozmer) {
    var r = posuvnik(rozmer);
    return r && Number(r.value) >= Number(r.max) - 1;
  }
  function oznam(rozmer, html, druh) {
    var r = posuvnik(rozmer);
    var pole = r && r.closest('.sp-field');
    if (!pole) return;
    var p = pole.querySelector('.kv-hranica');
    if (!p) {
      p = document.createElement('p');
      p.className = 'kv-hranica';
      p.setAttribute('role', 'status');
      pole.appendChild(p);
    }
    p.innerHTML = html;
    p.hidden = !html;
    p.dataset.druh = html ? (druh || 'hranica') : '';
  }
  function vyznacHranice() {
    ['w', 'l', 'h'].forEach(function (rozmer) {
      var plus = document.querySelector(ROOT + ' [data-sp-nudge="' + rozmer + '"][data-sp-nudge-dir="1"]');
      if (plus) plus.classList.toggle('je-na-hranici', !!naHranici(rozmer) && !vacsiModel(rozmer));
      var p = document.querySelector(ROOT + ' [data-sp-' + rozmer + ']');
      var sprava = p && p.closest('.sp-field') && p.closest('.sp-field').querySelector('.kv-hranica');
      if (!naHranici(rozmer) && sprava && sprava.dataset.druh === 'hranica') oznam(rozmer, '');
    });
  }

  /* Ďalší model v poradí tlačidiel, ktorý má v danom rozmere viac než
     aktuálny. Berú sa len modely s voľnou šírkou/dĺžkou (SL má šírku pevnú). */
  function vacsiModel(rozmer) {
    var d = data(), kluc = POLE[rozmer];
    if (!d || !d.models || !kluc) return null;
    var tlacidla = [].slice.call(document.querySelectorAll(ROOT + ' [data-sp-model]'));
    var aktivne = tlacidla.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0];
    var sucasny = aktivne && d.models[aktivne.dataset.spModel];
    if (!sucasny || !Array.isArray(sucasny[kluc])) return null;
    var max = Math.max.apply(null, sucasny[kluc]);
    for (var i = tlacidla.indexOf(aktivne) + 1; i < tlacidla.length; i++) {
      var m = d.models[tlacidla[i].dataset.spModel];
      if (m && Array.isArray(m[kluc]) && Math.max.apply(null, m[kluc]) > max && !tlacidla[i].disabled) {
        return { tlacidlo: tlacidla[i], nazov: m.label || tlacidla[i].dataset.spModel, max: Math.max.apply(null, m[kluc]),
          rady: m[kluc].slice().sort(function (x, y) { return x - y; }), staryMax: max };
      }
    }
    return null;
  }

  function chceViac(rozmer, ciel) {
    var r = posuvnik(rozmer);
    if (!r) return false;
    var vacsi = vacsiModel(rozmer);
    if (vacsi) {
      var hodnota = ciel || Number(r.max) + 1;
      vacsi.tlacidlo.click();
      /* Po prepnutí modelu runtime nastaví nové hranice posuvníka; až potom
         sa dá ísť o krok vyššie. */
      window.setTimeout(function () {
        var n = posuvnik(rozmer);
        if (n) {
          /* Prvý katalógový rozmer nového modelu nad starou hranicou, alebo
             najbližší k napísanému číslu. Runtime pri zmene modelu rozmer
             vracia na predvolený, preto sa nastavuje až po prepnutí. */
          var chcene = ciel || (vacsi.staryMax + 1);
          var ciel2 = vacsi.rady.filter(function (v) { return v >= chcene; })[0] || vacsi.max;
          n.value = String(ciel2);
          n.dispatchEvent(new Event('input', { bubbles: true }));
          n.dispatchEvent(new Event('change', { bubbles: true }));
        }
        oznam(rozmer, 'Na väčšiu ' + NAZOV[rozmer] + ' sme prepli na model <b>' + vacsi.nazov
          + '</b> (do ' + MM(vacsi.max) + ').', 'model');
        vyznacHranice();
      }, 250);
      return true;
    }
    oznam(rozmer, 'Najväčšia ' + NAZOV[rozmer].replace(/u$/, 'a') + ' v katalógu je ' + MM(r.max)
      + '. Väčší rozmer vám nacenime na mieru — <a href="#sp-dopyt" data-kv-na-mieru>napíšte nám</a>.');
    return false;
  }

  document.addEventListener('click', function (e) {
    var plus = e.target.closest && e.target.closest(ROOT + ' [data-sp-nudge][data-sp-nudge-dir="1"]');
    if (plus && naHranici(plus.dataset.spNudge)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      chceViac(plus.dataset.spNudge);
      return;
    }
    if (e.target.closest && e.target.closest(ROOT + ' [data-sp-model], ' + ROOT + ' [data-sp-nudge]')) {
      window.setTimeout(vyznacHranice, 60);
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    var r = e.target;
    if (!r.matches || !r.matches(ROOT + ' input[type="range"][data-sp-w], ' + ROOT + ' input[type="range"][data-sp-l]')) return;
    if (!/^(ArrowRight|ArrowUp|PageUp)$/.test(e.key)) return;
    var rozmer = r.hasAttribute('data-sp-w') ? 'w' : 'l';
    if (!naHranici(rozmer)) return;
    e.preventDefault();
    chceViac(rozmer);
  }, true);

  /* Číslo napísané do poľa nad posuvníkom väčšie než hranica modelu. */
  document.addEventListener('change', function (e) {
    var vstup = e.target;
    if (!vstup.matches || !vstup.matches(ROOT + ' .sp-field input[type="text"]')) return;
    var pole = vstup.closest('.sp-field');
    var r = pole && pole.querySelector('input[type="range"][data-sp-w], input[type="range"][data-sp-l]');
    if (!r) return;
    var chce = parseInt(String(vstup.value).replace(/\D/g, ''), 10);
    if (chce > Number(r.max)) chceViac(r.hasAttribute('data-sp-w') ? 'w' : 'l', chce);
  }, true);

  document.addEventListener('input', function (e) {
    if (e.target.matches && e.target.matches(ROOT + ' input[type="range"]')) vyznacHranice();
  });

  function start() { window.setTimeout(vyznacHranice, 600); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* --- Výzva posunúť sa ku krokom (telefón) --------------------------------
   Na telefóne zaberie 3D náhľad celú obrazovku a kroky nastavenia sú pod
   ním — nie je vidieť, že treba ísť nižšie. Kým sú kroky mimo obrazovky,
   dole stojí tlačidlo „Nastaviť rozmer a farbu“; ťuknutím sa k nim posunie
   a keď sa kroky ukážu, samo zmizne. */
(function kvVyzvaKrokov() {
  if (!window.matchMedia || !window.matchMedia('(max-width: 899px)').matches) return;
  var pokusov = 0;
  (function cakaj() {
    var panel = document.querySelector('#SoltecPremium .sp-panel');
    if (!panel) { if (++pokusov < 80) window.setTimeout(cakaj, 125); return; }
    if (!('IntersectionObserver' in window) || document.querySelector('.kv-vyzva')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'kv-vyzva';
    b.innerHTML = '<span>Nastaviť rozmer a farbu</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
    b.addEventListener('click', function () {
      panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    document.body.appendChild(b);
    var videl = false;
    new IntersectionObserver(function (z) {
      var e = z[0];
      /* Po prvom zobrazení krokov sa výzva už nevráti. */
      if (e.isIntersecting || e.boundingClientRect.top < 0) videl = true;
      b.classList.toggle('je-vidno', !videl);
    }, { rootMargin: '0px 0px -25% 0px' }).observe(panel);
    window.setTimeout(function () { if (!videl) b.classList.add('je-vidno'); }, 900);
  })();
})();
