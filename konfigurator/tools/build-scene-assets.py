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

def build_car(P):
    """Vylofrovaná karoséria z jednej sady profilov. Rozmery aj mierky
       prierezu berie z predpisu, takže tá istá stavba vie postaviť sedan aj
       malé mestské auto — nie je to zmenšenina, mení sa aj tvar zadku."""
    LEN=P['len']; FA=P['fa']; RA=P['ra']; WR=P['wr']; TW=P['tw']; ARCH=P['arch']
    COWL=P['cowl']; ROOF_F=P['roofF']; ROOF_R=P['roofR']; DECK_R=P['deckR']
    BPILLAR=P['bpillar']
    SX=LEN/4760.; SW=P['width']; SZ=P['height']
    sx=lambda xs:[v*SX for v in xs]

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
        base=SW*curve(x,sx([0,30,80,160,280,500,900,1400,1900,2900,3600,4150,4450,4620,4700,4760]),
                     [592,648,708,768,818,862,900,924,930,930,926,908,870,812,756,690])
        for axle in (FA,RA):
            d=abs(x-axle)/660.
            if d<1: base+=13*math.cos(d*math.pi/2)**2
        return base

    def sill(x):
        """Bottom edge of the flank; over an axle it becomes the wheel opening."""
        z=SZ*curve(x,sx([0,60,200,400,4400,4580,4690,4760]),[298,264,244,240,240,256,288,330])
        for axle in (FA,RA):
            d=abs(x-axle)
            if d<ARCH: z=max(z,WR+ARCH*(1-(d/ARCH)**2.3)**(1/2.3))
            elif d<ARCH+130: z=max(z,240+(WR-240)*(1-smooth((d-ARCH)/130.)))
        return z

    def crease(x):
        return SZ*curve(x,sx([0,120,400,900,1400,2500,3500,4200,4550,4760]),
                       [688,712,762,788,798,802,804,800,776,734])

    def deck(x):
        """Top of the bodyshell: bonnet, belt line, boot lid."""
        return SZ*curve(x,sx([0,60,200,600,1100,1614,2200,3200,4186,4340,4560,4760]),
                       [802,832,872,916,940,962,992,996,1002,1004,976,904])*P.get('deckK',1)

    def dhw(x):
        """Half width of that top surface."""
        return SW*curve(x,sx([0,60,200,600,1100,1614,2200,3200,4186,4400,4620,4760]),
                       [510,572,640,734,816,866,876,872,856,818,754,688])

    def crown(x):
        return SZ*curve(x,sx([0,600,1400,1614,4186,4400,4760]),[9,15,19,18,16,13,8])

    def section(x):
        """Half section as splined patches: smooth where a car is smooth, with a
        tangent break exactly at the sill, the door feature line, the shoulder
        crease and the deck edge — those four breaks are the highlights that make
        a body panel read as sheet metal."""
        w=hw(x);s=sill(x);c=crease(x);d=deck(x);t=dhw(x);k=crown(x);h=max(1.,d-c)
        f1=s+(c-s)*.23;f2=s+(c-s)*.66
        return [
            [(0,172),(w*.40,168),(w*.72,s-58),(w*.86,s-22)],                     # underbody
            [(w*.86,s-22),(w*.912,s-7),(w*.928,s)],                              # rocker, tucked under
            [(w*.928,s),(w*.966,s+(f1-s)*.52),(w*.988,f1-7),(w*.993,f1)],        # rocker to the low line
            [(w*.992,f1),(w*.998,f1+(f2-f1)*.44),(w,f1+(f2-f1)*.80),(w,f2)],     # lower door
            [(w,f2),(w*.998,f2+(c-f2)*.46),(w*.994,f2+(c-f2)*.80),(w*.986,c)],   # upper door
            [(w*.986,c),(w*.974,c+h*.26),(w*.946,c+h*.56),(t+22,d-52),(t,d-8)],  # shoulder
            [(t,d-8),(t*.95,d+k*.58),(t*.64,d+k*.93),(0,d+k)],                   # deck
        ]

    def flank_y(x,z):
        """Half width of the painted flank at a height, for trims that must sit on it."""
        pts=spline(section(x)[2],8)+spline(section(x)[3],8)+spline(section(x)[4],8)+spline(section(x)[5],12)
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
    for a,b,st in [(0,400,32),(400,1500,75),(1500,4300,105),(4300,LEN,40)]:
        v=a
        while v<b: _xs.add(round(v,1)); v+=st
    for axle in (FA,RA):
        v=axle-ARCH-160
        while v<axle+ARCH+160: _xs.add(round(v,1)); v+=28
    XS=sorted(x for x in _xs if 0<=x<=LEN)
    FRONT=[x for x in XS if x<=COWL];CABIN=[x for x in XS if COWL<=x<=DECK_R];REAR=[x for x in XS if x>=DECK_R]

    for sign in (-1,1):
        build(XS,[(floorpan,0,3),(trim,0,2),(paint,1,3),(paint,1,4),(paint,1,4),(paint,1,6),None],sign)
        build(FRONT,[None]*6+[(paint,1,6)],sign)
        build(CABIN,[None]*6+[(inner,0,3)],sign)
        build(REAR,[None]*6+[(paint,1,6)],sign)

    for sign in (-1,1):
        xs=[x for x in XS if x>=DECK_R-40]
        mesh([[[x,sign*(dhw(x)*t),deck(x)-6+curve(x,[DECK_R-40,DECK_R+90,DECK_R+240,LEN],[0,26,14,4])] for t in (0,.34,.68,1.0)] for x in xs],paint,1,flip=sign>0)

    def front_tint(z,v):
        if z<214: return (floorpan,0,0)
        if 236<=z<=372: return (mesh_dark,0,34)               # lower intake
        if 424<=z<=642: return (mesh_dark,0,44)               # main grille
        if 300<=z<=404 and v>.72: return ((226,228,222),0,10) # number plate
        if 668<=z<=744 and v<.52: return (lens,4,12)          # headlamp lens
        if 636<=z<=782 and v<.56: return ((38,42,46),0,16)    # lamp housing, set back
        return (paint,1,0)

    def rear_tint(z,v):
        if z<210: return (floorpan,0,0)
        if 232<=z<=330: return (mesh_dark,0,26)               # diffuser
        if 596<=z<=712 and v>.70: return ((226,228,222),0,8)  # plate recess
        if 824<=z<=886: return (tail,4,12)                    # full-width tail bar
        if 800<=z<=910: return ((50,25,27),0,16)
        return (paint,1,0)

    endcap(0,-1,74,front_tint)
    endcap(LEN,1,66,rear_tint)

    # Wheel houses: the opening must not look straight through the car.
    for axle in (FA,RA):
        xs=[x for x in XS if abs(x-axle)<ARCH+130 and sill(x)>248]
        for sign in (-1,1):
            grid=[]
            for x in xs:
                w=hw(x)*.928;s=sill(x);row=[]
                for j in range(5):
                    t=j/4.
                    row.append([x,sign*(w-10-t*250),s-4-t*44*(1-t*.6)])
                grid.append(row)
            mesh(grid,(42,45,48),0,flip=sign<0)
            edge=[[x,sign*(hw(x)*.928-260),sill(x)-30] for x in xs]
            mesh([edge,[[p[0],p[1],184] for p in edge]],(34,37,40),0,flip=sign>0)

    # Wheel-arch lip. A shallow rolled edge disappeared at any distance; this one
    # is a formed flare that catches light and gives the opening a rim.
    for axle in (FA,RA):
        xs=[x for x in XS if abs(x-axle)<ARCH+120 and sill(x)>255]
        for sign in (-1,1):
            mesh([[[x,sign*(hw(x)*.928+off),sill(x)+dz] for off,dz in [(-3,0),(6,3),(10,12),(7,22),(1,30)]] for x in xs],paint,1,flip=sign>0)

    # ---- greenhouse -----------------------------------------------------------
    def roofz(x):
        t=P.get('roof',[1182,1352,1402,1424,1434,1438,1434,1420,1330,1188,1094])
        return curve(x,[COWL]+[COWL+(DECK_R-COWL)*f for f in (.076,.173,.228,.25,.333,.5,.675,.782,.835,.918,.968)]+[DECK_R],
                       [deck(COWL)]+[v*SZ for v in t]+[deck(DECK_R)])

    def ghw(x):
        return curve(x,[COWL,COWL+(DECK_R-COWL)*.127,ROOF_F,COWL+(DECK_R-COWL)*.461,ROOF_R,COWL+(DECK_R-COWL)*.889,DECK_R],
                       [dhw(COWL),838*SW,812*SW,806*SW,798*SW,814*SW,834*SW])

    def gsection(x):
        b=dhw(x);d=deck(x);r=roofz(x);g=ghw(x);h=max(1.,r-d);k=min(24.,h*.09)
        rail=r-min(58.,h*.13)
        return [
            [(b,d),(b*.996,d+h*.24),(g*1.004,d+h*.64),(g,rail)],
            [(g,rail),(g*.945,r-min(58.,h*.13)),(g*.79,r-min(15.,h*.045)),(g*.44,r+k*.55),(0,r+k)],
        ]

    def gxs(a,b,step=40):
        v=a;out=[]
        while v<b-1e-6: out.append(round(v,1)); v+=step
        out.append(b);return out

    pillar=(26,28,30)
    for sign in (-1,1):
        build(gxs(COWL,ROOF_F),[(paint,1,4),(glass,2,6)],sign,gsection)            # A pillar + windscreen
        for a,b in [(ROOF_F,BPILLAR[0]),(BPILLAR[1],ROOF_R)]:
            build(gxs(a,b),[(glass,2,4),(paint,1,6)],sign,gsection)                # side glass + roof
        build(gxs(*BPILLAR,step=28),[(pillar,0,4),(paint,1,6)],sign,gsection)      # B pillar
        build(gxs(ROOF_R,DECK_R),[(paint,1,4),(glass,2,6)],sign,gsection)          # C pillar + backlight
        # bright surround along the belt and over the roof rail
        tube([COWL+70,sign*(dhw(COWL)-4),deck(COWL)+22],[DECK_R-90,sign*(dhw(DECK_R)-4),deck(DECK_R)+18],6,chrome,3,8)
        for a,b in [(ROOF_F+40,BPILLAR[0]),(BPILLAR[1],ROOF_R-30)]:
            tube([a,sign*(ghw(a)-2),roofz(a)-min(58.,(roofz(a)-deck(a))*.13)],
                 [b,sign*(ghw(b)-2),roofz(b)-min(58.,(roofz(b)-deck(b))*.13)],5,chrome,3,8)
        # seats and head restraints, seen through the glass
        for x in (2380,3060):
            mesh([[[x-40,sign*130,958],[x-40,sign*420,958]],[[x+34,sign*140,1226],[x+34,sign*400,1226]]],(54,57,62),0,flip=sign<0)
            ellipsoid([x+18,sign*272,1262],[88,124,68],(48,51,56),0,14,8)
    mesh([[[COWL+70,-820,958],[COWL+70,820,958]],[[COWL+520,-792,1046],[COWL+520,792,1046]]],(50,53,58),0)
    ellipsoid([3560,0,roofz(3560)+2],[148,26,50],paint,1,14,8)

    # ---- lamps that wrap onto the flanks, shut lines, handles, mirrors --------
    for sign in (-1,1):
        xs=[x for x in XS if x<=460]
        mesh([[[x,sign*(flank_y(x,z)-4),z] for z in (640,664,748,778)] for x in xs],(38,42,46),0,flip=sign>0)
        mesh([[[x,sign*(flank_y(x,z)-1),z] for z in (670,742)] for x in xs],lens,4,flip=sign>0)
        xs=[x for x in XS if x>=LEN-300]
        mesh([[[x,sign*(flank_y(x,z)-4),z] for z in (798,822,888,912)] for x in xs],(50,25,27),0,flip=sign>0)
        mesh([[[x,sign*(flank_y(x,z)-1),z] for z in (826,884)] for x in xs],tail,4,flip=sign>0)
        for x in (1712,2380,3260):
            pts=[[x,sign*(flank_y(x,sill(x)+40)+2),sill(x)+40],[x,sign*(flank_y(x,crease(x))+2),crease(x)],
                 [x,sign*(dhw(x)+4),deck(x)-16]]
            for a,b in zip(pts,pts[1:]): tube(a,b,3.4,(46,50,54),0,6)
        # Door handle: a pull bar with its own shadowed recess behind it, so it
        # reads as something you can grip and not as a chrome sticker.
        for x in (2250,3130):
            ellipsoid([x,sign*(flank_y(x,crease(x)+42)+1),crease(x)+42],[104,11,17],chrome,3,20,8)
            ellipsoid([x-16,sign*(flank_y(x,crease(x)+34)-4),crease(x)+34],[92,7,11],(52,56,60),0,16,6)
        # Door mirror. The old one was a puck on a rod standing 70 mm clear of the
        # body — a lollipop from every angle. This one is what a mirror actually
        # is: a housing lofted rearwards from a sail base on the door shoulder,
        # widening as it goes, with the glass in its rear face.
        root=flank_y(1800,deck(1800)-40);zb=deck(1800)+4
        def housing(u,v,sign=sign,root=root,zb=zb):
            a=u*math.tau
            cy=root+curve(v,[0,.34,1],[26,70,84]);ry=curve(v,[0,.34,1],[15,42,50])
            cz=zb+curve(v,[0,.34,1],[10,22,25]);rz=curve(v,[0,.34,1],[13,38,44])
            e=.66
            return [1802+v*136,
                    sign*(cy+ry*math.copysign(abs(math.cos(a))**e,math.cos(a))),
                    cz+rz*math.copysign(abs(math.sin(a))**e,math.sin(a))]
        mesh([[housing(i/20,j/6) for j in range(7)] for i in range(21)],paint,1,flip=sign<0)
        # sail base: the housing tapers back into the door skin, no floating stalk
        mesh([[housing(i/20,0) for i in range(21)],
              [[1774,sign*(root-2),zb+12] for i in range(21)]],paint,1,flip=sign>0)
        # the rear face is glass, very slightly domed
        mesh([[housing(i/20,1) for i in range(21)],
              [[1944,sign*(root+84),zb+25] for i in range(21)]],(104,120,134),2,flip=sign<0)

    # ---- wheels ---------------------------------------------------------------
    for axle in (FA,RA):
        for sign in (-1,1):
            yc=sign*808
            def tyre(u,v,axle=axle,yc=yc):
                a=u*math.tau
                prof=[(-TW,WR-131),(-TW+18,WR-50),(-TW+9,WR-9),(-TW*.52,WR),
                      (TW*.52,WR),(TW-9,WR-9),(TW-18,WR-50),(TW,WR-131)]
                i=min(len(prof)-2,int(v*(len(prof)-1)));t=v*(len(prof)-1)-i
                oy=prof[i][0]+(prof[i+1][0]-prof[i][0])*t;r=prof[i][1]+(prof[i+1][1]-prof[i][1])*t
                return [axle+r*math.cos(a),yc+oy,WR+r*math.sin(a)]
            mesh([[tyre(i/54,j/7) for j in range(8)] for i in range(55)],rubber,0,flip=sign<0)
            outer=yc+sign*TW
            tube([axle,outer-sign*86,WR],[axle,outer-sign*4,WR],239,(50,56,62),3,44)
            tube([axle,outer-sign*30,WR],[axle,outer-sign*24,WR],210,(122,126,128),3,40)
            for j in range(5):
                for off in (-.17,.17):
                    a=j*math.tau/5+off
                    tube([axle+58*math.cos(a+off*.5),outer-sign*4,WR+58*math.sin(a+off*.5)],
                         [axle+228*math.cos(a),outer+sign*2,WR+228*math.sin(a)],11,alloy,3,6)
            tube([axle,outer-sign*2,WR],[axle,outer+sign*10,WR],62,alloy,3,22)
            ellipsoid([axle,outer+sign*13,WR],[32,6,32],(66,70,74),3,16,8)
            for j in range(5):
                a=j*math.tau/5+.31
                ellipsoid([axle+40*math.cos(a),outer+sign*9,WR+40*math.sin(a)],[6,5,6],(38,41,44),3,8,4)
            tube([axle,yc-sign*10,WR],[axle,yc+sign*16,WR],178,(112,116,120),3,26)
            mesh([[[axle-54,yc+sign*42,WR+158],[axle+54,yc+sign*42,WR+158]],
                  [[axle-54,yc+sign*42,WR+210],[axle+54,yc+sign*42,WR+210]]],(128,44,40),0,flip=sign<0)
    # Konfigurátor teraz vozí Superb IV — dodanú hotovú packed sieť, nie tento
    # generovaný sedan. Kód ostáva, lebo je to jediný zdroj pôvodného modelu, ale
    # bez príznaku sa súbor nevracia do scene-assets pri každom behu skriptu.
SEDAN=dict(len=4760,fa=960,ra=3870,wr=372,tw=126,arch=436,cowl=1614,roofF=2258,
           roofR=3624,deckR=4186,bpillar=(2688,2762),width=1.,height=1.)
# Malé mestské auto. Superb potrebuje 2,83 m šírky prístrešku aj s odstupmi a
# 5,55 m dĺžky — pri prednastavenom carporte 2,5 × 5,46 m sa nezmestí nič a
# scéna hlási, že tu auto nezaparkuje. Toto je hatchback 3,74 × 1,80 m, ktorý
# sa vojde aj do úzkych a krátkych prístreškov. Nie je to zmenšený sedan:
# kabína je posunutá dopredu, zadok krátky a strmý.
HATCH=dict(len=3740,fa=800,ra=3140,wr=312,tw=106,arch=372,cowl=1180,roofF=1700,
           roofR=2760,deckR=3300,bpillar=(2080,2148),width=.905,height=.955,
           deckK=1.015,
           roof=[1198,1372,1420,1440,1452,1458,1452,1436,1352,1214,1106])
if '--legacy-car' in sys.argv:
    build_car(SEDAN); save('touring-sedan')
build_car(HATCH); save('city-hatch')

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
# outdoor furniture: 2280 mm sofa, 700 mm deep, seats 400 mm off the ground.
# The arrangement is 2,4 m across on purpose: a bioclimatic pergola is at most
# 3,5 m wide, so a deeper set would never fit between the posts and the lounge
# would stay a model nobody ever sees.
frame=(58,62,66); fabric=(206,201,190); fabric2=(178,172,160); teak=(148,116,78)
slate=(96,101,106); rugA=(196,192,182); rugB=(168,166,158); cushion=(120,132,138)

def rbox(c,s,e,color,mat=0,nu=22,nv=14,lean=0):
    """A rounded box. e near 0 is a sharp frame, e near .5 a soft cushion."""
    def p(t,ex):
        return math.copysign(abs(math.cos(t))**ex,math.cos(t)),math.copysign(abs(math.sin(t))**ex,math.sin(t))
    def f(u,v):
        a=u*math.tau;b=v*math.pi
        ca,sa=p(a,e);cb,sb=p(b,e)
        y=s[1]*sa*sb;z=s[2]*cb
        return [c[0]+s[0]*ca*sb,c[1]+y*math.cos(lean)-z*math.sin(lean),c[2]+y*math.sin(lean)+z*math.cos(lean)]
    surface(f,nu,nv,color,mat,True)

def leg(x,y,z0,z1,r=17):
    tube([x,y,z0],[x,y,z1],r,frame,0,8)

def stitched(c,s,e):
    # Upper welt, with tiny stitches in the same fabric tone.
    v=.62;sb=math.sin(v)**e;cb=math.cos(v)**e
    pts=[]
    for i in range(49):
        a=i*math.tau/48
        pts.append([c[0]+s[0]*math.copysign(abs(math.cos(a))**e,math.cos(a))*sb,
                    c[1]+s[1]*math.copysign(abs(math.sin(a))**e,math.sin(a))*sb,c[2]+s[2]*cb])
    for i,(a,b) in enumerate(zip(pts,pts[1:])):
        tube(a,b,1.4,(170,166,155),5,4)
        if i%2==0:
            p=np.array(a)*.35+np.array(b)*.65;q=np.array(a)*.25+np.array(b)*.75
            p[2]+=1.5;q[2]+=1.5;tube(p,q,.6,(224,218,202),5,3)

def seat_unit(cx,cy,width,face):
    """One sofa or armchair: frame plinth, arms, seat and back cushions."""
    depth=700.;seat=400.;armh=600.;backh=780.
    y0=cy-face*depth/2   # front edge
    y1=cy+face*depth/2   # back edge
    rbox([cx,cy,265],[width/2-50,depth/2-55,35],.14,frame,0)
    for sx in (-1,1):
        for sy in (-1,1):
            leg(cx+sx*(width/2-110),cy+sy*(depth/2-130),0,250)
    # arms
    for sx in (-1,1):
        rbox([cx+sx*(width/2-42),cy+face*40,(350+armh)/2],[24,depth/2-90,(armh-350)/2],.18,frame,0)
    # seat cushions
    n=max(1,int(round(width/780)))
    for i in range(n):
        w=(width-300)/n
        rbox([cx-width/2+150+w*(i+.5),cy-face*70,seat+10],[w/2-14,depth/2-110,78],.42,fabric,5)
        stitched([cx-width/2+150+w*(i+.5),cy-face*70,seat+10],[w/2-14,depth/2-110,78],.42)
    # back cushions, leaning into the frame
    for i in range(n):
        w=(width-300)/n
        rbox([cx-width/2+150+w*(i+.5),y1-face*150,(seat+backh)/2+40],[w/2-14,85,(backh-seat)/2],.40,fabric2,5,lean=-face*.12)
    # a throw cushion at one end
    rbox([cx-width/2+300,cy-face*90,seat+180],[150,60,140],.45,cushion,5,16,10)

def table(cx,cy):
    # Slim aluminium base and separate teak slats; enough knee room at the seats.
    rbox([cx,cy,326],[540,210,12],.10,frame,0)
    for j in range(6):
        rbox([cx,cy-200+j*80,356],[575,38,16],.08,tuple(v+(j%3-1)*4 for v in teak),6,16,10)
    for sx in (-1,1):
        for sy in (-1,1):leg(cx+sx*508,cy+sy*190,0,328,14)
    rbox([cx+180,cy,387],[160,103,10],.12,(70,75,76),0,16,8)
    for dx in (-60,60):tube([cx+180+dx,cy,398],[cx+180+dx,cy,476],29,(188,207,212),2,12)
    # Open-frame lantern, glass and a candle. Small, deliberately quiet detail.
    lx=cx-260;ly=cy+30
    rbox([lx,ly,382],[65,65,8],.1,frame,0,12,8)
    rbox([lx,ly,575],[65,65,6],.1,frame,0,12,8)
    for sx in (-1,1):
        for sy in (-1,1):tube([lx+sx*60,ly+sy*60,388],[lx+sx*60,ly+sy*60,575],3.5,frame,0,6)
    tube([lx,ly,390],[lx,ly,495],25,(224,215,187),0,16)
    ellipsoid([lx,ly,503],[4,4,9],(239,179,95),4,8,6)
    tube([lx-22,ly,581],[lx-22,ly,608],3,frame,0,6)
    tube([lx-22,ly,608],[lx+22,ly,608],3,frame,0,6)
    tube([lx+22,ly,608],[lx+22,ly,581],3,frame,0,6)

# rug: two tones so it does not read as a painted rectangle
for i in range(9):
    t0=-1200+i*2400/9;t1=-1200+(i+1)*2400/9
    mesh([[[-1580,t0,4],[1580,t0,4]],[[-1580,t1,4],[1580,t1,4]]],rugA if i%2 else rugB,0)
mesh([[[-1580,-1200,3],[-1580,1200,3]],[[-1510,-1135,7],[-1510,1135,7]]],(150,148,140),0)
mesh([[[1580,-1200,3],[1580,1200,3]],[[1510,-1135,7],[1510,1135,7]]],(150,148,140),0,flip=True)

seat_unit(0,-840,2280,-1)
seat_unit(-690,840,880,1)
seat_unit(690,840,880,1)
table(0,0)
# Planter stays within the rug envelope and clear of the table/seat approaches.
tube([1360,-950,0],[1360,-950,345],115,(116,117,109),0,24)
ellipsoid([1360,-950,347],[107,107,7],(62,54,44),0,24,6)
tube([1360,-950,350],[1360,-950,700],9,(102,85,62),6,8)
for j in range(12):
    a=j*2.39996;z=450+j*20
    end=[1360+math.cos(a)*120,-950+math.sin(a)*100,z+55]
    tube([1360,-950,z-25],end,2.5,(101,99,65),0,5)
    ellipsoid(end,[48,20,12],(82+j%3*6,101+j%4*4,69),0,12,6)
save('patio-lounge')

# ---------------------------------------------------------------------------
# Kompaktné posedenie. Plná lounge zostava potrebuje 2,4 m naprieč a tú má
# záhradná pergola až na hornom konci rozsahu; pri prednastavených 2,5 m šírky
# ostával jediný bistro stolík. Toto je to, čo si pod „posedením" predstaví
# človek s bežnou terasou: dvojkreslová pohovka, konferenčný stolík, koberec
# a kvetináč, celé 2,40 × 1,54 m — teda sa zmestí aj medzi stĺpy 2,5 m pergoly.
for i in range(7):
    t0=-750+i*1500/7;t1=-750+(i+1)*1500/7
    mesh([[[-1200,t0,4],[1200,t0,4]],[[-1200,t1,4],[1200,t1,4]]],rugA if i%2 else rugB,0)
mesh([[[-1200,-750,3],[-1200,750,3]],[[-1140,-695,7],[-1140,695,7]]],(150,148,140),0)
mesh([[[1200,-750,3],[1200,750,3]],[[1140,-695,7],[1140,695,7]]],(150,148,140),0,flip=True)

seat_unit(-90,-420,1560,-1)

def small_table(cx,cy):
    """Konferenčný stolík k dvojkreslu: užší a nižší než pri veľkej zostave."""
    rbox([cx,cy,318],[400,190,11],.10,frame,0)
    for j in range(5):
        rbox([cx,cy-160+j*80,346],[430,36,15],.08,tuple(v+(j%3-1)*4 for v in teak),6,16,10)
    for sx in (-1,1):
        for sy in (-1,1):leg(cx+sx*372,cy+sy*146,0,320,13)
    rbox([cx+120,cy,375],[118,80,9],.12,(70,75,76),0,16,8)
    for dx in (-44,44):tube([cx+120+dx,cy,386],[cx+120+dx,cy,452],26,(188,207,212),2,12)

small_table(-90,290)

# kvetináč do voľného rohu koberca, mimo prístupu k pohovke aj stolíku
tube([900,-470,0],[900,-470,330],104,(116,117,109),0,24)
ellipsoid([900,-470,332],[97,97,7],(62,54,44),0,24,6)
tube([900,-470,335],[900,-470,650],8,(102,85,62),6,8)
for j in range(10):
    a=j*2.39996;z=420+j*20
    end=[900+math.cos(a)*112,-470+math.sin(a)*94,z+52]
    tube([900,-470,z-22],end,2.4,(101,99,65),0,5)
    ellipsoid(end,[44,19,11],(82+j%3*6,101+j%4*4,69),0,12,6)
save('patio-sofa')
