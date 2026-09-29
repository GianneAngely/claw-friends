# Split the Kyoko reference into parts (by colour class + position) for sketch-based 3D modeling.
# Output: blender/parts/<part>.png masks (white = part, includes half of its outline), parts.json, parts_debug.png
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

REF = "/Users/gianneangely/Documents/ClawFriends/refs/character/kyoko-base-flow.png"
OUT = "/Users/gianneangely/Documents/ClawFriends/blender/parts"
os.makedirs(OUT, exist_ok=True)
rgb = np.array(Image.open(REF).convert("RGB")).astype(np.float32) / 255
H, W, _ = rgb.shape
Y, X = np.mgrid[0:H, 0:W]

def to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    rc, gc, bc = [(mx - c) / np.maximum(d, 1e-6) for c in (r, g, b)]
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    return np.where(d > 1e-6, (h / 6) % 1, 0) * 360, s, mx

h, s, v = to_hsv(rgb)
frame = np.zeros((H, W), bool); frame[:5] = frame[-5:] = True; frame[:, :5] = frame[:, -5:] = True
white = (s < 0.06) & (v > 0.97)
lab, _ = ndimage.label(white | frame)
fg = lab != lab[2, 2]
line = v < 0.3
hair = ((h >= 318) | (h <= 10)) & (s >= 0.33) & (v >= 0.22)
hair &= ~((((X - 288.5) / 48) ** 2 + ((Y - 338.5) / 24) ** 2) <= 1)   # the open mouth is red too
skin = (h >= 10) & (h <= 42) & (s >= 0.05) & (s < 0.36) & (v >= 0.84)
navy = (h >= 212) & (h <= 256) & (s >= 0.2) & (v >= 0.06)
grey = (s < 0.14) & (v >= 0.3) & (v < 0.95) & ~line & fg
near_line = ndimage.binary_dilation(line, iterations=1)

def bucket(seeds, box, ok):
    """paint-bucket fill from seed points over `ok` pixels, bounded by the outlines and a box"""
    x0, y0, x1, y1 = box
    region = ok & ~near_line & (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
    lab, _ = ndimage.label(region)
    ids = {lab[y, x] for x, y in seeds if lab[y, x] > 0}
    return np.isin(lab, list(ids))

# hair strands: classify each hair component by where it sits
def seg_dist(px, py, a, b):
    ax, ay = a; bx, by = b
    t = np.clip(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0, 1)
    return np.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)))
hlab, hn = ndimage.label(hair & ~line)
hcent = ndimage.center_of_mass(hair & ~line, hlab, range(1, hn + 1))
hair_group = np.zeros(hn + 1, object); hair_group[:] = ""
for i, (cy, cx) in enumerate(hcent, start=1):
    if cy < 395: hair_group[i] = "hair_top"
    elif cy > 618 and 248 < cx < 346: hair_group[i] = "hair_back"
    elif cx < 292: hair_group[i] = "hair_left"
    else: hair_group[i] = "hair_right"
BRAID = [(148, 322), (172, 362), (193, 393), (204, 420), (210, 446)]
braid_band = np.zeros((H, W), bool)
for a_, b_ in zip(BRAID, BRAID[1:]): braid_band |= seg_dist(X, Y, a_, b_) < 17
def hair_part(name):
    m = np.isin(hlab, [i for i in range(1, hn + 1) if hair_group[i] == name])
    return (hair & braid_band) if name == "braid" else (m & ~braid_band)

def ell(cx, cy, rx, ry): return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1
def rect(x0, y0, x1, y1): return (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)

# shell opening (from kyoko_ref.json profile): pixels between the inner edges belong to the inside of the cape
ref = json.load(open("/Users/gianneangely/Documents/ClawFriends/blender/kyoko_ref.json"))
inside = np.zeros((H, W), bool)
for p in ref["profile"]:
    if p["iL"] is not None and p["iR"] is not None and p["iR"] > p["iL"]:
        inside[p["y"]:p["y"] + 2, p["iL"]:p["iR"] + 1] = True
inside = ndimage.binary_closing(inside, iterations=3)

parts = {
    "hair_top": hair_part("hair_top"),
    "braid": hair_part("braid"),
    "hair_left": hair_part("hair_left"),
    "hair_right": hair_part("hair_right"),
    "hair_back": hair_part("hair_back"),
    "torso": navy & ~rect(0, 0, 196, 478) & ~rect(398, 0, W, 530),
    "sleeve_r": navy & rect(130, 405, 205, 480),     # character's right = image left (the waving arm)
    "sleeve_l": navy & rect(390, 455, 445, 525),
    "arm_r": skin & rect(115, 380, 175, 450),
    "arm_l": skin & rect(410, 480, 470, 525),
    "glove_r": bucket([(112, 382), (100, 372), (125, 395)], (60, 335, 160, 425), grey | skin),
    "glove_l": bucket([(488, 510), (470, 505), (505, 515)], (450, 470, 535, 545), grey | skin),
    "collar": bucket([(240, 425), (330, 440), (400, 440), (450, 452), (215, 440)], (190, 385, 468, 472), grey) & ~ell(292, 426, 26, 26) & ~((X > 330) & (Y < 396 + (X - 330) * 0.02)),
    "button": ell(292, 426, 24, 23),
    "shorts": bucket([(225, 652), (230, 666), (350, 657), (345, 668)], (186, 626, 405, 682), (s < 0.22) & (v > 0.36)),
    "legs": skin & (Y >= 676),
    "face": skin & rect(160, 180, 410, 400),
    "ear_in_r": (v > 0.88) & (s < 0.08) & ell(118, 118, 48, 48),
    "ear_in_l": (v > 0.88) & (s < 0.08) & ell(466, 110, 48, 48),
    "koala_nose": line & ell(285, 112, 26, 28),
    "koala_eye_r": line & ell(233, 98, 10, 10),
    "koala_eye_l": line & ell(340, 97, 10, 10),
}

def solidify(m, close=2, grow=2, min_area=30):
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= min_area])
    m = ndimage.binary_closing(m, iterations=close)
    m = ndimage.binary_fill_holes(m)
    grown = ndimage.binary_dilation(m, iterations=grow) & (line | m)   # reach into the outline, not past it
    return (m | grown) & fg

info = {}
dbg = (rgb * 0.3 + 0.7).copy()
palette = np.random.RandomState(3).rand(len(parts), 3) * 0.7 + 0.15
for i, (name, m) in enumerate(parts.items()):
    if name in ("koala_nose", "koala_eye_r", "koala_eye_l", "button"):
        mm = ndimage.binary_fill_holes(m) & fg
    else:
        mm = solidify(m, close=1 if name.startswith("hair") or name == "braid" else 3)
    Image.fromarray((mm * 255).astype(np.uint8)).save(f"{OUT}/{name}.png")
    ys, xs = np.nonzero(mm)
    info[name] = {"area": int(mm.sum()), "box": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None}
    dbg[mm] = dbg[mm] * 0.35 + palette[i] * 0.65
json.dump({"W": W, "H": H, "parts": info}, open(f"{OUT}/parts.json", "w"), indent=1)
Image.fromarray((np.clip(dbg, 0, 1) * 255).astype(np.uint8)).save("/Users/gianneangely/Documents/ClawFriends/blender/parts_debug.png")
for k, v_ in info.items(): print(f"{k:12s} {v_}")
