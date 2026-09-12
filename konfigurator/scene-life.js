/* Optional display scenery. Shares the canopy's depth buffer and projection.
   No price, product dimension or louver state is mutated by this module. */
(() => {
  'use strict';
  const base = new URL('./scene-assets/', document.currentScript.src);
  const assets = new Map();
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const models = {
    car: { file:'touring-sedan.bin.gz', bounds:[-44,-1062,0,4764,1062,1462] },
    bistro: { file:'patio-bistro.bin.gz', bounds:[-426,-907,0,317,812,894] }
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
      if(available<1343 || c.W-2*margin<2319)return {items:[],capacity:0,reason:'Pre posedenie a odsunutie stoličiek tu nie je dosť voľného miesta.'};
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
    const state={mode:/koverta|carport/.test(family)?'car':'bistro',count:'1',weather:'sun',paused:matchMedia('(prefers-reduced-motion: reduce)').matches,flow:false,paint:'silver'};
    let context=null,frame=null,raf=0,visible=true,lastTime=0,time=0,currentPlan={items:[],capacity:0},gpu=null,loading=new Set(),loaded=new Map(),failure='';
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const stage=root.querySelector('.sp-stage');
    const panel=document.createElement('details');panel.className='sp-scene';
    panel.innerHTML=`<summary><span>Vybavenie priestoru</span><span class="sp-scene__summary">Náhľad priestoru</span></summary>
      <div class="sp-scene__body">
        <div class="sp-scene__row"><span class="sp-scene__label">Pod prístreškom</span><div class="sp-scene__choices" role="group" aria-label="Vybavenie priestoru">
          <button type="button" data-scene-mode="none">Bez vybavenia</button><button type="button" data-scene-mode="car">Auto</button><button type="button" data-scene-mode="bistro">Posedenie</button></div></div>
        <div class="sp-scene__row" data-scene-countrow><label class="sp-scene__label" for="sp-scene-count">Počet</label><select id="sp-scene-count" aria-label="Počet zostáv"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="auto">Podľa priestoru</option></select>
        <label class="sp-scene__paint">Lak auta <select aria-label="Lak auta"><option value="silver">Strieborná</option><option value="graphite">Grafitová</option><option value="blue">Modrá</option></select></label></div>
        <div class="sp-scene__row" hidden data-scene-weather-pending><span class="sp-scene__label">Počasie</span><div class="sp-scene__choices" role="group" aria-label="Počasie">
          <button type="button" data-scene-weather="sun">Slnečno</button><button type="button" data-scene-weather="cloud">Zamračené</button><button type="button" data-scene-weather="rain">Dážď</button></div></div>
        <div class="sp-scene__rain" hidden><button type="button" data-scene-pause>Pozastaviť dážď</button><label><input type="checkbox" data-scene-flow> Ukázať odtok vody</label></div>
        <p class="sp-scene__status" role="status" aria-live="polite"></p>
        <p class="sp-scene__note">Vybavenie slúži na predstavu o priestore a nie je súčasťou ceny.</p>
        <a class="sp-scene__credits" href="./scene-assets/CREDITS.md" target="_blank" rel="noopener">O 3D modeloch</a>
      </div>`;
    stage.insertAdjacentElement('afterend',panel);
    const diagram=document.createElement('aside');diagram.className='sp-drain-guide';diagram.hidden=true;
    diagram.innerHTML=`<strong>Ako odteká voda</strong><ol><li><i>1</i><span data-drain-roof>Strecha zachytí dážď</span></li><li><i>2</i><span>Žľab zvedie vodu k výpustu</span></li><li><i>3</i><span data-drain-pipe>Zvod odvedie vodu nadol</span></li></ol><small>Schematické znázornenie. Skryté rozvody ostávajú zakryté.</small>`;
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
        const open=!context.panelRoof && context.louverT>.01;
        diagram.querySelector('[data-drain-roof]').textContent=open?'Otvorenými lamelami dážď prechádza':'Strecha zachytí dážď';
        diagram.querySelector('[data-drain-pipe]').textContent=context.kv?'Vonkajší zvod vedľa stĺpa':'Skrytý zvod v stĺpe';
      }
      const message=failure || (loading.size?'Načítavam 3D vybavenie…':currentPlan.reason||
        (state.mode==='car'?`${currentPlan.items.length} × Touring sedan · dĺžka 4,81 m vrátane detailov · šírka 2,13 m so zrkadlami`:
         state.mode==='bistro'?`${currentPlan.items.length} × stolík a dve stoličky · drevo / kov`:''));
      if(status.textContent!==message)status.textContent=message;
      panel.querySelector('.sp-scene__summary').textContent=state.mode==='car'?'Auto':state.mode==='bistro'?'Posedenie':'Bez vybavenia';
    }
    const update=()=>{failure='';if(context)prepare(context);changed();};
    panel.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.sceneMode){state.mode=b.dataset.sceneMode;state.count='1';}
      if(b.dataset.sceneWeather)state.weather=b.dataset.sceneWeather;
      if(b.hasAttribute('data-scene-pause'))state.paused=!state.paused;
      update();
    });
    countSelect.addEventListener('change',()=>{state.count=countSelect.value;update();});
    paintSelect.addEventListener('change',()=>{state.paint=paintSelect.value;update();});
    panel.querySelector('[data-scene-flow]').addEventListener('change',e=>{state.flow=e.target.checked;update();});
    function prepare(c) {
      context=c;currentPlan=plan(c,state.mode,state.count);
      for(const item of currentPlan.items)if(!loaded.has(item.key)&&!loading.has(item.key)) {
        loading.add(item.key);load(item.key).then(data=>{loaded.set(item.key,data);loading.delete(item.key);changed();sync();},()=>{
          loading.delete(item.key);failure='3D model sa nenačítal. Skúste znova vybrať vybavenie.';sync();
        });
      }
      sync();
    }
    function uniformCamera(gl,p,camera) {
      const u=(n)=>gl.getUniformLocation(p,n),c=context;
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
      const rain=program(gl,`precision highp float;attribute vec4 seed;attribute vec2 corner;uniform float viewportHeight;${projection}
        uniform float clock;uniform float roof;uniform float opening;uniform float pitch;uniform float bladeWidth;
        varying float opacity;
        void main(){float x=seed.x*(extent.x+1800.)-900.;float y=seed.y*(extent.y+1800.)-900.;
          bool inside=x>100.&&x<extent.x-100.&&y>100.&&y<extent.y-100.;
          float covered=bladeWidth*abs(cos(opening));float phase=mod(x-150.,pitch);
          bool hit=inside&&(opening<.001||phase<covered);
          float bottom=hit?roof+5.:10.;float span=roof+1800.-bottom;
          float z=bottom+(1.-fract(seed.z+clock*(.85+seed.w*.35)))*span;
          vec3 pos=vec3(x+corner.x*7.,y,z+corner.y*125.);
          gl_Position=project(pos);opacity=.28+seed.w*.3;}`,
        `precision mediump float;varying float opacity;void main(){gl_FragColor=vec4(.52,.71,.82,opacity);}`);
      const rainBuffer=gl.createBuffer(),seeds=[];
      let rand=9307;const random=()=>{rand=(rand*1664525+1013904223)>>>0;return rand/4294967296;};
      for(let i=0;i<360;i++){const s=[random(),random(),random(),random()];for(const xy of [[-1,0],[1,0],[1,1],[-1,0],[1,1],[-1,1]])seeds.push(...s,...xy);}
      gl.bindBuffer(gl.ARRAY_BUFFER,rainBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(seeds),gl.STATIC_DRAW);
      gpu={gl,main,rain,rainBuffer,meshes:new Map(),rainVertices:seeds.length/6};
    }
    function draw(gl,camera,weatherOnly=false) {
      if(!context)return;init(gl);
      if(weatherOnly) {
        if(state.weather!=='rain')return;
        const p=gpu.rain;gl.useProgram(p);uniformCamera(gl,p,camera);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.rainBuffer);
        const a=gl.getAttribLocation(p,'seed'),b=gl.getAttribLocation(p,'corner');
        gl.enableVertexAttribArray(a);gl.enableVertexAttribArray(b);gl.vertexAttribPointer(a,4,gl.FLOAT,false,24,0);gl.vertexAttribPointer(b,2,gl.FLOAT,false,24,16);
        gl.uniform1f(gl.getUniformLocation(p,'clock'),time);
        gl.uniform1f(gl.getUniformLocation(p,'roof'),context.roofZ);
        gl.uniform1f(gl.getUniformLocation(p,'opening'),context.panelRoof?0:context.louverAngle);
        gl.uniform1f(gl.getUniformLocation(p,'pitch'),context.pitch||183);
        gl.uniform1f(gl.getUniformLocation(p,'bladeWidth'),context.bladeWidth||200);
        gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES,0,gpu.rainVertices);gl.depthMask(true);return;
      }
      const p=gpu.main;gl.useProgram(p);uniformCamera(gl,p,camera);
      const ca=Math.cos(context.az),sa=Math.sin(context.az),ce=Math.cos(context.el),se=Math.sin(context.el);
      gl.uniform3f(gl.getUniformLocation(p,'eye'),context.L/2-sa*ce*camera.DIST,context.W/2+ca*ce*camera.DIST,context.H/2+se*camera.DIST);
      gl.uniform3fv(gl.getUniformLocation(p,'paint'),state.paint==='graphite'?[.19,.23,.26]:state.paint==='blue'?[.13,.27,.36]:[.63,.67,.69]);
      gl.uniform1f(gl.getUniformLocation(p,'overcast'),state.weather==='sun'?0:.85);
      gl.uniform1f(gl.getUniformLocation(p,'alpha'),1);
      gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);
      for(const item of currentPlan.items) {
        const data=loaded.get(item.key);if(!data)continue;
        let m=gpu.meshes.get(item.key);if(!m){m={buffer:gl.createBuffer(),count:data.byteLength/16};gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gpu.meshes.set(item.key,m);}
        gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);
        for(const [name,size,type,norm,offset] of [['p',3,gl.SHORT,false,0],['n',3,gl.SHORT,true,6],['c',3,gl.UNSIGNED_BYTE,true,12],['material',1,gl.UNSIGNED_BYTE,false,15]]) {
          const loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,norm,16,offset);
        }
        gl.uniform3f(gl.getUniformLocation(p,'offset'),item.x,item.y,item.z);
        gl.drawArrays(gl.TRIANGLES,0,m.count);
      }
    }
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;lastTime=0;}
    function tick(now) {
      raf=0;if(document.hidden||!visible||state.weather!=='rain'||state.paused||reduced.matches)return;
      if(lastTime)time+=Math.min(.05,(now-lastTime)/1000);lastTime=now;
      if(frame)frame();raf=requestAnimationFrame(tick);
    }
    function run(){stop();if(state.weather==='rain'&&!state.paused&&!reduced.matches&&!document.hidden&&visible)raf=requestAnimationFrame(tick);}
    document.addEventListener('visibilitychange',run);
    reduced.addEventListener('change',()=>{if(reduced.matches)state.paused=true;sync();run();});
    if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;run();},{threshold:0}).observe(stage);
    sync();
    return {state,prepare,draw,setFrame(fn){frame=fn;run();},snapshot:()=>({mode:state.mode,count:currentPlan.items.length,capacity:currentPlan.capacity,weather:state.weather,paused:state.paused,loaded:[...loaded.keys()],items:currentPlan.items.map(i=>({...i,bounds:models[i.key].bounds}))})};
  }
  window.SP_SCENE={create,plan};
})();
