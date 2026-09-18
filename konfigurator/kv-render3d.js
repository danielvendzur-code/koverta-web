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
    lak:      { kov: 0.08, drsnost: 0.33, odraz: 1.00 },  /* prášková farba — tmavé RAL sedia */
    zinok:    { kov: 0.72, drsnost: 0.40, odraz: 0.92 },  /* žiarový zinok */
    hlinik:   { kov: 0.88, drsnost: 0.28, odraz: 0.95 },  /* holý hliník, lemovanie */
    sklo:     { kov: 0.00, drsnost: 0.05, odraz: 1.00 },
    panel:    { kov: 0.04, drsnost: 0.55, odraz: 0.86 },  /* biely plech odráža okolo 0,7 */
    drevo:    { kov: 0.00, drsnost: 0.72, odraz: 0.80 },
    polykarb: { kov: 0.00, drsnost: 0.18, odraz: 1.00 },
    dlazba:   { kov: 0.00, drsnost: 0.84, odraz: 0.50 },  /* betón odráža okolo 0,35 */
    trava:    { kov: 0.00, drsnost: 0.95, odraz: 0.55 },
    auto:     { kov: 0.35, drsnost: 0.25, odraz: 0.95 },
    guma:     { kov: 0.00, drsnost: 0.88, odraz: 0.70 },
    zakladny: { kov: 0.04, drsnost: 0.50, odraz: 0.92 }
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
  const OBLOHA = `
uniform vec3 uOdrazZeme;

vec3 farbaOblohy(vec3 dir, vec3 slnko, float zamracene) {
  float h = clamp(dir.z * 0.5 + 0.5, 0.0, 1.0);

  /* Zenit, horizont a zem. Pri zamračení sa obloha zbaví modrej a celá
     sa vyrovná do svietivej bielej — to je to, čo robí mäkké svetlo. */
  /* Toto nie je obloha z pohľadnice. Konfigurátor nepredáva počasie, ale
     výrobok: sýto modré pozadie mu ukradne pozornosť a tieň naň hodí modrú,
     ktorú zákazník na svojom dvore neuvidí. Je to štúdiové prostredie —
     chladnejšie hore, svetlejšie pri horizonte, takmer bez sýtosti. Hliník
     z neho dostane presne ten prechod, po ktorom vyzerá ako kov. */
  vec3 zenitJasno   = vec3(0.330, 0.394, 0.492);
  vec3 horizJasno   = vec3(0.800, 0.826, 0.858);
  vec3 zenitZamrac  = vec3(0.545, 0.575, 0.612);
  vec3 horizZamrac  = vec3(0.790, 0.805, 0.822);

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
  vec3 zem = uOdrazZeme;
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
vec3 ozarenie(vec3 n, vec3 slnko, float zamracene) {
  /* Bez slnečného kotúča: ten je v scéne priamym svetlom a keby sa započítal
     aj sem, dopadol by dvakrát. */
  vec3 hore = farbaOblohy(vec3(0.0, 0.0, 1.0), -slnko, zamracene);
  vec3 bok  = farbaOblohy(normalize(vec3(n.x, n.y, 0.22)), -slnko, zamracene);
  vec3 dole = farbaOblohy(vec3(0.0, 0.0, -1.0), -slnko, zamracene);
  float k = n.z * 0.5 + 0.5;
  vec3 c = mix(dole, hore, k * k);
  c = mix(c, bok, 0.40);
  /* Jas oblohy v jednom smere nie je ožiarenie plochy. Integrál cez pologuľu
     dá zlomok z neho — bez tohto delenia je obloha silnejšia než poludňajšie
     slnko a scéna je celá modrá bez tieňov. */
  c *= 0.74;
  /* Tieň vonku nie je modrý tak, ako je modrá obloha: než svetlo dopadne,
     odrazí sa od zeme, od steny, od auta. Každý odraz uberie sýtosť. Toto
     je jeden krok toho premiešania — bez neho vyzerá tieň ako fotomontáž. */
  float seda = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, vec3(seda), 0.30);
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

  const FS_HLAVNY = HLAVICKA + OBLOHA + PBR + `
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
uniform vec2 uTienKrok;
uniform int uTienVzoriek;
uniform float uOrezavat;
uniform vec3 uStred;
uniform float uDosah;
uniform int uLadenie;   /* 0 hotový obraz, 1 tieň, 2 NdotL, 3 normála, 4 albedo */

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

  float uhol = sum(gl_FragCoord.xy) * 6.2831853;
  float c = cos(uhol), si = sin(uhol);
  mat2 rot = mat2(c, -si, si, c);

  /* Hľadanie tieniaceho telesa. Päť vzoriek v malom okolí stačí: potrebujeme
     len priemernú hĺbku toho, čo je pred nami, nie jeho tvar. */
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
  vec2 krok = uTienKrok * mix(1.0, 7.0, rozostup);

  /* Počet vzoriek sa mení podľa toho, či sa model práve otáča. V pohybe
     oko mäkkosť okraja nestihne prečítať a osem vzoriek je polovičná cena;
     po zastavení sa dokreslí plných šestnásť. */
  float suma = 0.0;
  int pocet = uTienVzoriek;
  for (int i = 0; i < 16; i++) {
    if (i >= pocet) break;
    vec2 o = rot * KOTUC[i] * krok;
    float d = texture(uTienMapa, s.xy + o).r;
    suma += (s.z - posun) > d ? 0.0 : 1.0;
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
  float priznaky = vParam.w;
  /* Jednostranná plocha sa odzadu nekreslí — tak, ako to robila aj doterajšia
     geometria. Ostatné sa kreslia z oboch strán; po rozostúpení o hrúbku
     plechu si už neprekážajú. */
  if (uOrezavat > 0.5 && priznaky >= 2.0 && dot(nGeo, v) < 0.0) discard;

  vec3 n = dot(nGeo, v) < 0.0 ? -nGeo : nGeo;

  float kov = vParam.x;
  float drsnost = clamp(vParam.y, 0.035, 1.0);

  /* Podklad nie je jednofarebná doska. Bez povrchu je to najväčšia plocha
     v zábere a práve ona prezradí, že ide o render. Škáry dlažby, zrnitosť
     a mierna zmena drsnosti stačia — ostatné dorobí svetlo. */
  vec3 podkladFarba = vFarba;
  bool jePodklad = (priznaky == 1.0 || priznaky == 3.0);
  if (jePodklad) {
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
    vec2 zmena = vec2(length(dFdx(uv)), length(dFdy(uv)));
    float naPixel = max(zmena.x, zmena.y);
    float ostrost = 1.0 - smoothstep(0.016, 0.075, naPixel);      /* doska 90 cm */
    float ostrostSkary = 1.0 - smoothstep(0.006, 0.028, naPixel); /* škára 2 cm */
    float ostrostZrna = ostrostSkary;                              /* zrno 1,8 cm */

    vec2 bunka = floor(uv);
    vec2 vnutri = fract(uv);

    /* Škára: úzka a nie úplne rovnomerná. */
    vec2 kOkraju = abs(vnutri - 0.5);
    float sirkaSkary = 0.468 + 0.010 * fract(sin(dot(bunka, vec2(7.3, 19.7))) * 9137.1);
    float skara = 1.0 - smoothstep(sirkaSkary, sirkaSkary + 0.024, max(kOkraju.x, kOkraju.y));
    skara *= ostrostSkary;

    /* Tón dosky. Rozdiely sú malé — päť percent stačí, aby plocha prestala
       byť jedna doska a stala sa z nej dlažba. */
    float tonDosky = fract(sin(dot(bunka, vec2(41.7, 289.1))) * 43758.5453);
    /* Pomalá vlna cez celú plochu: mierne svetlejšie a tmavšie pásy, aké
       zanechá schnúca voda. */
    float vlna = sin(vPoz.x * 0.00042 + vPoz.y * 0.00031) * 0.5 + 0.5;
    /* Jemné zrno v mierke centimetrov. */
    float zrno = fract(sin(dot(floor(vPoz.xy / 18.0), vec2(12.99, 78.23))) * 43758.5453);

    /* Vlna je veľká a do diaľky sa nerozpadne, tak ostáva v plnej sile;
       všetko ostatné sa s dlaždicou zmenšuje, tak sa s ňou aj utlmí. */
    /* Každá zložka sa utlmí podľa vlastnej mierky a to, čo sa utlmí, sa
       nahradí svojou strednou hodnotou — inak by plocha do diaľky menila jas
       a vznikol by z toho pás. */
    podkladFarba *= 0.955
                  + tonDosky * 0.052 * ostrost + (1.0 - ostrost) * 0.026
                  + zrno * 0.022 * ostrostZrna + (1.0 - ostrostZrna) * 0.011
                  + vlna * 0.030;
    podkladFarba *= mix(1.0, 0.86, skara);
    /* Škára je matnejšia než doska, doska má miestami hladšie miesta. */
    drsnost = clamp(drsnost * (0.93 + zrno * 0.14 * ostrostZrna + (1.0 - ostrostZrna) * 0.07)
                  + skara * 0.05, 0.035, 1.0);
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
  vec3 odraz = mix(farbaOblohy(rOhnuty, uSlnko, uZamracene), ozar, drsnost * 0.55);
  vec3 specIbl = odraz * envBRDF(f0, drsnost, ndv);

  /* Odraz sa nesmie kresliť pod horizont tam, kde je zem — inak sa v zvislom
     stĺpe zrkadlí obloha aj zospodu. */
  float podHorizont = smoothstep(-0.25, 0.02, rOhnuty.z);
  specIbl *= mix(0.32, 1.0, podHorizont);

  vec3 farba = priame + difIbl + specIbl;

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

  /* Tenký vzdušný závoj do hĺbky. Drží oddelenie predného a zadného stĺpa
     aj vtedy, keď majú rovnakú farbu. */
  float vzdial = length(uOko - vPoz);
  float mlha = 1.0 - exp(-vzdial * 2.2e-5);
  farba = mix(farba, farbaOblohy(normalize(vPoz - uOko), uSlnko, uZamracene) * 0.9, mlha * 0.55);

  /* Podklad nekončí hranou. Doterajší okraj dlažby bol na zábere vidieť ako
     rovná čiara cez celú šírku — a nič tak spoľahlivo neprezradí, že model
     stojí na doske, nie na dvore. Plocha sa preto do diaľky rozplynie do
     farby prostredia. */
  float priehladnost = vParam.z;
  if (jePodklad) {
    float r = length(vPoz.xy - uStred.xy) / max(1.0, uDosah);
    /* Zánik začína skôr, než by sa dalo. Ďaleká dlažba už nemá čo ukázať:
       dlaždica má na obrazovke pár pixelov, kresba sa utlmila do hladkého
       tónu a zatienenie do šumu. Skorší prechod do prostredia to všetko
       schová a zároveň drží dojem otvoreného dvora. */
    float zanik = 1.0 - smoothstep(0.42, 0.92, r);
    vec3 dalka = farbaOblohy(normalize(vec3(vPoz.xy - uOko.xy, -0.06)), uSlnko, uZamracene);
    farba = mix(dalka, farba, zanik);
  }

  oFarba = vec4(farba, priehladnost);
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

  const FS_TON = HLAVICKA + `
in vec2 vUV;
uniform sampler2D uScena;
uniform sampler2D uAO;
uniform sampler2D uZiara;
uniform float uSilaAO;
uniform float uSilaZiary;
uniform float uVineta;
uniform float uExpozicia;
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

  /* Vinetácia je jemná — má len usadiť pohľad do stredu, nie kresliť rám. */
  vec2 q = vUV - 0.5;
  c *= 1.0 - uVineta * dot(q, q) * 1.15;

  oFarba = vec4(c, 1.0);
}
`;

  const FS_POZADIE = HLAVICKA + OBLOHA + `
in vec2 vUV;
uniform mat4 uInvPohladProjekcia;
uniform vec3 uOko;
uniform vec3 uSlnko;
uniform float uZamracene;
layout(location = 0) out vec4 oFarba;
layout(location = 1) out vec4 oNormHlbka;
void main() {
  /* Smer lúča cez pixel: rozbalí sa z inverznej matice, takže obloha sedí
     s perspektívou aj pri posunutom strede obrazu. */
  vec4 blizko = uInvPohladProjekcia * vec4(vUV * 2.0 - 1.0, -1.0, 1.0);
  vec4 daleko = uInvPohladProjekcia * vec4(vUV * 2.0 - 1.0,  1.0, 1.0);
  vec3 dir = normalize(daleko.xyz / daleko.w - blizko.xyz / blizko.w);
  oFarba = vec4(farbaOblohy(dir, uSlnko, uZamracene), 1.0);
  oNormHlbka = vec4(0.5, 0.5, 1.0, 0.0);
}
`;

  const FS_ZIARA = HLAVICKA + `
in vec2 vUV;
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
    s += max(c - vec3(uPrah), vec3(0.0)) * v;
    w += v;
  }
  oFarba = vec4(s / w, 1.0);
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
        ton: program(gl, VS_PLOCHA, FS_TON)
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
      slnko: vec3.norm([-0.38, 0.52, 0.72]),
      svetloSlnka: [3.35, 3.10, 2.72],
      zamracene: 0,
      silaAO: 0.62,
      silaZiary: 0.55,
      vineta: 0.24,
      /* Dve úrovne kvality. V pohybe ide o plynulosť: menej vzoriek tieňa,
         bez zatienenia v kútoch a bez žiary. Po zastavení sa scéna dokreslí
         naplno. Rozdiel v pohybe nie je vidieť, rozdiel v snímkoch áno. */
      kvalita: { tienVzoriek: 16, ssao: true, ziara: true },
      ladenie: 0,
      ladenieTon: 0,
      expozicia: 1.0,
      prazdnyVAO: gl.createVertexArray()
    };

    /* --- geometria ---------------------------------------------------- */

    /* Plochy prídu ako polygóny vo svetových súradniciach. Rozložíme ich na
       trojuholníky vejárom — polygóny sú konvexné (vznikajú ako obdĺžniky
       a rezy rovinou), takže vejár stačí a je najlacnejší. */
    stav.nastavScenu = function (plochy, klasifikuj) {
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
            data[at + 12] = (f.bg ? 1 : 0) + (f.cull ? 2 : 0);
            data[at + 13] = f.bias || 0;
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

    /* Prepnutie kvality. `pohyb` znamená, že používateľ práve ťahá modelom. */
    stav.nastavKvalitu = function (pohyb) {
      stav.kvalita = pohyb
        ? { tienVzoriek: 6, ssao: false, ziara: false }
        : { tienVzoriek: 16, ssao: true, ziara: true };
    };

    /* Koľko svetla vráti zem. Je to odrazivosť podkladu krát to, čo naň
       dopadne — priame slnko podľa jeho výšky plus obloha — delené π, lebo
       ide o jas, nie o ožiarenie. Súčiniteľ na konci je za viacnásobný
       odraz, ktorý sa inak nepočíta. */
    stav.odrazZeme = function () {
      const s = stav.slnko, i = stav.svetloSlnka, z = Math.max(0, s[2]);
      const obloha = stav.zamracene > 0.5 ? 0.62 : 0.42;
      const odrazivost = stav.odrazivostPodkladu || [0.34, 0.33, 0.31];
      const k = (x, j) => odrazivost[j] * (x * z + obloha) / Math.PI * 1.35;
      return new Float32Array([k(i[0], 0), k(i[1], 1), k(i[2], 2)]);
    };

    stav.nastavSvetlo = function (s) {
      if (s.odrazivostPodkladu) stav.odrazivostPodkladu = s.odrazivostPodkladu;
      if (s.slnko) stav.slnko = vec3.norm(s.slnko);
      if (s.zamracene !== undefined) stav.zamracene = s.zamracene;
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
      const c = stav.ciele;
      if (c && c.w === w && c.h === h) return c;
      if (c) zrus(c);

      const vzoriek = stav.maxVzoriek;
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

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return (stav.ciele = {
        w, h, aw, ah, zw, zh,
        msaa, farbaRB, normRB, hlbkaRB,
        rozlisFB, farbaT, normT, hlbkaT,
        aoFB, aoT, ao2FB, ao2T, ziaraFB, ziaraT
      });
    }

    function zrus(c) {
      for (const k of ['msaa', 'rozlisFB', 'aoFB', 'ao2FB', 'ziaraFB']) if (c[k]) gl.deleteFramebuffer(c[k]);
      for (const k of ['farbaRB', 'normRB', 'hlbkaRB']) if (c[k]) gl.deleteRenderbuffer(c[k]);
      for (const k of ['farbaT', 'normT', 'hlbkaT', 'aoT', 'ao2T', 'ziaraT']) if (c[k]) gl.deleteTexture(c[k]);
    }

    function pripravTien() {
      if (stav.tien) return stav.tien;
      const fb = gl.createFramebuffer();
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, TIEN_ROZMER, TIEN_ROZMER, 0,
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
      return (stav.tien = { fb, t, rozmer: TIEN_ROZMER });
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

    function plocha(p, nastav) {
      gl.useProgram(p);
      if (nastav) nastav();
      gl.bindVertexArray(stav.prazdnyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    stav.kresli = function (sirka, vyska) {
      const s = stav.siet;
      if (!s || !stav.kamera) return false;
      const c = pripravCiele(sirka, vyska);
      const t = pripravTien();
      if (!stav.tienPolomer) slnkoMatica();
      const sm = slnkoMatica();
      /* Svetová veľkosť jedného texela tieňovej mapy — z nej vychádza posun
         po normále. Dva a pol texela stačia aj na plochu skoro rovnobežnú
         so slnkom a pritom neodlepia tieň od päty stĺpa. */
      stav.posunPoNormale = stav.tienPolomer ? (2.0 * stav.tienPolomer / t.rozmer) * 2.5 : 4;

      /* --- 1 · tieňová mapa -------------------------------------------- */
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

      /* --- 2 · hlavný priechod ----------------------------------------- */
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
        gl.uniformMatrix4fv(p.u.uInvPohladProjekcia, false, invertuj(stav.kamera.pohladProjekcia));
        gl.uniform3fv(p.u.uOko, stav.kamera.oko);
        gl.uniform3fv(p.u.uSlnko, stav.slnko);
        gl.uniform1f(p.u.uZamracene, stav.zamracene);
        gl.uniform3fv(p.u.uOdrazZeme, stav.odrazZeme());
      });
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      const P = stav.programy.hlavny;
      gl.useProgram(P);
      gl.uniformMatrix4fv(P.u.uPohladProjekcia, false, stav.kamera.pohladProjekcia);
      gl.uniformMatrix4fv(P.u.uSlnkoMatica, false, sm);
      gl.uniform3fv(P.u.uOko, stav.kamera.oko);
      gl.uniform3fv(P.u.uSlnko, stav.slnko);
      gl.uniform3fv(P.u.uSvetloSlnka, stav.svetloSlnka);
      gl.uniform1f(P.u.uZamracene, stav.zamracene);
      gl.uniform3fv(P.u.uOdrazZeme, stav.odrazZeme());
      gl.uniform1i(P.u.uLadenie, stav.ladenie | 0);
      gl.uniform2f(P.u.uTienKrok, 2.2 / t.rozmer, 2.2 / t.rozmer);
      gl.uniform1f(P.u.uPosunPoNormale, stav.posunPoNormale);
      /* Náskok je v hĺbke po orezaní. Roviny sú priložené tesne na scénu, tak
         stačí zlomok promile — dosť na to, aby lemovanie vyhralo nad plechom,
         a málo na to, aby čokoľvek preplávalo cez susedný diel. */
      gl.uniform1f(P.u.uKrokPoradia, 1.6e-6);

      gl.uniform1i(P.u.uTienVzoriek, stav.kvalita.tienVzoriek);
      gl.uniform1f(P.u.uOrezavat, stav.orezavat === false ? 0 : 1);
      {
        const o = stav.obal || [0, 0, 0, 1, 1, 1];
        gl.uniform3f(P.u.uStred, (o[0] + o[3]) / 2, (o[1] + o[4]) / 2, (o[2] + o[5]) / 2);
        const ov = stav.obalVrhacov || o;
        /* Dosah, na ktorom sa podklad stratí: štvornásobok konštrukcie. Bližšie
           by sa dlažba končila v zábere, ďalej by sa švík vrátil. */
        gl.uniform1f(P.u.uDosah, Math.hypot(ov[3] - ov[0], ov[4] - ov[1]) * 2.0);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.t);
      gl.uniform1i(P.u.uTienMapa, 0);

      gl.bindVertexArray(s.vao);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.drawArrays(gl.TRIANGLES, 0, s.pocetNepriehl);

      /* Sem sa vojde to, čo do scény patrí, ale nie je konštrukcia: autá,
         posedenie, dopadový tieň. Kreslí sa do tej istej vyrovnávacej pamäte,
         takže má rovnaké vyhladzovanie aj rovnakú hĺbku ako prístrešok. */
      if (stav.kresliNavyse) {
        /* Cudzí vykresľovač píše len farbu, nie normály. Kým kreslí, druhý
           výstup sa musí odpojiť — inak WebGL2 kresbu odmietne s tým, že
           aktívnemu výstupu chýba zodpovedajúci výstup shadera. Jeho pixely
           preto ostanú v mape normál označené ako „bez normály" a zatienenie
           ich preskočí; vlastný dopadový tieň si kreslí sám. */
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
        gl.bindVertexArray(null);
        stav.kresliNavyse('nepriehladne', gl, stav.kamera);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.useProgram(P);
        gl.bindVertexArray(s.vao);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      if (s.pocetCelkom > s.pocetNepriehl) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, s.pocetNepriehl, s.pocetCelkom - s.pocetNepriehl);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      /* Dážď, odtekajúca voda a všetko priesvitné ide až po skle. */
      if (stav.kresliNavyse) {
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
        gl.bindVertexArray(null);
        stav.kresliNavyse('priehladne', gl, stav.kamera);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }

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
        gl.uniformMatrix4fv(p.u.uProjekcia, false, stav.kamera.projekcia);
        gl.uniformMatrix4fv(p.u.uProjekciaInv, false, invertuj(stav.kamera.projekcia));
        gl.uniform2f(p.u.uRozmer, c.aw, c.ah);
        gl.uniform1f(p.u.uPolomer, rozmerScény * 0.016);
        /* Dosah sa počíta od kamery a je to vzdialenosť ku stavbe plus jej
           veľkosť. Za ňou už zatienenie nemá čo hľadať: sú tam len rovné
           plochy bez kútov a jediné, čo by pridalo, je blokový šum — presne
           ten pás pri horizonte, ktorý sa na zábere ukázal. */
        gl.uniform1f(p.u.uDosahAO, stav.kamera.DIST + rozmerScény * 0.55);
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
      });

      /* --- 7 · tónovanie na plátno -------------------------------------- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, sirka, vyska);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      plocha(stav.programy.ton, () => {
        const p = stav.programy.ton;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.farbaT);
        gl.uniform1i(p.u.uScena, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.aoT);
        gl.uniform1i(p.u.uAO, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, c.ziaraT);
        gl.uniform1i(p.u.uZiara, 2);
        gl.uniform1f(p.u.uSilaAO, stav.silaAO);
        gl.uniform1f(p.u.uSilaZiary, stav.silaZiary);
        gl.uniform1f(p.u.uVineta, stav.vineta);
        gl.uniform1f(p.u.uExpozicia, stav.expozicia);
        gl.uniform1i(p.u.uLadenieTon, stav.ladenieTon | 0);
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
