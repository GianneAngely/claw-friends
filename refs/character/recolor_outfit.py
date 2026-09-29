# Kyoko outfit color options: recolor ONLY the top and the shorts of the chosen base image.
# The koala hood-cape, collar, gloves, hair, face and legs keep their exact original pixels.
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

BASE = "kyoko-base-flow.png"
FONT = "/Users/gianneangely/Documents/ClawFriends/game/public/fonts/Fredoka.ttf"
OPTIONS = [  # (label, top color, shorts color)
    ("navy/abu", None, None),
    ("pink/putih", "#F7B6CF", "#F5F4F7"),
    ("lilac/navy", "#C9B6F2", "#34407A"),
    ("mint/krem", "#A6E3C6", "#F2E4C0"),
    ("hitam/denim", "#34303B", "#6F8FC6"),
    ("kuning/coklat", "#E5B43E", "#8C5B3D"),
]

rgb = np.array(Image.open(BASE).convert("RGB")).astype(np.float32) / 255
H, W, _ = rgb.shape
Y, X = np.mgrid[0:H, 0:W]

def to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    rc, gc, bc = [(mx - c) / np.maximum(d, 1e-6) for c in (r, g, b)]
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    h = np.where(d > 1e-6, (h / 6) % 1, 0)
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

# ---- the top: the only navy in the picture (includes the short sleeves and anti-aliased edges)
top = (h >= 212) & (h <= 256) & (s >= 0.22) & (v >= 0.06)
top = ndimage.binary_opening(top, iterations=1) | (top & ndimage.binary_dilation(ndimage.binary_opening(top, iterations=1), iterations=2))
lab, n = ndimage.label(top)
sizes = ndimage.sum(top, lab, range(1, n + 1))
top = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz > 40])

# ---- the shorts: paint-bucket fill from seeds inside each leg, bounded by the black outlines,
# kept inside the shorts' bounding box so it can never leak into the (same grey) cape
grey_ok = (s < 0.22) & (v > 0.36)
box = (X >= 186) & (X <= 405) & (Y >= 626) & (Y <= 682)
lab, _ = ndimage.label(grey_ok & box)
seeds = [(225, 652), (230, 666), (350, 657), (345, 668)]
ids = {lab[y, x] for x, y in seeds if lab[y, x] > 0}
shorts = np.isin(lab, list(ids))
# include the thin anti-aliased rim between the fill and the outline
rim = ndimage.binary_dilation(shorts, iterations=2) & box & (s < 0.25) & ~top
shorts = shorts | rim

def paint(out, mask, ref_hex, tgt_hex):
    rh, rs, rv = hexhsv(ref_hex); th, ts, tv = hexhsv(tgt_hex)
    nv = tv * (v[mask] / rv)
    ns = np.full_like(nv, ts)
    over = nv > 1
    ns[over] = ts * np.clip(1 - (nv[over] - 1) * 2.5, 0, 1)
    out[mask] = hsv_to_rgb(np.full_like(nv, th), ns, np.clip(nv, 0, 1))

variants = []
for label, top_c, shorts_c in OPTIONS:
    out = rgb.copy()
    if top_c: paint(out, top, "#3F4575", top_c)
    if shorts_c: paint(out, shorts, "#C7C6D0", shorts_c)
    variants.append((label, out))
    changed = np.abs(out - rgb).max(-1) > 1e-3
    assert not (changed & ~(top | shorts)).any(), "a pixel outside the top/shorts changed"

# ---- debug view of the masks (red = top, green = shorts)
dbg = (rgb * 0.45 + 0.55).copy()
dbg[top] = [0.95, 0.2, 0.3]; dbg[shorts] = [0.2, 0.8, 0.35]
Image.fromarray((dbg * 255).astype(np.uint8)).save("options/debug-outfit-masks.png")

# ---- option sheet
top_pad, cols, trim = 80, 3, 4          # trim the thin frame left over from the screen capture
cw, ch = W - 2 * trim, H - 2 * trim
sheet = Image.new("RGB", (cols * cw, 2 * ch + top_pad + 60), "white")
d = ImageDraw.Draw(sheet)
d.text((24, 16), "Opsi warna baju & celana (kostum tetap sama)", font=ImageFont.truetype(FONT, 44), fill="#4A3A5E")
for i, (label, out) in enumerate(variants):
    x, y = (i % cols) * cw, top_pad + (i // cols) * ch
    sheet.paste(Image.fromarray((np.clip(out[trim:-trim, trim:-trim], 0, 1) * 255).astype(np.uint8)), (x, y))
    f = ImageFont.truetype(FONT, 40); t = f"W{i + 1}"
    w = d.textlength(t, font=f) + 30
    d.rounded_rectangle((x + 18, y + 10, x + 18 + w, y + 68), radius=29, fill="#FF74B8", outline="#4A3A5E", width=4)
    d.text((x + 33, y + 14), t, font=f, fill="white", stroke_width=3, stroke_fill="#4A3A5E")
d.text((24, 2 * ch + top_pad + 14), "  ·  ".join(f"W{i + 1} {lab}" for i, (lab, _) in enumerate(variants)), font=ImageFont.truetype(FONT, 30), fill="#8A7684")
sheet.save("options/opsi-warna.png")
print("top px", int(top.sum()), "shorts px", int(shorts.sum()), "sheet", sheet.size)
