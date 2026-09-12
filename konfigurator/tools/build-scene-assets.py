"""Rebuild display-only meshes. Usage: python build-scene-assets.py SOURCE_SEATING_DIR.
Car is an original generic design, not a manufacturer model. Seating is Poly Haven CC0.
Packed vertex: int16 position xyz (mm), int16 normal xyz, uint8 RGB + material.
"""
import gzip, json, math, pathlib, struct, sys
import numpy as np
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parents[1] / 'scene-assets'
OUT.mkdir(exist_ok=True)
V = []

def unit(x):
    x = np.array(x, dtype=float)
    return x / max(1e-10, np.linalg.norm(x))

def tri(p, color, mat=0, normals=None):
    n = unit(np.cross(np.subtract(p[1], p[0]), np.subtract(p[2], p[0])))
    if np.linalg.norm(n) < .5: return
    for i in range(3): V.append((p[i], n if normals is None or np.linalg.norm(normals[i]) < .5 else normals[i], color, mat))

def surface(fn, nu, nv, color, mat=0, reverse=False):
    def normal(u,v):
        e=.0001
        n=unit(np.cross(np.subtract(fn(min(1,u+e),v), fn(max(0,u-e),v)),
                           np.subtract(fn(u,min(1,v+e)), fn(u,max(0,v-e)))))
        return -n if reverse else n
    grid=[[fn(i/nu,j/nv) for j in range(nv+1)] for i in range(nu+1)]
    norms=[[normal(i/nu,j/nv) for j in range(nv+1)] for i in range(nu+1)]
    for i in range(nu):
        for j in range(nv):
            for ids in [[(i,j),(i+1,j),(i+1,j+1)],[(i,j),(i+1,j+1),(i,j+1)]]:
                if reverse: ids.reverse()
                tri([grid[a][b] for a,b in ids],color,mat,[norms[a][b] for a,b in ids])

def ellipsoid(c,r,color,mat=0,nu=32,nv=16):
    surface(lambda u,v: np.array(c)+np.array(r)*[math.cos(u*math.tau)*math.sin(v*math.pi),
        math.sin(u*math.tau)*math.sin(v*math.pi),math.cos(v*math.pi)],nu,nv,color,mat,True)

def tube(a,b,r,color,mat=0,n=12):
    a=np.array(a);b=np.array(b);d=unit(b-a);q=unit(np.cross(d,[0,0,1] if abs(d[2])<.9 else [0,1,0]));s=np.cross(d,q)
    surface(lambda u,v:a+(b-a)*v+r*(q*math.cos(u*math.tau)+s*math.sin(u*math.tau)),n,1,color,mat)
    for c,sgn in [(a,-1),(b,1)]:
        for i in range(n):
            pts=[c,c+r*(q*math.cos(i*math.tau/n)+s*math.sin(i*math.tau/n)),c+r*(q*math.cos((i+1)*math.tau/n)+s*math.sin((i+1)*math.tau/n))]
            if sgn<0:pts.reverse()
            tri(pts,color,mat)

def save(name):
    data=bytearray()
    for p,n,c,m in V:
        data.extend(struct.pack('<6h4B',*[round(v) for v in p],*[round(float(v)*32767) for v in unit(n)],*c,m))
    (OUT / (name+'.bin.gz')).write_bytes(gzip.compress(data,mtime=0))
    p=np.array([v[0] for v in V])
    print(name,len(V)//3,'triangles',len(data),'bytes',p.min(axis=0).round(1),p.max(axis=0).round(1))
    V.clear()

# A touring sedan, 4720 mm long, with a 2790 mm wheelbase. Sculpted continuous
# surfaces, real open wheel arches, dished alloy rims and separate glazing.
paint=(155,162,165); glass=(40,55,64); rubber=(27,29,31); alloy=(174,182,188)
stations=np.array([[0,780,610],[180,865,690],[600,910,795],[930,926,850],
    [1330,916,875],[1750,900,885],[2800,904,887],[3660,930,866],[4250,910,840],[4570,865,795],[4720,790,690]])

def spline(x,k):
    i=max(0,min(len(stations)-2,np.searchsorted(stations[:,0],x)-1));a=stations[i];b=stations[i+1];t=(x-a[0])/(b[0]-a[0]);t=max(0,min(1,t))
    def slope(j):
        lo=max(0,j-1);hi=min(len(stations)-1,j+1)
        return (stations[hi,k]-stations[lo,k])/(stations[hi,0]-stations[lo,0])
    return (2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*slope(i)*(b[0]-a[0])+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*slope(i+1)*(b[0]-a[0])

def sill(x):
    # Bottom edge of the flank. The bare arch circle stops at z=340 while the
    # rocker sits at 190, so max() left a 150 mm vertical step within a few
    # millimetres of x and the side surface stretched a thin pale triangle
    # across it, just ahead of each wheel. The opening now fades into the
    # rocker over the last 90 mm and the edge is continuous.
    z=190.
    for axle in [930,3720]:
        d=abs(x-axle)
        if d<470:
            arch=340+380*math.sqrt(max(0.,1-(d/380.)**2)) if d<380 else 340.
            fade=min(1.,max(0.,(470-d)/90.))
            z=max(z,190+(arch-190)*fade)
    return z

for sign in [-1,1]:
    def side(u,v,s=sign):
        x=u*4720;w=spline(x,1);top=spline(x,2);bottom=sill(x)
        return [x,s*(w-35*(1-v)**2+14*math.sin(math.pi*v)-19*v**8),bottom+(top-bottom)*v]
    surface(side,180,8,paint,1,sign<0)
    # Sculpted arch lips follow the actual opening, not an overlaid black disc.
    for axle in [930,3720]:
        surface(lambda u,v,axle=axle,s=sign:[axle+(380+14*v)*math.cos(u*math.pi),s*(spline(axle+(380+14*v)*math.cos(u*math.pi),1)-32+10*v),340+(380+14*v)*math.sin(u*math.pi)],36,2,paint,1,sign<0)
    # Wheel houses. Without them the arch opening looked straight through the
    # car to the inside of the far flank, which read as a stray pale panel
    # sitting behind the wheel. A dark tunnel closes the opening.
    for axle in [930,3720]:
        depth=250
        surface(lambda u,v,axle=axle,s=sign,depth=depth:[axle+394*math.cos(u*math.pi),
            s*(spline(axle+394*math.cos(u*math.pi),1)-30-v*depth),
            340+394*math.sin(u*math.pi)],36,3,(38,41,44),0,sign>0)
        surface(lambda u,v,axle=axle,s=sign,depth=depth:[axle+394*v*math.cos(u*math.pi),
            s*(spline(axle,1)-30-depth),340+394*v*math.sin(u*math.pi)],36,2,(30,33,36),0,sign<0)
    # Lower rocker rail between the wheels.
    tube([1340,sign*891,200],[3290,sign*897,200],14,(55,61,65),0)

# Hood and boot have a gentle crown across their width.
for x0,x1 in [(0,1540),(3440,4720)]:
    surface(lambda u,v,x0=x0,x1=x1:[x0+(x1-x0)*u,(v*2-1)*(spline(x0+(x1-x0)*u,1)-19),spline(x0+(x1-x0)*u,2)+28*math.sin(v*math.pi)],40,20,paint,1)

# Cabin: front/rear windscreens join the metal roof with a constant pillar gap.
def cabin(x,y):
    # Four stations gave a straight windscreen meeting a flat roof at a hard
    # corner, so the cabin read as a box. These stations ease the screens into
    # the roof, taper the greenhouse towards the rear and give the roof a
    # crown you can actually see.
    height=float(np.interp(x,[1500,1680,1900,2090,2450,2800,3010,3230,3450],
                             [900,1128,1330,1424,1446,1442,1386,1168,900]))
    width=float(np.interp(x,[1500,1680,1900,2090,2450,2800,3010,3230,3450],
                            [868,796,742,720,714,716,732,796,870]))
    return [x,y*width,height+34*(1-y*y)*(1-.28*y*y)]
for a,b,c,m in [(1500,1550,paint,1),(1550,2050,glass,2),(2050,2100,paint,1),(2100,2800,paint,1),(2800,2840,paint,1),(2840,3400,glass,2),(3400,3450,paint,1)]:
    surface(lambda u,v,a=a,b=b:cabin(a+(b-a)*u,v*2-1),18,20,c,m)
for sign in [-1,1]:
    # Separate doors and B pillar. Roof side profile has a curved shoulder.
    for a,b in [(1560,2410),(2460,3370)]:
        def window(u,v,a=a,b=b,s=sign):
            x=a+(b-a)*u;top=cabin(x,s);bottom=915
            return [x,s*(884+(abs(top[1])-884)*v),bottom+(top[2]-bottom-16)*v]
        surface(window,24,8,glass,2,sign>0)
    for a,b in [(1500,1560),(2410,2460),(3370,3450)]:
        surface(lambda u,v,a=a,b=b,s=sign:[a+(b-a)*u,s*(884+(abs(cabin(a+(b-a)*u,s)[1])-884)*v),892+(cabin(a+(b-a)*u,s)[2]-892)*v],8,8,paint,1,sign>0)
    # Window seals/chrome and restrained door seams and flush handles.
    tube([1530,sign*886,909],[3420,sign*886,909],5,(135,145,150),3)
    for x in [2435,3400]:
        tube([x,sign*(spline(x,1)+1),735],[x,sign*(spline(x,1)-24),245],2.4,(71,78,82),0)
    for x in [2240,3190]:ellipsoid([x,sign*920,825],[65,8,12],alloy,3,20,8)
    # Mirror housing rather than a ball on a stick: a wider shell on a short
    # flattened stalk, with the glass recessed into its trailing face.
    tube([1726,sign*881,968],[1684,sign*966,1002],17,(35,39,43))
    ellipsoid([1652,sign*1004,1028],[122,54,52],paint,1)
    ellipsoid([1686,sign*1006,1030],[4,44,40],(90,111,126),2,22,12)

# Bumpers, intake and slim lamps, all closed surfaces.
for x,sgn in [(0,-1),(4720,1)]:
    # The end cap used to be a flat full-width plate 200..690 mm high with a
    # fixed 780 mm half-width. At both ends it stood proud of the bodywork and
    # read as a loose sheet hanging off the car. It now closes onto the body's
    # own silhouette, using exactly the section that side() draws, so the cap
    # and the flanks meet along one edge.
    _w=spline(x,1);_top=spline(x,2);_bot=sill(x)
    def cap(u,v,x=x,sgn=sgn,w=_w,top=_top,bot=_bot):
        y=u*2-1
        section=w-35*(1-v)**2+14*math.sin(math.pi*v)-19*v**8
        bulge=26*math.sin(math.pi*v)*math.sqrt(max(0.,1-y*y))
        return [x+sgn*bulge,y*section,bot+(top-bot)*v]
    surface(cap,30,14,paint,1,sgn<0)
    # Only the front carries a cooling intake. The rear used to get the same
    # wide dark oval with a pale oval inside it, which read as a hole punched
    # in the bumper. It now gets what a rear actually has: a slim low
    # diffuser, a plate and two reflectors.
    if sgn<0:
        ellipsoid([x-24,0,392],[14,548,80],(24,29,32),0)
        ellipsoid([x-38,0,286],[5,172,46],(206,209,203),0,24,8)
    else:
        ellipsoid([x+20,0,262],[11,462,31],(28,32,35),0)
        ellipsoid([x+35,0,432],[5,172,46],(206,209,203),0,24,8)
        for s in [-1,1]:
            ellipsoid([x+19,s*486,284],[8,54,16],(150,36,32),4,16,8)
    for s in [-1,1]:
        ellipsoid([x+sgn*21,s*652,608],[18,137,26],(220,229,222) if sgn<0 else (141,27,28),4,28,10)
        if sgn>0:tube([4690,s*628,212],[4760,s*628,212],34,(103,112,119),3,20)

# Four real tyres, alloy barrels, ventilated discs and ten slender spokes.
for axle in [930,3720]:
    for sign in [-1,1]:
        yc=sign*825
        surface(lambda u,v,axle=axle,yc=yc:[axle+(282+57*math.cos(v*math.tau))*math.cos(u*math.tau),yc+112*math.sin(v*math.tau),340+(282+57*math.cos(v*math.tau))*math.sin(u*math.tau)],64,16,rubber,0)
        outer=sign*939
        tube([axle,outer-sign*70,340],[axle,outer,340],240,(47,53,59),3,48)
        tube([axle,outer-sign*32,340],[axle,outer-sign*27,340],190,(111,116,117),3,48)
        for j in range(10):
            a=j*math.tau/10
            tube([axle+48*math.cos(a),outer+sign*2,340+48*math.sin(a)],
                 [axle+231*math.cos(a+.1),outer,340+231*math.sin(a+.1)],13,alloy,3,6)
        tube([axle,outer,340],[axle,outer+sign*9,340],57,alloy,3,24)
        for j in range(5):
            a=j*math.tau/5
            ellipsoid([axle+37*math.cos(a),outer+sign*10,340+37*math.sin(a)],[6,4,6],(35,38,41),3,8,4)
        # Fine tread shoulders rather than high-contrast stripes.
        for offset in [-65,65]:
            surface(lambda u,v,axle=axle,yc=yc,offset=offset:[axle+(330+v*2)*math.cos(u*math.tau),yc+offset,340+(330+v*2)*math.sin(u*math.tau)],64,1,(36,38,39),0)
save('touring-sedan')

if len(sys.argv)>1:
    src=pathlib.Path(sys.argv[1]);g=json.loads((src/'seating.gltf').read_text());buffers=[(src/b['uri']).read_bytes() for b in g['buffers']]
    def accessor(i):
        a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']];dt={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]
        return np.ndarray((a['count'],n),dtype=dt,buffer=buffers[v['buffer']],offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dt).itemsize*n),np.dtype(dt).itemsize)).copy()
    textures={}
    for i,m in enumerate(g['materials']):
        t=g['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]
        textures[i]=np.asarray(Image.open(src/g['images'][t['source']]['uri']).convert('RGB'))
    for node in g['nodes']:
        if 'mesh' not in node:continue
        q=node.get('rotation',[0,0,0,1]);x,y,z,w=q
        rot=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        for p in g['meshes'][node['mesh']]['primitives']:
            pos=accessor(p['attributes']['POSITION'])@rot.T;norm=accessor(p['attributes']['NORMAL'])@rot.T
            pos=pos[:,[0,2,1]]*1000;norm=norm[:,[0,2,1]];pos[:,1]*=-1;norm[:,1]*=-1
            uv=accessor(p['attributes']['TEXCOORD_0']);tex=textures[p['material']];th,tw,_=tex.shape
            colors=tex[(uv[:,1]*th).astype(int)%th,(uv[:,0]*tw).astype(int)%tw]
            for ids in accessor(p['indices']).reshape(-1,3):
                for j in ids:V.append((pos[j],norm[j],tuple(map(int,colors[j])),0))
    floor=min(v[0][2] for v in V)
    for v in V:v[0][2]-=floor
    save('patio-bistro')
