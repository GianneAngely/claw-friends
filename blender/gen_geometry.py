# Build Kyoko's 3D geometry from the reference: 2D part masks are inflated into soft pillows placed at depths
# that follow the head / torso / cape, the hood-cape is an egg shell with the measured front opening.
# Output: blender/kyoko_geo.npz (+ face texture) for kyoko_blend.py.   Blender axes: X right, Y back, Z up.
import json
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import Delaunay
from skimage import measure

B = "/Users/gianneangely/Documents/ClawFriends/blender"
REF = "/Users/gianneangely/Documents/ClawFriends/refs/character/kyoko-base-flow.png"
ref = json.load(open(f"{B}/kyoko_ref.json"))
Hpx, Wpx = ref["H"], ref["W"]
K = 0.005                 # units per reference pixel (character ~3.4 units tall)
CX, FOOT = 292.0, 733.0   # reference column of the body centre, row of the soles
def PX(x): return (np.asarray(x, float) - CX) * K
def PZ(y): return (FOOT - np.asarray(y, float)) * K
def load(name): return np.array(Image.open(f"{B}/parts/{name}.png")) > 127
def largest(m):
    lab, n = ndimage.label(m)
    return lab == (np.argmax(ndimage.sum(m, lab, range(1, n + 1))) + 1) if n else m
YY, XX = np.mgrid[0:Hpx, 0:Wpx]

PARTS = []   # dicts: name, material, verts (N,3), faces (M,3), bone weights {bone: (N,) array}, optional uv

def add(name, material, verts, faces, weights, uv=None):
    PARTS.append({"name": name, "material": material, "verts": np.asarray(verts, np.float32),
                  "faces": np.asarray(faces, np.int32), "weights": weights, "uv": uv})

def smooth1(a, k=7):
    a = np.asarray(a, float); pad = np.pad(a, k, mode="edge")
    return np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k]

# ------------------------------------------------------------------ hood-cape shell (egg)
prof = {p["y"]: p for p in ref["profile"]}
ys = np.array(sorted(prof))
L = np.array([prof[y]["L"] for y in ys], float); R = np.array([prof[y]["R"] for y in ys], float)
col = np.array(Image.open(REF).convert("L"))
cap_top = min(8 + np.nonzero(col[8:, c] < 120)[0][0] for c in range(262, 322))   # hood top outline between the ears (skip the frame)
hem_y = 710.0      # the cape's hem; the bottom stays open, the legs come out below it
row_y = np.r_[np.arange(cap_top, hem_y - 3, 6.0), hem_y]
a_meas = np.interp(row_y, ys, (R - L) / 2); c_meas = np.interp(row_y, ys, (R + L) / 2)
Y_CAP = 205.0   # above this the ears widen the silhouette: use an elliptical cap instead
a205 = np.interp(Y_CAP, ys, (R - L) / 2)
cap = row_y < Y_CAP
t = (Y_CAP - row_y[cap]) / (Y_CAP - cap_top)
a_meas[cap] = a205 * np.sqrt(np.clip(1 - t ** 2, 0, 1)) ** 0.85
low = row_y > 700     # below 700 the silhouette is the legs: continue the cape's taper
a700 = np.interp(700, ys, (R - L) / 2)
a_meas[low] = a700 * np.sqrt(np.clip(1 - ((row_y[low] - 700) / 16) ** 2, 0, 1))   # rounded egg bottom
a_px = smooth1(a_meas, 2); a_px[0] = 0.0
c_px = smooth1(np.where(row_y < Y_CAP, np.interp(Y_CAP, ys, (R + L) / 2), c_meas), 9)

# front opening per side from the measured inner edges (rows hidden by the collar, the waving glove or the arm
# held out are bridged); the top of the opening closes with a sqrt ramp
top_hole = 145.0
def side_ratio(key, hidden):
    r = np.full(len(row_y), np.nan)
    for i, y in enumerate(row_y):
        p = prof.get(int(y) - int(y) % 2)
        if p and p[key] is not None and a_px[i] > 20:
            r[i] = (p[key] - c_px[i]) / a_px[i] * (1 if key == "iR" else -1)
    r[hidden | (row_y < 150) | ~np.isfinite(r) | (r < 0.1) | (r > 0.95)] = np.nan
    good = ~np.isnan(r)
    r = np.interp(row_y, row_y[good], smooth1(r[good], 2))
    rt = row_y < 150
    r[rt] = np.interp(150, row_y, r) * np.sqrt(np.clip((row_y[rt] - top_hole) / (150 - top_hole), 0, 1))
    return r
def smoothstep(e0, e1, x):
    t_ = np.clip((x - e0) / (e1 - e0), 0, 1); return t_ * t_ * (3 - 2 * t_)
ratioL = side_ratio("iL", (row_y > 330) & (row_y < 482))
ratioR = side_ratio("iR", (row_y > 362) & (row_y < 530))
# the cape's right shoulder flap: the panel comes in to the collar button (the drawing shows one grey area there)
# and its front is pulled back to just in front of the collar; its lower edge follows the tee's neckline
# its top edge runs from the shoulder down to the button along the jaw, and it curls back toward the neck up there
x_flap = np.interp(row_y, [376, 386, 392, 398, 455, 472], [360, 345, 330, 318, 318, 445])
w_sh = smoothstep(370, 392, row_y) * (1 - smoothstep(470, 480, row_y))
ratioR = ratioR * (1 - w_sh) + np.minimum(ratioR, (x_flap - c_px) / np.maximum(a_px, 1)) * w_sh
FLAP_D = np.interp(row_y, [370, 404], [-0.26, -0.5])
ratioL = ratioL + (ratioL > 0) * 5 / np.maximum(a_px, 1)      # the rim's own thickness must not hide the hair
ratioR = ratioR + (ratioR > 0) * 5 / np.maximum(a_px, 1)
thL, thR = np.arcsin(np.clip(ratioL, 0, 0.97)), np.arcsin(np.clip(ratioR, 0, 0.97))
DEPTH = 0.8   # egg depth / width
NS, T = 64, 0.036
# ring angles: the back sector has the same angles on every row (no twisting between rows with different openings),
# only the two front sectors stretch with the opening
A1, NF = 1.6, 18
BACK = np.linspace(A1, 2 * np.pi - A1, NS - 2 * NF + 1)
NR = len(row_y)
# the lining is offset along the profile normal, so the shell keeps its thickness at the top and bottom poles too
dadz = np.gradient(a_px * K, PZ(row_y))
n_r, n_z = 1 / np.sqrt(1 + dadz ** 2), -dadz / np.sqrt(1 + dadz ** 2)
n_z = np.where(row_y < 400, n_z * (1 - smoothstep(118, 142, row_y)), n_z)   # keep the hood's face opening edge thin
rings_o, rings_i, opened = [], [], []
for i in range(NR):
    tr = float(thR[i]) if thR[i] > 2e-3 else 0.0
    tl = float(thL[i]) if thL[i] > 2e-3 else 0.0
    opened.append(tr > 0 or tl > 0)
    phi = np.r_[np.linspace(tr, A1, NF + 1), BACK[1:], np.linspace(2 * np.pi - A1, 2 * np.pi - tl, NF + 1)[1:]]   # front-right edge, back, front-left edge
    for inner in (False, True):
        tt_ = T * n_r[i] if inner else 0.0
        a = max(a_px[i] * K - tt_, 1e-4); b = max(a_px[i] * K * DEPTH - tt_, 1e-4)
        ring = np.stack([PX(c_px[i]) + a * np.sin(phi), -b * np.cos(phi), np.full(NS + 1, PZ(row_y[i]) - (T * n_z[i] if inner else 0))], -1)
        if w_sh[i] > 0:
            f = w_sh[i] * (1 - smoothstep(0.0, 1.1, phi - tr))
            ring[:, 1] += (np.maximum(ring[:, 1], FLAP_D[i] + (T if inner else 0)) - ring[:, 1]) * f
        (rings_i if inner else rings_o).append(ring)
verts_o = np.concatenate(rings_o); verts_i = np.concatenate(rings_i)
NV = len(verts_o); RW = NS + 1
fo, fi, rim = [], [], []
for i in range(NR - 1):
    for k in range(NS):
        a_, b_, c_, d_ = i * RW + k, i * RW + k + 1, (i + 1) * RW + k + 1, (i + 1) * RW + k
        fo += [[a_, d_, c_], [a_, c_, b_]]
        fi += [[a_, b_, c_], [a_, c_, d_]]
    if opened[i] or opened[i + 1]:
        for k in (0, NS):
            o1, o2 = i * RW + k, (i + 1) * RW + k
            rim += [[o1, o2, NV + o2], [o1, NV + o2, NV + o1]]
hem = []                                  # close the cloth thickness along the open hem
for k in range(NS):
    o1, o2 = (NR - 1) * RW + k, (NR - 1) * RW + k + 1
    hem += [[o1, NV + o2, o2], [o1, NV + o1, NV + o2]]
verts = np.concatenate([verts_o, verts_i])
faces = np.array(fo + [[a + NV, b + NV, c + NV] for a, b, c in fi] + rim + hem)
# weights: hood follows the head, the lower cape follows the chest and sways with 3 cape chains
V = verts
zpx = FOOT - V[:, 2] / K
w_head = np.clip((395 - zpx) / 60 + 0.5, 0, 1)
ang = np.arctan2(V[:, 0] - PX(CX), -V[:, 1])     # 0 = front, +pi/2 = her left (+X)
w_low = np.clip((zpx - 470) / 200, 0, 1) * (1 - w_head)
back = np.clip((np.abs(ang) - np.pi / 2) / (np.pi / 2), 0, 1)
w_chest = (1 - w_head) - w_low
wts = {"head": w_head, "chest": w_chest,
       "cape_B": w_low * back, "cape_L": w_low * (1 - back) * (ang > 0), "cape_R": w_low * (1 - back) * (ang <= 0)}
add("Shell", ["Hood", "HoodInner"], verts, faces, wts)
PARTS[-1]["face_mat"] = np.r_[np.zeros(len(fo), int), np.ones(len(fi), int), np.zeros(len(rim) + len(hem), int)]

def shell_front_y(xpx, ypx):
    """Y of the shell's outer front surface at a reference pixel (for things stuck on the hood)"""
    a = np.interp(ypx, row_y, a_px); c = np.interp(ypx, row_y, c_px)
    u = np.clip((xpx - c) / np.maximum(a, 1), -0.999, 0.999)
    return -a * K * DEPTH * np.sqrt(1 - u ** 2)

# ------------------------------------------------------------------ head + face sticker
HEAD = {"cx": 284.0, "cy": 271.0, "rx": 136.0, "rz": 127.0, "ry": 0.66, "yc": 0.07}
def head_front_y(xpx, ypx, grow=0.0):
    u = (xpx - HEAD["cx"]) / (HEAD["rx"] + grow / K); w = (ypx - HEAD["cy"]) / (HEAD["rz"] + grow / K)
    q = np.clip(1 - u ** 2 - w ** 2, 0, 1)
    return HEAD["yc"] - (HEAD["ry"] + grow) * np.sqrt(q), q > 0

def ellipsoid(cx, cz, cy, rx, rz, ry, nu=48, nv=32):
    uu, vv = np.meshgrid(np.linspace(0, 2 * np.pi, nu, endpoint=False), np.linspace(0, np.pi, nv + 1))
    x = cx + rx * np.sin(vv) * np.sin(uu); y = cy - ry * np.sin(vv) * np.cos(uu); z = cz + rz * np.cos(vv)
    verts = np.stack([x, y, z], -1).reshape(-1, 3)
    f = []
    for j in range(nv):
        for i in range(nu):
            a_, b_ = j * nu + i, j * nu + (i + 1) % nu
            c_, d_ = (j + 1) * nu + (i + 1) % nu, (j + 1) * nu + i
            f += [[a_, b_, c_], [a_, c_, d_]]
    return verts, np.array(f)

hv, hf = ellipsoid(PX(HEAD["cx"]), PZ(HEAD["cy"]), HEAD["yc"], HEAD["rx"] * K, HEAD["rz"] * K, HEAD["ry"])
add("Head", "Skin", hv, hf, {"head": np.ones(len(hv))})
# face sticker: the front of the head, UV = the reference pixel it covers (planar from the front)
FACE_BOX = (150, 170, 420, 410)
gx, gy = np.meshgrid(np.arange(FACE_BOX[0], FACE_BOX[2] + 1, 5.0), np.arange(FACE_BOX[1], FACE_BOX[3] + 1, 5.0))
fyv, inside = head_front_y(gx, gy, 0.004)
nx, ny = gx.shape[1], gx.shape[0]
fv = np.stack([PX(gx), fyv, PZ(gy)], -1).reshape(-1, 3)
fuv = np.stack([(gx - FACE_BOX[0]) / (FACE_BOX[2] - FACE_BOX[0]), 1 - (gy - FACE_BOX[1]) / (FACE_BOX[3] - FACE_BOX[1])], -1).reshape(-1, 2)
ins = inside.reshape(-1)
ff = []
for j in range(ny - 1):
    for i in range(nx - 1):
        a_, b_, c_, d_ = j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i
        if ins[a_] and ins[b_] and ins[c_] and ins[d_]: ff += [[a_, d_, c_], [a_, c_, b_]]
add("Face", "Face", fv, ff, {"head": np.ones(len(fv))}, uv=fuv)

# face texture: only the drawn features (eyes, brows, mouth, blush, nose); skin becomes transparent
rgbf = np.array(Image.open(REF).convert("RGB")).astype(np.float32) / 255
def hsv(a):
    r, g, b_ = a[..., 0], a[..., 1], a[..., 2]; mx = a.max(-1); d = mx - a.min(-1)
    s_ = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    rc, gc, bc = [(mx - c) / np.maximum(d, 1e-6) for c in (r, g, b_)]
    h_ = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    return np.where(d > 1e-6, (h_ / 6) % 1, 0) * 360, s_, mx
fh, fs, fvv = hsv(rgbf)
face_region = ndimage.binary_fill_holes(ndimage.binary_closing(load("face"), iterations=6))
core = ndimage.binary_erosion(face_region, iterations=5)                  # drop the jaw outline itself
skinlike = (fh >= 12) & (fh <= 42) & (fs < 0.2) & (fvv > 0.9)
alpha = (core & ~skinlike).astype(np.float32)
alpha = np.maximum(alpha, ((fs < 0.1) & (fvv > 0.93) & core).astype(np.float32))   # eye whites / fang
alpha = ndimage.gaussian_filter(alpha, 0.6)
x0, y0, x1, y1 = FACE_BOX
tex = np.concatenate([rgbf, alpha[..., None]], -1)[y0:y1 + 1, x0:x1 + 1]
Image.fromarray((np.clip(tex, 0, 1) * 255).astype(np.uint8), "RGBA").resize(((x1 - x0 + 1) * 3, (y1 - y0 + 1) * 3), Image.LANCZOS).save(f"{B}/kyoko_face.png")

# ------------------------------------------------------------------ mesh builders
def mask_mesh(mask, grid=4, sigma=1.2, min_area=40):
    """contour-following triangulation of a 2D mask. Returns points P (x, y) with the boundary points first,
    triangles, the boundary count, each point's distance to the edge and its component's largest distance"""
    lab, n = ndimage.label(mask)
    if n == 0: return None
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    mask = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= min_area])
    lab, n = ndimage.label(mask)
    D = ndimage.distance_transform_edt(mask)
    Rmap = np.zeros(n + 1); Rmap[1:] = ndimage.maximum(D, lab, range(1, n + 1))
    blur = ndimage.gaussian_filter(mask.astype(np.float32), sigma)
    Hm, Wm = mask.shape
    bnd = np.concatenate([c[::2] for c in measure.find_contours(blur, 0.5) if len(c) >= 8])[:, ::-1]
    gy_, gx_ = np.mgrid[0:Hm:grid, 0:Wm:grid]
    inner = mask[gy_, gx_] & (D[gy_, gx_] > grid * 0.6)
    P = np.concatenate([bnd, np.stack([gx_[inner], gy_[inner]], -1).astype(float)])
    tri = Delaunay(P).simplices
    cen = P[tri].mean(1)
    tri = tri[ndimage.map_coordinates(blur, [cen[:, 1], cen[:, 0]], order=1) > 0.5]
    d = ndimage.map_coordinates(D, [P[:, 1], P[:, 0]], order=1)
    iy = np.clip(P[:, 1].round().astype(int), 0, Hm - 1); ix = np.clip(P[:, 0].round().astype(int), 0, Wm - 1)
    comp = lab[iy, ix]
    if (comp == 0).any():   # boundary points just outside the mask: take the nearest component
        _, idx = ndimage.distance_transform_edt(lab == 0, return_indices=True)
        comp = lab[idx[0], idx[1]][iy, ix]
    d[:len(bnd)] = 0
    return P, tri, len(bnd), d, Rmap[comp]

def cross2d(P, tri):
    e1 = P[tri[:, 1]] - P[tri[:, 0]]; e2 = P[tri[:, 2]] - P[tri[:, 0]]
    return e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]

def pillow(name, material, mask, base_y, front, back, bone_fn, grid=4, sigma=1.2, min_area=40, cap=None, normal=False):
    """inflate a front-view mask around a base surface Y = base_y(x_px, y_px); thickness front/back of the
    circular inflation height, optionally capped (flat slab) and applied along the base surface normal"""
    mm = mask_mesh(mask, grid, sigma, min_area)
    if mm is None: return
    P, tri, nb, d, Rv = mm
    h = np.sqrt(np.clip(d * (2 * Rv - d), 0, None)) * K
    hf, hb = h * front, h * back
    if cap is not None: hf, hb = np.minimum(hf, cap[0]), np.minimum(hb, cap[1])
    by = base_y(P[:, 0], P[:, 1])
    base = np.stack([PX(P[:, 0]), by, PZ(P[:, 1])], -1)
    n = np.tile([0.0, 1.0, 0.0], (len(P), 1))
    if normal:
        gxv = (base_y(P[:, 0] + 1, P[:, 1]) - base_y(P[:, 0] - 1, P[:, 1])) / (2 * K)     # dY/dX
        gzv = -(base_y(P[:, 0], P[:, 1] + 1) - base_y(P[:, 0], P[:, 1] - 1)) / (2 * K)    # dY/dZ
        n = np.stack([-gxv, np.ones_like(gxv), -gzv], -1); n /= np.linalg.norm(n, axis=1, keepdims=True)
    Vf = base - hf[:, None] * n
    Vb = base + hb[:, None] * n
    remap = np.arange(len(P)); remap[nb:] = len(P) + np.arange(len(P) - nb)   # boundary shared by both sides
    verts = np.concatenate([Vf, Vb[nb:]])
    tf = tri.copy(); flip = cross2d(P, tf) > 0          # front faces (toward -Y) wind clockwise in image space
    tf[flip] = tf[flip][:, ::-1]
    faces = np.concatenate([tf, remap[tf][:, ::-1]])
    xs, yy = np.concatenate([P[:, 0], P[nb:, 0]]), np.concatenate([P[:, 1], P[nb:, 1]])
    add(name, material, verts, faces, bone_fn(xs, yy))

def mask_rows(mask, step, smooth_rows=2, y_min=0, y_max=10 ** 9):
    rows_ = [y for y in range(0, Hpx, step) if mask[y].any() and y_min <= y <= y_max]
    Ls = smooth1([np.nonzero(mask[y])[0].min() - 0.5 for y in rows_], smooth_rows)
    Rs = smooth1([np.nonzero(mask[y])[0].max() + 0.5 for y in rows_], smooth_rows)
    return np.array(rows_, float), (Ls + Rs) / 2, (Rs - Ls) / 2

def ring_volume(name, material, rings, bone_fn, nseg=36, bottom_inset=0.0):
    """closed body from horizontal elliptical rings (y px or per-vertex y array, centre x px, half-width px,
    half-depth units, centre depth units), top to bottom; the bottom cap can be pushed up into the body"""
    phi = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    verts = []
    for y, cx, hw, dy, yc in rings:
        verts.append(np.stack([PX(cx) + hw * K * np.sin(phi), yc - dy * np.cos(phi), PZ(np.broadcast_to(y, (nseg,)))], -1))
    n = len(verts); verts = list(np.concatenate(verts))
    faces = []
    for j in range(n - 1):
        for k in range(nseg):
            a_, b_ = j * nseg + k, j * nseg + (k + 1) % nseg
            c_, d_ = (j + 1) * nseg + (k + 1) % nseg, (j + 1) * nseg + k
            faces += [[a_, d_, c_], [a_, c_, b_]]
    top = len(verts); verts.append([PX(rings[0][1]), rings[0][4], float(np.mean(PZ(rings[0][0])))])
    bot = len(verts); verts.append([PX(rings[-1][1]), rings[-1][4], float(np.mean(PZ(rings[-1][0]))) + bottom_inset])
    for k in range(nseg):
        faces.append([top, k, (k + 1) % nseg]); faces.append([bot, (n - 1) * nseg + (k + 1) % nseg, (n - 1) * nseg + k])
    verts = np.array(verts)
    add(name, material, verts, faces, bone_fn(verts[:, 0] / K + CX, FOOT - verts[:, 2] / K))

def tube(name, material, path, radius_px, depths, bone_fn, nseg=20, per=4, flat=1.0, tip=False):
    """round tube along a polyline of reference pixels; radius per control point (tip: close to a point)"""
    P = np.array([[PX(x), d, PZ(y)] for (x, y), d in zip(path, depths)])
    Rr = np.array(radius_px, float) * K
    t = np.linspace(0, 1, (len(P) - 1) * per + 1)
    seg = np.minimum((t * (len(P) - 1)).astype(int), len(P) - 2); u = t * (len(P) - 1) - seg
    C = P[seg] * (1 - u)[:, None] + P[seg + 1] * u[:, None]
    rad = Rr[seg] * (1 - u) + Rr[seg + 1] * u
    T_ = np.gradient(C, axis=0); T_ /= np.linalg.norm(T_, axis=1, keepdims=True)
    verts, faces = [], []
    for j in range(len(C)):
        n1 = np.cross(T_[j], [0, 1, 0]); n1 /= np.linalg.norm(n1); n2 = np.cross(T_[j], n1)
        for k in range(nseg):
            a = 2 * np.pi * k / nseg
            verts.append(C[j] + rad[j] * (np.cos(a) * n1 + np.sin(a) * n2 * flat))
    n = len(C)
    for j in range(n - 1):
        for k in range(nseg):
            a_, b_ = j * nseg + k, j * nseg + (k + 1) % nseg
            c_, d_ = (j + 1) * nseg + (k + 1) % nseg, (j + 1) * nseg + k
            faces += [[a_, b_, c_], [a_, c_, d_]]
    s0 = len(verts); verts.append(C[0]); s1 = len(verts)
    verts.append(C[-1] + (T_[-1] * rad[-1] * 1.6 if tip else 0))
    for k in range(nseg):
        faces.append([s0, (k + 1) % nseg, k]); faces.append([s1, (n - 1) * nseg + k, (n - 1) * nseg + (k + 1) % nseg])
    verts = np.array(verts)
    add(name, material, verts, faces, bone_fn(verts[:, 0] / K + CX, FOOT - verts[:, 2] / K))

def const(v): return lambda x, y: np.full(len(x), v, float)
def one(bone): return lambda x, y: {bone: np.ones(len(x))}
def lerp_bones(chain, key="y"):
    """chain: [(pixel coordinate, bone), ...] along y (or x); linear blend between neighbours"""
    def f(x, y):
        c = y if key == "y" else x
        pos = np.array([p for p, _ in chain], float)
        out = {b: np.zeros(len(x)) for _, b in chain}
        idx = np.clip(np.searchsorted(pos, c) - 1, 0, len(pos) - 2)
        t_ = np.clip((c - pos[idx]) / (pos[idx + 1] - pos[idx]), 0, 1)
        for i, (_, b) in enumerate(chain):
            out[b] += np.where(idx == i, 1 - t_, 0) + np.where(idx == i - 1, t_, 0)
        return out
    return f

# ------------------------------------------------------------------ torso: oversized tee
# rows of the navy mask give the width; above the first full row a rounded shoulder dome rises to the neck
# (hidden under the collar); the hem ring dips at the front exactly like the drawn hem curve
TORSO_Y0 = -0.04
def tee_depth(hw): return np.minimum(0.62 * hw * K, 0.37)
tm = load("torso")
ty, tcx, thw = mask_rows(tm, 4, 4, y_min=480, y_max=612)
rings = []
for tk in np.linspace(1, 0, 10, endpoint=False):                      # dome, top to bottom
    hw = max(thw[0] * (1 - tk ** 2.5) ** 0.4, 22.0)
    rings.append((480 - 78 * tk, tcx[0] + (CX - tcx[0]) * tk, hw, tee_depth(hw), TORSO_Y0))
for y, cx, hw in zip(ty, tcx, thw): rings.append((y, cx, hw, tee_depth(hw), TORSO_Y0))
hem_x = np.arange(Wpx); hem_col = np.array([np.nonzero(tm[:, x])[0].max() if tm[:, x].any() else 0 for x in hem_x], float)
hem_col = smooth1(np.where(hem_col > 0, hem_col, np.nan), 4)
phi36 = np.linspace(0, 2 * np.pi, 36, endpoint=False)
cx_h, hw_h = tcx[-1], thw[-1]
xh = cx_h + hw_h * np.sin(phi36)
side_hem = float(np.nanmin(hem_col[int(cx_h - hw_h) + 2:int(cx_h + hw_h) - 1]))
hem_phi = np.where(np.cos(phi36) > 0, np.interp(xh, hem_x[np.isfinite(hem_col)], hem_col[np.isfinite(hem_col)]), side_hem)
hem_phi = np.maximum(hem_phi, side_hem)
for j in range(1, 6):                                                  # hem rings with per-vertex rows
    f = j / 5
    rings.append((612 + (hem_phi - 612) * f, cx_h, hw_h + 2 * f, tee_depth(hw_h + 2 * f), TORSO_Y0))
ring_volume("Torso", "Top", rings, lerp_bones([(470, "chest"), (560, "spine"), (630, "hips")]), bottom_inset=0.07)
tube("Neck", "Skin", [(292, 370), (292, 412)], [21, 23], [-0.03, -0.05], one("neck"), nseg=16)

# ------------------------------------------------------------------ hair
def hair_top_base(x, y):
    fy, ok = head_front_y(x, y, 0.035)
    side = HEAD["yc"] - 0.06
    return np.where(ok, np.minimum(fy, side), side)
pillow("HairTop", "Hair", load("hair_top"), hair_top_base, 0.4, 0.4, one("head"), grid=4)

# braid: a generalised cylinder along its centre line, radius = the drawn width across the line (lobes, tie, tuft)
braid_m = load("braid")
bys = np.array([y for y in np.arange(310, 444, 4.0) if braid_m[int(y)].any()])
bcx = smooth1([np.nonzero(braid_m[int(y)])[0].mean() for y in bys], 2)
bpath = np.stack([bcx, bys], -1)
tang = np.gradient(bpath, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True)
nrm2 = np.stack([-tang[:, 1], tang[:, 0]], -1)
def reach(p, dirv):
    s = 0.0
    while s < 40:
        q = p + dirv * (s + 0.5)
        if not braid_m[int(round(q[1])), int(round(q[0]))]: break
        s += 0.5
    return s
wp = np.array([reach(p, n) for p, n in zip(bpath, nrm2)]); wm = np.array([reach(p, -n) for p, n in zip(bpath, nrm2)])
bpath = bpath + nrm2 * ((wp - wm) / 2)[:, None]
brad = np.maximum(smooth1((wp + wm) / 2, 1) - 1.0, 4.0)
bdep = np.interp(bys, [310, 330, 362, 393, 420, 446], [-0.02, -0.08, -0.24, -0.37, -0.46, -0.5])
tube("Braid", "Hair", [tuple(p) for p in bpath], brad, bdep, lerp_bones([(330, "head"), (390, "braid1"), (440, "braid2")]),
     nseg=16, per=2, flat=0.85, tip=True)

# ------------------------------------------------------------------ collar-capelet, button
# the capelet wraps an elliptic cylinder round the shoulders (its right end tucks behind the cape edge) and its
# top curls back to the neck; a thin cloth slab, thickness along the surface normal
COL_RX, COL_D = 190.0, 0.36
def collar_base(x, y):
    u = np.clip((np.asarray(x, float) - CX) / COL_RX, -0.995, 0.995)
    d = TORSO_Y0 - COL_D * np.sqrt(1 - u ** 2)
    top = np.where(np.asarray(x, float) > 330, 384.0, 397.0)
    tt = np.clip((np.asarray(y, float) - top) / 14, 0, 1); tt = tt * tt * (3 - 2 * tt)
    neck = TORSO_Y0 - 0.08
    return neck + (d - neck) * tt
collar_m = load("collar")
ext = collar_m[:, 462:468].any(1)
collar_m[ext, 462:481] = True                                        # continue under the cape's front edge
grey_ref = (fs < 0.14) & (fvv >= 0.3) & (fvv < 0.95)
up = grey_ref & (YY >= 383) & (YY < 400) & (XX > 330) & (XX < 481) & ~ndimage.binary_dilation(load("hair_top") | (fvv < 0.3), iterations=1)
lab_u, _ = ndimage.label(up | collar_m)
collar_m = np.isin(lab_u, np.unique(lab_u[collar_m])) & (lab_u > 0)
collar_m = ndimage.binary_closing(collar_m, iterations=2) & (XX <= 322)
pillow("Collar", "Collar", collar_m, collar_base, 0.3, 0.25, one("chest"), grid=3, cap=(0.03, 0.02), normal=True)
button_y = float(collar_base(np.array([CX]), np.array([426.0]))[0]) - 0.05
pillow("Button", "Button", load("button"), const(button_y), 0.35, 0.25, one("chest"), grid=2)

# ------------------------------------------------------------------ shorts, legs
sh = load("shorts")
for side, sel, bone in (("R", XX < CX, "thigh_R"), ("L", XX >= CX, "thigh_L")):
    sy, scx, shw = mask_rows(sh & sel, 3, 1)
    ring_volume("Shorts_" + side, "Shorts", [(y, cx, hw, 0.85 * hw * K, TORSO_Y0) for y, cx, hw in zip(sy, scx, shw)],
                lerp_bones([(640, "hips"), (668, bone)]), nseg=28)
legs = load("legs")
lab_l, _ = ndimage.label(legs)
for side, cxp in (("R", 232), ("L", 358)):     # character's right leg is on the image left
    ids = [i for i in range(1, lab_l.max() + 1) if abs(np.nonzero(lab_l == i)[1].mean() - cxp) < 60]
    ly, lcx, lhw = mask_rows(np.isin(lab_l, ids), 2, 2)
    ft = np.clip((ly - 712) / 21, 0, 1)                            # the foot reaches forward
    ring_volume("Leg_" + side, "Skin", [(y, cx, hw, hw * K * (1 + 0.9 * f), TORSO_Y0 - 0.05 * f)
                                        for y, cx, hw, f in zip(ly, lcx, lhw, ft)],
                lerp_bones([(680, "thigh_" + side), (700, "shin_" + side), (722, "foot_" + side)]), nseg=20)

# sleeves and forearms: round tubes along the arm, sized from the reference
tube("Sleeve_R", "Top", [(208, 470), (180, 448), (154, 428)], [29, 27, 24], [-0.24, -0.35, -0.46], one("upperarm_R"))
tube("Sleeve_L", "Top", [(386, 486), (408, 494), (430, 500)], [24, 22, 20], [-0.24, -0.37, -0.5], one("upperarm_L"))
tube("Arm_R", "Skin", [(150, 426), (141, 416), (131, 404)], [10.5, 10, 9.5], [-0.47, -0.6, -0.72], one("forearm_R"), nseg=14)
tube("Arm_L", "Skin", [(428, 497), (444, 500), (460, 503)], [10.5, 10, 9.5], [-0.5, -0.66, -0.8], one("forearm_L"), nseg=14)
pillow("Glove_R", "Glove", largest(load("glove_r")), const(-0.76), 0.9, 0.45, one("hand_R"), grid=2)
pillow("Glove_L", "Glove", largest(load("glove_l")), const(-0.84), 0.9, 0.45, one("hand_L"), grid=2)
# koala face on the hood
for nm, part in (("KoalaNose", "koala_nose"), ("KoalaEye_R", "koala_eye_r"), ("KoalaEye_L", "koala_eye_l")):
    pillow(nm, "Nose", load(part), lambda x, y: shell_front_y(x, y) - 0.004, 0.45 if nm == "KoalaNose" else 0.25, 0.1, one("head"), grid=2)

# ears: flattened ellipsoids standing on the hood, inner fur pillow in front
for side, e, part in (("R", ref["ears"][0], "ear_in_r"), ("L", ref["ears"][1], "ear_in_l")):
    r = e["r"] * 0.9
    ev, ef = ellipsoid(PX(e["cx"]), PZ(e["cy"]), 0.05, r * K, r * K * 0.96, r * K * 0.34, 32, 20)
    add("Ear_" + side, "Hood", ev, ef, {"ear_" + side: np.ones(len(ev))})
    pillow("EarIn_" + side, "EarInner", largest(load(part)), const(0.05 - r * K * 0.34 + 0.012), 0.12, 0.05, one("ear_" + side), grid=3)

# ------------------------------------------------------------------ long hair: a curtain hanging behind the body
# U-shaped sheet around the back (u = -pi/2 image-left side, 0 back, +pi/2 image-right side), as wide as the drawn
# hair, as deep as the back of the head, kept inside the cape; trimmed wherever the reference shows cape lining,
# so its visible sides are exactly the drawn strands
HY0, HY1 = 195, 704
hy = np.arange(HY0, HY1 + 1)
hair_all = load("hair_left") | load("hair_top") | load("hair_back") | load("hair_right")
def outer_edge(sign):
    out = np.full(len(hy), np.nan)
    for i, y in enumerate(hy):
        xs = np.nonzero(hair_all[y, :int(CX)])[0] if sign < 0 else np.nonzero(hair_all[y, int(CX):])[0]
        if len(xs): out[i] = (CX - xs.min()) if sign < 0 else xs.max()
    ok = np.isfinite(out) & ((hy < 372) | ((hy > 468) & (hy < 668)))   # the side locks and the long strands
    return smooth1(np.interp(hy, hy[ok], out[ok]), 6) - 6
hw_head = HEAD["rx"] * np.sqrt(np.clip(1 - ((hy - HEAD["cy"]) / HEAD["rz"]) ** 2, 0, 1))
hd_head = HEAD["ry"] * np.sqrt(np.clip(1 - ((hy - HEAD["cy"]) / HEAD["rz"]) ** 2, 0, 1))
aL = np.maximum(outer_edge(-1), hw_head + 14 + (CX - HEAD["cx"]))
aR = np.maximum(outer_edge(1), hw_head + 14 - (CX - HEAD["cx"]))
HYC = HEAD["yc"]
bb = np.maximum(np.where(hy < HEAD["cy"], hd_head, HEAD["ry"]) + 0.06, 0.3)
# keep the sheet (with its thickness) inside the cape's inner surface
sa_in = np.interp(hy, row_y, a_px) * K - T; sb_in = np.interp(hy, row_y, a_px) * K * DEPTH - T; sc = np.interp(hy, row_y, c_px)
uu_t = np.linspace(-np.pi / 2, np.pi / 2, 61)
for i in range(len(hy)):
    for _ in range(40):
        a_ = np.where(uu_t < 0, aL[i], aR[i]) * K + 0.045
        xx = CX * K + a_ * np.sin(uu_t) - sc[i] * K; yy_ = HYC + (bb[i] + 0.045) * np.cos(uu_t)
        if ((xx / max(sa_in[i], 1e-3)) ** 2 + (yy_ / max(sb_in[i], 1e-3)) ** 2).max() <= 0.97 ** 2: break
        if bb[i] > 0.3: bb[i] *= 0.97
        else: aL[i] *= 0.97; aR[i] *= 0.97
# where may the curtain be seen: everywhere except the cape lining inside the opening
white = (fs < 0.06) & (fvv > 0.97)
frame = np.zeros((Hpx, Wpx), bool); frame[:5] = frame[-5:] = True; frame[:, :5] = frame[:, -5:] = True
lab_bg, _ = ndimage.label(white | frame)
fg = lab_bg != lab_bg[2, 2]
grey_px = (fs < 0.14) & (fvv >= 0.3) & (fvv < 0.95) & fg
allparts = face_region | collar_m          # grey things that are not lining
for nm in ("glove_r", "glove_l", "button", "shorts", "ear_in_r", "ear_in_l"):
    allparts |= load(nm)
allparts = ndimage.binary_dilation(allparts, iterations=2)
oL = np.interp(np.arange(Hpx), row_y, c_px - ratioL * a_px); oR = np.interp(np.arange(Hpx), row_y, c_px + ratioR * a_px)
in_open = (XX > oL[:, None] + 3) & (XX < oR[:, None] - 3) & (YY > top_hole) & (YY < hem_y)
in_open |= (YY > 676) & fg                 # the bottom of the opening shows lining right to the hem
keep = fg & ~(grey_px & in_open & ~allparts)
S_U = 150.0
NU = int(np.pi * S_U) + 1
uu = np.linspace(-np.pi / 2, np.pi / 2, NU)
a_grid = np.where(uu[None, :] < 0, aL[:, None], aR[:, None])
xg = np.clip(np.round(CX + a_grid * np.sin(uu)[None, :]).astype(int), 0, Wpx - 1)
M = np.pad(keep[hy[:, None], xg], 3)
P, tri, nb, dd, _ = mask_mesh(M, 5, 1.0, 80)
u_v = (P[:, 0] - 3) / (NU - 1) * np.pi - np.pi / 2
y_v = P[:, 1] - 3 + HY0
a_v = np.where(u_v < 0, np.interp(y_v, hy, aL), np.interp(y_v, hy, aR)) * K
b_v = np.interp(y_v, hy, bb)
base = np.stack([a_v * np.sin(u_v), HYC + b_v * np.cos(u_v), PZ(y_v)], -1)
n_o = np.stack([b_v * np.sin(u_v), a_v * np.cos(u_v), np.zeros_like(u_v)], -1); n_o /= np.linalg.norm(n_o, axis=1, keepdims=True)
th = 0.04 * np.sqrt(np.clip(1 - (1 - np.minimum(dd / 5.0, 1)) ** 2, 0, 1)); th[:nb] = 0
remap = np.arange(len(P)); remap[nb:] = len(P) + np.arange(len(P) - nb)
to = tri.copy(); flip = cross2d(P, to) < 0; to[flip] = to[flip][:, ::-1]        # outer side faces away from the body
cverts = np.concatenate([base + th[:, None] * n_o, (base - th[:, None] * n_o)[nb:]])
cfaces = np.concatenate([to, remap[to][:, ::-1]])
cu = np.concatenate([u_v, u_v[nb:]]); cy_ = np.concatenate([y_v, y_v[nb:]])
wr = np.clip(0.5 - cu / 0.6, 0, 1)
chR = lerp_bones([(380, "head"), (440, "chest"), (560, "hair_R1"), (690, "hair_R2")])(cu, cy_)
chL = lerp_bones([(380, "head"), (440, "chest"), (560, "hair_L1"), (690, "hair_L2")])(cu, cy_)
cw = {}
for dct, w in ((chR, wr), (chL, 1 - wr)):
    for k_, v_ in dct.items(): cw[k_] = cw.get(k_, 0) + v_ * w
add("HairLong", "Hair", cverts, cfaces, cw)
print("curtain rows a/b sample:", [(int(y), int(aL[i]), int(aR[i]), round(float(bb[i]), 2)) for i, y in enumerate(hy) if y % 60 == 15])

# ------------------------------------------------------------------ bones (reference pixels -> units)
def P3(x, y, yd=0.0): return [float(PX(x)), yd, float(PZ(y))]
BONES = [
    ("root", None, P3(292, 733), P3(292, 700)),
    ("hips", "root", P3(292, 660), P3(292, 600)),
    ("spine", "hips", P3(292, 600), P3(292, 520)),
    ("chest", "spine", P3(292, 520), P3(292, 420)),
    ("neck", "chest", P3(290, 420), P3(288, 395)),
    ("head", "neck", P3(288, 395), P3(284, 150)),
    ("ear_R", "head", P3(ref["ears"][0]["cx"], ref["ears"][0]["cy"] + 40, 0.05), P3(ref["ears"][0]["cx"] - 20, ref["ears"][0]["cy"] - 60, 0.05)),
    ("ear_L", "head", P3(ref["ears"][1]["cx"], ref["ears"][1]["cy"] + 40, 0.05), P3(ref["ears"][1]["cx"] + 20, ref["ears"][1]["cy"] - 60, 0.05)),
    ("upperarm_R", "chest", P3(200, 462, -0.26), P3(160, 432, -0.44)),
    ("forearm_R", "upperarm_R", P3(160, 432, -0.44), P3(132, 402, -0.72)),
    ("hand_R", "forearm_R", P3(132, 402, -0.72), P3(104, 368, -0.78)),
    ("upperarm_L", "chest", P3(388, 482, -0.24), P3(428, 496, -0.5)),
    ("forearm_L", "upperarm_L", P3(428, 496, -0.5), P3(458, 502, -0.8)),
    ("hand_L", "forearm_L", P3(458, 502, -0.8), P3(518, 516, -0.86)),
    ("thigh_R", "hips", P3(245, 660), P3(236, 695)),
    ("shin_R", "thigh_R", P3(236, 695), P3(232, 718)),
    ("foot_R", "shin_R", P3(232, 718), P3(230, 732, -0.05)),
    ("thigh_L", "hips", P3(340, 660), P3(350, 695)),
    ("shin_L", "thigh_L", P3(350, 695), P3(355, 718)),
    ("foot_L", "shin_L", P3(355, 718), P3(358, 732, -0.05)),
    ("braid1", "head", P3(150, 330, -0.08), P3(186, 390, -0.35)),
    ("braid2", "braid1", P3(186, 390, -0.35), P3(212, 444, -0.5)),
    ("hair_R1", "chest", P3(140, 440, 0.45), P3(125, 560, 0.5)),
    ("hair_R2", "hair_R1", P3(125, 560, 0.5), P3(150, 690, 0.45)),
    ("hair_L1", "chest", P3(444, 440, 0.45), P3(462, 560, 0.5)),
    ("hair_L2", "hair_L1", P3(462, 560, 0.5), P3(440, 690, 0.45)),
    ("cape_B", "chest", P3(292, 470, 0.9), P3(292, 700, 0.8)),
    ("cape_L", "chest", P3(520, 470, 0.2), P3(470, 700, 0.1)),
    ("cape_R", "chest", P3(64, 470, 0.2), P3(114, 700, 0.1)),
]

np.savez_compressed(f"{B}/kyoko_geo.npz", parts=np.array([json.dumps({
    "name": p["name"], "material": p["material"], "verts": p["verts"].tolist(), "faces": p["faces"].tolist(),
    "weights": {k: np.asarray(v, float).round(4).tolist() for k, v in p["weights"].items()},
    "uv": None if p["uv"] is None else np.asarray(p["uv"]).tolist(),
    "face_mat": p.get("face_mat", np.zeros(0)).tolist(),
}) for p in PARTS]), bones=json.dumps(BONES), meta=json.dumps({"K": K, "CX": CX, "FOOT": FOOT, "face_box": FACE_BOX}))
print("parts", len(PARTS), "verts", sum(len(p["verts"]) for p in PARTS), "faces", sum(len(p["faces"]) for p in PARTS))
for p in PARTS: print(f"  {p['name']:12s} v={len(p['verts']):6d} f={len(p['faces']):6d}")
