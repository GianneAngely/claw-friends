# Kyoko's expressions for the game, drawn over her reference face texture (kyoko_face.png from gen_geometry.py):
# the drawn eyes / mouth are erased (transparent = the head's skin shows) and redrawn in the same ink style.
# Output: game/assets/kyoko_face_<expr>.png  (idle = the reference face itself)
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

B = "/Users/gianneangely/Documents/ClawFriends/blender"
OUT = "/Users/gianneangely/Documents/ClawFriends/game/assets"
REF = "/Users/gianneangely/Documents/ClawFriends/refs/character/kyoko-base-flow.png"
X0, Y0, SC = 150, 170, 3          # FACE_BOX origin in the reference, texture scale
INK, MOUTH, TONGUE = (22, 14, 18, 255), (150, 52, 62, 255), (235, 163, 158, 255)

base = Image.open(f"{B}/kyoko_face.png").convert("RGBA")
W, H = base.size
rgb = np.array(Image.open(REF).convert("RGB")).astype(np.float32) / 255
v = rgb.max(-1); s = np.where(v > 0, (v - rgb.min(-1)) / np.maximum(v, 1e-6), 0)
Yr, Xr = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
def box(x0, y0, x1, y1): return (Xr >= x0) & (Xr <= x1) & (Yr >= y0) & (Yr <= y1)
dark = v < 0.35
lab, _ = ndimage.label(dark & box(150, 170, 420, 410))
def comp_at(x, y): return lab == lab[y, x]
EYE_L, EYE_R = comp_at(212, 278), comp_at(356, 274)          # image-left / image-right eye (lids + iris)
MOUTH_C = comp_at(288, 336)
white = (s < 0.12) & (v > 0.85)
def eye_erase(c):
    ys, xs = np.nonzero(c)
    near = box(xs.min() - 4, ys.min() - 3, xs.max() + 4, ys.max() + 4)
    return ndimage.binary_dilation(c | (white & near & ndimage.binary_dilation(c, iterations=6)), iterations=2)
ERASE = {"eyes": eye_erase(EYE_L) | eye_erase(EYE_R),
         "mouth": ((Xr - 288.5) / 47) ** 2 + ((Yr - 338.5) / 22) ** 2 <= 1}        # the whole grin (outline, tongue, fang)

def erased(parts):
    a = np.array(base).copy()
    m = np.zeros(rgb.shape[:2], bool)
    for p in parts: m |= ERASE[p]
    m = m[Y0:Y0 + H // SC, X0:X0 + W // SC]
    big = np.array(Image.fromarray(m.astype(np.uint8) * 255).resize((W, H), Image.NEAREST)) > 127
    a[big, 3] = 0
    return Image.fromarray(a)

SS = 4   # supersampled ink layer
def ink_layer(draw_fn):
    lay = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    k = SC * SS
    P = lambda x, y: ((x - X0) * k, (y - Y0) * k)
    def curve(p0, p1, p2, w, col=INK, n=24):
        pts = [P(*((1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array(p1) + t * t * np.array(p2))) for t in np.linspace(0, 1, n)]
        d.line(pts, fill=col, width=int(w * k), joint="curve")
        for q in (pts[0], pts[-1]):
            r = w * k / 2; d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=col)
    def ell(cx, cy, rx, ry, fill, outline=None, w=0):
        a, b = P(cx - rx, cy - ry), P(cx + rx, cy + ry)
        d.ellipse((a[0], a[1], b[0], b[1]), fill=fill, outline=outline, width=int(w * k))
    draw_fn(curve, ell, d, P, k)
    return lay.resize((W, H), Image.LANCZOS)

def blink(curve, ell, d, P, k):
    curve((181, 279), (212, 291), (245, 280), 4.5)
    curve((322, 276), (356, 289), (392, 276), 4.5)
def happy(curve, ell, d, P, k):
    curve((183, 288), (212, 262), (243, 288), 5)
    curve((324, 285), (356, 259), (390, 285), 5)
def sad(curve, ell, d, P, k):
    curve((188, 265), (232, 276), (234, 277), 5); curve((234, 277), (232, 278), (188, 291), 5)
    curve((386, 262), (342, 274), (340, 275), 5); curve((340, 275), (342, 276), (386, 288), 5)
    pts = [(262 + i * 8.7, 340 + (4 if i % 2 else -2)) for i in range(7)]
    d.line([P(*q) for q in pts], fill=INK, width=int(3.5 * k), joint="curve")
    for cx in (200, 370):                                            # tears
        ell(cx, 300, 5, 8, (150, 205, 255, 235))
def wow(curve, ell, d, P, k):
    for cx, cy in ((212, 277), (356, 274)):
        ell(cx, cy, 15, 18, INK)
        ell(cx - 5, cy - 7, 5, 5.5, (255, 255, 255, 255))
        ell(cx + 6, cy + 7, 2.2, 2.2, (255, 255, 255, 255))
    ell(288, 341, 10, 12, MOUTH, INK, 3.2)
    ell(288, 347, 6, 4, TONGUE)

VARIANTS = {"blink": (["eyes"], blink), "happy": (["eyes"], happy), "sad": (["eyes", "mouth"], sad), "wow": (["eyes", "mouth"], wow)}
base.save(f"{OUT}/kyoko_face_idle.png")
sheet = Image.new("RGBA", (W * 5, H), (248, 229, 214, 255))
sheet.alpha_composite(base, (0, 0))
for i, (name, (parts, fn)) in enumerate(VARIANTS.items(), start=1):
    img = erased(parts); img.alpha_composite(ink_layer(fn))
    img.save(f"{OUT}/kyoko_face_{name}.png")
    sheet.alpha_composite(img, (W * i, 0))
sheet.convert("RGB").resize((W * 5 // 3, H // 3), Image.LANCZOS).save(f"{B}/face_expr_sheet.png")
print("faces", W, H)
