# Compare the flat front render with the reference by colour class; writes a mismatch map.
# usage: python3 cmp_classes.py <front_flat.png> <out.png>
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

REF = "/Users/gianneangely/Documents/ClawFriends/refs/character/kyoko-base-flow.png"
def classes(path):
    a = np.array(Image.open(path).convert("RGB")).astype(np.float32) / 255
    mx, mn = a.max(-1), a.min(-1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(d > 1e-6, ((np.where(r == mx, (g - b) / np.maximum(d, 1e-6), np.where(g == mx, 2 + (b - r) / np.maximum(d, 1e-6), 4 + (r - g) / np.maximum(d, 1e-6)))) / 6) % 1, 0) * 360
    c = np.zeros(a.shape[:2], np.uint8)                 # 0 other
    c[(mx < 0.3)] = 1                                   # line
    c[((h >= 318) | (h <= 10)) & (s >= 0.33) & (mx >= 0.22)] = 2   # hair
    c[(h >= 212) & (h <= 256) & (s >= 0.2) & (mx >= 0.06) & (mx >= 0.3)] = 3   # navy
    c[(h >= 10) & (h <= 45) & (s >= 0.04) & (s < 0.36) & (mx >= 0.8)] = 4       # skin
    c[(s < 0.14) & (mx >= 0.3) & (mx < 0.66)] = 5      # dark grey (lining)
    c[(s < 0.14) & (mx >= 0.66) & (mx < 0.97)] = 6     # light grey
    return c
cr, cm = classes(REF), classes(sys.argv[1])
ignore = ndimage.binary_dilation((cr == 1) | (cr == 0), iterations=2) | (cm == 1) | (cm == 0)
out = np.array(Image.open(REF).convert("L").convert("RGB")).astype(np.float32) * 0.35 + 150
mis = (cr != cm) & ~ignore
col = {2: (230, 30, 60), 3: (40, 60, 220), 4: (255, 170, 60), 5: (60, 60, 60), 6: (255, 255, 255)}
for k, v in col.items():                                  # colour = what the reference has there
    out[mis & (cr == k)] = v
Image.fromarray(out.astype(np.uint8)).save(sys.argv[2])
names = {2: "hair", 3: "navy", 4: "skin", 5: "lining", 6: "lightgrey"}
print("mismatch px:", int(mis.sum()), {names[k]: int((mis & (cr == k)).sum()) for k in names})
print("render has hair where ref has not:", int((mis & (cm == 2)).sum()), " ref hair missing:", int((mis & (cr == 2)).sum()))
