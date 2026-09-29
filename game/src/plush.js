// Plush toys: 4 species share one round body; the 6 variants of each differ by accessory.
import * as THREE from "three";
import { C, toon, flat, mesh, blob, dot, tube, stick, stickAround, bake } from "./gfx.js";

export const DA = .5, DB = .47, DC = .46;

export const SPECIES = [
  { id: "duck", name: "Duck", plain: "Duckling", machine: "Quack Catch" },
  { id: "shiba", name: "Shiba", plain: "Shiba Pup", machine: "Shiba Scoop" },
  { id: "seal", name: "Seal", plain: "Seal Pup", machine: "Seal Splash" },
  { id: "alpaca", name: "Alpaca", plain: "Alpaca", machine: "Alpaca Pick" },
];
export const ACCS = [
  { id: "plain", name: "", tier: "common", weight: 26, grip: 0 },
  { id: "frog", name: "Froggy", tier: "common", weight: 18, grip: .12 },
  { id: "straw", name: "Sunny", tier: "common", weight: 18, grip: .08 },
  { id: "flower", name: "Blossom", tier: "common", weight: 18, grip: .03 },
  { id: "sailor", name: "Sailor", tier: "uncommon", weight: 12, grip: .05 },
  { id: "crown", name: "Royal", tier: "rare", weight: 4, grip: -.12 },
];
export const PLUSH = [];
for (const s of SPECIES) for (const a of ACCS)
  PLUSH.push({ key: `${s.id}-${a.id}`, species: s.id, acc: a.id, name: a.id === "plain" ? s.plain : `${a.name} ${s.name}`, tier: a.tier, weight: a.weight, grip: a.grip });
export const PLUSH_BY_KEY = Object.fromEntries(PLUSH.map(p => [p.key, p]));

function face(g, { eyeY = .08, eyeX = .17, blushY = -.04 } = {}) {
  for (const s of [-1, 1]) {
    g.add(stick(dot(C.ink, .045, .058, .025), DA, DB, DC, eyeX * s, eyeY, .004));
    g.add(stick(dot(C.white, .014, .014, .01), DA, DB, DC, eyeX * s + .014, eyeY + .02, .026));
    g.add(stick(dot(C.blush, .085, .05, .014), DA, DB, DC, .29 * s, blushY, .003));
  }
}

// ---- species bodies (headTop = false when a hood covers the top of the head) ----
const BODIES = {
  duck(g, headTop, tuft) {
    g.add(blob(C.white, DA, DB, DC));
    const wl = blob(C.white, .1, .2, .17, -.47, -.06, .04); wl.rotation.z = .35;
    const wr = blob(C.white, .1, .2, .17, .47, -.06, .04); wr.rotation.z = -.35;
    g.add(wl, wr, blob(C.orange, .13, .05, .12, -.16, -.43, .2), blob(C.orange, .13, .05, .12, .16, -.43, .2));
    face(g);
    g.add(stick(blob(C.orange, .17, .085, .1), DA, DB, DC, 0, -.03, .03));
    if (tuft) {
      g.add(tube([[-.02, .45, 0], [-.06, .55, .02], [-.01, .6, .03], [.03, .56, .02]], .016, flat(C.ink), false));
      g.add(tube([[.03, .46, 0], [.07, .55, 0], [.12, .56, .01], [.13, .52, .01]], .016, flat(C.ink), false));
    }
  },
  shiba(g, headTop) {
    const fur = 0xF7B267, light = 0xFFF3E0;
    g.add(blob(fur, DA, DB, DC));
    g.add(stick(blob(light, .31, .2, .1), DA, DB, DC, 0, -.13, -.03));
    for (const s of [-1, 1]) {
      if (headTop) {
        const ear = mesh(new THREE.ConeGeometry(.13, .26, 16), toon(fur), .25 * s, .42, .02); ear.rotation.z = -.35 * s; g.add(ear);
        const inner = mesh(new THREE.ConeGeometry(.07, .15, 12), toon(C.pink3), .25 * s, .41, .09, false); inner.rotation.z = -.35 * s; g.add(inner);
      }
      g.add(blob(light, .12, .06, .11, .16 * s, -.43, .2));
    }
    face(g, { eyeY: .1 });
    g.add(stick(dot(C.ink, .045, .033, .03), DA, DB, DC, 0, -.02, .07));
    const tail = mesh(new THREE.TorusGeometry(.1, .045, 10, 24, Math.PI * 1.5), toon(light), 0, .05, -.47); tail.rotation.y = Math.PI / 2; g.add(tail);
  },
  seal(g) {
    const fur = 0xE6ECF6;
    g.add(blob(fur, DA * 1.04, DB * .92, DC * 1.08));
    for (const s of [-1, 1]) {
      const f = blob(fur, .18, .06, .13, .44 * s, -.22, .12); f.rotation.z = .5 * s; g.add(f);
      const t = blob(fur, .12, .05, .16, .1 * s, -.34, -.45); t.rotation.y = .5 * s; g.add(t);
    }
    face(g, { eyeY: .1, eyeX: .19 });
    g.add(stick(blob(C.white, .17, .1, .08), DA, DB, DC, 0, -.07, 0));
    g.add(stick(dot(C.ink, .04, .03, .03), DA, DB, DC, 0, -.02, .075));
    for (const s of [-1, 1]) for (const y of [-.06, -.1]) g.add(stick(dot(C.ink, .012, .012, .01), DA, DB, DC, .08 * s, y, .07));
  },
  alpaca(g, headTop, fluff) {
    const fur = 0xFFF4E2;
    g.add(blob(fur, DA, DB, DC));
    if (headTop) {
      const k = fluff ? 1 : .6;
      for (const [x, y, z, r] of [[0, .44, .06, .15], [-.13, .41, .02, .12], [.13, .41, .02, .12], [-.06, .39, .16, .1], [.07, .4, .15, .1]]) g.add(blob(C.white, r * k, r * k, r * k, x, y - (1 - k) * .1, z));
      for (const s of [-1, 1]) { const ear = blob(fur, .06, .15, .05, .26 * s, .47, -.06); ear.rotation.z = -.35 * s; g.add(ear); }
    }
    for (const s of [-1, 1]) g.add(blob(fur, .12, .06, .11, .16 * s, -.43, .2));
    face(g, { eyeY: .1 });
    g.add(stick(blob(C.white, .18, .13, .09), DA, DB, DC, 0, -.09, 0));
    for (const s of [-1, 1]) g.add(stick(dot(C.ink, .018, .022, .01), DA, DB, DC, .04 * s, -.04, .085));
  },
};

function flowerMesh(petal) {
  const f = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    f.add(blob(petal, .05, .05, .03, Math.cos(a) * .052, Math.sin(a) * .052, 0));
  }
  f.add(blob(0xFFE08A, .032, .032, .03, 0, 0, .012));
  return f;
}

const ACC_BUILD = {
  frog(g) {
    const hood = mesh(new THREE.SphereGeometry(.54, 40, 20, 0, Math.PI * 2, 0, 1.28), toon(C.green));
    hood.scale.set(1, .95, .93); hood.rotation.x = -.5; g.add(hood);
    for (const s of [-1, 1]) {
      g.add(blob(C.green, .11, .11, .11, .19 * s, .45, .08));
      g.add(blob(C.white, .066, .066, .04, .19 * s, .47, .17));
      const p = dot(C.ink, .034, .034, .02); p.position.set(.19 * s, .47, .205); g.add(p);
    }
  },
  straw(g) {
    const hat = new THREE.Group();
    hat.add(blob(C.straw, .47, .025, .47), blob(C.straw, .23, .17, .23, 0, .02, 0));
    const band = mesh(new THREE.TorusGeometry(.222, .032, 12, 40), toon(C.pink3), 0, .05, 0); band.rotation.x = Math.PI / 2;
    hat.add(band, blob(C.pink3, .06, .045, .035, .2, .08, .13), blob(C.pink3, .06, .045, .035, .27, .06, .08));
    hat.position.set(.02, .4, -.02); hat.rotation.set(-.12, 0, .15); g.add(hat);
  },
  flower(g) {
    const cols = [C.pink3, C.lav, C.blue];
    for (let i = 0; i < 8; i++) {
      g.add(stickAround(flowerMesh(cols[i % 3]), DA, DB, DC, i / 8 * Math.PI * 2, .33));
      g.add(stickAround(blob(C.green, .04, .02, .025), DA, DB, DC, (i + .5) / 8 * Math.PI * 2, .35, .005));
    }
  },
  sailor(g) {
    g.add(blob(C.white, .21, .12, .21, 0, .47, -.02));
    const band = mesh(new THREE.TorusGeometry(.2, .03, 12, 40), toon(C.blue), 0, .42, -.02); band.rotation.x = Math.PI / 2;
    g.add(band, blob(C.pink3, .05, .05, .05, 0, .59, -.02));
    const sh = new THREE.Shape(); sh.moveTo(-.14, .04); sh.lineTo(.14, .04); sh.lineTo(0, -.15); sh.closePath();
    const tri = mesh(new THREE.ExtrudeGeometry(sh, { depth: .02, bevelEnabled: true, bevelThickness: .012, bevelSize: .014, bevelSegments: 3 }), toon(C.blue));
    const tg = new THREE.Group(); tg.add(tri); g.add(stick(tg, DA, DB, DC, 0, -.2, 0));
    g.add(stick(blob(C.pink3, .045, .045, .035), DA, DB, DC, 0, -.17, .03));
  },
  crown(g) {
    const ring = mesh(new THREE.TorusGeometry(.17, .04, 12, 36), toon(C.gold), 0, .47, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(.055, .16, 16), toon(C.gold), Math.sin(a) * .17, .56, Math.cos(a) * .17));
      g.add(blob(C.cream, .026, .026, .026, Math.sin(a) * .17, .65, Math.cos(a) * .17));
    }
    g.add(blob(C.pink5, .04, .04, .025, 0, .48, .21));
  },
};

export function makePlush(species, acc) {
  const g = new THREE.Group();
  const hooded = acc === "frog", plain = acc === "plain";
  BODIES[species](g, !hooded, plain);
  if (!plain) ACC_BUILD[acc](g);
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return bake(g);
}
export const plushOf = key => { const p = PLUSH_BY_KEY[key]; return makePlush(p.species, p.acc); };
