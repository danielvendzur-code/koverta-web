'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const sandbox={URL,document:{currentScript:{src:'https://example.test/konfigurator/scene-life.js'}},window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'scene-life.js'),'utf8'),sandbox);
const plan=sandbox.window.SP_SCENE.plan;
const models=sandbox.window.SP_SCENE.models;
// Measure the meshes and hold scene-life.js to them. The declared bounds drive
// every clearance decision, so a rebuilt mesh that silently outgrows them would
// otherwise park a car through a post.
const dimensions={};
for(const [key,model] of Object.entries(models)) {
  const file=model.file.replace(/\.bin\.gz$/,'');
  const data=zlib.gunzipSync(fs.readFileSync(path.join(root,'scene-assets',file+'.bin.gz')));
  assert.equal(data.length%48,0);assert(data.length>100000);
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.length;i+=16){
    const n=Math.hypot(data.readInt16LE(i+6),data.readInt16LE(i+8),data.readInt16LE(i+10))/32767;
    assert(Math.abs(n-1)<.002,`${file}: malformed normal at ${i}`);
    assert(data.readInt16LE(i+4)>=0,`${file}: geometry below floor`);
    for(let k=0;k<3;k++){const v=data.readInt16LE(i+k*2);if(v<lo[k])lo[k]=v;if(v>hi[k])hi[k]=v;}
  }
  const measured=[...lo,...hi];
  // model.bounds comes from the vm context, so spread it into this realm
  // before comparing: deepStrictEqual also checks the prototype.
  assert.deepEqual([...model.bounds],measured,
    `${file}: scene-life.js bounds ${JSON.stringify(model.bounds)} do not match the mesh ${JSON.stringify(measured)}`);
  dimensions[key]=measured;
}
// Vybavenie sa smie postaviť aj otočené o štvrť otáčky; obálka sa vtedy otočí
// s ním. Kontroly odstupov musia počítať s tou istou obálkou ako scene-life.js,
// inak by otočený stolík prešiel testom aj keby stál v stĺpe.
const turned=(b,rot)=>rot?[-b[4],b[0],b[2],-b[1],b[3],b[5]]:b;
const footprint=(i)=>{const b=turned(dimensions[i.key],i.rotation);return [i.x+b[0],i.y+b[1],i.x+b[3],i.y+b[4]];};
for(const mode of ['car','bistro'])for(const L of [3000,5000,5500,6000,9000])for(const W of [2000,2700,4000,6000,8000])for(const boxDepth of [0,2700])for(const count of ['1','2','3','auto'])for(const car of ['auto','sedan','city',undefined]) {
  const c={L,W,H:2400,post:150,boxDepth};const r=plan(c,mode,count,null,car);
  // Kto si model zvolil, musí ho dostať — inak by prepínač len klamal.
  if(mode==='car'&&(car==='sedan'||car==='city'))r.items.forEach(i=>assert.equal(i.key,car,'zvolený model auta sa nedodržal'));
  for(const i of r.items)assert(i.rotation===0||Math.abs(i.rotation-Math.PI/2)<1e-9,`neznáme otočenie ${i.rotation}`);
  const bounds=r.items.map(footprint);
  bounds.forEach(b=>{assert(b[0]>=boxDepth+200);assert(b[2]<=L-200);assert(b[1]>=200);assert(b[3]<=W-200);});
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++) {
    const a=bounds[i],b=bounds[j];assert(a[2]<b[0]||b[2]<a[0]||a[3]<b[1]||b[3]<a[1],'scenery overlaps');
  }
}
assert.equal(plan({L:6000,W:6000,H:2400,post:150,boxDepth:0},'car','2').items.length,2);
// Dve autá pri automatickom výbere majú byť dva rôzne modely: náhľad má ukázať
// obe veľkosti, nie tú istú karosériu dvakrát.
{
  const two=plan({L:6000,W:6000,H:2400,post:150,boxDepth:0},'car','2',null,'auto');
  assert.equal(two.items.length,2);
  assert.equal(new Set(two.items.map(i=>i.key)).size,2,'dve autá majú byť dva modely');
  // Aj tak musia stáť celé pod strechou a nie jedno v druhom.
  const b=two.items.map(footprint);
  assert(b[0][3]<b[1][1]||b[1][3]<b[0][1],'zmiešaná dvojica sa prekrýva');
  b.forEach(x=>{assert(x[0]>=200&&x[2]<=5800&&x[1]>=200&&x[3]<=5800,'zmiešaná dvojica vyčnieva');});
}
// Malé auto musí byť naozaj menšie, inak nemá zmysel ho ponúkať tam, kde sa
// sedan nezmestí.
assert(dimensions.city[3]-dimensions.city[0]<dimensions.sedan[3]-dimensions.sedan[0],'malé auto nie je kratšie');
assert(dimensions.city[4]-dimensions.city[1]<dimensions.sedan[4]-dimensions.sedan[1],'malé auto nie je užšie');
assert.equal(plan({L:6000,W:6000,H:2400,post:150,boxDepth:2700},'car','2').items.length,0);
// Interior posts must reduce capacity or split rows, never pierce a car.
for(const obstacles of [[[2600,2850,2750,3000]],[[1000,1500,1150,1650],[4200,4400,4350,4550]]]) {
  const r=plan({L:6000,W:8000,H:2400,post:150,boxDepth:0,obstacles},'car','auto');
  const bounds=r.items.map(footprint);
  for(const a of bounds)for(const b of obstacles)assert(a[2]<=b[0]-79||a[0]>=b[2]+79||a[3]<=b[1]-79||a[1]>=b[3]+79,'car hits a post');
  for(let i=1;i<bounds.length;i++)assert(bounds[i][1]-bounds[i-1][3]>=599,'door clearance lost');
}
assert.equal(plan({L:6000,W:6000,H:1600,post:150,boxDepth:0},'car','auto').items.length,0,'car must fit under roof');
// Kde sa sedan nezmestí, má nastúpiť malé auto — o tom celá ponuka dvoch
// veľkostí je. Prístrešok kratší než sedan, ale dlhší než mestské auto.
{
  const tight=plan({L:4600,W:4000,H:2400,post:150,boxDepth:0},'car','1');
  assert.equal(tight.items.length,1,'do krátkeho prístrešku patrí malé auto');
  assert.equal(tight.items[0].key,'city');
}
console.log('Scene assets PASS: packed normals, ground contact, bounds, multi-car separation and box exclusion.');
