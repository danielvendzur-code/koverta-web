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

def mesh(grid,color,mat=0,flip=False,tint=None):
    """Quad grid whose normals come from its own tangents. Each patch shades on
    its own, so a seam between two patches stays a crisp edge instead of being
    averaged away — that is what draws a shoulder line on a car body."""
    P=np.asarray(grid,dtype=float)
    N=np.cross(np.gradient(P,axis=0),np.gradient(P,axis=1))
    if flip: N=-N
    N=N/np.maximum(np.linalg.norm(N,axis=2,keepdims=True),1e-9)
    for i in range(P.shape[0]-1):
        for j in range(P.shape[1]-1):
            c,m=tint(i,j) if tint else (color,mat)
            if c is None: continue
            for ids in [[(i,j),(i+1,j),(i+1,j+1)],[(i,j),(i+1,j+1),(i,j+1)]]:
                if flip: ids=ids[::-1]
                tri([P[a][b] for a,b in ids],c,m,[N[a][b] for a,b in ids])

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

# ---------------------------------------------------------------------------
# A generic modern liftback saloon: 4790 mm long, 1905 over the body, 2840 mm
# wheelbase, on 19" wheels. Not a manufacturer model.
#
# The body is lofted along x from a handful of longitudinal profiles. Each
# cross-section is a set of splined patches rather than one polyline, so the
# surface is smooth where a car is smooth and keeps a hard edge exactly where
# a car has one: the sill, the shoulder crease, the deck edge and the roof
# rail. Both ends are closed by a domed cap driven by the same section, which
# is what makes the bumper faces read as bumpers instead of cut-off plates.
paint=(150,157,161); glass=(28,38,46); rubber=(26,28,30); alloy=(178,185,191)
chrome=(198,205,210); trim=(24,26,28); lens=(232,238,242); tail=(146,30,32)
inner=(44,47,51); floorpan=(36,39,42); mesh_dark=(26,29,32)

LEN=4760; FA=960; RA=3870; WR=372; TW=126; ARCH=410
COWL=1640; ROOF_F=2320; ROOF_R=3400; DECK_R=4040
BPILLAR=(2650,2724)

def curve(x,xs,ys): return float(np.interp(x,xs,ys))

def smooth(t):
    t=max(0.,min(1.,t));return t*t*(3-2*t)

def spline(pts,n):
    """Catmull-Rom through the control points, sampled n+1 times."""
    p=[pts[0]]+list(pts)+[pts[-1]]
    out=[]
    segs=len(pts)-1
    for i in range(n+1):
        t=i/n*segs;k=min(segs-1,int(t));f=t-k
        p0,p1,p2,p3=p[k],p[k+1],p[k+2],p[k+3]
        out.append(tuple(.5*((2*p1[d])+(-p0[d]+p2[d])*f+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*f*f
                             +(-p0[d]+3*p1[d]-3*p2[d]+p3[d])*f*f*f) for d in (0,1)))
    return out

def hw(x):
    """Half width at the shoulder crease, with haunches over both axles."""
    base=curve(x,[0,30,80,160,280,500,900,1400,1900,2900,3600,4150,4450,4620,4700,LEN],
                 [592,648,708,768,818,862,900,924,930,930,926,908,870,812,756,690])
    for axle in (FA,RA):
        d=abs(x-axle)/660.
        if d<1: base+=13*math.cos(d*math.pi/2)**2
    return base

def sill(x):
    """Bottom edge of the flank; over an axle it becomes the wheel opening."""
    z=curve(x,[0,60,200,400,4400,4580,4690,LEN],[298,264,244,240,240,256,288,330])
    for axle in (FA,RA):
        d=abs(x-axle)
        if d<ARCH: z=max(z,WR+ARCH*(1-(d/ARCH)**2.3)**(1/2.3))
        elif d<ARCH+130: z=max(z,240+(WR-240)*(1-smooth((d-ARCH)/130.)))
    return z

def crease(x):
    return curve(x,[0,120,400,900,1400,2500,3500,4200,4550,LEN],
                   [688,712,762,788,798,802,804,800,776,734])

def deck(x):
    """Top of the bodyshell: bonnet, belt line, boot lid."""
    return curve(x,[0,60,200,600,1100,COWL,2200,3200,DECK_R,4400,4620,LEN],
                   [836,860,890,924,944,956,960,960,1004,1016,1000,952])

def dhw(x):
    """Half width of that top surface."""
    return curve(x,[0,60,200,600,1100,COWL,2200,3200,DECK_R,4400,4620,LEN],
                   [510,572,640,734,816,866,876,872,856,818,754,688])

def crown(x):
    return curve(x,[0,600,1400,COWL,DECK_R,4400,LEN],[10,22,30,26,22,18,10])

def section(x):
    """Half section as splined patches: smooth where a car is smooth, with a
    tangent break exactly at the sill, the door feature line, the shoulder
    crease and the deck edge — those four breaks are the highlights that make
    a body panel read as sheet metal."""
    w=hw(x);s=sill(x);c=crease(x);d=deck(x);t=dhw(x);k=crown(x);h=max(1.,d-c)
    f=s+(c-s)*.58
    return [
        [(0,172),(w*.42,168),(w*.74,s-56),(w*.86,s-20)],                     # underbody
        [(w*.86,s-20),(w*.926,s-6),(w*.947,s)],                              # sill lip
        [(w*.947,s),(w*.984,s+(f-s)*.44),(w*.998,f-8),(w,f)],                # lower door
        [(w,f),(w*.997,f+(c-f)*.40),(w*.999,f+(c-f)*.76),(w,c)],             # upper door
        [(w,c),(w*.993,c+h*.24),(w*.973,c+h*.54),(t+24,d-54),(t,d-8)],       # shoulder
        [(t,d-8),(t*.90,d+k*.30),(t*.58,d+k*.76),(0,d+k)],                   # deck
    ]

def flank_y(x,z):
    """Half width of the painted flank at a height, for trims that must sit on it."""
    pts=spline(section(x)[2],10)+spline(section(x)[3],10)+spline(section(x)[4],14)
    best=min(pts,key=lambda p:abs(p[1]-z))
    return best[0]

def build(xs,spec,sign,sec=section):
    secs=[sec(x) for x in xs]
    for k,item in enumerate(spec):
        if item is None: continue
        color,mat,n=item
        grid=[[[x,sign*p[0],p[1]] for p in spline(sc[k],n)] for x,sc in zip(xs,secs)]
        mesh(grid,color,mat,flip=sign>0)

def endcap(x0,sgn,depth,tint,sec=section):
    """Closes the loft with a dome driven by the same section: the loop keeps
    its height, narrows towards the centre and steps forward, so the bumper
    face is a surface and not a lid. `tint(z,v)` paints grille, lamps, plate."""
    loop=[]
    for patch in sec(x0): loop+=spline(patch,8)[:-1]
    loop.append(sec(x0)[-1][-1])
    full=[(-y,z) for y,z in reversed(loop)]+loop
    cols=9
    grid=[]
    for y,z in full:
        row=[]
        for j in range(cols):
            v=j/(cols-1)
            ins=tint(z,v)[2] if tint else 0
            row.append([x0+sgn*(depth*math.sin(v*math.pi/2)-ins),y*(1-v),z])
        grid.append(row)
    def cell(i,j):
        z=(full[i][1]+full[i+1][1])/2;v=(j+.5)/(cols-1)
        c=tint(z,v) if tint else (paint,1,0)
        return (c[0],c[1])
    mesh(grid,paint,1,flip=sgn>0,tint=cell)

# stations: dense at the ends and around the wheel openings
_xs={0,LEN,COWL,ROOF_F,ROOF_R,DECK_R,BPILLAR[0],BPILLAR[1]}
for a,b,st in [(0,400,16),(400,1500,30),(1500,4300,36),(4300,LEN,20)]:
    v=a
    while v<b: _xs.add(round(v,1)); v+=st
for axle in (FA,RA):
    v=axle-ARCH-160
    while v<axle+ARCH+160: _xs.add(round(v,1)); v+=15
XS=sorted(x for x in _xs if 0<=x<=LEN)
FRONT=[x for x in XS if x<=COWL];CABIN=[x for x in XS if COWL<=x<=DECK_R];REAR=[x for x in XS if x>=DECK_R]

for sign in (-1,1):
    build(XS,[(floorpan,0,3),(trim,0,2),(paint,1,6),(paint,1,5),(paint,1,9),None],sign)
    build(FRONT,[None]*5+[(paint,1,6)],sign)
    build(CABIN,[None]*5+[(inner,0,3)],sign)
    build(REAR,[None]*5+[(paint,1,6)],sign)

for sign in (-1,1):
    xs=[x for x in XS if x>=DECK_R-40]
    mesh([[[x,sign*(dhw(x)*t),deck(x)-6+curve(x,[DECK_R-40,DECK_R+90,DECK_R+240,LEN],[0,26,14,4])] for t in (0,.34,.68,1.0)] for x in xs],paint,1,flip=sign>0)

def front_tint(z,v):
    if z<214: return (floorpan,0,0)
    if 236<=z<=372: return (mesh_dark,0,34)               # lower intake
    if 424<=z<=642: return (mesh_dark,0,44)               # main grille
    if 300<=z<=404 and v>.72: return ((226,228,222),0,10) # number plate
    if 700<=z<=734 and v<.46: return (lens,4,10)          # headlamp signature
    if 666<=z<=776 and v<.5: return ((40,44,48),0,12)     # lamp housing
    return (paint,1,0)

def rear_tint(z,v):
    if z<210: return (floorpan,0,0)
    if 232<=z<=330: return (mesh_dark,0,26)               # diffuser
    if 596<=z<=712 and v>.70: return ((226,228,222),0,8)  # plate recess
    if 844<=z<=898: return (tail,4,10)                    # tail signature
    if 818<=z<=930: return ((54,27,29),0,12)
    return (paint,1,0)

endcap(0,-1,74,front_tint)
endcap(LEN,1,66,rear_tint)

# Wheel houses: the opening must not look straight through the car.
for axle in (FA,RA):
    xs=[x for x in XS if abs(x-axle)<ARCH+130 and sill(x)>248]
    for sign in (-1,1):
        grid=[]
        for x in xs:
            w=hw(x)*.947;s=sill(x);row=[]
            for j in range(5):
                t=j/4.
                row.append([x,sign*(w-10-t*250),s-4-t*44*(1-t*.6)])
            grid.append(row)
        mesh(grid,(42,45,48),0,flip=sign<0)
        edge=[[x,sign*(hw(x)*.947-260),sill(x)-30] for x in xs]
        mesh([edge,[[p[0],p[1],184] for p in edge]],(34,37,40),0,flip=sign>0)

# ---- greenhouse -----------------------------------------------------------
def roofz(x):
    return curve(x,[COWL,1830,2050,ROOF_F,2800,ROOF_R,3700,3900,DECK_R],
                   [deck(COWL),1196,1358,1462,1472,1454,1330,1168,deck(DECK_R)])

def ghw(x):
    return curve(x,[COWL,1960,ROOF_F,2800,ROOF_R,3800,DECK_R],
                   [dhw(COWL),786,734,726,716,730,762])

def gsection(x):
    b=dhw(x);d=deck(x);r=roofz(x);g=ghw(x);h=max(1.,r-d);k=min(24.,h*.09)
    rail=r-min(150.,h*.30)
    return [
        [(b,d),(b*.998,d+h*.20),(g*1.012,d+h*.60),(g,rail)],
        [(g,rail),(g*.945,r-min(58.,h*.13)),(g*.79,r-min(15.,h*.045)),(g*.44,r+k*.55),(0,r+k)],
    ]

def gxs(a,b,step=16):
    v=a;out=[]
    while v<b-1e-6: out.append(round(v,1)); v+=step
    out.append(b);return out

pillar=(26,28,30)
for sign in (-1,1):
    build(gxs(COWL,ROOF_F),[(paint,1,5),(glass,2,7)],sign,gsection)            # A pillar + windscreen
    for a,b in [(ROOF_F,BPILLAR[0]),(BPILLAR[1],ROOF_R)]:
        build(gxs(a,b),[(glass,2,5),(paint,1,7)],sign,gsection)                # side glass + roof
    build(gxs(*BPILLAR,step=12),[(pillar,0,5),(paint,1,7)],sign,gsection)      # B pillar
    build(gxs(ROOF_R,DECK_R),[(paint,1,5),(glass,2,7)],sign,gsection)          # C pillar + backlight
    # bright surround along the belt and over the roof rail
    tube([COWL+70,sign*(dhw(COWL)-4),deck(COWL)+22],[DECK_R-90,sign*(dhw(DECK_R)-4),deck(DECK_R)+18],6,chrome,3,8)
    for a,b in [(ROOF_F+40,BPILLAR[0]),(BPILLAR[1],ROOF_R-30)]:
        tube([a,sign*(ghw(a)-2),roofz(a)-min(150.,(roofz(a)-deck(a))*.30)],
             [b,sign*(ghw(b)-2),roofz(b)-min(150.,(roofz(b)-deck(b))*.30)],6,chrome,3,8)
    # seats and head restraints, seen through the glass
    for x in (2380,3010):
        mesh([[[x-40,sign*130,958],[x-40,sign*420,958]],[[x+34,sign*140,1226],[x+34,sign*400,1226]]],(54,57,62),0,flip=sign<0)
        ellipsoid([x+18,sign*272,1262],[88,124,68],(48,51,56),0,14,8)
mesh([[[COWL+70,-820,958],[COWL+70,820,958]],[[COWL+520,-792,1046],[COWL+520,792,1046]]],(50,53,58),0)
ellipsoid([3440,0,1476],[148,26,52],paint,1,14,8)

# ---- lamps that wrap onto the flanks, shut lines, handles, mirrors --------
for sign in (-1,1):
    xs=[x for x in XS if x<=440]
    mesh([[[x,sign*(flank_y(x,z)-3),z] for z in (674,696,740,770)] for x in xs],(40,44,48),0,flip=sign>0)
    mesh([[[x,sign*(flank_y(x,z)-1),z] for z in (706,728)] for x in xs],lens,4,flip=sign>0)
    xs=[x for x in XS if x>=LEN-280]
    mesh([[[x,sign*(flank_y(x,z)-3),z] for z in (818,842,902,930)] for x in xs],(52,26,28),0,flip=sign>0)
    mesh([[[x,sign*(flank_y(x,z)-1),z] for z in (848,894)] for x in xs],tail,4,flip=sign>0)
    for x in (2380,3260):
        pts=[[x,sign*(flank_y(x,sill(x)+40)-2),sill(x)+40],[x,sign*(flank_y(x,crease(x))-2),crease(x)],
             [x,sign*(dhw(x)+4),deck(x)-16]]
        for a,b in zip(pts,pts[1:]): tube(a,b,2.2,(78,84,89),0,5)
    for x in (2250,3130):
        ellipsoid([x,sign*(flank_y(x,crease(x)+46)+2),crease(x)+46],[76,9,14],chrome,3,18,8)
    # mirror: a tapered shell on a short stalk, its rear face the glass
    tube([1782,sign*886,1006],[1744,sign*962,1034],16,(34,38,42),0,10)
    def shell(u,v,sign=sign):
        a=u*math.tau;w=1.-.34*(1.-v)
        return [1706+v*172,sign*(1004+36*math.cos(a)*w),1052+48*math.sin(a)*w]
    mesh([[shell(i/16,j/4) for j in range(5)] for i in range(17)],paint,1,flip=sign<0)
    mesh([[shell(i/16,0) for i in range(17)],[[1706,sign*1004,1052] for i in range(17)]],paint,1,flip=sign>0)
    mesh([[shell(i/16,1) for i in range(17)],[[1878,sign*1004,1052] for i in range(17)]],(88,108,124),2,flip=sign<0)

# ---- wheels ---------------------------------------------------------------
for axle in (FA,RA):
    for sign in (-1,1):
        yc=sign*808
        def tyre(u,v,axle=axle,yc=yc):
            a=u*math.tau
            prof=[(-TW,WR-108),(-TW+18,WR-50),(-TW+9,WR-9),(-TW*.52,WR),
                  (TW*.52,WR),(TW-9,WR-9),(TW-18,WR-50),(TW,WR-108)]
            i=min(len(prof)-2,int(v*(len(prof)-1)));t=v*(len(prof)-1)-i
            oy=prof[i][0]+(prof[i+1][0]-prof[i][0])*t;r=prof[i][1]+(prof[i+1][1]-prof[i][1])*t
            return [axle+r*math.cos(a),yc+oy,WR+r*math.sin(a)]
        mesh([[tyre(i/54,j/7) for j in range(8)] for i in range(55)],rubber,0,flip=sign<0)
        outer=yc+sign*TW
        tube([axle,outer-sign*86,WR],[axle,outer-sign*4,WR],252,(50,56,62),3,44)
        tube([axle,outer-sign*30,WR],[axle,outer-sign*24,WR],210,(122,126,128),3,40)
        for j in range(5):
            for off in (-.17,.17):
                a=j*math.tau/5+off
                tube([axle+58*math.cos(a+off*.5),outer-sign*4,WR+58*math.sin(a+off*.5)],
                     [axle+238*math.cos(a),outer+sign*2,WR+238*math.sin(a)],11,alloy,3,6)
        tube([axle,outer-sign*2,WR],[axle,outer+sign*10,WR],62,alloy,3,22)
        ellipsoid([axle,outer+sign*13,WR],[32,6,32],(66,70,74),3,16,8)
        for j in range(5):
            a=j*math.tau/5+.31
            ellipsoid([axle+40*math.cos(a),outer+sign*9,WR+40*math.sin(a)],[6,5,6],(38,41,44),3,8,4)
        tube([axle,yc-sign*10,WR],[axle,yc+sign*16,WR],178,(112,116,120),3,26)
        mesh([[[axle-54,yc+sign*42,WR+158],[axle+54,yc+sign*42,WR+158]],
              [[axle-54,yc+sign*42,WR+210],[axle+54,yc+sign*42,WR+210]]],(128,44,40),0,flip=sign<0)
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

# ---------------------------------------------------------------------------
# A garden lounge set, original design: a three seater, two armchairs, a low
# table and an outdoor rug, laid out as one arrangement so a wide pergola does
# not stand around a single bistro table. Sizes follow ordinary catalogue
# outdoor furniture: 2280 mm sofa, 900 mm deep, seats 400 mm off the ground.
frame=(58,62,66); fabric=(206,201,190); fabric2=(178,172,160); teak=(148,116,78)
slate=(96,101,106); rugA=(196,192,182); rugB=(168,166,158); cushion=(120,132,138)

def rbox(c,s,e,color,mat=0,nu=22,nv=14):
    """A rounded box. e near 0 is a sharp frame, e near .5 a soft cushion."""
    def p(t,ex):
        return math.copysign(abs(math.cos(t))**ex,math.cos(t)),math.copysign(abs(math.sin(t))**ex,math.sin(t))
    def f(u,v):
        a=u*math.tau;b=v*math.pi
        ca,sa=p(a,e);cb,sb=p(b,e)
        return [c[0]+s[0]*ca*sb,c[1]+s[1]*sa*sb,c[2]+s[2]*cb]
    surface(f,nu,nv,color,mat,True)

def leg(x,y,z0,z1,r=26):
    tube([x,y,z0],[x,y,z1],r,frame,0,8)

def seat_unit(cx,cy,width,face):
    """One sofa or armchair: frame plinth, arms, seat and back cushions."""
    depth=850.;seat=400.;armh=600.;backh=780.
    y0=cy-face*depth/2   # front edge
    y1=cy+face*depth/2   # back edge
    rbox([cx,cy,255],[width/2-40,depth/2-60,95],.14,frame,0)
    for sx in (-1,1):
        for sy in (-1,1):
            leg(cx+sx*(width/2-110),cy+sy*(depth/2-130),0,180)
    # arms
    for sx in (-1,1):
        rbox([cx+sx*(width/2-70),cy+face*40,(350+armh)/2],[68,depth/2-90,(armh-350)/2],.18,frame,0)
    # seat cushions
    n=max(1,int(round(width/780)))
    for i in range(n):
        w=(width-300)/n
        rbox([cx-width/2+150+w*(i+.5),cy-face*70,seat+10],[w/2-14,depth/2-150,92],.42,fabric,0)
    # back cushions, leaning into the frame
    for i in range(n):
        w=(width-300)/n
        rbox([cx-width/2+150+w*(i+.5),y1-face*150,(seat+backh)/2+40],[w/2-14,110,(backh-seat)/2],.40,fabric2,0)
    # a throw cushion at one end
    rbox([cx-width/2+300,cy-face*90,seat+180],[150,60,140],.45,cushion,0,16,10)

def table(cx,cy):
    rbox([cx,cy,368],[620,350,22],.10,slate,0)
    rbox([cx,cy,300],[560,300,60],.12,teak,0)
    for sx in (-1,1):
        for sy in (-1,1): leg(cx+sx*540,cy+sy*280,0,300,24)
    # a tray with two glasses reads as somebody actually sitting here
    rbox([cx+120,cy,398],[170,120,10],.12,(236,232,222),0)
    for dx in (-70,70):
        tube([cx+120+dx,cy,404],[cx+120+dx,cy,506],38,(214,226,230),2,12)

# rug: two tones so it does not read as a painted rectangle
for i in range(9):
    t0=-1150+i*2300/9;t1=-1150+(i+1)*2300/9
    mesh([[[-1580,t0,4],[1580,t0,4]],[[-1580,t1,4],[1580,t1,4]]],rugA if i%2 else rugB,0)
mesh([[[-1580,-1150,3],[-1580,1150,3]],[[-1510,-1085,7],[-1510,1085,7]]],(150,148,140),0)
mesh([[[1580,-1150,3],[1580,1150,3]],[[1510,-1085,7],[1510,1085,7]]],(150,148,140),0,flip=True)

seat_unit(0,-700,2280,1)
seat_unit(-690,690,880,-1)
seat_unit(690,690,880,-1)
table(0,0)
save('patio-lounge')
