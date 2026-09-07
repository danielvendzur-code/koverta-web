import struct, sys
def load(path):
    b = open(path,'rb').read()
    ver, nfloat, nidx, nuv = struct.unpack_from('<4I', b, 0)
    o0, o1, o2, o3 = struct.unpack_from('<4I', b, 16)
    nv = nfloat // 3
    pos = struct.unpack_from('<%df' % (nv*3), b, o0)
    idx = struct.unpack_from('<%dI' % nidx, b, o3)
    V = [(pos[i*3], pos[i*3+1], pos[i*3+2]) for i in range(nv)]
    return V, idx
def bbox(V):
    xs=[v[0] for v in V]; ys=[v[1] for v in V]; zs=[v[2] for v in V]
    return (min(xs),max(xs)), (min(ys),max(ys)), (min(zs),max(zs))
if __name__ == '__main__':
    for f in sys.argv[1:]:
        V, I = load(f)
        (x0,x1),(y0,y1),(z0,z1) = bbox(V)
        print(f"{f.split('_')[-1][:5]:<6} verts={len(V):<6} tris={len(I)//3:<6} "
              f"X {x0:9.1f}..{x1:9.1f} ({x1-x0:8.1f})  "
              f"Y {y0:9.1f}..{y1:9.1f} ({y1-y0:8.1f})  "
              f"Z {z0:9.1f}..{z1:9.1f} ({z1-z0:8.1f})")
