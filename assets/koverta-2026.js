/* ==========================================================================
   KOVERTA 2026 — správanie
     · odhaľovanie pri scrollovaní
     · posuvná lišta recenzií (šípky, ťahanie, klávesnica)
     · filter realizácií
     · FAQ — naraz otvorená len jedna odpoveď
     · hlavička — prilepenie, mega menu, mobilná zásuvka
   Všetko sa inicializuje idempotentne, aby to prežilo shopify:section:load.
   ========================================================================== */

(() => {
  /* Skryté východisko odhaľovania platí len vtedy, keď skript naozaj beží.
     Keby sa nenačítal alebo spadol, ostal by celý web prázdny — a to sa už
     raz stalo. Trieda sa pridáva ako prvá vec, ešte pred čímkoľvek iným. */
  document.documentElement.classList.add('k-js');

  /* Smer scrollovania si stránka pamätá na koreni. Pri ceste nahor je
     odkrývanie tichšie — vraciate sa k tomu, čo ste už videli. */
  (() => {
    let posledny = window.scrollY;
    const koren = document.documentElement;
    let caka = false;
    const zmer = () => {
      caka = false;
      const teraz = window.scrollY;
      if (Math.abs(teraz - posledny) > 4) {
        koren.classList.toggle('k-hore', teraz < posledny);
        posledny = teraz;
      }
    };
    window.addEventListener('scroll', () => {
      if (caka) return;
      caka = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(zmer);
      else window.setTimeout(zmer, 60);
    }, { passive: true });
  })();

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smooth = () => (REDUCED.matches ? 'auto' : 'smooth');

  /* --- 1 · odhaľovanie ---------------------------------------------------- */

  function initReveal(root) {
    const items = root.querySelectorAll('.k-rise, .k-reveal');
    if (!items.length) return;

    if (REDUCED.matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }

    let ozvalSa = false;
    /* Skrývanie má vlastného pozorovateľa s väčším okrajom. Keď to riešil
       jeden, ohlásil sa presne na hrane okna — a podmienka „je celý mimo aj
       s rezervou" v tej chvíli nikdy neplatila, takže sa trieda nikdy
       neodobrala a pri scrollovaní hore sa už nič neanimovalo. */
    const ioVon = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) entry.target.classList.remove('is-in');
        });
      },
      { rootMargin: '110px 0px 110px 0px', threshold: 0 }
    );

    const io = new IntersectionObserver(
      (entries) => {
        ozvalSa = true;
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-in');
        });
      },
      /* Odkrytie sa spustí, len čo prvok vojde spodnou hranou do okna.
         Skôr by pohyb prebehol mimo obrazovky, neskôr by sa začínal až
         v strede — a to zadávateľ vytkol. */
      { rootMargin: '0px 0px 14% 0px', threshold: 0 }
    );

    items.forEach((el) => { io.observe(el); ioVon.observe(el); });

    /* Poistka. Predtým po 1,5 s odkryla úplne všetko vrátane sekcií hlboko
       pod ohybom — kým sa k nim návštevník doscrolloval, boli dávno odkryté
       a neanimovalo sa nič. To bola príčina, prečo na webe nebolo vidieť
       žiadny pohyb. Teraz sa odkryje všetko len vtedy, keď observer naozaj
       zlyhal, teda keď po 1,5 s nemá triedu ani jeden prvok. */
    window.setTimeout(() => {
      if (ozvalSa) return;
      items.forEach((el) => el.classList.add('is-in'));
    }, 1500);

    /* Druhá poistka, ktorá nič nepredbieha: pri scrollovaní odkryje to, čo je
       naozaj v okne. Keby observer vypadol až neskôr, obsah aj tak nikdy
       neostane schovaný — a nič sa neodkryje skôr, než to má prísť na rad. */
    /* Tvrdý bod. Pri rýchlom scrollovaní prehliadač hlásenia pozorovateľa
       zlučuje alebo ich stihne až po tom, čo prvok preletí oknom — a sekcia
       sa potom neodkryje vôbec. Toto beží pri každom scrollovaní a odkryje
       čokoľvek, čo je v okne alebo nad ním; pozorovateľ tak rieši pekný
       nábeh, toto rieši istotu, že sa obsah ukáže vždy. */
    let caka = false;
    const tvrdyBod = () => {
      caka = false;
      const h = window.innerHeight;
      items.forEach((el) => {
        if (el.classList.contains('is-in')) return;
        const r = el.getBoundingClientRect();
        /* Prvok je v okne alebo tesne nad ním. Prvky, ktoré sú preč hore,
           sa zámerne nechávajú tak — tie skryl pozorovateľ pri odchode a pri
           návrate sa majú odkryť znova. Bez tejto druhej podmienky by sa obe
           strany prebíjali a scrollovanie hore by prestalo animovať. */
        if (r.top < h * 0.9 && r.bottom > -110) el.classList.add('is-in');
      });
    };
    const naplanuj = () => {
      if (caka) return;
      caka = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(tvrdyBod);
      else window.setTimeout(tvrdyBod, 60);
    };
    window.addEventListener('scroll', naplanuj, { passive: true });
    window.addEventListener('resize', naplanuj);
  }

  /* --- 2 · posuvná lišta -------------------------------------------------- */

  function initRail(root) {
    root.querySelectorAll('[data-k-rail]').forEach((wrap) => {
      const rail = wrap.querySelector('[data-k-rail-track]');
      const prev = wrap.querySelector('[data-k-rail-prev]');
      const next = wrap.querySelector('[data-k-rail-next]');
      if (!rail || !prev || !next) return;

      // Posun o presne toľko kariet, koľko je práve vidieť.
      const step = () => {
        const card = rail.firstElementChild;
        if (!card) return rail.clientWidth;
        const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
        const unit = card.offsetWidth + gap;
        return Math.max(1, Math.round(rail.clientWidth / unit)) * unit;
      };

      const sync = () => {
        const max = rail.scrollWidth - rail.clientWidth - 2;
        prev.disabled = rail.scrollLeft <= 2;
        next.disabled = rail.scrollLeft >= max;
      };

      // Stav šípok nedorovnávame len zo scroll udalosti — tá je asynchrónna
      // a počas plynulého posunu sa škrtí.
      const move = (dir) => {
        rail.scrollBy({ left: dir * step(), behavior: smooth() });
        requestAnimationFrame(sync);
        setTimeout(sync, 450);
      };

      prev.addEventListener('click', () => move(-1));
      next.addEventListener('click', () => move(1));
      rail.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();

      rail.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
      });

      // Ťahanie myšou na desktope; dotyk rieši natívny scroll sám.
      let down = false;
      let startX = 0;
      let startLeft = 0;
      let moved = false;

      rail.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse') return;
        down = true;
        moved = false;
        startX = e.clientX;
        startLeft = rail.scrollLeft;
      });
      rail.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) {
          moved = true;
          rail.style.cursor = 'grabbing';
          rail.style.scrollSnapType = 'none';
        }
        rail.scrollLeft = startLeft - dx;
      });
      const release = () => {
        if (!down) return;
        down = false;
        rail.style.cursor = '';
        rail.style.scrollSnapType = '';
        if (moved) rail.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true });
      };
      rail.addEventListener('pointerup', release);
      rail.addEventListener('pointerleave', release);
    });
  }

  /* --- 3 · filter realizácií ---------------------------------------------- */

  function initFilters(root) {
    root.querySelectorAll('[data-k-filter-set]').forEach((set) => {
      const gridId = set.getAttribute('data-k-filter-target');
      const grid = gridId ? root.querySelector(`#${CSS.escape(gridId)}`) : null;
      if (!grid) return;

      const groups = [...set.querySelectorAll('[data-k-filter-group]')];
      const items = [...grid.querySelectorAll('[data-k-type], [data-k-brand]')];
      const state = {};

      groups.forEach((group) => {
        const dimension = group.getAttribute('data-k-filter-group');
        if (!dimension) return;
        state[dimension] = group.getAttribute('data-k-filter-default') || 'all';
      });

      const apply = () => {
        items.forEach((item) => {
          item.hidden = groups.some((group) => {
            const dimension = group.getAttribute('data-k-filter-group');
            const value = state[dimension] || 'all';
            return value !== 'all' && item.getAttribute(`data-k-${dimension}`) !== value;
          });
        });

        groups.forEach((group) => {
          const dimension = group.getAttribute('data-k-filter-group');
          group.querySelectorAll('button[data-k-filter]').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.kFilter === state[dimension]));
            const candidate = { ...state, [dimension]: button.dataset.kFilter };
            button.disabled = !items.some((item) => groups.every((otherGroup) => {
              const otherDimension = otherGroup.getAttribute('data-k-filter-group');
              const value = candidate[otherDimension] || 'all';
              return value === 'all' || item.getAttribute(`data-k-${otherDimension}`) === value;
            }));
          });
        });
      };

      groups.forEach((group) => {
        const dimension = group.getAttribute('data-k-filter-group');
        group.querySelectorAll('button[data-k-filter]').forEach((button) => {
          button.addEventListener('click', () => {
            state[dimension] = button.dataset.kFilter;
            apply();
          });
        });
      });

      apply();
    });

    /* Spätná kompatibilita pre jednoduché filtre v starších sekciách. */
    root.querySelectorAll('[data-k-filters]').forEach((group) => {
      const grid = root.querySelector(`#${CSS.escape(group.getAttribute('data-k-filters'))}`);
      if (!grid) return;

      const buttons = [...group.querySelectorAll('button[data-k-filter]')];
      const items = [...grid.querySelectorAll('[data-k-tags]')];

      const apply = (value) => {
        items.forEach((item) => {
          const tags = (item.getAttribute('data-k-tags') || '').split(/\s+/);
          item.hidden = value !== 'all' && !tags.includes(value);
        });
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kFilter === value)));
      };

      buttons.forEach((b) => b.addEventListener('click', () => apply(b.dataset.kFilter)));
      apply(group.getAttribute('data-k-filters-default') || 'all');
    });
  }

  /* --- 3b · plynulý posun na kotvu v rámci stránky ------------------------ */

  function initAnchors(root) {
    root.querySelectorAll('[data-k-scroll]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = document.querySelector(el.getAttribute('data-k-scroll'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: smooth(), block: 'start' });
      });
    });
  }

  /* --- 3c · proces: linka a kroky sa aktivujú podľa scrollu --------------- */

  function initProcess(root) {
    root.querySelectorAll('[data-k-process]').forEach((scope) => {
      const panels = [...scope.querySelectorAll('[data-k-step]')];
      const rows = [...scope.querySelectorAll('[data-k-step-row]')];
      if (!panels.length) return;

      // Kroky sú záložky, nie päť panelov pod sebou. Sekcia bola inak vyše
      // 1700 px vysoká a používateľ musel odscrollovať celý postup, aj keď ho
      // zaujímal len jeden krok.
      let index = 0;
      const setActive = (idx) => {
        index = Math.max(0, Math.min(panels.length - 1, idx));
        // Panely sú naskladané v jednej bunke mriežky, takže fotka ostáva
        // presne na mieste a kroky sa len prelínajú. `hidden` sa nepoužíva —
        // vyradil by panel z mriežky a obsah by poskočil.
        panels.forEach((p, i) => {
          const on = i === index;
          p.classList.toggle('is-active', on);
          p.setAttribute('aria-hidden', on ? 'false' : 'true');
        });
        rows.forEach((r, i) => {
          const on = i === index;
          r.classList.toggle('is-active', on);
          r.setAttribute('aria-selected', on ? 'true' : 'false');
          r.tabIndex = on ? 0 : -1;
        });
      };

      rows.forEach((row, i) => {
        row.setAttribute('role', 'tab');
        row.addEventListener('click', (e) => {
          e.preventDefault();
          setActive(i);
        });
        row.addEventListener('keydown', (e) => {
          const map = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
          if (!map[e.key]) return;
          e.preventDefault();
          setActive(index + map[e.key]);
          rows[index].focus();
        });
      });

      /* Dráha, po ktorej sa scrolluje, kým obsah stojí prilepený. Bez nej
         pripadalo na jeden krok ~120 px a fotky sa menili tak rýchlo, že
         ich nebolo vidieť. */
      const obal = scope.parentElement;
      if (obal && !obal.querySelector('.kh-proc__draha')) {
        const draha = document.createElement('div');
        draha.className = 'kh-proc__draha';
        draha.setAttribute('aria-hidden', 'true');
        obal.appendChild(draha);
      }

      const stack = panels[0] && panels[0].parentElement;
      if (stack) stack.classList.add('is-stacked');

      const list = rows[0] && rows[0].parentElement;
      if (list) list.setAttribute('role', 'tablist');

      setActive(0);

      // Krok sa mení aj pri scrollovaní — sekcia sa prejde sama, aj keď
      // návštevník na nič neklikne. Klik má prednosť: po ňom sa scrollové
      // prepínanie na chvíľu utlmí, aby mu nepreberalo voľbu pod rukami.
      if (REDUCED.matches) return;
      let lockedUntil = 0;
      let poslednaZmena = 0;
      rows.forEach((row) => row.addEventListener('click', () => { lockedUntil = Date.now() + 4000; }));

      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
          ticking = false;
          if (Date.now() < lockedUntil) return;
          // Sekcia je nižšia než okno, takže postup nemeriame v jej výške,
          // ale tým, ako prechádza oknom. Inak by sa krok nestihol prepnúť.
          // Krok sa má prepnúť, kým je panel na obrazovke. Pôvodné meranie
          // rozložilo päť krokov cez celý prechod sekcie oknom, takže na
          // posledný krok sa dalo dostať až vtedy, keď bol takmer preč —
          // päťku nebolo vidieť bez toho, aby človek odscrolloval nadol.
          // Teraz sa postup meria od chvíle, keď sekcia vojde do okna, po
          // chvíľu, keď sa ho chystá opustiť.
          /* Postup je to, ako ďaleko sme prešli dráhou, kým obsah stojí
             prilepený. Na jeden krok tak pripadá pol obrazovky scrollu
             namiesto 120 px a fotku je vidieť. */
          const w = scope.parentElement.getBoundingClientRect();
          const vyskaObsahu = scope.getBoundingClientRect().height;
          const pripnuteHore = parseFloat(getComputedStyle(scope).top) || 0;
          const drahaCelkom = Math.max(1, w.height - vyskaObsahu);
          const t = (pripnuteHore - w.top) / drahaCelkom;
          if (t < 0 || t > 1) return;
          const idx = Math.min(panels.length - 1, Math.max(0, Math.floor(t * panels.length)));
          /* Aj pri prudkom scrollovaní musí krok chvíľu vydržať, inak sa
             fotky len mihnú. */
          if (idx !== index && Date.now() - poslednaZmena > 260) {
            poslednaZmena = Date.now();
            setActive(idx);
          }
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
    });
  }

  /* --- 3b · Hero: nábeh nadpisu ---------------------------------------- */

  // Nadpis nabieha po riadkoch: každý riadok je okno s orezaním a slová v ňom
  // vychádzajú zdola. Je to pokojnejšie a čitateľnejšie než vypisovanie po
  // písmenách, ktoré pri veľkom displayi pôsobilo lacno.
  //
  // Text ostáva v DOM celý, delíme len na spany — vyhľadávače aj čítačky ho
  // vidia nezmenený. Základný stav je VIDITEĽNÉ; animácia s fill-mode:
  // backwards skrýva len počas oneskorenia.
  function initHeadline(root) {
    root.querySelectorAll('[data-k-headline]').forEach((title) => {
      /* Nadpis sekcie nemá hero box; maska slov mu patrí rovnako, len po ňom
         niet čo ďalej odkrývať. */
      const box = title.closest('[data-k-hero-box]');
      const after = box ? [].slice.call(box.querySelectorAll('.k-rise')).filter((el) => el !== title) : [];

      if (REDUCED.matches) {
        after.forEach((el) => el.classList.add('is-in'));
        return;
      }

      // Riadky rozdelí <br>; prvky (napr. jantárové slovo) ostávajú vcelku.
      const lines = [];
      let current = [];
      [].slice.call(title.childNodes).forEach((node) => {
        if (node.nodeName === 'BR') { lines.push(current); current = []; return; }
        current.push(node);
      });
      lines.push(current);

      const frag = document.createDocumentFragment();
      let wordIndex = 0;

      lines.forEach((nodes, li) => {
        const line = document.createElement('span');
        line.className = 'k-line';
        const inner = document.createElement('span');
        inner.className = 'k-line__in';

        nodes.forEach((node) => {
          if (node.nodeType === 3) {
            node.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { inner.appendChild(document.createTextNode(" ")); return; }
              const w = document.createElement('span');
              w.className = 'k-word';
              w.textContent = part;
              w.style.animationDelay = wordIndex * 130 + 'ms';
              wordIndex += 1;
              inner.appendChild(w);
            });
          } else {
            const w = document.createElement('span');
            w.className = 'k-word';
            w.style.animationDelay = wordIndex * 130 + 'ms';
            wordIndex += 1;
            w.appendChild(node.cloneNode(true));
            inner.appendChild(w);
          }
        });

        line.appendChild(inner);
        frag.appendChild(line);
      });

      title.innerHTML = '';
      title.appendChild(frag);
      /* Hero beží hneď; nadpis v sekcii čaká, kým sa k nemu doscrolluje —
         inak by dobehol dávno predtým, než ho niekto uvidí. */
      if (box) { title.classList.add('is-headline'); return; }
      if (!('IntersectionObserver' in window)) { title.classList.add('is-headline'); return; }
      const io2 = new IntersectionObserver((e) => {
        e.forEach((x) => { if (!x.isIntersecting) return; title.classList.add('is-headline'); io2.unobserve(x.target); });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
      io2.observe(title);
      /* Poistka rovnaká ako inde: obsah nesmie ostať schovaný nikdy. */
      window.setTimeout(() => title.classList.add('is-headline'), 2500);

      const total = wordIndex * 130 + 760;
      after.forEach((el, i) => {
        window.setTimeout(() => el.classList.add('is-in'), total + i * 120);
      });
    });
  }

  /* --- 3d · Fotky v karte kategórie ------------------------------------- */

  // Fotky sa prepínajú šípkami priamo na okrajoch fotografie — je to zrejmé
  // na prvý pohľad a funguje aj na dotyku. Zoznam zdrojov drží skrytý pás
  // [data-k-shots]; slúži už len ako dáta, nie ako ovládanie.
  //
  // Karta je odkaz, takže klik na šípku musíme zastaviť, inak by prehliadač
  // odišiel na kolekciu namiesto výmeny fotky.
  function initShots(root) {
    root.querySelectorAll('.kh-cat__card').forEach((card) => {
      const strip = card.querySelector('[data-k-shots]');
      const media = card.querySelector('.kh-cat__media');
      const img = media && media.querySelector('img');
      if (!strip || !img) return;

      const srcs = [].slice.call(strip.querySelectorAll('[data-k-shot]'))
        .map((b) => b.getAttribute('data-k-shot'))
        .filter(Boolean);
      if (srcs.length < 2) return;

      const prev = media.querySelector('[data-k-shot-prev]');
      const next = media.querySelector('[data-k-shot-next]');
      const count = media.querySelector('[data-k-shot-count]');
      let i = 0;

      const show = (idx) => {
        i = (idx + srcs.length) % srcs.length;
        const src = srcs[i];
        media.classList.add('is-swapping');
        const pre = new Image();
        pre.onload = () => {
          img.src = src;
          img.removeAttribute('srcset');
          media.classList.remove('is-swapping');
        };
        pre.onerror = () => media.classList.remove('is-swapping');
        pre.src = src;
        if (count) count.textContent = i + 1 + ' / ' + srcs.length;
      };

      const step = (e, dir) => {
        e.preventDefault();
        e.stopPropagation();
        show(i + dir);
      };

      if (prev) prev.addEventListener('click', (e) => step(e, -1));
      if (next) next.addEventListener('click', (e) => step(e, 1));
      if (count) count.textContent = '1 / ' + srcs.length;

      /* Fotografie sa striedajú, len kým je karta pod myšou alebo pod
         zameraním. Bez toho stoja — striedanie samo od seba odvádzalo
         pozornosť a nikto oň nežiadal. Šípky na preklikávanie sú preč,
         fotku netreba hľadať klikaním. */
      if (prev) prev.remove();
      if (next) next.remove();
      if (REDUCED.matches) return;

      let samocinne = 0;
      const spusti = () => { if (!samocinne) samocinne = window.setInterval(() => show(i + 1), 2600); };
      const zastav = () => {
        if (samocinne) { window.clearInterval(samocinne); samocinne = 0; }
        if (i !== 0) show(0);          // po odchode sa vráti prvá fotka
      };
      card.addEventListener('mouseenter', spusti);
      card.addEventListener('mouseleave', zastav);
      card.addEventListener('focusin', spusti);
      card.addEventListener('focusout', zastav);
    });
  }

  /* --- 3e · Materiál: prepínač značky ------------------------------------ */

  // Koverta a Soltec nie sú z tých istých komponentov, takže sekcia má dve
  // sady kariet a prepínač medzi nimi. Bez JS ostanú viditeľné obe — sekcia
  // teda funguje aj vtedy, keď skript nenabehne.
  function initMatTabs(root) {
    root.querySelectorAll('[data-k-mat-grid]').forEach((grid) => {
      const tabs = [].slice.call(
        (grid.parentElement || document).querySelectorAll('[data-k-mat-tab]')
      );
      const cards = [].slice.call(grid.querySelectorAll('[data-k-mat-brand]'));
      if (!tabs.length || !cards.length) return;

      const show = (brand) => {
        tabs.forEach((t) => {
          const on = t.getAttribute('data-k-mat-tab') === brand;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        cards.forEach((c) => {
          c.hidden = c.getAttribute('data-k-mat-brand') !== brand;
        });
      };

      tabs.forEach((t) =>
        t.addEventListener('click', () => show(t.getAttribute('data-k-mat-tab')))
      );
      show('koverta');
    });
  }

  /* --- 3c · Vyhľadávanie ------------------------------------------------ */

  // Ikona lupy predtým len odkazovala na /search. Teraz otvára panel, ktorý
  // hľadá naživo v obsahu stránky: v položkách menu, v dlaždiciach ponuky,
  // v realizáciách aj v otázkach. Index sa stavia z DOM, takže sa nemôže
  // rozísť s tým, čo je na stránke; navyše nesie ručné synonymá, aby si
  // návštevník našiel „lamely" alebo „smetiak" bez znalosti názvu produktu.
  const SYNONYMS = {
    'pristresky pre auta': 'carport auto garaz parkovanie pristresok pre auto dve auta',
    'carport soltec': 'carport hlinik premium auto',
    'zahradne pristresky': 'terasa vstup posedenie zahrada pristresok',
    tienenie: 'lamely zaluzie clona slnko roleta zip screen tien',
    'boxy na smetne kose': 'smetiak kos odpad kontajner box popolnica',
    'bioklimaticke pergoly': 'otocne lamely pergola bio zip rolety osvetlenie led',
    'pevne prestresenia': 'iso panel sklo sklenena strecha multiport prestresenie',
    'pergoly s otvaracou strechou': 'cabrio posuvna strecha otvaratelna',
    'vonkajsie kuchyne': 'outdoor kuchyna grill gril nerez varenie'
  };

  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  function buildIndex(root) {
    const seen = new Set();
    const items = [];
    const add = (title, note, href, img, extra) => {
      if (!title || !href) return;
      const key = norm(title) + '|' + href;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        title: String(title).trim(),
        note: String(note || '').trim(),
        href: href,
        img: img || '',
        hay: norm([title, note, extra, SYNONYMS[norm(title)]].filter(Boolean).join(' '))
      });
    };
    const txt = (el, sel) => {
      const n = el.querySelector(sel);
      return n ? n.textContent : '';
    };

    root.querySelectorAll('.kv-mega__col a').forEach((a) => {
      const img = a.querySelector('img');
      add(txt(a, 'strong'), txt(a, '.kv-mega__text span'), a.getAttribute('href'), img && img.getAttribute('src'));
    });

    root.querySelectorAll('.kh-cat__card').forEach((a) => {
      const img = a.querySelector('img');
      add(txt(a, '.k-h3'), txt(a, '.kh-cat__specs'), a.getAttribute('href'), img && img.getAttribute('src'), txt(a, '.k-copy'));
    });

    root.querySelectorAll('.kh-work__item').forEach((el) => {
      const link = el.querySelector('a') || el.closest('a');
      const img = el.querySelector('img');
      add(txt(el, '.kh-work__cap strong'), 'Realizácia', (link && link.getAttribute('href')) || '#realizacie', img && img.getAttribute('src'));
    });

    root.querySelectorAll('.kh-faq__item').forEach((d) => {
      const q = d.querySelector('summary');
      if (!q) return;
      add(q.textContent.replace(/\s+/g, ' '), 'Častá otázka', '#otazky', '', txt(d, '.kh-faq__answer'));
    });

    [
      ['3D konfigurátor', 'Vyskladajte si riešenie', '#konfigurator'],
      ['Realizácie', 'Hotové prístrešky u zákazníkov', '#realizacie'],
      ['Ako to prebieha', 'Od prvého kontaktu po montáž', '#proces'],
      ['Referencie', 'Hodnotenie 5,0 na Google', '#recenzie'],
      ['Materiál a výbava', 'Z čoho je prístrešok postavený', '#material'],
      ['Kontakt', 'Nezáväzná cenová ponuka', '#ponuka']
    ].forEach((r) => add(r[0], r[1], r[2], ''));

    return items;
  }

  function initSearch(root) {
    const scope = root.querySelector ? root : document;
    const trigger = scope.querySelector('[data-k-search-open]');
    const panel = scope.querySelector('[data-k-search]');
    if (!trigger || !panel) return;

    const input = panel.querySelector('input');
    const list = panel.querySelector('[data-k-search-results]');
    const empty = panel.querySelector('[data-k-search-empty]');
    const shopLink = panel.querySelector('[data-k-search-shop]');
    let index = null;
    let active = -1;

    const close = () => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };

    const render = (q) => {
      const nq = norm(q);
      list.innerHTML = '';
      active = -1;

      if (shopLink) {
        shopLink.hidden = !nq;
        shopLink.href = '/search?q=' + encodeURIComponent(q);
        const label = shopLink.querySelector('span');
        if (label) label.textContent = 'Hľadať „' + q + '" v celom e-shope';
      }

      if (!nq) {
        empty.hidden = false;
        empty.textContent = 'Napíšte, čo hľadáte — napríklad „pergola", „tienenie" alebo „smetné koše".';
        return;
      }

      // Zhoda na začiatku názvu váži viac než zhoda kdekoľvek v texte.
      const hits = index
        .map((it) => {
          const t = norm(it.title);
          let score = 0;
          if (t.indexOf(nq) === 0) score = 3;
          else if (t.indexOf(nq) > -1) score = 2;
          else if (it.hay.indexOf(nq) > -1) score = 1;
          return { it: it, score: score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      empty.hidden = hits.length > 0;
      if (!hits.length) empty.textContent = 'Nič sme nenašli. Skúste iné slovo alebo nám napíšte — poradíme.';

      hits.forEach((r) => {
        const a = document.createElement('a');
        a.className = 'kv-search__hit';
        a.href = r.it.href;
        const thumb = document.createElement('span');
        thumb.className = 'kv-search__thumb' + (r.it.img ? '' : ' kv-search__thumb--blank');
        if (r.it.img) {
          const im = document.createElement('img');
          im.src = r.it.img;
          im.alt = '';
          thumb.appendChild(im);
        }
        const text = document.createElement('span');
        text.className = 'kv-search__text';
        const st = document.createElement('strong');
        st.textContent = r.it.title;
        const sn = document.createElement('span');
        sn.textContent = r.it.note;
        text.appendChild(st);
        text.appendChild(sn);
        a.appendChild(thumb);
        a.appendChild(text);
        a.addEventListener('click', close);
        list.appendChild(a);
      });
    };

    const open = () => {
      if (!index) index = buildIndex(document);
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      input.value = '';
      render('');
      input.focus();
    };

    const move = (dir) => {
      const hits = [].slice.call(list.querySelectorAll('.kv-search__hit'));
      if (!hits.length) return;
      active = (active + dir + hits.length) % hits.length;
      hits.forEach((h, i) => h.classList.toggle('is-active', i === active));
      hits[active].focus();
    };

    trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
    input.addEventListener('input', () => render(input.value));
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); trigger.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      if (e.key === 'Enter' && document.activeElement === input) {
        const first = list.querySelector('.kv-search__hit');
        if (first) { e.preventDefault(); window.location.href = first.getAttribute('href'); }
      }
    });
    panel.querySelectorAll('[data-k-search-close]').forEach((b) => b.addEventListener('click', close));
    document.addEventListener('click', (e) => {
      if (panel.hidden) return;
      if (!panel.contains(e.target) && !trigger.contains(e.target)) close();
    });
  }

  /* --- 3f · Rozbaľovací selektor vo formulári ---------------------------- */

  // Päť čipov vedľa seba zaberalo dva riadky a v úzkom stĺpci sa lámalo.
  // Selektor ukáže jednu voľbu a zvyšok odkryje až po kliknutí. Hodnota ide
  // do skrytého inputu, takže formulár odosiela to isté ako predtým.
  function initSelect(root) {
    root.querySelectorAll('[data-k-select]').forEach((wrap) => {
      const btn = wrap.querySelector('[data-k-select-btn]');
      const list = wrap.querySelector('[data-k-select-list]');
      const label = wrap.querySelector('[data-k-select-label]');
      const input = wrap.querySelector('[data-k-select-input]');
      const options = [].slice.call(wrap.querySelectorAll('[data-k-select-option]'));
      if (!btn || !list || !options.length) return;

      const close = () => {
        list.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      };
      const open = () => {
        list.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        const active = options.find((o) => o.getAttribute('aria-selected') === 'true') || options[0];
        active.focus();
      };
      const pick = (opt) => {
        options.forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
        const v = opt.getAttribute('data-k-select-option');
        if (label) label.textContent = v;
        if (input) input.value = v;
        close();
        btn.focus();
      };

      btn.addEventListener('click', () => (list.hidden ? open() : close()));
      options.forEach((opt, i) => {
        opt.addEventListener('click', () => pick(opt));
        opt.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(opt); }
          if (e.key === 'Escape') { close(); btn.focus(); }
          if (e.key === 'ArrowDown') { e.preventDefault(); options[(i + 1) % options.length].focus(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); options[(i - 1 + options.length) % options.length].focus(); }
        });
      });
      document.addEventListener('click', (e) => {
        if (!list.hidden && !wrap.contains(e.target)) close();
      });
    });
  }

  /* --- 4 · FAQ ------------------------------------------------------------ */

  function initFaq(root) {
    root.querySelectorAll('[data-k-faq]').forEach((list) => {
      const items = [...list.querySelectorAll('details')];
      items.forEach((d) =>
        d.addEventListener('toggle', () => {
          if (!d.open) return;
          items.forEach((other) => {
            if (other !== d) other.open = false;
          });
        })
      );
    });
  }

  /* --- 5 · hlavička ------------------------------------------------------- */

  function initHeader(header) {
    if (header.dataset.kReady === 'true') return;
    header.dataset.kReady = 'true';

    /* prilepenie — tieň a nižší riadok po odscrollovaní */
    const bar = header.querySelector('[data-k-bar]');
    if (bar) {
      const onScroll = () => bar.classList.toggle('is-stuck', window.scrollY > 12);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    /* mega menu — otvára sa hoverom aj klávesnicou, zatvára Escapom */
    const items = [...header.querySelectorAll('[data-k-mega-item]')];
    let hoverTimer;

    const closeAll = (except) => {
      items.forEach((item) => {
        if (item === except) return;
        item.classList.remove('is-open');
        const trigger = item.querySelector('[data-k-mega-trigger]');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
    };

    items.forEach((item) => {
      const trigger = item.querySelector('[data-k-mega-trigger]');
      if (!trigger) return;

      const open = () => {
        clearTimeout(hoverTimer);
        closeAll(item);
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      };
      const close = () => {
        item.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      };

      item.addEventListener('mouseenter', open);
      item.addEventListener('mouseleave', () => {
        hoverTimer = setTimeout(close, 140);
      });
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        /* Fokus aj hover môžu menu otvoriť ešte pred udalosťou click.
           Click ho preto vždy nechá otvorené; inak sa po kliknutí okamžite
           zavrelo. Zatvorenie rieši Escape, klik mimo alebo odchod myšou. */
        open();
      });
      item.addEventListener('focusin', open);
      item.addEventListener('focusout', (e) => {
        if (!item.contains(e.relatedTarget)) close();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll(null);
    });
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) closeAll(null);
    });

    /* mobilná zásuvka */
    const drawer = header.querySelector('[data-k-drawer]');
    const scrim = header.querySelector('[data-k-scrim]');
    const openBtn = header.querySelector('[data-k-drawer-open]');
    const closeBtn = header.querySelector('[data-k-drawer-close]');

    if (drawer && scrim && openBtn) {
      const setDrawer = (open) => {
        drawer.classList.toggle('is-open', open);
        scrim.classList.toggle('is-open', open);
        openBtn.setAttribute('aria-expanded', String(open));
        drawer.setAttribute('aria-hidden', String(!open));
        document.documentElement.style.overflow = open ? 'hidden' : '';
        if (open) {
          const first = drawer.querySelector('a, button');
          if (first) first.focus();
        } else {
          openBtn.focus();
        }
      };

      openBtn.addEventListener('click', () => setDrawer(true));
      if (closeBtn) closeBtn.addEventListener('click', () => setDrawer(false));
      scrim.addEventListener('click', () => setDrawer(false));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('is-open')) setDrawer(false);
      });
      drawer.setAttribute('aria-hidden', 'true');
    }
  }

  /* --- prehliadka realizácií v recenziách ---------------------------------
     Rám stojí na mieste a scroll v ňom prehadzuje dvojice: najprv sa usadí
     fotografia, potom sa k nej vysunie recenzia, ďalšia dvojica prekryje
     predchádzajúcu zľava. Späť to ide rovnako, len opačne.

     Poloha sa počíta z dráhy pod prilepeným rámom, nie z počtu snímok, takže
     rýchly scroll pristane na správnom kroku a nič sa nepreskočí. */

  function initParada(root) {
    const host = root.querySelector('[data-k-parade]');
    if (!host) return;
    const stick = host.querySelector('.kh-parade__stick');
    const pary = Array.prototype.slice.call(host.querySelectorAll('[data-k-pair]'));
    if (!stick || pary.length < 2) return;

    /* Dva kroky na dvojicu: fotka, potom recenzia. */
    const krokov = pary.length * 2;
    let posledny = -1;
    let caka = false;

    const nastav = (krok) => {
      if (krok === posledny) return;
      posledny = krok;
      const aktivna = Math.min(pary.length - 1, Math.floor(krok / 2));
      const otvorena = krok % 2 === 1;
      pary.forEach((p, i) => {
        p.classList.toggle('is-live', i <= aktivna);
        /* Dvojica, ktorú už prekryla ďalšia, ostáva otvorená — je pod ňou,
           takže ju nikto nevidí, ale pri návrate hore je hneď na mieste. */
        p.classList.toggle('is-open', i < aktivna || (i === aktivna && otvorena));
      });
    };

    const prepocitaj = () => {
      caka = false;
      const draha = host.offsetHeight - stick.offsetHeight;
      if (draha <= 0) { nastav(krokov - 1); return; }
      const kam = -host.getBoundingClientRect().top;
      const podiel = Math.min(0.9999, Math.max(0, kam / draha));
      nastav(Math.floor(podiel * krokov));
    };

    const ozvi = () => { if (caka) return; caka = true; window.requestAnimationFrame(prepocitaj); };

    window.addEventListener('scroll', ozvi, { passive: true });
    window.addEventListener('resize', ozvi);
    prepocitaj();
  }

  /* --- štart -------------------------------------------------------------- */

  function init(scope) {
    scope.querySelectorAll('[data-k-root]').forEach((root) => {
      if (root.dataset.kReady === 'true') return;
      root.dataset.kReady = 'true';
      /* Každá sekcia sa spúšťa samostatne. Keď na stránke nejaká chýba —
         a na podstránkach chýba väčšina — nesmie jej chyba zhodiť zvyšok:
         predtým padlo odkrývanie obsahu a stránka ostala prázdna biela. */
      [initReveal, initRail, initFilters, initFaq, initAnchors,
       initProcess, initHeadline, initShots, initMatTabs, initSelect,
       initParada]
        .forEach((fn) => {
          try { fn(root); }
          catch (e) { if (window.console) console.warn("koverta: " + fn.name + " — " + e.message); }
        });
    });
    scope.querySelectorAll('[data-k-header]').forEach((h) => {
      try { initHeader(h); } catch (e) { if (window.console) console.warn("koverta: initHeader — " + e.message); }
    });
    // Vyhľadávanie je v hlavičke, teda mimo [data-k-root] — inicializuje sa
    // na úrovni dokumentu, aby videlo aj obsah stránky, v ktorom hľadá.
    try { initSearch(scope === document ? document : scope); }
    catch (e) { if (window.console) console.warn("koverta: initSearch — " + e.message); }
  }

  const boot = () => init(document);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', (e) => init(e.target));
})();
