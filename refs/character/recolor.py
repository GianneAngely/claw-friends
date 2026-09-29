# Recolor the reference chibi (private design reference only): same drawing, new colors.
# hood orange -> koala grey (+ koala face), hair blonde -> magenta, eyes brown -> blue,
# white smock + sleeves -> navy sweater, pink shorts -> light grey, fake checker background -> white.
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC, OUT = "ref-umaru.png", "recolor-koala.png"
rgb = np.array(Image.open(SRC).convert("RGB")).astype(np.float32) / 255
H, W, _ = rgb.shape
Y, X = np.mgrid[0:H, 0:W]

def to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.maximum(d, 1e-6), 0)
    gc = np.where(m, (mx - g) / np.maximum(d, 1e-6), 0)
    bc = np.where(m, (mx - b) / np.maximum(d, 1e-6), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    h = (h / 6) % 1
    return h * 360, s, mx

def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,), np.float32)
    for k, (a, b, c) in enumerate(((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))):
        sel = i == k
        out[sel] = np.stack([a[sel], b[sel], c[sel]], -1)
    return out

def hexhsv(hx):
    c = np.array([int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32).reshape(1, 1, 3)
    h, s, v = to_hsv(c)
    return float(h[0, 0]), float(s[0, 0]), float(v[0, 0])

h, s, v = to_hsv(rgb)

# ---- regions
eyeL = ((X - 170) / 30) ** 2 + ((Y - 160) / 30) ** 2 < 1
eyeR = ((X - 275) / 30) ** 2 + ((Y - 158) / 30) ** 2 < 1
eyes = eyeL | eyeR
blush = (((X - 149) / 26) ** 2 + ((Y - 189) / 15) ** 2 < 1) | (((X - 294) / 26) ** 2 + ((Y - 187) / 15) ** 2 < 1)
light_neutral = (s < 0.12) & (v > 0.84)
lab, n = ndimage.label(light_neutral)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))

dark = v < 0.34
hood = (~eyes) & (~dark) & (s >= 0.40) & (v >= 0.45) & (h >= 5) & (h <= 32)
pinkish = (~dark) & (s >= 0.25) & ((h >= 325) | (h <= 12))
shorts = pinkish & (Y > 395)
hair = (~eyes) & (~blush) & (~dark) & (~hood) & (~pinkish) & (s >= 0.19) & (s < 0.45) & (h >= 14) & (h <= 45) & (v >= 0.55)
iris = eyes & (~dark) & (s >= 0.25) & (h >= 3) & (h <= 40)
neutral_in = (~bg) & (~eyes) & (~dark) & (s < 0.12) & (v > 0.55)
ear_in = neutral_in & (Y < 100)
hands = neutral_in & (((X < 84) & (Y > 195) & (Y < 250)) | ((X > 352) & (Y > 280) & (Y < 320)))
shirt = neutral_in & (Y >= 255) & (Y < 407) & ~hands   # legs below the smock stay skin

# ---- recolor with luminance transfer (keeps the original shading and line anti-aliasing)
out = rgb.copy()
def paint(mask, ref_hex, tgt_hex):
    rh, rs, rv = hexhsv(ref_hex); th, ts, tv = hexhsv(tgt_hex)
    ratio = v[mask] / rv
    nv = tv * ratio
    ns = np.full_like(nv, ts)
    over = nv > 1
    ns[over] = ts * np.clip(1 - (nv[over] - 1) * 2.5, 0, 1)
    nv = np.clip(nv, 0, 1)
    out[mask] = hsv_to_rgb(np.full_like(nv, th), ns, nv)

paint(hood, "#E88868", "#B9B8CB")      # koala grey (dark inner cape becomes a darker grey)
paint(hair, "#F1D0AF", "#E0409C")      # vivid magenta
paint(iris, "#6A3A26", "#2F63C8")      # blue eyes
paint(shirt, "#F4F4F4", "#2B3A6E")     # navy sweater (smock + sleeves)
paint(shorts, "#B45571", "#D9DAE3")    # light grey bottoms
paint(hands, "#F4F4F4", "#F6E6D9")     # skin-tone hands
paint(ear_in, "#F4F1ED", "#ECEAF4")    # pale inner koala ear
out[bg] = 1.0

# ---- hamster mark on the hood -> koala face (nose + two dot eyes)
img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
grey = tuple(int(c * 255) for c in out[40, 200])
box = (Y >= 40) & (Y <= 70) & (X >= 198) & (X <= 234) & ~hood & ~bg
arr = np.array(img)
arr[box] = grey
img = Image.fromarray(arr)
S = 4   # supersampled overlay for smooth edges
ov = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
def ell(cx, cy, rx, ry, fill, outline=None, wdt=0):
    d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=fill, outline=outline, width=wdt * S)
ell(216, 57, 11, 9, (46, 40, 54, 255))
ell(212, 54, 3.2, 2.2, (120, 112, 132, 255))
ell(196, 51, 3, 3.4, (46, 40, 54, 255))
ell(236, 51, 3, 3.4, (46, 40, 54, 255))
ov = ov.resize((W, H), Image.LANCZOS)
img = img.convert("RGBA"); img.alpha_composite(ov); img = img.convert("RGB")
img.save(OUT)
img.resize((W * 2, H * 2), Image.LANCZOS).save(OUT.replace(".png", "@2x.png"))
print("saved", OUT, {k: int(m.sum()) for k, m in dict(hood=hood, hair=hair, iris=iris, shirt=shirt, shorts=shorts, hands=hands, ear_in=ear_in, bg=bg).items()})
