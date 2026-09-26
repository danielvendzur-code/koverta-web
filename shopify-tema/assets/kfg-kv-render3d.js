/* ============================================================================
   KOVERTA · 3D VYKRESĽOVAČ SCÉNY (WebGL2)
   ============================================================================

   Prečo vznikol
   -------------
   Doterajší vykresľovač premietal model do 2D na procesore: každá plocha sa
   prepočítala na obrazovkové súradnice, farba sa jej vypočítala v JavaScripte
   a na grafickú kartu už išli len ploché trojuholníky s hotovou farbou.
   Z toho plynuli obe veci, ktoré na scéne vadili:

     · vyzerala ako kartón — jedna farba na plochu, žiadne odrazy, žiadny
       tvar na kove, tieň iba ako rozmazaná škvrna pod konštrukciou;
     · sekala — pri každom pootočení sa musela celá geometria premietnuť
       a pretriediť odznova, čo je pri tejto scéne takmer dvestotisíc čísel
       na snímok.

   Čo robí tento súbor
   -------------------
   Berie tie isté plochy, ale v svetových súradniciach (`face.w`), a postaví
   z nich skutočnú sieť na grafickej karte. Otočenie modelu je potom zmena
   jednej matice — geometria sa nedotkne. Tieňovanie beží vo fragmentovom
   shaderi podľa fyzikálneho modelu (GGX, kov/drsnosť), svetlo dodáva
   analytická obloha so slnkom, tiene kreslí tieňová mapa a priliehavé
   zatienenie v kútoch dopočíta SSAO.

   Poradie priechodov
   ------------------
     1. tieňová mapa      hĺbka scény z pohľadu slnka
     2. hlavný priechod   PBR do plávajúcej vyrovnávacej pamäte s MSAA
     3. rozlíšenie MSAA   viacvzorkový buffer → textúra
     4. SSAO              z hĺbky a normál, polovičné rozlíšenie
     5. rozostrenie AO    dvojpriechodové, hranovo citlivé
     6. tónovanie         ACES, jemný bloom, vinetácia → na plátno

   Súradnice
   ---------
   Scéna používa x = dĺžka, y = šírka, z = výška. Hore je +Z. Rovnaké ako
   v `soltec-premium.js`, aby sa dali plochy prevziať bez prepočtu.
   ============================================================================ */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ MATEMATIKA */

  const mat4 = {
    identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },

    /* Všeobecný zrezaný ihlan. Nie symetrický `perspective`, lebo doterajšia
       kamera vie posunúť stred obrazu (`ox`, `oy`) — model sa tým usádza do
       záberu vedľa panelu s voľbami. Symetrická matica by ten posun zahodila
       a model by pri otváraní panelu skákal. */
    frustum(l, r, b, t, n, f) {
      const m = new Float32Array(16);
      m[0] = 2 * n / (r - l);
      m[5] = 2 * n / (t - b);
      m[8] = (r + l) / (r - l);
      m[9] = (t + b) / (t - b);
      m[10] = -(f + n) / (f - n);
      m[11] = -1;
      m[14] = -2 * f * n / (f - n);
      return m;
    },

    ortho(l, r, b, t, n, f) {
      const m = mat4.identity();
      m[0] = 2 / (r - l);
      m[5] = 2 / (t - b);
      m[10] = -2 / (f - n);
      m[12] = -(r + l) / (r - l);
      m[13] = -(t + b) / (t - b);
      m[14] = -(f + n) / (f - n);
      return m;
    },

    lookAt(eye, at, up) {
      const z = vec3.norm(vec3.sub(eye, at));
      let x = vec3.cross(up, z);
      /* Keď kamera stúpne priamo nad model, `up` a pohľad splynú a vektorový
         súčin je nulový. Bez tejto poistky sa matica rozsype na NaN a scéna
         zmizne — stačí kolmý pohľad zhora, ktorý si používateľ vyrolovaním
         ľahko nastaví. */
      if (vec3.len(x) < 1e-6) x = vec3.cross([0, 1, 0], z);
      x = vec3.norm(x);
      const y = vec3.cross(z, x);
      return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -vec3.dot(x, eye), -vec3.dot(y, eye), -vec3.dot(z, eye), 1
      ]);
    },

    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    }
  };

  const vec3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm(a) { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; }
  };

  /* --------------------------------------------------------------- MATERIÁLY */

  /* Kov a drsnosť pre každý druh povrchu v scéne. Čísla nie sú odhad: sú to
     bežné hodnoty pre tieto materiály vo fyzikálnom modeli a overili sa na
     zábere proti fotografii hotovej montáže.

       kov      0 = náter a plast, 1 = holý kov
       drsnosť  0 = zrkadlo, 1 = úplne matný povrch

     Prášková farba nie je holý kov: pod lakom je hliník, ale vidno lak.
     Preto nízky kov a stredná drsnosť — má sheen, nie zrkadlo. */
  /* `odraz` je oprava, bez ktorej by scéna vybledla. Farby v geometrii
     pochádzajú z doterajšieho vykresľovača, ktorý svetlo nepočítal — sú to
     teda farby už nasvietené, nie odrazivosť materiálu. Keby sa vo
     fyzikálnom modeli použili tak, ako sú, svetlo by sa započítalo druhý
     raz. Najviac to bolo vidieť na dlažbe: zadaná ako 0,72, hoci betón
     odráža okolo 0,35, a scéna z nej mala bielu podlahu bez tieňov.
     Čísla nižšie sú skutočné odrazivosti tých materiálov. */
  const MATERIALY = {
    /* Prášková farba je dielektrikum s jemne zrnitým povrchom, nie lesklý
       lak. Pri drsnosti 0,33 pribral tmavý antracit toľko odrazu oblohy, že
       z neho bola stredná sivá — výrobok pritom predáva práve tá tmavá.
       0,50 je hodnota, pri ktorej má profil stále lesklú hranu, ale plocha
       ostane taká tmavá, ako je v skutočnosti. */
    /* 0,42 nie je odhad. Doterajší vykresľovač násobil zadanú farbu
       súčiniteľom okolo 0,4 a až to bol vzhľad, ktorý si dizajnér schválil —
       zadaná farba teda nie je odrazivosť, ale hotový obraz. Keby sa použila
       tak, ako je, antracit na stĺpe vyjde o dve tretiny svetlejší. Odmerané
       na tom istom zábere oboma vykresľovačmi. */
    lak:      { kov: 0.02, drsnost: 0.58, odraz: 0.80 },
    /* Pozinkovaný plech podhľadu je zdola jediné, čo z konštrukcie vidno,
       a je celý v tieni. Odrazivosť je vyššia než u hliníka zámerne: zinok
       je svetlý a matný, hliník tmavší a zrkadlivý — kým mali obe rovnakú,
       vyšiel podhľad Koverty tmavý a hliníkový rám Soltecu zdola prepálený
       do biela. */
    zinok:    { kov: 0.72, drsnost: 0.40, odraz: 1.35 },  /* žiarový zinok */
    hlinik:   { kov: 0.88, drsnost: 0.28, odraz: 0.44 },  /* holý hliník, lemovanie */
    /* Sklo sa nesvieti ako plocha. Nemá takmer žiadne rozptýlené svetlo:
       čo naň dopadne, buď sa odrazí, alebo prejde. Kým sa počítalo ako
       biely plech s priehľadnosťou, vyzerala zasklená strecha ako doska
       z bieleho plastu. */
    sklo:     { kov: 0.00, drsnost: 0.04, odraz: 1.00, sklo: 1 },
    panel:    { kov: 0.04, drsnost: 0.55, odraz: 0.68 },
    drevo:    { kov: 0.00, drsnost: 0.72, odraz: 0.62 },
    /* Tkanina ZIP rolety: matná, bez lesku, nepriehľadná. */
    latka:    { kov: 0.00, drsnost: 0.92, odraz: 0.58 },
    polykarb: { kov: 0.00, drsnost: 0.18, odraz: 1.00 },
    /* Odmerané: pri 0,66 mala podlaha jas 208 a pozadie 213 — na obraze
       splynuli a model vyzeral, akoby stál v prázdne. Podlaha musí byť
       zreteľne tmavšia než stena za ňou, inak nie je vidieť, na čom stavba
       stojí. To isté robí fotograf v štúdiu: podlahu dá tmavšiu než
       horizont. */
    dlazba:   { kov: 0.00, drsnost: 0.84, odraz: 0.62 },  /* betón na slnku */
    trava:    { kov: 0.00, drsnost: 0.95, odraz: 0.55 },
    auto:     { kov: 0.35, drsnost: 0.25, odraz: 0.95 },
    guma:     { kov: 0.00, drsnost: 0.88, odraz: 0.70 },
    zakladny: { kov: 0.04, drsnost: 0.50, odraz: 0.50 }
  };

  /* --------------------------------------------------------------- SHADERY */

  const HLAVICKA = `#version 300 es
precision highp float;
precision highp int;
`;

  /* Analytická obloha. Namiesto načítanej HDR mapy sa farba oblohy počíta
     priamo zo smeru — je to jedna funkcia, nepotrebuje ani bajt navyše a pre
     vonkajšiu scénu s jednou oblohou dá presne to, čo treba: jasný pás pri
     horizonte, tmavší zenit, slnko a odraz zeme zdola. */
  /* Tie isté čísla potrebuje shader aj procesor: shader na pozadie, procesor
     na rozptýlené svetlo, ktoré doň ide ako uniforma. Preto sú na jednom
     mieste a do shadera sa dosadia. */
  const NEBO = {
    zenitJasno:  [0.640, 0.668, 0.706],
    horizJasno:  [0.925, 0.938, 0.952],
    zenitZamrac: [0.700, 0.722, 0.752],
    horizZamrac: [0.900, 0.912, 0.926]
  };

  const OBLOHA = `
uniform vec3 uOdrazZeme;
uniform float uPozadie;

vec3 farbaOblohy(vec3 dir, vec3 slnko, float zamracene) {
  float h = clamp(dir.z * 0.5 + 0.5, 0.0, 1.0);

  /* Zenit, horizont a zem. Pri zamračení sa obloha zbaví modrej a celá
     sa vyrovná do svietivej bielej — to je to, čo robí mäkké svetlo. */
  /* Toto nie je obloha z pohľadnice. Konfigurátor nepredáva počasie, ale
     výrobok: sýto modré pozadie mu ukradne pozornosť a tieň naň hodí modrú,
     ktorú zákazník na svojom dvore neuvidí. Je to štúdiové prostredie —
     chladnejšie hore, svetlejšie pri horizonte, takmer bez sýtosti. Hliník
     z neho dostane presne ten prechod, po ktorom vyzerá ako kov. */
  /* Pozadie je stena štúdia, nie obloha. Fotograf ju svieti tak, aby bola
     takmer biela s jemným prechodom — výrobok potom na nej stojí a nič
     mu neuberá pozornosť. Kým mal zenit hodnotu skutočnej oblohy, vyšla
     stena o tridsať jasových stupňov tmavšia než na doterajšom zábere a
     celý obraz pôsobil zašedene. */
  vec3 zenitJasno   = vec3(${NEBO.zenitJasno});
  vec3 horizJasno   = vec3(${NEBO.horizJasno});
  vec3 zenitZamrac  = vec3(${NEBO.zenitZamrac});
  vec3 horizZamrac  = vec3(${NEBO.horizZamrac});

  vec3 zenit  = mix(zenitJasno,  zenitZamrac,  zamracene);
  vec3 horiz  = mix(horizJasno,  horizZamrac,  zamracene);

  /* Prechod nie je lineárny: pás pri horizonte je úzky a rýchlo prejde do
     zenitu, presne ako na fotografii. */
  float t = pow(clamp(dir.z, 0.0, 1.0), 0.42);
  vec3 c = mix(horiz, zenit, t);

  /* Pod horizontom je zem. Jej odrazené svetlo je to, čo zospodu zosvetlí
     podhľad strechy — a nie je to konštanta: dlažba na poludňajšom slnku
     odrazí niekoľkonásobne viac než tá istá dlažba pod mrakmi. Hodnota sa
     preto počíta z odrazivosti podkladu a zo sily slnka a prichádza sem
     hotová. Bez nej ostal celý spodok konštrukcie tmavý a drobné kotvenia
     na ňom vyskočili ako svetlé bodky. */
  /* Pod horizontom je zem. Do obrazu ide ako svetlá stena štúdia, do
     zrkadlenia ako skutočná dlažba — a to nie je to isté: keď sa svetlé
     pozadie premietlo aj do odrazov, tmavý antracit na stĺpe vyšiel o dve
     tretiny svetlejší, než v skutočnosti je. Prepínač uPozadie rozhodne,
     ktorá z dvoch úloh sa práve počíta. */
  vec3 zem = mix(uOdrazZeme, vec3(1.02, 1.015, 1.000), uPozadie * 0.72);
  c = mix(zem, c, smoothstep(-0.055, 0.035, dir.z));

  /* Slnečný kotúč a jeho halo. Pri zamračení sa kotúč stratí a ostane len
     svetlejšie miesto na oblohe. */
  float ds = max(dot(dir, slnko), 0.0);
  float kotuc = smoothstep(0.9993, 0.99975, ds) * (1.0 - zamracene) * 42.0;
  float halo  = pow(ds, mix(320.0, 22.0, zamracene)) * mix(2.4, 0.55, zamracene);
  float zar   = pow(ds, mix(7.0, 3.0, zamracene)) * mix(0.14, 0.10, zamracene);
  c += vec3(1.0, 0.958, 0.882) * (kotuc + halo + zar);

  return c;
}

/* Rozptýlené svetlo z oblohy pre danú normálu. Presný integrál cez pologuľu
   by potreboval mapu; toto je jeho lacná a v tejto scéne nerozoznateľná
   náhrada: priemer oblohy nad normálou a zeme pod ňou, vážený tým, koľko
   pologule normála vidí. */
/* Tri smery oblohy — hore, do boku a dole — sa v jednom snímku nemenia,
   tak sa počítajú raz na procesore a prídu ako uniformy. Ušetrí to tri
   vyhodnotenia oblohy na každý pixel; a keďže ich má fragment ďalšie tri
   (odraz, závoj, zánik podkladu), je to polovica celej práce shadera.
   Obloha je navyše okolo zvislej osi rovnaká, takže na smere do boku
   nezáleží — jediné, čo tam záviselo od azimutu, bol slnečný kotúč, ktorý
   do rozptýleného svetla aj tak nepatrí. */
uniform vec3 uOzarHore;
uniform vec3 uOzarBok;
uniform vec3 uOzarDole;

vec3 ozarenie(vec3 n, vec3 slnko, float zamracene) {
  vec3 hore = uOzarHore;
  vec3 bok  = uOzarBok;
  vec3 dole = uOzarDole;
  float k = n.z * 0.5 + 0.5;
  vec3 c = mix(dole, hore, k * k);
  c = mix(c, bok, 0.40);
  /* Jas oblohy v jednom smere nie je ožiarenie plochy. Integrál cez pologuľu
     dá zlomok z neho — bez tohto delenia je obloha silnejšia než poludňajšie
     slnko a scéna je celá modrá bez tieňov. */
  /* Obloha nie je rovnomerná kupola. Pri 0,74 dostával tmavý antracit toľko
     rozptýleného svetla, že z neho bola stredná sivá — a práve tá tmavá je
     to, čo výrobok predáva. Nižšia hodnota prehĺbi tiene aj tmavé materiály;
     stratené svetlo sa vracia v slnku, takže osvetlené plochy ostanú rovnako
     jasné a obraz dostane kontrast. */
  c *= 0.70;
  /* Tieň vonku nie je modrý tak, ako je modrá obloha: než svetlo dopadne,
     odrazí sa od zeme, od steny, od auta. Každý odraz uberie sýtosť. Toto
     je jeden krok toho premiešania — bez neho vyzerá tieň ako fotomontáž. */
  float seda = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, vec3(seda), 0.30);
}
`;

  /* Vratné kódovanie farby pre vyhladzovanie hrán.

     Štvornásobné MSAA zlučuje vzorky pixela priemerom — a doteraz ho robilo
     v lineárnom svetle ešte pred filmovou krivkou. Pre tmavý profil na
     svetlom pozadí je to zlé miesto: pixel, ktorý profil pokrýva zo štvrtiny,
     vyjde po krivke takmer taký svetlý ako pozadie, zo štyroch úrovní
     prechodu ostanú na obrazovke dve a hrana stĺpa aj rámu sa láme do
     schodov. To isté so slnečným odleskom na hrane: jedna presvetlená vzorka
     prebije tri tmavé a z hrany je svetlá bodka.

     Konštrukcia sa preto zapíše zakódovaná krivkou blízkou tomu, ako farbu
     vníma oko (x/(1+x), potom gama), zlúčenie prebehne v nej a hneď potom sa
     farba presne dekóduje späť. Plocha, na ktorej je v pixeli všade to isté,
     vyjde bit po bite rovnaká — mení sa len to, ako sa zmiešajú hrany. Je to
     ten istý postup, akým hrany zlučujú herné enginy s HDR. */
  const KODOVANIE = `
vec3 zakoduj(vec3 c) {
  c = max(c, vec3(0.0));
  return pow(c / (1.0 + c), vec3(1.0 / 2.2));
}
vec3 odkoduj(vec3 u) {
  vec3 y = pow(clamp(u, 0.0, 0.9995), vec3(2.2));
  return y / (1.0 - y);
}
`;

  /* Fyzikálne tieňovanie. GGX pre zrkadlovú zložku, Lambert pre rozptýlenú,
     Smithova viditeľnosť a Schlickov Fresnel. Je to ten istý model, ktorý
     používajú Blender, Unreal aj každý poriadny konfigurátor — preto to
     vyzerá ako materiál, nie ako farba. */
  const PBR = `
const float PI = 3.14159265359;

float rozdelenieGGX(float ndh, float a) {
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

float viditelnostSmith(float ndv, float ndl, float a) {
  float a2 = a * a;
  float v = ndl * sqrt(ndv * ndv * (1.0 - a2) + a2);
  float l = ndv * sqrt(ndl * ndl * (1.0 - a2) + a2);
  return 0.5 / max(v + l, 1e-6);
}

vec3 fresnel(vec3 f0, float u) {
  float f = pow(1.0 - u, 5.0);
  return f0 + (vec3(1.0) - f0) * f;
}

/* Analytická aproximácia environmentálneho BRDF (Karis). Nahrádza načítanú
   LUT textúru — rozdiel je pod hranicou viditeľnosti a ušetrí to jednu
   textúru aj jedno sťahovanie. */
vec3 envBRDF(vec3 f0, float drsnost, float ndv) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4( 1.0,  0.0425,  1.040, -0.040);
  vec4 r = drsnost * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * ndv)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + ab.y;
}
`;

  const VS_HLAVNY = HLAVICKA + `
layout(location = 0) in vec3 aPoz;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec3 aFarba;
layout(location = 3) in vec4 aParam;   /* kov, drsnosť, priehľadnosť, príznak */
layout(location = 4) in float aPoradie; /* náskok v hĺbke, ktorý si pýta geometria */

uniform mat4 uPohladProjekcia;
uniform mat4 uSlnkoMatica;
uniform float uPosunPoNormale;
uniform float uKrokPoradia;

out vec3 vPoz;
out vec3 vNorm;
out vec3 vFarba;
out vec4 vParam;
out vec4 vTien;

void main() {
  vec3 poz = aPoz;
  vPoz = poz;
  vNorm = aNorm;
  vFarba = aFarba;
  vParam = aParam;
  /* Posun po normále namiesto posunu v hĺbke. Hĺbkový posun treba
     nastaviť podľa sklonu plochy a rozsahu scény a vždy je buď malý (akné)
     alebo veľký (tieň odlepený od predmetu). Posun o niekoľko svetových
     texelov tieňovej mapy von z plochy tento kompromis nemá: je v tých
     istých jednotkách, v akých vzniká chyba. */
  vTien = uSlnkoMatica * vec4(poz + aNorm * uPosunPoNormale, 1.0);
  gl_Position = uPohladProjekcia * vec4(poz, 1.0);
  /* Detail, ktorý si geometria pýta navrch, dostane nepatrný náskok. Je to
     to isté, čo robil doterajší maliar poradím kreslenia — len vyjadrené
     tak, aby tomu rozumel hĺbkový test. */
  if (aPoradie != 0.0) gl_Position.z -= uKrokPoradia * aPoradie * gl_Position.w;

}
`;

  const FS_HLAVNY = HLAVICKA + OBLOHA + PBR + KODOVANIE + `
in vec3 vPoz;
in vec3 vNorm;
in vec3 vFarba;
in vec4 vParam;
in vec4 vTien;

uniform vec3 uOko;
uniform vec3 uSlnko;
uniform vec3 uSvetloSlnka;
uniform float uZamracene;
uniform sampler2D uTienMapa;
/* Tá istá tieňová mapa, ale čítaná porovnávacím vzorkovačom s lineárnym
   filtrom: každé čítanie vráti podiel osvetlenia zo štyroch susedných
   texelov, nie tvrdé áno/nie. Okraj tieňa je preto hladký už pri ôsmich
   vzorkách a pri otáčaní nezrní. */
uniform highp sampler2DShadow uTienPorov;
uniform vec2 uTienKrok;
uniform int uTienVzoriek;
uniform float uSnimok;     /* poradie vzorky doostrenia, mení šum tieňa */
uniform float uOrezavat;
uniform vec3 uStred;
uniform float uDosah;
uniform int uLadenie;   /* 0 hotový obraz, 1 tieň, 2 NdotL, 3 normála, 4 albedo */
uniform float uPodkladDetail;
uniform float uPodkladSkryt;
uniform float uKodovat;   /* 1 = nepriehľadná konštrukcia, zapisuje sa zakódovaná */

layout(location = 0) out vec4 oFarba;
layout(location = 1) out vec4 oNormHlbka;

/* Poissonov kotúč na mäkký okraj tieňa. Šestnásť vzoriek pootočených podľa
   pozície na obrazovke — bez otáčania by na okraji tieňa boli viditeľné
   pásy, s ním je tam jemný šum, ktorý oko číta ako mäkký prechod. */
const vec2 KOTUC[16] = vec2[16](
  vec2(-0.94201624, -0.39906216), vec2( 0.94558609, -0.76890725),
  vec2(-0.09418410, -0.92938870), vec2( 0.34495938,  0.29387760),
  vec2(-0.91588581,  0.45771432), vec2(-0.81544232, -0.87912464),
  vec2(-0.38277543,  0.27676845), vec2( 0.97484398,  0.75648379),
  vec2( 0.44323325, -0.97511554), vec2( 0.53742981, -0.47373420),
  vec2(-0.26496911, -0.41893023), vec2( 0.79197514,  0.19090188),
  vec2(-0.24188840,  0.99706507), vec2(-0.81409955,  0.91437590),
  vec2( 0.19984126,  0.78641367), vec2( 0.14383161, -0.14100790)
);

float sum(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

/* Ladenie: rozdiel medzi hĺbkou plochy a hĺbkou v tieňovej mape. Nula
   znamená, že plocha je presne tá, ktorú slnko vidí; kladné číslo, že je
   za niečím. Bez tohto pohľadu sa akné v tieni hľadá naslepo. */
float rozdielHlbky() {
  vec3 s = vTien.xyz / vTien.w;
  s = s * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return -1.0;
  return s.z - texture(uTienMapa, s.xy).r;
}

/* Mäkkosť okraja nie je konštanta. Tieň päty stĺpa je ostrý, tieň strechy
   na zemi o dva a pol metra nižšie je rozmazaný — a práve ten rozdiel
   prezradí, že sa scéna deje v priestore. Postup je dvojkrokový: najprv sa
   niekoľkými vzorkami nájde, ako ďaleko pred plochou stojí to, čo ju tieni,
   a z tej vzdialenosti sa určí polomer rozostrenia. */
float vTieni(vec3 n) {
  vec3 s = vTien.xyz / vTien.w;
  if (s.z > 1.0) return 1.0;
  s = s * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return 1.0;

  /* Hlavný posun spravil vrcholový shader po normále. Tu ostáva len
     drobnosť proti zaokrúhľovaniu v 24-bitovej hĺbke. */
  float posun = 0.00008;

  /* Pootočenie kotúča podľa pixelu. Prekladaný gradientový šum namiesto
     náhodného: susedné pixely dostanú rovnomerne rozložené uhly, takže
     z malého počtu vzoriek nevzniká zrno, ktoré sa pri pohybe mihá. */
  /* V pohybe (menej ako 12 vzoriek) sa kotúč neotáča vôbec. Šum je
     pripnutý k obrazovke, kým tieň sa pod ním posúva — pri otáčaní preto
     okraj „pieskoval". Bez otáčania je okraj stály; filtrované čítania
     ho aj z ôsmich vzoriek vyhladia. */
  /* Posun o uSnimok: každá vzorka doostrenia dostane iné pootočenie.
     Bez neho mal pixel v každom z dvanástich snímok to isté a šum sa
     namiesto spriemerovania vpálil do obrazu — na čele lemovania bola
     jemná šachovnica. */
  float uhol = uTienVzoriek >= 12
    ? fract(52.9829189 * fract(dot(gl_FragCoord.xy + 5.588238 * uSnimok, vec2(0.06711056, 0.00583715)))) * 6.2831853
    : 0.0;
  float c = cos(uhol), si = sin(uhol);
  mat2 rot = mat2(c, -si, si, c);

  /* Hľadanie tieniaceho telesa. Päť vzoriek v malom okolí stačí: potrebujeme
     len priemernú hĺbku toho, čo je pred nami, nie jeho tvar.

     V pohybe sa nehľadá vôbec — premenlivá mäkkosť okraja je to prvé, čo sa
     pri otáčaní stratí, a stojí päť čítaní z textúry na každý pixel. */
  if (uTienVzoriek <= 2) return texture(uTienPorov, vec3(s.xy, s.z - posun));
  float blokHlbka = 0.0; float blokPocet = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 o = rot * KOTUC[i * 3] * uTienKrok * 3.2;
    float d = texture(uTienMapa, s.xy + o).r;
    if (d < s.z - posun) { blokHlbka += d; blokPocet += 1.0; }
  }
  /* Bez tieniaceho telesa je plocha na slnku — ďalej sa počítať netreba. */
  if (blokPocet < 0.5) return 1.0;
  blokHlbka /= blokPocet;

  /* Polomer rastie so vzdialenosťou medzi plochou a tým, čo ju tieni.
     Konštanta zodpovedá uhlovej veľkosti slnka (pol stupňa) prepočítanej na
     túto scénu — preto tieň stĺpa pri päte drží tvar a tieň strechy sa
     na zemi rozplýva. */
  float rozostup = clamp((s.z - blokHlbka) * 42.0, 0.0, 1.0);
  vec2 krok = uTienKrok * mix(1.2, 8.0, rozostup);

  /* Počet vzoriek sa mení podľa toho, či sa model práve otáča. V pohybe
     oko mäkkosť okraja nestihne prečítať a osem vzoriek je polovičná cena;
     po zastavení sa dokreslí plných šestnásť. */
  float suma = 0.0;
  int pocet = uTienVzoriek;
  for (int i = 0; i < 16; i++) {
    if (i >= pocet) break;
    vec2 o = rot * KOTUC[i] * krok;
    suma += texture(uTienPorov, vec3(s.xy + o, s.z - posun));
  }
  return suma / float(pocet);
}

void main() {
  /* Dve normály, nie jedna.

     nGeo je skutočná normála plochy tak, ako ju má geometria; n je tá
     istá normála otočená k oku, keď sa naň plocha pozerá chrbtom — v scéne
     je veľa jednostranných plechov hrúbky pol milimetra a bez otočenia by sa
     podhľad strechy pri pohľade zdola prepadol do čierna.

     Rozdelené musia byť preto, že otočená normála smie svietiť len z oblohy.
     Keď sa použila aj na priame slnko, slnko „presvitalo" cez strechu na
     podhľad — a keďže tieňová mapa mu v tom čiastočne bránila, vznikla na
     podhľade bodkovaná mriežka. Priame svetlo preto počíta s tým, ako plocha
     naozaj stojí; rozptýlené z oblohy s tým, ktorú stranu vidíme. */
  vec3 nGeo = normalize(vNorm);
  vec3 v = normalize(uOko - vPoz);

  /* Jednostranná plocha sa odzadu nekreslí vôbec.

     Plechy v tejto scéne majú nulovú hrúbku: horná a spodná strana ležia na
     tej istej rovine. Keď sa kreslia obe, hĺbkový test medzi nimi rozhoduje
     pixel po pixeli a z podhľadu je bodkovaná mriežka — raz vyhrá spodok,
     raz vrch, a ten druhý dostane slnko, ktoré by cez strechu nikdy
     neprešlo. Orezanie tu, vo fragmente, je presné a nezávisí od kamery,
     takže geometria môže ostať na karte bez prestavby. */
  /* Príznaky sú bity, nie čísla: 1 podklad, 2 jednostranná plocha, 4 sklo. */
  int priznakyBit = int(vParam.w + 0.5);
  float priznaky = vParam.w;
  bool jeSklo = (priznakyBit & 4) != 0;
  /* Jednostranná plocha sa odzadu nekreslí — tak, ako to robila aj doterajšia
     geometria. Ostatné sa kreslia z oboch strán; po rozostúpení o hrúbku
     plechu si už neprekážajú. */
  if (uOrezavat > 0.5 && (priznakyBit & 2) != 0 && dot(nGeo, v) < 0.0) discard;

  vec3 n = dot(nGeo, v) < 0.0 ? -nGeo : nGeo;

  float kov = vParam.x;
  float drsnost = clamp(vParam.y, 0.035, 1.0);

  /* Podklad nie je jednofarebná doska. Bez povrchu je to najväčšia plocha
     v zábere a práve ona prezradí, že ide o render. Škáry dlažby, zrnitosť
     a mierna zmena drsnosti stačia — ostatné dorobí svetlo. */
  vec3 podkladFarba = vFarba;
  vec2 podkladLad = vec2(0.0);
  float priehladnostSkla = -1.0;
  bool jePodklad = (priznakyBit & 1) != 0;
  /* Pod horizontom sa podklad nekreslí: kamera je vtedy pod rovinou zeme a
     dlažba, stokrát väčšia než stavba, by vyplnila celý záber. Rieši sa to
     tu, nie vynechaním z geometrie — inak by sa pri každom prechode cez
     horizont musela sieť prestavať a otáčanie by sa zaseklo. */
  if (jePodklad && uPodkladSkryt > 0.5) discard;
  if (jePodklad && uPodkladDetail > 0.5) {
    /* Dlažba 90 × 90 cm — rovnaký raster, aký kreslila doterajšia scéna. Predchádzajúca verzia kreslila pravidelnú mriežku
       a vyzerala ako milimetrový papier: každá dlaždica rovnaká, každá škára
       rovnako tmavá. Skutočný betón je na každej doske o kúsok inak svetlý,
       škára je úzka a miestami zanesená a cez celú plochu ide pomalá vlna
       vlhkosti. To je všetko, čo treba — zvyšok dorobí svetlo. */
    vec2 uv = vPoz.xy / 900.0;

    /* Útlm kresby do diaľky — dva, lebo dlaždica a jej škára majú celkom
       iné rozmery. Doska má 90 cm a na tridsiatich metroch má ešte tridsať
       pixelov; škára má dva centimetre a na tej istej vzdialenosti nemá ani
       jeden. Kým sa útlm počítal z dosky, škáry sa do diaľky rozsypali na
       tmavé bodky — presne to, čo na zábere rušilo pri horizonte. Každá
       zložka sa preto utlmí podľa vlastnej šírky, tak ako by to spravilo
       filtrovanie textúry. */
    /* Útlm sa počíta pre každú os zvlášť, nie z tej horšej.

       Zem sa vidí takmer sponad — do hĺbky pripadne na pixel aj tridsať
       milimetrov, do šírky osem. Kým rozhodovala tá horšia os, vyšla škára
       pod prah a dlažba zmizla úplne: podlaha mala rovnaký jas ako stena za
       ňou (208 proti 213) a prístrešok sa v obraze vznášal. Pritom škára,
       ktorá vedie do hĺbky, je cez celý záber ostrá — rozmazaná je len tá
       priečna. Presne to robí anizotropné filtrovanie textúry a je to
       rozdiel medzi dvorom a bielym pozadím. */
    float sirkaX = length(vec2(dFdx(uv.x), dFdy(uv.x)));
    float sirkaY = length(vec2(dFdx(uv.y), dFdy(uv.y)));
    float naPixel = max(sirkaX, sirkaY);
    float ostrost = 1.0 - smoothstep(0.016, 0.075, min(sirkaX, sirkaY) * 0.5 + naPixel * 0.5);
    /* Škára je široká šesť centimetrov, teda pätnástina dosky. Držať sa má
       dovtedy, kým nie je užšia než pixel — to je pri 0,065 dlaždice na
       pixel. Kým sa útlm končil pri 0,030, mizla škára už v polovici dvora,
       hoci mala na obrazovke ešte dva pixely. Aliasing, ktorý by z nej na
       konci urobil bodkovanú čiaru, rieši doostrovanie: dvanásť posunutých
       snímok ju zloží do plynulého tónu. */
    float ostrostX = 1.0 - smoothstep(0.016, 0.052, sirkaX);      /* škáry naprieč x */
    float ostrostY = 1.0 - smoothstep(0.016, 0.052, sirkaY);      /* škáry naprieč y */
    float ostrostSkary = max(ostrostX, ostrostY);
    float ostrostZrna = 1.0 - smoothstep(0.006, 0.030, naPixel);  /* zrno 1,8 cm */

    vec2 bunka = floor(uv);
    vec2 vnutri = fract(uv);

    /* Škára: úzka a nie úplne rovnomerná. */
    vec2 kOkraju = abs(vnutri - 0.5);
    float sirkaSkary = 0.468 + 0.010 * fract(sin(dot(bunka, vec2(7.3, 19.7))) * 9137.1);
    /* Každá rodina škár sa utlmí podľa svojej osi. Tá, ktorá vedie do
       hĺbky, ostane ostrá aj tam, kde priečna už dávno splynula. */
    float skaraX = (1.0 - smoothstep(sirkaSkary, sirkaSkary + 0.024, kOkraju.x)) * ostrostX;
    float skaraY = (1.0 - smoothstep(sirkaSkary, sirkaSkary + 0.024, kOkraju.y)) * ostrostY;
    float skara = max(skaraX, skaraY);

    /* Tón dosky. Rozdiely sú malé — päť percent stačí, aby plocha prestala
       byť jedna doska a stala sa z nej dlažba. */
    float tonDosky = fract(sin(dot(bunka, vec2(41.7, 289.1))) * 43758.5453);
    /* Pomalá vlna cez celú plochu: mierne svetlejšie a tmavšie pásy, aké
       zanechá schnúca voda. */
    float vlna = sin(vPoz.x * 0.00019 + vPoz.y * 0.00014) * 0.5 + 0.5;
    /* Jemné zrno v mierke centimetrov. */
    float zrno = fract(sin(dot(floor(vPoz.xy / 18.0), vec2(12.99, 78.23))) * 43758.5453);

    /* Vlna je veľká a do diaľky sa nerozpadne, tak ostáva v plnej sile;
       všetko ostatné sa s dlaždicou zmenšuje, tak sa s ňou aj utlmí. */
    /* Každá zložka sa utlmí podľa vlastnej mierky a to, čo sa utlmí, sa
       nahradí svojou strednou hodnotou — inak by plocha do diaľky menila jas
       a vznikol by z toho pás. */
    /* Rozdiel medzi doskami je väčší, než sa zdá. Pri piatich percentách
       vyšla dlažba ako jedna liata plocha; betónová doska sa od susednej
       líši viac a práve to z plochy spraví dvor. */
    podkladFarba *= 0.946
                  + tonDosky * 0.062 * ostrost + (1.0 - ostrost) * 0.031
                  + zrno * 0.030 * ostrostZrna + (1.0 - ostrostZrna) * 0.015
                  + vlna * 0.036;
    /* Škára musí byť vidieť. Pri 0,86 sa z nej po filmovej krivke stal
       rozdiel dvoch jasových stupňov a dlažba vyzerala ako jedna doska. */
    /* Čo sa utlmí, nahradí svoja stredná hodnota. Škára zaberá z dlaždice
       asi osminu; keby v diaľke jednoducho zmizla, plocha by tam zosvetlela
       a na prechode by vyšiel pás. */
    float strednaSkara = 1.0 - 0.128 * 0.16;
    float utlm = max(ostrostX, ostrostY);
    podkladFarba *= mix(strednaSkara, mix(1.0, 0.84, skara), utlm);
    /* Škára je matnejšia než doska, doska má miestami hladšie miesta. */
    drsnost = clamp(drsnost * (0.93 + zrno * 0.14 * ostrostZrna + (1.0 - ostrostZrna) * 0.07)
                  + skara * 0.05, 0.035, 1.0);
    podkladLad = vec2(skara, ostrostSkary);
  }
  float a = drsnost * drsnost;

  vec3 albedo = podkladFarba;
  vec3 f0 = mix(vec3(0.04), albedo, kov);
  vec3 difAlbedo = albedo * (1.0 - kov);

  float ndv = max(dot(n, v), 1e-4);

  /* --- priame slnko --------------------------------------------------- */
  vec3 l = uSlnko;
  vec3 h = normalize(l + v);
  /* Priame slnko ide cez skutočnú normálu: chrbát plochy slnko nedostane. */
  float ndl = max(dot(nGeo, l), 0.0);
  float ndh = max(dot(nGeo, h), 0.0);
  float vdh = max(dot(v, h), 0.0);
  float ndvGeo = max(dot(nGeo, v), 1e-4);

  float tien = ndl > 0.0 ? vTieni(nGeo) : 1.0;

  vec3 spec = fresnel(f0, vdh) * rozdelenieGGX(ndh, a) * viditelnostSmith(ndvGeo, ndl, a);
  vec3 dif = difAlbedo / PI;
  vec3 priame = (dif + spec) * uSvetloSlnka * ndl * tien;

  /* --- obloha ---------------------------------------------------------- */
  vec3 ozar = ozarenie(n, uSlnko, uZamracene);
  vec3 difIbl = difAlbedo * ozar;

  vec3 r = reflect(-v, n);
  /* Drsný povrch neodráža ostrý obraz oblohy, ale jej priemer. Namiesto
     predfiltrovanej mapy sa smer odrazu ohne k normále a výsledok sa
     primieša k rozptýlenému ožiareniu — na tejto scéne je to na nerozoznanie
     a nestojí ani textúru, ani jej prípravu. */
  vec3 rOhnuty = normalize(mix(r, n, drsnost * drsnost * 0.82));
  /* Drsný povrch vracia namiesto obrazu oblohy jej priemer — a ten už máme
     spočítaný. Vyhodnotiť pre matný lak celú oblohu je zbytočná práca na
     každom pixeli, a práve matných plôch je v scéne najviac. */
  /* Hranica nesmie ležať na hodnote niektorého materiálu. Kým bola 0,58 —
     presne drsnosť laku —, rozhodovala o vetve chyba interpolácie: jeden
     pixel mal 0,5799999, susedný 0,5800001, a na ramene lemovania z toho
     v pohybe boli tmavé zrnká. Lak ide ďalej tou vetvou, ktorou išiel na
     drvivej väčšine plochy; medzi 0,58 a 0,65 nie je žiadny materiál. */
  vec3 odraz = drsnost > 0.65
    ? ozar
    : mix(farbaOblohy(rOhnuty, uSlnko, uZamracene), ozar, drsnost * 0.55);
  /* Drsný dielektrik nevracia toľko zrkadlového svetla, koľko mu prisúdi
     analytická aproximácia — jej zvyšková zložka je počítaná štedro a časť
     tej istej energie je už v rozptýlenom svetle. Na tmavom laku to bolo
     vidieť najviac: práve ona z antracitu spravila strednú sivú. */
  vec3 specIbl = odraz * envBRDF(f0, drsnost, ndv) * mix(1.0, 0.16, drsnost);

  /* Odraz sa nesmie kresliť pod horizont tam, kde je zem — inak sa v zvislom
     stĺpe zrkadlí obloha aj zospodu. */
  float podHorizont = smoothstep(-0.25, 0.02, rOhnuty.z);
  specIbl *= mix(0.32, 1.0, podHorizont);

  vec3 farba = priame + difIbl + specIbl;

  /* --- sklo ------------------------------------------------------------
     Tabuľa skla nemá rozptýlené svetlo. Svetlo sa na nej buď odrazí, alebo
     ňou prejde, a pomer medzi tým závisí od uhla: kolmo vidno cez sklo
     takmer všetko, pri šikmom pohľade sa z neho stane zrkadlo. Presne to
     robí na zasklenej streche dojem skla — plocha, ktorá je pri sebe číra
     a na druhom konci odráža oblohu.

     Priehľadnosť sa preto nepočíta zo zadanej farby, ale z Fresnelovho
     zákona, a farba tabule je farba jej odrazu. Zadaná farba ostáva ako
     zafarbenie skla: sklo pohltí zopár percent a mierne dozelena. */
  if (jeSklo) {
    float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    /* Ostrý odraz oblohy: sklo je hladké, jeho odraz sa nerozostruje. */
    vec3 zrkadlo = farbaOblohy(reflect(-v, n), uSlnko, uZamracene);
    /* Slnečný odlesk na tabuli — úzky, lebo hladké sklo ho nerozotrie. */
    float odlesk = pow(max(dot(reflect(-v, n), uSlnko), 0.0), 900.0);
    zrkadlo += uSvetloSlnka * odlesk * tien * 1.6;
    /* Pohltenie v hrúbke tabule. Šesť percent je bežné číslo pre číre sklo
       a je to práve to, čo z tabule spraví viditeľnú plochu aj tam, kde
       neodráža nič. */
    float pohltenie = 0.10;
    float alfa = fres + (1.0 - fres) * pohltenie;
    vec3 tonSkla = albedo * ozar;
    farba = (zrkadlo * fres + tonSkla * (1.0 - fres) * pohltenie) / max(alfa, 1e-3);
    priehladnostSkla = clamp(alfa, 0.0, 1.0);
  }

  if (uLadenie == 1) farba = vec3(tien);
  else if (uLadenie == 2) farba = vec3(ndl);
  else if (uLadenie == 3) farba = n * 0.5 + 0.5;
  else if (uLadenie == 4) farba = albedo;
  else if (uLadenie == 5) farba = priame;
  else if (uLadenie == 6) farba = difIbl + specIbl;
  else if (uLadenie == 7) { float r = rozdielHlbky(); farba = r < 0.0 ? vec3(0.0, 0.0, 1.0) : vec3(r * 900.0); }
  else if (uLadenie == 8) { vec3 s = vTien.xyz / vTien.w * 0.5 + 0.5; farba = vec3(s.z); }
  else if (uLadenie == 9) { vec3 s = vTien.xyz / vTien.w * 0.5 + 0.5; farba = vec3(texture(uTienMapa, s.xy).r); }
  else if (uLadenie == 10) { float d = dot(nGeo, v); farba = d < 0.0 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0); }
  else if (uLadenie == 11) farba = nGeo * 0.5 + 0.5;
  else if (uLadenie == 12) farba = jePodklad ? vec3(podkladLad, 0.0) : vec3(0.0, 0.0, 1.0);

  /* Tenký vzdušný závoj do hĺbky. Drží oddelenie predného a zadného stĺpa
     aj vtedy, keď majú rovnakú farbu. */
  float vzdial = length(uOko - vPoz);
  /* Závoj má dať hĺbku, nie hmlu. Kým miešal do jasnej oblohy silou 0,55,
     tvoril na tmavom ráme štyri pätiny jeho jasu — antracit sa cez celý
     záber rozplynul do svetlosivej a obraz vyzeral zahmlený. Odmerané:
     najtmavšie percentá obrazu mali 88 namiesto 46. Ostáva z neho toľko,
     aby vzdialenejší stĺp bol o kúsok bledší než bližší. */
  float mlha = 1.0 - exp(-vzdial * 1.1e-5);
  farba = mix(farba, mix(uOzarDole, uOzarBok, 0.5), mlha * 0.10);

  /* Podklad nekončí hranou. Doterajší okraj dlažby bol na zábere vidieť ako
     rovná čiara cez celú šírku — a nič tak spoľahlivo neprezradí, že model
     stojí na doske, nie na dvore. Plocha sa preto do diaľky rozplynie do
     farby prostredia. */
  float priehladnost = priehladnostSkla >= 0.0 ? priehladnostSkla : vParam.z;
  if (jePodklad) {
    float r = length(vPoz.xy - uStred.xy) / max(1.0, uDosah);
    /* Zánik začína skôr, než by sa dalo. Ďaleká dlažba už nemá čo ukázať:
       dlaždica má na obrazovke pár pixelov, kresba sa utlmila do hladkého
       tónu a zatienenie do šumu. Skorší prechod do prostredia to všetko
       schová a zároveň drží dojem otvoreného dvora. */
    /* Zánik začína až ďaleko za stavbou. Kým sa začínal v 0,42 dosahu,
       zmizla dlažba aj tam, kde ju bolo treba: záber mal podlahu bielu ako
       stenu za ňou a prístrešok sa v nej vznášal. */
    float zanik = 1.0 - smoothstep(0.72, 1.45, r);
    /* Aj tam, kde už dlažba nemá kresbu, ostáva podlahou — prechádza do
       tónu odrazu zeme, nie do farby steny. Práve ten rozdiel drží
       horizont. */
    vec3 dalka = mix(uOzarDole, uOzarBok, 0.55) * 0.92;
    farba = mix(dalka, farba, zanik);
  }

  oFarba = vec4(uKodovat > 0.5 ? zakoduj(farba) : farba, priehladnost);
  oNormHlbka = vec4(n * 0.5 + 0.5, 1.0);
}
`;

  const VS_TIEN = HLAVICKA + `
layout(location = 0) in vec3 aPoz;
uniform mat4 uSlnkoMatica;
void main() { gl_Position = uSlnkoMatica * vec4(aPoz, 1.0); }
`;

  const FS_TIEN = HLAVICKA + `
out vec4 oFarba;
void main() { oFarba = vec4(1.0); }
`;

  const VS_PLOCHA = HLAVICKA + `
out vec2 vUV;
void main() {
  /* Jeden veľký trojuholník namiesto dvoch — nemá uhlopriečny šev a je
     o vlások lacnejší. */
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

  const FS_SSAO = HLAVICKA + `
in vec2 vUV;
uniform sampler2D uHlbka;
uniform sampler2D uNorm;
uniform mat4 uProjekcia;
uniform mat4 uProjekciaInv;
uniform vec2 uRozmer;
uniform float uPolomer;
uniform float uDosahAO;
out vec4 oFarba;

vec3 pozZHlbky(vec2 uv, float d) {
  vec4 k = uProjekciaInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return k.xyz / k.w;
}

float sum(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

const vec3 JADRO[16] = vec3[16](
  vec3( 0.5381,  0.1856, 0.4319), vec3( 0.1379,  0.2486, 0.4430),
  vec3( 0.3371,  0.5679, 0.0057), vec3(-0.6999, -0.0451, 0.0019),
  vec3( 0.0689, -0.1598, 0.8547), vec3( 0.0560,  0.0069, 0.1843),
  vec3(-0.0146,  0.1402, 0.0762), vec3( 0.0100, -0.1924, 0.0344),
  vec3(-0.3577, -0.5301, 0.4358), vec3(-0.3169,  0.1063, 0.0158),
  vec3( 0.0103, -0.5869, 0.0046), vec3(-0.0897, -0.4940, 0.3287),
  vec3( 0.7119, -0.0154, 0.0918), vec3(-0.0533,  0.0596, 0.5411),
  vec3( 0.0352, -0.0631, 0.5460), vec3(-0.4776,  0.2847, 0.0271)
);

void main() {
  float d = texture(uHlbka, vUV).r;
  if (d >= 1.0) { oFarba = vec4(1.0); return; }

  vec4 nv = texture(uNorm, vUV);
  /* Pixel, do ktorého normálu nikto nezapísal (obloha, autá, dážď), sa
     nezatieňuje — inak by sa na ňom počítalo s normálou oblohy. */
  if (nv.a < 0.5) { oFarba = vec4(1.0); return; }

  vec3 p = pozZHlbky(vUV, d);

  /* Zatienenie v kútoch je efekt dotyku dvoch plôch — na tridsiatich metroch
     nemá čo robiť. Pri horizonte navyše jedna vzorka preskočí desiatky metrov
     a z plochy sa stane blokový šum, ktorý rozostrenie roztiahne do
     obdĺžnikov. Za hranicou dosahu sa preto nepočíta vôbec. */
  float vzdial = -p.z;
  if (vzdial > uDosahAO) { oFarba = vec4(1.0); return; }
  float utlm = 1.0 - smoothstep(uDosahAO * 0.72, uDosahAO, vzdial);

  vec3 n = normalize(nv.xyz * 2.0 - 1.0);

  float uhol = sum(vUV * uRozmer) * 6.2831853;
  vec3 nahod = vec3(cos(uhol), sin(uhol), 0.0);
  vec3 t = normalize(nahod - n * dot(nahod, n));
  vec3 b = cross(n, t);
  mat3 tbn = mat3(t, b, n);

  float zatienenie = 0.0;
  for (int i = 0; i < 16; i++) {
    vec3 vzorka = p + tbn * JADRO[i] * uPolomer;
    vec4 o = uProjekcia * vec4(vzorka, 1.0);
    o.xyz /= o.w;
    vec2 uv = o.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    float dv = texture(uHlbka, uv).r;
    vec3 pv = pozZHlbky(uv, dv);
    float rozsah = smoothstep(0.0, 1.0, uPolomer / max(1e-4, abs(p.z - pv.z)));
    /* Predsudok musí byť v jednotkách scény, nie v abstraktných stotinách.
       Scéna je v milimetroch, takže 0,012 znamenalo dvanásť mikrometrov —
       hlboko pod presnosťou hĺbkovej pamäte. Každá vzorka na rovnej dlažbe
       tým vyšla náhodne a z celej plochy bol jemný šum, ktorý rozostrenie
       roztiahlo do fľakov. Teraz je viazaný na polomer vzorkovania aj na
       vzdialenosť od kamery, kde presnosť hĺbky prirodzene klesá. */
    float predsudok = max(uPolomer * 0.035, abs(p.z) * 0.0016);
    zatienenie += (pv.z >= vzorka.z + predsudok ? 1.0 : 0.0) * rozsah;
  }
  oFarba = vec4(vec3(1.0 - (zatienenie / 16.0) * utlm), 1.0);
}
`;

  const FS_ROZOSTRI = HLAVICKA + `
in vec2 vUV;
uniform sampler2D uZdroj;
uniform vec2 uSmer;
out vec4 oFarba;
void main() {
  float s = 0.0, w = 0.0;
  for (int i = -3; i <= 3; i++) {
    float v = exp(-float(i * i) / 8.0);
    s += texture(uZdroj, vUV + uSmer * float(i)).r * v;
    w += v;
  }
  oFarba = vec4(vec3(s / w), 1.0);
}
`;

  const FS_TON = HLAVICKA + KODOVANIE + `
in vec2 vUV;
uniform float uKodovane;
uniform sampler2D uScena;
uniform sampler2D uAO;
uniform sampler2D uZiara;
uniform float uSilaAO;
uniform float uSilaZiary;
uniform float uVineta;
uniform float uExpozicia;
uniform float uKontrast;
uniform int uLadenieTon;   /* 1 = len zatienenie, 2 = len žiara */
out vec4 oFarba;

/* ACES filmic. Je to tá istá krivka, akú má film aj každý poriadny renderer:
   svetlá sa nezrezávajú do bielej plochy, ale plynule doň prechádzajú —
   presne to robí rozdiel medzi „render" a „fotka" na bielej streche proti
   oblohe. */
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 c = texture(uScena, vUV).rgb;
  if (uKodovane > 0.5) c = odkoduj(c);
  float ao = mix(1.0, texture(uAO, vUV).r, uSilaAO);
  if (uLadenieTon == 1) { oFarba = vec4(vec3(ao), 1.0); return; }
  if (uLadenieTon == 2) { oFarba = vec4(texture(uZiara, vUV).rgb, 1.0); return; }
  c *= ao;
  c += texture(uZiara, vUV).rgb * uSilaZiary;
  c *= uExpozicia;
  c = aces(c);

  /* Do sRGB. Celý výpočet vyššie beží v lineárnom priestore, inak by sa
     svetlá sčítavali nesprávne a tiene by boli šedé. */
  c = pow(c, vec3(1.0 / 2.2));

  /* Filmová krivka ACES zdvihne tmavé tóny — je to jej účel, na fotografii
     to funguje. Na výrobku nie: antracitový profil z nej vyšiel ako stredná
     sivá, hoci práve tá tmavá je to, čo zákazník kupuje. Jemná S-krivka
     vráti tmavým tónom hĺbku a svetlým nechá roll-off, ktorý ACES dáva.
     Je to to isté, čo robí fotograf v úprave — nie zásah do fyziky. */
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, uKontrast);

  /* Vinetácia je jemná — má len usadiť pohľad do stredu, nie kresliť rám. */
  vec2 q = vUV - 0.5;
  c *= 1.0 - uVineta * dot(q, q) * 1.15;

  oFarba = vec4(c, 1.0);
}
`;

  const FS_POZADIE = HLAVICKA + OBLOHA + KODOVANIE + `
in vec2 vUV;
uniform mat4 uInvPohladProjekcia;
uniform vec3 uOko;
uniform vec3 uSlnko;
uniform float uZamracene;
uniform float uKodovat;
layout(location = 0) out vec4 oFarba;
layout(location = 1) out vec4 oNormHlbka;
void main() {
  /* Smer lúča cez pixel: rozbalí sa z inverznej matice, takže obloha sedí
     s perspektívou aj pri posunutom strede obrazu. */
  vec4 blizko = uInvPohladProjekcia * vec4(vUV * 2.0 - 1.0, -1.0, 1.0);
  vec4 daleko = uInvPohladProjekcia * vec4(vUV * 2.0 - 1.0,  1.0, 1.0);
  vec3 dir = normalize(daleko.xyz / daleko.w - blizko.xyz / blizko.w);
  vec3 c = farbaOblohy(dir, uSlnko, uZamracene);
  oFarba = vec4(uKodovat > 0.5 ? zakoduj(c) : c, 1.0);
  oNormHlbka = vec4(0.5, 0.5, 1.0, 0.0);
}
`;

  const FS_ZIARA = HLAVICKA + KODOVANIE + `
in vec2 vUV;
uniform float uKodovane;
uniform sampler2D uZdroj;
uniform vec2 uKrok;
uniform float uPrah;
out vec4 oFarba;
void main() {
  vec3 s = vec3(0.0);
  float w = 0.0;
  for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++) {
    float v = exp(-float(x * x + y * y) / 10.0);
    vec3 c = texture(uZdroj, vUV + vec2(float(x), float(y)) * uKrok).rgb;
    /* Pod prahom 1,0 (zakódovane 0,7297) vzorka k žiare nič nepridá;
       dekódovať sa oplatí len tie nad ním — ušetrí to väčšinu mocnín. */
    if (uKodovane > 0.5) c = max(c.r, max(c.g, c.b)) > 0.7297 ? odkoduj(c) : vec3(0.0);
    s += max(c - vec3(uPrah), vec3(0.0)) * v;
    w += v;
  }
  oFarba = vec4(s / w, 1.0);
}
`;

  /* Dekódovanie späť do viacvzorkovej pamäte. Konštrukcia je už zlúčená vo
     vnímanom priestore; autá, dopadový tieň, sklo a dážď sa na ňu potom
     kreslia a miešajú v lineárnom svetle ako doteraz, takže ich vzhľad sa
     nemení. Hĺbka ostáva po vzorkách, auto sa za stĺp schová presne. */
  const FS_DEKODUJ = HLAVICKA + KODOVANIE + `
in vec2 vUV;
uniform sampler2D uZdroj;
layout(location = 0) out vec4 oFarba;
void main() {
  vec4 c = texture(uZdroj, vUV);
  oFarba = vec4(odkoduj(c.rgb), c.a);
}
`;

  /* Prepis zbierky na plátno. Zbierka je priemer niekoľkých snímok toho
     istého pohľadu, každého posunutého o kúsok pixela — hotový obraz z nej
     ide na obrazovku nezmenený. */
  /* Posledný prechod na plátno. V pokoji len kopíruje — hrany tam vyhladí
     doostrovanie z dvanástich posunutých snímok. V pohybe je snímok jediný
     a štvornásobné MSAA na tenkých tmavých profiloch proti svetlej oblohe
     nestačí: stĺpy a rám pri otáčaní schodovito „pixelovali". Tam beží
     FXAA — hľadá len hrany s výrazným rozdielom jasu a rozmaže ich pozdĺž
     hrany, takže plochy a kresba trapézu ostanú ostré. Odkedy pohyb
     vyhladzuje časové vyhladzovanie (FS_TAA), beží FXAA len na prvom snímku
     pohybu, keď ešte niet histórie, alebo keď je TAA vypnuté. */
  const FS_KOPIA = HLAVICKA + `
in vec2 vUV;
uniform sampler2D uZdroj;
uniform vec2 uTexel;
uniform float uFxaa;
out vec4 oFarba;
const vec3 JAS = vec3(0.299, 0.587, 0.114);
vec3 t(vec2 uv) { return texture(uZdroj, uv).rgb; }
void main() {
  vec3 m = t(vUV);
  if (uFxaa < 0.5) { oFarba = vec4(m, 1.0); return; }
  float lNW = dot(t(vUV + vec2(-1.0, -1.0) * uTexel), JAS);
  float lNE = dot(t(vUV + vec2( 1.0, -1.0) * uTexel), JAS);
  float lSW = dot(t(vUV + vec2(-1.0,  1.0) * uTexel), JAS);
  float lSE = dot(t(vUV + vec2( 1.0,  1.0) * uTexel), JAS);
  float lM = dot(m, JAS);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) { oFarba = vec4(m, 1.0); return; }
  vec2 smer = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float utlm = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float k = 1.0 / (min(abs(smer.x), abs(smer.y)) + utlm);
  smer = clamp(smer * k, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (t(vUV + smer * (1.0 / 3.0 - 0.5)) + t(vUV + smer * (2.0 / 3.0 - 0.5)));
  vec3 b = a * 0.5 + 0.25 * (t(vUV - smer * 0.5) + t(vUV + smer * 0.5));
  float lB = dot(b, JAS);
  oFarba = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}
`;

  /* Časové vyhladzovanie (TAA) pre pohyb.

     V pokoji sa obraz zloží z dvanástich posunutých snímok toho istého
     pohľadu. Počas otáčania to nejde — každý snímok je iný pohľad — a jeden
     snímok so štyrmi vzorkami MSAA nestačí: rebro trapézu je užšie než pixel
     a pri otáčaní blikalo, hrany stĺpov a rámu sa schodovito lámali. FXAA
     to len rozmazalo pozdĺž hrany.

     Tu sa každý snímok v pohybe posunie o iný zlomok pixela a primieša sa
     k histórii — k tomu, čo bolo na tom istom mieste scény v predchádzajúcich
     snímkoch. Kde to miesto bolo, povie hĺbka: pixel sa rozbalí do sveta a
     premietne kamerou z minulého snímku. Scéna stojí, hýbe sa len kamera,
     takže také premietnutie je presné. Za desať snímok sa tak nazbiera
     približne toľko vzoriek ako v pokoji.

     Aby história neťahala za sebou šmuhy, orezáva sa rozptylom okolia
     aktuálneho snímku (farebný priestor YCoCg): čo sa od aktuálneho okolia
     líši viac, než sa v ňom farba mení, je zastarané a nahradí sa. História
     sa číta filtrom Catmull-Rom, nie bilineárne — bilineárne čítanie by
     obraz v pohybe každým snímkom o kúsok rozmazalo. */
  const FS_TAA = HLAVICKA + `
in vec2 vUV;
uniform sampler2D uAktualny;
uniform sampler2D uHistoria;
uniform sampler2D uHlbka;
uniform mat4 uSpat;          /* z aktuálneho posunutého priestoru do minulého snímku */
uniform vec2 uTexel;
uniform vec2 uRozmer;
uniform float uHistoriaPlatna;
out vec4 oFarba;

vec3 doYCoCg(vec3 c) {
  return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25)));
}
vec3 zYCoCg(vec3 c) {
  return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}

/* Catmull-Rom z piatich bilineárnych čítaní (Jimenez). */
vec3 historia(vec2 uv) {
  vec2 p = uv * uRozmer;
  vec2 s = floor(p - 0.5) + 0.5;
  vec2 f = p - s;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (s - 1.0) * uTexel;
  vec2 t3 = (s + 2.0) * uTexel;
  vec2 t12 = (s + w2 / w12) * uTexel;
  vec3 c = texture(uHistoria, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y)
         + texture(uHistoria, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
         + texture(uHistoria, t12).rgb * (w12.x * w12.y)
         + texture(uHistoria, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
         + texture(uHistoria, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  float w = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(c / w, vec3(0.0));
}

void main() {
  vec3 akt = texture(uAktualny, vUV).rgb;
  if (uHistoriaPlatna < 0.5) { oFarba = vec4(akt, 1.0); return; }

  /* Okolie 3 × 3: rozptyl farby na orezanie histórie a najbližšia hĺbka.
     Najbližšia preto, aby hrana stĺpa proti pozadiu vzala pohyb stĺpa,
     nie pozadia — inak by za ňou ostal lem. */
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  vec3 mn = vec3(1e9), mx3 = vec3(-1e9);
  float hl = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y)) * uTexel;
    vec3 c = doYCoCg(texture(uAktualny, vUV + o).rgb);
    m1 += c; m2 += c * c;
    mn = min(mn, c); mx3 = max(mx3, c);
    /* Hĺbka stačí v kríži — päť čítaní namiesto deviatich. */
    if (x == 0 || y == 0) hl = min(hl, texture(uHlbka, vUV + o).r);
  }
  m1 /= 9.0; m2 /= 9.0;
  vec3 sigma = sqrt(max(m2 - m1 * m1, vec3(0.0)));

  /* Kde bol tento bod scény v minulom snímku. Posun sa berie z najbližšej
     hĺbky, poloha je stále tento pixel. */
  vec4 k = uSpat * vec4(vUV * 2.0 - 1.0, hl * 2.0 - 1.0, 1.0);
  vec2 predUV = (k.xy / k.w) * 0.5 + 0.5;
  if (predUV.x < 0.0 || predUV.x > 1.0 || predUV.y < 0.0 || predUV.y > 1.0) {
    oFarba = vec4(akt, 1.0); return;
  }
  vec3 hist = doYCoCg(historia(predUV));

  /* Orezanie histórie do obalu aktuálneho okolia (variance clipping).
     Pri 1,0 sigma bol obal na hrane taký tesný, že história sa zahodila
     skoro celá a hrana ostala zrnitá ako jediný snímok. 1,25 je bežná
     hodnota; obal sa navyše nepustí za rozsah okolia (min/max), takže
     nevznikne svetlý ani tmavý lem. */
  vec3 lo = max(m1 - sigma * 1.25, mn), hi = min(m1 + sigma * 1.25, mx3);
  vec3 stred = 0.5 * (hi + lo), polo = 0.5 * (hi - lo) + 1e-4;
  vec3 v = hist - stred;
  vec3 a = abs(v / polo);
  float mx = max(a.x, max(a.y, a.z));
  if (mx > 1.0) hist = stred + v / mx;
  /* Catmull-Rom smie na hrane prestreliť; za rozsah okolia nie. */
  hist = clamp(hist, mn, mx3);

  /* Váha aktuálneho snímku. Desatina drží rebrá strechy pokojné; pri
     rýchlom pohybe sa zvýši, aby obraz neťahal. */
  float posunPx = length((predUV - vUV) * uRozmer);
  float alfa = mix(0.10, 0.28, clamp(posunPx / 24.0, 0.0, 1.0));
  vec3 c = mix(hist, doYCoCg(akt), alfa);
  oFarba = vec4(zYCoCg(c), 1.0);
}
`;

  /* ------------------------------------------------------------- POMOCNÍCI */

  function shader(gl, typ, zdroj) {
    const s = gl.createShader(typ);
    gl.shaderSource(s, zdroj);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader: ' + log);
    }
    return s;
  }

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error('program: ' + log);
    }
    /* Uniformy si vyhľadáme raz. `getUniformLocation` je v horúcej slučke
       prekvapivo drahý — pri šiestich priechodoch a dvadsiatich uniformoch
       to je stovka vyhľadaní na snímok. */
    p.u = new Proxy({}, {
      get(cache, meno) {
        if (!(meno in cache)) cache[meno] = gl.getUniformLocation(p, meno);
        return cache[meno];
      }
    });
    return p;
  }

  /* Farba z CSS reťazca do lineárneho priestoru. Všetky farby v geometrii sú
     v sRGB (tak ich zadal dizajnér aj výrobca), výpočet svetla musí bežať
     v lineárnom — inak sa dva zdroje svetla sčítajú nesprávne a scéna má
     vypláchnuté tiene. */
  const nalinearne = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  function rozlozFarbu(text) {
    let r = 0, g = 0, b = 0, a = 1;
    if (typeof text !== 'string') return [0.5, 0.5, 0.5, 1];
    if (text[0] === '#') {
      const h = text.length === 4
        ? text[1] + text[1] + text[2] + text[2] + text[3] + text[3]
        : text.slice(1, 7);
      const n = parseInt(h, 16);
      r = (n >> 16 & 255) / 255; g = (n >> 8 & 255) / 255; b = (n & 255) / 255;
    } else {
      const m = text.match(/[\d.]+/g);
      if (m) {
        r = (+m[0] || 0) / 255; g = (+m[1] || 0) / 255; b = (+m[2] || 0) / 255;
        if (m.length > 3) a = +m[3];
      }
    }
    return [nalinearne(r), nalinearne(g), nalinearne(b), a];
  }

  /* ------------------------------------------------------------ VYKRESĽOVAČ */

  function vytvor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,          /* MSAA si robíme sami vo vlastnom bufferi */
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      /* Zachovaná kresliaca pamäť: test aj export obrázka čítajú z plátna až
         po dokreslení snímku. Bez nej by dostali prázdno. Stojí to trochu
         pamäte navyše, nie výkon. */
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;
    if (!gl.getExtension('EXT_color_buffer_float')) return null;

    let programy;
    try {
      programy = {
        hlavny: program(gl, VS_HLAVNY, FS_HLAVNY),
        tien: program(gl, VS_TIEN, FS_TIEN),
        ssao: program(gl, VS_PLOCHA, FS_SSAO),
        rozostri: program(gl, VS_PLOCHA, FS_ROZOSTRI),
        pozadie: program(gl, VS_PLOCHA, FS_POZADIE),
        ziara: program(gl, VS_PLOCHA, FS_ZIARA),
        ton: program(gl, VS_PLOCHA, FS_TON),
        kopia: program(gl, VS_PLOCHA, FS_KOPIA),
        taa: program(gl, VS_PLOCHA, FS_TAA),
        dekoduj: program(gl, VS_PLOCHA, FS_DEKODUJ)
      };
    } catch (e) {
      if (global.console && console.warn) console.warn('kv-render3d:', e.message);
      return null;
    }

    const maxVzoriek = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    const TIEN_ROZMER = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));

    const stav = {
      gl, canvas, programy, maxVzoriek,
      sirka: 0, vyska: 0,
      siet: null,              /* { vao, buffer, pocetNepriehl, pocetPriehl } */
      obal: null,              /* hranice scény */
      ciele: null,             /* vyrovnávacie pamäte */
      tien: null,
      kamera: null,
      slnko: vec3.norm([-0.30, 0.42, 0.86]),
      svetloSlnka: [2.95, 2.90, 2.80],
      zamracene: 0,
      silaAO: 0.62,
      silaZiary: 0.55,
      /* Vinetácia sa na fotografii výrobku nerobí. Pri 0,24 ubrala v rohu
         záberu štrnásť percent jasu a zo svetlej steny štúdia bola sivá —
         práve to robilo z obrazu zašedený render namiesto fotky. Ostáva
         nepatrný zvyšok, ktorý usadí pohľad do stredu. */
      vineta: 0.06,
      /* Dve úrovne kvality. V pohybe ide o plynulosť: menej vzoriek tieňa,
         bez zatienenia v kútoch a bez žiary. Po zastavení sa scéna dokreslí
         naplno. Rozdiel v pohybe nie je vidieť, rozdiel v snímkoch áno. */
      kvalita: { tienVzoriek: 16, ssao: true, ziara: true },
      ladenie: 0,
      ladenieTon: 0,
      expozicia: 1.0,
      kontrast: 1.0,
      /* Doostrovanie: koľko posunutých snímok sa najviac zbiera. Nula alebo
         jedna znamená jeden snímok, teda správanie bez doostrovania. */
      /* Šestnásť: s Gaussovým filtrom (vzorkaFiltra) je to hrana bez
         viditeľných stupňov aj na monitore s hustotou 1. */
      maxDoostrenia: 16,
      /* Vratné kódovanie konštrukcie pred zlúčením MSAA (KODOVANIE).
         `false` vráti zlučovanie v lineárnom svetle — na porovnanie. */
      kodovanie: true,
      /* Časové vyhladzovanie v pohybe. `false` ho vypne (porovnanie, ladenie). */
      taa: true,
      taaPlatna: false,        /* či história zodpovedá tomuto plátnu a scéne */
      taaIndex: 0,             /* poradie posunu v pohybe, dookola po šestnástich */
      taaPredVP: null,         /* kamera minulého snímku bez posunu */
      taaAktualna: 0,          /* ktorá z dvoch histórií je najnovšia */
      taaZPohybu: false,       /* posledný snímok bol snímok pohybu */
      taaDoostrenie: false,    /* toto doostrenie nadväzuje na pohyb */
      prazdnyVAO: gl.createVertexArray()
    };

    /* --- geometria ---------------------------------------------------- */

    /* Plochy prídu ako polygóny vo svetových súradniciach. Rozložíme ich na
       trojuholníky vejárom — polygóny sú konvexné (vznikajú ako obdĺžniky
       a rezy rovinou), takže vejár stačí a je najlacnejší. */
    stav.nastavScenu = function (plochy, klasifikuj) {
      stav.tienPlatny = false;
      stav.taaPlatna = false;
      const g = stav.gl;
      let pocetVrcholov = 0;
      for (const f of plochy) if (f.w && f.w.length > 2) pocetVrcholov += (f.w.length - 2) * 3;
      if (!pocetVrcholov) { stav.siet = null; return; }

      const PLAVAKOV = 14;
      const data = new Float32Array(pocetVrcholov * PLAVAKOV);

      /* Nepriehľadné a priehľadné zvlášť: priehľadné sa musia kresliť
         po nepriehľadných a zozadu dopredu, inak sa sklo prekryje samo. */
      const nepriehl = [], priehl = [];
      for (const f of plochy) {
        if (!f.w || f.w.length < 3) continue;
        const farba = rozlozFarbu(f.sourceFill || f.fill);
        (farba[3] < 0.999 ? priehl : nepriehl).push({ f, farba });
      }
      priehl.sort((a, b) => b.f.depthAvg - a.f.depthAvg);

      /* Poradie, ktoré si geometria pýta, je poradie — nie vzdialenosť.
         Doteraz išlo na kartu tak, ako prišlo: čísla ako 50 000, ktoré po
         prenásobení krokom dali plechu takmer meter náskoku v hĺbke. Pri
         streche prístrešku to nebolo vidieť, ale skrutky na nej sa do toho
         metra stratili — na zábere z nich ostali kúsky, ktoré vyzerali ako
         zrno. Z rôznych čísel sa preto spraví rebríček a na kartu ide jeho
         stupeň. Jeden stupeň je pol milimetra hĺbky: dosť na to, aby dve
         plochy v jednej rovine nesúperili, a málo na to, aby detail
         predbehol niečo, čo je pred ním. */
      const stupne = new Map();
      for (const f of plochy) {
        if (!f.w || f.w.length < 3) continue;
        stupne.set((f.bias || 0), 0);
      }
      const kluce = [...stupne.keys()].sort((a, b) => a - b);
      kluce.forEach((k, i) => stupne.set(k, i));

      const hranice = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      const hraniceVrhacov = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      let at = 0;

      const zapis = (polozka) => {
        const { f, farba } = polozka;
        const w = f.w;
        const mat = klasifikuj ? klasifikuj(f) : MATERIALY.zakladny;
        /* Normála: ak ju geometria dodala, veríme jej — je presnejšia než
           dopočet z troch bodov, ktoré môžu byť po reze rovinou takmer
           kolineárne. */
        let n = f.normal;
        if (!n) {
          const a = w[0], b = w[1], c = w[2];
          const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          n = vec3.norm(vec3.cross(u, v));
        }
        for (let i = 1; i < w.length - 1; i++) {
          for (const p of [w[0], w[i], w[i + 1]]) {
            data[at] = p[0]; data[at + 1] = p[1]; data[at + 2] = p[2];
            data[at + 3] = n[0]; data[at + 4] = n[1]; data[at + 5] = n[2];
            const od = mat.odraz === undefined ? 1 : mat.odraz;
            data[at + 6] = farba[0] * od; data[at + 7] = farba[1] * od; data[at + 8] = farba[2] * od;
            data[at + 9] = mat.kov; data[at + 10] = mat.drsnost;
            /* Príznaky: 1 = podklad, 2 = jednostranná plocha. Sčítané. */
            data[at + 11] = farba[3];
            data[at + 12] = (f.bg ? 1 : 0) + (f.cull ? 2 : 0) + (mat.sklo ? 4 : 0);
            data[at + 13] = (stupne.get(f.bias || 0) || 0) + (mat.poradie || 0);
            at += PLAVAKOV;
            for (let k = 0; k < 3; k++) {
              if (p[k] < hranice[k]) hranice[k] = p[k];
              if (p[k] > hranice[k + 3]) hranice[k + 3] = p[k];
              if (!f.bg) {
                if (p[k] < hraniceVrhacov[k]) hraniceVrhacov[k] = p[k];
                if (p[k] > hraniceVrhacov[k + 3]) hraniceVrhacov[k + 3] = p[k];
              }
            }
          }
        }
      };

      /* Poradie v buffri: najprv nepriehľadní vrhači, potom nepriehľadný
         podklad, nakoniec priehľadné. Vďaka tomu vie tieňový priechod
         nakresliť prvý úsek jedným `drawArrays` bez ďalšieho buffra. */
      for (const p of nepriehl) if (!p.f.bg) zapis(p);
      const pocetVrhacov = at / PLAVAKOV;
      for (const p of nepriehl) if (p.f.bg) zapis(p);
      const deliaci = at / PLAVAKOV;
      for (const p of priehl) zapis(p);

      if (!stav.siet) {
        stav.siet = { vao: g.createVertexArray(), buffer: g.createBuffer(), kapacita: 0 };
      }
      const s = stav.siet;
      g.bindVertexArray(s.vao);
      g.bindBuffer(g.ARRAY_BUFFER, s.buffer);
      if (data.byteLength > s.kapacita) {
        g.bufferData(g.ARRAY_BUFFER, data, g.DYNAMIC_DRAW);
        s.kapacita = data.byteLength;
      } else {
        g.bufferSubData(g.ARRAY_BUFFER, 0, data);
      }
      const krok = PLAVAKOV * 4;
      g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, krok, 0);
      g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 3, g.FLOAT, false, krok, 12);
      g.enableVertexAttribArray(2); g.vertexAttribPointer(2, 3, g.FLOAT, false, krok, 24);
      g.enableVertexAttribArray(3); g.vertexAttribPointer(3, 4, g.FLOAT, false, krok, 36);
      g.enableVertexAttribArray(4); g.vertexAttribPointer(4, 1, g.FLOAT, false, krok, 52);
      g.bindVertexArray(null);

      s.pocetNepriehl = deliaci;
      s.pocetCelkom = at / PLAVAKOV;
      stav.obal = hranice;
      stav.obalVrhacov = Number.isFinite(hraniceVrhacov[0]) ? hraniceVrhacov : null;
      /* Do tieňovej mapy sa kreslia len vrhači. Podklad by do nej priniesol
         obrovskú plochu, ktorá tam nemá čo robiť, a v mieste dotyku stĺpa
         by so sebou súperil o hĺbku. */
      s.pocetVrhacov = pocetVrhacov;
    };

    /* --- kamera -------------------------------------------------------- */

    /* Kamera sa preberá presne z doterajšieho premietania, aby sa model
       usadil do záberu rovnako a všetka logika priblíženia a dosadenia
       ostala platná. `ox`/`oy` sú posun stredu obrazu, preto všeobecný
       zrezaný ihlan a nie symetrická matica. */
    stav.nastavKameru = function (k) {
      const { VW, VH, scale, ox, oy, DIST, target, smer } = k;
      const oko = vec3.add(target, vec3.mul(smer, DIST));

      /* Pohľadová matica sa neskladá cez `lookAt`, ale presne z tých osí,
         v ktorých premieta zvyšok konfigurátora.

         Dôvod je vážny: bežný `lookAt` má os doprava ako cross(hore, dozadu),
         čo je opačná strana, než akú používa doterajšie premietanie. Model sa
         tým zrkadlil — a na prístrešku, ktorý je skoro symetrický, to nie je
         na prvý pohľad vidieť. Vidieť to bolo až na aute: stálo na opačnej
         strane než v skutočnosti, rovnako box aj spád strechy. Osi preto
         vychádzajú z tých istých vzorcov ako `project`, ktorým merajú aj
         kontroly.

           doprava  ( cos az,  sin az, 0 )
           hore     ( sin az · sin el, −cos az · sin el, cos el )
           dozadu   (−sin az · cos el,  cos az · cos el, sin el )   = smer */
      const ce = Math.hypot(smer[0], smer[1]);          /* cos(el) */
      const se = smer[2];                                /* sin(el) */
      const ca = ce > 1e-9 ?  smer[1] / ce : 1;          /* cos(az) */
      const sa = ce > 1e-9 ? -smer[0] / ce : 0;          /* sin(az) */
      const doprava = [ca, sa, 0];
      const hore = [sa * se, -ca * se, ce];
      const dozadu = [smer[0], smer[1], smer[2]];
      const pohlad = new Float32Array([
        doprava[0], hore[0], dozadu[0], 0,
        doprava[1], hore[1], dozadu[1], 0,
        doprava[2], hore[2], dozadu[2], 0,
        -vec3.dot(doprava, oko), -vec3.dot(hore, oko), -vec3.dot(dozadu, oko), 1
      ]);

      /* Orezové roviny sa priložia tesne na scénu. Doterajších 2 % z
         vzdialenosti kamery dávalo pomer blízka : diaľka okolo 1 : 200 a pri
         takom rozsahu nezvládne ani 24-bitová hĺbka rozlíšiť dve strany
         plechu hrubého pol milimetra — na podhľade aj na streche z toho boli
         bodkované škvrny, kde si horná a spodná plocha vymieňali prvenstvo.
         Priložené roviny dajú pomer okolo 1 : 2 a súboj zmizne. */
      const o = stav.obal;
      const polomerScény = o
        ? Math.hypot(o[3] - o[0], o[4] - o[1], o[5] - o[2]) / 2
        : DIST * 0.5;
      const rezerva = Math.max(polomerScény * 1.25, DIST * 0.08);
      const near = Math.max(DIST - rezerva, DIST * 0.04, 1);
      const far = DIST + rezerva;
      const m = near / DIST;
      const l = (0 - ox) / scale * m;
      const r = (VW - ox) / scale * m;
      const t = (oy) / scale * m;
      const b = (oy - VH) / scale * m;

      const projekcia = mat4.frustum(l, r, b, t, near, far);
      stav.kamera = {
        oko, target, projekcia, pohlad,
        pohladProjekcia: mat4.mul(projekcia, pohlad),
        near, far, DIST
      };
    };

    /* Prepnutie kvality. `pohyb` znamená, že používateľ práve ťahá modelom,
       `stupen` 0 až 2 je to, koľko toho stroj unesie.

       Podstatné je, čo sa pri slabšom stroji uberá: výpočet, nie rozlíšenie.
       Doteraz si vykresľovač v pohybe sám zmenšoval plátno až na 0,4 —
       a práve to divák vidí ako kockovanie, lebo hrany profilu prestanú byť
       hrany. Počet vzoriek tieňa, zatienenie v kútoch a žiara sú pritom veci,
       ktoré pri otáčaní nikto nerozozná. Kreslí sa preto vždy v plných
       pixeloch displeja a šetrí sa na tom, čo nevidieť. */
    stav.nastavKvalitu = function (pohyb, stupen) {
      const st = Math.max(0, Math.min(2, stupen === undefined ? 2 : stupen | 0));
      /* V pohybe a v pokoji musí byť obraz ten istý.

         Doteraz sa počas ťahania vypínalo zatienenie v kútoch, žiara aj
         kresba dlažby. Každá z nich mení tón celého záberu, takže po pustení
         myši obraz zmenil farbu a divák to videl ako skok. To je horšie než
         pár snímok navyše: kto model otáča, porovnáva tvar, a keď sa mu pod
         rukou mení aj farba, nevie, čo vlastne vidí.

         Zostáva preto jediný rozdiel, ktorý farbu nemení — počet vzoriek
         tieňa. Ten rozhoduje o mäkkosti okraja tieňa, nie o jase plochy,
         a pri otáčaní ho oko nestihne prečítať. Rozlíšenie sa neuberá nikdy. */
      stav.kvalita = {
        tienVzoriek: pohyb ? (st === 0 ? 6 : 8) : (st === 0 ? 12 : 16),
        ssao: true, ziara: true, podkladDetail: true, stupen: st, pohyb: Boolean(pohyb),
        vzoriek: stav.maxVzoriek
      };
    };

    /* Koľko svetla vráti zem. Je to odrazivosť podkladu krát to, čo naň
       dopadne — priame slnko podľa jeho výšky plus obloha — delené π, lebo
       ide o jas, nie o ožiarenie. Súčiniteľ na konci je za viacnásobný
       odraz, ktorý sa inak nepočíta. */
    /* Tri smery oblohy pre rozptýlené svetlo — hore, do boku, dole.
       Počítajú sa tými istými číslami, aké má shader, len raz za snímok
       namiesto raz za pixel. Bok je pri dvadsiatich stupňoch nad horizontom:
       tam smeruje priemer pologule, ktorú vidí zvislá stena. */
    stav.ozarenieSmery = function () {
      const z = stav.zamracene > 0.5 ? 1 : stav.zamracene;
      const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const zenit = mix3(NEBO.zenitJasno, NEBO.zenitZamrac, z);
      const horiz = mix3(NEBO.horizJasno, NEBO.horizZamrac, z);
      /* t = pow(dir.z, 0.42) pre dir.z = 0,2148, teda smer (1, 0, 0,22) */
      const tBok = Math.pow(0.21478, 0.42);
      return {
        hore: new Float32Array(zenit),
        bok: new Float32Array(mix3(horiz, zenit, tBok)),
        dole: stav.odrazZeme()
      };
    };

    stav.odrazZeme = function () {
      const s = stav.slnko, i = stav.svetloSlnka, z = Math.max(0, s[2]);
      const obloha = stav.zamracene > 0.5 ? 0.62 : 0.42;
      const odrazivost = stav.odrazivostPodkladu || [0.34, 0.33, 0.31];
      /* Podhľad strechy je celý v tieni a svieti ho len to, čo sa odrazí
         od zeme. Jeden odraz je málo: svetlo sa medzi dlažbou, autom a
         podhľadom odrazí viackrát, a práve preto je pod skutočným
         prístreškom vidieť tvar profilu, nie čierna diera. Kým bol
         súčiniteľ 1,35, vychádzali kanály vlny na podhľade tmavé a plech
         medzi väznicami vyzeral, akoby tam chýbal. */
      const k = (x, j) => odrazivost[j] * (x * z + obloha) / Math.PI * 2.00;
      return new Float32Array([k(i[0], 0), k(i[1], 1), k(i[2], 2)]);
    };

    stav.nastavSvetlo = function (s) {
      if (s.odrazivostPodkladu) stav.odrazivostPodkladu = s.odrazivostPodkladu;
      if (s.slnko) {
        const novy = vec3.norm(s.slnko);
        if (Math.abs(novy[0] - stav.slnko[0]) + Math.abs(novy[1] - stav.slnko[1])
          + Math.abs(novy[2] - stav.slnko[2]) > 1e-6) stav.tienPlatny = false;
        stav.slnko = novy;
      }
      if (s.zamracene !== undefined) {
        if (s.zamracene !== stav.zamracene) stav.tienPlatny = false;
        stav.zamracene = s.zamracene;
      }
      if (s.svetloSlnka) stav.svetloSlnka = s.svetloSlnka;
    };

    /* --- vyrovnávacie pamäte ------------------------------------------- */

    function textura(w, h, format, typ, filter) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0,
        format === gl.RGBA16F ? gl.RGBA : (format === gl.DEPTH_COMPONENT24 ? gl.DEPTH_COMPONENT : gl.RGBA),
        typ, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    function pripravCiele(w, h) {
      const vzoriek = Math.max(1, Math.min(stav.maxVzoriek,
        (stav.kvalita && stav.kvalita.vzoriek) || stav.maxVzoriek));
      const c = stav.ciele;
      if (c && c.w === w && c.h === h && c.vzoriek === vzoriek) return c;
      if (c) zrus(c);
      const msaa = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
      const farbaRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, farbaRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, vzoriek, gl.RGBA16F, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, farbaRB);
      const normRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, normRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, vzoriek, gl.RGBA8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.RENDERBUFFER, normRB);
      const hlbkaRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, hlbkaRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, vzoriek, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, hlbkaRB);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

      const rozlisFB = gl.createFramebuffer();
      const farbaT = textura(w, h, gl.RGBA16F, gl.HALF_FLOAT);
      const normT = textura(w, h, gl.RGBA8, gl.UNSIGNED_BYTE);
      const hlbkaT = textura(w, h, gl.DEPTH_COMPONENT24, gl.UNSIGNED_INT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rozlisFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, farbaT, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normT, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, hlbkaT, 0);

      const aw = Math.max(1, w >> 1), ah = Math.max(1, h >> 1);
      const aoFB = gl.createFramebuffer(), aoT = textura(aw, ah, gl.RGBA8, gl.UNSIGNED_BYTE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, aoFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, aoT, 0);
      const ao2FB = gl.createFramebuffer(), ao2T = textura(aw, ah, gl.RGBA8, gl.UNSIGNED_BYTE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ao2FB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ao2T, 0);

      const zw = Math.max(1, w >> 2), zh = Math.max(1, h >> 2);
      const ziaraFB = gl.createFramebuffer(), ziaraT = textura(zw, zh, gl.RGBA16F, gl.HALF_FLOAT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ziaraFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ziaraT, 0);

      /* Zbierka doostrenia. Sčítavajú sa do nej hotové snímky toho istého
         pohľadu, každý posunutý o zlomok pixela. Šestnásťbitové plávajúce
         čísla preto, že priemer dvanástich snímok sa v ôsmich bitoch
         zaokrúhli na pásy. */
      const zbierFB = gl.createFramebuffer(), zbierT = textura(w, h, gl.RGBA16F, gl.HALF_FLOAT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, zbierFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, zbierT, 0);

      /* Dve histórie časového vyhladzovania: z jednej sa číta minulý
         snímok, do druhej sa píše nový, a potom si úlohy vymenia. */
      const histFB = [], histT = [];
      for (let i = 0; i < 2; i++) {
        histFB.push(gl.createFramebuffer());
        histT.push(textura(w, h, gl.RGBA16F, gl.HALF_FLOAT));
        gl.bindFramebuffer(gl.FRAMEBUFFER, histFB[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, histT[i], 0);
      }
      stav.taaPlatna = false;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return (stav.ciele = {
        w, h, vzoriek, aw, ah, zw, zh,
        msaa, farbaRB, normRB, hlbkaRB,
        rozlisFB, farbaT, normT, hlbkaT,
        aoFB, aoT, ao2FB, ao2T, ziaraFB, ziaraT, zbierFB, zbierT, histFB, histT
      });
    }

    function zrus(c) {
      for (const k of ['msaa', 'rozlisFB', 'aoFB', 'ao2FB', 'ziaraFB', 'zbierFB']) if (c[k]) gl.deleteFramebuffer(c[k]);
      for (const k of ['farbaRB', 'normRB', 'hlbkaRB']) if (c[k]) gl.deleteRenderbuffer(c[k]);
      for (const k of ['farbaT', 'normT', 'hlbkaT', 'aoT', 'ao2T', 'ziaraT', 'zbierT']) if (c[k]) gl.deleteTexture(c[k]);
      for (const fb of c.histFB || []) gl.deleteFramebuffer(fb);
      for (const t of c.histT || []) gl.deleteTexture(t);
    }

    function pripravTien() {
      /* Rozmer mapy sa riadi tým, čo stroj unesie. Mapa sa prekresľuje len
         pri zmene modelu alebo slnka, ale práve vtedy je najdrahšia: dvadsať
         tisíc trojuholníkov cez celú jej plochu. Na slabšom stroji stačí
         polovičná — okraj tieňa je o vlások hrubší a nikto si to pri ťahaní
         posuvníka nevšimne. */
      /* Podľa stupňa stroja, nie podľa pohybu: prepnutie rozmeru znamená
         prekresliť celú mapu, a to práve v okamihu, keď sa model pohne
         alebo zastaví — divák to videl ako trhnutie a skok ostrosti tieňa. */
      const chcem = stav.kvalita && stav.kvalita.stupen === 0
        ? Math.min(1024, TIEN_ROZMER) : TIEN_ROZMER;
      if (stav.tien && stav.tien.rozmer !== chcem) {
        gl.deleteFramebuffer(stav.tien.fb);
        gl.deleteTexture(stav.tien.t);
        stav.tien = null;
        stav.tienPlatny = false;
      }
      if (stav.tien) return stav.tien;
      const fb = gl.createFramebuffer();
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, chcem, chcem, 0,
        gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      /* NEAREST, nie LINEAR. Hĺbková textúra v tomto formáte nie je vo WebGL2
         filtrovateľná bez porovnávacieho vzorkovača — s LINEAR je textúra
         neúplná a čítanie z nej vráti nulu. Na obraze to znamená, že celá
         scéna je „za niečím", teda celá v tieni. Mäkkosť okraja aj tak robí
         šestnásť pootočených vzoriek, nie filtrovanie. */
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return (stav.tien = { fb, t, rozmer: chcem });
    }

    /* Matica slnka. Ortografický pohľad presne na obal scény — keby bol
       väčší, tieňová mapa by plytvala rozlíšením na prázdno a okraj tieňa
       by bol hranatý. */
    function slnkoMatica() {
      /* Obal vrhačov, nie celej scény. Dlažba je stokrát väčšia než
         prístrešok a keby určovala rozmer tieňovej mapy, na stĺp by pripadli
         dva texely a jeho tieň by bol schodovitý. Dlažba tieň nevrhá, iba ho
         prijíma — a čo padne mimo mapy, je aj tak na slnku. */
      const o = stav.obalVrhacov || stav.obal;
      if (!o) return mat4.identity();
      const stred = [(o[0] + o[3]) / 2, (o[1] + o[4]) / 2, (o[2] + o[5]) / 2];
      const polomer = Math.hypot(o[3] - o[0], o[4] - o[1], o[5] - o[2]) / 2 * 1.06;
      stav.tienPolomer = polomer;
      const oko = vec3.add(stred, vec3.mul(stav.slnko, polomer * 2.4));
      const pohlad = mat4.lookAt(oko, stred, Math.abs(stav.slnko[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1]);
      const proj = mat4.ortho(-polomer, polomer, -polomer, polomer, polomer * 0.2, polomer * 4.8);
      return mat4.mul(proj, pohlad);
    }

    /* --- kreslenie ------------------------------------------------------ */

    /* Haltonova postupnosť. Dvanásť bodov v štvorci pixela, rozložených tak,
       že žiadne dva nie sú blízko pri sebe — na rozdiel od náhodných čísel,
       ktoré sa zhlukujú a nechajú v pixeli diery. Základy 2 a 3 sú tá istá
       dvojica, akú používa každý renderer s progresívnym doostrovaním. */
    function halton(index, zaklad) {
      let v = 0, f = 1 / zaklad, i = index;
      while (i > 0) { v += (i % zaklad) * f; i = Math.floor(i / zaklad); f /= zaklad; }
      return v;
    }

    /* Kamera pre jeden snímok doostrovania. Celý obraz sa posunie o zlomok
       pixela — a keďže sa snímky spriemerujú, výsledok je taký, ako keby sa
       každý pixel vzorkoval na dvanástich miestach namiesto štyroch.

       Práve to je liek na to, čo na prístrešku najviac bilo do očí: vlna
       trapézového plechu má na obrazovke pri bežnom zábere menej než pixel
       na rebro. Štyri vzorky MSAA z nej nespravia hladký tón, ale bodky —
       raz sa trafí vrch rebra, raz jeho tmavý bok. Rovnaký problém má
       lemovanie, skrutky aj vzdialené mreže. */
    /* Posun a váha vzorky doostrenia v pokoji — rekonštrukčný filter.

       Doteraz mala každá z dvanástich vzoriek rovnakú váhu a ležala v tom
       istom pixeli: to je filter v tvare štvorca, ostrý ako pixel sám. Hrana
       z neho vyjde presne, ale so schodmi, ktoré oko pri tenkom profile na
       svetlom pozadí číta ako rastrovanie. Offline renderery (Cycles,
       Arnold, V-Ray) preto skladajú vzorky Gaussovým filtrom širokým
       jeden a pol pixela: vzorky siahajú kúsok do susedov a čím ďalej od
       stredu, tým menej vážia. Hrana je potom plynulá ako na fotografii
       a plocha ostáva ostrá — jej farba sa od suseda nelíši. */
    const FILTER_POLOMER = 0.85;   /* px, kam siahajú vzorky */
    const FILTER_SIGMA = 0.42;     /* px, šírka Gaussovho zvona */
    function vzorkaFiltra(n) {
      if (!n) return { dx: 0, dy: 0, vaha: 1 };
      const dx = (halton(n + 1, 2) - 0.5) * 2 * FILTER_POLOMER;
      const dy = (halton(n + 1, 3) - 0.5) * 2 * FILTER_POLOMER;
      return { dx, dy, vaha: Math.exp(-(dx * dx + dy * dy) / (2 * FILTER_SIGMA * FILTER_SIGMA)) };
    }

    /* Kamera posunutá o (dxPx, dyPx) pixelov. */
    function posunutaKamera(k, dxPx, dyPx, sirka, vyska) {
      if (!dxPx && !dyPx) return k;
      const dx = dxPx * 2 / sirka;
      const dy = dyPx * 2 / vyska;
      const pr = new Float32Array(k.projekcia);
      pr[8] += dx;
      pr[9] += dy;
      return {
        oko: k.oko, target: k.target, projekcia: pr, pohlad: k.pohlad,
        pohladProjekcia: mat4.mul(pr, k.pohlad),
        near: k.near, far: k.far, DIST: k.DIST
      };
    }

    function plocha(p, nastav) {
      gl.useProgram(p);
      if (nastav) nastav();
      gl.bindVertexArray(stav.prazdnyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* `vzorka` je poradie snímku doostrovania. Nula je prvý — ten scénu
       nakreslí tak, ako ju vidí kamera, a zbierku ním prepíše. Každý ďalší
       pridá do priemeru jeden posunutý snímok. */
    stav.kresli = function (sirka, vyska, vzorka) {
      const s = stav.siet;
      if (!s || !stav.kamera) return false;
      const c = pripravCiele(sirka, vyska);
      const n = Math.max(0, vzorka | 0);
      const pohyb = Boolean(stav.kvalita && stav.kvalita.pohyb);
      /* Časové vyhladzovanie beží v pohybe a v prvých snímkoch pokoja. Tie
         majú v zbierke len pár vzoriek — menej, než už nazbierala história
         z pohybu —, takže by sa po pustení obraz na okamih zhoršil. Od
         ôsmej vzorky je zbierka rovnako hladká a presnejšia, ide na
         plátno ona. */
      /* V pokoji len hneď po pustení otáčania. Keď sa v pokoji zmení scéna
         bez pohybu kamery — pribudne auto, zmení sa farba —, história ju
         nepozná a nové auto by v nej na slabom stroji ostalo priesvitné.
         Taký snímok ide po starom cez zbierku a história sa zahodí. */
      if (pohyb) stav.taaZPohybu = true;
      else if (n === 0) {
        stav.taaDoostrenie = Boolean(stav.taaZPohybu && stav.taaPlatna);
        stav.taaZPohybu = false;
      }
      const taa = stav.taa !== false && (pohyb || (n < 8 && stav.taaDoostrenie));
      if (!taa && !pohyb && n === 0) stav.taaPlatna = false;
      /* V pohybe je každý snímok posunutý o iný zlomok pixela — z toho
         časové vyhladzovanie skladá vzorky. V pokoji posun určuje poradie
         vzorky doostrovania ako doteraz. */
      let posunX = 0, posunY = 0, vahaVzorky = 1;
      if (pohyb && stav.taa !== false) {
        /* Šestnásť posunov: pri ôsmich ostávali v pixeli miesta, kam
           žiadna vzorka nepadla, a šikmá hrana v pohybe jemne pulzovala. */
        const i = 2 + (stav.taaIndex++ % 16);
        posunX = halton(i, 2) - 0.5;
        posunY = halton(i, 3) - 0.5;
      } else if (!pohyb) {
        const v = vzorkaFiltra(n);
        posunX = v.dx; posunY = v.dy; vahaVzorky = v.vaha;
      }
      const kam = posunutaKamera(stav.kamera, posunX, posunY, sirka, vyska);
      const t = pripravTien();
      if (!stav.tienPolomer) slnkoMatica();
      const sm = slnkoMatica();
      /* Svetová veľkosť jedného texela tieňovej mapy — z nej vychádza posun
         po normále. Dva a pol texela stačia aj na plochu skoro rovnobežnú
         so slnkom a pritom neodlepia tieň od päty stĺpa. */
      stav.posunPoNormale = stav.tienPolomer ? (2.0 * stav.tienPolomer / t.rozmer) * 2.5 : 4;

      /* --- 1 · tieňová mapa -------------------------------------------- */
      /* Kreslí sa len vtedy, keď sa zmenila geometria alebo slnko. Pri
         otáčaní sa nemení ani jedno, takže by z nej vyšla tá istá mapa —
         a pritom je to najdrahší priechod celého snímku: dvadsaťštyri tisíc
         trojuholníkov a plocha dva tisíc krát dva tisíc pixelov. Za jedno
         ťahanie je to zopár stoviek zbytočných priechodov. */
      if (!stav.tienPlatny) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.rozmer, t.rozmer);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      /* Žiadne orezávanie stien: geometria prístrešku nemá dôsledné
         navinutie — sú v nej obojstranné plechy hrúbky pol milimetra aj
         kusy vzniknuté rezom rovinou. Orezanie by z tieňovej mapy vymazalo
         polovicu strechy. Posun proti samotieneniu rieši normála v shaderi. */
      gl.disable(gl.CULL_FACE);
      gl.useProgram(stav.programy.tien);
      gl.uniformMatrix4fv(stav.programy.tien.u.uSlnkoMatica, false, sm);
      gl.uniform1f(stav.programy.tien.u.uPosunPoNormale, 0);
      gl.bindVertexArray(s.vao);
      gl.drawArrays(gl.TRIANGLES, 0, s.pocetVrhacov);
      gl.disable(gl.CULL_FACE);
      stav.tienPlatny = true;
      stav.tienMatica = sm;
      }

      /* --- 2 · hlavný priechod ----------------------------------------- */
      /* `aktivne` povie vykresľovač vybavenia: keď v scéne nie je auto ani
         dážď, nemá čo kresliť a konštrukcia sa nemusí dekódovať uprostred
         snímku. Keď to nepovie, počíta sa s tým, že kreslí. */
      const navyse = Boolean(stav.kresliNavyse) && stav.kresliNavyse.aktivne !== false;
      const priehladne = s.pocetCelkom > s.pocetNepriehl;
      /* Len v pokoji. V pohybe skladá hranu časové vyhladzovanie zo
         snímok posunutých o zlomok pixela; kódované zlúčenie tam zväčšilo
         rozdiel medzi snímkami na hrane a TAA ho nestihlo zahladiť — hrana
         stĺpa pri otáčaní zrnila. Pri pustení sa oba spôsoby prelínajú
         cez históriu TAA, takže nevznikne skok. */
      const kodovat = stav.kodovanie !== false && !pohyb;
      let kodovane = kodovat;
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.msaa);
      gl.viewport(0, 0, sirka, vyska);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      /* Obloha ide prvá a bez zápisu do hĺbky — je nekonečne ďaleko. */
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      plocha(stav.programy.pozadie, () => {
        const p = stav.programy.pozadie;
        gl.uniformMatrix4fv(p.u.uInvPohladProjekcia, false, invertuj(kam.pohladProjekcia));
        gl.uniform3fv(p.u.uOko, kam.oko);
        gl.uniform3fv(p.u.uSlnko, stav.slnko);
        gl.uniform1f(p.u.uZamracene, stav.zamracene);
        gl.uniform3fv(p.u.uOdrazZeme, stav.odrazZeme());
        gl.uniform1f(p.u.uPozadie, 1);
        gl.uniform1f(p.u.uKodovat, kodovat ? 1 : 0);
      });
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      const P = stav.programy.hlavny;
      gl.useProgram(P);
      gl.uniformMatrix4fv(P.u.uPohladProjekcia, false, kam.pohladProjekcia);
      gl.uniformMatrix4fv(P.u.uSlnkoMatica, false, sm);
      gl.uniform3fv(P.u.uOko, kam.oko);
      gl.uniform3fv(P.u.uSlnko, stav.slnko);
      gl.uniform3fv(P.u.uSvetloSlnka, stav.svetloSlnka);
      gl.uniform1f(P.u.uZamracene, stav.zamracene);
      gl.uniform3fv(P.u.uOdrazZeme, stav.odrazZeme());
      gl.uniform1f(P.u.uPozadie, 0);
      gl.uniform1f(P.u.uKodovat, kodovat ? 1 : 0);
      gl.uniform1i(P.u.uLadenie, stav.ladenie | 0);
      gl.uniform2f(P.u.uTienKrok, 2.2 / t.rozmer, 2.2 / t.rozmer);
      gl.uniform1f(P.u.uPosunPoNormale, stav.posunPoNormale);
      /* Náskok je v hĺbke po orezaní. Roviny sú priložené tesne na scénu, tak
         stačí zlomok promile — dosť na to, aby lemovanie vyhralo nad plechom,
         a málo na to, aby čokoľvek preplávalo cez susedný diel. */
      /* Jeden stupeň poradia. Musí byť menší než najtesnejšia skutočná
         vôľa v modeli, inak ju prekročí a rozhodne proti geometrii: rameno
         lemovania má nad hrebeňom vlny pol milimetra a pri kroku 0,46 mm
         začal plech cez rameno presvitať ako rad bielych zúbkov. Šesť
         milióntin je sedem stotín milimetra — dosť na rozsúdenie dvoch
         plôch v jednej rovine a dvadsaťkrát menej, než je tá vôľa. */
      gl.uniform1f(P.u.uKrokPoradia, 6.0e-6);

      gl.uniform1i(P.u.uTienVzoriek, stav.kvalita.tienVzoriek);
      gl.uniform1f(P.u.uSnimok, n);
      const oz = stav.ozarenieSmery();
      gl.uniform3fv(P.u.uOzarHore, oz.hore);
      gl.uniform3fv(P.u.uOzarBok, oz.bok);
      gl.uniform3fv(P.u.uOzarDole, oz.dole);
      gl.uniform1f(P.u.uPodkladDetail, stav.kvalita.podkladDetail === false ? 0 : 1);
      gl.uniform1f(P.u.uPodkladSkryt, stav.kresliPodklad === false ? 1 : 0);
      gl.uniform1f(P.u.uOrezavat, stav.orezavat === false ? 0 : 1);
      {
        const o = stav.obal || [0, 0, 0, 1, 1, 1];
        gl.uniform3f(P.u.uStred, (o[0] + o[3]) / 2, (o[1] + o[4]) / 2, (o[2] + o[5]) / 2);
        const ov = stav.obalVrhacov || o;
        /* Dosah, na ktorom sa podklad stratí: štvornásobok konštrukcie. Bližšie
           by sa dlažba končila v zábere, ďalej by sa švík vrátil. */
        gl.uniform1f(P.u.uDosah, Math.hypot(ov[3] - ov[0], ov[4] - ov[1]) * 2.6);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.t);
      gl.uniform1i(P.u.uTienMapa, 0);
      if (!stav.tienVzorkovac) {
        const v = gl.createSampler();
        gl.samplerParameteri(v, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.samplerParameteri(v, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        gl.samplerParameteri(v, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.samplerParameteri(v, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.samplerParameteri(v, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.samplerParameteri(v, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        stav.tienVzorkovac = v;
      }
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, t.t);
      gl.bindSampler(3, stav.tienVzorkovac);
      gl.uniform1i(P.u.uTienPorov, 3);
      gl.activeTexture(gl.TEXTURE0);

      gl.bindVertexArray(s.vao);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.drawArrays(gl.TRIANGLES, 0, s.pocetNepriehl);

      /* Konštrukcia je nakreslená zakódovaná. Ak sa na ňu bude ešte niečo
         miešať — autá s dopadovým tieňom, sklo, dážď —, zlúči sa a dekóduje
         späť do lineárneho svetla hneď teraz; to ostatné sa potom mieša
         presne ako doteraz. Bez nich ostane zakódovaná až do tónovania. */
      if (kodovane && (navyse || priehladne)) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, c.msaa);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, c.rozlisFB);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
        gl.blitFramebuffer(0, 0, sirka, vyska, 0, 0, sirka, vyska, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, c.msaa);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        plocha(stav.programy.dekoduj, () => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.farbaT);
          gl.uniform1i(stav.programy.dekoduj.u.uZdroj, 0);
        });
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        /* Späť stav hlavného priechodu: jednotka 0 nesie tieňovú mapu. */
        gl.useProgram(P);
        gl.uniform1f(P.u.uKodovat, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, t.t);
        gl.bindVertexArray(s.vao);
        kodovane = false;
      }

      /* Sem sa vojde to, čo do scény patrí, ale nie je konštrukcia: autá,
         posedenie, dopadový tieň. Kreslí sa do tej istej vyrovnávacej pamäte,
         takže má rovnaké vyhladzovanie aj rovnakú hĺbku ako prístrešok. */
      if (navyse) {
        /* Cudzí vykresľovač píše len farbu, nie normály. Kým kreslí, druhý
           výstup sa musí odpojiť — inak WebGL2 kresbu odmietne s tým, že
           aktívnemu výstupu chýba zodpovedajúci výstup shadera. Jeho pixely
           preto ostanú v mape normál označené ako „bez normály" a zatienenie
           ich preskočí; vlastný dopadový tieň si kreslí sám. */
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
        gl.bindVertexArray(null);
        stav.kresliNavyse('nepriehladne', gl, kam);
        /* Mapa normál pod autom by inak držala stĺp alebo dlažbu za ním
           a zatienenie by ich obrys nakreslilo na karosériu. Vykresľovač
           vybavenia tu tie isté plochy zapíše len do druhého výstupu ako
           „bez normály“ (scene-life.js, drawNormalMask). */
        gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
        stav.kresliNavyse('normaly', gl, kam);
        gl.depthFunc(gl.LEQUAL);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.useProgram(P);
        gl.bindVertexArray(s.vao);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      if (priehladne) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, s.pocetNepriehl, s.pocetCelkom - s.pocetNepriehl);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      /* Dážď, odtekajúca voda a všetko priesvitné ide až po skle. */
      if (navyse) {
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
        gl.bindVertexArray(null);
        stav.kresliNavyse('priehladne', gl, kam);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }

      /* Porovnávací vzorkovač patrí len konštrukcii; ďalšie prechody
         s jednotkou 3 nerátajú. */
      gl.bindSampler(3, null);

      /* --- 3 · rozlíšenie MSAA ----------------------------------------- */
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, c.msaa);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, c.rozlisFB);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
      gl.blitFramebuffer(0, 0, sirka, vyska, 0, 0, sirka, vyska, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
      gl.blitFramebuffer(0, 0, sirka, vyska, 0, 0, sirka, vyska, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.blitFramebuffer(0, 0, sirka, vyska, 0, 0, sirka, vyska, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.rozlisFB);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

      gl.disable(gl.DEPTH_TEST);

      /* --- 4 · SSAO ----------------------------------------------------- */
      if (!stav.kvalita.ssao) {
        /* Bez zatienenia sa jeho vyrovnávacia pamäť len vyplní bielou —
           tónovací priechod z nej potom nič neuberie. */
        gl.bindFramebuffer(gl.FRAMEBUFFER, c.aoFB);
        gl.viewport(0, 0, c.aw, c.ah);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.clearColor(0, 0, 0, 0);
      } else {
      const ov = stav.obalVrhacov || stav.obal;
      const rozmerScény = ov
        ? Math.hypot(ov[3] - ov[0], ov[4] - ov[1], ov[5] - ov[2])
        : 1000;
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.aoFB);
      gl.viewport(0, 0, c.aw, c.ah);
      plocha(stav.programy.ssao, () => {
        const p = stav.programy.ssao;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.hlbkaT);
        gl.uniform1i(p.u.uHlbka, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.normT);
        gl.uniform1i(p.u.uNorm, 1);
        gl.uniformMatrix4fv(p.u.uProjekcia, false, kam.projekcia);
        gl.uniformMatrix4fv(p.u.uProjekciaInv, false, invertuj(kam.projekcia));
        gl.uniform2f(p.u.uRozmer, c.aw, c.ah);
        gl.uniform1f(p.u.uPolomer, rozmerScény * 0.016);
        /* Dosah sa počíta od kamery a je to vzdialenosť ku stavbe plus jej
           veľkosť. Za ňou už zatienenie nemá čo hľadať: sú tam len rovné
           plochy bez kútov a jediné, čo by pridalo, je blokový šum — presne
           ten pás pri horizonte, ktorý sa na zábere ukázal. */
        gl.uniform1f(p.u.uDosahAO, kam.DIST + rozmerScény * 0.55);
      });
      }

      /* --- 5 · rozostrenie AO ------------------------------------------ */
      if (stav.kvalita.ssao) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, c.ao2FB);
        plocha(stav.programy.rozostri, () => {
          const p = stav.programy.rozostri;
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.aoT);
          gl.uniform1i(p.u.uZdroj, 0);
          gl.uniform2f(p.u.uSmer, 1 / c.aw, 0);
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, c.aoFB);
        plocha(stav.programy.rozostri, () => {
          const p = stav.programy.rozostri;
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.ao2T);
          gl.uniform1i(p.u.uZdroj, 0);
          gl.uniform2f(p.u.uSmer, 0, 1 / c.ah);
        });
      }

      /* --- 6 · žiara ---------------------------------------------------- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.ziaraFB);
      gl.viewport(0, 0, c.zw, c.zh);
      if (!stav.kvalita.ziara) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      else plocha(stav.programy.ziara, () => {
        const p = stav.programy.ziara;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.farbaT);
        gl.uniform1i(p.u.uZdroj, 0);
        gl.uniform2f(p.u.uKrok, 1 / c.zw, 1 / c.zh);
        gl.uniform1f(p.u.uPrah, 1.0);
        gl.uniform1f(p.u.uKodovane, kodovane ? 1 : 0);
      });

      /* --- 7 · tónovanie do zbierky ------------------------------------- */
      /* Snímky sa priemerujú až po tónovaní, nie pred ním. Je to zámer:
         priemer jasov pred filmovou krivkou dá z jednej prepálenej vzorky
         svetlú bodku cez celý pixel, priemer hotových farieb nie. Tú istú
         vec robí každý renderer, ktorý vyhladzuje v čase. */
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.zbierFB);
      gl.viewport(0, 0, sirka, vyska);
      if (n > 0) {
        /* Vážený priemer: nový snímok dostane podiel svojej váhy na súčte
           všetkých doterajších, zvyšok ostane doterajšiemu priemeru. Pri
           rovnakých váhach je to presne 1/(n+1), ako bolo. */
        stav.vahaZbierky = (stav.vahaZbierky || 1) + vahaVzorky;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
        gl.blendColor(0, 0, 0, vahaVzorky / stav.vahaZbierky);
      } else {
        stav.vahaZbierky = 1;
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      plocha(stav.programy.ton, () => {
        const p = stav.programy.ton;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.farbaT);
        gl.uniform1i(p.u.uScena, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.aoT);
        gl.uniform1i(p.u.uAO, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, c.ziaraT);
        gl.uniform1i(p.u.uZiara, 2);
        gl.uniform1f(p.u.uSilaAO, stav.silaAO);
        gl.uniform1f(p.u.uKodovane, kodovane ? 1 : 0);
        gl.uniform1f(p.u.uSilaZiary, stav.silaZiary);
        gl.uniform1f(p.u.uVineta, stav.vineta);
        gl.uniform1f(p.u.uExpozicia, stav.expozicia);
        gl.uniform1f(p.u.uKontrast, stav.kontrast);
        gl.uniform1i(p.u.uLadenieTon, stav.ladenieTon | 0);
      });
      gl.disable(gl.BLEND);

      /* --- 8 · časové vyhladzovanie -------------------------------------- */
      let vystup = c.zbierT;
      let fxaa = pohyb;
      if (taa) {
        const platna = stav.taaPlatna && stav.taaPredVP;
        const citaj = stav.taaAktualna, pis = 1 - citaj;
        gl.bindFramebuffer(gl.FRAMEBUFFER, c.histFB[pis]);
        gl.viewport(0, 0, sirka, vyska);
        plocha(stav.programy.taa, () => {
          const p = stav.programy.taa;
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.zbierT);
          gl.uniform1i(p.u.uAktualny, 0);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.histT[citaj]);
          gl.uniform1i(p.u.uHistoria, 1);
          gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, c.hlbkaT);
          gl.uniform1i(p.u.uHlbka, 2);
          gl.uniformMatrix4fv(p.u.uSpat, false,
            platna ? mat4.mul(stav.taaPredVP, invertuj(kam.pohladProjekcia)) : mat4.identity());
          gl.uniform2f(p.u.uTexel, 1 / sirka, 1 / vyska);
          gl.uniform2f(p.u.uRozmer, sirka, vyska);
          gl.uniform1f(p.u.uHistoriaPlatna, platna ? 1 : 0);
        });
        stav.taaAktualna = pis;
        stav.taaPredVP = stav.kamera.pohladProjekcia;
        stav.taaPlatna = true;
        vystup = c.histT[pis];
        /* FXAA len na prvom snímku, keď ešte niet histórie. */
        fxaa = pohyb && !platna;
      }

      /* --- 9 · na plátno ------------------------------------------------ */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, sirka, vyska);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      plocha(stav.programy.kopia, () => {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vystup);
        gl.uniform1i(stav.programy.kopia.u.uZdroj, 0);
        gl.uniform2f(stav.programy.kopia.u.uTexel, 1 / sirka, 1 / vyska);
        gl.uniform1f(stav.programy.kopia.u.uFxaa, fxaa ? 1 : 0);
      });

      gl.bindVertexArray(null);
      return true;
    };

    /* Inverzia 4×4. Používa sa raz za snímok na projekčnú maticu pri SSAO,
       takže priamočiary rozpis je lacnejší než akýkoľvek cyklus. */
    function invertuj(m) {
      const o = new Float32Array(16);
      const a00=m[0],a01=m[1],a02=m[2],a03=m[3], a10=m[4],a11=m[5],a12=m[6],a13=m[7],
            a20=m[8],a21=m[9],a22=m[10],a23=m[11], a30=m[12],a31=m[13],a32=m[14],a33=m[15];
      const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
            b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
            b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
            b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
      let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
      if (!det) return mat4.identity();
      det = 1 / det;
      o[0]=(a11*b11-a12*b10+a13*b09)*det;  o[1]=(a02*b10-a01*b11-a03*b09)*det;
      o[2]=(a31*b05-a32*b04+a33*b03)*det;  o[3]=(a22*b04-a21*b05-a23*b03)*det;
      o[4]=(a12*b08-a10*b11-a13*b07)*det;  o[5]=(a00*b11-a02*b08+a03*b07)*det;
      o[6]=(a32*b02-a30*b05-a33*b01)*det;  o[7]=(a20*b05-a22*b02+a23*b01)*det;
      o[8]=(a10*b10-a11*b08+a13*b06)*det;  o[9]=(a01*b08-a00*b10-a03*b06)*det;
      o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
      o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
      o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
      return o;
    }

    stav.zrusVsetko = function () {
      if (stav.ciele) zrus(stav.ciele);
      if (stav.tien) { gl.deleteFramebuffer(stav.tien.fb); gl.deleteTexture(stav.tien.t); }
      if (stav.siet) { gl.deleteBuffer(stav.siet.buffer); gl.deleteVertexArray(stav.siet.vao); }
    };

    return stav;
  }

  global.KvRender3D = { vytvor, MATERIALY, rozlozFarbu };

})(typeof window !== 'undefined' ? window : this);
