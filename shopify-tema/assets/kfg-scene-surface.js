/* Vertical precipitation queries against real triangles. Spatial buckets are
   built only when geometry changes; no ray tests or mesh rebuilds per frame. */
(() => {
  'use strict';
  function build(polygons) {
    const tris=[],lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
    for(const p of polygons)for(let j=1;j<p.length-1;j++) {
      const a=p[0],b=p[j],c=p[j+1];
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      const det=ux*vy-uy*vx;if(Math.abs(det)<.00001)continue;
      let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=det;
      const norm=Math.hypot(nx,ny,nz)*(det<0?-1:1);nx/=norm;ny/=norm;nz/=norm;
      const bounds=[Math.min(a[0],b[0],c[0]),Math.min(a[1],b[1],c[1]),Math.max(a[0],b[0],c[0]),Math.max(a[1],b[1],c[1])];
      for(let k=0;k<2;k++){lo[k]=Math.min(lo[k],bounds[k]);hi[k]=Math.max(hi[k],bounds[k+2]);}
      tris.push({a,ux,uy,uz,vx,vy,vz,det,n:[nx,ny,nz],bounds});
    }
    const size=32,buckets=Array.from({length:size*size},()=>[]);
    const sx=Math.max(1,hi[0]-lo[0]),sy=Math.max(1,hi[1]-lo[1]);
    const bx=x=>Math.max(0,Math.min(size-1,Math.floor((x-lo[0])/sx*size)));
    const by=y=>Math.max(0,Math.min(size-1,Math.floor((y-lo[1])/sy*size)));
    for(const t of tris)for(let y=by(t.bounds[1]);y<=by(t.bounds[3]);y++)for(let x=bx(t.bounds[0]);x<=bx(t.bounds[2]);x++)buckets[y*size+x].push(t);
    return {triangles:tris.length,hit(x,y){
      if(x<lo[0]||x>hi[0]||y<lo[1]||y>hi[1])return null;
      let hit=null;
      for(const t of buckets[by(y)*size+bx(x)]) {
        const px=x-t.a[0],py=y-t.a[1];
        const u=(px*t.vy-py*t.vx)/t.det,v=(t.ux*py-t.uy*px)/t.det;
        if(u<-.000001||v<-.000001||u+v>1.000001)continue;
        const z=t.a[2]+u*t.uz+v*t.vz;
        if(!hit||z>hit.z)hit={z,normal:t.n};
      }
      return hit;
    }};
  }
  function packed(data) {
    const v=new DataView(data),polys=[];
    for(let i=0;i<data.byteLength;i+=48) {
      const p=[];for(let j=0;j<3;j++)p.push([v.getInt16(i+j*16,true),v.getInt16(i+j*16+2,true),v.getInt16(i+j*16+4,true)]);
      polys.push(p);
    }
    return build(polys);
  }
  window.SP_SURFACE={build,packed};
})();
