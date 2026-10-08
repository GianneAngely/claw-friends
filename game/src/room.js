// The arcade: a storefront with automatic doors, 4 rows of claw machines along 2 carpeted aisles, a cashier,
// a big-plush swap booth, a cart corral, the collection shelf. Inner walls are single-sided so the camera can
// look in from outside; the front (facade + door) hides when it would block the view of the kid inside.
import * as THREE from "three";
import { C, INKS, toon, flat, mesh, blob, rbox, tube, canvasTex, label, plane, bake, sparkle } from "./gfx.js";
import { makePlush, PLUSH } from "./plush.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const G_WORLD = (0x0001 << 16) | 0x0002;
export const ROOM = { x0: -22, x1: 22, z0: -21, z1: 19 };
const ROW_Z = [5.6, -.8, -7.2, -13.6];
const ROWS = [
  { species: "duck", x: -18.6, yaw: Math.PI / 2 },
  { species: "shiba", x: -2.7, yaw: -Math.PI / 2 },
  { species: "seal", x: 2.7, yaw: Math.PI / 2 },
  { species: "alpaca", x: 18.6, yaw: -Math.PI / 2 },
];
export const PLACES = [];
for (const r of ROWS) for (const z of ROW_Z) PLACES.push({ species: r.species, x: r.x, z, yaw: r.yaw });
export const AISLES = [-10.65, 10.65];
export const DOOR = { x: 3.4, h: 6.6 };
export const CASHIER = new THREE.Vector3(-15.6, 0, 13.4);
export const SWAP = new THREE.Vector3(15.6, 0, 13.4);
export const CORRAL = new THREE.Vector3(-6.6, 0, 17.3);
export const SHELF = new THREE.Vector3(0, 0, -20.1);
export const START = new THREE.Vector3(0, 0, 25.5);
export const OUTSIDE = { x: 12, z1: 28.5 };

const floorTex = canvasTex(64, 64, g => {
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#FFC4E1"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
}, [(ROOM.x1 - ROOM.x0) / 3, (ROOM.z1 - ROOM.z0) / 3]);
// arcade carpet: lavender with confetti
const carpetTex = canvasTex(256, 256, g => {
  g.fillStyle = "#D2BCFF"; g.fillRect(0, 0, 256, 256);
  const cols = ["#FF74B8", "#5FE3B5", "#FFD23D", "#6FCBFF", "#FFFFFF"];
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const x = r() * 256, y = r() * 256, c = cols[i % cols.length], k = i % 3;
    g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 5; g.lineCap = "round";
    if (k === 0) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
    else if (k === 1) { g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x, y - 9, x + 8, y); g.stroke(); }
    else { g.save(); g.translate(x, y); g.rotate(r() * 3); g.fillRect(-6, -2.5, 12, 5); g.restore(); }
  }
}, [2, 7]);
const wallTex = canvasTex(128, 128, g => {
  g.fillStyle = "#FFE3F3"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#FFFFFF";
  for (const [x, y] of [[32, 32], [96, 96]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
});
const wainTex = canvasTex(128, 64, g => {
  g.fillStyle = "#A6F0D2"; g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#7EEBC6"; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 16, 64);
});
const stripeTex = canvasTex(128, 64, g => {
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#FFFFFF" : "#F48FB8"; g.fillRect(i * 32, 0, 32, 64); }
}, [3, 1]);

// anime sky panorama for the windows: cyan sky, outlined clouds with lavender shade, pastel buildings, dotted trees
function skyPanorama() {
  return canvasTex(2048, 768, (g, W, H) => {
    let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#4CC6FF"); sky.addColorStop(.55, "#9EE6FF"); sky.addColorStop(1, "#DDF8FF");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const dotsIn = (x, y, w, h, col, step = 14, rad = 3) => {
      g.fillStyle = col;
      for (let yy = y; yy < y + h; yy += step) for (let xx = x + ((yy / step) % 2) * step / 2; xx < x + w; xx += step) { g.beginPath(); g.arc(xx, yy, rad, 0, Math.PI * 2); g.fill(); }
    };
    const cloud = (cx, cy, sc) => {
      const c = document.createElement("canvas"); c.width = 520 * sc; c.height = 260 * sc;
      const k = c.getContext("2d"), blobs = [];
      for (let i = 0; i < 7; i++) blobs.push([(80 + i * 60 + r() * 20) * sc, (150 - Math.sin(i / 6 * Math.PI) * 60 + r() * 14) * sc, (48 + Math.sin(i / 6 * Math.PI) * 38 + r() * 10) * sc]);
      k.lineWidth = 9 * sc; k.strokeStyle = "#8C9BEA";
      for (const [x, y, rr] of blobs) { k.beginPath(); k.arc(x, y, rr, 0, Math.PI * 2); k.stroke(); }
      k.fillStyle = "#FFFFFF";
      for (const [x, y, rr] of blobs) { k.beginPath(); k.arc(x, y, rr, 0, Math.PI * 2); k.fill(); }
      k.fillRect(70 * sc, 150 * sc, 400 * sc, 56 * sc);
      k.globalCompositeOperation = "source-atop";
      k.fillStyle = "#DCD4FF"; k.fillRect(0, 168 * sc, c.width, c.height);
      k.fillStyle = "#EEEAFF";
      for (let yy = 150 * sc; yy < 175 * sc; yy += 12 * sc) for (let xx = 0; xx < c.width; xx += 12 * sc) { k.beginPath(); k.arc(xx + (yy / 12) % 2 * 6 * sc, yy, 2.4 * sc, 0, Math.PI * 2); k.fill(); }
      g.drawImage(c, cx - c.width / 2, cy - c.height / 2);
    };
    for (let i = 0; i < 7; i++) cloud(120 + i * 300 + r() * 80, 110 + r() * 120, .8 + r() * .5);
    // pastel buildings along the horizon
    const base = H * .72;
    for (let i = 0; i < 9; i++) {
      const bw = 170 + r() * 90, bh = 120 + r() * 110, bx = i * 235 + r() * 40 - 40, by = base - bh;
      g.fillStyle = i % 2 ? "#F6F0FF" : "#FFF4FA"; g.strokeStyle = "#8E78D8"; g.lineWidth = 5;
      g.fillRect(bx, by, bw, bh); g.strokeRect(bx, by, bw, bh);
      g.fillStyle = i % 3 ? "#FF9FCB" : "#B9A0FF";
      g.beginPath(); g.moveTo(bx - 12, by); g.lineTo(bx + bw / 2, by - 46); g.lineTo(bx + bw + 12, by); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#9FDDFF";
      for (let wy = by + 18; wy < base - 30; wy += 34) for (let wx = bx + 16; wx < bx + bw - 24; wx += 30) { g.fillRect(wx, wy, 16, 20); g.strokeRect(wx, wy, 16, 20); }
    }
    // trees with halftone dots
    for (let i = 0; i < 11; i++) {
      const tx = i * 200 + r() * 60, ty = base + 10 - r() * 40, tr = 70 + r() * 40;
      g.fillStyle = "#C98A9A"; g.fillRect(tx - 9, ty, 18, 90);
      g.fillStyle = "#4FD9BE"; g.strokeStyle = "#2B9C8E"; g.lineWidth = 6;
      g.beginPath(); g.arc(tx, ty - tr * .5, tr, 0, Math.PI * 2); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.arc(tx, ty - tr * .5, tr - 4, 0, Math.PI * 2); g.clip();
      dotsIn(tx - tr, ty - tr * 1.5, tr * 2, tr * 2, "#8FF2DA", 18, 4.5);
      g.fillStyle = "rgba(43,156,142,.35)"; g.beginPath(); g.arc(tx + tr * .35, ty - tr * .1, tr * .9, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // lime hedge and grass with pink flowers
    g.fillStyle = "#9BE56A"; g.fillRect(0, base + 40, W, H - base - 40);
    g.strokeStyle = "#5DB84A"; g.lineWidth = 6; g.beginPath(); g.moveTo(0, base + 40); g.lineTo(W, base + 40); g.stroke();
    dotsIn(0, base + 60, W, H - base - 60, "#C4F58F", 20, 4);
    for (let i = 0; i < 40; i++) {
      const fx = r() * W, fy = base + 70 + r() * (H - base - 90);
      g.fillStyle = "#FF8FC4"; for (let k2 = 0; k2 < 5; k2++) { const a = k2 / 5 * Math.PI * 2; g.beginPath(); g.arc(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7, 6, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = "#FFE45A"; g.beginPath(); g.arc(fx, fy, 4.5, 0, Math.PI * 2); g.fill();
    }
  });
}
const SKY = skyPanorama(), PANES = [];
// the time of day through the windows: the sky painting tinted (white = day)
export function setSkyTint(hex) { for (const m of PANES) m.color.set(hex); }
function windowPane(w, h, u0, u1, x, y, z, ry) {
  const grp = new THREE.Group();
  const t = SKY.clone(); t.needsUpdate = true; t.offset.x = u0; t.repeat.x = u1 - u0;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
  PANES.push(pane.material);
  pane.userData.noBake = true; grp.add(pane);
  const fw = .32;
  grp.add(rbox(w + fw, fw, .3, .1, C.white, 0, h / 2, .1), rbox(w + fw, fw, .3, .1, C.white, 0, -h / 2, .1));
  grp.add(rbox(fw, h, .3, .1, C.white, -w / 2, 0, .1), rbox(fw, h, .3, .1, C.white, w / 2, 0, .1));
  grp.add(rbox(.16, h, .18, .06, C.white, 0, 0, .08), rbox(w, .16, .18, .06, C.white, 0, h * .12, .08));
  grp.add(rbox(w + .9, .28, .7, .1, C.pink3, 0, -h / 2 - .2, .3));
  grp.position.set(x, y, z); grp.rotation.y = ry;
  return grp;
}

// inward-facing wall panel (invisible from outside)
function wallPlane(w, h, tex, rx, ry, x, y, z, ry2) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(C.white, { map: t }));
  m.position.set(x, y, z); m.rotation.y = ry2; m.receiveShadow = true;
  m.userData.noBake = true;
  return m;
}
// a balloon bunch tied to a prop: the strings run from one knot up to the balloons floating around (cx, cz)
function balloons([tx, ty, tz], [cx, cz], cols) {
  const g = new THREE.Group();
  cols.forEach((c, i) => {
    const a = i / cols.length * Math.PI * 2, bx = cx + Math.cos(a) * .55, bz = cz + Math.sin(a) * .55, by = 5.2 + (i % 2) * .6;
    g.add(blob(c, .55, .66, .55, bx, by, bz));
    g.add(tube([[tx, ty, tz], [(tx + bx) / 2, (ty + by) / 2 - .2, (tz + bz) / 2], [bx, by - .66, bz]], .025, flat(C.ink), false));
  });
  g.add(blob(C.ink, .07, .07, .07, tx, ty, tz));
  return g;
}
function plant(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(rbox(1.1, 1.0, 1.1, .25, C.coral, 0, .5, 0));
  g.add(blob(C.green, .8, .7, .8, 0, 1.55, 0), blob(0x8FD08A, .5, .45, .5, .45, 1.95, .2), blob(0x8FD08A, .45, .4, .45, -.4, 2.0, -.2));
  g.position.set(x, 0, z); g.scale.setScalar(s);
  return g;
}
// a lamp hanging from a ceiling beam by its cord
function lamp(x, z, c) {
  const g = new THREE.Group();
  g.add(tube([[0, 13.2, 0], [0, 12.2, 0]], .03, flat(C.ink), false));
  const shade = mesh(new THREE.SphereGeometry(.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(c));
  shade.position.y = 11.6; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.32, 16, 10), flat(0xFFF6D8)); bulb.position.y = 11.55; g.add(bulb);
  g.position.set(x, 0, z);
  return g;
}
const flagGeo = (() => {
  const tri = new THREE.Shape(); tri.moveTo(-.34, 0); tri.lineTo(.34, 0); tri.lineTo(0, -.72); tri.closePath();
  return new THREE.ExtrudeGeometry(tri, { depth: .04, bevelEnabled: true, bevelThickness: .02, bevelSize: .03, bevelSegments: 2 });
})();
// a garland draped under a ceiling beam: it droops between the pins that hold it to the beam
function garland(x0, x1, y, z, spans) {
  const g = new THREE.Group(), cols = [C.pink5, C.mint, C.yellow, C.blue, C.lav2], per = 5;
  const w = (x1 - x0) / spans;
  let k = 0;
  for (let i = 0; i < spans; i++) {
    const pts = [];
    for (let j = 0; j <= per * 2; j++) { const t = j / (per * 2); pts.push([x0 + w * (i + t), y - Math.sin(t * Math.PI) * .75, z]); }
    g.add(tube(pts, .035, flat(C.ink), false));
    for (let j = 1; j < per * 2; j += 2) g.add(mesh(flagGeo, toon(cols[k++ % cols.length]), pts[j][0], pts[j][1], z));
    g.add(blob(C.pink5, .09, .09, .09, x0 + w * i, y, z));
  }
  g.add(blob(C.pink5, .09, .09, .09, x1, y, z));
  return g;
}
const sidewalkTex = canvasTex(128, 128, g => {
  g.fillStyle = "#EDE6F7"; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#D2C6EA"; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
  g.fillStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
}, [22, 5]);
const grassTex = canvasTex(128, 128, g => {
  g.fillStyle = "#A9E98A"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#C8F5A6"; for (let y = 8; y < 128; y += 22) for (let x = (y / 22 % 2) * 11 + 6; x < 128; x += 22) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
}, [40, 40]);
const facadeTex = canvasTex(128, 128, g => {
  g.fillStyle = "#FFF4EA"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#FFE2EF"; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 16, 128);
});
function tree(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(.28, .36, 2.4, 12), toon(0xC98A9A), 0, 1.2, 0));
  g.add(blob(0x5FD9B8, 1.6, 1.4, 1.6, 0, 3.4, 0), blob(0x7AE6C8, 1.1, 1.0, 1.1, .8, 3.9, .3), blob(0x7AE6C8, 1.0, .9, 1.0, -.7, 4.0, -.2));
  g.position.set(x, 0, z); g.scale.setScalar(s);
  return g;
}
function lampPost(x, z) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(.12, .16, 4.6, 12), toon(C.lav2), 0, 2.3, 0));
  g.add(blob(0xFFF6D8, .42, .42, .42, 0, 4.9, 0), rbox(.9, .14, .9, .06, C.lav2, 0, 4.55, 0));
  g.position.set(x, 0, z);
  return g;
}
function bench(x, z, ry) {
  const g = new THREE.Group();
  g.add(rbox(2.6, .18, .8, .06, C.pink3, 0, .8, 0), rbox(2.6, .7, .14, .06, C.pink3, 0, 1.3, -.36));
  for (const s of [-1, 1]) g.add(rbox(.16, .8, .7, .05, C.lav2, s * 1.1, .4, 0));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}
// a counter with an NPC spot behind it (built facing +x)
function counter(color, text, w = 5.4) {
  const g = new THREE.Group();
  g.add(rbox(2, 1.35, w, .2, color, 0, .68, 0), rbox(2.4, .18, w + .3, .08, C.white, 0, 1.44, 0));
  g.add(rbox(.1, .5, w - .8, .05, C.white, 1.02, .62, 0));
  g.add(plane(label(text, 900, 170, 120), 3.6, .68, 1.08, .64, 0, Math.PI / 2));
  for (const z of [-w / 2 + .15, w / 2 - .15]) g.add(rbox(.2, 4.6, .2, .08, C.white, -.8, 3.7, z));
  g.add(rbox(.35, 1.1, w + .4, .15, color, -.8, 6.3, 0));
  g.add(plane(label(text, 900, 170, 120), 4.2, .8, -.6, 6.3, 0, Math.PI / 2));
  return g;
}
// a wire shopping trolley: a tapered wire basket (deeper at the back) on a low frame with a tray and four casters,
// a push handle with a pink grip at the back (-z). `basket` is where prizes sit: its origin is the basket floor centre.
function cartModel(scale = 1) {
  const g = new THREE.Group(), UP = new THREE.Vector3(0, 1, 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rod = (list, r) => (a, b) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const geo = new THREE.CylinderGeometry(r, r, d.length(), r > .03 ? 8 : 5);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    geo.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    list.push(geo);
  };
  const thin = [], thick = [], wire = rod(thin, .022), bar = rod(thick, .045);
  // basket: back is wider and taller, the floor rises toward the front
  const BK = { z: -.78, x: .58, y0: .98, y1: 1.86 }, FR = { z: .8, x: .47, y0: 1.16, y1: 1.8 };
  const at = (t, side, v) => [side * lerp(BK.x, FR.x, t), lerp(lerp(BK.y0, FR.y0, t), lerp(BK.y1, FR.y1, t), v), lerp(BK.z, FR.z, t)];
  for (const s of [-1, 1]) {
    for (let i = 1; i < 12; i++) wire(at(i / 12, s, 0), at(i / 12, s, 1));
    for (const v of [.35, .7]) wire(at(0, s, v), at(1, s, v));
  }
  for (let i = 1; i < 7; i++) { const x = lerp(-FR.x, FR.x, i / 7); wire([x, FR.y0, FR.z], [x, FR.y1, FR.z]); }
  for (const v of [.35, .7]) { const y = lerp(FR.y0, FR.y1, v); wire([-FR.x, y, FR.z], [FR.x, y, FR.z]); }
  for (let i = 1; i < 8; i++) { const u = i / 8 * 2 - 1; wire([u * BK.x, BK.y0, BK.z], [u * FR.x, FR.y0, FR.z]); }
  for (const t of [.33, .66]) { const p = at(t, 1, 0); wire([-p[0], p[1], p[2]], p); }
  for (let i = 1; i < 8; i++) { const x = lerp(-BK.x, BK.x, i / 8); wire([x, BK.y0, BK.z], [x, BK.y1, BK.z]); }   // fold-up child seat gate
  for (let i = 0; i <= 5; i++) { const x = lerp(-.34, .34, i / 5); wire([x, .36, -.5], [x, .36, .58]); }          // lower tray
  // rims and frame
  const corner = (t, s, v) => at(t, s, v);
  for (const v of [0, 1]) {
    bar(corner(0, -1, v), corner(1, -1, v)); bar(corner(0, 1, v), corner(1, 1, v));
    bar(corner(1, -1, v), corner(1, 1, v)); bar(corner(0, -1, v), corner(0, 1, v));
  }
  for (const t of [0, 1]) for (const s of [-1, 1]) bar(corner(t, s, 0), corner(t, s, 1));
  const base = { bz: -.62, fz: .7, bx: .42, fx: .36, y: .32 };
  for (const s of [-1, 1]) {
    bar([s * base.bx, base.y, base.bz], [s * base.fx, base.y, base.fz]);                   // base rails
    bar([s * base.bx, base.y, base.bz], [s * BK.x, BK.y0, BK.z]);                           // back legs up to the basket
    bar([s * BK.x, BK.y1, BK.z], [s * .6, 2.02, -.93]);                                     // handle arms
    bar([s * base.fx, base.y, base.fz - .1], [s * FR.x * .92, FR.y0, FR.z - .12]);         // front struts
  }
  bar([-base.bx, base.y, base.bz], [base.bx, base.y, base.bz]); bar([-base.fx, base.y, base.fz], [base.fx, base.y, base.fz]);
  const wireMesh = new THREE.Mesh(mergeGeometries(thin), toon(0xE4DEF2)); wireMesh.castShadow = true; g.add(wireMesh);
  g.add(mesh(mergeGeometries(thick), toon(0xCBC1E6)));
  // pink grip, corner caps, the little seat plate
  const grip = mesh(new THREE.CylinderGeometry(.075, .075, 1.26, 14), toon(C.pink5), 0, 2.02, -.93); grip.rotation.z = Math.PI / 2; g.add(grip);
  for (const s of [-1, 1]) g.add(rbox(.13, .1, .13, .04, C.pink5, s * FR.x, FR.y1, FR.z));
  g.add(rbox(.62, .07, .2, .03, C.pink5, 0, 1.5, BK.z - .02));
  // casters
  for (const [x, z] of [[-base.bx, base.bz], [base.bx, base.bz], [-base.fx, base.fz], [base.fx, base.fz]]) {
    g.add(rbox(.06, .14, .1, .02, 0xCBC1E6, x, .24, z));
    const wh = mesh(new THREE.CylinderGeometry(.12, .12, .08, 16), toon(0x4A3A5E), x, .13, z); wh.rotation.z = Math.PI / 2; g.add(wh);
  }
  const basket = new THREE.Group(); basket.position.set(0, (BK.y0 + FR.y0) / 2, 0); g.add(basket);
  g.scale.setScalar(scale);
  return { root: g, basket };
}
export { cartModel };



export function buildRoom(scene, R, world) {
  const st = new THREE.Group();
  const W = ROOM.x1 - ROOM.x0, Dz = ROOM.z1 - ROOM.z0, cz = (ROOM.z0 + ROOM.z1) / 2, H = 14, D = DOOR.x;
  // ground outside (so the building sits in a little street, not in the void), sidewalk in front
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), toon(C.white, { map: grassTex }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(0, -.46, 0); grass.receiveShadow = true; scene.add(grass);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, 10), toon(C.white, { map: sidewalkTex }));
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, -.005, ROOM.z1 + 5); walk.receiveShadow = true; scene.add(walk);
  st.add(rbox(W + 2.4, .45, 10.4, .1, 0xD9CCEF, 0, -.235, ROOM.z1 + 5));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Dz), toon(C.white, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, cz); floor.receiveShadow = true; scene.add(floor);
  for (const x of AISLES) {
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 27), toon(C.white, { map: carpetTex }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(x, .006, -4.2); carpet.receiveShadow = true; scene.add(carpet);
    st.add(rbox(7.9, .06, .3, .03, C.lav2, x, .03, 9.35), rbox(7.9, .06, .3, .03, C.lav2, x, .03, -17.75));
  }
  // welcome mat inside the door
  st.add(rbox(6.4, .05, 3.2, .1, C.pink3, 0, .03, ROOM.z1 - 2));
  st.add(rbox(W + .6, .4, Dz + .6, .15, C.lav, 0, -.21, cz));

  // inner walls: wallpaper above a striped wainscot (back, sides, and the front around the door)
  const walls = new THREE.Group();
  walls.add(wallPlane(W, H - 2.4, wallTex, 18, 4.6, 0, 2.4 + (H - 2.4) / 2, ROOM.z0, 0));
  walls.add(wallPlane(W, 2.4, wainTex, 16, 1, 0, 1.2, ROOM.z0 + .01, 0));
  for (const s of [-1, 1]) {
    walls.add(wallPlane(Dz, H - 2.4, wallTex, 16, 4.6, s * ROOM.x1, 2.4 + (H - 2.4) / 2, cz, -s * Math.PI / 2));
    walls.add(wallPlane(Dz, 2.4, wainTex, 14, 1, s * (ROOM.x1 - .01), 1.2, cz, -s * Math.PI / 2));
    const fw = ROOM.x1 - D, fx = s * (D + fw / 2);
    walls.add(wallPlane(fw, H - 2.4, wallTex, fw / 2.4, 4.6, fx, 2.4 + (H - 2.4) / 2, ROOM.z1, Math.PI));
    walls.add(wallPlane(fw, 2.4, wainTex, fw / 2.6, 1, fx, 1.2, ROOM.z1 - .01, Math.PI));
  }
  walls.add(wallPlane(D * 2, H - DOOR.h, wallTex, 2.8, (H - DOOR.h) / 2.5, 0, DOOR.h + (H - DOOR.h) / 2, ROOM.z1, Math.PI));
  scene.add(walls);
  for (const sx of [-1, 1]) st.add(windowPane(9, 5.4, sx < 0 ? .02 : .5, sx < 0 ? .46 : .94, sx * 12.8, 6.9, ROOM.z0 + .05, 0));
  for (const sx of [-1, 1]) for (const z of [8, -2.4, -12.8]) {
    const u = (z + 21) / 40 * .8;
    st.add(windowPane(7.6, 2.8, u, u + .2, sx * (ROOM.x1 - .05), 11.3, z, -sx * Math.PI / 2));
  }
  scene.add(plane(label("CLAW FRIENDS ARCADE", 1800, 220, 160, "#F48FB8"), 15, 1.83, 0, 11.6, ROOM.z0 + .06));

  // ceiling (seen from below only), ceiling beams resting on the walls; garlands and lamps hang from them
  const ceilTex = canvasTex(128, 128, g => {
    g.fillStyle = "#FFF8FC"; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#FBE8F4"; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  }, [W / 4, Dz / 4]);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Dz), new THREE.MeshBasicMaterial({ map: ceilTex }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, cz); scene.add(ceil);
  for (const z of [16, 9.2, 2.4, -4, -10.4, -16.8]) {
    st.add(rbox(W + .2, .5, .5, .12, 0xF3E9FF, 0, 13.45, z));
    for (const s of [-1, 1]) st.add(rbox(.3, 1.3, .7, .1, 0xE7D9FF, s * (ROOM.x1 - .2), 12.9, z));
    if (z < 15) st.add(garland(ROOM.x0 + .6, ROOM.x1 - .6, 13.15, z + .05, 8));
    for (const [x, c] of [[AISLES[0], C.pink3], [0, C.yellow], [AISLES[1], C.mint]]) if (z > -17 && z < 15) st.add(lamp(x, z, c));
  }

  // ---- entrance: facade, sign, awning, automatic sliding doors (hidden when they would block the view) ----
  const front = new THREE.Group();
  for (const s of [-1, 1]) {
    const fw = ROOM.x1 - D, fx = s * (D + fw / 2);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(fw, H), toon(C.white, { map: Object.assign(facadeTex.clone(), { needsUpdate: true, repeat: new THREE.Vector2(fw / 3, 3) }) }));
    face.position.set(fx, H / 2, ROOM.z1 + .06); face.userData.noBake = true; front.add(face);
    front.add(rbox(fw, 1.2, .3, .1, C.pink3, fx, .6, ROOM.z1 + .1));
    // display window with plush peeking out
    const win = new THREE.Group();
    win.add(rbox(7.2, 4.4, .3, .15, C.white, 0, 0, 0));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.8), toon(0xBDEBFF)); pane.position.z = .16; win.add(pane);
    win.add(rbox(7.8, .3, .8, .1, C.pink5, 0, -2.3, .3));
    win.position.set(s * 11.5, 3.6, ROOM.z1 + .1); front.add(win);
    for (const [i, sp] of ["duck", "shiba"].entries()) {
      const pl = makePlush(s < 0 ? "duck" : "seal", ["frog", "crown"][i]); pl.scale.setScalar(1.2);
      pl.position.set(s * 11.5 + (i - .5) * 2.6, 2.05, ROOM.z1 + .9); front.add(pl);
    }
  }
  const header = new THREE.Mesh(new THREE.PlaneGeometry(D * 2, H - DOOR.h), toon(C.white, { map: Object.assign(facadeTex.clone(), { needsUpdate: true, repeat: new THREE.Vector2(2, 2) }) }));
  header.position.set(0, DOOR.h + (H - DOOR.h) / 2, ROOM.z1 + .06); header.userData.noBake = true; front.add(header);
  front.add(rbox(W + 1.2, .9, 1.1, .3, C.pink3, 0, H + .3, ROOM.z1 + .2), rbox(W + .6, .5, .9, .2, C.white, 0, H - .35, ROOM.z1 + .25));
  for (let i = 0; i < 11; i++) front.add(blob(i % 2 ? C.white : C.pink5, .55, .4, .3, -W / 2 + 2 + i * (W - 4) / 10, H - .75, ROOM.z1 + .55));
  front.add(rbox(20, 2.6, .5, .3, C.pink5, 0, 10.3, ROOM.z1 + .35));
  front.add(plane(label("CLAW FRIENDS", 1600, 230, 190), 17, 2.44, 0, 10.3, ROOM.z1 + .62));
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.4), toon(C.white, { map: stripeTex, side: THREE.DoubleSide }));
  awn.position.set(0, DOOR.h + 1.0, ROOM.z1 + 1.1); awn.rotation.x = -.95; awn.userData.noBake = true; front.add(awn);
  front.add(rbox(9.2, .22, .3, .1, C.pink5, 0, DOOR.h + .52, ROOM.z1 + 1.95));
  // door frame and sliding glass
  front.add(rbox(.5, DOOR.h + .3, .6, .12, C.pink5, -D - .25, (DOOR.h + .3) / 2, ROOM.z1), rbox(.5, DOOR.h + .3, .6, .12, C.pink5, D + .25, (DOOR.h + .3) / 2, ROOM.z1));
  front.add(rbox(D * 2 + 1, .5, .6, .12, C.pink5, 0, DOOR.h + .1, ROOM.z1));
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xCFF1FF, transparent: true, opacity: .35, depthWrite: false });
  const doors = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(D - .1, DOOR.h - .2), glassMat); pane.userData.noBake = true; d.add(pane);
    d.add(rbox(D, .16, .14, .05, C.white, 0, (DOOR.h - .2) / 2, 0), rbox(D, .16, .14, .05, C.white, 0, -(DOOR.h - .2) / 2, 0));
    d.add(rbox(.16, DOOR.h - .2, .14, .05, C.white, -D / 2, 0, 0), rbox(.16, DOOR.h - .2, .14, .05, C.white, D / 2, 0, 0));
    d.add(rbox(.14, 1.2, .2, .05, C.pink5, -s * (D / 2 - .35), 0, .12));
    d.position.set(s * D / 2, DOOR.h / 2, ROOM.z1); front.add(d); doors.push({ g: d, s });
  }
  scene.add(front);

  // ---- outside props ----
  for (const [x, z, sc] of [[-9.5, 26.8, 1], [9.5, 26.8, 1], [-17.5, 26.2, 1.15], [17.5, 26.2, 1.15]]) st.add(tree(x, z, sc));
  st.add(lampPost(-5.6, 26.4), lampPost(5.6, 26.4), bench(13.6, 23.2, -Math.PI / 2 + .3), bench(-13.6, 23.2, Math.PI / 2 - .3));
  for (const s of [-1, 1]) st.add(plant(s * 4.8, 20.4, .8));

  // ---- cashier (left of the plaza) ----
  const cash = counter(C.pink1, "CASHIER");
  const reg = new THREE.Group();
  reg.add(rbox(.9, .5, 1.0, .1, C.lav2, 0, .25, 0), rbox(.7, .45, .08, .05, 0x4A3A5E, -.1, .75, 0));
  const scr = rbox(.08, .36, .8, .03, 0x9FE8FF, .02, .75, 0); reg.add(scr);
  reg.position.set(.1, 1.53, -1.3); cash.add(reg);
  cash.add(rbox(1.2, .5, .9, .1, C.yellow, .1, 1.78, 1.4));
  cash.position.copy(CASHIER); st.add(cash);
  // ---- big friend swap booth (right of the plaza), big prizes on a backboard ----
  const swap = counter(C.mint2, "BIG SWAP");
  swap.add(plane(label("5 small = 1 BIG!", 900, 170, 96, "#FFE45A"), 2.8, .53, 1.08, 1.12, 0, Math.PI / 2));
  swap.rotation.y = Math.PI; swap.position.copy(SWAP); st.add(swap);
  const board = new THREE.Group();
  board.add(rbox(.4, 5.4, 6.6, .15, C.white, 0, 2.7, 0));
  for (const y of [1.6, 3.6]) board.add(rbox(1.3, .14, 6.4, .05, C.lav, -.5, y, 0));
  board.position.set(ROOM.x1 - .4, 0, SWAP.z); st.add(board);
  const showcase = [["duck", 1.75, -1.6], ["shiba", 1.75, 1.6], ["seal", 3.75, -1.6], ["alpaca", 3.75, 1.6]];
  const bigShow = [];
  for (const [sp, y, dz] of showcase) {
    const m = makePlush(sp, sp === "duck" ? "crown" : "plain"); m.scale.setScalar(1.55); m.position.set(ROOM.x1 - 1.2, y + .78, SWAP.z + dz); m.rotation.y = -Math.PI / 2;
    scene.add(m); bigShow.push(m);
  }
  // ---- cart corral inside the door ----
  for (let i = 0; i < 3; i++) {
    const c = cartModel(); c.root.position.set(CORRAL.x, 0, CORRAL.z - i * .42); c.root.rotation.y = Math.PI; st.add(c.root);
  }
  st.add(rbox(.16, 1.3, 2.6, .05, C.lav2, CORRAL.x - 1, .65, CORRAL.z - .4), rbox(.16, 1.3, 2.6, .05, C.lav2, CORRAL.x + 1, .65, CORRAL.z - .4));
  st.add(plane(label("CARTS", 600, 160, 110), 1.8, .48, CORRAL.x, 2.35, CORRAL.z + .9, Math.PI));
  st.add(rbox(2.2, .7, .12, .1, C.pink5, CORRAL.x, 2.35, CORRAL.z + .85));

  // ---- collection shelf and big-friend pedestals along the back wall ----
  const shelf = new THREE.Group();
  shelf.add(rbox(1.6, 6.2, 7.4, .2, C.white, 0, 3.1, 0));
  for (let r = 0; r < 4; r++) shelf.add(rbox(1.7, .16, 7.2, .06, [C.pink3, C.lav, C.blue, C.mint][r], -.1, .75 + r * 1.35, 0));
  shelf.add(rbox(.4, .9, 6.8, .2, C.pink5, -.1, 6.7, 0));
  shelf.add(plane(label("COLLECTION", 900, 170, 118), 4.8, .9, -.32, 6.7, 0, -Math.PI / 2));
  shelf.position.copy(SHELF); shelf.rotation.y = Math.PI / 2; st.add(shelf);
  shelf.updateMatrixWorld(true);
  const qTex = canvasTex(128, 128, g => {
    g.fillStyle = "rgba(74,58,94,.12)"; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
    g.font = "700 64px Fredoka"; g.fillStyle = "rgba(74,58,94,.45)"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 64, 70);
  });
  const slots = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const pos = shelf.localToWorld(new THREE.Vector3(-.4, .83 + r * 1.35 + .36, 2.9 - c * 1.16));
    const qm = plane(qTex, .7, .7, pos.x, pos.y, pos.z + .1);
    scene.add(qm);
    slots.push({ pos, q: qm, mesh: null, key: PLUSH[r * 6 + c].key });
  }
  const pedestals = [];
  for (const [i, sp] of ["duck", "shiba", "seal", "alpaca"].entries()) {
    const x = [-8.6, -5.6, 5.6, 8.6][i];
    st.add(rbox(2.2, .9, 2.2, .2, [C.pink3, C.lav, C.blue, C.mint][i], x, .45, -19.4));
    const q = plane(qTex, 1.3, 1.3, x, 2.1, -19.2);
    scene.add(q);
    pedestals.push({ sp, x, q, mesh: null });
  }

  // balloons tied to the outer big-friend pedestals and to the cart corral by the door
  st.add(balloons([-9.62, .88, -18.42], [-10.4, -19], [C.pink5, C.yellow, C.mint]), balloons([9.62, .88, -18.42], [10.4, -19], [C.blue, C.pink3, C.lav2]));
  st.add(balloons([CORRAL.x - 1, 1.3, CORRAL.z - 1.65], [CORRAL.x - 1.5, CORRAL.z - 2.1], [C.mint, C.pink5, C.yellow]));
  st.add(plant(-20.6, -19.8), plant(20.6, -19.8), plant(-20.6, 8.8, .9), plant(20.6, 8.8, .9));
  scene.add(bake(st));

  // giant plush friends in the front corners
  const bigDuck = makePlush("duck", "frog"); bigDuck.scale.setScalar(2.6); bigDuck.position.set(-19.8, 1.2, 17.4); bigDuck.rotation.y = .7; scene.add(bigDuck);
  const bigShiba = makePlush("shiba", "straw"); bigShiba.scale.setScalar(2.6); bigShiba.position.set(19.8, 1.2, 17.4); bigShiba.rotation.y = -.7; scene.add(bigShiba);
  for (const [x, y, z, s] of [[-17.8, 4.2, 17.8, .5], [17.9, 4.4, 17.6, .42], [0, 13.2, ROOM.z0 + .8, .8]]) scene.add(sparkle(x, y, z, s));

  // ---- colliders for the kid ----
  const box = (hx, hz, x, z, hy = 5) => world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, hy, z).setCollisionGroups(G_WORLD));
  box(1, Dz, ROOM.x0 - 1, cz); box(1, Dz, ROOM.x1 + 1, cz);
  box(W, 1, 0, ROOM.z0 - .6);
  for (const s of [-1, 1]) box((ROOM.x1 - D) / 2 + 1, .5, s * (D + (ROOM.x1 - D) / 2 + 1), ROOM.z1 + .4);
  // outside: the sidewalk is walkable, fenced by invisible edges
  box(.5, 6, -OUTSIDE.x - .5, ROOM.z1 + 5); box(.5, 6, OUTSIDE.x + .5, ROOM.z1 + 5); box(OUTSIDE.x + 1, .5, 0, OUTSIDE.z1 + .5);
  for (const p of PLACES) {
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw), lz = .45;
    world.createCollider(R.ColliderDesc.cuboid(2.85, 5, 2.8).setTranslation(p.x + lz * s, 5, p.z + lz * c)
      .setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }).setCollisionGroups(G_WORLD));
  }
  box(1.4, 3, CASHIER.x - .2, CASHIER.z); box(1.4, 3, SWAP.x + .2, SWAP.z); box(1, 3.4, ROOM.x1 - .6, SWAP.z);
  box(1.2, 1.4, CORRAL.x, CORRAL.z - .4);
  box(3.9, 1, SHELF.x, SHELF.z);
  for (const x of [-8.6, -5.6, 5.6, 8.6]) box(1.1, 1.1, x, -19.4, 2);
  for (const [x, z] of [[-19.8, 17.4], [19.8, 17.4]]) world.createCollider(R.ColliderDesc.ball(1.4).setTranslation(x, 1.2, z).setCollisionGroups(G_WORLD));
  for (const [x, z] of [[-12, -19.6], [12, -19.6], [-4.8, 17.6], [4.8, 17.6], [-20.6, -19.8], [20.6, -19.8], [-20.6, 8.8], [20.6, 8.8], [-4.8, 20.4], [4.8, 20.4], [-5.6, 26.4], [5.6, 26.4], [-9.5, 26.8], [9.5, 26.8]]) box(.7, .7, x, z, 2);

  let doorOpen = 0;
  return {
    slots,
    // doors slide open near the kid; the front hides when it would stand between the camera and a kid inside
    update(dt, kid, cam) {
      const near = Math.abs(kid.x) < D + 2.5 && Math.abs(kid.z - ROOM.z1) < 5;
      doorOpen = THREE.MathUtils.clamp(doorOpen + (near ? 3 : -2) * dt, 0, 1);
      const e = doorOpen * doorOpen * (3 - 2 * doorOpen);
      for (const d of doors) d.g.position.x = d.s * (D / 2 + e * (D - .2));
      front.visible = !(kid.z < ROOM.z1 - .5 && cam.z > ROOM.z1);
      return doorOpen;
    },
    setShelf(owned) {
      for (const s of slots) {
        const has = (owned[s.key] || 0) > 0;
        s.q.visible = !has;
        if (has && !s.mesh) {
          const p = PLUSH.find(p => p.key === s.key);
          s.mesh = makePlush(p.species, p.acc); s.mesh.scale.setScalar(.62); s.mesh.position.copy(s.pos);
          scene.add(s.mesh);
        }
      }
    },
    setBig(big) {
      for (const p of pedestals) {
        const has = (big[p.sp] || 0) > 0;
        p.q.visible = !has;
        if (has && !p.mesh) { p.mesh = makePlush(p.sp, "crown"); p.mesh.scale.setScalar(2); p.mesh.position.set(p.x, 1.85, -19.4); scene.add(p.mesh); }
      }
    },
  };
}
