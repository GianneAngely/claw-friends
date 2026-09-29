# Claw Friends main character, modeled procedurally in Blender (no AI): chibi girl in a koala hood-cape,
# magenta hair, navy sweater, grey pants. Smooth meshes + an armature with hand-computed skin weights.
# Blender axes: Z up, character faces -Y, +X is the character's left. glTF export turns this into Y up / +Z front.
# usage: run.sh kid_model.py -- <out.glb> [preview_dir]
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/kid.glb"
PREVIEW = argv[1] if len(argv) > 1 else None

# ---------------------------------------------------------------- scene / helpers
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection

MATS = {}
def mat(name, rgb):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf: bsdf.inputs["Base Color"].default_value = (*[(c / 255) ** 2.2 for c in rgb], 1)
    m.diffuse_color = (*[(c / 255) ** 2.2 for c in rgb], 1)
    MATS[name] = m
    return m

M = {
    "Skin": mat("Skin", (255, 230, 216)), "Face": mat("Face", (255, 230, 216)),
    "Hair": mat("Hair", (204, 46, 134)),
    "Hood": mat("Hood", (180, 179, 198)), "HoodInner": mat("HoodInner", (238, 236, 246)), "HoodRim": mat("HoodRim", (214, 213, 226)),
    "EarInner": mat("EarInner", (244, 242, 250)), "Nose": mat("Nose", (58, 52, 64)), "Dot": mat("Dot", (42, 32, 52)),
    "Sweater": mat("Sweater", (43, 58, 110)), "SweaterDark": mat("SweaterDark", (33, 46, 90)),
    "Heart": mat("Heart", (255, 255, 255)), "Clasp": mat("Clasp", (255, 116, 184)), "Bill": mat("Bill", (255, 158, 72)),
    "Pants": mat("Pants", (217, 218, 227)), "PantsDark": mat("PantsDark", (190, 192, 204)),
    "Shoe": mat("Shoe", (43, 58, 110)), "Sole": mat("Sole", (255, 255, 255)),
}

PARTS = []   # (object, weight_fn, group)
GROUP = ["Body"]      # current group for new parts

def new_obj(name, verts, faces, material, weight_fn):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate(clean_customdata=False)
    for p in me.polygons: p.use_smooth = True
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    PARTS.append((ob, weight_fn, GROUP[0]))
    return ob

def grid(fn, nu, nv, closed_u, material, name, weight_fn, cap_start=None, cap_end=None, flip=False):
    """Surface from fn(u, v) with u in [0,1] (around) and v in [0,1] (along). Optional pole caps."""
    verts, faces = [], []
    cu = nu if closed_u else nu + 1
    for j in range(nv + 1):
        for i in range(cu):
            verts.append(fn(i / nu, j / nv))
    def idx(i, j): return j * cu + (i % cu if closed_u else i)
    for j in range(nv):
        for i in range(nu):
            a, b, c, d = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            faces.append((a, d, c, b) if flip else (a, b, c, d))
    if cap_start is not None:
        verts.append(cap_start); k = len(verts) - 1
        for i in range(nu):
            f = (k, idx(i + 1, 0), idx(i, 0))
            faces.append(f[::-1] if flip else f)
    if cap_end is not None:
        verts.append(cap_end); k = len(verts) - 1
        for i in range(nu):
            f = (k, idx(i, nv), idx(i + 1, nv))
            faces.append(f[::-1] if flip else f)
    return new_obj(name, verts, faces, material, weight_fn)

def _ell(name, c, r, material, weight_fn, nu, nv):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=nu, v_segments=nv, radius=1.0)
    for v in bm.verts:
        v.co = Vector((c.x + v.co.x * r[0], c.y + v.co.y * r[1], c.z + v.co.z * r[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    PARTS.append((ob, weight_fn, GROUP[0]))
    return ob

def catmull(pts, n):
    pts = [Vector(p) for p in pts]
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(len(pts) - 1, i + 2)]
        for k in range(n):
            t = k / n; t2 = t * t; t3 = t2 * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out

def sweep(name, ctrl, prof, material, weight_fn, hint=(0, -1, 0), seg=10, per=8, tip=True, start_cap=True):
    """Tube/ribbon along a smooth path. prof(t) -> (half width along side, half thickness along normal)."""
    P = catmull(ctrl, per)
    n = len(P)
    T = [(P[min(n - 1, i + 1)] - P[max(0, i - 1)]).normalized() for i in range(n)]
    h = Vector(hint).normalized()
    S = h.cross(T[0])
    if S.length < 1e-4: S = Vector((1, 0, 0)).cross(T[0])
    S.normalize()
    frames = []
    for i in range(n):
        if i: S = (S - T[i] * S.dot(T[i])).normalized()
        frames.append((S.copy(), T[i].cross(S).normalized()))
    verts, faces = [], []
    last = n - 1 if tip else n
    for i in range(last):
        w, th = prof(i / (n - 1))
        s, nn = frames[i]
        for k in range(seg):
            a = k / seg * 2 * math.pi
            verts.append(P[i] + s * (w * math.cos(a)) + nn * (th * math.sin(a)))
    rings = last
    for i in range(rings - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    if tip:
        verts.append(P[-1]); t_i = len(verts) - 1
        for k in range(seg):
            faces.append(((rings - 1) * seg + k, (rings - 1) * seg + (k + 1) % seg, t_i))
    else:
        verts.append(P[-1]); t_i = len(verts) - 1
        for k in range(seg):
            faces.append(((rings - 1) * seg + k, (rings - 1) * seg + (k + 1) % seg, t_i))
    if start_cap:
        verts.append(P[0]); s_i = len(verts) - 1
        for k in range(seg):
            faces.append(((k + 1) % seg, k, s_i))
    return new_obj(name, verts, faces, material, weight_fn)

def profile(points):
    """Smooth radius-by-height lookup through (z, r) points (z descending), Catmull-Rom interpolated."""
    P = catmull([Vector((z, r, 0)) for z, r in points], 12)
    def f(z):
        if z >= P[0].x: return P[0].y
        for i in range(1, len(P)):
            if z >= P[i].x:
                k = (P[i - 1].x - z) / max(1e-6, P[i - 1].x - P[i].x)
                return P[i - 1].y + (P[i].y - P[i - 1].y) * k
        return P[-1].y
    return f

def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)

# ---------------------------------------------------------------- proportions
HC = Vector((0, 0, 2.2)); HA, HBY, HBZ = 1.06, 0.98, 0.98          # head ellipsoid (x, y, z radii)
def head_pt(d, off=0.0):
    """Point on the head ellipsoid in direction d (from the head centre), pushed out by off along the normal."""
    d = Vector(d).normalized()
    k = 1 / math.sqrt((d.x / HA) ** 2 + (d.y / HBY) ** 2 + (d.z / HBZ) ** 2)
    p = d * k
    n = Vector((p.x / HA ** 2, p.y / HBY ** 2, p.z / HBZ ** 2)).normalized()
    return HC + p + n * off, n

# ---------------------------------------------------------------- weights
def W(**kw): return lambda p: kw
HEAD = W(head=1.0)

def w_torso(p):
    z = p.z
    hips = 1 - smooth(0.7, 0.95, z); chest = smooth(1.0, 1.3, z)
    return {"hips": hips, "spine": max(0.0, 1 - hips - chest), "chest": chest}

def w_hood(p):   # hood follows the head; its lowest back part eases into the chest
    t = smooth(1.35, 1.75, p.z)
    return {"head": t, "chest": 1 - t}

CAPE_CHAINS = [("FL", math.radians(55)), ("L", math.radians(115)), ("B", math.radians(180)), ("R", math.radians(-115)), ("FR", math.radians(-55))]
def w_cape(p):
    z = p.z
    th = math.atan2(p.x, -p.y)                    # 0 = front, + toward the character's left (+X)
    ang = [(a if a >= 0 else a + 2 * math.pi) for _, a in CAPE_CHAINS]
    t = th if th >= 0 else th + 2 * math.pi
    order = sorted(range(len(ang)), key=lambda i: ang[i])
    A = [ang[i] for i in order]; N = [CAPE_CHAINS[i][0] for i in order]
    j = 0
    while j < len(A) and A[j] < t: j += 1
    i0, i1 = (j - 1) % len(A), j % len(A)
    a0, a1 = A[i0], A[i1]
    span = (a1 - a0) % (2 * math.pi) or 2 * math.pi
    f = ((t - a0) % (2 * math.pi)) / span
    chest = smooth(1.12, 1.45, z)
    lower = 1 - smooth(0.55, 0.92, z)
    upper = max(0.0, 1 - chest - lower)
    w = {"chest": chest}
    for name, share in ((N[i0], 1 - f), (N[i1], f)):
        w["cape_%s1" % name] = w.get("cape_%s1" % name, 0) + upper * share
        w["cape_%s2" % name] = w.get("cape_%s2" % name, 0) + lower * share
    return w

def w_arm(side, sh, el, wr):
    sh, el, wr = Vector(sh), Vector(el), Vector(wr)
    def f(p):
        d1 = (el - sh); t1 = (p - sh).dot(d1) / d1.length_squared
        d2 = (wr - el); t2 = (p - el).dot(d2) / d2.length_squared
        if t1 < 0.2:
            k = max(0.0, t1) / 0.2
            return {"chest": 0.6 * (1 - k), "upperarm_" + side: 0.4 + 0.6 * k}
        if t2 < -0.12: return {"upperarm_" + side: 1.0}
        if t2 < 0.12:
            k = (t2 + 0.12) / 0.24
            return {"upperarm_" + side: 1 - k, "forearm_" + side: k}
        if t2 < 0.92: return {"forearm_" + side: 1.0}
        k = min(1.0, (t2 - 0.92) / 0.16)
        return {"forearm_" + side: 1 - k, "hand_" + side: k}
    return f

def w_leg(side):
    def f(p):
        z = p.z
        if z > 0.5: return {"hips": smooth(0.5, 0.62, z), "thigh_" + side: 1 - smooth(0.5, 0.62, z)}
        if z > 0.28:
            k = smooth(0.3, 0.42, z)
            return {"thigh_" + side: k, "shin_" + side: 1 - k}
        if z > 0.12: return {"shin_" + side: 1.0}
        return {"shin_" + side: 0.3, "foot_" + side: 0.7}
    return f

def w_foot(side): return W(**{"foot_" + side: 1.0})

def w_hair(side):
    def f(p):
        z = p.z
        head = smooth(1.75, 2.05, z)
        low = 1 - smooth(0.95, 1.35, z)
        return {"head": head, "hair_%s1" % side: max(0.0, 1 - head - low), "hair_%s2" % side: low}
    return f

def w_ear(side):
    def f(p):
        return {"ear_" + side: 1.0}
    return f

# ---------------------------------------------------------------- head, face
_ell("Head", HC, (HA, HBY, HBZ), M["Skin"], HEAD, 40, 28)

# face cap: front part of a slightly larger head ellipsoid, in front-axis spherical coordinates
def face_fn(u, v):
    beta = u * 2 * math.pi; alpha = v * math.radians(74)
    d = Vector((math.sin(alpha) * math.cos(beta), -math.cos(alpha), math.sin(alpha) * math.sin(beta)))
    p, n = head_pt(d, 0.012)
    return p
grid(face_fn, 48, 20, True, M["Face"], "Face", HEAD, cap_start=head_pt((0, -1, 0), 0.012)[0])

# ---------------------------------------------------------------- hood (thick shell with an oval face opening)
HOOD_C = Vector((0, 0.06, 2.24)); HRX, HRY, HRZ = 1.17, 1.13, 1.11
OVAL_W, OVAL_H = 0.96, 0.75
def hood_alpha_edge(beta):
    return math.asin(min(1.0, 1 / math.sqrt((HRX * math.cos(beta) / OVAL_W) ** 2 + (HRZ * math.sin(beta) / OVAL_H) ** 2)))
def hood_pt(alpha, beta, scale=1.0):
    d = Vector((math.sin(alpha) * math.cos(beta), -math.cos(alpha), math.sin(alpha) * math.sin(beta)))
    return HOOD_C + Vector((d.x * HRX * scale, d.y * HRY * scale, d.z * HRZ * scale))
NB, NA = 64, 26
def hood_rows(scale, flip):
    verts, faces = [], []
    for j in range(NA + 1):
        for i in range(NB):
            beta = i / NB * 2 * math.pi
            a0 = hood_alpha_edge(beta)
            a = a0 + (math.pi - 0.0001 - a0) * (j / NA) ** 1.0
            verts.append(hood_pt(a, beta, scale))
    for j in range(NA):
        for i in range(NB):
            a, b, c, d = j * NB + i, j * NB + (i + 1) % NB, (j + 1) * NB + (i + 1) % NB, (j + 1) * NB + i
            faces.append((a, d, c, b) if not flip else (a, b, c, d))
    return verts, faces
ov, of = hood_rows(1.0, False)
iv, inf = hood_rows(0.93, True)
off = len(ov)
verts = ov + iv
faces = of + [tuple(x + off for x in f) for f in inf]
# rolled rim joining outer and inner edge rows
for i in range(NB):
    a, b = i, (i + 1) % NB
    faces.append((a, b, b + off, a + off))
hood = new_obj("Hood", verts, faces, M["Hood"], w_hood)
# lining color on the inner faces
hood.data.materials.append(M["HoodInner"])
for k, p in enumerate(hood.data.polygons):
    if k >= len(of) and k < len(of) + len(inf): p.material_index = 1

# soft rim tube around the face opening
rim = []
for i in range(NB + 1):
    beta = i / NB * 2 * math.pi
    rim.append(hood_pt(hood_alpha_edge(beta), beta, 0.965))
sweep("HoodRim", rim, lambda t: (0.075, 0.075), M["HoodRim"], w_hood, hint=(0, -1, 0), seg=10, per=1, tip=False, start_cap=False)

# ---------------------------------------------------------------- cape (thick shell, open front, folds, flared hem)
CAPE_PROF = [(2.12, 1.02), (1.95, 1.1), (1.7, 1.08), (1.45, 1.02), (1.15, 1.03), (0.85, 1.07), (0.55, 1.12), (0.3, 1.17)]
cape_r = profile(CAPE_PROF)
def cape_open(z):   # half-angle of the front opening: wide around the face, closed at the chin clasp, open below
    if z > 1.66:
        k = smooth(1.66, 2.0, z)
        return math.radians(22 + 96 * k)
    return math.radians(24 + 20 * smooth(1.62, 1.4, z) + 14 * smooth(1.2, 0.35, z))
Z0, Z1 = CAPE_PROF[0][0], CAPE_PROF[-1][0]
NU, NV, THK = 72, 60, 0.055
def cape_point(u, v, inner):
    z = Z0 + (Z1 - Z0) * v
    a = cape_open(z)
    th = a + (2 * math.pi - 2 * a) * u
    r = cape_r(z)
    fold = 0.05 * smooth(1.35, 0.4, z) * math.sin((th - math.pi) * 5) + 0.012 * smooth(1.1, 0.4, z) * math.sin((th - math.pi) * 11 + 1.3)
    r = r + fold - (THK if inner else 0)
    return Vector((r * math.sin(th), -r * math.cos(th), z))
cv, cf = [], []
cu = NU + 1
for inner in (False, True):
    base = len(cv)
    for j in range(NV + 1):
        for i in range(cu):
            cv.append(cape_point(i / NU, j / NV, inner))
    for j in range(NV):
        for i in range(NU):
            a, b, c, d = base + j * cu + i, base + j * cu + i + 1, base + (j + 1) * cu + i + 1, base + (j + 1) * cu + i
            cf.append((a, b, c, d) if not inner else (a, d, c, b))
outer_n = len(cf) // 2
ib = (NV + 1) * cu
for j in range(NV):     # front edges
    for i, flip in ((0, True), (NU, False)):
        a, b = j * cu + i, (j + 1) * cu + i
        f = (a, b, b + ib, a + ib)
        cf.append(f[::-1] if flip else f)
for i in range(NU):     # hem and top
    a, b = NV * cu + i, NV * cu + i + 1
    cf.append((a, b, b + ib, a + ib))
    a, b = i, i + 1
    cf.append((b, a, a + ib, b + ib))
cape = new_obj("Cape", cv, cf, M["Hood"], w_cape)
cape.data.materials.append(M["HoodInner"])
for k, p in enumerate(cape.data.polygons):
    if outer_n <= k < 2 * outer_n: p.material_index = 1

# ---------------------------------------------------------------- body under the cape
SW = profile([(1.62, 0.02), (1.58, 0.3), (1.48, 0.47), (1.3, 0.58), (1.05, 0.65), (0.8, 0.66), (0.64, 0.63)])
def sweater_fn(u, v):
    z = 1.62 - (1.62 - 0.64) * v
    th = u * 2 * math.pi
    r = SW(z)
    return Vector((r * math.cos(th), r * 0.8 * math.sin(th), z))
grid(sweater_fn, 40, 26, True, M["Sweater"], "Sweater", w_torso, cap_start=Vector((0, 0, 1.63)), cap_end=Vector((0, 0, 0.64)))
hem = [Vector((0.64 * math.cos(a), 0.51 * math.sin(a), 0.66)) for a in [i / 40 * 2 * math.pi for i in range(41)]]
sweep("SweaterHem", hem, lambda t: (0.07, 0.07), M["SweaterDark"], w_torso, hint=(0, 0, 1), seg=8, per=1, tip=False, start_cap=False)
# heart on the chest (extruded)
def heart2d(t):
    x = 16 * math.sin(t) ** 3
    y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
    return x / 17, y / 17
hv, hf = [], []
HN = 28
for layer, dy in ((0, -0.515), (1, -0.56)):
    for i in range(HN):
        x, y = heart2d(i / HN * 2 * math.pi)
        hv.append(Vector((x * 0.13, dy - 0.02, 1.14 + y * 0.13)))
hf.append(tuple(range(HN - 1, -1, -1))); hf.append(tuple(range(HN, 2 * HN)))
for i in range(HN): hf.append((i, (i + 1) % HN, HN + (i + 1) % HN, HN + i))
new_obj("Heart", hv, hf, M["Heart"], w_torso)

for side, sx in (("L", 1), ("R", -1)):
    _ell("Shoe_" + side, Vector((0.25 * sx, -0.07, 0.11)), (0.2, 0.29, 0.13), M["Shoe"], w_foot(side), 24, 14)
    _ell("Sole_" + side, Vector((0.25 * sx, -0.07, 0.03)), (0.215, 0.305, 0.05), M["Sole"], w_foot(side), 24, 10)

GROUP[0] = "Bottom_pants"
_ell("Hips", Vector((0, 0, 0.6)), (0.5, 0.42, 0.2), M["Pants"], W(hips=1.0), 28, 14)
for side, sx in (("L", 1), ("R", -1)):
    leg = [(0.24 * sx, 0, 0.64), (0.25 * sx, -0.015, 0.4), (0.25 * sx, 0, 0.17)]
    sweep("Leg_" + side, leg, lambda t: (0.19 - 0.035 * t, 0.19 - 0.035 * t), M["Pants"], w_leg(side), hint=(0, -1, 0), seg=14, per=6, tip=False)
    cuff = [Vector((0.25 * sx + 0.165 * math.cos(a), 0.165 * math.sin(a), 0.19)) for a in [i / 24 * 2 * math.pi for i in range(25)]]
    sweep("Cuff_" + side, cuff, lambda t: (0.04, 0.04), M["PantsDark"], w_leg(side), hint=(0, 0, 1), seg=8, per=1, tip=False, start_cap=False)

def bare_legs(sock_top):
    for side, sx in (("L", 1), ("R", -1)):
        sweep("SkinLeg_" + side, [(0.24 * sx, 0, 0.6), (0.25 * sx, -0.01, 0.4), (0.25 * sx, 0, 0.2)], lambda t: (0.13, 0.13), M["Skin"], w_leg(side), hint=(0, -1, 0), seg=12, per=5, tip=False)
        sweep("Sock_" + side, [(0.25 * sx, -0.005, sock_top), (0.25 * sx, 0, 0.16)], lambda t: (0.145, 0.145), M["Sole"], w_leg(side), hint=(0, -1, 0), seg=12, per=3, tip=False)

GROUP[0] = "Bottom_shorts"
_ell("ShortsHips", Vector((0, 0, 0.62)), (0.52, 0.43, 0.2), M["Pants"], W(hips=1.0), 28, 14)
for side, sx in (("L", 1), ("R", -1)):
    sweep("ShortLeg_" + side, [(0.24 * sx, 0, 0.66), (0.25 * sx, -0.01, 0.46)], lambda t: (0.2, 0.2), M["Pants"], w_leg(side), hint=(0, -1, 0), seg=14, per=3, tip=False)
bare_legs(0.32)

GROUP[0] = "Bottom_skirt"
SK = profile([(0.74, 0.5), (0.62, 0.62), (0.48, 0.78), (0.4, 0.84)])
def skirt_fn(u, v):
    z = 0.74 - 0.34 * v; th = u * 2 * math.pi; r = SK(z) * (1 + 0.035 * math.sin(th * 10) * v)
    return Vector((r * math.cos(th), r * 0.82 * math.sin(th), z))
grid(skirt_fn, 48, 10, True, M["Pants"], "Skirt", W(hips=1.0), cap_start=Vector((0, 0, 0.75)), cap_end=Vector((0, 0, 0.44)))
bare_legs(0.34)
GROUP[0] = "Body"

# ---------------------------------------------------------------- arms (out through the cape front)
ARMS = {}
for side, sx in (("L", 1), ("R", -1)):
    sh = Vector((0.56 * sx, -0.2, 1.4)); el = Vector((0.74 * sx, -0.6, 1.2)); wr = Vector((0.8 * sx, -0.9, 1.02))
    ARMS[side] = (sh, el, wr)
    wf = w_arm(side, sh, el, wr)
    sweep("Sleeve_" + side, [sh, (sh + el) / 2 + Vector((0.02 * sx, 0, 0.02)), el, wr], lambda t: (0.155 - 0.03 * t, 0.155 - 0.03 * t), M["Sweater"], wf, hint=(0, 0, 1), seg=14, per=6, tip=False)
    d = (wr - el).normalized()
    ring = []
    for k in range(25):
        a = k / 24 * 2 * math.pi
        s = d.cross(Vector((0, 0, 1))).normalized(); n = d.cross(s).normalized()
        ring.append(wr - d * 0.02 + s * (0.13 * math.cos(a)) + n * (0.13 * math.sin(a)))
    sweep("SleeveCuff_" + side, ring, lambda t: (0.045, 0.045), M["SweaterDark"], wf, hint=tuple(d), seg=8, per=1, tip=False, start_cap=False)
    _ell("Hand_" + side, wr + d * 0.13, (0.145, 0.145, 0.135), M["Skin"], W(**{"hand_" + side: 1.0}), 20, 12)

# ---------------------------------------------------------------- hair (magenta, 3D bangs, side locks, long hair)
def on_head(beta_deg, alpha_deg, off):
    b, a = math.radians(beta_deg), math.radians(alpha_deg)
    d = Vector((math.sin(a) * math.cos(b), -math.cos(a), math.sin(a) * math.sin(b)))
    return head_pt(d, off)
# hair cap: the part of the head visible inside the hood above the eyes
def cap_fn(u, v):
    beta = math.radians(20 + 140 * u)
    a_edge = hood_alpha_edge(beta) + 0.25
    alpha = a_edge - (a_edge - math.radians(26 + 14 * abs(math.sin(beta)))) * v
    d = Vector((math.sin(alpha) * math.cos(beta), -math.cos(alpha), math.sin(alpha) * math.sin(beta)))
    return head_pt(d, 0.02)[0]
grid(cap_fn, 30, 8, False, M["Hair"], "HairCap", HEAD)
# bangs: long pointed locks down to the eyes, one strand between the eyes, slightly messy
BANGS = [(46, 43, 30, 0.2, 0), (58, 45, 20, 0.24, -4), (70, 46, 14, 0.25, 3), (81, 46, 10, 0.2, -2), (90, 46, 4, 0.13, 0),
         (99, 46, 10, 0.2, 2), (110, 46, 14, 0.25, -3), (122, 45, 20, 0.24, 4), (134, 43, 30, 0.2, 0)]
for k, (b, a_root, a_tip, w, bend) in enumerate(BANGS):
    pts = []
    for s_ in range(6):
        t = s_ / 5
        a = a_root + (a_tip - a_root) * t
        bb = b + (b - 90) * 0.12 * t + bend * math.sin(t * math.pi)
        p, n = on_head(bb, a, 0.028 + 0.03 * math.sin(t * math.pi * .9))
        pts.append(p)
    root_n = on_head(b, a_root, 0.03)[1]
    sweep("Bang%d" % k, pts, lambda t, w=w: (w * (1 - t) ** 1.1 + 0.003, 0.03 * (1 - t) + 0.007), M["Hair"], HEAD, hint=tuple(root_n), seg=10, per=6)
# cheek locks: from the temples along the cheeks, past the chin
for side, sx in (("L", 1), ("R", -1)):
    for j, (beta, width, drop) in enumerate(((16, 0.15, 0.75), (28, 0.12, 0.55))):
        bet = beta if sx > 0 else 180 - beta
        pts = []
        for s_ in range(7):
            t = s_ / 6
            p, n = on_head(bet, 50 + 14 * t, 0.045 + 0.02 * j)
            p.z -= drop * t * t
            p.x += sx * (0.04 * t - 0.03 * j * t)
            p.y -= 0.1 * t
            pts.append(p)
        root_n = on_head(bet, 50, 0.05)[1]
        sweep("CheekLock_%s%d" % (side, j), pts, lambda t, w=width: (w * (1 - t) ** 0.9 + 0.006, 0.03), M["Hair"], w_hair(side), hint=tuple(root_n), seg=10, per=6)
# long hair: from inside the hood beside the face, down the front of the body inside the cape, jagged tips at the knees
def sweater_front(z, x):
    """y just in front of the sweater (or the pants below it) at height z and sideways offset x."""
    r = SW(min(1.62, max(0.64, z))) if z > 0.64 else 0.5
    ry = r * 0.8
    k = min(0.99, abs(x) / max(0.2, r))
    return -ry * math.sqrt(1 - k * k) - 0.07
for side, sx in (("L", 1), ("R", -1)):
    # (x at the chest, x at the tips, half width, tip height)
    LOCKS = [(0.34, 0.36, 0.17, 0.5), (0.44, 0.5, 0.15, 0.6), (0.24, 0.22, 0.13, 0.7), (0.5, 0.62, 0.13, 0.8)]
    for k, (x_chest, x_tip, w, z_end) in enumerate(LOCKS):
        ctrl = [Vector((0.74 * sx, -0.42, 2.25)), Vector((0.66 * sx, -0.64, 1.92)), Vector(((x_chest + 0.12) * sx, sweater_front(1.62, x_chest + 0.12) - 0.04, 1.62))]
        for z in (1.35, 1.05, (1.05 + z_end) / 2, z_end):
            f = smooth(1.35, z_end, z)
            x = (x_chest + (x_tip - x_chest) * f) * sx
            ctrl.append(Vector((x, sweater_front(z, x) - 0.018 * k, z)))
        ctrl[-1] = ctrl[-1] + Vector((0.03 * sx * (k % 2 * 2 - 1), -0.015, 0))
        sweep("Hair_%s%d" % (side, k), ctrl, lambda t, w=w: (w * (1 - t ** 2.6) * (0.78 + 0.22 * math.sin(t * math.pi)) + 0.005, 0.024 * (1 - t) + 0.008),
              M["Hair"], w_hair(side), hint=(0.15 * sx, -1, 0), seg=10, per=6)

# ---------------------------------------------------------------- hood variants (ears + a small onesie face on the crown)
def hood_face(nose_mat, nose_r, eye_r=(0.05, 0.03, 0.065), eye_da=0.14, nose_da=0.2):
    nb = math.radians(90)
    _ell("HoodNose", hood_pt(hood_alpha_edge(nb) + nose_da, nb, 1.02), nose_r, nose_mat, HEAD, 20, 12)
    for side, sx in (("L", 1), ("R", -1)):
        b = math.radians(90 - 26 * sx)
        _ell("HoodEye_" + side, hood_pt(hood_alpha_edge(b) + eye_da, b, 1.005), eye_r, M["Dot"], HEAD, 12, 8)

GROUP[0] = "Hood_koala"
for side, sx in (("L", 1), ("R", -1)):
    c = Vector((0.93 * sx, 0.12, 3.0))
    _ell("Ear_" + side, c, (0.32, 0.14, 0.31), M["Hood"], w_ear(side), 28, 16)
    _ell("EarIn_" + side, c + Vector((-0.015 * sx, -0.085, -0.015)), (0.21, 0.06, 0.2), M["EarInner"], w_ear(side), 24, 12)
    for fx, fz in ((-0.14, 0.21), (0.02, 0.27), (0.17, 0.19)):
        _ell("Tuft_%s%d" % (side, int((fx + 1) * 10)), c + Vector((fx * sx, -0.07, fz)), (0.07, 0.06, 0.07), M["EarInner"], w_ear(side), 12, 8)
hood_face(M["Nose"], (0.2, 0.13, 0.15))

GROUP[0] = "Hood_bunny"
for side, sx in (("L", 1), ("R", -1)):
    base = Vector((0.42 * sx, 0.12, 3.2))
    tilt = Vector((0.18 * sx, 0.05, 1)).normalized()
    _ell("BunEar_" + side, base + tilt * 0.55, (0.2, 0.14, 0.62), M["Hood"], w_ear(side), 24, 16)
    _ell("BunIn_" + side, base + tilt * 0.55 + Vector((0, -0.1, 0)), (0.11, 0.05, 0.46), M["EarInner"], w_ear(side), 20, 12)
hood_face(M["Clasp"], (0.075, 0.055, 0.055), nose_da=0.16, eye_da=0.1)

GROUP[0] = "Hood_cat"
for side, sx in (("L", 1), ("R", -1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=4, radius1=0.34, radius2=0.0, depth=0.62)
    me = bpy.data.meshes.new("CatEar_" + side); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("CatEar_" + side, me); col.objects.link(ob)
    ob.location = (0.66 * sx, 0.08, 3.18); ob.rotation_euler = (math.radians(8), math.radians(-18 * sx), math.radians(45))
    ob.scale = (1, 0.55, 1)
    bpy.context.view_layer.update()
    me.transform(ob.matrix_world); ob.matrix_world.identity()
    for p in me.polygons: p.use_smooth = False
    me.materials.append(M["Hood"])
    PARTS.append((ob, w_ear(side), GROUP[0]))
hood_face(M["Clasp"], (0.065, 0.05, 0.05), nose_da=0.16, eye_da=0.1)

GROUP[0] = "Hood_bear"
for side, sx in (("L", 1), ("R", -1)):
    c = Vector((0.8 * sx, 0.12, 3.08))
    _ell("BearEar_" + side, c, (0.28, 0.16, 0.27), M["Hood"], w_ear(side), 20, 12)
    _ell("BearIn_" + side, c + Vector((0, -0.1, -0.02)), (0.17, 0.06, 0.16), M["EarInner"], w_ear(side), 16, 10)
hood_face(M["Nose"], (0.1, 0.07, 0.07), nose_da=0.17)

GROUP[0] = "Hood_frog"
for side, sx in (("L", 1), ("R", -1)):
    c = Vector((0.5 * sx, -0.18, 3.24))
    _ell("FrogBump_" + side, c, (0.32, 0.3, 0.29), M["Hood"], w_ear(side), 20, 14)
    _ell("FrogWhite_" + side, c + Vector((0, -0.2, 0.02)), (0.22, 0.14, 0.21), M["EarInner"], w_ear(side), 18, 12)
    _ell("FrogPupil_" + side, c + Vector((0, -0.33, 0.02)), (0.1, 0.04, 0.12), M["Dot"], w_ear(side), 12, 8)

GROUP[0] = "Hood_duck"
nb = math.radians(90)
_ell("DuckBill", hood_pt(hood_alpha_edge(nb) + 0.17, nb, 1.04), (0.32, 0.2, 0.09), M["Bill"], HEAD, 24, 12)
for side, sx in (("L", 1), ("R", -1)):
    b = math.radians(90 - 28 * sx)
    _ell("DuckEye_" + side, hood_pt(hood_alpha_edge(b) + 0.1, b, 1.005), (0.06, 0.035, 0.07), M["Dot"], HEAD, 12, 8)
tuft = [(0.0, 0.1, 3.3), (-0.06, 0.1, 3.5), (0.05, 0.1, 3.62), (0.14, 0.1, 3.52)]
sweep("DuckTuft", tuft, lambda t: (0.045, 0.045), M["Dot"], HEAD, hint=(0, -1, 0), seg=8, per=5, tip=False)
GROUP[0] = "Body"

# heart clasp at the neck and a little heart patch on the back
_ell("Clasp", Vector((0, -0.55, 1.62)), (0.11, 0.06, 0.1), M["Clasp"], W(chest=1.0), 16, 10)
# (the back patch sits on the cape surface)
hp = []
for i, v in enumerate(hv):
    z = 1.0 + (v.z - 1.14) * 1.3
    r = cape_r(z) + (0.012 if i < HN else 0.05)
    hp.append(Vector(((v.x) * 1.3, r, z)))
hf2 = [tuple(range(HN)), tuple(range(2 * HN - 1, HN - 1, -1))] + [((i + 1) % HN, i, HN + i, HN + (i + 1) % HN) for i in range(HN)]
new_obj("BackHeart", hp, hf2, M["Clasp"], lambda p: {"cape_B1": 1.0})

# ---------------------------------------------------------------- face every part outward
OPEN_PARTS = {"Face", "HairCap"}
for ob, _fn, _g in PARTS:
    me = ob.data
    if not len(me.polygons): continue
    ref = HC if ob.name in OPEN_PARTS else sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    score = 0.0
    for p in me.polygons: score += p.normal.dot(p.center - ref) * p.area
    if score < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(me); bm.free()
        print("flipped", ob.name)

# ---------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new("KidRig")
rig = bpy.data.objects.new("KidRig", arm_data)
col.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
def bone(name, h, t, parent=None):
    b = eb.new(name); b.head = Vector(h); b.tail = Vector(t)
    if parent: b.parent = eb[parent]
    return b
bone("root", (0, 0, 0), (0, 0, 0.25))
bone("hips", (0, 0, 0.55), (0, 0, 0.85), "root")
bone("spine", (0, 0, 0.85), (0, 0, 1.2), "hips")
bone("chest", (0, 0, 1.2), (0, 0, 1.6), "spine")
bone("neck", (0, 0, 1.6), (0, 0, 1.85), "chest")
bone("head", (0, 0, 1.85), (0, 0, 3.1), "neck")
for side, sx in (("L", 1), ("R", -1)):
    bone("ear_" + side, (0.95 * sx, 0.14, 2.7), (1.1 * sx, 0.14, 3.3), "head")
    sh, el, wr = ARMS[side]
    bone("upperarm_" + side, sh, el, "chest")
    bone("forearm_" + side, el, wr, "upperarm_" + side)
    bone("hand_" + side, wr, wr + (wr - el).normalized() * 0.25, "forearm_" + side)
    bone("thigh_" + side, (0.24 * sx, 0, 0.62), (0.25 * sx, -0.015, 0.36), "hips")
    bone("shin_" + side, (0.25 * sx, -0.015, 0.36), (0.25 * sx, 0, 0.16), "thigh_" + side)
    bone("foot_" + side, (0.25 * sx, 0, 0.16), (0.25 * sx, -0.32, 0.07), "shin_" + side)
    bone("hair_%s1" % side, (0.95 * sx, -0.6, 2.0), (1.03 * sx, -0.7, 1.45), "head")
    bone("hair_%s2" % side, (1.03 * sx, -0.7, 1.45), (1.06 * sx, -0.76, 0.95), "hair_%s1" % side)
for name, a in CAPE_CHAINS:
    def P(z, s=0.95):
        r = cape_r(z) * s
        return (r * math.sin(a), -r * math.cos(a), z)
    bone("cape_%s1" % name, P(1.4), P(0.88), "chest")
    bone("cape_%s2" % name, P(0.88), P(0.32), "cape_%s1" % name)
bpy.ops.object.mode_set(mode="OBJECT")
BONES = [b.name for b in arm_data.bones]

# ---------------------------------------------------------------- skin weights (from the per-part functions)
for ob, fn, _g in PARTS:
    groups = {}
    for v in ob.data.vertices:
        w = fn(ob.matrix_world @ v.co)
        w = {k: x for k, x in w.items() if x > 1e-4}
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        s = sum(x for _, x in top) or 1
        for name, x in top:
            if name not in BONES: raise RuntimeError("unknown bone " + name + " in " + ob.name)
            if name not in groups: groups[name] = ob.vertex_groups.new(name=name)
            groups[name].add([v.index], x / s, "REPLACE")
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE"); mod.object = rig

# join parts per group (Body, Face, and one object per wardrobe variant)
by_group = {}
for ob, _fn, g in PARTS:
    by_group.setdefault("Face" if ob.name == "Face" else g, []).append(ob)
for g, obs in by_group.items():
    if len(obs) > 1:
        with bpy.context.temp_override(active_object=obs[0], selected_editable_objects=obs, selected_objects=obs):
            bpy.ops.object.join()
    obs[0].name = g
print("GROUPS", sorted(by_group))

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
kw = dict(filepath=OUT, export_format="GLB", export_yup=True, export_skins=True, export_animations=False, export_materials="EXPORT")
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError:
    kw.pop("export_skins"); kw.pop("export_animations")
    bpy.ops.export_scene.gltf(**kw)
print("EXPORTED", OUT, os.path.getsize(OUT), "bytes;", len(BONES), "bones")

# ---------------------------------------------------------------- optional quick previews (workbench)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    for ob in bpy.data.objects:
        if ob.type == "MESH" and (ob.name.startswith("Hood_") or ob.name.startswith("Bottom_")):
            ob.hide_render = ob.name not in ("Hood_koala", "Bottom_pants")
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.render.resolution_x, sc.render.resolution_y = 700, 800
    sc.render.film_transparent = False
    cam_data = bpy.data.cameras.new("Cam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 4.4
    cam = bpy.data.objects.new("Cam", cam_data); col.objects.link(cam); sc.camera = cam
    for name, ang in (("front", 0), ("three", 40), ("side", 90), ("back", 180)):
        a = math.radians(ang)
        cam.location = Vector((8 * math.sin(a), -8 * math.cos(a), 1.75))
        cam.rotation_euler = (math.radians(90), 0, a)
        sc.render.filepath = os.path.join(PREVIEW, name + ".png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", PREVIEW)
