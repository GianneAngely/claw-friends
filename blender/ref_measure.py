# Measure the chosen Kyoko reference (front view) into per-row profiles for the Blender builder.
# Output: blender/kyoko_ref.json (pixel coords of the reference) + blender/ref_debug.png
import json
import numpy as np
from PIL import Image
from scipy import ndimage

REF = "/Users/gianneangely/Documents/ClawFriends/refs/character/kyoko-base-flow.png"
rgb = np.array(Image.open(REF).convert("RGB")).astype(np.float32) / 255
H, W, _ = rgb.shape

def to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    rc, gc, bc = [(mx - c) / np.maximum(d, 1e-6) for c in (r, g, b)]
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    return np.where(d > 1e-6, (h / 6) % 1, 0) * 360, s, mx

h, s, v = to_hsv(rgb)
# trim the capture frame
frame = np.zeros((H, W), bool); frame[:5] = frame[-5:] = True; frame[:, :5] = frame[:, -5:] = True
white = (s < 0.06) & (v > 0.97)
lab, _ = ndimage.label(white | frame)
bg = lab == lab[2, 2]
fg = ~bg

line = v < 0.3
grey_light = (s < 0.1) & (v >= 0.72) & (v < 0.95)
grey_dark = (s < 0.14) & (v >= 0.3) & (v < 0.72)
hair = (((h >= 320) | (h <= 8)) & (s >= 0.35) & (v >= 0.25))
skin = (h >= 12) & (h <= 40) & (s >= 0.06) & (s < 0.35) & (v >= 0.85)
navy = (h >= 212) & (h <= 256) & (s >= 0.22) & (v >= 0.06)

def rows(mask, y0, y1, step=1):
    out = []
    for y in range(y0, y1, step):
        xs = np.nonzero(mask[y])[0]
        out.append([y, int(xs.min()), int(xs.max())] if len(xs) else [y, None, None])
    return out

# silhouette extents per row
sil = rows(fg, 0, H)
top_y = next(r[0] for r in sil if r[1] is not None)
bot_y = max(r[0] for r in sil if r[1] is not None)

# ears: least-squares circle fit to the silhouette edge in each top corner
edge = fg & ~ndimage.binary_erosion(fg)
def fit_circle(sel):
    ys, xs = np.nonzero(sel)
    A = np.c_[2 * xs, 2 * ys, np.ones(len(xs))]
    b = xs ** 2 + ys ** 2
    (cx, cy, c), *_ = np.linalg.lstsq(A, b, rcond=None)
    return {"cx": float(cx), "cy": float(cy), "r": float(np.sqrt(c + cx * cx + cy * cy)), "n": int(len(xs))}
Yg, Xg = np.mgrid[0:H, 0:W]
ears = [fit_circle(edge & (Xg < 205) & (Yg < 175)), fit_circle(edge & (Xg > 385) & (Yg < 170))]

# the cape hem: lowest cape-coloured row per column (legs excluded by colour)
cape_px = (grey_light | grey_dark | line) & fg & ~skin
hem = []
for x in range(0, W, 4):
    ys = np.nonzero(cape_px[:, x])[0]
    if len(ys): hem.append([x, int(ys.max())])

# per-row: outer silhouette and the inner edge of the light-grey shell on each side
prof = []
for y in range(top_y, bot_y + 1, 2):
    xs = np.nonzero(fg[y])[0]
    if not len(xs): continue
    L, R = int(xs.min()), int(xs.max())
    # walk inward from each side over grey/line pixels (the shell) until something else (hair, skin, navy, lining)
    near_line = ndimage.binary_dilation(line[max(0, y - 2):y + 3], iterations=2)[min(y, 2)]
    def inner(start, step):
        # skip the outline, then walk over a solid run of light grey; the first non-grey pixel that is
        # not part of a line (or its anti-aliasing) is the shell's inner edge
        x, run = start, 0
        while 0 <= x < W and abs(x - start) < 320:
            if grey_light[y, x] and not near_line[x]: run += 1
            elif run >= 4 and not near_line[x] and not grey_light[y, x]: return x
            x += step
        return None
    prof.append({"y": y, "L": L, "R": R, "iL": inner(L, 1), "iR": inner(R, -1)})

def biggest(mask):
    lab, n = ndimage.label(mask)
    if not n: return mask
    return lab == (int(np.argmax(ndimage.sum(mask, lab, range(1, n + 1)))) + 1)

def box(mask):
    ys, xs = np.nonzero(mask)
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None

# biggest connected skin blob = the face
lab, n = ndimage.label(skin & (np.arange(H)[:, None] < 420))
sizes = ndimage.sum(skin, lab, range(1, n + 1))
face = lab == (int(np.argmax(sizes)) + 1)
data = {
    "W": W, "H": H, "top_y": top_y, "bot_y": bot_y, "ears": ears, "hem": hem, "profile": prof,
    "face_box": box(face), "hair_box": box(hair), "navy_box": box(biggest(navy)),
    "navy_rows": rows(biggest(navy), 400, 660, 4), "hair_rows": rows(hair, 140, 740, 4),
    "skin_rows_low": rows(skin & (np.arange(H)[:, None] > 660), 660, H, 4),
}
json.dump(data, open("/Users/gianneangely/Documents/ClawFriends/blender/kyoko_ref.json", "w"))

dbg = rgb * 0.35 + 0.65
dbg[grey_light & fg] = [0.75, 0.75, 0.8]; dbg[grey_dark & fg] = [0.45, 0.45, 0.5]
dbg[hair] = [0.85, 0.2, 0.45]; dbg[skin] = [1, 0.85, 0.7]; dbg[navy] = [0.2, 0.25, 0.6]; dbg[line & fg] = [0, 0, 0]
img = (np.clip(dbg, 0, 1) * 255).astype(np.uint8)
for p in prof:
    for k in ("iL", "iR"):
        if p[k] is not None: img[p["y"], max(0, p[k] - 1):p[k] + 2] = [0, 255, 0]
    img[p["y"], p["L"]] = img[p["y"], p["R"]] = [255, 0, 0]
Image.fromarray(img).save("/Users/gianneangely/Documents/ClawFriends/blender/ref_debug.png")
print("top", top_y, "bot", bot_y, "ears", [(round(e["cx"]), round(e["cy"]), round(e["r"]), e["n"]) for e in ears])
print("face", data["face_box"], "hair", data["hair_box"], "navy", data["navy_box"])
