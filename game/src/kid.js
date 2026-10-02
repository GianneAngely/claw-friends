// Kyoko (the main character) and the arcade staff: one skinned chibi model built in Blender from her reference art
// (blender/gen_geometry.py + kyoko_blend.py -> assets/kyoko.glb). Here it gets anime materials, dark ink outlines,
// her drawn face (expressions are texture swaps, blender/face_expr.py) and procedural bone animation with springy
// hair, braid, ears and cape. The model's rest pose is the reference pose: waving.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import kyokoGlb from "../assets/kyoko.glb";
import faceIdle from "../assets/kyoko_face_idle.png";
import faceBlink from "../assets/kyoko_face_blink.png";
import faceHappy from "../assets/kyoko_face_happy.png";
import faceSad from "../assets/kyoko_face_sad.png";
import faceWow from "../assets/kyoko_face_wow.png";
import hairPng from "../assets/kyoko_hair.png";
import { toonFlat, toonTex, outlineSkinned } from "./gfx.js";

export const BASE = { hair: 0xA32858, hoodColor: 0xC7C7D0 };
// wardrobe: the tee and the shorts come in the six colour sets W1..W6 (mix and match)
export const HOODS = [{ id: "koala", name: "Koala", color: 0xC7C7D0 }];
export const TOPS = [
  { id: "navy", name: "Navy", color: 0x3F4575 },
  { id: "pink", name: "Pink", color: 0xF7B6CF },
  { id: "lilac", name: "Lilac", color: 0xC9B6F2 },
  { id: "mint", name: "Mint", color: 0xA6E3C6 },
  { id: "black", name: "Black", color: 0x34303B },
  { id: "yellow", name: "Yellow", color: 0xE5B43E },
];
export const BOTTOMS = [
  { id: "grey", name: "Grey", color: 0xC7C6D0 },
  { id: "white", name: "White", color: 0xF5F4F7 },
  { id: "navy", name: "Navy", color: 0x34407A },
  { id: "cream", name: "Cream", color: 0xF2E4C0 },
  { id: "denim", name: "Denim", color: 0x6F8FC6 },
  { id: "brown", name: "Brown", color: 0x8C5B3D },
];
export const DEFAULT_OUTFIT = { hood: "koala", top: "navy", bottom: "grey" };
const pick = (list, id) => list.find(x => x.id === id) || list[0];
// outfit ids (+ base: hair / hood colour overrides for the staff) -> the colours makeKid paints
export function dress(outfit = DEFAULT_OUTFIT, base = BASE) {
  const h = pick(HOODS, outfit.hood), t = pick(TOPS, outfit.top), b = pick(BOTTOMS, outfit.bottom);
  return { hair: base.hair ?? BASE.hair, hood: h.id, hoodColor: base.hoodColor ?? h.color, topColor: t.color, bottomColor: b.color };
}

const SKIN = 0xF8E5D6, INK = 0x2A1F2E;
const darker = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const lighter = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xFFFFFF), k).getHex();
// material name in the model -> [colour, shadow strength]
function palette(ch) {
  const hood = ch.hoodColor;
  return {
    Skin: [SKIN, .3], Hair: [ch.hair, .8], Top: [ch.topColor, .8], Shorts: [ch.bottomColor, .8],
    Hood: [hood, .28], HoodInner: [darker(hood, .7), .4], EarInner: [lighter(hood, .3), .5], Nose: [0x38373B, .4],   // flat like the drawing
    Collar: [hood, .35], Button: [darker(hood, .96), .4], Glove: [SKIN, .3],   // bare hands
  };
}

// ---------- model ----------
let TEMPLATE = null;
const FACES = {};
let HAIR_TEX = null;   // her hair as drawn (strands, shading, highlights), projected from the front
export async function loadKid() {
  if (TEMPLATE) return;
  const buf = kyokoGlb.buffer.slice(kyokoGlb.byteOffset, kyokoGlb.byteOffset + kyokoGlb.byteLength);
  TEMPLATE = (await new GLTFLoader().parseAsync(buf, "")).scene;
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries({ idle: faceIdle, blink: faceBlink, happy: faceHappy, sad: faceSad, wow: faceWow }).map(async ([k, url]) => {
    const t = await loader.loadAsync(url);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;   // glTF UV convention
    FACES[k] = t;
  }));
  HAIR_TEX = await loader.loadAsync(hairPng);
  HAIR_TEX.flipY = false; HAIR_TEX.colorSpace = THREE.SRGBColorSpace; HAIR_TEX.anisotropy = 4;
}
function spring(s, target, dt, k = 70, c = 7, kick = 0) {
  s.v += (k * (target - s.a) - c * s.v) * dt + kick;
  s.a += s.v * dt;
  return s.a;
}

export function makeKid(outfit = DEFAULT_OUTFIT, base = BASE) {
  const ch = dress(outfit, base);
  const model = cloneSkinned(TEMPLATE);
  const root = new THREE.Group(); root.add(model);
  const pal = palette(ch), meshes = [];
  let faceMat = null, skeleton = null;
  model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const m of meshes) {
    skeleton = skeleton || m.skeleton;
    // toon characters cast shadows on the floor but do not shadow themselves
    m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false;
    const name = m.material.name;
    if (name === "Face") {
      faceMat = new THREE.MeshBasicMaterial({ map: FACES.idle, transparent: true, depthWrite: false });
      m.material = faceMat; m.renderOrder = 1; m.castShadow = false;
      continue;
    }
    if (m.name.startsWith("Folds")) {   // the cloth folds on the capelet: drawn lines, no outline
      m.material = new THREE.MeshBasicMaterial({ color: darker(ch.hoodColor, .68), side: THREE.DoubleSide }); m.castShadow = false;
      continue;
    }
    if (name === "HairTex") {   // Kyoko's hair carries the drawing; the staff (other hair colours) get the plain colour
      m.material = ch.hair === BASE.hair ? toonTex(0xFFFFFF, HAIR_TEX) : toonFlat(ch.hair, .8);
      outlineSkinned(m, ch.hair, INK);
      continue;
    }
    const [color, shade] = pal[name] || [0xFF00FF, .8];
    m.material = toonFlat(color, shade);
    outlineSkinned(m, color, INK);
  }

  // ---------- rig: rotations are given in character space (x = her left, y = up, z = forward) ----------
  root.updateMatrixWorld(true);
  const B = {}, AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  for (const b of skeleton.bones) {
    const rw = new THREE.Quaternion(); b.getWorldQuaternion(rw);
    B[b.name] = { b, q0: b.quaternion.clone(), p0: b.position.clone(), rw, rwi: rw.clone().invert(), acc: new THREE.Quaternion() };
  }
  const _q = new THREE.Quaternion(), _t = new THREE.Quaternion();
  const rot = (name, axis, ang) => { const e = B[name]; if (e && ang) e.acc.premultiply(_q.setFromAxisAngle(AX[axis], ang)); };
  const both = (n, axis, ang, mirror = false) => { rot(n + "_L", axis, ang); rot(n + "_R", axis, mirror ? -ang : ang); };
  function apply() {
    for (const k in B) {
      const e = B[k];
      e.b.quaternion.copy(e.q0).multiply(_t.copy(e.rwi).multiply(e.acc).multiply(e.rw));
      e.acc.identity();
    }
  }
  // arms are posed by aiming the upper arm and forearm at directions (the model's rest pose is the waving reference
  // pose); by default they hang relaxed at her sides
  const wp = b => b.getWorldPosition(new THREE.Vector3());
  const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const ARM = {};
  for (const s of ["L", "R"]) {
    const pu = wp(B["upperarm_" + s].b), pf = wp(B["forearm_" + s].b), ph = wp(B["hand_" + s].b), g = s === "L" ? 1 : -1;
    const rest = { upper: pf.clone().sub(pu).normalize(), fore: ph.clone().sub(pf).normalize() };
    ARM[s] = { rest, cur: { upper: V(g * .26, -1, .1), fore: V(g * .1, -1, .34) } };
  }
  const _v = new THREE.Vector3(), _qu = new THREE.Quaternion(), _qf = new THREE.Quaternion();
  function aimArm(s, goalUpper, goalFore, dt) {
    const a = ARM[s], k = 1 - Math.exp(-dt * 9);
    a.cur.upper.lerp(goalUpper, k).normalize(); a.cur.fore.lerp(goalFore, k).normalize();
    _qu.setFromUnitVectors(a.rest.upper, a.cur.upper);
    _v.copy(a.cur.fore).applyQuaternion(_t.copy(_qu).invert());
    _qf.setFromUnitVectors(a.rest.fore, _v);
    B["upperarm_" + s].acc.premultiply(_qu); B["forearm_" + s].acc.premultiply(_qf);
  }
  const lerpV = (a, b, t) => a.clone().lerp(b, t).normalize();

  // ---------- animation state ----------
  let phase = 0, amt = 0, t = 0, prevBob = 0, prevYaw = null, expr = "idle", exprT = 0, blinkT = 2 + Math.random() * 3;
  const sp = { ear: { a: 0, v: 0 }, hair: { a: 0, v: 0 }, hairZ: { a: 0, v: 0 }, braid: { a: 0, v: 0 }, cape: { a: 0, v: 0 }, capeZ: { a: 0, v: 0 }, flare: { a: 0, v: 0 } };
  const setMap = name => { const m = FACES[name]; if (faceMat.map !== m) { faceMat.map = m; faceMat.needsUpdate = true; } };

  return {
    root, character: ch,
    // happy / sad / wow for a while, then back to idle
    setFace(name, sec = 1.6) { expr = name; exprT = sec; },
    // speed 0..1; pose: "walk" (default), "reach" (at a claw machine), "push" (holding the cart)
    animate(dt, speed, pose = "walk") {
      dt = Math.min(dt, .05);
      t += dt;
      amt = THREE.MathUtils.lerp(amt, speed, Math.min(1, dt * 8));
      phase += dt * (5.2 + 5.5 * amt);
      const s = Math.sin(phase), c = Math.cos(phase), idle = 1 - amt;
      // legs: swing, knee lift on the forward swing, feet stay level
      rot("thigh_L", "x", -.62 * s * amt); rot("thigh_R", "x", .62 * s * amt);
      const kl = Math.max(0, c) * amt, kr = Math.max(0, -c) * amt;
      rot("shin_L", "x", .9 * kl); rot("shin_R", "x", .9 * kr);
      rot("foot_L", "x", -.35 * kl + .62 * s * amt * .5); rot("foot_R", "x", -.35 * kr - .62 * s * amt * .5);
      // body: bounce, sway, lean, breathing
      const happy = expr === "happy", sad = expr === "sad";
      const hop = happy ? Math.abs(Math.sin(t * 8.5)) * .22 : 0;
      const bob = Math.abs(c) * .08 * amt + hop;
      rot("hips", "z", .05 * s * amt); rot("hips", "x", .06 * amt);
      rot("chest", "y", -.1 * s * amt); rot("chest", "x", .025 * Math.sin(t * 2.3) * idle + (sad ? .05 : 0));
      rot("head", "z", .05 * s * amt + .05 * Math.sin(t * .9) * idle); rot("head", "x", -.04 * amt + (sad ? .08 : 0) + .02 * Math.sin(t * 1.7) * idle);
      B.root.b.position.copy(B.root.p0); B.root.b.position.y += bob;
      // arms
      for (const side of ["L", "R"]) {
        const g = side === "L" ? 1 : -1;
        let up, fo;
        if (happy) {                                  // "yay!": fists up in front of the chest
          const w = Math.sin(t * 14 + (g > 0 ? 0 : 1.5)) * .25;
          up = V(g * .45, -.5, .6); fo = V(g * (.1 + w * .3), 1, .35);
        } else if (pose === "reach") {
          up = V(g * .15, .3 + .05 * Math.sin(t * 3 + g), 1); fo = V(0, .35, 1);
        } else if (pose === "push") {
          up = V(g * .2, -.35, 1); fo = V(g * .02, -.15, 1);
        } else {
          // relaxed at her sides with a little breathing sway; walking: they swing
          const swing = g * s * amt, breathe = .04 * Math.sin(t * 1.9 + g) * idle;
          const walkUp = V(g * .24, -1, .08 + .55 * swing), walkFo = V(g * .08, -1, .3 + .35 * swing);
          const standUp = sad ? V(g * .12, -1, .02) : V(g * (.26 + breathe), -1, .1), standFo = sad ? V(g * .05, -1, .12) : V(g * .1, -1, .34);
          up = lerpV(standUp, walkUp, amt); fo = lerpV(standFo, walkFo, amt);
        }
        aimArm(side, up, fo, dt);
      }
      // springs: hair, braid, ears and cape lag behind bounces, flow back while walking, swing on turns
      const vy = (bob - prevBob) / dt; prevBob = bob;
      const yaw = root.rotation.y, yawRate = prevYaw === null ? 0 : Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw)) / dt; prevYaw = yaw;
      const ear = spring(sp.ear, 0, dt, 90, 6, -vy * .9 * dt);
      both("ear", "x", ear * .4 - .03 * amt);
      const hair = spring(sp.hair, .12 * amt, dt, 60, 6, -vy * .3 * dt);
      const hairZ = spring(sp.hairZ, THREE.MathUtils.clamp(-yawRate * .04, -.2, .2) + .04 * s * amt, dt, 50, 5);
      rot("hair_L1", "x", hair * .7); rot("hair_R1", "x", hair * .7); rot("hair_L2", "x", hair * .5); rot("hair_R2", "x", hair * .5);
      rot("hair_L1", "z", hairZ); rot("hair_R1", "z", hairZ);
      const braid = spring(sp.braid, .08 * s * amt, dt, 55, 5, -vy * .6 * dt);
      rot("braid1", "z", braid); rot("braid2", "z", braid * 1.4); rot("braid1", "x", -Math.abs(braid) * .5);
      const cape = spring(sp.cape, .16 * amt, dt, 45, 5, -vy * .2 * dt);
      const capeZ = spring(sp.capeZ, THREE.MathUtils.clamp(-yawRate * .04, -.2, .2) + .04 * s * amt, dt, 40, 4.5);
      const flare = spring(sp.flare, 0, dt, 75, 6, Math.max(0, -vy) * .15 * dt);
      rot("cape_B", "x", cape + flare * .4); rot("cape_B", "z", capeZ);
      rot("cape_L", "x", cape * .6); rot("cape_L", "z", capeZ * .6 + flare * .3);
      rot("cape_R", "x", cape * .6); rot("cape_R", "z", capeZ * .6 - flare * .3);
      // face: expression timer and blinking
      if (exprT > 0) { exprT -= dt; if (exprT <= 0) expr = "idle"; }
      blinkT -= dt;
      const blinking = blinkT < 0 && blinkT > -.13;
      if (blinkT < -.13) blinkT = 2 + Math.random() * 3.5;
      setMap(expr !== "idle" ? expr : blinking ? "blink" : "idle");
      apply();
    },
  };
}
