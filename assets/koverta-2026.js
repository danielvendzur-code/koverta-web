/* ==========================================================================
   KOVERTA 2026 — správanie
     · odhaľovanie pri scrollovaní
     · posuvná lišta recenzií (šípky, ťahanie, klávesnica)
     · nástup referencií — najprv dôkaz, potom hlasy
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
    /* Odkrytie je jednosmerné. Predtým mu druhý pozorovateľ triedu pri
       odchode z okna zase odoberal — a to bola presne tá chyba, ktorú
       zadávateľ hlásil na recenziách: pri rýchlom scrollovaní prvok vojde
       a vyjde skôr, než dobehne 780 ms dlhý prechod, takže sekcia sa
       preletí v polovičnej priehľadnosti a nie je ju vidieť. Čo raz
       prišlo, ostáva na mieste. */
    const io = new IntersectionObserver(
      (entries) => {
        ozvalSa = true;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      /* Odkrytie sa spustí, len čo prvok vojde spodnou hranou do okna.
         Skôr by pohyb prebehol mimo obrazovky, neskôr by sa začínal až
         v strede — a to zadávateľ vytkol. */
      { rootMargin: '0px 0px 14% 0px', threshold: 0 }
    );

    items.forEach((el) => io.observe(el));

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
        /* Všetko od spodnej hrany okna nahor. Odkrytie je jednosmerné, takže
           prvok, ktorý pri rýchlom scrollovaní preletel oknom skôr, než sa
           pozorovateľ ozval, sa tu dorovná — a pri ceste späť hore je hotový,
           nie v polovici prechodu. */
        if (r.top < h * 0.9) el.classList.add('is-in');
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

  /* --- 2b · pohyb viazaný na polohu scrollu -------------------------------

     Jedno pravidlo pre celý web: čo sa hýbe, hýbe sa podľa toho, kde je
     stránka odscrollovaná, nie podľa časovača. Každý animovaný prvok dostane
     vlastnú premennú `--k-p` — číslo 0 až 1, teda „ako ďaleko som". CSS z nej
     robí výplň, posun alebo priehľadnosť; skript nerobí nič iné, než že ju
     počíta.

     Prečo takto. Predchádzajúce prevedenie spúšťalo časované animácie vo
     chvíli, keď sekcia vošla do okna, a malo strážcu, ktorý ich pri rýchlom
     scrolle dorovnal na koniec. Pri bežnom kolieskovom scrolle (okolo
     2 px/ms, teda nad hranicou strážcu) sa animácia začala, kým bola sekcia
     ešte pod spodnou hranou okna, a hneď ďalšia otočka kolieska ju zavrela —
     zadávateľ z nej nevidel ani snímku. Meranie to potvrdilo: sekcia prešla
     z ničoho rovno do koncového stavu v jednom kroku.

     Poloha scrollu tento problém nemá. Stav je funkciou polohy, takže
     rýchly scroll na koncovom stave len pristane, pomalý ho vykreslí celý a
     cesta späť hore ho ukáže znova. Neexistuje poloha, v ktorej by obsah
     chýbal: dráha je nastavená tak, že kým je sekcia v strede okna, je
     dávno hotová. */

  /* Choreografia. Pre každý blok: `draha` je podiel výšky okna, počas ktorého
     prebehne celý pohyb (0,6 = kým sekcia vystúpi o 60 % výšky okna). Každá
     stopa hovorí, ktoré prvky sa hýbu a v ktorom úseku dráhy — `krok` posunie
     úsek pre každý ďalší prvok v poradí, `max` zastaví stupňovanie. */
  const CHOREO = {
    hodnotenie: {
      draha: 0.60,
      stopy: [
        { sel: '.kh-rev__figures b',        od: 0.04, do: 0.52 },
        { sel: '.kh-rev__big .k-stars svg', od: 0.24, do: 0.42, krok: 0.05 },
        { sel: '.kh-rev__big small',        od: 0.48, do: 0.66 },
        { sel: '.kh-rev__source',           od: 0.42, do: 0.60 },
        { sel: '.kh-rev__social',           od: 0.48, do: 0.66 },
        { sel: '.kh-rev__award',            od: 0.54, do: 0.72 }
      ]
    },
    recenzie: {
      draha: 0.58,
      stopy: [
        { sel: '.kh-rev__nav',   od: 0.46, do: 0.68 }
      ]
    },
    kroky: {
      draha: 0.52,
      stopy: [ { sel: 'li > span', od: 0.08, do: 0.50, krok: 0.15 } ]
    },
    /* Fotografia sa v ráme posúva po celý čas, čo je rám na obrazovke —
       preto spojitá dráha od spodnej po hornú hranu okna. */
    parallax: { spojite: true, stopy: [] }
  };

  /* Rámy, ktoré dostanú posun obrazu bez toho, aby to bolo treba písať do
     HTML. Sú to všetko rámy s `overflow: hidden`, takže obraz sa má kam
     posunúť a rozloženie sa nemení. */
  const PARALAX = '.kh-mat__media, .kh-cat__media, .kh-work__media';

  function initScrub(root) {
    const bloky = [];

    const pridaj = (blok, plan) => {
      const ciele = [];
      (plan.stopy || []).forEach((stopa) => {
        [].slice.call(blok.querySelectorAll(stopa.sel)).forEach((el, i) => {
          const n = stopa.max == null ? i : Math.min(i, stopa.max);
          const posun = (stopa.krok || 0) * n;
          ciele.push({ el: el, od: stopa.od + posun, do: stopa.do + posun });
        });
      });
      if (!ciele.length && !plan.spojite) return;
      bloky.push({ blok: blok, plan: plan, ciele: ciele, posledne: -1 });
    };

    root.querySelectorAll('[data-k-scrub]').forEach((blok) => {
      const plan = CHOREO[blok.getAttribute('data-k-scrub')];
      if (plan) pridaj(blok, plan);
    });
    root.querySelectorAll(PARALAX).forEach((ram) => {
      if (ram.querySelector('img')) pridaj(ram, CHOREO.parallax);
    });
    if (!bloky.length) return;

    /* Koncový stav bez pohybu: pri prefers-reduced-motion aj vtedy, keď by
       meranie z akéhokoľvek dôvodu zlyhalo. Trieda `je-scrub` je jediné, čo
       v CSS zapína skryté východisko — bez nej je sekcia normálne vidieť. */
    const dokonca = () => {
      bloky.forEach((b) => {
        b.blok.classList.remove('je-scrub');
        b.blok.style.setProperty('--k-p', '1');
        b.ciele.forEach((c) => c.el.style.setProperty('--k-p', '1'));
      });
    };
    /* Pri prefers-reduced-motion sa engine NEvypína. Merať polohu nie je
       pohyb — pohybom je až to, čo z čísla urobí CSS. Vypĺňanie číslic a
       zosvetlenie hviezd sú zmeny farby, tie sa nechávajú vždy; posuny,
       odkrývanie fotky a putovanie obrazu v ráme sú v CSS zavreté v bloku
       `no-preference` a pri obmedzenom pohybe sa nekreslia.

       Prečo to takto: Windows majú prepínač „Animačné efekty", ktorý toto
       hlásenie zapína, a zapnutý býva aj u ľudí, ktorí o ňom nevedia —
       zadávateľ nevidel ani jednu z animácií práve preto. Vestibulárny
       problém robí pohyb, nie farba; toto rozdelenie dá zmysel obom
       stranám. */

    const orez = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

    const zmer = () => {
      const vh = window.innerHeight;
      /* Na konci stránky sa už nedá scrollovať ďalej. Prvok, ktorý by svoju
         dráhu dokončil až za koncom dokumentu, by tam ostal v polovici — a
         teda polopriehľadný. Posledná obrazovka je preto vždy hotová. */
      const dno = (document.documentElement.scrollHeight - window.scrollY - vh) < 4;
      bloky.forEach((b) => {
        const r = b.blok.getBoundingClientRect();
        /* Prvky ďaleko mimo okna sa nepočítajú — držia si poslednú hodnotu,
           takže to, čo už prešlo hore, ostáva hotové. */
        if (r.bottom < -240 || r.top > vh + 240) return;
        /* Dráha sa meria od chvíle, keď vrch prvku vojde spodnou hranou do
           okna, po chvíľu, keď vystúpi k hornej pätine. Je to takmer celá
           výška okna — pri kolieskovej myši osem až deväť otočiek —, takže
           pohyb beží celý čas, čo je prvok v strede obrazovky.

           Predtým to bolo 0,58 výšky okna a dráha končila, keď mal prvok
           vrch ešte v spodnej tretine: animácia dobehla, kým boli karty pri
           spodnej hrane, a v strede obrazovky už len stáli. Zadávateľ ju
           preto nevidel ani raz — a meranie premenných to neodhalilo, lebo
           tie sa menili správne, len na nesprávnom mieste obrazovky. */
        const p = b.plan.spojite
          ? orez((vh - r.top) / (vh + r.height))
          : orez((vh * 0.95 - r.top) / (vh * 0.80));
        const pk = dno ? 1 : p;
        if (Math.abs(pk - b.posledne) < 0.004) return;
        b.posledne = pk;
        b.blok.style.setProperty('--k-p', pk.toFixed(4));
        b.ciele.forEach((c) => {
          c.el.style.setProperty('--k-p', orez((pk - c.od) / (c.do - c.od)).toFixed(4));
        });
      });
    };

    /* Prvé meranie ide pred zapnutím skrytého východiska, takže sa nič
       nemihne: prvky, ktoré sú už v okne, dostanú svoju hodnotu ešte predtým,
       než ich CSS začne skrývať. */
    try { zmer(); } catch (e) { dokonca(); return; }
    bloky.forEach((b) => b.blok.classList.add('je-scrub'));

    let caka = false;
    const naplanuj = () => {
      if (caka) return;
      caka = true;
      const beh = () => {
        caka = false;
        try { zmer(); }
        catch (e) { dokonca(); window.removeEventListener('scroll', naplanuj); }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(beh);
      else window.setTimeout(beh, 32);
    };
    window.addEventListener('scroll', naplanuj, { passive: true });
    window.addEventListener('resize', naplanuj);
    /* Fotografie sa načítavajú lenivo; keď dorazia, rám má inú výšku. */
    root.querySelectorAll(PARALAX + ', .kh-rev__foto').forEach((ram) => {
      const img = ram.querySelector('img');
      if (img && !img.complete) img.addEventListener('load', naplanuj, { once: true });
    });
    /* Fotografia v karte sa kreslí, až keď je naozaj načítaná — nenačítaná by
       bola biela plocha nad textom recenzie. */
    root.querySelectorAll('.kh-rev__foto img').forEach((img) => {
      const hotovo = () => {
        const karta = img.closest('.kh-rev__card');
        if (karta && img.naturalWidth) karta.classList.add('is-foto');
      };
      if (img.complete) hotovo();
      else img.addEventListener('load', hotovo, { once: true });
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
          if (t < 0) return;
          /* Nad hornou hranicou sa krok nevracia na začiatok, ale ostáva na
             poslednom. Bez toho zostal postup stáť tam, kde ho scroll opustil
             — a keď sa doň človek vrátil zhora, ukazoval prvý krok, hoci
             posledný bol práve ten, z ktorého fotografie odchádzali. */
          const tt = Math.min(t, 0.999);
          const idx = Math.min(panels.length - 1, Math.max(0, Math.floor(tt * panels.length)));
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

  // Nadpis nabieha po celých riadkoch: každý riadok je okno s orezaním a text
  // v ňom vyjde zdola ako jeden kus. Predtým sa hýbalo každé slovo zvlášť a
  // ešte sa doostrovalo z rozostrenia — pri siedmich slovách to bolo sedem
  // drobných pohybov za sebou a nadpis sa „skladal". Jedno gesto na riadok
  // má váhu a nadpis je čitateľný od prvej chvíle.
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
              inner.appendChild(w);
            });
          } else {
            const w = document.createElement('span');
            w.className = 'k-word';
            w.appendChild(node.cloneNode(true));
            inner.appendChild(w);
          }
        });

        // Oneskorenie nesie riadok, nie slovo — druhý riadok vychádza, keď je
        // prvý v polovici dráhy, takže nadpis príde ako jeden pohyb.
        inner.style.setProperty('--k-line-delay', li * 140 + 'ms');
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

      const total = lines.length * 140 + 720;
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

  /* --- 3f · Prílohy v dopyte --------------------------------------------- */

  // Natívne pole na súbory ukáže po výbere len „3 files" v jazyku prehliadača.
  // Toto pod ním vypíše, čo je naozaj vybraté — človek tak vidí, že sa fotky
  // pripli, ešte pred odoslaním. Keď skript nenabehne, pole funguje ako predtým.
  function initSubory(root) {
    root.querySelectorAll('[data-k-subory]').forEach((input) => {
      const pole = input.closest('.kh-field');
      const hint = pole && pole.querySelector('.kh-field__hint');
      if (!hint) return;
      const povodny = hint.textContent;

      // Natívne pole píše „Choose Files / No file chosen" v jazyku prehliadača,
      // teda po anglicky aj na slovenskom webe. Postavíme nad ním vlastnú
      // plochu so slovenským popisom; pole samo ostáva v labeli, takže klik
      // kdekoľvek na plochu otvorí výber súborov. Keď skript nenabehne,
      // zobrazí sa pôvodné natívne pole a formulár funguje ako predtým.
      let stav = null;
      if (pole && !pole.querySelector('.kh-field__vyber')) {
        const box = document.createElement('span');
        box.className = 'kh-field__vyber';
        const btn = document.createElement('span');
        btn.className = 'kh-field__tlacidlo';
        btn.textContent = 'Vybrať fotky';
        stav = document.createElement('span');
        stav.className = 'kh-field__stav';
        stav.textContent = 'Zatiaľ nič nevybraté';
        box.appendChild(btn);
        box.appendChild(stav);
        input.parentNode.insertBefore(box, input);
        pole.classList.add('ma-vyber');
      }

      input.addEventListener('change', () => {
        const n = input.files ? input.files.length : 0;
        if (!n) {
          hint.textContent = povodny;
          if (stav) stav.textContent = 'Zatiaľ nič nevybraté';
          pole.classList.remove('je-vybrate');
          return;
        }
        const mena = [].slice.call(input.files).map((f) => f.name);
        hint.textContent = n === 1
          ? 'Pripojené: ' + mena[0]
          : 'Pripojené ' + n + ' súbory: ' + mena.join(', ');
        if (stav) {
          stav.textContent = n === 1
            ? mena[0]
            : n + (n < 5 ? ' súbory' : ' súborov');
        }
        pole.classList.add('je-vybrate');
      });
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

  /* Čo človek napíše verzus ako sa to na webe volá. Kľúč je to, čo príde do
     poľa; hodnoty sú slová, ktoré sa majú hľadať popri ňom. Bez tohto nenájde
     „garáž" prístrešok, „žalúzie" tienenie ani „cenník" stránku s cenami — a
     to sú tri najčastejšie veci, ktoré ľudia do poľa naozaj píšu. */
  const SLOVNIK = {
    carport: ['pristresok', 'auto'],
    garaz: ['pristresok', 'auto', 'carport'],
    parkovanie: ['pristresok', 'auto', 'carport'],
    vozidlo: ['auto'],
    pristresok: ['carport', 'prestresenie'],
    pristresky: ['carport', 'prestresenie'],
    prestresenie: ['pristresok', 'strecha'],
    zastresenie: ['pristresok', 'prestresenie', 'strecha'],
    altanok: ['pergola', 'zahradny'],
    altan: ['pergola'],
    pergola: ['bioklimaticka', 'lamely'],
    zaluzie: ['lamely', 'tienenie'],
    zaluzia: ['lamely', 'tienenie'],
    markiza: ['tienenie', 'roleta'],
    roleta: ['zip', 'tienenie'],
    rolety: ['zip', 'tienenie'],
    screen: ['zip', 'roleta', 'tienenie'],
    clona: ['tienenie', 'lamely'],
    brisolej: ['tienenie', 'lamely'],
    terasa: ['zahradne', 'pergola'],
    balkon: ['prestresenie', 'pristresok'],
    vchod: ['prestresenie', 'pristresok'],
    kuchyna: ['kuchyne', 'gril'],
    gril: ['kuchyne'],
    grill: ['kuchyne'],
    cennik: ['cena', 'ponuka'],
    cena: ['ponuka', 'cennik'],
    stoji: ['cena'],
    zameranie: ['obhliadka', 'ponuka'],
    montaz: ['realizacia', 'dodanie'],
    povolenie: ['ohlasenie', 'urad'],
    ohlasenie: ['povolenie', 'urad'],
    patky: ['zaklad', 'kotvenie'],
    patka: ['zaklad', 'kotvenie'],
    zaklady: ['patky', 'kotvenie'],
    kotvenie: ['patky', 'zaklad'],
    hlinik: ['soltec', 'alu'],
    alu: ['hlinik'],
    ocel: ['koverta', 'konstrukcia'],
    farba: ['ral', 'lak', 'odtien'],
    farby: ['ral', 'lak', 'odtien'],
    ral: ['farba', 'lak'],
    fotovoltika: ['solar', 'panely'],
    solar: ['fotovoltika'],
    led: ['osvetlenie', 'svetlo'],
    svetlo: ['led', 'osvetlenie'],
    box: ['sklad', 'uzamykatelny'],
    sklad: ['box'],
    sneh: ['zatazenie', 'nosnost'],
    vietor: ['odolnost', 'snimac'],
    zaruka: ['norma', 'reklamacia'],
    kontakt: ['telefon', 'email'],
    mapa: ['realizacie', 'obce'],
    referencie: ['realizacie'],
    galeria: ['realizacie', 'fotografie'],
    /* Značka sa píše aj foneticky a aj s veľkými písmenami — veľké písmená
       zrovná normalizácia, „soltek" nie. */
    soltek: ['soltec'],
    soltech: ['soltec'],
    /* Fotovoltika verzus fotovoltaika: obidva tvary sú v obehu, na webe je
       jeden. FVE je skratka z faktúr a z rečí okolo dotácií. */
    fotovoltaika: ['fotovoltika', 'solar', 'panely'],
    fotovoltaicky: ['fotovoltika', 'solar', 'panely'],
    fve: ['fotovoltika', 'solar', 'panely'],
    panel: ['fotovoltika', 'solar'],
    panely: ['fotovoltika', 'solar'],
    /* Rozmer sa pýta aj slovom. */
    rozmer: ['rozmery', 'sirka', 'dlzka'],
    velkost: ['rozmery'],
    m2: ['rozmery', 'plocha'],
    /* Bežné vstupy do poľa, ktoré na webe nemajú svoje slovo. */
    dvojgaraz: ['dve', 'auta', 'carport'],
    jednogaraz: ['jedno', 'auto', 'carport'],
    obytny: ['pergola', 'terasa'],
    prislusenstvo: ['vybava', 'doplnky'],
    doplnky: ['vybava', 'prislusenstvo'],
    vybava: ['doplnky', 'prislusenstvo']
  };

  /* Vyhľadávacie pole a pripravený index musia zrovnávať text rovnako, inak
     sa nestretnú. Platí jedno pravidlo pre obidve strany: dole, bez dĺžňov,
     násobenie ako „x" s medzerami okolo čísel, horný index ako číslica
     (m² = m2) a všetko ostatné, čo nie je písmeno ani číslica — spojovník,
     lomka, bodka, úvodzovka — sa mení na medzeru.

     Vďaka tomu nájde „6x6" aj „6 × 6", „m2" aj „m²", „bio-klimaticka" aj
     „bioklimaticka" a „6,5" aj „6.5". */
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[×✕✖]/g, 'x')
      .replace(/²/g, '2')
      .replace(/³/g, '3')
      .replace(/(\d)\s*x\s*(\d)/g, '$1 x $2')
      .replace(/(\d)\s*x\s*(\d)/g, '$1 x $2')
      .replace(/[^a-z0-9]+/g, ' ')
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

    /* Odčítač obrazovky nemal z čoho poznať, že písanie do poľa mení zoznam
       pod ním: pole bolo obyčajný input a výsledky obyčajné odkazy. Pole je
       preto combobox, ktorý ovláda zoznam volieb, a počet nájdeného sa
       ohlási zvlášť — inak by čítalo desať odkazov bez toho, aby povedalo,
       koľko ich je. */
    if (!list.id) list.id = 'kv-search-vysledky';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Výsledky hľadania');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    const hlas = document.createElement('p');
    hlas.className = 'k-visually-hidden';
    hlas.setAttribute('role', 'status');
    hlas.setAttribute('aria-live', 'polite');
    list.parentNode.insertBefore(hlas, list);

    const close = () => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      input.setAttribute('aria-expanded', 'false');
    };

    /* Index celého webu. Doteraz sa hľadalo len v tom, čo práve bolo na
       stránke — slovo z inej podstránky sa preto nedalo nájsť vôbec. Teraz sa
       pri prvom otvorení stiahne pripravený zoznam (názvy sekcií, otázky,
       produkty, riadky tabuliek, výbava) zo všetkých pätnástich stránok.
       Kým sa stiahne — a keby sa nestiahol vôbec — platí pôvodný index
       z otvorenej stránky, takže vyhľadávanie funguje vždy. */
    const cestaIndexu = () => {
      const css = document.querySelector('link[rel="stylesheet"][href*="koverta-2026.css"]');
      const href = css ? css.getAttribute('href') : '';
      const zaklad = href ? href.replace(/koverta-2026\.css.*$/, '') : './assets/';
      /* Index sa berie s tou istou značkou verzie ako štýl. Bez nej ostával
         v prehliadači starý zoznam aj po tom, čo na webe pribudla stránka —
         hľadalo sa v tom, čo tam bolo minule. */
      const verzia = (href.match(/\?v=[^&#]*/) || [''])[0];
      return zaklad + 'hladanie.json' + verzia;
    };

    /* Odkazy v indexe sú od koreňa webu, lebo ten istý index slúži všetkým
       podstránkam. Na podstránke sa preto pred ne dá „../“. */
    const koren = () => {
      const css = document.querySelector('link[rel="stylesheet"][href*="koverta-2026.css"]');
      const zaklad = css ? css.getAttribute('href').replace(/assets\/koverta-2026\.css.*$/, '') : './';
      return zaklad || './';
    };

    let cely = null;
    let stahujem = false;
    const dotiahni = () => {
      if (cely || stahujem || !window.fetch) return;
      stahujem = true;
      window.fetch(cestaIndexu(), { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.polozky || !d.polozky.length) return;
          cely = d.polozky.map(function (it) {
            return {
              title: it.t,
              note: it.p,
              href: /^(https?:|mailto:|tel:)/.test(it.u) ? it.u : koren() + it.u,
              img: it.o,
              kind: it.k,
              hay: it.h + ' ' + norm(it.t + ' ' + it.p)
            };
          });
          if (!panel.hidden) render(input.value);
        })
        .catch(function () {});
    };

    const zdroj = function () { return cely || index || []; };

    /* Vzdialenosť na jednu-dve opravy — preklep typu „pergla" alebo
       „pristesok". Počíta sa len po prekročenie limitu, takže je to lacné aj
       pri stovkách položiek. */
    const blizko = function (a, b, limit) {
      const rozdiel = a.length - b.length;
      if (rozdiel > limit || rozdiel < -limit) return false;
      let i = 0, j = 0, chyby = 0;
      while (i < a.length && j < b.length) {
        if (a.charCodeAt(i) === b.charCodeAt(j)) { i++; j++; continue; }
        if (++chyby > limit) return false;
        if (a.length > b.length) i++;
        else if (a.length < b.length) j++;
        else { i++; j++; }
      }
      return chyby + (a.length - i) + (b.length - j) <= limit;
    };

    /* Slovenčina ohýba: „ohlásenie" verzus „ohlásením", „pätka" verzus
       „pätky". Kmeň je prvých päť až sedem znakov — dosť na to, aby sa tvary
       stretli, a dosť dlhý na to, aby nespájal nesúvisiace slová. */
    const kmen = function (w) {
      return w.length > 5 ? w.slice(0, w.length - Math.min(3, w.length - 5)) : w;
    };

    /* Ako blízko je jedno slovo k jednej položke. Nula znamená „vôbec".
       Poradie váh je poradie istoty: názov pred popisom, začiatok pred
       stredom, presné slovo pred kmeňom a kmeň pred preklepom. */
    const slovoSkore = function (it, w) {
      const t = it.nt || (it.nt = norm(it.title));
      const np = it.np || (it.np = norm(it.note));
      if (t === w) return 14;
      if (t.indexOf(w + ' ') === 0) return 11;
      if ((' ' + t).indexOf(' ' + w) > -1) return 9;
      if (t.indexOf(w) === 0) return 8;
      if (t.indexOf(w) > -1) return 6;
      if ((' ' + np).indexOf(' ' + w) > -1) return 4;
      if (np.indexOf(w) > -1) return 3;
      if ((' ' + it.hay).indexOf(' ' + w) > -1) return 2.5;
      if (it.hay.indexOf(w) > -1) return 1.6;
      const k = kmen(w);
      if (k.length >= 5 && (t.indexOf(k) > -1 || it.hay.indexOf(k) > -1)) return 1.2;
      /* Preklep skúšame až celkom na koniec a len proti slovám v názve —
         inde by to bolo drahé aj nepresné. */
      if (w.length >= 5) {
        const limit = w.length >= 8 ? 2 : 1;
        const casti = t.split(' ');
        for (let i = 0; i < casti.length; i++) {
          if (casti[i].length >= 4 && blizko(casti[i], w, limit)) return 1.8;
        }
      }
      return 0;
    };

    /* Hľadá sa po slovách: nájsť treba všetky, nie len celý reťazec. Vďaka
       tomu prejde aj „pergola zip" alebo „carport 6 m". Každé slovo si so
       sebou nesie svoje synonymá — stačí, aby sadlo ktorékoľvek z nich, len
       sa počíta slabšie než to, čo človek naozaj napísal. */
    const skore = function (it, skupiny, dopyt) {
      let sk = 0;
      let sedi = 0;
      let dlhe = true;
      let silne = false;
      for (let i = 0; i < skupiny.length; i++) {
        const varianty = skupiny[i];
        let najlepsie = 0;
        for (let j = 0; j < varianty.length; j++) {
          const v = slovoSkore(it, varianty[j]) * (j === 0 ? 1 : 0.62);
          if (v > najlepsie) najlepsie = v;
        }
        if (najlepsie) { sedi++; sk += najlepsie; if (najlepsie >= 6) silne = true; }
        else if (varianty.hlavne) dlhe = false;
      }
      /* Keď človek napíše vetu — „box na náradie" —, nemusí byť na webe každé
         slovo. Stačí, aby sadla väčšina a medzi nimi to najdlhšie; za každé
         nenájdené sa strhne. Pri jedinom slove sa neodpúšťa nič. */
      const chyba = skupiny.length - sedi;
      if (!sedi) return 0;
      /* Pri jedinom slove sa neodpúšťa nič. Pri vete stačí, aby sadla
         polovica slov alebo aspoň jedno priamo v názve — „box na náradie"
         nájde box aj vtedy, keď slovo náradie na webe nie je. */
      if (skupiny.length === 1) { if (chyba) return 0; }
      else if (!dlhe && !silne && sedi * 2 < skupiny.length) return 0;
      sk -= chyba * 3;
      if (sk <= 0) return 0;
      if (it.nt === dopyt) sk += 20;
      else if (it.nt.indexOf(dopyt) === 0) sk += 8;
      else if (it.nt.indexOf(dopyt) > -1) sk += 4;
      /* Stránka a produkt sú cieľ, sekcia a parameter len cesta k nemu. */
      if (it.kind === 'Stránka') sk += 5;
      else if (it.kind === 'Produkt' || it.kind === 'Katalóg') sk += 3;
      else if (it.kind === 'Obec') sk += 2;
      else if (it.kind === 'Otázka') sk += 1;
      /* Pri rovnakej zhode vyhráva kratší názov — býva konkrétnejší. */
      sk += Math.max(0, 3 - it.nt.length / 22);
      return sk;
    };

    const render = (q) => {
      const nq = norm(q);
      /* Čísla nechávame aj jednoznakové („9 × 6 m“), písmená až od dvoch. */
      /* Predložky a spojky nič nehľadajú, len rozostrujú — „pergola na
         terasu" má hľadať pergolu a terasu. */
      const VYPLN = ' a aj do i k na nad o od pod po pre pri s so u v vo z za je su sa ktory ktora ';
      const slova = nq.split(' ').filter(function (w) {
        if (VYPLN.indexOf(' ' + w + ' ') > -1) return false;
        return w.length > 1 || /[0-9]/.test(w);
      });
      list.innerHTML = '';
      active = -1;

      if (shopLink) {
        shopLink.hidden = !nq;
        shopLink.href = 'https://koverta.sk/search?q=' + encodeURIComponent(q);
        const label = shopLink.querySelector('span');
        if (label) label.textContent = 'Hľadať „' + q + '" v celom e-shope';
      }

      if (!slova.length) {
        empty.hidden = false;
        empty.textContent = 'Napíšte, čo hľadáte — napríklad „pergola", „ZIP roleta" alebo „prístrešok pre dve autá".';
        hlas.textContent = '';
        return;
      }

      /* Každé napísané slovo dostane svoju skupinu: prvé je to, čo človek
         naozaj napísal, za ním jeho synonymá. */
      let najdlhsie = '';
      slova.forEach(function (w) { if (w.length > najdlhsie.length) najdlhsie = w; });
      const skupiny = slova.map(function (w) {
        const rad = [w];
        const syn = SLOVNIK[w] || SLOVNIK[kmen(w)];
        if (syn) for (let i = 0; i < syn.length; i++) rad.push(syn[i]);
        rad.hlavne = w === najdlhsie;
        return rad;
      });

      const vsetky = zdroj()
        .map(function (it) { return { it: it, score: skore(it, skupiny, nq) }; })
        .filter(function (r) { return r.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });

      /* Desať výsledkov z jednej podstránky je zoznam kotiev, nie odpoveď.
         Na „pergola" boli osem z desiatich riadky z bioklimatických pergol
         a stránka o záhradných prístreškoch sa nezmestila.

         Z každej podstránky preto najprv prejdú najviac dva najsilnejšie
         výsledky. Až keď ich je dokopy menej ako desať, dopĺňajú sa ostatné
         v pôvodnom poradí — takže sa nikdy nestratí nič, čo by inak bolo
         vidieť. */
      const strana = function (r) { return String(r.it.href || '').split('#')[0]; };
      const kolko = {};
      const prve = [];
      const zvysok = [];
      vsetky.forEach(function (r) {
        const s = strana(r);
        kolko[s] = (kolko[s] || 0) + 1;
        (kolko[s] <= 2 ? prve : zvysok).push(r);
      });
      const hits = prve.concat(zvysok).slice(0, 10);

      empty.hidden = hits.length > 0;
      if (!hits.length) empty.textContent = 'Nič sme nenašli. Skúste iné slovo alebo nám napíšte — poradíme.';
      hlas.textContent = hits.length
        ? (hits.length === 1 ? '1 výsledok' : (hits.length < 5 ? hits.length + ' výsledky' : hits.length + ' výsledkov'))
        : 'Žiadny výsledok';

      hits.forEach(function (r) {
        const a = document.createElement('a');
        a.className = 'kv-search__hit';
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', 'false');
        a.href = r.it.href;
        const thumb = document.createElement('span');
        thumb.className = 'kv-search__thumb' + (r.it.img ? '' : ' kv-search__thumb--blank');
        if (r.it.img) {
          const im = document.createElement('img');
          im.src = r.it.img;
          im.alt = '';
          im.loading = 'lazy';
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
        if (r.it.kind) {
          const kd = document.createElement('span');
          kd.className = 'kv-search__druh';
          kd.textContent = r.it.kind;
          a.appendChild(kd);
        }
        a.addEventListener('click', close);
        list.appendChild(a);
      });
    };

    const open = (predvolba) => {
      if (!index) index = buildIndex(document);
      dotiahni();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-expanded', 'true');
      input.value = predvolba || '';
      render(input.value);
      input.focus();
    };

    const move = (dir) => {
      const hits = [].slice.call(list.querySelectorAll('.kv-search__hit'));
      if (!hits.length) return;
      active = (active + dir + hits.length) % hits.length;
      hits.forEach((h, i) => {
        h.classList.toggle('is-active', i === active);
        h.setAttribute('aria-selected', i === active ? 'true' : 'false');
      });
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

    /* Index má 383 položiek a 161 kB (40 kB po kompresii). Sťahoval sa až
       pri prvom otvorení panela, takže prvé napísané slovo hľadalo len
       v otvorenej stránke a zvyšok webu dobehol o chvíľu neskôr. Teraz sa dotiahne v čase, keď
       prehliadač aj tak nič nerobí — po načítaní a v nečinnosti, nie počas
       nej. Keď `requestIdleCallback` nie je (Safari), stačí odklad. */
    const predstiahni = () => {
      if (navigator.connection && (navigator.connection.saveData ||
          /2g/.test(navigator.connection.effectiveType || ''))) return;
      if (window.requestIdleCallback) window.requestIdleCallback(dotiahni, { timeout: 4000 });
      else setTimeout(dotiahni, 2500);
    };
    if (document.readyState === 'complete') predstiahni();
    else window.addEventListener('load', predstiahni, { once: true });

    /* Odkaz s `?q=` otvorí vyhľadávanie rovno s hľadaným výrazom. Vďaka tomu
       je `SearchAction` v štruktúrovaných dátach pravdivá — Google aj ktokoľvek
       iný sa vie odkázať priamo na výsledok hľadania. */
    try {
      const hladane = new URLSearchParams(window.location.search).get('q');
      if (hladane) open(hladane);
    } catch (e) {}
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

  /* --- Tri realizácie sa cestou zmenia na tri recenzie --------------------
     V piatom kroku postupu stoja tri fotografie realizácií. Ako sekcia
     recenzií prichádza zdola, presne tie tri fotografie sa zmenšia a dosadnú
     do troch kariet s recenziami. Je to jeden plynulý presun, nie výmena
     obrázkov: to, čo ste videli ako hotovú prácu, sa pred očami stane tým,
     čo o nej zákazník napísal.

     Predchádzajúca podoba sa triasla a bolo to na nej vidieť po celý čas.
     Mala dve príčiny a obe sú preč:

     1. Prelet prepisoval každý snímok `left`, `top`, `width` a `height`.
        To sú rozmery, teda prepočet rozloženia a zaokrúhľovanie na celé
        pixely v každom snímku — obraz sa jemne chvel. Teraz sa píše jedine
        `transform`, ktorý ide mimo rozloženia; rozmery sa nastavia raz a
        menia sa len pri zmene veľkosti okna.

     2. Mriežku recenzií držal skript posunom, aby bol na prelet priestor.
        Taký posun ide vždy o snímok za skutočným scrollom, takže sa celá
        sekcia s recenziami voči zvyšku stránky knísala. Nič sa už nedrží —
        prelet sa zmestí do bežného príchodu sekcie a stránka sa scrolluje
        normálne.

     Zdroj aj cieľ majú rovnaký pomer strán, takže je to čistá zmena mierky
     bez deformácie. */
  function initPrelet(root) {
    const zoznam = root.querySelector('.kh-rev__list[data-k-scrub]');
    const trio = root.querySelector('[data-k-trio]');
    if (!zoznam || !trio) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(min-width: 1000px)').matches) return;

    const zdroje = [...trio.querySelectorAll('.kh-proc__trio-kus')];
    const karty = [...zoznam.querySelectorAll('.kh-rev__card')]
      .filter((k) => k.querySelector('.kh-rev__foto'))
      .slice(0, zdroje.length);
    if (!zdroje.length || zdroje.length !== karty.length) return;

    const kusy = karty.map((karta, i) => {
      const slot = karta.querySelector('.kh-rev__foto');
      const obr = slot.querySelector('img');
      const scena = document.createElement('div');
      scena.className = 'kh-rev__scena';
      scena.setAttribute('aria-hidden', 'true');
      const kopia = new Image();
      kopia.src = obr.currentSrc || obr.src;
      kopia.alt = '';
      kopia.decoding = 'async';
      scena.appendChild(kopia);
      document.body.appendChild(scena);
      const kus = { karta: karta, slot: slot, zdroj: zdroje[i], scena: scena, kopia: kopia, w: 0, h: 0, letí: null };
      /* Po obnovení stránky priamo v tejto časti webu ešte fotografie nie sú
         načítané. Kým nie sú, nesmie sa prelet spustiť — inak by leteli tri
         prázdne rámčeky a fotografie v piatom kroku by boli medzitým skryté.
         Do tej chvíle teda stoja na svojom mieste v kroku a prelet čaká. */
      /* `naplan` je deklarovaný nižšie; šípka odloží jeho vyhľadanie až na
         chvíľu, keď fotografia doletí — vtedy už dávno existuje. */
      if (!kopia.complete) kopia.addEventListener('load', () => naplan(), { once: true });
      return kus;
    });

    const panelKroku = trio.closest('.kh-proc__panel');
    const orez = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const medzi = (a, b, t) => a + (b - a) * t;
    const kolaj = zoznam.querySelector('[data-k-rail-track]') || zoznam;
    let ceka = false;
    /* Vykresľovaná hodnota preletu a príznak, že sa má dobiehať ďalej. */
    let mojP = null;
    let bezi = false;
    const hladko = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Prelet mieri do prvých troch kariet. Keď si niekto v recenziách posunie
       lištu na ďalšie, tie tri karty odídu nabok — a fotografie by leteli za
       nimi mimo obrazovku. Vtedy sa prelet nespúšťa vôbec: fotografie stoja
       v piatom kroku aj v kartách tak, ako majú. */
    /* Prah je vyšší než jedna medzera medzi kartami: prehliadač si lištu
       so `scroll-snap` sám dorovnáva o pár desiatok pixelov a to ešte
       neznamená, že si niekto listuje ďalšie recenzie. */
    const vedla = () => kolaj.scrollLeft > 40;

    const vratKartu = () => {
      if (panelKroku && panelKroku.dataset.kOdlet !== '0') {
        panelKroku.dataset.kOdlet = '0';
        panelKroku.style.removeProperty('--k-odlet');
      }
    };

    const vypni = () => {
      vratKartu();
      mojP = null;
      kusy.forEach((k) => {
        if (k.letí !== 'vyp') {
          k.scena.style.display = 'none';
          k.slot.style.visibility = '';
          k.zdroj.style.visibility = '';
          k.kp = '1'; k.karta.style.setProperty('--k-p', '1');
          k.letí = 'vyp';
        }
      });
    };

    const zmer = () => {
      ceka = false;
      const vh = window.innerHeight || 1;
      if (vedla()) { vypni(); return; }
      if (window.innerWidth < 1000) {
        vratKartu();
        mojP = null;
        kusy.forEach((k) => {
          if (k.letí !== false) {
            k.scena.style.display = 'none';
            k.slot.style.visibility = '';
            k.zdroj.style.visibility = '';
            k.kp = null; k.karta.style.removeProperty('--k-p');
            k.letí = false;
          }
        });
        return;
      }

      /* Dráha je bežný príchod sekcie oknom — nič sa nedrží, nič nepribúda.
         Pri nule je sekcia recenzií ešte obrazovku pod okrajom a fotografie
         ležia presne na svojich miestach v piatom kroku; pri jednotke sú
         karty v hornej tretine okna a fotografie v nich.

         Začiatok je presne tam, kde sa postup prestáva držať pod hlavičkou
         a začne odchádzať hore — dovtedy fotografie stoja na mieste v piatom
         kroku. Dráha je dlhšia než vzdialenosť, ktorú majú fotografie na
         stránke prekonať, takže na obrazovke celý čas mierne stúpajú a nikdy
         sa neotočia späť. */
      const r = zoznam.getBoundingClientRect();
      /* Odmerané na úvode pri okne 900 px: piaty krok je prilepený pod
         hlavičkou (fotografie na 108 px) dovtedy, kým je zoznam recenzií
         zhruba 1,15 obrazovky pod okrajom. Až vtedy sa odlepí a začne
         odchádzať hore. Presne tam musí prelet začať — pri pôvodnom začiatku
         na jednej obrazovke boli fotografie v tej chvíli už 20 px nad horným
         okrajom okna a prelet sa rozbiehal mimo obrazovky. Koniec je tam, kde
         karty recenzií dosadnú do hornej tretiny okna. Pri týchto hraniciach
         idú fotografie po obrazovke 120 → 200 px, teda stále mierne nadol,
         nikdy nie za hlavičku a nikdy sa neotočia. */
      const zaciatok = vh * 1.15;
      const koniec = vh * 0.18;
      let p = orez((zaciatok - r.top) / (zaciatok - koniec));
      /* Koliesko myši posúva stránku po skokoch — surová hodnota z polohy
         scrollu preto fotografie posúvala tiež skokom. Vykresľovaná hodnota
         teraz beží za cieľovou vlastným tempom, takže prelet plynie aj vtedy,
         keď scroll prichádza po stovkách pixelov. Pri obmedzenom pohybe sa
         nedohaňa nič — tam má byť pohyb čo najkratší. */
      if (hladko) {
        if (mojP === null) mojP = p;
        const rozdiel = p - mojP;
        if (Math.abs(rozdiel) < 0.0008) mojP = p;
        else { mojP += rozdiel * 0.24; bezi = true; }
        p = mojP;
      }
      /* Kým nie je načítaná každá z troch kópií, prelet nebeží: fotografie
         ostávajú v piatom kroku a v kartách recenzií tam, kde majú byť. */
      const pripravene = kusy.every((k) => k.kopia.complete && k.kopia.naturalWidth > 0);
      if (!pripravene) p = 0;
      /* Postup je rovnomerný, zámerne bez zrýchlenia v strede. Fotografie
         majú na stránke prekonať menšiu vzdialenosť, než akú medzitým
         odscrolluje okno — pri rovnomernom postupe preto na obrazovke stále
         mierne stúpajú a nikdy sa neotočia späť. Akékoľvek zrýchlenie v
         strede by ich na chvíľu poslalo nadol a to je presne to knísanie,
         ktoré na predchádzajúcej podobe rušilo. */
      const e = p;

      const letí = p > 0.001 && p < 0.999;

      /* Najprv sa všetko odmeria a až potom sa všetko zapíše. Keď sa čítanie
         a zápis striedali v jednom cykle, prehliadač musel po každom zápise
         prepočítať rozloženie znova, aby vedel odpovedať na ďalšie meranie —
         tri také prepočty v každom snímku boli hlavný dôvod, prečo scroll
         v tejto časti stránky poskakoval. */
      const merania = letí ? kusy.map((k) => ({
        d: k.slot.getBoundingClientRect(),
        z: k.zdroj.getBoundingClientRect()
      })) : null;

      /* Fotografie odlietajú z piateho kroku, ale samotná karta kroku ostáva
         ešte dlho na obrazovke — a s prázdnymi rámčekmi po fotografiách
         vyzerá pokazene. Karta sa preto počas preletu vytráca. */
      const odlet = orez(p / 0.26).toFixed(3);
      if (panelKroku && panelKroku.dataset.kOdlet !== odlet) {
        panelKroku.dataset.kOdlet = odlet;
        panelKroku.style.setProperty('--k-odlet', odlet);
      }

      kusy.forEach((k, i) => {
        /* Karta sa objavuje pod fotografiou v poslednej tretine presunu,
           takže fotografia dosadá na hotovú recenziu, nie do prázdna.
           Zapisuje sa len pri zmene — každý zápis do karty je prepočet
           štýlu vnútri posuvnej lišty a tá si po ňom dorovnáva polohu. */
        const kp = orez((p - 0.55) / 0.4).toFixed(3);
        if (k.kp !== kp) { k.kp = kp; k.karta.style.setProperty('--k-p', kp); }

        if (!letí) {
          if (k.letí !== p) {
            k.scena.style.display = 'none';
            k.slot.style.visibility = p >= 0.999 ? '' : 'hidden';
            k.zdroj.style.visibility = p >= 0.999 ? 'hidden' : '';
            k.letí = p;
          }
          return;
        }
        k.letí = p;

        const d = merania[i].d;
        const z = merania[i].z;
        if (!d.width || !z.width) return;

        /* Rozmer sa nastaví len vtedy, keď sa naozaj zmenil — inak by sa
           rozloženie prepočítavalo v každom snímku a obraz by sa chvel. */
        if (Math.abs(d.width - k.w) > 0.5 || Math.abs(d.height - k.h) > 0.5) {
          k.w = d.width;
          k.h = d.height;
          k.scena.style.width = d.width.toFixed(1) + 'px';
          k.scena.style.height = d.height.toFixed(1) + 'px';
        }
        k.scena.style.display = 'block';
        k.slot.style.visibility = 'hidden';
        k.zdroj.style.visibility = 'hidden';

        const x = medzi(z.left, d.left, e);
        const y = medzi(z.top, d.top, e);
        const m = medzi(z.width, d.width, e) / k.w;
        k.scena.style.transform =
          'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + m.toFixed(4) + ')';
      });
    };

    const naplan = () => { if (!ceka) { ceka = true; requestAnimationFrame(krok); } };
    function krok() {
      bezi = false;
      zmer();
      if (bezi) { ceka = true; requestAnimationFrame(krok); }
    }
    window.addEventListener('scroll', naplan, { passive: true });
    window.addEventListener('resize', naplan, { passive: true });
    kolaj.addEventListener('scroll', naplan, { passive: true });
    zmer();
  }

  /* --- Popis otázok ide s vami, ale úmerne --------------------------------
     Ľavý panel s nadpisom a telefónom stál v strede a pri dlhom zozname
     otázok ostal na mieste, kým človek čítal dvanásť odpovedí pod sebou.

     Text v paneli sa teraz posúva presne o toľko, o koľko odscrolluje zoznam
     — teda úmerne, nie skokom — a zastaví, keď dosiahne spodok panela. Hore
     pri prvej otázke je hore, pri poslednej dole.

     Robí to skript posunom, nie `position: sticky`: posun je jeden údaj,
     ktorý sa dá presne ohraničiť, takže panel nikdy nevyjde zo svojej plochy.
     Panel má vlastnú farebnú plochu, preto sa hýbe jeho obsah, nie on sám. */

  /* --- Súhlas s meraním ---------------------------------------------------
     Google Consent Mode beží už v hlavičke a kým návštevník nerozhodne, sú
     všetky kategórie zamietnuté — Tag Manager sa načíta, ale žiadna značka
     nesmie zapisovať do prehliadača. Lišta je len rozhranie k tomu
     rozhodnutiu: zapíše ho, pošle `consent update` a zmizne. Voľba sa dá
     kedykoľvek zmeniť odkazom v pätke. */
  /* --- Video v úvode ------------------------------------------------------
     Fotografia ostáva v značke aj naďalej: nesie alternatívny text, načíta sa
     prvá a je to ona, čo prehliadač meria ako najväčší prvok. Video sa na ňu
     položí až keď sa naozaj rozbehne, takže úvod nikdy nebliká na prázdno.
     Nepustí sa pri obmedzenom pohybe, pri zapnutom šetrení dát ani na pomalom
     pripojení — dve megabajty nemá zmysel ťahať cez EDGE. Keď úvod odscrolluje
     z obrazovky, video sa zastaví, aby zbytočne nekreslilo. */
  /* --- Dopyt: poďakovanie namiesto odchodu na e-shop -----------------------
     Formulár posiela dáta do Shopify na koverta.sk. Doteraz to znamenalo, že
     prehliadač odišiel preč a zákazník skončil na cudzej stránke bez toho,
     aby vedel, čo bude ďalej. Odoslanie teraz ide cez skrytý rám — je to ten
     istý skutočný POST vrátane príloh —, stránka ostáva a na mieste formulára
     sa objaví poďakovanie s postupom.

     Keby skript nebežal, formulár sa odošle tak ako predtým. Nič sa nestratí. */
  function initDopyt(root) {
    const formulare = root.querySelectorAll('form[data-k-dopyt]');
    if (!formulare.length) return;
    const doc = root.ownerDocument || document;

    formulare.forEach((f) => {
      if (f.dataset.kReady === 'true') return;
      f.dataset.kReady = 'true';
      const dakujem = f.parentElement.querySelector('[data-k-dakujem]');
      if (!dakujem) return;

      const menoRamu = 'kv-odoslanie-' + Math.random().toString(36).slice(2, 8);
      const ram = doc.createElement('iframe');
      ram.name = menoRamu;
      ram.title = 'Odoslanie dopytu';
      ram.setAttribute('aria-hidden', 'true');
      ram.tabIndex = -1;
      ram.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px';
      f.parentElement.appendChild(ram);
      f.target = menoRamu;

      let odoslane = false;
      let cakac = 0;

      /* Nadpis sekcie („Napíšte nám…“) aj jeho výzva by nad poďakovaním
         pôsobili, akoby sa nič neodoslalo — na ten čas odchádzajú tiež. */
      const hlava = f.parentElement.querySelector('.kh-cta__head');

      const ukaz = () => {
        if (!odoslane) return;
        window.clearTimeout(cakac);
        f.hidden = true;
        if (hlava) hlava.hidden = true;
        dakujem.hidden = false;
        const nadpis = dakujem.querySelector('.kh-dakujem__nadpis');
        if (nadpis) {
          nadpis.setAttribute('tabindex', '-1');
          nadpis.focus({ preventScroll: true });
        }
        const r = dakujem.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          dakujem.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'center' });
        }
      };

      ram.addEventListener('load', () => { if (odoslane) ukaz(); });

      f.addEventListener('submit', () => {
        odoslane = true;
        const btn = f.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.classList.add('je-odosielane'); }
        /* Poistka: keby rám neohlásil načítanie (blokovaný tretí subjekt),
           poďakovanie sa ukáže aj tak — dopyt je odoslaný a zákazník nemá
           ostať pozerať na zamrznuté tlačidlo. */
        cakac = window.setTimeout(ukaz, 6000);
      });

      const znova = dakujem.querySelector('[data-k-znova]');
      if (znova) znova.addEventListener('click', () => {
        odoslane = false;
        dakujem.hidden = true;
        if (hlava) hlava.hidden = false;
        f.hidden = false;
        f.reset();
        const btn = f.querySelector('[type="submit"]');
        if (btn) { btn.disabled = false; btn.classList.remove('je-odosielane'); }
        f.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  /* --- Krátka slučka vnútri obsahu ---------------------------------------
     Pohyb lamiel sa fotografiou vysvetliť nedá — otočná strecha je pohyb.
     Klip je pôvodný, tri sekundy, bez zvuku a v slučke. Sťahuje sa až vtedy,
     keď sa karta priblíži k oknu, a zastaví sa, len čo z neho odíde; kým
     nebeží, drží miesto plagát, takže sa nič neposúva. Pri obmedzenom pohybe
     alebo pri šetrení dát ostáva plagát a video sa nesťahuje vôbec. */
  function initSlucka(root) {
    const klipy = root.querySelectorAll('[data-k-slucka]');
    if (!klipy.length) return;
    const setri = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spojenie = navigator.connection || null;
    const skromne = spojenie && (spojenie.saveData || /2g/.test(spojenie.effectiveType || ''));
    if (setri || skromne || !('IntersectionObserver' in window)) return;

    const pozor = new IntersectionObserver((zaznamy) => {
      zaznamy.forEach((z) => {
        const v = z.target;
        if (z.isIntersecting) {
          if (v.preload !== 'auto') { v.preload = 'auto'; v.load(); }
          const beh = v.play();
          if (beh && beh.catch) beh.catch(() => {});
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: '160px 0px', threshold: 0.2 });

    klipy.forEach((v) => { v.muted = true; pozor.observe(v); });
  }

  /* --- Skladba konštrukcie: rez a zoznam si rozumejú ----------------------
     Kresba má svoje vrstvy očíslované a zoznam vedľa nej ich vysvetľuje.
     Doteraz to boli dva samostatné objekty. Teraz prejdenie po riadku
     rozsvieti bod na kresbe a prejdenie po bode zvýrazní riadok — vzťah
     medzi číslom na reze a vetou v zozname netreba hľadať očami.
     Bez skriptu ostáva kresba kresbou a zoznam zoznamom. */
  function initVrstvy(root) {
    root.querySelectorAll('[data-k-vrstvy]').forEach((blok) => {
      if (blok.dataset.kReadyVrstvy === 'true') return;
      blok.dataset.kReadyVrstvy = 'true';
      const spinace = [].slice.call(blok.querySelectorAll('[data-k-vrstva]'));
      if (!spinace.length) return;

      const uprac = () => {
        spinace.forEach((s) => s.classList.remove('je-vybrany'));
        blok.removeAttribute('data-k-aktivna');
      };
      const vyber = (cislo) => {
        blok.setAttribute('data-k-aktivna', cislo);
        spinace.forEach((s) => s.classList.toggle('je-vybrany', s.dataset.kVrstva === cislo));
      };

      spinace.forEach((s) => {
        const cislo = s.dataset.kVrstva;
        s.addEventListener('mouseenter', () => vyber(cislo));
        s.addEventListener('focus', () => vyber(cislo));
        s.addEventListener('mouseleave', uprac);
        s.addEventListener('blur', uprac);
        s.addEventListener('click', (e) => {
          e.preventDefault();
          vyber(cislo);
          /* Klik na bod v kresbe odvedie pozornosť k riadku, ktorý ho
             vysvetľuje — na telefóne je to jediný spôsob, ako sa k nemu
             dostať, lebo prejdenie myšou tam neexistuje. */
          if (s.classList.contains('kh-vrstvy__bod')) {
            const riadok = blok.querySelector('.kh-vrstvy__riadok[data-k-vrstva="' + cislo + '"]');
            if (riadok) riadok.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        });
      });
    });
  }

  /* --- Zväčšenie fotografie -------------------------------------------------
     Náhľad v karte je malý zámerne — karta má ostať prehľadná. Kto si chce
     stavbu pozrieť poriadne, klikne a fotka sa otvorí cez celú obrazovku.
     Prekrytie sa stavia až pri prvom kliknutí a je v dokumente jediné, takže
     deväťdesiat kariet nenesie deväťdesiat skrytých vrstiev. Bez skriptu je
     náhľad obyčajné tlačidlo, ktoré nič nerozbije. */
  function initLupa(root) {
    const spinace = root.querySelectorAll('[data-k-lupa]');
    if (!spinace.length) return;

    let vrstva = null;
    let obrazok = null;
    let popis = null;
    let odkial = null;

    const zavri = () => {
      if (!vrstva || vrstva.hidden) return;
      vrstva.classList.remove('je-vidno');
      document.documentElement.style.overflow = '';
      const koniec = () => {
        vrstva.hidden = true;
        obrazok.removeAttribute('src');
      };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) koniec();
      else window.setTimeout(koniec, 210);
      if (odkial && document.contains(odkial)) odkial.focus();
      odkial = null;
    };

    const postav = () => {
      vrstva = document.createElement('div');
      vrstva.className = 'kv-lupa';
      vrstva.hidden = true;
      vrstva.setAttribute('role', 'dialog');
      vrstva.setAttribute('aria-modal', 'true');
      vrstva.setAttribute('aria-label', 'Fotografia realizácie');
      const ram = document.createElement('div');
      ram.className = 'kv-lupa__ram';
      obrazok = document.createElement('img');
      obrazok.alt = '';
      obrazok.decoding = 'async';
      popis = document.createElement('p');
      popis.className = 'kv-lupa__popis';
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'kv-lupa__zavri';
      x.setAttribute('aria-label', 'Zavrieť');
      x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>';
      x.addEventListener('click', zavri);
      ram.appendChild(obrazok);
      ram.appendChild(popis);
      ram.appendChild(x);
      vrstva.appendChild(ram);
      vrstva.addEventListener('click', (e) => { if (e.target === vrstva) zavri(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') zavri(); });
      document.body.appendChild(vrstva);
      return x;
    };

    spinace.forEach((tl) => {
      tl.addEventListener('click', () => {
        const zdroj = tl.getAttribute('data-k-lupa');
        if (!zdroj) return;
        const x = vrstva ? vrstva.querySelector('.kv-lupa__zavri') : postav();
        odkial = tl;
        const nahlad = tl.querySelector('img');
        obrazok.alt = nahlad ? nahlad.alt : '';
        obrazok.src = zdroj;
        popis.textContent = tl.getAttribute('data-k-lupa-popis') || '';
        vrstva.hidden = false;
        document.documentElement.style.overflow = 'hidden';
        window.requestAnimationFrame(() => {
          vrstva.classList.add('je-vidno');
          x.focus();
        });
      });
    });
  }

  /* --- Mapa realizácií ------------------------------------------------------
     Klik na značku prepne kartu s fotografiou. Bez skriptu ostane viditeľná
     prvá karta a značky sú obyčajné tlačidlá — mapa teda funguje ako obrázok
     so zoznamom obcí, nie ako prázdne miesto. */
  function initMapa(root) {
    const plochy = root.querySelectorAll('[data-k-mapa]');
    if (!plochy.length) return;

    plochy.forEach((plocha) => {
      if (plocha.dataset.kReady === 'true') return;
      plocha.dataset.kReady = 'true';
      const body = [].slice.call(plocha.querySelectorAll('[data-k-mapa-bod]'));
      const karty = [].slice.call(plocha.querySelectorAll('[data-k-mapa-karta]'));
      if (!body.length || !karty.length) return;

      /* Značka na mape a položka v zozname sú dve tlačidlá k tomu istému
         miestu — obe nesú rovnaké `data-k-mapa-bod`, takže stačí jedno
         prepnutie pre všetky. */
      const spinace = [].slice.call(plocha.querySelectorAll('[data-k-mapa-bod]'));

      const ukaz = (id) => {
        spinace.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kMapaBod === id)));
        karty.forEach((k) => { k.hidden = k.dataset.kMapaKarta !== id; });
      };

      spinace.forEach((b) => {
        b.addEventListener('click', () => ukaz(b.dataset.kMapaBod));
        b.addEventListener('focus', () => ukaz(b.dataset.kMapaBod));
        if (b.classList.contains('kh-mapa__bod')) {
          b.addEventListener('mouseenter', () => ukaz(b.dataset.kMapaBod));
        }
      });
    });
  }

  function initVideo(root) {
    const vsetky = root.querySelectorAll('video[data-k-video]');
    if (!vsetky.length) return;
    if (REDUCED.matches) return;
    const siet = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (siet && (siet.saveData === true || /(^|-)2g$/.test(siet.effectiveType || ''))) return;

    vsetky.forEach((v) => {
      if (v.dataset.kReady === 'true') return;
      v.dataset.kReady = 'true';

      let pustene = false;
      const pusti = () => {
        if (!pustene) {
          pustene = true;
          /* MP4 stojí prvé — je menšie a vie ho každý bežný prehliadač.
             WebM je poistka pre zostavenia bez H.264 (napríklad Chromium
             na Linuxe), kde by inak úvod ostal na fotografii. */
          [['data-k-video', 'video/mp4'], ['data-k-video-webm', 'video/webm']].forEach((par) => {
            const url = v.getAttribute(par[0]);
            if (!url) return;
            const z = document.createElement('source');
            z.src = url;
            z.type = par[1];
            v.appendChild(z);
          });
          v.load();
        }
        /* Safari na iPhone spustí video len vtedy, keď je stíšené a značka
           to hovorí ešte pred prvým prehraním. V úspornom režime batérie
           prehrávanie odmietne úplne — vtedy ostáva úvodná fotografia, ktorá
           je pod videom, a video sa už nepokúša presadiť. */
        v.muted = true;
        v.defaultMuted = true;
        const p = v.play();
        if (p && p.catch) p.catch(vzdaj);
        /* Úsporný režim vie sľub prehrávania aj potvrdiť a video potom ostane
           stáť na nule. Po dvoch a pol sekundách sa preto pozrieme, či sa
           naozaj pohlo; ak nie, úvod ostáva na fotografii. */
        window.setTimeout(() => { if (v.currentTime === 0) vzdaj(); }, 2500);
      };
      /* Vzdať sa videa znamená vrátiť úvod fotografii, ktorá je pod ním —
         nikdy nenechať prázdne miesto. */
      const vzdaj = () => {
        if (v.hidden) return;
        v.classList.remove('je-vidno');
        v.hidden = true;
        try { v.pause(); } catch (e) {}
      };
      v.addEventListener('playing', () => v.classList.add('je-vidno'), { once: true });
      v.addEventListener('error', vzdaj);

      if (!('IntersectionObserver' in window)) { pusti(); return; }
      const sled = new IntersectionObserver((zaznamy) => {
        zaznamy.forEach((z) => {
          if (z.isIntersecting) pusti();
          else if (pustene) v.pause();
        });
      }, { rootMargin: '120px' });
      sled.observe(v);
    });
  }

  /* --- Výška lepivého pásu s ponukou ---------------------------------------
     Pás je pripnutý na spodok okna a prekrýval spodok úvodnej obrazovky —
     hodnotenie z Google aj riadok s údajmi končili pod ním. Jeho výška ide
     do premennej, aby si úvod vedel odrátať presne toľko, koľko pás zaberá. */
  function initDok(scope) {
    const doc = scope.ownerDocument || scope;
    const dok = doc.querySelector('.kh-dock');
    if (!dok || dok.dataset.kReady === 'true') return;
    dok.dataset.kReady = 'true';
    /* Zápis premennej na koreň dokumentu prepočíta štýl celej stránky. Robí
       sa preto len vtedy, keď sa hodnota naozaj zmenila, a najviac raz za
       snímok — inak si pozorovateľ rozmeru vypýtal prepočet aj vtedy, keď
       sa nezmenilo nič. */
    let posledna = null;
    let caka = false;
    const mer = () => {
      caka = false;
      const v = Math.round(dok.getBoundingClientRect().height);
      if (v === posledna) return;
      posledna = v;
      if (v > 0) doc.documentElement.style.setProperty('--kv-dok', v + 'px');
      else doc.documentElement.style.removeProperty('--kv-dok');
    };
    const naplan = () => { if (!caka) { caka = true; requestAnimationFrame(mer); } };
    mer();
    window.addEventListener('resize', naplan, { passive: true });
    window.addEventListener('load', naplan, { once: true });
    if (window.ResizeObserver) new ResizeObserver(naplan).observe(dok);

    /* Pás je `position: fixed` k spodku okna. Klávesnica na telefóne okno
       nezmenší — zmenší len viditeľnú časť, takže pás ostal sedieť pod ňou
       a pri vypĺňaní dopytu prekrýval práve to políčko, do ktorého sa písalo.
       Kým je klávesnica hore, pás odchádza; keď sa zavrie, vráti sa.

       Rozdiel merajú dve výšky: `visualViewport` je to, čo je vidieť,
       `innerHeight` celé okno. Sto pixelov je viac než adresný riadok
       prehliadača a menej než ktorákoľvek klávesnica. */
    const vv = window.visualViewport;
    if (vv) {
      let malo = null;
      const klavesnica = () => {
        const je = (window.innerHeight - vv.height) > 100;
        if (je === malo) return;
        malo = je;
        doc.documentElement.classList.toggle('ma-klavesnicu', je);
      };
      vv.addEventListener('resize', klavesnica, { passive: true });
      klavesnica();
    }
  }

  function initSuhlas(scope) {
    const doc = scope.ownerDocument || scope;
    if (doc.body.dataset.kSuhlasReady === 'true') return;
    doc.body.dataset.kSuhlasReady = 'true';

    const KLUC = window.KV_SUHLAS_KLUC || 'koverta-suhlas';
    const gtag = window.kvGtag || function () {};
    const KAT = [
      ['analytika', 'Analytika', 'Koľko ľudí stránku navštívi a ktoré riešenia si pozerajú. Bez toho netušíme, čo tu chýba.'],
      ['marketing', 'Marketing', 'Aby sa naša ponuka ukázala tam, kde zastrešenie naozaj hľadáte, a aby sme vedeli, či to má zmysel.'],
      ['preferencie', 'Preferencie', 'Zapamätá si drobnosti, napríklad túto voľbu alebo rozpracovanú zostavu v konfigurátore.']
    ];

    const nacitaj = () => {
      try {
        const v = JSON.parse(window.localStorage.getItem(KLUC) || 'null');
        return v && v.verzia === 1 ? v : null;
      } catch (e) { return null; }
    };

    const uloz = (v) => {
      v.verzia = 1;
      v.kedy = new Date().toISOString();
      try { window.localStorage.setItem(KLUC, JSON.stringify(v)); } catch (e) {}
      window.kvSuhlas = v;
      gtag('consent', 'update', {
        ad_storage: v.marketing ? 'granted' : 'denied',
        ad_user_data: v.marketing ? 'granted' : 'denied',
        ad_personalization: v.marketing ? 'granted' : 'denied',
        analytics_storage: v.analytika ? 'granted' : 'denied',
        functionality_storage: v.preferencie ? 'granted' : 'denied',
        personalization_storage: v.preferencie ? 'granted' : 'denied',
        security_storage: 'granted'
      });
      gtag('set', 'ads_data_redaction', !v.marketing);
      (window.dataLayer = window.dataLayer || []).push({
        event: 'koverta_suhlas',
        suhlas_analytika: !!v.analytika,
        suhlas_marketing: !!v.marketing,
        suhlas_preferencie: !!v.preferencie
      });
    };

    /* Stránky sedia v rôznej hĺbke, takže cestu k ochrane súkromia si lišta
       požičia z odkazu, ktorý už v pätke je. */
    const kamSukromie = () => {
      const a = doc.querySelector('a[href*="ochrana-sukromia"]');
      return a ? a.getAttribute('href') : 'ochrana-sukromia/';
    };

    let lista = null;

    const zavri = () => {
      if (!lista) return;
      lista.classList.remove('je-vidno');
      const von = lista;
      window.setTimeout(() => { if (von.parentNode) von.parentNode.removeChild(von); }, 320);
      lista = null;
      doc.documentElement.style.removeProperty('--kv-lista');
    };

    const otvor = (predvolba) => {
      if (lista) return;
      const v = predvolba || nacitaj() || { analytika: false, marketing: false, preferencie: false };

      lista = doc.createElement('section');
      lista.className = 'kv-suhlas';
      lista.setAttribute('data-k-suhlas', '');
      lista.setAttribute('role', 'region');
      lista.setAttribute('aria-label', 'Nastavenie súkromia');

      const vnutro = doc.createElement('div');
      vnutro.className = 'kv-suhlas__in';

      const text = doc.createElement('div');
      text.className = 'kv-suhlas__text';
      text.innerHTML = '<strong>Súkromie a meranie</strong>'
        + '<p>Nevyhnutné súbory potrebuje stránka na svoj chod. Ostatné nám ukazujú, čo tu ľudí zaujíma, '
        + 'a pomáhajú dostať našu ponuku k tým, čo zastrešenie hľadajú. Bez vášho súhlasu nebeží ani jedno. '
        + 'Podrobnosti sú v <a href="' + kamSukromie() + '">ochrane súkromia</a>.</p>';
      vnutro.appendChild(text);

      const volby = doc.createElement('div');
      volby.className = 'kv-suhlas__volby';
      volby.hidden = true;
      volby.innerHTML = '<label class="kv-suhlas__volba je-pevna">'
        + '<input type="checkbox" checked disabled><span><strong>Nevyhnutné</strong>'
        + 'Bez nich stránka nefunguje — formulár, konfigurátor a táto voľba. Vypnúť sa nedajú.</span></label>';
      KAT.forEach((k) => {
        const l = doc.createElement('label');
        l.className = 'kv-suhlas__volba';
        const i = doc.createElement('input');
        i.type = 'checkbox';
        i.checked = !!v[k[0]];
        i.setAttribute('data-kat', k[0]);
        const sp = doc.createElement('span');
        sp.innerHTML = '<strong>' + k[1] + '</strong>' + k[2];
        l.appendChild(i);
        l.appendChild(sp);
        volby.appendChild(l);
      });
      vnutro.appendChild(volby);

      const akcie = doc.createElement('div');
      akcie.className = 'kv-suhlas__akcie';
      const tl = (trieda, popis) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = trieda;
        b.textContent = popis;
        return b;
      };
      const vsetko = tl('kv-suhlas__btn kv-suhlas__btn--ano', 'Prijať všetko');
      const nic = tl('kv-suhlas__btn kv-suhlas__btn--nie', 'Iba nevyhnutné');
      const nastav = tl('kv-suhlas__viac', 'Nastaviť');
      const ulozit = tl('kv-suhlas__btn kv-suhlas__btn--ano', 'Uložiť voľbu');
      ulozit.hidden = true;
      akcie.appendChild(vsetko);
      akcie.appendChild(ulozit);
      akcie.appendChild(nic);
      akcie.appendChild(nastav);
      vnutro.appendChild(akcie);

      lista.appendChild(vnutro);
      doc.body.appendChild(lista);

      /* Lišta nesmie prekryť lepivé tlačidlo ponuky na telefóne — to sedí
         nad ňou a jeho výška ide do premennej. */
      const dok = doc.querySelector('.kh-dock');
      const vyska = dok ? Math.round(dok.getBoundingClientRect().height) : 0;
      if (vyska > 0) doc.documentElement.style.setProperty('--kv-dok', vyska + 'px');

      requestAnimationFrame(() => lista.classList.add('je-vidno'));

      vsetko.addEventListener('click', () => {
        uloz({ analytika: true, marketing: true, preferencie: true });
        zavri();
      });
      nic.addEventListener('click', () => {
        uloz({ analytika: false, marketing: false, preferencie: false });
        zavri();
      });
      nastav.addEventListener('click', () => {
        volby.hidden = false;
        nastav.hidden = true;
        vsetko.hidden = true;
        ulozit.hidden = false;
        lista.classList.add('je-siroka');
      });
      ulozit.addEventListener('click', () => {
        const vysledok = { analytika: false, marketing: false, preferencie: false };
        volby.querySelectorAll('input[data-kat]').forEach((i) => { vysledok[i.getAttribute('data-kat')] = i.checked; });
        uloz(vysledok);
        zavri();
      });
    };

    /* Odkaz v pätke, aby sa voľba dala zmeniť aj potom, čo lišta zmizne. */
    doc.querySelectorAll('.kf__bottom nav').forEach((nav) => {
      if (nav.querySelector('[data-k-suhlas-odkaz]')) return;
      const a = doc.createElement('button');
      a.type = 'button';
      a.className = 'kf__suhlas';
      a.setAttribute('data-k-suhlas-odkaz', '');
      a.textContent = 'Nastavenia súkromia';
      a.addEventListener('click', () => { zavri(); otvor(nacitaj()); });
      nav.appendChild(a);
    });

    if (!nacitaj()) otvor(null);
  }

  function initHeader(header) {
    if (header.dataset.kReady === 'true') return;
    header.dataset.kReady = 'true';

    /* Výška hlavičky ide do premennej, aby si prvá obrazovka vedela odrátať
       presne toľko, koľko hlavička zaberá. Bez toho fotografia v úvode
       nedosiahla na spodný okraj okna a pod ňou ostával svetlý pruh. */
    /* Lišta sa po odscrollovaní zmenší o dvanásť pixelov. Kým sa tá zmenšená
       výška dostávala do premennej, úvodná fotografia pri prvom posunutí
       o toľko povyrástla a viditeľne poskočila — a s ňou aj údaje pod ňou.
       Meriame preto len vtedy, keď je stránka na vrchu a lišta je vo svojom
       pokojnom rozmere; inak si necháme poslednú platnú hodnotu. */
    let poslednaV = null;
    let cakaV = false;
    const mer = () => {
      cakaV = false;
      if (window.scrollY > 8) return;
      const v = Math.round(header.getBoundingClientRect().height);
      /* Zápis na koreň dokumentu prepočíta štýl celej stránky, preto sa robí
         len pri skutočnej zmene a najviac raz za snímok. */
      if (v <= 0 || v === poslednaV) return;
      poslednaV = v;
      document.documentElement.style.setProperty('--kv-hlava', v + 'px');
    };
    const naplanV = () => { if (!cakaV) { cakaV = true; requestAnimationFrame(mer); } };
    mer();
    window.addEventListener('resize', naplanV, { passive: true });
    window.addEventListener('load', naplanV, { once: true });
    window.addEventListener('scroll', () => { if (window.scrollY <= 8) naplanV(); }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(naplanV).observe(header);

    /* --- Menu je pri ceste nahor vždy po ruke ----------------------------
       Hlavička doteraz odscrollovala preč a späť sa dala dostať len návratom
       na úplný vrch stránky — na dlhej podstránke to znamená pol minúty
       scrollovania. Teraz platí jednoduché pravidlo: idete dole, lišta ide
       preč a nezavadzia; otočíte sa nahor, lišta je okamžite späť.

       Prilepí sa až potom, čo úplne odscrollovala, takže obsah nikam
       neposkočí a nič sa nemusí dopĺňať rozperou. */
    const bar = header.querySelector('[data-k-bar]');
    if (bar) {
      let posledneY = window.scrollY;
      let ceka = false;
      const prah = 8;

      /* Výšky sa merajú pri štarte a pri zmene veľkosti okna, nie v každom
         snímku scrollu. Meranie prvku núti prehliadač dokončiť rozloženie —
         dve také merania na snímok boli pri scrollovaní zbytočná práca
         a bolo to cítiť. */
      let vyskaListy = 76;
      let vyskaHlavicky = 117;
      const premeraj = () => {
        const v = bar.getBoundingClientRect().height;
        if (v > 0) vyskaListy = v;
        const h = header.offsetHeight;
        if (h > 0) vyskaHlavicky = h;
      };
      premeraj();
      window.addEventListener('resize', premeraj, { passive: true });
      window.addEventListener('load', premeraj, { once: true });

      const prekresli = () => {
        ceka = false;
        const y = window.scrollY;
        const vyska = vyskaListy;
        const hranica = vyskaHlavicky + 40;
        bar.classList.toggle('is-stuck', y > 12);

        if (y <= hranica) {
          /* pri vrchu stránky je lišta na svojom mieste v toku */
          bar.classList.remove('je-plava', 'je-schovana');
          header.classList.remove('ma-rozperu');
          posledneY = y;
          return;
        }
        /* Keď lišta vypadne z toku, obsah pod hlavičkou by sa posunul nahor
           o jej výšku — a to je posun rozloženia, ktorý sa počíta do CLS aj
           keď sa deje mimo obrazovky. Hlavička si preto na jej mieste drží
           rozperu presne takej výšky, akú lišta mala. */
        header.style.setProperty('--kv-lista', Math.round(vyska) + 'px');
        header.classList.add('ma-rozperu');
        bar.classList.add('je-plava');
        const rozdiel = y - posledneY;
        if (rozdiel > prah) bar.classList.add('je-schovana');
        else if (rozdiel < -prah) bar.classList.remove('je-schovana');
        if (Math.abs(rozdiel) > prah) posledneY = y;
        void vyska;
      };

      const naplan = () => { if (!ceka) { ceka = true; requestAnimationFrame(prekresli); } };
      window.addEventListener('scroll', naplan, { passive: true });
      window.addEventListener('resize', naplan, { passive: true });
      prekresli();
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
      /* Zásuvka je zavretá posunutím mimo obrazovku, nie skrytím. Odkazy v nej
         teda ostávali na tabulátore: po hlavičke skočil kurzor do zavretého
         menu a človek písal do niečoho, čo nevidel. `inert` ju vyradí celú —
         z tabulátora, z myši aj z odčítača obrazovky. */
      const uspi = (spi) => {
        if ('inert' in HTMLElement.prototype) drawer.inert = spi;
        drawer.setAttribute('aria-hidden', String(spi));
      };

      /* Kým je zásuvka otvorená, tabulátor sa v nej točí dokola. Bez toho
         prešiel za posledný odkaz do stránky pod prekrytím — kurzor zmizol
         za tmavým sklom a Escape už nemal čo zavrieť. */
      const OSTRE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const drz = (e) => {
        if (e.key !== 'Tab' || !drawer.classList.contains('is-open')) return;
        const body = [].slice.call(drawer.querySelectorAll(OSTRE))
          .filter((el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        if (!body.length) return;
        const prvy = body[0];
        const posledny = body[body.length - 1];
        if (e.shiftKey && document.activeElement === prvy) { e.preventDefault(); posledny.focus(); }
        else if (!e.shiftKey && document.activeElement === posledny) { e.preventDefault(); prvy.focus(); }
      };

      const setDrawer = (open) => {
        drawer.classList.toggle('is-open', open);
        scrim.classList.toggle('is-open', open);
        openBtn.setAttribute('aria-expanded', String(open));
        uspi(!open);
        document.documentElement.style.overflow = open ? 'hidden' : '';
        /* Lepivý pás s ponukou prekrýval spodok otvoreného menu — tlačidlo
           v menu bolo spolovice pod ním a dve rovnaké výzvy pod sebou pôsobili
           ako chyba. Kým je menu otvorené, pás odchádza; menu má vlastnú. */
        document.documentElement.classList.toggle('ma-otvorene-menu', open);
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
      drawer.addEventListener('keydown', drz);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('is-open')) setDrawer(false);
      });
      /* Odkaz v menu vedie na kotvu na tej istej stránke — menu sa má zavrieť,
         inak ostane prekrytie nad cieľom, na ktorý človek práve klikol. */
      drawer.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (a && drawer.classList.contains('is-open')) setDrawer(false);
      });
      uspi(true);
    }
  }

  /* --- štart -------------------------------------------------------------- */

  /* Každá sekcia sa spúšťa samostatne. Keď na stránke nejaká chýba — a na
     podstránkach chýba väčšina — nesmie jej chyba zhodiť zvyšok: predtým
     padlo odkrývanie obsahu a stránka ostala prázdna biela. */
  const spusti = (fn, ciel) => {
    try { fn(ciel); }
    catch (e) { if (window.console) console.warn('koverta: ' + fn.name + ' — ' + e.message); }
  };

  /* Naštartovanie stránky trvalo šesťdesiat milisekúnd v jedinom snímku —
     to je štyri snímky, počas ktorých prehliadač nestihol nič vykresliť a
     stránka na začiatku sekla. Hneď preto beží len to, čo je vidieť alebo
     čo musí odpovedať na prvý dotyk: odkrytie obsahu, nadpis, hlavička,
     video v úvode a lišta súhlasu. Zvyšok sa rozdelí do snímkov po ôsmich
     milisekundách, takže žiadny z nich nezmešká svoj termín. */
  const HNED = [initReveal, initHeadline, initAnchors, initVideo];
  const POTOM = [initRail, initFilters, initFaq, initProcess, initShots,
                 initMatTabs, initSelect, initSubory, initScrub, initPrelet,
                 initDopyt, initMapa, initLupa, initVrstvy, initSlucka];

  const davkuj = (ulohy) => {
    let i = 0;
    const krok = () => {
      const zaciatok = performance.now();
      while (i < ulohy.length && performance.now() - zaciatok < 8) ulohy[i++]();
      if (i < ulohy.length) requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  };

  function init(scope) {
    const ulohy = [];
    scope.querySelectorAll('[data-k-root]').forEach((root) => {
      if (root.dataset.kReady === 'true') return;
      root.dataset.kReady = 'true';
      HNED.forEach((fn) => spusti(fn, root));
      POTOM.forEach((fn) => ulohy.push(() => spusti(fn, root)));
    });
    scope.querySelectorAll('[data-k-header]').forEach((h) => spusti(initHeader, h));
    const dok = scope === document ? document : scope;
    spusti(initSuhlas, dok);
    // Vyhľadávanie je v hlavičke, teda mimo [data-k-root] — inicializuje sa
    // na úrovni dokumentu, aby videlo aj obsah stránky, v ktorom hľadá.
    ulohy.push(() => spusti(initSearch, dok));
    ulohy.push(() => spusti(initDok, dok));
    if (ulohy.length) davkuj(ulohy);
  }

  const boot = () => init(document);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(boot), { once: true });
  } else {
    /* Skript beží na konci tela, takže dokument je už rozobraný. Keby sa
       štart spustil rovno tu, pripočítal by sa k snímku, v ktorom sa skript
       vyhodnocuje — a to je práve ten dlhý snímok. */
    requestAnimationFrame(boot);
  }

  document.addEventListener('shopify:section:load', (e) => init(e.target));
})();
