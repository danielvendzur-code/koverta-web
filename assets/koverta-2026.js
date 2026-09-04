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
      input.addEventListener('change', () => {
        const n = input.files ? input.files.length : 0;
        if (!n) {
          hint.textContent = povodny;
          pole.classList.remove('je-vybrate');
          return;
        }
        const mena = [].slice.call(input.files).map((f) => f.name);
        hint.textContent = n === 1
          ? 'Pripojené: ' + mena[0]
          : 'Pripojené ' + n + ' súbory: ' + mena.join(', ');
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
        shopLink.href = 'https://koverta.sk/search?q=' + encodeURIComponent(q);
        const label = shopLink.querySelector('span');
        if (label) label.textContent = 'Hľadať „' + q + '" v celom e-shope';
      }

      if (!nq) {
        empty.hidden = false;
        empty.textContent = 'Napíšte, čo hľadáte — napríklad „pergola", „tienenie" alebo „prístrešok pre dve autá".';
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

    const open = (predvolba) => {
      if (!index) index = buildIndex(document);
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      input.value = predvolba || '';
      render(input.value);
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

    const naplan = () => { if (!ceka) { ceka = true; requestAnimationFrame(zmer); } };
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
    const mer = () => {
      const v = Math.round(dok.getBoundingClientRect().height);
      if (v > 0) doc.documentElement.style.setProperty('--kv-dok', v + 'px');
      else doc.documentElement.style.removeProperty('--kv-dok');
    };
    mer();
    window.addEventListener('resize', mer, { passive: true });
    window.addEventListener('load', mer, { once: true });
    if (window.ResizeObserver) new ResizeObserver(mer).observe(dok);
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
    const mer = () => {
      const v = Math.round(header.getBoundingClientRect().height);
      if (v > 0) document.documentElement.style.setProperty('--kv-hlava', v + 'px');
    };
    mer();
    window.addEventListener('resize', mer, { passive: true });
    window.addEventListener('load', mer, { once: true });
    if (window.ResizeObserver) new ResizeObserver(mer).observe(header);

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
       initSubory, initScrub, initPrelet, initVideo]
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
    try { initDok(scope === document ? document : scope); }
    catch (e) { if (window.console) console.warn("koverta: initDok — " + e.message); }
    try { initSuhlas(scope === document ? document : scope); }
    catch (e) { if (window.console) console.warn("koverta: initSuhlas — " + e.message); }
  }

  const boot = () => init(document);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', (e) => init(e.target));
})();
