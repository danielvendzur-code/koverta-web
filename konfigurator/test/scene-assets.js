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
for(const mode of ['car','bistro'])for(const L of [3000,5000,5500,6000,9000])for(const W of [2000,2700,4000,6000,8000])for(const boxDepth of [0,2700])for(const count of ['1','2','3','auto']) {
  const c={L,W,H:2400,post:150,boxDepth};const r=plan(c,mode,count);
  const bounds=r.items.map(i=>{const b=dimensions[i.key];return [i.x+b[0],i.y+b[1],i.x+b[3],i.y+b[4]];});
  bounds.forEach(b=>{assert(b[0]>=boxDepth+200);assert(b[2]<=L-200);assert(b[1]>=200);assert(b[3]<=W-200);});
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++) {
    const a=bounds[i],b=bounds[j];assert(a[2]<b[0]||b[2]<a[0]||a[3]<b[1]||b[3]<a[1],'scenery overlaps');
  }
}
assert.equal(plan({L:6000,W:6000,H:2400,post:150,boxDepth:0},'car','2').items.length,2);
assert.equal(plan({L:6000,W:6000,H:2400,post:150,boxDepth:2700},'car','2').items.length,0);
console.log('Scene assets PASS: packed normals, ground contact, bounds, multi-car separation and box exclusion.');
