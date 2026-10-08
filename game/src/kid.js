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
import { toonFlat, toonTex, toonHair, flat, outline, outlineSkinned, outlineMatFor } from "./gfx.js";

export const BASE = {};   // (hair / hoodColor: override the outfit's colours, for the staff: plain hair)
// her drawn hair, recoloured (the first is the drawing's own colour); the styles leave out the braid or the long hair
export const HAIRS = [
  { id: "red", name: "Red", color: 0xA83A65 }, { id: "pink", name: "Pink", color: 0xF08DB8 },
  { id: "lilac", name: "Lilac", color: 0x9D86D8 }, { id: "brown", name: "Brown", color: 0x7A4A32 },
  { id: "black", name: "Black", color: 0x3A3442 }, { id: "blonde", name: "Blonde", color: 0xEBC46A },
];
export const STYLES = [
  { id: "braid-long", name: "Braid + long" }, { id: "long", name: "Long" },
  { id: "braid-bob", name: "Braid + bob" }, { id: "bob", name: "Bob" },
];
// wardrobe: the tee and the shorts come in the six colour sets W1..W6 (mix and match)
export const HOODS = [
  { id: "koala", name: "Koala", color: 0xC7C7D0 }, { id: "cat", name: "Cat", color: 0xF4C08E },
  { id: "bunny", name: "Bunny", color: 0xF6F1F4 }, { id: "bear", name: "Bear", color: 0xB98A66 },
  { id: "frog", name: "Frog", color: 0x9AD68A },
];
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
export const DEFAULT_OUTFIT = { hood: "koala", top: "navy", bottom: "grey", hair: "red", style: "braid-long" };
const pick = (list, id) => list.find(x => x.id === id) || list[0];
// outfit ids (+ base: hair / hood colour overrides for the staff) -> the colours makeKid paints
export function dress(outfit = DEFAULT_OUTFIT, base = BASE) {
  const h = pick(HOODS, outfit.hood), t = pick(TOPS, outfit.top), b = pick(BOTTOMS, outfit.bottom);
  const style = pick(STYLES, outfit.style).id;
  return { hair: base.hair ?? pick(HAIRS, outfit.hair).color, drawn: base.hair === undefined, braid: style.startsWith("braid"),
    long: !style.endsWith("bob"), hood: h.id, hoodColor: base.hoodColor ?? h.color, topColor: t.color, bottomColor: b.color };
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

// hull outline in her exact ink, for the hood's extra parts (plain meshes)
let INK_LINE_MAT = null;
function inkLine() {
  if (!INK_LINE_MAT) {
    const m = outlineMatFor(INK);
    INK_LINE_MAT = m.clone(); INK_LINE_MAT.uniforms = { ...m.uniforms, color: { value: new THREE.Color(INK) } };
  }
  return INK_LINE_MAT;
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
// walk cycle, per leg: phase 0 = that heel touches down; stance 0-0.6, swing 0.6-1 (normal gait: initial contact,
// loading response, mid stance, terminal stance, pre-swing, initial / mid / terminal swing). Joint angles in degrees
// after the published normal gait curves (hip flexed 30 at contact, extended 10 at terminal stance; knee 15 in loading,
// 40 at toe-off, 60 in initial swing; ankle plantar-flexed 20 at toe-off), a little bigger for her short legs.
// hip + = leg forward, knee + = bent, ankle + = toes up
const GAIT = {
  hip: [[0, 22], [.12, 18], [.3, 4], [.5, -14], [.6, -8], [.73, 14], [.87, 26], [.95, 24]],
  knee: [[0, 2], [.12, 16], [.3, 4], [.45, 8], [.52, 22], [.6, 42], [.72, 62], [.85, 42], [.95, 16]],
  // the foot's own angle to the floor (toes up +): heel first, flat through the stance, rolling up onto the toes, then
  // level again through the swing. The ankle makes up the difference to the shin, so her big chibi feet stand flat
  // and their toes never dig into the floor on the swing (an ankle curve alone left the toes pointing down).
  // Tuned with previews/gaitsim.py so the heel lands at 0, the foot is flat 0.08-0.44 and leaves the floor at 0.6
  foot: [[0, 10], [.07, 0], [.4, 0], [.5, -4], [.6, -12], [.68, -4], [.8, 0], [.91, 0], [.97, 7]],
};
// smooth periodic curve through [phase, value] keys (cubic Hermite, wraps at 1)
function cyc(keys, p) {
  p = ((p % 1) + 1) % 1;
  const n = keys.length, at = i => { const k = keys[((i % n) + n) % n]; return [k[0] + Math.floor(i / n), k[1]]; };
  let i = n - 1;
  for (let j = 0; j < n; j++) if (keys[j][0] <= p) i = j;
  const [p0, v0] = at(i), [p1, v1] = at(i + 1), [pa, va] = at(i - 1), [pb, vb] = at(i + 2);
  const h = p1 - p0, u = (p - p0) / h;
  const m0 = (v1 - va) / (p1 - pa) * h, m1 = (vb - v0) / (pb - p0) * h;
  return (2 * u ** 3 - 3 * u * u + 1) * v0 + (u ** 3 - 2 * u * u + u) * m0 + (-2 * u ** 3 + 3 * u * u) * v1 + (u ** 3 - u * u) * m1;
}
const DEG = Math.PI / 180;
const LEAN = .025;   // the body leans forward a little while walking (radians)
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
      // her hair's lines are drawn in its texture, outline included: a 3D outline on top doubled them and showed
      // through as scratches; plain hair needs it
      if (ch.drawn) {
        m.material = ch.hair === HAIRS[0].color ? toonTex(0xFFFFFF, HAIR_TEX) : toonHair(HAIR_TEX, HAIRS[0].color, ch.hair);
        if (m.name.startsWith("HairLong")) outlineSkinned(m, ch.hair, INK);   // (the long hair is seen from above too)
      } else { m.material = toonFlat(ch.hair, .8); outlineSkinned(m, ch.hair, INK); }
      continue;
    }
    if (name === "HoodRim") { m.material = flat(ch.hoodColor); continue; }   // the cloth's edge: one with the hood
    if (m.name.startsWith("Head")) { m.material = toonFlat(SKIN, .3); continue; }   // (always covered: no outline)
    const [color, shade] = pal[name] || [0xFF00FF, .8];
    m.material = toonFlat(color, shade);
    outlineSkinned(m, color, INK);
  }

  // ---------- hair style: the braid and / or the long hair left out
  root.traverse(o => { if ((!ch.braid && o.name.startsWith("Braid")) || (!ch.long && o.name.startsWith("HairLong"))) o.visible = false; });

  // ---------- the hood's animal: the model has the koala's ears and nose; other animals swap in their own (on the ear
  // bones, so they bounce like the koala's), sized and placed from the koala parts, her rest pose = character space
  if (ch.hood !== "koala") {
    root.traverse(o => { if (/^(Ear|EarIn|KoalaNose)/.test(o.name) || (ch.hood === "frog" && o.name.startsWith("KoalaEye"))) o.visible = false; });
    const bone = n => skeleton.getBoneByName(n);
    const PINK = 0xF7B3C8, hood = ch.hoodColor, INK_LINE = inkLine();
    const part = (geo, color, shade, [x, y, z], [sx, sy, sz], rz, parent, lined = true) => {
      const m = new THREE.Mesh(geo, toonFlat(color, shade));
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz;
      if (lined) { outline(m); m.children[0].material = INK_LINE; }   // (the same ink as her other outlines)
      parent.attach(m);
      return m;
    };
    const ball = new THREE.SphereGeometry(1, 32, 16), cone = new THREE.ConeGeometry(1, 1, 32);
    const nose = (color, s) => part(ball, color, .4, [-.02, 3.12, .37], s, 0, bone("head"));
    for (const g of [1, -1]) {
      const ear = bone(g > 0 ? "ear_L" : "ear_R");
      if (ch.hood === "cat") {
        part(cone, hood, .28, [g * .68, 3.32, -.05], [.3, .55, .18], -g * .38, ear);
        part(cone, PINK, .5, [g * .66, 3.27, .05], [.17, .36, .08], -g * .38, ear, false);
      } else if (ch.hood === "bunny") {
        part(ball, hood, .28, [g * .42, 3.75, -.05], [.2, .62, .13], -g * .14, ear);
        part(ball, PINK, .5, [g * .42, 3.72, .05], [.1, .46, .06], -g * .14, ear, false);
      } else if (ch.hood === "bear") {
        part(ball, hood, .28, [g * .82, 3.15, -.05], [.3, .3, .14], 0, ear);
        part(ball, darker(hood, .75), .5, [g * .82, 3.15, .06], [.17, .17, .06], 0, ear, false);
      } else if (ch.hood === "frog") {
        part(ball, hood, .28, [g * .5, 3.3, .02], [.3, .3, .26], 0, bone("head"));
        part(ball, 0xFFFFFF, .3, [g * .5, 3.32, .22], [.2, .2, .1], 0, bone("head"), false);
        part(ball, 0x2A1F2E, .2, [g * .5, 3.32, .3], [.09, .1, .05], 0, bone("head"), false);
      }
    }
    if (ch.hood === "cat") nose(PINK, [.07, .05, .04]);
    else if (ch.hood === "bunny") nose(PINK, [.06, .045, .04]);
    else if (ch.hood === "bear") { part(ball, lighter(hood, .45), .3, [-.02, 3.06, .34], [.24, .16, .07], 0, bone("head")); nose(0x38373B, [.08, .06, .05]); }
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
  // arms are posed by aiming the upper arm and the forearm at directions, with the thumb turned a given way (so both
  // hands sit alike: aiming alone left each hand twisted differently, the arms come from different rest poses - the
  // model's rest pose is the waving reference pose); by default they hang relaxed at her sides
  const wp = b => b.getWorldPosition(new THREE.Vector3());
  const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const FWD = new THREE.Vector3(0, 0, 1);
  const ortho = (v, d) => { const o = v.clone().addScaledVector(d, -v.dot(d)); return o.lengthSq() > 1e-8 ? o.normalize() : new THREE.Vector3(1, 0, 0); };
  const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _x = new THREE.Vector3();
  // rotation taking the frame (direction d0, front f0) onto (d1, f1)
  function frameRot(d0, f0, d1, f1, out) {
    _m0.makeBasis(_x.crossVectors(d0, f0), d0, f0).transpose();
    _m1.makeBasis(new THREE.Vector3().crossVectors(d1, f1), d1, f1);
    return out.setFromRotationMatrix(_m1.multiply(_m0));
  }
  const ARM = {};
  for (const s of ["L", "R"]) {
    const pu = wp(B["upperarm_" + s].b), pf = wp(B["forearm_" + s].b), ph = wp(B["hand_" + s].b), g = s === "L" ? 1 : -1;
    const upper = pf.clone().sub(pu).normalize(), fore = ph.clone().sub(pf).normalize();
    const hand = new THREE.Vector3(0, 1, 0).applyQuaternion(B["hand_" + s].rw);   // (a bone points along its local y)
    // the rest hands are bent at the wrist (waving / held out): each hand gets its own turn, so it continues the forearm
    const rest = { upper, fore, hand, upF: ortho(FWD, upper), foF: ortho(FWD, fore), haF: ortho(FWD, hand) };   // (the thumb is on the hand's front)
    ARM[s] = { rest, cur: { upper: V(g * .18, -1, .04), fore: V(g * .07, -1, .42), thumb: V(-g * .2, 0, 1) } };
  }
  const _qu = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qh = new THREE.Quaternion();
  // feet on the floor: a heel and a toe point under each foot, kept in the foot bone's space. Each frame the body is
  // set so the lowest of them touches the floor - the standing foot stays down and the walk's rise and fall comes
  // from the legs themselves (lifting the whole body, the standing foot hovered and paddled in the air)
  const FEET = ["L", "R"].map(s => {
    const b = B["foot_" + s].b, a = wp(b), inv = b.matrixWorld.clone().invert();
    return { b, pts: [new THREE.Vector3(a.x, .015, a.z - .03), new THREE.Vector3(a.x, .015, a.z + .14)].map(p => p.applyMatrix4(inv)) };   // (the sole is .015 up)
  });
  const _fp = new THREE.Vector3();
  function aimArm(s, goalUpper, goalFore, goalThumb, dt) {
    const a = ARM[s], k = 1 - Math.exp(-dt * 20);
    a.cur.upper.lerp(goalUpper, k).normalize(); a.cur.fore.lerp(goalFore, k).normalize(); a.cur.thumb.lerp(goalThumb, k).normalize();
    const thumb = ortho(a.cur.thumb, a.cur.fore);
    frameRot(a.rest.upper, a.rest.upF, a.cur.upper, ortho(FWD, a.cur.upper), _qu);
    frameRot(a.rest.fore, a.rest.foF, a.cur.fore, thumb, _qf);
    frameRot(a.rest.hand, a.rest.haF, a.cur.fore, thumb, _qh);   // a straight wrist
    _qh.premultiply(_t.copy(_qf).invert());          // each turn on top of its parent's
    _qf.premultiply(_t.copy(_qu).invert());
    B["upperarm_" + s].acc.premultiply(_qu); B["forearm_" + s].acc.premultiply(_qf); B["hand_" + s].acc.premultiply(_qh);
  }
  const lerpV = (a, b, t) => a.clone().lerp(b, t).normalize();

  // ---------- animation state ----------
  let phase = 0, amt = 0, t = 0, prevBob = 0, bobVel = 0, prevYaw = null, yawRateS = 0, turnS = 0, expr = "idle", exprT = 0, blinkT = 2 + Math.random() * 3;
  const sp = { ear: { a: 0, v: 0 }, hair: { a: 0, v: 0 }, hairZ: { a: 0, v: 0 }, braid: { a: 0, v: 0 }, cape: { a: 0, v: 0 }, capeZ: { a: 0, v: 0 }, flare: { a: 0, v: 0 } };
  const setMap = name => { const m = FACES[name]; if (faceMat.map !== m) { faceMat.map = m; faceMat.needsUpdate = true; } };

  return {
    root, character: ch,
    // happy / sad / wow for a while, then back to idle
    setFace(name, sec = 1.6) { expr = name; exprT = sec; },
    // where the walk cycle is, 0..1 (0 = her left heel touches down); for tests
    get phase() { return (phase / (2 * Math.PI)) % 1; },
    // speed 0..1; pose: "walk" (default), "reach" (at a claw machine), "push" (holding the cart)
    animate(dt, speed, pose = "walk") {
      dt = Math.min(dt, .05);
      t += dt;
      amt = THREE.MathUtils.lerp(amt, speed, Math.min(1, dt * 7));
      phase += dt * (5 + 6.9 * amt);                      // ~3.8 steps a second at full speed
      const pL = (phase / (2 * Math.PI)) % 1, pR = (pL + .5) % 1, idle = 1 - amt;
      const TAU = 2 * Math.PI, cw = Math.cos(TAU * pL);
      const yaw = root.rotation.y, yawRaw = prevYaw === null ? 0 : Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw)) / Math.max(dt, 1e-3); prevYaw = yaw;
      yawRateS += (yawRaw - yawRateS) * Math.min(1, dt * 10);   // smoothed: the lean and the hair follow a steady turn
      const yawRate = yawRateS;
      // legs: a real walk cycle - heel strike with the toes up, the knee gives a little as the weight comes on, the
      // leg pushes back and rolls off the toes, then swings through with the knee bent and reaches forward again
      for (const [side, p] of [["L", pL], ["R", pR]]) {
        const hip = cyc(GAIT.hip, p), knee = cyc(GAIT.knee, p);
        rot("thigh_" + side, "x", -hip * DEG * amt);
        rot("shin_" + side, "x", knee * DEG * amt);
        rot("foot_" + side, "x", (hip - knee - cyc(GAIT.foot, p)) * DEG * amt - LEAN * amt);   // (minus the body's lean)
      }
      // body: lowest just after a foot lands, highest over the standing foot, leaning over it (a little chibi waddle);
      // the pelvis turns with the forward leg and the shoulders turn the other way, the head stays facing ahead
      const happy = expr === "happy", sad = expr === "sad";
      const hop = happy ? Math.abs(Math.sin(t * 8.5)) * .22 : 0;
      const bN = (1 - Math.cos(2 * TAU * (pL - .07))) / 2;
      turnS += (THREE.MathUtils.clamp(-yawRate * .012, -.04, .04) * amt - turnS) * Math.min(1, dt * 8);   // eases into turns
      const turn = turnS;
      const roll = -.02 * Math.cos(TAU * (pL - .3)) * amt + turn;   // (a person stays upright: a big rock read as a wobbling toy)
      rot("root", "z", roll); rot("root", "x", LEAN * amt);
      rot("hips", "y", -.07 * cw * amt);   // (about 4 degrees, like a normal walk)
      rot("chest", "y", .18 * cw * amt); rot("chest", "x", .025 * Math.sin(t * 2.3) * idle + (sad ? .05 : 0));
      rot("head", "y", -.08 * cw * amt + THREE.MathUtils.clamp(yawRate * .05, -.3, .3));   // the head leads into a turn
      rot("head", "z", -roll + .04 * Math.sin(t * .9) * idle);
      rot("head", "x", -.04 * amt + .03 * (bN - .5) * amt + (sad ? .08 : 0) + .02 * Math.sin(t * 1.7) * idle);
      // the free side of the pelvis dips a little (the body leans over the standing foot above); the thighs keep
      // their own line, so the feet stay under the hips instead of swinging sideways with the pelvis
      const drop = .025 * Math.cos(TAU * (pL - .3)) * amt;
      rot("hips", "z", drop); rot("thigh_L", "z", -drop); rot("thigh_R", "z", -drop);
      B.root.b.position.copy(B.root.p0);
      // arms
      for (const side of ["L", "R"]) {
        const g = side === "L" ? 1 : -1;
        let up, fo, th;
        if (happy) {                                  // "yay!": fists up in front
          // (the upper arms stay down under the capelet - raised, the sleeves came out of it in broken pieces - and the
          // elbows bend only a little past square: folded up further, the forearms cut through the sleeves)
          const w = Math.sin(t * 14 + (g > 0 ? 0 : 1.5)) * .25;
          up = V(g * .3, -1, .12); fo = V(g * (.12 + w * .3), .45, 1); th = V(-g, 0, .3);
        } else if (pose === "reach") {               // hands forward on the machine, palms down, thumbs in
          up = V(g * .15, .3 + .05 * Math.sin(t * 3 + g), 1); fo = V(0, .35, 1); th = V(-g, .2, 0);
        } else if (pose === "push") {                // gripping the cart handle
          up = V(g * .2, -.35, 1); fo = V(g * .02, -.15, 1); th = V(-g, .2, 0);
        } else {
          // standing: relaxed, the arms a little away from the body, elbows softly bent, palms to the thighs, thumbs
          // forward, a slow breathing sway. Walking: each arm swings from the shoulder with the opposite leg (about
          // 40 degrees, more than the 20-25 of an adult walk for her short arms), the elbow bending more on the way
          // forward and peaking a beat after the shoulder, the hand drifting in a little at the front of the swing
          const pa = (side === "L" ? pL : pR) - .54, breathe = .025 * Math.sin(t * 1.9 + g) * idle;
          const al = (4 + 20 * Math.cos(TAU * pa)) * DEG, el = (16 + 24 * (.5 + .5 * Math.cos(TAU * (pa - .08)))) * DEG;
          const fwd = Math.max(0, Math.cos(TAU * pa));
          const walkUp = V(g * (.2 - .05 * fwd), -Math.cos(al), Math.sin(al)), walkFo = V(g * (.08 - .07 * fwd), -Math.cos(al + el), Math.sin(al + el));
          const standUp = sad ? V(g * .1, -1, .0) : V(g * (.18 + breathe), -1, .04), standFo = sad ? V(g * .04, -1, .16) : V(g * .07, -1, .42);
          up = lerpV(standUp, walkUp, amt); fo = lerpV(standFo, walkFo, amt); th = V(-g * .2, 0, 1);
        }
        aimArm(side, up, fo, th, dt);
      }
      // springs: hair, braid, ears and cape lag behind bounces, flow back while walking, swing on turns
      const vy = bobVel;   // (from the last frame's floor contact)
      const ear = spring(sp.ear, 0, dt, 90, 6, -vy * .9 * dt);
      both("ear", "x", ear * .4 - .03 * amt);
      const hair = spring(sp.hair, .12 * amt, dt, 60, 6, -vy * .3 * dt);
      const hairZ = spring(sp.hairZ, THREE.MathUtils.clamp(-yawRate * .04, -.2, .2) - roll * .5, dt, 34, 4);
      rot("hair_L1", "x", hair * .7); rot("hair_R1", "x", hair * .7); rot("hair_L2", "x", hair * .5); rot("hair_R2", "x", hair * .5);
      rot("hair_L1", "z", hairZ); rot("hair_R1", "z", hairZ);
      const braid = spring(sp.braid, -roll * .6, dt, 40, 4, -vy * .6 * dt);   // (all the follow-through springs lag the waddle)
      rot("braid1", "z", braid); rot("braid2", "z", braid * 1.4); rot("braid1", "x", -Math.abs(braid) * .5);
      const cape = spring(sp.cape, .16 * amt, dt, 45, 5, -vy * .2 * dt);
      const capeZ = spring(sp.capeZ, THREE.MathUtils.clamp(-yawRate * .04, -.2, .2) - roll * .7, dt, 26, 3.6);   // the hem swings after the body
      const flare = spring(sp.flare, 0, dt, 75, 6, Math.max(0, -vy) * .15 * dt);
      // the cloak's hem swings a beat behind the weight shift (cloth follows the body), and each side is pushed a little
      // forward by the knee under it
      const hem = -.05 * Math.cos(TAU * (pL - .3) - 1.1) * amt;
      rot("cape_B", "x", cape + flare * .4); rot("cape_B", "z", capeZ + hem);
      rot("cape_L", "x", cape * .6 - .07 * Math.sin(TAU * pL) * amt); rot("cape_L", "z", (capeZ + hem) * .6 + flare * .3);
      rot("cape_R", "x", cape * .6 - .07 * Math.sin(TAU * pR) * amt); rot("cape_R", "z", (capeZ + hem) * .6 - flare * .3);
      // face: expression timer and blinking
      if (exprT > 0) { exprT -= dt; if (exprT <= 0) expr = "idle"; }
      blinkT -= dt;
      const blinking = blinkT < 0 && blinkT > -.13;
      if (blinkT < -.13) blinkT = 2 + Math.random() * 3.5;
      setMap(expr !== "idle" ? expr : blinking ? "blink" : "idle");
      apply();
      // the lowest heel or toe on the floor, then the happy hop on top
      model.updateMatrixWorld(true);
      const floor = root.matrixWorld.elements[13];
      let low = Infinity;
      for (const f of FEET) for (const q of f.pts) low = Math.min(low, _fp.copy(q).applyMatrix4(f.b.matrixWorld).y - floor);
      const bob = -low + hop;
      B.root.b.position.y += bob;
      bobVel = (bob - prevBob) / dt; prevBob = bob;
    },
  };
}
