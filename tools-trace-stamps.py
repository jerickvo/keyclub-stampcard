"""Reconstruct the ten Sacred Treasures from the reference drawing.

This is a vector RECONSTRUCTION, not a redesign. For each symbol the
reference pixels are binarised and every ink/paper boundary is followed
exactly along the pixel lattice -- outer edges and interior cutouts
alike -- then smoothed with two rounds of corner cutting and simplified
with Ramer-Douglas-Peucker. Nothing is normalised between symbols except
the outer display size; each keeps its own proportions, its own density
and its own silhouette.

Needs the reference bitmap at ref/ten.png (see assets/stamp/README.md:
it is not stored in the repository). Writes traced.json and prints the
per-symbol contour counts.

    python3 tools-trace-stamps.py
"""
import sys, math, json, zlib, struct

def load(p):
    d=open(p,'rb').read(); pos=8; idat=b''
    while pos < len(d):
        ln=struct.unpack('>I', d[pos:pos+4])[0]; typ=d[pos+4:pos+8]
        data=d[pos+8:pos+8+ln]
        if typ==b'IHDR': w,h,bd,ct,cm,fl,il=struct.unpack('>IIBBBBB', data)
        if typ==b'IDAT': idat+=data
        pos += 12+ln
    raw=zlib.decompress(idat)
    bpp={0:1,2:3,4:2,6:4}[ct]; stride=w*bpp
    prev=bytearray(stride); rows=[]; i=0
    def paeth(a,b,c):
        p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
        return a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
    for y in range(h):
        ft=raw[i]; i+=1
        line=bytearray(raw[i:i+stride]); i+=stride
        for x in range(stride):
            a=line[x-bpp] if x>=bpp else 0
            b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
            if ft==1: line[x]=(line[x]+a)&255
            elif ft==2: line[x]=(line[x]+b)&255
            elif ft==3: line[x]=(line[x]+((a+b)>>1))&255
            elif ft==4: line[x]=(line[x]+paeth(a,b,c))&255
        rows.append(bytearray(line)); prev=line
    return w,h,rows,bpp
def save(p,w,h,rows):
    def chunk(t,data):
        c=struct.pack('>I',len(data))+t+data
        return c+struct.pack('>I', zlib.crc32(t+data)&0xffffffff)
    raw=b''.join(b'\x00'+bytes(r) for r in rows)
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))
    png+=chunk(b'IDAT', zlib.compress(raw,9))+chunk(b'IEND',b'')
    open(p,'wb').write(png)


REF = 'ref/ten.png'
W, H, ROWS, BPP = load(REF)

NAMES = ['oki','hetsu','tsurugi','iku','makaru','taru','chika','hebi','hachi','kusagusa']
BOXES = {}   # filled by locate()

def px(x, y):
    o = x*BPP; r = ROWS[y]
    return (r[o], r[o+1], r[o+2])

def lum(c):
    return (c[0]*299 + c[1]*587 + c[2]*114) / 1000

# Threshold per symbol.  240 keeps every drawn colour -- grey outline,
# gold fill, red -- as ink and only pure paper as paper.  MAKARU is the
# one symbol whose body is solid black with a LIGHTER mark inside it, so
# there the amber flame is what the drawing shows as an opening and the
# threshold has to sit below it or the opening fills in.
THRESH = {n: 240 for n in NAMES}
THRESH['makaru'] = 140

def locate():
    def ink_any(x, y, thr=245):
        return lum(px(x, y)) < thr
    prof = [sum(1 for x in range(W) if ink_any(x, y)) for y in range(H)]
    bands = []; s = None
    for y, v in enumerate(prof):
        if v and s is None: s = y
        if not v and s is not None:
            if y-1-s > 20: bands.append((s, y-1))
            s = None
    rows = bands[:1] + [b for b in bands[1:] if b[1]-b[0] > 40]
    rows = [b for b in bands if b[1]-b[0] > 40][:2]
    out = []
    for (y0, y1) in rows:
        p = [sum(1 for y in range(y0, y1+1) if ink_any(x, y)) for x in range(W)]
        s = None
        for x, v in enumerate(p):
            if v and s is None: s = x
            if not v and s is not None:
                if x-1-s > 4: out.append((s, x-1, y0, y1))
                s = None
    assert len(out) == 10, f'found {len(out)} symbols'
    return {n: b for n, b in zip(NAMES, out)}

def mask(name, sup=3):
    """Binary ink mask, supersampled `sup`x, tightly cropped."""
    x0, x1, y0, y1 = BOXES[name]
    thr = THRESH[name]
    xs = [x for x in range(x0, x1+1) if any(lum(px(x, y)) < thr for y in range(y0, y1+1))]
    ys = [y for y in range(y0, y1+1) if any(lum(px(x, y)) < thr for x in range(x0, x1+1))]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = x1-x0+1, y1-y0+1
    m = [[1 if lum(px(x0+x, y0+y)) < thr else 0 for x in range(w)] for y in range(h)]
    if sup == 1:
        return m, w, h
    # supersample by replication, then a light box blur, so marching
    # squares recovers a smooth edge instead of the source staircase
    W2, H2 = w*sup, h*sup
    up = [[m[y//sup][x//sup] for x in range(W2)] for y in range(H2)]
    return up, W2, H2

def field(m, w, h, r=2):
    """Box-blurred coverage field with a 1-cell paper border."""
    pw, ph = w+2, h+2
    pad = [[0.0]*pw for _ in range(ph)]
    for y in range(h):
        for x in range(w):
            pad[y+1][x+1] = float(m[y][x])
    # separable box blur
    k = 2*r+1
    tmp = [[0.0]*pw for _ in range(ph)]
    for y in range(ph):
        row = pad[y]; acc = 0.0
        for x in range(pw):
            acc += row[x]
            if x >= k: acc -= row[x-k]
            if x >= r: tmp[y][x-r] = acc/k
        for x in range(pw-r, pw): tmp[y][x] = tmp[y][pw-r-1]
    out = [[0.0]*pw for _ in range(ph)]
    for x in range(pw):
        acc = 0.0
        for y in range(ph):
            acc += tmp[y][x]
            if y >= k: acc -= tmp[y-k][x]
            if y >= r: out[y-r][x] = acc/k
        for y in range(ph-r, ph): out[y][x] = out[ph-r-1][x]
    return out, pw, ph

# ─────────────────────────────────────────────── crack-boundary tracing
def crack_contours(m, w, h):
    """Exact boundary polygons of a binary mask.

    Every edge between an ink cell and a paper cell is emitted as a unit
    segment on the integer lattice, oriented so ink is always on the right.
    Chaining is then unambiguous except where two regions touch corner to
    corner, and there the walk takes the sharpest right turn, which keeps
    it hugging the region it started on.  This cannot join two different
    contours together the way an iso-line walk can.
    """
    def ink(x, y):
        return 0 <= x < w and 0 <= y < h and m[y][x]
    edges = []
    for y in range(h):
        for x in range(w):
            if not m[y][x]: continue
            if not ink(x, y-1): edges.append(((x, y),   (x+1, y)))
            if not ink(x, y+1): edges.append(((x+1, y+1), (x, y+1)))
            if not ink(x-1, y): edges.append(((x, y+1), (x, y)))
            if not ink(x+1, y): edges.append(((x+1, y), (x+1, y+1)))
    from collections import defaultdict
    out = defaultdict(list)
    for i, (p, q) in enumerate(edges):
        out[p].append(i)
    used = [False]*len(edges)
    loops = []
    for i0 in range(len(edges)):
        if used[i0]: continue
        used[i0] = True
        start, cur = edges[i0]
        prev = start
        loop = [start]
        while cur != start:
            loop.append(cur)
            cand = [j for j in out.get(cur, ()) if not used[j]]
            if not cand: break
            if len(cand) == 1:
                j = cand[0]
            else:
                # sharpest right turn: keep hugging the current region
                dx, dy = cur[0]-prev[0], cur[1]-prev[1]
                def turn(j):
                    q = edges[j][1]
                    ex, ey = q[0]-cur[0], q[1]-cur[1]
                    cross = dx*ey - dy*ex          # >0 = right turn (y down)
                    dot = dx*ex + dy*ey
                    return (-cross, -dot)
                j = min(cand, key=turn)
            used[j] = True
            prev, cur = cur, edges[j][1]
        if len(loop) > 3: loops.append(loop)
    return loops


def chaikin(pts, iters=2):
    """Corner cutting: turns a pixel staircase into a smooth polyline."""
    for _ in range(iters):
        out = []
        n_ = len(pts)
        for i in range(n_):
            ax, ay = pts[i]; bx, by = pts[(i+1) % n_]
            out.append((ax*0.75+bx*0.25, ay*0.75+by*0.25))
            out.append((ax*0.25+bx*0.75, ay*0.25+by*0.75))
        pts = out
    return pts


def rdp(pts, eps):
    if len(pts) < 3: return pts
    keep = [False]*len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts)-1)]
    while stack:
        i, j = stack.pop()
        if j <= i+1: continue
        ax, ay = pts[i]; bx, by = pts[j]
        dx, dy = bx-ax, by-ay
        L2 = dx*dx+dy*dy
        best, bi = -1, -1
        for k in range(i+1, j):
            cx, cy = pts[k]
            if L2 == 0: d = math.hypot(cx-ax, cy-ay)
            else:
                t = max(0.0, min(1.0, ((cx-ax)*dx+(cy-ay)*dy)/L2))
                d = math.hypot(cx-ax-t*dx, cy-ay-t*dy)
            if d > best: best, bi = d, k
        if best > eps:
            keep[bi] = True; stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]

def simplify_loop(loop, eps):
    """RDP on a closed ring, anchored at its extreme point."""
    if len(loop) < 4: return loop
    i0 = min(range(len(loop)), key=lambda i: (loop[i][1], loop[i][0]))
    r = loop[i0:]+loop[:i0]
    out = rdp(r+[r[0]], eps)
    if out[0] == out[-1]: out = out[:-1]
    return out

# ─────────────────────────────────────────────── emission
BOX = 64.0        # viewBox edge
FIT = 58.0        # longest side of a symbol inside it

def n(v):
    s = f'{v:.1f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def build(name, sup=4, eps=1.7, minarea=0.25, smooth=2):
    m, w, h = mask(name, sup)
    loops = crack_contours(m, w, h)
    xs = [p[0] for L in loops for p in L]; ys = [p[1] for L in loops for p in L]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    sw, sh = maxx-minx, maxy-miny
    s = FIT/max(sw, sh)
    ox = (BOX - sw*s)/2 - minx*s
    oy = (BOX - sh*s)/2 - miny*s
    out, kept, dropped = [], 0, 0
    for L in loops:
        L = chaikin(L, smooth)
        L = simplify_loop(L, eps)
        if len(L) < 3: dropped += 1; continue
        a = abs(sum(L[i][0]*L[(i+1) % len(L)][1] - L[(i+1) % len(L)][0]*L[i][1]
                    for i in range(len(L)))) / 2 * s*s
        if a < minarea: dropped += 1; continue
        kept += 1
        pts = [(p[0]*s+ox, p[1]*s+oy) for p in L]
        out.append('M' + ' '.join(f'{n(x)} {n(y)}' for x, y in pts) + 'Z')
    return ''.join(out), dict(loops=len(loops), kept=kept, dropped=dropped,
                              w=sw, h=sh, aspect=sw/sh)


if __name__ == '__main__':
    BOXES.update(locate())
    res = {}
    for nm in NAMES:
        d, info = build(nm)
        res[nm] = d
        print(f'{nm:<10} loops={info["loops"]:3d} kept={info["kept"]:3d} '
              f'drop={info["dropped"]:3d}  aspect={info["aspect"]:.2f}  '
              f'{len(d):6d} chars')
    json.dump(res, open('traced.json', 'w'))
    print('total', sum(len(v) for v in res.values()), 'chars')
