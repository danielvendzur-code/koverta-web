/* Optional display scenery. Shares the canopy's depth buffer and projection.
   No price, product dimension or louver state is mutated by this module. */
(() => {
  'use strict';
  /* Kde ležia modely vybavenia.

     Na statickom webe sú v priečinku vedľa tohto súboru, takže sa adresa
     odvodí od neho. Na Shopify to tak nejde: priečinok tém je plochý,
     podadresár v ňom neexistuje, a `.bin.gz` sa medzi assety témy ani nahrať
     nedá — musí ísť do Súborov obchodu, čo je celkom iná adresa na CDN.
     Stránka ju preto vie oznámiť premennou `window.KV_SCENE_ASSETS` a tá má
     prednosť. Keď ju nenastaví nikto, platí pôvodné správanie. */
  const base = window.KV_SCENE_ASSETS
    ? new URL(window.KV_SCENE_ASSETS, location.href)
    : new URL('./scene-assets/', document.currentScript.src);
  const assets = new Map();
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  /* Bounds are the packed mesh's own extents in millimetres. They drive the
     clearance maths, so they must be regenerated together with the meshes;
     test/scene-assets.js reads the meshes and fails if these drift. */
  const models = {
    sedan: { file:'bmw-g80-m3.bin.gz', bounds:[0,-1013,0,4794,1013,1462],
      label:'BMW M3', short:'sedan' },
    sport: { file:'porsche-911.bin.gz', bounds:[0,-1005,0,4519,1005,1285],
      label:'Porsche 911', short:'športové' },
    city: { file:'mini-cooper.bin.gz', bounds:[0,-1001,0,3876,1001,1474],
      label:'Mini Cooper', short:'malé auto' },
    bistro: { file:'patio-bistro.bin.gz', bounds:[-426,-906,2,316,811,894] },
    lounge: { file:'patio-sofaset.bin.gz', bounds:[0,-1315,0,4130,1315,1291] },
    sofa: { file:'patio-sofa.bin.gz', bounds:[-1200,-750,0,1200,750,822] }
  };
  /* Obálka po otočení o štvrť otáčky okolo zvislej osi: (x,y) → (-y,x).
     Vybavenie sa inak otáčať nedá a ani nemá — stolík postavený našikmo by
     v pravouhlom prístrešku pôsobil ako nedorozumenie. */
  const turned=(b,rot)=>rot?[-b[4],b[0],b[2],-b[1],b[3],b[5]]:b;
  function load(key) {
    if (!assets.has(key)) assets.set(key, fetch(new URL(models[key].file+'?v=20260915-cars-6',base)).then(r => {
      if (!r.ok) throw Error('Model sa nepodarilo načítať.'); return r.arrayBuffer();
    }).then(async data => {
      const signature=new Uint8Array(data,0,Math.min(2,data.byteLength));
      if(signature[0]===31 && signature[1]===139) {
        if(!window.DecompressionStream)throw Error('Tento prehliadač nepodporuje komprimované 3D modely.');
        data=await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      }
      if (!data.byteLength || data.byteLength % 48) throw Error('Neplatný model.');
      return data;
    }).catch(e => { assets.delete(key); throw e; }));
    return assets.get(key);
  }
  const surfaces=new Map();
  const particleSeeds=[];
  let seedState=9307;
  const random=()=>{seedState=(seedState*1664525+1013904223)>>>0;return seedState/4294967296;};
  /* Kvapiek je viac a sú tenšie. Šesťsto širokých a dosť krytých pruhov
     čítalo skôr ako roztrúsené čiarky než ako dážď: oko vidí jednotlivé
     kusy. Štrnásťsto tenkých a priehľadnejších splynie do clony, v ktorej
     sa jednotlivá kvapka nedá sledovať, a to je presne to, čo dážď robí.
     Dopady sa počítajú raz na zostavu a držia sa v pamäti, takže vyšší
     počet stojí len ten jeden prepočet pri zmene. */
  for(let i=0;i<1400;i++)particleSeeds.push([random(),random(),random(),random()]);
  /* Laky auta. Podklad je zámerne tmavší, než by farba "mala" byť: shader
     nad neho kladie číry lak, ostrý odlesk a odraz oblohy, a tie majú voči
     čomu vyniknúť len na tmavšom podklade. Preto je aj metalíza v hodnote,
     ktorá na papieri vyzerá tmavo — na aute vyjde presne.

     Ponuka bola strieborná, grafitová a modrá, teda tri studené odtiene,
     ktoré vedľa seba splývali. Pribudla červená, čierna a biela, aby si
     zákazník našiel niečo blízke svojmu autu. Biela je teplá a jasná, takže
     sa so striebornou nepletie. */
  const PAINTS = {
    graphite: { label: 'Grafitová',  rgb: [.19, .23, .26] },
    blue:     { label: 'Modrá',      rgb: [.13, .27, .36] },
    red:      { label: 'Červená',    rgb: [.40, .055, .065] },
    black:    { label: 'Čierna',     rgb: [.075, .08, .09] },
    silver:   { label: 'Strieborná', rgb: [.63, .67, .69] },
    white:    { label: 'Biela',      rgb: [.80, .795, .78] }
  };

  /* Autá od najdlhšieho po najkratšie. Na otázku "zmestí sa mi sem auto"
     odpovedá to najväčšie, ktoré sa tam zmestí, tak sa skúšajú v tomto poradí. */
  const CARS = ['sedan', 'sport', 'city'];
  function plan(c, mode, count, allow, car) {
    if(allow && !allow(mode)) return {items:[],capacity:0,reason:''};
    const margin = Math.max(230,c.post+100), x0=c.boxDepth+margin, x1=c.L-margin;
    const available=c.L-c.boxDepth-2*margin;
    const result=[];
    if(mode==='car') {
      /* Väčšie auto má prednosť; kde sa s odstupmi nezmestí, zaparkuje malé.
         Sedan potrebuje 2,74 m šírky aj s rezervou pri stĺpoch a 5,46 m
         dĺžky — pri prednastavenom carporte sa nezmestilo nič a scéna
         hlásila, že tu auto nezaparkuje, hoci bežné mestské auto áno. */
      const order=CARS.indexOf(car)>=0?[car]:CARS.slice();
      /* Kto si vypýtal konkrétny počet, má ho dostať, ak sa vôbec dá. Väčšie
         auto ide prvé — na otázku "zmestí sa mi sem auto" odpovedá ono —, ale
         keď sa ich toľko nezmestí a menších áno, ukáže sa menšie. Predtým
         rozhodovalo len to, či sa zmestí aspoň jedno, takže pri troch autách
         ostali na scéne dve a prepínač vyzeral pokazene. */
      const want=count==='auto'?0:Math.max(1,Number(count)||1);
      let biggest=null,most=null;
      for(const key of order) {
        const got=parkCars(c,count,key,car==='auto');
        if(want&&got.items.length>=want)return got;
        if(!biggest&&got.capacity)biggest=got;
        if(!most||got.items.length>most.items.length)most=got;
      }
      /* Pri "podľa priestoru" rozhoduje veľkosť auta, pri konkrétnom počte ich
         počet: kto si vypýtal tri, nemá dostať jedno len preto, že to jedno je
         väčšie. */
      return (want?(most||biggest):(biggest||most));
    }
    if(mode==='bistro') return seatPlan(c,count,margin,available,x0,x1,result);
    return {items:[],capacity:0,reason:''};
  }
  function parkCars(c,count,key,mix) {
      const bb=models[key].bounds,carL=bb[3]-bb[0],carW=bb[4]-bb[1],carH=bb[5]-bb[2];
      if(c.H<carH+150) return {items:[],capacity:0,
        reason:'Pod túto výšku sa auto nezmestí. Zvýšte prístrešok.'};
      /* Odstup od stĺpa. 350 mm je pohodlie — miesto na otvorenie dverí. Malé
         auto sa ale pod najužší prístrešok zmestí aj bez neho: pri 2,5 m
         šírky ostane medzi stĺpmi 2,2 m svetla a Mini so zrkadlami má 2,0 m.
         Tak sa aj parkuje, len sa vystupuje opatrne. Pri malom aute preto
         stačí konštrukčná medzera, a koľko ho naozaj ostane, sa napíše pod
         náhľad. Sedan si pohodlný odstup drží. */
      const roomy=Math.max(350,c.post+200);
      const side=key==='city'?Math.max(140,c.post*0.9):roomy;
      const gap=600;

      /* Auto stojí v prístrešku jednou z dvoch polôh: dĺžkou po dĺžke stavby,
         alebo dĺžkou naprieč jej šírkou. Pri veľkom carporte je správna tá
         druhá — a vidno to na stĺpoch. Trojstĺpová varianta delí frontu na
         nerovnaké polia práve preto, že do kratšieho poľa sa zaparkuje jedno
         auto a do dlhšieho dve; keby autá stáli po dĺžke, tá nerovnosť by
         nedávala zmysel. Skúsime obe polohy a necháme tú, do ktorej sa zmestí
         viac áut; pri zhode ostáva pozdĺžna, lebo úzky prístrešok na jedno
         auto je prejazd, nie front. */
      const plan=(rot)=>{
        /* Koľko auto zaberie po dĺžke stavby (x) a koľko po jej šírke (y). */
        const along=rot?carW:carL, across=rot?carL:carW;
        const depth=c.W-2*side;
        const rows=Math.floor((depth+gap)/(across+gap));
        if(rows<1) return null;
        const rowSpan=rows*across+(rows-1)*gap;
        const yStart=side+(depth-rowSpan)/2;
        const ys=Array.from({length:rows},(_,i)=>yStart+i*(across+gap));
        /* Box zaberá koniec dĺžky a pred ním treba miesto na dvere. */
        const from=c.boxDepth+(c.boxDepth?750:300),to=c.L-300;
        const bays=(y)=>{
          let free=[[from,to]];
          for(const o of c.obstacles||[]) {
            /* Naprieč sa autom prechádza pomedzi stĺpy, takže každý stĺp delí
               frontu bez ohľadu na to, kde v hĺbke stojí — a práve to robí
               z nerovnakých polí trojstĺpovej varianty parkovací plán.
               Pozdĺžne auto ide popri stĺpoch a prekáža mu len ten, ktorý
               stojí v jeho pruhu. */
            if(!rot&&(o[3]<y-80||o[1]>y+across+80)) continue;
            const a=o[0]-side,b=o[2]+side,next=[];
            for(const [lo,hi] of free){if(b<=lo||a>=hi)next.push([lo,hi]);else{if(a>lo)next.push([lo,a]);if(b<hi)next.push([b,hi]);}}
            free=next;
          }
          return free.filter(([lo,hi])=>hi-lo>=along);
        };
        /* Miesta sa vyrábajú po poliach a v každom sa vycentrujú, aby autá
           nestáli pri jednom stĺpe a pri druhom neostalo prázdno. */
        const stalls=[];
        for(const y of ys) for(const [lo,hi] of bays(y)) {
          const n=Math.floor((hi-lo+gap)/(along+gap));
          const span=n*along+(n-1)*gap,start=lo+((hi-lo)-span)/2;
          for(let i=0;i<n;i++) stalls.push({x:start+i*(along+gap),y});
        }
        if(!stalls.length) return null;
        return {rot,along,across,stalls,capacity:Math.min(3,stalls.length)};
      };
      const varianty=[plan(0),plan(1)].filter(Boolean);
      if(!varianty.length) return {items:[],capacity:0,
        reason:'Auto sa sem s rezervou pri stĺpoch a na vystupovanie nezmestí. Predĺžte alebo rozšírte prístrešok; box potrebuje vlastný prístup.'};
      const best=varianty.reduce((a,b)=>b.capacity>a.capacity?b:a);

      const wanted=count==='auto'?best.capacity:Math.min(Number(count)||1,best.capacity);
      /* Miesta sa berú v poradí, v akom vznikli: pole po poli od predného.
         Pri troch autách a poliach 1 + 2 z toho vyjde presne to, čo má
         trojstĺpová varianta — jedno v kratšom poli, dve v dlhšom. */
      const miesta=best.stalls.slice(0,wanted);
      /* Keď stoja pod prístreškom dve autá, nemajú to byť dve kópie toho
         istého: druhé miesto dostane druhý model, aby bolo z náhľadu vidieť
         obe ponúkané veľkosti. Platí to len pri automatickom výbere — kto si
         model zvolil sám, dostane ten, ktorý si zvolil. */
      const other=key==='city'?'sedan':'city',ob=models[other].bounds;
      const otherFits=mix&&ob[4]-ob[1]<=carW&&ob[3]-ob[0]<=carL&&ob[5]-ob[2]<=c.H-150;
      const result=miesta.map((m,i)=>{
        const k=otherFits&&i===1?other:key;
        const tb=turned(models[k].bounds,best.rot);
        /* Kratší model sa v mieste vycentruje, aby nestál kapotou vpredu
           a zadkom v prázdne. */
        return {key:k,rotation:best.rot?Math.PI/2:0,z:2,
          x:m.x+(best.along-(tb[3]-tb[0]))/2-tb[0],
          y:m.y+(best.across-(tb[4]-tb[1]))/2-tb[1]};
      });
      const gapBeside=result.length?Math.round(Math.min(...result.map(i=>{
        const tb=turned(models[i.key].bounds,best.rot);
        return Math.min(i.y+tb[1],c.W-(i.y+tb[4]));}))):null;
      return {items:result,capacity:best.capacity,
        clearance:{betweenCars:gap,side,boxAccess:c.boxDepth?750:0,
          beside:gapBeside,roomy:gapBeside!=null&&gapBeside>=roomy,
          across:Boolean(best.rot)},
        reason:best.capacity?'':'Auto sa sem s rezervou pri stĺpoch a na vystupovanie nezmestí. Predĺžte alebo rozšírte prístrešok; box potrebuje vlastný prístup.'};
  }
  function seatPlan(c,count,margin,available,x0,x1,result) {
      /* Do priestoru, kde je na to miesto, patrí celá zostava — pohovka, dve
         kreslá, stolík a koberec — nie jeden stolík uprostred prázdna. Zostava
         je 2,4 m hlboká práve preto, aby sa pod bioklimatickú pergolu (najviac
         3,5 m široká) vôbec zmestila; k tomu 200 mm na každú stranu na
         obídenie a 250 mm v smere dĺžky. Kde ani to nevyjde, ostáva bistro. */
      /* Od najväčšieho k najmenšiemu: plná lounge zostava, kompaktné
         posedenie s pohovkou a až potom bistro stolík. Kým existovala len
         lounge a bistro, pri prednastavenej šírke záhradnej pergoly (2,5 m)
         nezostalo nič lepšie než stolík pre dvoch — hoci pohovka s koberčekom
         sa medzi stĺpy pohodlne zmestí. */
      /* Zostava sa smie postaviť aj otočená o štvrť otáčky a na dlhej terase
         ich stojí viac než jedna. Jedna pohovka pod šesťmetrovým prístreškom
         vyzerala ako zabudnutý kus nábytku uprostred prázdna. */
      for(const key of ['lounge','sofa']) {
        const lb=models[key].bounds;
        const sedi=r=>{const t=turned(lb,r);
          return available>=(t[3]-t[0])+500 && c.W-2*margin>=(t[4]-t[1])+400;};
        const rot=sedi(0)?0:sedi(Math.PI/2)?Math.PI/2:null;
        if(rot===null) continue;
        /* 600 mm medzi dvomi zostavami je prechod, nie škára — pod šesť­
           metrovým prístreškom sa tak zmestia dve a terasa prestane vyzerať
           prázdna okolo jedného kusa nábytku. */
        const odstup=600;
        const tb=turned(lb,rot), krok=(tb[3]-tb[0])+odstup;
        const kapacita=Math.max(1,Math.min(2,Math.floor((available+odstup)/krok)));
        const kolko=count==='auto'?kapacita:Math.min(Number(count)||1,kapacita);
        const stred=(x0+x1)/2-(tb[0]+tb[3])/2, y=c.W/2-(tb[1]+tb[4])/2;
        for(let i=0;i<kolko;i++)
          result.push({key,rotation:rot,z:2,y,
            x:stred+(kolko===2?(i?krok/2:-krok/2):0)});
        return {items:result,capacity:kapacita,reason:''};
      }
      /* Stolík so stoličkami sa zmestí pozdĺž aj naprieč. Užšia pergola ho
         vezme otočený o štvrť otáčky: pri prednastavenej šírke 2,5 m by inak
         pod strechou nestálo vôbec nič, hoci na dĺžku je miesta dosť. 600 mm
         navyše je na odsunutie stoličiek. */
      const bb=models.bistro.bounds;
      const fits=r=>{const t=turned(bb,r);return available>=(t[3]-t[0])+600 && c.W-2*margin>=(t[4]-t[1])+600;};
      const rotation=fits(0)?0:fits(Math.PI/2)?Math.PI/2:null;
      if(rotation===null)return {items:[],capacity:0,reason:'Pre posedenie a odsunutie stoličiek tu nie je dosť voľného miesta.'};
      /* Dve kompletné zostavy len vtedy, keď sa ich použiteľné obálky
         nestretnú; medzi nimi ostáva aspoň 1,5 m, aby to nebola jedna dlhá
         tabuľa. Prednastavené „podľa priestoru" ich rozloží po dĺžke, aby
         dlhý prístrešok nestál okolo jediného stolíka. */
      const tb=turned(bb,rotation), pitch=Math.max(1500,(tb[3]-tb[0])+600);
      const seats=available>=2*pitch?2:1, wantSeats=count==='auto'?seats:Math.min(Number(count)||1,seats);
      const mid=(x0+x1)/2-(tb[0]+tb[3])/2, y=c.W/2-(tb[1]+tb[4])/2;
      for(let i=0;i<wantSeats;i++)result.push({key:'bistro',x:mid+(wantSeats===2?(i?pitch/2:-pitch/2):0),y,z:2,rotation});
      return {items:result,capacity:seats,reason:''};
  }
  /* Kadiaľ tečie voda. Vychádza z tej istej geometrie, akú kreslí
     konštrukcia: rovina strechy aj s jej stúpaním, pásmo lamiel medzi stĺpmi
     a pri Koverte skutočný žľab a zvod z `lastKvAccessoryGeometry`. Skryté
     trasy — vnútro zvodu, rozvod v ráme a v stĺpe — sa zámerne nekreslia:
     voda nemá presvitať cez plný profil. Vysvetľuje ich popisná schéma pod
     ovládaním. Jeden vrchol je [x,y,z, u,v, druh, sila]; u ide po smere
     prúdu, v naprieč ním. */
  function flow(c) {
    const v=[],quad=(pts,uv,kind,alpha)=>{
      for(const i of [0,1,2,0,2,3])v.push(pts[i][0],pts[i][1],pts[i][2],uv[i][0],uv[i][1],kind,alpha);
    };
    const UV=[[0,-1],[1,-1],[1,1],[0,1]];
    /* Kam strecha tečie. F170 a F240 majú spád naprieč šírkou, SL po dĺžke —
       konštrukcia to hlási v `drain`, scéna si to nedomýšľa. */
    const dr=c.drain||{axis:'x',high:0,low:c.L,drop:c.roofRise||0};
    const ax=dr.axis==='y'?1:0, along=(x,y)=>ax?y:x, at=(u,v)=>ax?[v,u]:[u,v];
    const spanLo=Math.min(dr.high,dr.low), spanHi=Math.max(dr.high,dr.low);
    const roofTop=(x,y)=>{const hit=c.roofAt&&c.roofAt(x,y);if(hit!=null)return hit;
      const t=clamp((along(x,y)-dr.high)/Math.max(1,dr.low-dr.high),0,1);
      return c.roofZ-(dr.drop||0)*t;};
    const g=c.drainage&&c.drainage.gutter&&c.drainage.gutter.enabled?c.drainage.gutter:null;
    const d=c.drainage&&c.drainage.downpipe&&c.drainage.downpipe.enabled?c.drainage.downpipe:null;
    /* Kam až po streche voda tečie, kým zmizne z dohľadu. Pri Koverte je to
       spodný okraj lemovania: po lemovaní voda nesteká, podteká ho do žľabu.
       Inde je to vnútorné líce obvodového profilu — tam sa strieška odvodňuje
       do rámu, nie cez hranu. */
    const fascia=c.drainage&&c.drainage.fascia?c.drainage.fascia:null;
    const eave=fascia?dr.low-fascia.eave-14:g?g.x0:dr.low-Math.max(24,c.post||60);
    /* Lemovanie obchádza strechu zo všetkých štyroch strán, nielen na
       odkvape. Voda po ňom netečie — podteká ho — takže film sa musí zastaviť
       pred ním na každej hrane. Kým sa pruhy kreslili cez celú šírku, tiekli
       po bočnom lemovaní, hoci na odkvapovej hrane už boli správne zastavené. */
    const inset=fascia?fascia.side+14:0;
    const headStop=fascia?dr.high+(dr.low>dr.high?1:-1)*(fascia.eave+14):dr.high;
    const source=(()=>{
      const soft=dr.high+(dr.low>dr.high?1:-1)*Math.min(340,Math.abs(dr.low-dr.high)*.1);
      return dr.low>dr.high?Math.max(soft,headStop):Math.min(soft,headStop);
    })();
    // stabilný, no nepravidelný rozptyl pruhov — rovnaká scéna, rovnaká voda
    const rnd=(i,m)=>((i*2654435761)%m)/m;
    const dir=[Math.cos(c.az||0),Math.sin(c.az||0)];   // vodorovný smer po obrazovke
    if(c.panelRoof) {
      /* Pruhy idú po spáde, nie po dĺžke. Naprieč nim sa rozložia po celej
         šírke strechy, nech je tou šírkou ktorákoľvek os. */
      const across=ax?c.L:c.W, t0=inset, t1=across-inset, band=Math.max(1,t1-t0);
      const n=Math.max(6,Math.min(42,Math.round(band/210)));
      /* Po trapézovom plechu voda netečie kade-tade — zbehne do žliabkov medzi
         rebrami a nimi ide k odkvapu. Žliabky sa nehádajú, hľadajú sa v
         skutočnom povrchu: naprieč spádom sa odčíta profil strechy a vezmú sa
         jeho miestne minimá. Pruh vedený žliabkom navyše nikdy nekríži rebro,
         takže sa nemá kade prepadnúť pod plech — kým sa pruhy kládli
         rovnomerne, prerezávali vlnu a zdola bolo vidieť vodu cez strechu.
         Na hladkej streche (Soltec ISO panel) sa žiadne minimá nenájdu a
         pruhy sa rozložia rovnomerne ako doteraz. */
      const probe=(u,v)=>{const q=at(u,v);return roofTop(q[0],q[1]);};
      const mid=(source+eave)/2;
      const valleys=(()=>{
        const step=12,out=[];
        let prev=probe(mid,t0),cur=probe(mid,t0+step);
        for(let v=t0+step;v<t1-step;v+=step) {
          const next=probe(mid,v+step);
          if(cur<prev-0.4&&cur<=next)out.push(v);
          prev=cur;cur=next;
        }
        // zlúčiť susedné vzorky toho istého žliabku
        const found=out.filter((v,i)=>i===0||v-out[i-1]>60);
        /* Žliabky sú rozostúpené pravidelne, ale hľadajú sa po krokoch, takže
           ktorý padne medzi dve vzorky, ten sa nenájde — a ostane suchý, kým
           okolo neho tečie. Na streche 2 500 mm vychádzal rozostup 204 mm a
           medzi 1 276 a 1 696 zívala medzera 420, čiže presne jeden vynechaný.
           Medzery širšie než rozostup sa preto dopočítajú z neho; dopĺňa sa
           len medzi nájdenými žliabkami, nikdy za krajný — tam už vodu na
           lemovanie nechceme. */
        if(found.length>=3) {
          const gaps=found.slice(1).map((v,i)=>v-found[i]).sort((a,b)=>a-b);
          const pitch=gaps[gaps.length>>1];
          const full=[];
          for(let i=0;i<found.length;i++) {
            full.push(found[i]);
            if(i+1<found.length) {
              const gap=found[i+1]-found[i], missing=Math.round(gap/pitch)-1;
              for(let m=1;m<=missing;m++) full.push(found[i]+gap*m/(missing+1));
            }
          }
          return full;
        }
        return found;
      })();
      const lanes=valleys.length>=3
        ? valleys.map((v,i)=>[v,Math.max(8,Math.min(46,(valleys[1]-valleys[0])*0.30))])
        : Array.from({length:n},(_,i)=>{
            const t=t0+band*(i+.5)/n+(rnd(i+7,17)-.5)*(band/n)*.5;
            return [t,Math.min(24+rnd(i+3,9)*28,Math.max(6,Math.min(t-t0,t1-t)))];
          });
      /* Pruh sa delí po spáde na kúsky, aby kopíroval stúpanie plechu; jeden
         dlhý obdĺžnik s výškou odčítanou len v rohoch strechu prerezával. */
      const runLen=Math.abs(eave-source), steps=Math.max(2,Math.min(28,Math.round(runLen/220)));
      /* Hladina nesmie klesnúť pod hrebene rebier. Voda síce naozaj tečie po
         dne žliabku, ale plech nie je v hĺbkovej vyrovnávacej pamäti teleso —
         je to horná a spodná škrupina — takže čokoľvek zapustené medzi ne je
         zdola vidieť cez podhľad. Hladina preto sedí tesne pod hrebeňom: v
         pôdoryse ostáva v žliabku, kde voda patrí, a cez strechu neprepadne. */
      const crest=(u)=>{let z=-Infinity;for(let j=0;j<=16;j++)z=Math.max(z,probe(u,t0+(t1-t0)*j/16));return z;};
      const brim=new Map();
      const brimAt=(u)=>{const k=Math.round(u);if(!brim.has(k))brim.set(k,crest(u)-6);return brim.get(k);};
      for(const [t,w] of lanes) {
        for(let k=0;k<steps;k++) {
          const u0=source+(eave-source)*k/steps, u1=source+(eave-source)*(k+1)/steps;
          const A=at(u0,t-w),B=at(u1,t-w),C=at(u1,t+w),D=at(u0,t+w);
          const z0=Math.max(probe(u0,t-w)+2,brimAt(u0)), z1=Math.max(probe(u1,t-w)+2,brimAt(u1));
          const z2=Math.max(probe(u1,t+w)+2,brimAt(u1)), z3=Math.max(probe(u0,t+w)+2,brimAt(u0));
          quad([[A[0],A[1],z0],[B[0],B[1],z1],[C[0],C[1],z2],[D[0],D[1],z3]],UV,0,1);
        }
      }
    } else if(c.louverZone) {
      /* Otvorená lamela vodu nezachytí — prší rovno pod strechu. Až ako sa
         zatvára, rozbehne sa po jej žliabku prúžok k rámu. */
      /* Poznámka vyššie sľubuje, že sa prúžok rozbehne "ako sa zatvára", ale
         hodnota bola zapnuté/vypnuté a preskočila do jednotky až pod jedným
         percentom. Pri lamele privretej na desatinu tak po nej netiekla ani
         kvapka, hoci vodu už zachytáva. Ide to teraz plynulo: plný film na
         zavretej streche a do tretiny otvorenia sa vytratí. */
      const shut=1-clamp((c.louverT||0)/.34,0,1),z=c.louverZone;
      if(shut>.02) {
        const n=Math.max(1,Math.round((z.x1-z.x0)/Math.max(1,c.pitch)));
        for(let i=0;i<n;i++) {
          const x=z.x0+(i+.5)*c.pitch,w=Math.max(10,Math.min(42,(c.bladeWidth||200)*.16));
          quad([[x-w,z.y0,c.roofZ+6],[x-w,z.y1,c.roofZ+6],[x+w,z.y1,c.roofZ+6],[x+w,z.y0,c.roofZ+6]],UV,0,shut);
        }
      }
    }
    if(g) {
      /* Žľab visí v kapse za lemovaním, takže hladinu vidno len spod strechy
         a z odkvapovej strany — presne tak, ako to zakrýva samotný profil.
         Nad výpustom hladina zrýchli a stiahne sa doň; bez toho sa v žľabe
         len ticho lesklo a nebolo vidieť, kam voda ide. */
      const yOut=d?d.pipeCenter[1]:(g.y0+g.y1)/2,zb=g.zBottom+7,gx0=g.x0+10,gx1=g.x1-10;
      for(const y of [g.y0,g.y1])if(Math.abs(y-yOut)>60)
        quad([[gx0,y,zb],[gx0,yOut,zb],[gx1,yOut,zb],[gx1,y,zb]],UV,1,1);
      const mouth=Math.min(150,Math.max(70,(g.x1-g.x0)*.9));
      for(const sgn of [-1,1]) {
        const yFar=yOut+sgn*mouth;
        if(yFar<g.y0-20||yFar>g.y1+20)continue;
        quad([[gx0,yFar,zb+2],[gx0,yOut,zb+2],[gx1,yOut,zb+2],[gx1,yFar,zb+2]],UV,2,1);
      }
    }
    if(d) {
      const px=d.pipeCenter[0],py=d.pipeCenter[1],r=d.radius||40;
      const bottom=d.pathBounds?d.pathBounds.zMin:0,w=Math.max(16,r*.62);
      /* Vnútro zvodu ostáva zakryté; vidno až to, čo z neho vytečie. Ústie
         býva len pár centimetrov nad dlažbou, takže podmienka „kresli prúd,
         len keď je vyššie ako 90 mm" ho takmer vždy zhltla a z celej trasy
         nebolo pri zvode vidieť nič. Prúd sa preto kreslí vždy — od ústia po
         dlažbu, a ak je ústie nízko, aspoň krátky výtok. */
      /* Koleno zvodu mieri od stĺpa preč, takže voda vyteká pred ním — nie
         v jeho osi. Zvislý prúd vedený osou by ležal vnútri rúry a to je
         presne to, čo cez plný profil presvitať nesmie. */
      const pcx=d.post?(d.post.x0+d.post.x1)/2:px,pcy=d.post?(d.post.y0+d.post.y1)/2:py;
      let ox=px-pcx,oy=py-pcy;let on=Math.hypot(ox,oy);
      if(on<1){ox=1;oy=0;on=1;}ox/=on;oy/=on;
      const sx=px+ox*(r+34),sy=py+oy*(r+34);
      quad([[sx-oy*w,sy+ox*w,Math.min(bottom+r,120)],[sx-oy*w,sy+ox*w,2],
        [sx+oy*w,sy-ox*w,2],[sx+oy*w,sy-ox*w,Math.min(bottom+r,120)]],[[1,-1],[0,-1],[0,1],[1,1]],2,1);
      const run=Math.max(420,r*9);
      quad([[sx-oy*w*1.7,sy+ox*w*1.7,3],[sx+ox*run-oy*w*1.7,sy+oy*run+ox*w*1.7,3],
        [sx+ox*run+oy*w*1.7,sy+oy*run-ox*w*1.7,3],[sx+oy*w*1.7,sy-ox*w*1.7,3]],UV,4,1);
      /* Kaluž ostáva súmerná okolo osi zvodu — voda z kolena dopadá práve tam
         a odtiaľ sa rozbieha. */
      const R=Math.max(430,r*10);
      quad([[px-R,py-R,3],[px+R,py-R,3],[px+R,py+R,3],[px-R,py+R,3]],[[-1,-1],[1,-1],[1,1],[-1,1]],3,1);
    } else if(c.panelRoof) {
      /* Strieška sa neodvodňuje cez hranu. Voda dobehne po spáde do
         obvodového profilu, ním do stĺpa a stĺpom k päte — vnútro profilu
         ani stĺpa sa nekreslí, lebo cez plný jakl nemá čo presvitať. Vidno
         teda dve veci: kde voda do rámu vteká a kde z päty stĺpa vyteká.
         Kvapky visiace na odkvape boli presne to, čo tu byť nesmie. */
      const fw=Math.max(40,c.post||60),mid=at(dr.low,(ax?c.L:c.W)/2);
      const zTop=roofTop(mid[0],mid[1]);
      // štrbina, ktorou voda vteká do profilu — po celej odkvapovej hrane
      const sgnL=dr.low>dr.high?-1:1, e0=dr.low+sgnL*(fw-6), e1=dr.low+sgnL*10;
      const t0=10,t1=(ax?c.L:c.W)-10;
      const P=[at(e0,t0),at(e0,t1),at(e1,t1),at(e1,t0)];
      quad(P.map(q=>[q[0],q[1],zTop+3]),[[0,-1],[0,1],[1,1],[1,-1]],1,1);
      /* Päta stĺpa. Odkvapová strana ich má spravidla dvoje; keď tam žiadny
         nie je (previs, montáž na stenu), berú sa tie, ktoré prístrešok má —
         voda ide dolu nimi. */
      const all=(c.obstacles||[]).filter(o=>o[2]>o[0]&&o[3]>o[1]);
      const near=o=>Math.abs((ax?(o[1]+o[3]):(o[0]+o[2]))/2-dr.low);
      const atEave=all.filter(o=>near(o)<=fw*1.9);
      for(const o of (atEave.length?atEave:all)) {
        const px=(o[0]+o[2])/2,py=(o[1]+o[3])/2,half=Math.max(o[2]-o[0],o[3]-o[1])/2;
        /* Výtok patrí von od stĺpa, nie doň. Zvislý prúd vedený osou stĺpa by
           bol práve tá voda presvitajúca cez plný jakl, ktorá tu byť nesmie. */
        let ox=px-c.L/2,oy=py-c.W/2;const on=Math.hypot(ox,oy)||1;ox/=on;oy/=on;
        const sx=px+ox*(half+26),sy=py+oy*(half+26);
        const run=Math.max(300,half*6),w=Math.max(26,half*.6);
        quad([[sx-oy*w,sy+ox*w,3],[sx+ox*run-oy*w,sy+oy*run+ox*w,3],
          [sx+ox*run+oy*w,sy+oy*run-ox*w,3],[sx+oy*w,sy-ox*w,3]],UV,4,1);
        const R=Math.max(280,half*6);
        quad([[sx-R,sy-R,3],[sx+R,sy-R,3],[sx+R,sy+R,3],[sx-R,sy+R,3]],[[-1,-1],[1,-1],[1,1],[-1,1]],3,1);
      }
    }
    return new Float32Array(v);
  }
  const shader = (gl,type,source) => {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;
  };
  function program(gl,vs,fs) {
    const p=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,vs),f=shader(gl,gl.FRAGMENT_SHADER,fs);
    gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
  }
  /* Dve premietania v jednom. Doterajší vykresľovač dodáva kameru ako
     obrazovkové čísla (mierka, posun, vzdialenosť) a `project` z nich skladá
     výstup rovno v orezových súradniciach. Nový 3D vykresľovač má poriadnu
     maticu — vtedy stačí ňou vynásobiť a hĺbka sadne na tú istú os ako
     u konštrukcie. Bez toho by autá aj dážď zmizli: kreslili sa do kontextu,
     ktorý už nikto nepoužíva. */
  const projection=`
    uniform vec3 extent; uniform vec4 orbit; uniform vec4 fit; uniform vec3 lens;
    uniform mat4 mvp; uniform float useMvp;
    vec4 project(vec3 p) {
      if (useMvp > 0.5) return mvp * vec4(p, 1.0);
      vec3 q=p-extent*0.5;
      float rx=q.x*orbit.x+q.y*orbit.y;
      float ry=-q.x*orbit.y+q.y*orbit.x;
      float up=q.z*orbit.z-ry*orbit.w;
      float depth=q.z*orbit.w+ry*orbit.z;
      float w=max(lens.x*.45,lens.x-depth);
      float k=lens.x/w;
      return vec4(((rx*k*fit.x+fit.y)/fit.w*2.-1.)*w,
        (1.-(-up*k*fit.x+fit.z)/viewportHeight*2.)*w,
        (lens.z+lens.y)/(lens.z-lens.y)*w-2.*lens.z*lens.y/(lens.z-lens.y),w);
    }`;
  function create(root, changed, family) {
    /* Predvolene sa nekreslí nič. Auto potrebuje 5,27 m voľnej šírky a
       posedenie 2,32 m; predvolený rozmer žiadnej rodiny toľko nemá, takže
       predvoľba podľa rodiny otvárala panel rovno na hlásení „nezmestí sa".
       Vybavenie je doplnok — zapne si ho návštevník. `family` ostáva v API,
       lebo o rodine rozhoduje, čo má zmysel ponúkať ako prvé. */
    const state={mode:'none',count:'1',weather:'sun',paused:matchMedia('(prefers-reduced-motion: reduce)').matches,flow:true,paint:'graphite',car:'auto',family:String(family||'')};
    /* Čo dáva zmysel pod ktorou konštrukciou. Pod prístrešok pre auto nepatrí
       sedačka a pod záhradnú pergolu auto — ponuka to preto ani neukáže. */
    const forCar=/^(carport|koverta)$/.test(state.family),forSeat=!forCar;
    let context=null,frame=null,raf=0,visible=true,lastTime=0,time=0,currentPlan={items:[],capacity:0},gpu=null,loading=new Set(),loaded=new Map(),failure='';
    /* flowKey je podpis tvaru vody; prestaví sa len keď sa zmení konštrukcia
       alebo pohľad, nie na každom snímku. animates ostane false, kým hostiteľ
       nepotvrdí, že snímok dažďa vie prekresliť — na SVG zálohe sa dážď
       neanimuje a panel to povie namiesto toho, aby ticho nič nerobil. */
    let planningKey='',rainKey='',rainData=null,roofSurface=null,roofKey='',flowKey='',animates=true,budget=0,fast=false,stalled=false,pace=0,paints=0,lastPaint=0,step=16;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const stage=root.querySelector('.sp-stage');
    /* Karta stojí pootvorená: vidno jej názov a čo je práve v scéne, telo sa
       rozbalí, keď naň prejde myš — a kliknutím sa dá nechať otvorené natrvalo.
       Úplne zabalená sa nehľadala dobre, úplne otvorená zase stála na modeli.
       Na dotyku hover neexistuje, tam ju otvorí ťuknutie.

       `details` ostáva otvorený stále a o zbalení rozhoduje trieda: keby sa
       zatváral naozaj, prehliadač by telo vybral z rozloženia a nemalo by sa
       čo animovať ani na čom držať hover. */
    const panel=document.createElement('details');panel.className='sp-scene is-peek';panel.open=true;
    /* Ovládanie vybavenia a počasia leží na plátne, nie pod ním: v paneli pod
       obrázkom ukrojilo z výšky náhľadu toľko, že model ostal malý a pod ním
       pás textu. Ako karta v rohu plátna je vidieť hneď, dá sa zabaliť do
       úzkeho prúžku a model dostane celú plochu. */
    panel.innerHTML=`<summary><span>Vybavenie priestoru</span><span class="sp-scene__summary">Náhľad</span></summary>
      <div class="sp-scene__body">
        <div class="sp-scene__row"><div class="sp-scene__choices" role="group" aria-label="Vybavenie priestoru">
          <button type="button" data-scene-mode="none">Prázdny</button><button type="button" data-scene-mode="car">Auto</button><button type="button" data-scene-mode="bistro">Posedenie</button></div></div>
        <div class="sp-scene__row sp-scene__more" data-scene-countrow>
        <select data-scene-car aria-label="Model auta"><option value="auto">Auto podľa priestoru</option><option value="sedan">Sedan</option><option value="sport">Športové</option><option value="city">Malé auto</option></select>
        <select id="sp-scene-count" aria-label="Počet zostáv"><option value="1">1 kus</option><option value="2">2 kusy</option><option value="3">3 kusy</option><option value="auto">Koľko sa zmestí</option></select>
        <select class="sp-scene__paint" aria-label="Lak auta">${Object.entries(PAINTS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div>
        <!-- Dážď je z konfigurátora odstránený na žiadosť vlastníka: voľba
             počasia rozptyľovala od výrobku a kvapky na plátne pôsobili na
             zastavenom zábere rušivo. Kreslenie dažďa nižšie ostáva nedotknuté
             a dá sa vrátiť späť vrátením tohto riadku. -->
        <p class="sp-scene__status sp-scene__more" role="status" aria-live="polite"></p>
        <a class="sp-scene__credits sp-scene__more" href="../pouzite-modely/" target="_blank" rel="noopener">O 3D modeloch</a>
      </div>`;
    /* Karta visí na spodnej hrane kresby, nie na spodku celej scény: dok má
       nulovú výšku a sedí presne tam, kde plátno končí, takže karta prekryje
       len prázdnu dlažbu a nikdy nie lištu pohľadov pod ňou ani nápovedu
       k ovládaniu v ľavom hornom rohu. */
    const dock=document.createElement('div');dock.className='sp-scene-dock';
    dock.appendChild(panel);
    const bar=stage.querySelector('.sp-stage__bar');
    if(bar)stage.insertBefore(dock,bar);else stage.appendChild(dock);
    panel.querySelector('[data-scene-mode="car"]').hidden=!forCar;
    panel.querySelector('[data-scene-mode="bistro"]').hidden=!forSeat;
    const status=panel.querySelector('[role="status"]'),countSelect=panel.querySelector('#sp-scene-count'),
      paintSelect=panel.querySelector('[aria-label="Lak auta"]'),carSelect=panel.querySelector('[data-scene-car]');
    function sync() {
      stage.dataset.weather=state.weather;
      panel.querySelectorAll('[data-scene-mode]').forEach(b=>b.setAttribute('aria-pressed',String(state.mode===b.dataset.sceneMode)));
      panel.querySelectorAll('[data-scene-weather]').forEach(b=>b.setAttribute('aria-pressed',String(state.weather===b.dataset.sceneWeather)));
      panel.querySelector('[data-scene-countrow]').hidden=state.mode==='none';
      panel.querySelector('.sp-scene__paint').hidden=state.mode!=='car';
      const dazdRiadok=panel.querySelector('.sp-scene__rain');
      if(dazdRiadok)dazdRiadok.hidden=state.weather!=='rain';
      panel.querySelector('[data-scene-car]').hidden=state.mode!=='car';
      countSelect.value=state.count;carSelect.value=state.car;
      [...countSelect.options].forEach(o=>{o.disabled=o.value!=='auto' && Number(o.value)>currentPlan.capacity;});
      const pauza=panel.querySelector('[data-scene-pause]');
      if(pauza)pauza.textContent=state.paused?'Spustiť':'Pozastaviť';
      /* Plátno vie kresliť aj bez WebGL, ale vybavenie ani dážď do plochého
         nákresu nepatria. Namiesto ticha to panel povie.

         Menuje sa, ktorý vykresľovač vybavenie kreslí, nie ktorý ho nekreslí.
         Keď pribudol `webgl2-pbr`, podmienka „všetko okrem `webgl-depth`" ho
         zaradila medzi ploché nákresy a panel pod vykresleným autom tvrdil,
         že sa vybavenie nezobrazí. */
      const KRESLIA_VYBAVENIE=['webgl-depth','webgl2-pbr'];
      const flat=Boolean(context&&context.renderer&&!KRESLIA_VYBAVENIE.includes(context.renderer));
      const equipment=failure || (flat&&state.mode!=='none'?'Tento prehliadač kreslí zjednodušený nákres, vybavenie sa v ňom nezobrazí.':
        loading.size?'Načítavam 3D vybavenie…':currentPlan.reason||
        (state.mode==='car'?(()=>{
          const keys=[...new Set(currentPlan.items.map(i=>i.key))];
          if(!keys.length)return '';
          const m=v=>(v/1000).toFixed(2).replace('.',',');
          const line=keys.map(k=>{const b=models[k].bounds,n=currentPlan.items.filter(i=>i.key===k).length;
            return `${n} × ${models[k].label} · ${m(b[3]-b[0])} × ${m(b[4]-b[1])} m so zrkadlami`;}).join(' · ');
          /* Koľko naozaj ostane vedľa auta. Pod najužším prístreškom sa malé
             auto zmestí, ale na otvorenie dverí je to tesné — a to sa má
             povedať, nie zamlčať tým, že sa auto nenakreslí vôbec. */
          const cl=currentPlan.clearance;
          if(!cl||cl.beside==null)return line;
          const cm=Math.round(cl.beside/10);
          return line+(cl.roomy?` · po bokoch ${cm} cm`
            :` · po bokoch len ${cm} cm, auto sa zmestí, na otvorenie dverí je to tesné`);})():
         state.mode==='bistro'?(()=>{const k=currentPlan.items[0]&&currentPlan.items[0].key;
           return k==='lounge'?'Lounge zostava · trojmiestna pohovka, dve kreslá, stolík a koberec':
             k==='sofa'?'Posedenie · dvojkreslo, konferenčný stolík, koberec a kvetináč':
             `${currentPlan.items.length} × stolík a dve stoličky · drevo / kov`;})():''));
      /* Počasie povie, čo naozaj vidno. Bez hĺbkového rendereru sa dážď
         nekreslí vôbec a mlčať o tom by znamenalo tváriť sa, že prší. */
      const weather=state.weather!=='rain'?'':
        !animates||flat?'Dážď sa kreslí len v 3D náhľade tohto prehliadača.':
        stalled?'Toto zariadenie dážď plynulo nezvláda, preto ostal statický záber.':
        reduced.matches?'Animácia je vypnutá podľa nastavenia „obmedziť pohyb".':
        state.paused?'Dážď je pozastavený.':
        context&&!context.panelRoof&&context.louverT>.05?'Otvorenými lamelami prší pod strechu.':'';
      const message=[equipment,weather].filter(Boolean).join(' · ');
      if(status.textContent!==message)status.textContent=message;
      const label=state.mode==='car'?'Auto':state.mode==='bistro'?'Posedenie':'Prázdny';
      panel.querySelector('.sp-scene__summary').textContent=label;
    }
    const update=()=>{failure='';if(context)prepare(context);changed();run();};
    panel.addEventListener('click',e=>{
      const head=e.target.closest('summary');
      if(head){e.preventDefault();panel.classList.toggle('is-peek');return;}
      const b=e.target.closest('button');if(!b)return;
      /* Posedenie má priestor vyplniť, auto nie: jedno auto je bežná
         predstava parkovania, tri kusy nábytku bežná predstava terasy. */
      if(b.dataset.sceneMode){state.mode=b.dataset.sceneMode;state.count=b.dataset.sceneMode==='bistro'?'auto':'1';}
      if(b.dataset.sceneWeather){state.weather=b.dataset.sceneWeather;stalled=false;pace=0;paints=0;}
      if(b.hasAttribute('data-scene-pause'))state.paused=!state.paused;
      update();
    });
    countSelect.addEventListener('change',()=>{state.count=countSelect.value;update();});
    paintSelect.addEventListener('change',()=>{state.paint=paintSelect.value;update();});
    carSelect.addEventListener('change',()=>{state.car=carSelect.value;update();});
    const odtok=panel.querySelector('[data-scene-flow]');
    if(odtok)odtok.addEventListener('change',e=>{state.flow=e.target.checked;update();});
    /* Predstih namiesto točiaceho kolieska.
       Sieť auta sa doteraz sťahovala až po kliknutí na „Auto" — 0,6 s na
       lokálnej sieti, 2,2 s pri 1,5 Mb/s, a presne to je čas, ktorý by
       ukazovalo načítavanie. Ukazovateľ ten čas nezrýchli, len ho ozdobí.
       Stiahne sa preto vopred, keď prehliadač nič nerobí: prvé kliknutie
       potom nečaká. Berie sa jediný model, ten prednastavený, a iba tam, kde
       to návštevník neplatí — pri zapnutom šetrení dát ani na pomalom
       pripojení sa nesťahuje nič navyše. */
    let predstih=false;
    function prefetch(c) {
      if(predstih||!c)return;
      predstih=true;
      const net=navigator.connection;
      /* Šetrenie dát je výslovné prianie návštevníka a na 2G by sťahovanie
         navyše ukradlo pásmo samotnej stránke. Inde sa predstih oplatí. */
      if(net&&(net.saveData||/^(2g|slow-2g)$/i.test(net.effectiveType||'')))return;
      const start=()=>{
        /* Sťahuje sa presne to, čo by sa objavilo po kliknutí — nie prvé auto
           zo zoznamu. Pod prednastavený carport sa zmestí mestské, nie sedan,
           takže predstih na sedan by bol k ničomu. */
        let kluce=[];
        try{ kluce=plan(c,forCar?'car':'bistro',state.count,null,state.car).items.map(i=>i.key); }catch(e){}
        for(const k of new Set(kluce))
          if(!loaded.has(k)&&!loading.has(k))load(k).catch(()=>{});
      };
      if(window.requestIdleCallback)window.requestIdleCallback(start,{timeout:4000});
      else window.setTimeout(start,1500);
    }
    function prepare(c) {
      context=c;
      prefetch(c);
      const pk=JSON.stringify([c.L,c.W,c.H,c.post,c.boxDepth,c.obstacles,state.mode,state.count,state.car]);
      if(pk!==planningKey){currentPlan=plan(c,state.mode,state.count,m=>m==='none'||(m==='car'?forCar:forSeat),state.car);planningKey=pk;}
      /* Po strate a obnove WebGL kontextu hostiteľ znova kreslí hĺbkovo —
         dážď sa má vrátiť s ním, nie ostať vypnutý do konca návštevy. */
      if(!animates&&c.renderer==='webgl-depth'){animates=true;run();}
      const g=c.drainage&&c.drainage.gutter,d=c.drainage&&c.drainage.downpipe;
      flowKey=[c.L,c.W,c.roofZ,c.roofRise||0,c.panelRoof?1:0,Math.round((c.louverT||0)*100),
        Math.round(c.pitch||0),Math.round((c.az||0)*40),g?g.zBottom:'-',d?d.pipeCenter.join('/'):'-'].join(',');
      for(const item of currentPlan.items)if(!loaded.has(item.key)&&!loading.has(item.key)) {
        loading.add(item.key);load(item.key).then(data=>{loaded.set(item.key,data);loading.delete(item.key);changed();sync();},()=>{
          loading.delete(item.key);failure='3D model sa nenačítal. Skúste znova vybrať vybavenie.';sync();
        });
      }
      if(state.weather==='rain' && window.SP_SURFACE) {
        if(roofKey!==c.weatherKey || !roofSurface) {
          roofSurface=window.SP_SURFACE.build(c.weatherSolids||[]);roofKey=c.weatherKey;
        }
        c.roofAt=(x,y)=>{const h=roofSurface.hit(x,y);return h?h.z:null;};
        const key=c.weatherKey+'|'+JSON.stringify(currentPlan.items)+'|'+[...loaded.keys()].join(',');
        if(key!==rainKey || !rainData) {
          const items=currentPlan.items.filter(i=>loaded.has(i.key));
          for(const item of items)if(!surfaces.has(item.key))surfaces.set(item.key,window.SP_SURFACE.packed(loaded.get(item.key)));
          const values=[];
          for(const seed of particleSeeds) {
            const x=seed[0]*(c.L+2600)-1300,y=seed[1]*(c.W+2600)-1300;
            let hit=roofSurface.hit(x,y)||{z:0,normal:[0,0,1]};
            for(const item of items) {
              /* Sieť sa pýta vo vlastnej sústave: bod sa otočí naspäť o uhol
                 zostavy a nájdená normála zas dopredu, inak by kvapka dopadla
                 na tvar, ktorý v scéne nikde nestojí. */
              const cs=Math.cos(item.rotation||0),sn=Math.sin(item.rotation||0),dx=x-item.x,dy=y-item.y;
              const h=surfaces.get(item.key).hit(dx*cs+dy*sn,dy*cs-dx*sn);
              if(h && h.z+item.z>hit.z)hit={z:h.z+item.z,
                normal:[h.normal[0]*cs-h.normal[1]*sn,h.normal[0]*sn+h.normal[1]*cs,h.normal[2]]};
            }
            for(const xy of [[-1,0],[1,0],[1,1],[-1,0],[1,1],[-1,1]])values.push(...seed,...xy,Math.max(0,hit.z),...hit.normal);
          }
          rainData=new Float32Array(values);rainKey=key;
        }
      }
      sync();
    }
    const place=(program,name,attribute)=>{
      let known=gpu.places.get(program);
      if(!known){known=new Map();gpu.places.set(program,known);}
      let at=known.get(name);
      if(at===undefined){at=attribute?gpu.gl.getAttribLocation(program,name):gpu.gl.getUniformLocation(program,name);known.set(name,at);}
      return at;
    };
    const U=(program,name)=>place(program,name,false);
    const A=(program,name)=>place(program,name,true);
    function uniformCamera(gl,p,camera) {
      /* Matica má prednosť; keď nie je, ostáva pôvodná cesta. */
      const umvp=place(p,'mvp'), uuse=place(p,'useMvp');
      if(camera.mvp){ if(umvp)gl.uniformMatrix4fv(umvp,false,camera.mvp); if(uuse)gl.uniform1f(uuse,1); }
      else if(uuse)gl.uniform1f(uuse,0);
      const u=(n)=>U(p,n),c=context;
      gl.uniform3f(u('extent'),c.L,c.W,c.H);
      gl.uniform4f(u('orbit'),Math.cos(c.az),Math.sin(c.az),Math.cos(c.el),Math.sin(c.el));
      gl.uniform4f(u('fit'),camera.scale,camera.ox,camera.oy,camera.VW);
      gl.uniform1f(u('viewportHeight'),camera.VH);
      gl.uniform3f(u('lens'),camera.DIST,camera.near,camera.far);
      /* Kreslí sa do lineárnej vyrovnávacej pamäte nového vykresľovača, alebo
         rovno na plátno doterajšieho maliara? Od toho závisí, či sa farba
         musí previesť späť cez tónovaciu krivku. */
      const uh=place(p,'hdr'); if(uh)gl.uniform1f(uh,camera.hdr?1:0);
    }
    /* Spätná tónovacia krivka.

       Vybavenie scény si farbu počíta samo a vydá ju hotovú — tak, ako má
       vyzerať na obrazovke. Nový vykresľovač prístrešku ju však zapisuje do
       spoločnej vyrovnávacej pamäte v lineárnom priestore a celý záber potom
       ešte raz prejde filmovou krivkou. Auto tým dostalo krivku dvakrát a
       z grafitového laku bola bledá modrastá plocha, ktorá vyzerala
       polopriehľadne.

       Farba sa preto pred zápisom prevedie späť: zruší sa S-krivka, gama aj
       ACES. Čo z toho vyjde, prejde tónovaním presne na tú farbu, akú
       vybavenie zamýšľalo. Pri kreslení rovno na plátno (doterajší maliar)
       je `hdr` nula a neprepočítava sa nič. */
    const SPAT_TON = `uniform float hdr;
      vec3 spatTon(vec3 c) {
        if (hdr < 0.5) return c;
        c = clamp(c, 0.0004, 0.9996);
        /* späť cez S-krivku (inverzia smoothstepu) */
        vec3 g = 0.5 - sin(asin(clamp(1.0 - 2.0 * c, -1.0, 1.0)) / 3.0);
        /* späť cez gamu */
        vec3 y = pow(max(g, 0.0), vec3(2.2));
        /* späť cez ACES: krivka je racionálna kvadratika, dá sa obrátiť presne */
        vec3 d = max(vec3(0.0), -1.0127 * y * y + 1.3702 * y + 0.0009);
        return max(vec3(0.0), (0.03 - 0.59 * y - sqrt(d)) / (2.0 * (2.43 * y - 2.51)));
      }`;

    function init(gl) {
      if(gpu&&gpu.gl===gl)return;
      const main=program(gl,`precision highp float;attribute vec3 p;attribute vec3 n;attribute vec3 c;attribute float material;
        uniform float viewportHeight;${projection}uniform vec3 offset;uniform vec2 spin;
        varying vec3 normal;varying vec3 color;varying float kind;varying vec3 world;
        vec2 turn(vec2 v){return vec2(v.x*spin.x-v.y*spin.y,v.x*spin.y+v.y*spin.x);}
        void main(){world=vec3(turn(p.xy),p.z)+offset;normal=vec3(turn(n.xy),n.z);
          color=c;kind=material;gl_Position=project(world);}`,
        /* Lak (materiál 1) farbu z prepínača násobí činiteľom uloženým vo
           vrchole, nie ju prepisuje. Pri jednofarebnej predlohe je činiteľ
           všade jedna a nemení sa nič; pri aute, ktoré má karosériu
           v textúre, si takto svetlá a tmavé miesta ponechá a lak sa aj tak
           dá prefarbiť. Sto dvadsať osem znamená "bez zmeny". */
        `precision highp float;${SPAT_TON}varying vec3 normal;varying vec3 color;varying float kind;varying vec3 world;
        uniform vec3 eye;uniform vec3 paint;uniform float overcast;uniform float alpha;
        void main(){vec3 n=normalize(normal);vec3 v=normalize(eye-world);if(dot(n,v)<0.)n=-n;
          vec3 key=normalize(vec3(-.25,.62,.74)),fill=normalize(vec3(.86,-.1,.50));
          float kd=max(0.,dot(n,key));float l=.36+.56*kd+.22*max(0.,dot(n,fill))+.34*max(0.,-n.z)+.13*max(0.,n.z);
          l=mix(l,.64+.27*max(0.,n.z)+.16*max(0.,-n.z),overcast);
          vec3 base=color;float spec=.03;float gloss=20.;
          if(kind>.5&&kind<1.5){base=paint*(color.r*2.);spec=.32;gloss=65.;}
          if(kind>1.5&&kind<2.5){spec=.55;gloss=100.;}
          if(kind>2.5&&kind<3.5){spec=.4;gloss=45.;}
          vec3 result=base*l;
          float fres=pow(1.-max(0.,dot(n,v)),4.);
          /* Odraz berie tmavú oblohu: vybavenie stojí pod strechou, nie na
             lúke. Kým sklo zrkadlilo jasnú oblohu, čítalo sa ako plech. */
          /* Lak nie je zrkadlo. Kým sa odraz miešal takto silno a spodná
             obloha bola takmer čierna, každá zvislá plocha karosérie stmavla
             pri okraji do čierna a strecha auta vyzerala ako tmavá kupola
             nasadená na svetlé telo. Sklo si silný odraz ponecháva. */
          if(kind>.5&&kind<3.5){vec3 r=reflect(-v,n);
            bool see=kind>1.5&&kind<2.5;
            vec3 env=mix(vec3(see?.08:.20,see?.09:.21,see?.11:.23),vec3(.44,.48,.53),smoothstep(-.12,.7,r.z));
            result=mix(result,env,(see?.30:.11)+fres*(see?.22:.12));}
          result+=spec*pow(max(0.,dot(n,normalize(key+v))),gloss)*(1.-overcast*.65);
          /* Lak auta má dve vrstvy: pigment a nad ním číry lak. Bez tej druhej
             sa karoséria lesknúť nezačne — ostane matná ako plast. Ostrý úzky
             odlesk plus jemné presvetlenie hrán je presne to, čo z plochy robí
             lakovaný plech. */
          if(kind>.5&&kind<1.5)result+=(.20*pow(max(0.,dot(n,normalize(key+v))),240.)+fres*.07)*(1.-overcast*.55);
          if(kind>3.5&&kind<4.5)result=mix(result,base,.7);
          if(kind>4.5&&kind<5.5){float weave=sin(world.x*1.8)*sin(world.y*1.7+world.z*1.6);result=base*l*(.99+.01*weave);}
          if(kind>5.5){float grain=sin(world.x*.075+sin(world.y*.31)*.8);result=base*l*(.97+.03*grain);}
          gl_FragColor=vec4(spatTon(clamp(result,0.,1.)),alpha);}`);
      /* Dážď. Každá kvapka pozná, čo je pod ňou: pultovú rovinu strechy aj
         s jej stúpaním, plný rám okolo pásma lamiel, krytie lamely podľa jej
         uhla — otvorenou medzerou prejde na zem, na zatvorenej sa zastaví —
         a obálku vybavenia, takže na streche auta neprepadne cez plech.
         Dopad nie je zmiznutie: pruh sa stiahne do striešky a dohasne. */
      const rain=program(gl,`precision highp float;attribute vec4 seed;attribute vec2 corner;attribute vec4 impact;uniform float viewportHeight;${projection}
        uniform float clock;uniform float roofBase;uniform float roofRise;uniform float density;uniform vec3 eye;
        varying float opacity;varying float splash;varying vec2 vUv;
        void main(){
          float x=seed.x*(extent.x+2600.)-1300.;float y=seed.y*(extent.y+2600.)-1300.;
          float top=roofBase+roofRise+2400.;float stopZ=impact.x;
          float h1=fract(seed.w*197.13+seed.z*41.7);float h2=fract(seed.z*311.7+seed.x*57.31);
          float phase=fract(seed.z+clock*(3600.+seed.w*3200.)/max(300.,top-stopZ));
          float z=mix(top,stopZ,phase);float land=smoothstep(.955,1.,phase);
          vec3 across=vec3(orbit.x,orbit.y,0.);
          // The drop falls plumb and must keep doing so. Its impact point is
          // solved on the CPU for the column (x,y); leaning the fall sideways
          // slid drops that land beside the carport across the roof outline
          // on their way down, which read as rain getting in underneath.
          vec3 fall=vec3(x,y,z)+across*corner.x*(4.6+4.2*h2)+vec3(0.,0.,corner.y*(90.+h1*230.)*(1.-land));
          vec3 n=normalize(impact.yzw);vec3 t=normalize(abs(n.z)>.9?cross(n,vec3(0.,1.,0.)):cross(n,vec3(0.,0.,1.)));
          vec3 b=cross(n,t);
          vec3 pool=vec3(x,y,stopZ)+n*2.+(t*corner.x+b*(corner.y*2.-1.))*(20.+40.*seed.w)*land;
          gl_Position=project(mix(fall,pool,land));vUv=vec2(corner.x,corner.y*2.-1.);
          // A contact ring belongs to the wet side of its surface. Seen from
          // underneath, it must not shine through a thin sheet or the ground.
          float facing=smoothstep(0.,.12,dot(n,normalize(eye-vec3(x,y,stopZ))));
          // Nothing may appear or vanish in one step: the streak fades up as
          // the cycle starts and the ring dies out before phase wraps back to
          // zero. Without that the same drop jumped from the puddle to the
          // sky at full strength every cycle, and the eye caught it.
          float birth=smoothstep(0.,.05,phase);
          float death=1.-smoothstep(.93,1.,phase);
          opacity=(.30+h2*.30)*density*birth*mix(1.,.35*death,land)*mix(1.,facing,land);splash=land;}`,
        `precision mediump float;${SPAT_TON}varying float opacity;varying float splash;varying vec2 vUv;
        void main(){float edge=1.-smoothstep(.25,1.,abs(vUv.x));
          float ring=(1.-smoothstep(.78,1.,length(vUv)))*smoothstep(.32,.58,length(vUv));
          float a=opacity*mix(edge,ring,splash);if(a<.005)discard;
          gl_FragColor=vec4(spatTon(mix(vec3(.60,.73,.81),vec3(.82,.89,.94),splash)),a);}`);
      /* Voda z odtoku. Rovnaký program pre film na streche, hladinu v žľabe,
         padajúci prúd aj kruhy na dlažbe — líšia sa len druhom a rýchlosťou. */
      const flowProg=program(gl,`precision highp float;attribute vec3 p;attribute vec2 uv;attribute float kind;attribute float alpha;
        uniform float viewportHeight;${projection}
        varying vec2 vUv;varying float vKind;varying float vAlpha;
        void main(){vUv=uv;vKind=kind;vAlpha=alpha;gl_Position=project(p);}`,
`precision mediump float;${SPAT_TON}varying vec2 vUv;varying float vKind;varying float vAlpha;uniform float clock;uniform float strength;
        void main(){
          float across=1.-smoothstep(.45,1.,abs(vUv.y));float a=0.;vec3 col=vec3(.60,.77,.88);
          /* Mokrý plech je tmavší ako suchý a až hrebeň stekajúcej vody je
             svetlý. Kým bol film jednoliato svetlý a takmer priehľadný, na
             bledej streche ho nebolo vidieť vôbec a strecha pôsobila sucho aj
             v najsilnejšom daždi. */
          if(vKind<.5){float s=fract(vUv.x*1.6-clock*.5);float crest=smoothstep(.52,1.,s);
            a=(.15+.34*crest)*across;col=mix(vec3(.33,.41,.47),vec3(.80,.89,.95),crest);}
          else if(vKind<1.5){float s=fract(vUv.x*2.2-clock*.85);a=(.24+.34*smoothstep(.35,1.,s))*across;}
          else if(vKind<2.5){float s=fract(vUv.x*1.4-clock*1.6);a=(.20+.55*smoothstep(.45,1.,s))*across;
            col=mix(vec3(.50,.65,.76),vec3(.88,.94,.98),smoothstep(.45,1.,s));}
          else if(vKind<3.5){
            /* Mokrá dlažba je tmavšia, nie svetlejšia — svetlé je až rozbité
               kruhy na hladine. */
            float r=length(vUv),ring=smoothstep(.55,1.,fract(r*2.2-clock*1.15)),wet=1.-smoothstep(.30,1.,r);
            a=wet*(.32+.30*ring);col=mix(vec3(.19,.25,.29),vec3(.80,.89,.95),ring*.75);
          }
          else{
            /* Odtekajúci pramienok po dlažbe. Je to voda na zemi, nie film na
               streche, takže má vlastný druh — inak by ho meranie presakovania
               počítalo medzi vodu na krytine. */
            float s=fract(vUv.x*1.1-clock*.8);
            a=(.20+.24*smoothstep(.4,1.,s))*across*(1.-smoothstep(.55,1.,vUv.x));
            col=mix(vec3(.22,.29,.34),vec3(.72,.83,.90),smoothstep(.4,1.,s));
          }
          gl_FragColor=vec4(spatTon(col),a*strength*vAlpha);}`);
      /* Kontaktný tieň. Bez neho vybavenie viselo nad dlažbou — auto aj
         posedenie pôsobili prilepené na obrazovku, nie postavené na zemi.
         Je to mäkká elipsa na úrovni podlahy s tmavším jadrom: pod strechou
         je objekt v tieni konštrukcie, takže ostrý slnečný tieň by tu bol
         nesprávny. Kreslí sa s hĺbkovým testom, ale bez zápisu do hĺbky, aby
         ho stĺp pred ním správne zakryl a sám nezakryl nič. */
      const contact=program(gl,`precision highp float;attribute vec2 corner;uniform float viewportHeight;${projection}
        uniform vec3 center;uniform vec2 radius;varying vec2 uv;
        void main(){uv=corner;gl_Position=project(vec3(center.xy+corner*radius,center.z));}`,
        `precision mediump float;${SPAT_TON}varying vec2 uv;uniform float strength;uniform float boxy;
        void main(){float d=length(uv);
          float round=(1.-smoothstep(.10,.58,d))*.34+(1.-smoothstep(.46,1.,d))*.17;
          /* Prístrešok nie je guľatý. Jeho tieň drží pôdorys strechy a mäkne
             až na okraji, kde ho rozostruje obloha. */
          float box=(1.-smoothstep(.62,1.,abs(uv.x)))*(1.-smoothstep(.62,1.,abs(uv.y)));
          float a=mix(round,box*.46,boxy);
          gl_FragColor=vec4(spatTon(vec3(.05,.06,.07)),a*strength);}`);
      const contactBuffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,contactBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
      const rainBuffer=gl.createBuffer();
      /* Miesta uniformov a atribútov si drží modul sám. Ovládač ich hľadá
         podľa reťazca a v snímku ich je vyše dvadsať — pri každom otočení
         modelu to bola zbytočná práca navyše. */
      gpu={gl,main,rain,rainBuffer,contact,contactBuffer,flow:flowProg,flowBuffer:gl.createBuffer(),flowVertices:0,flowKey:'',meshes:new Map(),rainVertices:particleSeeds.length*6,rainData:null,places:new Map()};
    }
    function draw(gl,camera,weatherOnly=false) {
      if(!context)return;init(gl);
      if(weatherOnly) {
        if(state.weather!=='rain')return;
        const c=context;
        gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        const p=gpu.rain;gl.useProgram(p);uniformCamera(gl,p,camera);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.rainBuffer);
        if(gpu.rainData!==rainData && rainData){gl.bufferData(gl.ARRAY_BUFFER,rainData,gl.STATIC_DRAW);gpu.rainData=rainData;}
        const a=A(p,'seed'),b=A(p,'corner'),h=A(p,'impact');
        gl.enableVertexAttribArray(a);gl.enableVertexAttribArray(b);gl.enableVertexAttribArray(h);
        gl.vertexAttribPointer(a,4,gl.FLOAT,false,40,0);gl.vertexAttribPointer(b,2,gl.FLOAT,false,40,16);gl.vertexAttribPointer(h,4,gl.FLOAT,false,40,24);
        gl.uniform1f(U(p,'clock'),time);gl.uniform1f(U(p,'roofBase'),c.roofZ);gl.uniform1f(U(p,'roofRise'),c.roofRise||0);
        gl.uniform3f(U(p,'eye'),c.L/2-Math.sin(c.az)*Math.cos(c.el)*camera.DIST,c.W/2+Math.cos(c.az)*Math.cos(c.el)*camera.DIST,c.H/2+Math.sin(c.el)*camera.DIST);
        gl.uniform1f(U(p,'density'),1);
        /* Jedna sila dažďa. Voľba medzi mrholením, dažďom a lejakom
           neodpovedala na nič, čo zákazník o prístrešku rieši. Kvapiek je
           však 560, nie 360: pri troch stovkách tenkých bledých čiarok bolo
           na svetlej dlažbe sotva vidieť, že prší. Dvesto kvapiek navyše
           stojí podľa merania scény desatinu milisekundy na snímok. */
        if(rainData)gl.drawArrays(gl.TRIANGLES,0,560*6);
        gl.disableVertexAttribArray(a);gl.disableVertexAttribArray(b);gl.disableVertexAttribArray(h);
        if(state.flow) {
          const f=gpu.flow;gl.useProgram(f);uniformCamera(gl,f,camera);
          if(gpu.flowKey!==flowKey) {
            const data=flow(c);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.flowBuffer);
            gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
            gpu.flowVertices=data.length/7;gpu.flowKey=flowKey;
          } else gl.bindBuffer(gl.ARRAY_BUFFER,gpu.flowBuffer);
          if(gpu.flowVertices) {
            const locs=[['p',3,0],['uv',2,12],['kind',1,20],['alpha',1,24]].map(([n,size,off])=>{
              const loc=A(f,n);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,off);return loc;
            });
            gl.uniform1f(U(f,'clock'),time);
            gl.uniform1f(U(f,'strength'),state.paused||reduced.matches?.85:1);
            gl.drawArrays(gl.TRIANGLES,0,gpu.flowVertices);
            locs.forEach(loc=>gl.disableVertexAttribArray(loc));
          }
        }
        gl.depthMask(true);return;
      }
      /* Tiene idú pred vybavenie: sú priehľadné a nezapisujú hĺbku, takže by
         inak prekryli to, čo na nich stojí. */
      const drawn=currentPlan.items.filter(i=>loaded.has(i.key));
      if(drawn.length) {
        const sp=gpu.contact;gl.useProgram(sp);uniformCamera(gl,sp,camera);
        gl.bindBuffer(gl.ARRAY_BUFFER,gpu.contactBuffer);
        const ca=A(sp,'corner');
        gl.enableVertexAttribArray(ca);gl.vertexAttribPointer(ca,2,gl.FLOAT,false,8,0);
        gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        for(const item of drawn) {
          const b=turned(models[item.key].bounds,item.rotation);
          /* Svetlo v shaderi vybavenia prichádza z (-.25,.62,.74), takže tieň
             padá na +x a -y. Pod strechou je to len mierne posunutý kontaktný
             tieň, nie ostrý slnečný. */
          const h=b[5]-b[2], k=state.weather==='sun'?0.08:0.03;
          gl.uniform3f(U(sp,'center'),
            item.x+(b[0]+b[3])/2+h*k*0.338, item.y+(b[1]+b[4])/2-h*k*0.838, 1.5);
          gl.uniform2f(U(sp,'radius'),
            (b[3]-b[0])/2+Math.min(260,h*0.22), (b[4]-b[1])/2+Math.min(260,h*0.22));
          gl.uniform1f(U(sp,'strength'),state.weather==='sun'?1:.62);
          gl.drawArrays(gl.TRIANGLES,0,6);
        }
        gl.disableVertexAttribArray(ca);gl.depthMask(true);
      }
      const p=gpu.main;gl.useProgram(p);uniformCamera(gl,p,camera);
      const ca=Math.cos(context.az),sa=Math.sin(context.az),ce=Math.cos(context.el),se=Math.sin(context.el);
      gl.uniform3f(U(p,'eye'),context.L/2-sa*ce*camera.DIST,context.W/2+ca*ce*camera.DIST,context.H/2+se*camera.DIST);
      gl.uniform3fv(U(p,'paint'),(PAINTS[state.paint]||PAINTS.graphite).rgb);
      gl.uniform1f(U(p,'overcast'),state.weather==='sun'?0:.85);
      gl.uniform1f(U(p,'alpha'),1);
      gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);
      for(const item of currentPlan.items) {
        const data=loaded.get(item.key);if(!data)continue;
        let m=gpu.meshes.get(item.key);if(!m){m={buffer:gl.createBuffer(),count:data.byteLength/16};gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gpu.meshes.set(item.key,m);}
        gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);
        for(const [name,size,type,norm,offset] of [['p',3,gl.SHORT,false,0],['n',3,gl.SHORT,true,6],['c',3,gl.UNSIGNED_BYTE,true,12],['material',1,gl.UNSIGNED_BYTE,false,15]]) {
          const loc=A(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,norm,16,offset);
        }
        gl.uniform3f(U(p,'offset'),item.x,item.y,item.z);
        gl.uniform2f(U(p,'spin'),Math.cos(item.rotation||0),Math.sin(item.rotation||0));
        gl.drawArrays(gl.TRIANGLES,0,m.count);
      }
    }
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;lastTime=0;}
    const clockNow=()=>(window.performance&&performance.now?performance.now():Date.now());
    const raining=()=>animates&&!stalled&&state.weather==='rain'&&!state.paused&&!reduced.matches&&!document.hidden&&visible;
    function tick(now) {
      raf=0;if(!raining())return;
      if(lastTime)time+=Math.min(.05,(now-lastTime)/1000);lastTime=now;
      /* Cieľom je šesťdesiat snímkov za sekundu. Krok sa predĺži až vtedy,
         keď zariadenie samo ukáže, že to nestíha — najskôr na tridsať, potom
         sa siahne na pohybové rozlíšenie a až nakoniec sa dážď zastaví.
         Čas medzitým beží ďalej, tak dážď nespomalí, len nezaberie každý
         snímok prehliadača. */
      if(frame&&now-lastPaint>=step-1) {
        const t0=clockNow(),ok=frame(fast),cost=clockNow()-t0;
        budget=budget?budget*.75+cost*.25:cost;
        if(ok===false){animates=false;sync();return;}
        /* Skutočnú cenu snímku určuje grafika, nie tento JavaScript, tak sa
           meria odstup medzi vykresleniami. Keď scéna nestíha, dážď si vypýta
           pohybové rozlíšenie — presne to, čo beží počas otáčania — a keď
           nestačí ani to, radšej zastane a povie to. */
        if(lastPaint) {
          const gap=now-lastPaint;pace=pace?pace*.8+gap*.2:gap;paints++;
          /* Prvý ústupok je snímková frekvencia, nie ostrosť: pri 60 sa meria,
             či ich zariadenie naozaj stíha, a keď nie, spadne sa na 30 skôr,
             než sa scéna začne kresliť nahrubo. */
          if(step<30&&paints>8&&pace>26){step=33;paints=0;pace=0;}
          else if(step>=30&&!fast&&paints>6&&pace>48){fast=true;paints=0;pace=0;}
          else if(fast&&paints>12&&pace>260){stalled=true;sync();stop();return;}
        }
        lastPaint=now;
      }
      raf=requestAnimationFrame(tick);
    }
    function run() {
      stop();
      if(raining()){raf=requestAnimationFrame(tick);return;}
      /* Po zastavení dažďa sa scéna dokreslí ostro — pohybové rozlíšenie
         nemá prečo ostať na statickom zábere. */
      if(fast&&frame){fast=false;pace=0;paints=0;lastPaint=0;frame(false);}
      step=16;
    }
    document.addEventListener('visibilitychange',run);
    reduced.addEventListener('change',()=>{if(reduced.matches)state.paused=true;sync();run();});
    if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;run();},{threshold:0}).observe(stage);
    sync();
    /* Počasie sa dá prepnúť aj mimo tlačidiel. Test presakovania potrebuje
       suchý referenčný záber v tom istom svetle, v akom prší — inak sa dve
       snímky líšia osvetlením celého modelu a ten rozdiel sa počíta ako voda.
       Hodnota 'cloud' už nemá tlačidlo, ale renderer jej rozumie a svieti
       ňou rovnako ako dažďom. */
    return {state,prepare,draw,setFrame(fn){frame=fn;animates=true;run();},
      setWeather(w){state.weather=w;sync();run();if(!raining()&&frame)frame(false);},
      snapshot:()=>({mode:state.mode,count:currentPlan.items.length,capacity:currentPlan.capacity,clearance:currentPlan.clearance||null,
        weather:state.weather,collisionTriangles:roofSurface?roofSurface.triangles:0,paused:state.paused,flow:state.flow,animating:Boolean(raf),animates,fast,stalled,step,
        pace:Math.round(pace),
        frameCost:Math.round(budget*100)/100,clock:Math.round(time*1000)/1000,
        /* surfaceZ je skutočná výška krytiny pod dažďom, nie vrch lemovania.
           Test presakovania si o ňu opiera kontrolu, že film leží na plechu. */
        roof:context?{z:context.roofZ,rise:context.roofRise||0,panel:Boolean(context.panelRoof),
          surfaceZ:context.roofAt?context.roofAt(context.L*.5,context.W*.5):null,
          pitch:context.pitch,cover:context.cover,louverT:context.louverT}:null,
        flowQuads:context?flow(context).length/42:0,
        /* Obálky vodných plôch podľa druhu. QA na nich overí, že voda leží tam,
           kde je skutočný žľab a ústie zvodu, a nikde vnútri plného profilu. */
        flowParts:context?(()=>{const d=flow(context),out=[];
          for(let i=0;i<d.length;i+=42){const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
            for(let v=0;v<6;v++){const o=i+v*7;for(let k=0;k<3;k++){box[k]=Math.min(box[k],d[o+k]);box[k+3]=Math.max(box[k+3],d[o+k]);}}
            out.push({kind:d[i+5],alpha:d[i+6],box:box.map(n=>Math.round(n))});}
          return out;})():[],
        drainage:context?{gutter:Boolean(context.drainage&&context.drainage.gutter&&context.drainage.gutter.enabled),
          downpipe:Boolean(context.drainage&&context.drainage.downpipe&&context.drainage.downpipe.enabled)}:null,
        loaded:[...loaded.keys()],items:currentPlan.items.map(i=>({...i,bounds:models[i.key].bounds}))})};
  }
  window.SP_SCENE={create,plan,models};
})();
