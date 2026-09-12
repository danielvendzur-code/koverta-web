/* Optional display scenery. Shares the canopy's depth buffer and projection.
   No price, product dimension or louver state is mutated by this module. */
(() => {
  'use strict';
  const base = new URL('./scene-assets/', document.currentScript.src);
  const assets = new Map();
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  /* Bounds are the packed mesh's own extents in millimetres. They drive the
     clearance maths, so they must be regenerated together with the meshes;
     test/scene-assets.js reads the meshes and fails if these drift. */
  const models = {
    car: { file:'touring-sedan.bin.gz', bounds:[-43,-1058,1,4760,1058,1480] },
    bistro: { file:'patio-bistro.bin.gz', bounds:[-426,-906,2,316,811,894] }
  };
  function load(key) {
    if (!assets.has(key)) assets.set(key, fetch(new URL(models[key].file,base)).then(r => {
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
  /* Kde má vybavenie naozaj vodorovné „veko". Obálka celého auta by dvihla
     dážď na výšku strechy aj nad kapotu a kvapky by dopadali do vzduchu.
     Preto sa z načítanej siete odmeria pôdorys jej najvyšších plôch — pri
     aute strecha kabíny, pri posedení doska stola — a dážď sa zastaví len
     tam. Zvyšok tela vyrieši hĺbkový test: čo je za autom, to nevidno. */
  const decks=new Map();
  function deck(key, data) {
    if(decks.has(key))return decks.get(key);
    const b=models[key].bounds, cut=b[2]+(b[5]-b[2])*.86;
    const view=new DataView(data);
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let i=0;i<data.byteLength;i+=16) {
      if(view.getInt16(i+4,true)<cut)continue;
      const x=view.getInt16(i,true),y=view.getInt16(i+2,true);
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
    const box=x1>x0?[x0,y0,x1,y1,b[5]]:null;
    decks.set(key,box);return box;
  }
  function plan(c, mode, count) {
    const margin = Math.max(230,c.post+100), x0=c.boxDepth+margin, x1=c.L-margin;
    const available=c.L-c.boxDepth-2*margin;
    const result=[];
    if(mode==='car') {
      const capacity=available>=4808 && c.H>1610 ? clamp(Math.floor((c.W-2*margin+360)/(2124+360)),0,3) : 0;
      const n=count==='auto'?capacity:Math.min(Number(count),capacity);
      for(let i=0;i<n;i++)result.push({key:'car',x:(x0+x1)/2-2360,y:c.W*(i+.5)/n,z:2,rotation:0});
      return {items:result,capacity,reason:capacity?'':'Auto potrebuje voľný priestor aspoň 5,27 × 2,59 m. Zohľadňuje sa aj box.'};
    }
    if(mode==='bistro') {
      /* Požiadavka vychádza z obálky samotnej zostavy plus 300 mm na každú
         stranu na odsunutie stoličky, nie z ručne dopísaného čísla — pri
         výmene siete sa posunie sama. */
      const bb=models.bistro.bounds, need=y=>(y?bb[4]-bb[1]:bb[3]-bb[0])+600;
      if(available<need(false) || c.W-2*margin<need(true))return {items:[],capacity:0,reason:'Pre posedenie a odsunutie stoličiek tu nie je dosť voľného miesta.'};
      result.push({key:'bistro',x:(x0+x1)/2+55,y:c.W/2+47,z:2,rotation:0});
      // Two complete bistro sets only when their usable envelopes do not meet.
      if(count==='2' && available>=3000) {
        result[0].x=(x0+x1)/2-750+55;
        result.push({...result[0],x:(x0+x1)/2+750+55});
      }
      return {items:result,capacity:available>=3000?2:1,reason:''};
    }
    return {items:[],capacity:0,reason:''};
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
    const roofTop=x=>c.roofZ+(c.roofRise||0)*(1-clamp(x/Math.max(1,c.L),0,1));
    const g=c.drainage&&c.drainage.gutter&&c.drainage.gutter.enabled?c.drainage.gutter:null;
    const d=c.drainage&&c.drainage.downpipe&&c.drainage.downpipe.enabled?c.drainage.downpipe:null;
    const eave=g?g.x0:c.L-24;
    // stabilný, no nepravidelný rozptyl pruhov — rovnaká scéna, rovnaká voda
    const rnd=(i,m)=>((i*2654435761)%m)/m;
    const dir=[Math.cos(c.az||0),Math.sin(c.az||0)];   // vodorovný smer po obrazovke
    if(c.panelRoof) {
      const n=Math.max(7,Math.min(26,Math.round(c.W/380))),x0=Math.min(340,c.L*.1);
      for(let i=0;i<n;i++) {
        const y=c.W*(i+.5)/n+(rnd(i+7,17)-.5)*(c.W/n)*.6,w=14+rnd(i+3,9)*18;
        quad([[x0,y-w,roofTop(x0)+8],[eave,y-w,roofTop(eave)+8],[eave,y+w,roofTop(eave)+8],[x0,y+w,roofTop(x0)+8]],UV,0,1);
      }
    } else if(c.louverZone) {
      /* Otvorená lamela vodu nezachytí — prší rovno pod strechu. Až ako sa
         zatvára, rozbehne sa po jej žliabku prúžok k rámu. */
      const shut=clamp(1-(c.louverT||0)/.45,0,1),z=c.louverZone;
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
         a z odkvapovej strany — presne tak, ako to zakrýva samotný profil. */
      const yOut=d?d.pipeCenter[1]:(g.y0+g.y1)/2,zb=g.zBottom+7,gx0=g.x0+10,gx1=g.x1-10;
      for(const y of [g.y0,g.y1])if(Math.abs(y-yOut)>60)
        quad([[gx0,y,zb],[gx0,yOut,zb],[gx1,yOut,zb],[gx1,y,zb]],UV,1,1);
    }
    if(d) {
      const px=d.pipeCenter[0],py=d.pipeCenter[1],r=d.radius||40;
      const bottom=d.pathBounds?d.pathBounds.zMin:0,w=Math.max(14,r*.55);
      // Vnútro zvodu ostáva zakryté; vidno až to, čo z neho vytečie.
      if(bottom>90)quad([[px-dir[0]*w,py-dir[1]*w,0],[px-dir[0]*w,py-dir[1]*w,bottom],
        [px+dir[0]*w,py+dir[1]*w,bottom],[px+dir[0]*w,py+dir[1]*w,0]],[[1,-1],[0,-1],[0,1],[1,1]],2,1);
      const R=Math.max(340,r*8);
      quad([[px-R,py-R,3],[px+R,py-R,3],[px+R,py+R,3],[px-R,py+R,3]],[[-1,-1],[1,-1],[1,1],[-1,1]],3,1);
    } else if(c.panelRoof) {
      /* Bez žľabu prepadá voda cez odkvapovú hranu. Kvapky sú obrátené
         k pozorovateľovi, aby nezmizli pri pohľade zboku. */
      const n=Math.max(6,Math.min(22,Math.round(c.W/380))),zTop=roofTop(c.L);
      for(let i=0;i<n;i++) {
        const y=c.W*(i+.5)/n+(rnd(i+11,13)-.5)*70,w=8+rnd(i+5,7)*7,len=240+rnd(i+2,11)*260;
        const cx=c.L+6,dx=dir[0]*w,dy=dir[1]*w;
        quad([[cx-dx,y-dy,zTop-len],[cx-dx,y-dy,zTop],[cx+dx,y+dy,zTop],[cx+dx,y+dy,zTop-len]],[[1,-1],[0,-1],[0,1],[1,1]],2,1);
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
  const projection=`
    uniform vec3 extent; uniform vec4 orbit; uniform vec4 fit; uniform vec3 lens;
    vec4 project(vec3 p) {
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
    const state={mode:'none',count:'1',weather:'sun',paused:matchMedia('(prefers-reduced-motion: reduce)').matches,flow:false,paint:'silver',family:String(family||'')};
    let context=null,frame=null,raf=0,visible=true,lastTime=0,time=0,currentPlan={items:[],capacity:0},gpu=null,loading=new Set(),loaded=new Map(),failure='';
    /* flowKey je podpis tvaru vody; prestaví sa len keď sa zmení konštrukcia
       alebo pohľad, nie na každom snímku. animates ostane false, kým hostiteľ
       nepotvrdí, že snímok dažďa vie prekresliť — na SVG zálohe sa dážď
       neanimuje a panel to povie namiesto toho, aby ticho nič nerobil. */
    let flowKey='',animates=true,budget=0,fast=false,stalled=false,pace=0,paints=0,lastPaint=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const stage=root.querySelector('.sp-stage');
    const panel=document.createElement('details');panel.className='sp-scene';
    panel.innerHTML=`<summary><span>Vybavenie priestoru</span><span class="sp-scene__summary">Náhľad priestoru</span></summary>
      <div class="sp-scene__body">
        <div class="sp-scene__row"><span class="sp-scene__label">Pod prístreškom</span><div class="sp-scene__choices" role="group" aria-label="Vybavenie priestoru">
          <button type="button" data-scene-mode="none">Bez vybavenia</button><button type="button" data-scene-mode="car">Auto</button><button type="button" data-scene-mode="bistro">Posedenie</button></div></div>
        <div class="sp-scene__row" data-scene-countrow><label class="sp-scene__label" for="sp-scene-count">Počet</label><select id="sp-scene-count" aria-label="Počet zostáv"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="auto">Podľa priestoru</option></select>
        <label class="sp-scene__paint">Lak auta <select aria-label="Lak auta"><option value="silver">Strieborná</option><option value="graphite">Grafitová</option><option value="blue">Modrá</option></select></label></div>
        <div class="sp-scene__row" data-scene-weatherrow><span class="sp-scene__label">Počasie</span><div class="sp-scene__choices" role="group" aria-label="Počasie">
          <button type="button" data-scene-weather="sun">Slnečno</button><button type="button" data-scene-weather="cloud">Zamračené</button><button type="button" data-scene-weather="rain">Dážď</button></div></div>
        <div class="sp-scene__rain" hidden><button type="button" data-scene-pause>Pozastaviť dážď</button><label><input type="checkbox" data-scene-flow> Ukázať odtok vody</label></div>
        <p class="sp-scene__status" role="status" aria-live="polite"></p>
        <p class="sp-scene__note">Vybavenie slúži na predstavu o priestore a nie je súčasťou ceny.</p>
        <a class="sp-scene__credits" href="./scene-assets/CREDITS.md" target="_blank" rel="noopener">O 3D modeloch</a>
      </div>`;
    /* Panel patrí pod plátno, do stĺpca s vizualizáciou. Ako priamy potomok
       mriežky sa stal druhou bunkou prvého riadku: sadol si nad kroky
       konfigurátora a odsunul ich do druhého riadku pod plátno, kde ich
       spodné voľby prekryla lišta súhlasu. */
    stage.appendChild(panel);
    const diagram=document.createElement('aside');diagram.className='sp-drain-guide';diagram.hidden=true;
    diagram.innerHTML=`<strong>Ako odteká voda</strong><ol><li><i>1</i><span data-drain-roof>Strecha zachytí dážď</span></li><li><i>2</i><span data-drain-gutter>Žľab zvedie vodu k výpustu</span></li><li><i>3</i><span data-drain-pipe>Zvod odvedie vodu nadol</span></li></ol><small>Popis skrytej trasy. V 3D sa kreslí len voda, ktorú naozaj vidno — vnútro zvodu a rozvod v profile ostávajú zakryté.</small>`;
    panel.appendChild(diagram);
    const status=panel.querySelector('[role="status"]'),countSelect=panel.querySelector('#sp-scene-count'),paintSelect=panel.querySelector('[aria-label="Lak auta"]');
    function sync() {
      panel.querySelectorAll('[data-scene-mode]').forEach(b=>b.setAttribute('aria-pressed',String(state.mode===b.dataset.sceneMode)));
      panel.querySelectorAll('[data-scene-weather]').forEach(b=>b.setAttribute('aria-pressed',String(state.weather===b.dataset.sceneWeather)));
      panel.querySelector('[data-scene-countrow]').hidden=state.mode==='none';
      panel.querySelector('.sp-scene__paint').hidden=state.mode!=='car';
      panel.querySelector('.sp-scene__rain').hidden=state.weather!=='rain';
      countSelect.value=state.count;
      [...countSelect.options].forEach(o=>{o.disabled=o.value!=='auto' && Number(o.value)>currentPlan.capacity;});
      panel.querySelector('[data-scene-pause]').textContent=state.paused?'Spustiť dážď':'Pozastaviť dážď';
      diagram.hidden=state.weather!=='rain'||!state.flow;
      diagram.dataset.paused=String(state.paused||reduced.matches);
      if(context) {
        /* Schéma hovorí o tom, čo je práve v scéne: otvorené lamely, žľab
           podľa objednaných doplnkov a skutočný zvod z geometrie modelu. */
        const open=!context.panelRoof && context.louverT>.01;
        const drain=context.drainage||{};
        const gutter=Boolean(drain.gutter&&drain.gutter.enabled),pipe=Boolean(drain.downpipe&&drain.downpipe.enabled);
        diagram.querySelector('[data-drain-roof]').textContent=open?'Otvorenými lamelami dážď prechádza':'Strecha zachytí dážď';
        diagram.querySelector('[data-drain-gutter]').textContent=gutter?'Žľab za lemovaním zvedie vodu k výpustu':
          context.panelRoof?'Bez žľabu voda prepadá cez odkvapovú hranu':'Voda steká žliabkom lamiel do rámu';
        diagram.querySelector('[data-drain-pipe]').textContent=pipe?'Vonkajší zvod vedľa stĺpa vyústi na dlažbu':
          context.panelRoof&&!gutter?'Kvapká priamo na terén pod hranou':'Skrytý zvod v stĺpe';
      }
      /* Plátno vie kresliť aj bez WebGL, ale vybavenie ani dážď do plochého
         nákresu nepatria. Namiesto ticha to panel povie. */
      const flat=Boolean(context&&context.renderer&&context.renderer!=='webgl-depth');
      const equipment=failure || (flat&&state.mode!=='none'?'Tento prehliadač kreslí zjednodušený nákres — vybavenie sa v ňom nezobrazí.':
        loading.size?'Načítavam 3D vybavenie…':currentPlan.reason||
        (state.mode==='car'?`${currentPlan.items.length} × Touring sedan · dĺžka 4,81 m vrátane detailov · šírka 2,13 m so zrkadlami`:
         state.mode==='bistro'?`${currentPlan.items.length} × stolík a dve stoličky · drevo / kov`:''));
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
      const label=state.mode==='car'?'Auto':state.mode==='bistro'?'Posedenie':'Bez vybavenia';
      panel.querySelector('.sp-scene__summary').textContent=state.weather==='rain'?label+' · dážď':state.weather==='cloud'?label+' · zamračené':label;
    }
    const update=()=>{failure='';if(context)prepare(context);changed();run();};
    panel.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.sceneMode){state.mode=b.dataset.sceneMode;state.count='1';}
      if(b.dataset.sceneWeather){state.weather=b.dataset.sceneWeather;stalled=false;pace=0;paints=0;}
      if(b.hasAttribute('data-scene-pause'))state.paused=!state.paused;
      update();
    });
    countSelect.addEventListener('change',()=>{state.count=countSelect.value;update();});
    paintSelect.addEventListener('change',()=>{state.paint=paintSelect.value;update();});
    panel.querySelector('[data-scene-flow]').addEventListener('change',e=>{state.flow=e.target.checked;update();});
    function prepare(c) {
      context=c;currentPlan=plan(c,state.mode,state.count);
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
      const u=(n)=>U(p,n),c=context;
      gl.uniform3f(u('extent'),c.L,c.W,c.H);
      gl.uniform4f(u('orbit'),Math.cos(c.az),Math.sin(c.az),Math.cos(c.el),Math.sin(c.el));
      gl.uniform4f(u('fit'),camera.scale,camera.ox,camera.oy,camera.VW);
      gl.uniform1f(u('viewportHeight'),camera.VH);
      gl.uniform3f(u('lens'),camera.DIST,camera.near,camera.far);
    }
    function init(gl) {
      if(gpu&&gpu.gl===gl)return;
      const main=program(gl,`precision highp float;attribute vec3 p;attribute vec3 n;attribute vec3 c;attribute float material;
        uniform float viewportHeight;${projection}uniform vec3 offset;varying vec3 normal;varying vec3 color;varying float kind;varying vec3 world;
        void main(){world=p+offset;normal=n;color=c;kind=material;gl_Position=project(world);}`,
        `precision highp float;varying vec3 normal;varying vec3 color;varying float kind;varying vec3 world;
        uniform vec3 eye;uniform vec3 paint;uniform float overcast;uniform float alpha;
        void main(){vec3 n=normalize(normal);vec3 v=normalize(eye-world);if(dot(n,v)<0.)n=-n;
          vec3 key=normalize(vec3(-.25,.62,.74)),fill=normalize(vec3(.86,-.1,.50));
          float kd=max(0.,dot(n,key));float l=.36+.56*kd+.22*max(0.,dot(n,fill))+.34*max(0.,-n.z)+.13*max(0.,n.z);
          l=mix(l,.64+.27*max(0.,n.z)+.16*max(0.,-n.z),overcast);
          vec3 base=color;float spec=.03;float gloss=20.;
          if(kind>.5&&kind<1.5){base=paint;spec=.32;gloss=65.;}
          if(kind>1.5&&kind<2.5){spec=.55;gloss=100.;}
          if(kind>2.5&&kind<3.5){spec=.4;gloss=45.;}
          vec3 result=base*l;
          float fres=pow(1.-max(0.,dot(n,v)),4.);
          if(kind>.5&&kind<3.5){vec3 r=reflect(-v,n);vec3 env=mix(vec3(.12,.14,.16),vec3(.82,.87,.9),smoothstep(-.12,.7,r.z));
            result=mix(result,env,(kind>1.5&&kind<2.5?.38:.09)+fres*.25);}
          result+=spec*pow(max(0.,dot(n,normalize(key+v))),gloss)*(1.-overcast*.65);
          if(kind>3.5)result=mix(result,base,.7);
          gl_FragColor=vec4(clamp(result,0.,1.),alpha);}`);
      /* Dážď. Každá kvapka pozná, čo je pod ňou: pultovú rovinu strechy aj
         s jej stúpaním, plný rám okolo pásma lamiel, krytie lamely podľa jej
         uhla — otvorenou medzerou prejde na zem, na zatvorenej sa zastaví —
         a obálku vybavenia, takže na streche auta neprepadne cez plech.
         Dopad nie je zmiznutie: pruh sa stiahne do striešky a dohasne. */
      const rain=program(gl,`precision highp float;attribute vec4 seed;attribute vec2 corner;uniform float viewportHeight;${projection}
        uniform float clock;uniform float roofBase;uniform float roofRise;uniform vec4 foot;uniform vec4 blade;uniform vec4 zone;
        uniform vec4 blockA;uniform vec4 blockB;uniform vec4 blockC;uniform vec3 blockTop;
        varying float opacity;varying float splash;
        void main(){
          float x=seed.x*(extent.x+2600.)-1300.;
          float y=seed.y*(extent.y+2600.)-1300.;
          float roofZ=roofBase+roofRise*(1.-clamp(x/max(1.,extent.x),0.,1.));
          bool under=x>foot.x&&x<foot.z&&y>foot.y&&y<foot.w;
          bool blocked=false;
          if(under){
            if(blade.w<.5)blocked=true;
            else if(x<zone.x||x>zone.z||y<zone.y||y>zone.w)blocked=true;
            else blocked=abs(fract((x-blade.x)/blade.y)-.5)*blade.y<=blade.z*.5;
          }
          float stopZ=blocked?roofZ:0.;
          if(!blocked){
            if(x>blockA.x&&x<blockA.z&&y>blockA.y&&y<blockA.w)stopZ=max(stopZ,blockTop.x);
            if(x>blockB.x&&x<blockB.z&&y>blockB.y&&y<blockB.w)stopZ=max(stopZ,blockTop.y);
            if(x>blockC.x&&x<blockC.z&&y>blockC.y&&y<blockC.w)stopZ=max(stopZ,blockTop.z);
          }
          float top=roofBase+roofRise+2400.;
          float phase=fract(seed.z+clock*(.62+seed.w*.30));
          float z=mix(top,stopZ,phase);
          float len=150.+seed.w*130.;
          float land=smoothstep(.955,1.,phase);
          vec3 fall=vec3(x+corner.x*(4.+2.5*seed.w),y,z+corner.y*len*(1.-land));
          vec3 pool=vec3(x+corner.x*(58.+70.*seed.w)*land,y+(corner.y-.5)*(38.+46.*seed.w)*land,stopZ+6.);
          gl_Position=project(mix(fall,pool,land));
          opacity=(.24+seed.w*.24)*(1.-land*.8);splash=land;}`,
        `precision mediump float;varying float opacity;varying float splash;
        void main(){gl_FragColor=vec4(mix(vec3(.54,.71,.82),vec3(.85,.92,.96),splash),opacity);}`);
      /* Voda z odtoku. Rovnaký program pre film na streche, hladinu v žľabe,
         padajúci prúd aj kruhy na dlažbe — líšia sa len druhom a rýchlosťou. */
      const flowProg=program(gl,`precision highp float;attribute vec3 p;attribute vec2 uv;attribute float kind;attribute float alpha;
        uniform float viewportHeight;${projection}
        varying vec2 vUv;varying float vKind;varying float vAlpha;
        void main(){vUv=uv;vKind=kind;vAlpha=alpha;gl_Position=project(p);}`,
        `precision mediump float;varying vec2 vUv;varying float vKind;varying float vAlpha;uniform float clock;uniform float strength;
        void main(){
          float across=1.-smoothstep(.45,1.,abs(vUv.y));float a=0.;vec3 col=vec3(.60,.77,.88);
          if(vKind<.5){float s=fract(vUv.x*1.8-clock*.42);a=(.03+.15*smoothstep(.55,1.,s))*across;}
          else if(vKind<1.5){float s=fract(vUv.x*2.2-clock*.85);a=(.20+.30*smoothstep(.35,1.,s))*across;}
          else if(vKind<2.5){float s=fract(vUv.x*1.4-clock*1.6);a=(.10+.46*smoothstep(.5,1.,s))*across;}
          else{
            /* Mokrá dlažba je tmavšia, nie svetlejšia — svetlé je až rozbité
               kruhy na hladine. */
            float r=length(vUv),ring=smoothstep(.55,1.,fract(r*2.2-clock*1.15)),wet=1.-smoothstep(.35,1.,r);
            a=wet*(.22+.26*ring);col=mix(vec3(.20,.26,.30),vec3(.78,.88,.94),ring*.75);
          }
          gl_FragColor=vec4(col,a*strength*vAlpha);}`);
      /* Kontaktný tieň. Bez neho vybavenie viselo nad dlažbou — auto aj
         posedenie pôsobili prilepené na obrazovku, nie postavené na zemi.
         Je to mäkká elipsa na úrovni podlahy s tmavším jadrom: pod strechou
         je objekt v tieni konštrukcie, takže ostrý slnečný tieň by tu bol
         nesprávny. Kreslí sa s hĺbkovým testom, ale bez zápisu do hĺbky, aby
         ho stĺp pred ním správne zakryl a sám nezakryl nič. */
      const contact=program(gl,`precision highp float;attribute vec2 corner;uniform float viewportHeight;${projection}
        uniform vec3 center;uniform vec2 radius;varying vec2 uv;
        void main(){uv=corner;gl_Position=project(vec3(center.xy+corner*radius,center.z));}`,
        `precision mediump float;varying vec2 uv;uniform float strength;
        void main(){float d=length(uv);
          float a=(1.-smoothstep(.10,.58,d))*.34+(1.-smoothstep(.46,1.,d))*.17;
          gl_FragColor=vec4(.05,.06,.07,a*strength);}`);
      const contactBuffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,contactBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
      const rainBuffer=gl.createBuffer(),seeds=[];
      let rand=9307;const random=()=>{rand=(rand*1664525+1013904223)>>>0;return rand/4294967296;};
      for(let i=0;i<360;i++){const s=[random(),random(),random(),random()];for(const xy of [[-1,0],[1,0],[1,1],[-1,0],[1,1],[-1,1]])seeds.push(...s,...xy);}
      gl.bindBuffer(gl.ARRAY_BUFFER,rainBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(seeds),gl.STATIC_DRAW);
      /* Miesta uniformov a atribútov si drží modul sám. Ovládač ich hľadá
         podľa reťazca a v snímku ich je vyše dvadsať — pri každom otočení
         modelu to bola zbytočná práca navyše. */
      gpu={gl,main,rain,rainBuffer,contact,contactBuffer,flow:flowProg,flowBuffer:gl.createBuffer(),flowVertices:0,flowKey:'',meshes:new Map(),rainVertices:seeds.length/6,places:new Map()};
    }
    function draw(gl,camera,weatherOnly=false) {
      if(!context)return;init(gl);
      if(weatherOnly) {
        if(state.weather!=='rain')return;
        const c=context;
        gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        const p=gpu.rain;gl.useProgram(p);uniformCamera(gl,p,camera);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.rainBuffer);
        const a=A(p,'seed'),b=A(p,'corner');
        gl.enableVertexAttribArray(a);gl.enableVertexAttribArray(b);gl.vertexAttribPointer(a,4,gl.FLOAT,false,24,0);gl.vertexAttribPointer(b,2,gl.FLOAT,false,24,16);
        gl.uniform1f(U(p,'clock'),time);
        gl.uniform1f(U(p,'roofBase'),c.roofZ);
        gl.uniform1f(U(p,'roofRise'),c.roofRise||0);
        gl.uniform4f(U(p,'foot'),0,0,c.L,c.W);
        /* blade = [prvá os, rozteč, krytie, 1 = lamely]. Panelová strecha
           dostane nulu v poslednej zložke a zadrží všetko. */
        const zone=c.louverZone;
        gl.uniform4f(U(p,'blade'),
          zone?zone.x0:0,Math.max(1,c.pitch||183),Math.min(c.cover===undefined?0:c.cover,1e5),zone?1:0);
        gl.uniform4f(U(p,'zone'),zone?zone.x0:0,zone?zone.y0:0,zone?zone.x1:c.L,zone?zone.y1:c.W);
        /* Obálky vybavenia zastavia kvapku na streche auta alebo na stolíku
           namiesto toho, aby prepadla plechom. Prázdne miesto dostane
           nemožný obdĺžnik, takže test nikdy neprejde. */
        const boxes=currentPlan.items.filter(i=>loaded.has(i.key)).slice(0,3);
        const empty=[0,0,-1,-1],tops=[0,0,0];
        ['blockA','blockB','blockC'].forEach((name,i)=>{
          const item=boxes[i],box=item&&deck(item.key,loaded.get(item.key));
          if(!box){gl.uniform4f(U(p,name),...empty);return;}
          gl.uniform4f(U(p,name),item.x+box[0],item.y+box[1],item.x+box[2],item.y+box[3]);
          tops[i]=item.z+box[4];
        });
        gl.uniform3f(U(p,'blockTop'),tops[0],tops[1],tops[2]);
        gl.drawArrays(gl.TRIANGLES,0,gpu.rainVertices);
        gl.disableVertexAttribArray(a);gl.disableVertexAttribArray(b);
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
          const b=models[item.key].bounds;
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
      gl.uniform3fv(U(p,'paint'),state.paint==='graphite'?[.19,.23,.26]:state.paint==='blue'?[.13,.27,.36]:[.63,.67,.69]);
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
        gl.drawArrays(gl.TRIANGLES,0,m.count);
      }
    }
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;lastTime=0;}
    const clockNow=()=>(window.performance&&performance.now?performance.now():Date.now());
    const raining=()=>animates&&!stalled&&state.weather==='rain'&&!state.paused&&!reduced.matches&&!document.hidden&&visible;
    function tick(now) {
      raf=0;if(!raining())return;
      if(lastTime)time+=Math.min(.05,(now-lastTime)/1000);lastTime=now;
      /* Kreslí sa najviac tridsaťkrát za sekundu; čas medzitým beží ďalej, tak
         dážď nespomalí, len nezaberie každý snímok prehliadača. */
      if(frame&&now-lastPaint>=30) {
        const t0=clockNow(),ok=frame(fast),cost=clockNow()-t0;
        budget=budget?budget*.75+cost*.25:cost;
        if(ok===false){animates=false;sync();return;}
        /* Skutočnú cenu snímku určuje grafika, nie tento JavaScript, tak sa
           meria odstup medzi vykresleniami. Keď scéna nestíha, dážď si vypýta
           pohybové rozlíšenie — presne to, čo beží počas otáčania — a keď
           nestačí ani to, radšej zastane a povie to. */
        if(lastPaint) {
          const gap=now-lastPaint;pace=pace?pace*.8+gap*.2:gap;paints++;
          if(!fast&&paints>6&&pace>48){fast=true;paints=0;pace=0;}
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
    }
    document.addEventListener('visibilitychange',run);
    reduced.addEventListener('change',()=>{if(reduced.matches)state.paused=true;sync();run();});
    if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;run();},{threshold:0}).observe(stage);
    sync();
    return {state,prepare,draw,setFrame(fn){frame=fn;animates=true;run();},
      snapshot:()=>({mode:state.mode,count:currentPlan.items.length,capacity:currentPlan.capacity,
        weather:state.weather,paused:state.paused,flow:state.flow,animating:Boolean(raf),animates,fast,stalled,
        pace:Math.round(pace),
        frameCost:Math.round(budget*100)/100,clock:Math.round(time*1000)/1000,
        roof:context?{z:context.roofZ,rise:context.roofRise||0,panel:Boolean(context.panelRoof),
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
