// Claw machine model (duck / shiba / seal / alpaca variants), local origin = floor centre, front = +z.
import * as THREE from "three";
import { C, INKS, toon, flat, mesh, blob, dot, rbox, tube, stick, canvasTex, label, plane, heartPath, bake, dithered, glassMat, shineMat, acrylMat } from "./gfx.js";

export const W = 5, D = 4.2, FLOOR = 2.4, GTOP = 6.4, IX = 2.28, IZ = 1.9;
export const CHUTE = { x0: -IX, x1: -1.05, z0: .65, z1: IZ, h: 1.5 };
export const CLAW_TOP = GTOP - .95;

export const MACHINE_BY_ID = {};
export const MACHINES = [
  { id: "duck", name: "Quack Catch", frame: C.pink2, band: C.pink1, sign: C.pink5, ging: ["#F1F8FC", "rgba(170,210,232,.5)"], topper: "duck" },
  { id: "shiba", name: "Shiba Scoop", frame: C.lav, band: 0xF1E6FB, sign: 0xB28DE0, ging: ["#FFF6FA", "rgba(255,190,214,.45)"], topper: "shiba" },
  { id: "seal", name: "Seal Splash", frame: C.blue2, band: 0xE6F3FA, sign: 0x7FBCE0, ging: ["#F1F8FC", "rgba(150,200,230,.45)"], topper: "seal" },
  { id: "alpaca", name: "Alpaca Pick", frame: C.mint2, band: 0xE5F7EE, sign: 0x6CCBA3, ging: ["#F3FBF7", "rgba(150,220,190,.45)"], topper: "alpaca" },
];
for (const m of MACHINES) MACHINE_BY_ID[m.id] = m;

const HA = 2.75, HB = 2.45, HC = 2.35;
let HEART = null, LCD = null, ARROW = null;
const gingCache = {};
const gingTex = (cols, rx, ry) => gingCache[cols + rx + ry] || (gingCache[cols + rx + ry] = canvasTex(64, 64, g => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, 64, 64);
  g.fillStyle = cols[1]; g.fillRect(0, 0, 32, 64); g.fillRect(0, 0, 64, 32);
}, [rx, ry]));

function headBase(color) {
  const head = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(1, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2), toon(color));
  dome.scale.set(HA, HB, HC); head.add(dome);
  const chin = new THREE.Mesh(new THREE.CircleGeometry(1, 56), toon(color));
  chin.rotation.x = Math.PI / 2; chin.scale.set(HA, HC, 1); head.add(chin);
  return head;
}
function eyes(head, x = .95, y = 1.25, blushY = .72) {
  for (const s of [-1, 1]) {
    head.add(stick(dot(C.ink, .19, .25, .08), HA, HB, HC, x * s, y, .01));
    head.add(stick(dot(C.white, .065, .065, .03), HA, HB, HC, x * s + .06, y + .09, .075));
    head.add(stick(dot(C.blush, .44, .25, .05), HA, HB, HC, 1.75 * s, blushY, .01));
  }
}
const TOPPERS = {
  duck() {
    const h = headBase(C.white); eyes(h);
    h.add(stick(blob(C.orange, .62, .3, .36), HA, HB, HC, 0, .8, .12));
    h.add(tube([[-.08, 2.4, 0], [-.3, 2.95, .05], [.02, 3.2, .08], [.18, 2.95, .05]], .07, flat(C.ink), false));
    h.add(tube([[.15, 2.42, 0], [.42, 2.85, 0], [.72, 2.9, .03], [.78, 2.68, .03]], .07, flat(C.ink), false));
    return h;
  },
  shiba() {
    const fur = 0xF7B267, h = headBase(fur);
    h.add(stick(blob(0xFFF3E0, 1.55, .95, .3), HA, HB, HC, 0, .5, -.2));
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(.75, 1.4, 24), toon(fur), 1.5 * s, 2.45, .1); ear.rotation.z = -.42 * s; h.add(ear);
      const inner = mesh(new THREE.ConeGeometry(.4, .8, 16), toon(C.pink3), 1.5 * s, 2.35, .52, false); inner.rotation.z = -.42 * s; h.add(inner);
    }
    eyes(h, .95, 1.3);
    h.add(stick(dot(C.ink, .28, .2, .14), HA, HB, HC, 0, .85, .32));
    return h;
  },
  seal() {
    const h = headBase(0xEEF1F8); eyes(h, 1.0, 1.35, .8);
    h.add(stick(blob(C.white, .8, .52, .32), HA, HB, HC, 0, .72, 0));
    h.add(stick(dot(C.ink, .22, .16, .12), HA, HB, HC, 0, .98, .3));
    for (const s of [-1, 1]) for (const [x, y] of [[.36, .7], [.52, .62], [.34, .52]]) h.add(stick(dot(C.ink, .05, .05, .04), HA, HB, HC, x * s, y, .3));
    return h;
  },
  alpaca() {
    const fur = 0xFFF4E2, h = headBase(fur); eyes(h, .95, 1.2);
    for (const [x, y, z, r] of [[0, 2.35, .35, .8], [-.75, 2.15, .25, .62], [.75, 2.15, .25, .62], [-.3, 2.05, 1.05, .5], [.35, 2.08, 1.0, .5]]) h.add(blob(C.white, r, r, r, x, y, z));
    for (const s of [-1, 1]) { const ear = blob(fur, .3, .8, .24, 1.75 * s, 2.35, -.35); ear.rotation.z = -.35 * s; h.add(ear); }
    h.add(stick(blob(C.white, .8, .55, .34), HA, HB, HC, 0, .62, 0));
    for (const s of [-1, 1]) h.add(stick(dot(C.ink, .07, .09, .04), HA, HB, HC, .18 * s, .8, .32));
    return h;
  },
};


// The machines' topper heads (machines already placed), baked into one group in which each head can dissolve on its
// own. The heads stand at the camera's height: the camera went into them, or right up against one, walking by the
// machines. A head fades out when the camera is at it or it's across the line of sight to the kid - all the way
// (half-faded heads held still showed as a dotted ghost) - quickly, and comes back only a bit past where it went
const T_AX = new THREE.Vector3(HA + .3, HB + .8, HC + .3);   // round a head, ears and tufts included
export function bakeToppers(machines) {
  const all = new THREE.Group(), inv = [];
  machines.forEach((m, i) => {
    m.topper.updateMatrixWorld(true);
    inv.push(m.topper.matrixWorld.clone().invert());
    m.topper.traverse(o => { o.userData.topper = i; });
    all.attach(m.topper);
  });
  const fade = { value: new Float32Array(machines.length).fill(1) }, gone = machines.map(() => false);
  const group = bake(all, o => o.userData.topper);
  group.traverse(o => { if (o.isMesh) o.material = dithered(o.material, fade); });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  return {
    group,
    // cam / target: world positions; on: fading allowed (walking), else the heads come back
    update(cam, target, dt, on) {
      for (let i = 0; i < inv.length; i++) {
        const m = gone[i] ? 1.12 : 1;                      // (hysteresis: no flicker on the edge)
        let out = false;
        if (on) {
          a.copy(cam).applyMatrix4(inv[i]).divide(T_AX); b.copy(target).applyMatrix4(inv[i]).divide(T_AX);
          out = a.length() < 2.3 * m;
          for (let k = 1; k < 12 && !out; k++) {
            p.lerpVectors(a, b, k / 12);
            out = p.y > -.2 && p.length() < 1.1 * m;
          }
        }
        gone[i] = out;
        fade.value[i] += ((out ? 0 : 1) - fade.value[i]) * Math.min(1, dt * (out ? 12 : 5));
      }
    },
  };
}
export function makeMachine(cfg) {
  const st = new THREE.Group();            // static parts, baked later
  const add = (...m) => st.add(...m);
  for (const s of [-1, 1]) add(blob(C.orange, .95, .26, .75, 1.25 * s, .1, 1.75));
  add(rbox(W + .1, .75, D + .1, .22, cfg.band, 0, .375, 0));
  add(rbox(W, 1.85, D, .26, C.white, 0, 1.52, 0));
  for (const s of [-1, 1]) { const w = blob(C.white, .14, .5, .72, s * 2.5, 1.5, -.2); w.rotation.set(.35, 0, s * .2); add(w); }
  add(rbox(1.5, .8, .14, .08, C.white, -1.3, 1.3, D / 2 + .02), rbox(1.12, .42, .1, .08, C.pink3, -1.3, 1.3, D / 2 + .1));
  add(plane(label("PRIZE", 256, 96, 58), .88, .33, -1.3, 1.3, D / 2 + .16));
  add(rbox(.95, .8, .14, .08, C.white, 1.45, 1.3, D / 2 + .02), rbox(.1, .44, .06, .03, flat(C.ink), 1.66, 1.3, D / 2 + .1));
  add(blob(C.gold, .16, .16, .04, 1.27, 1.3, D / 2 + .12));
  const heartTex = HEART || (HEART = canvasTex(256, 256, g => {
    heartPath(g, 128, 136, 78); g.fillStyle = "#F48FB8"; g.fill(); g.lineWidth = 16; g.strokeStyle = INKS; g.stroke();
    g.beginPath(); g.ellipse(92, 104, 16, 10, -.6, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,.8)"; g.fill();
  }));
  add(plane(heartTex, .5, .5, .08, 1.3, D / 2 + .005));
  add(plane(heartTex, 1.3, 1.3, 0, 1.5, -D / 2 - .005, Math.PI));

  // control panel (joystick + GRAB are separate so they can move)
  add(rbox(W - .3, .42, 1.05, .18, cfg.frame, 0, FLOOR + .1, D / 2 + .55));
  const lcd = LCD || (LCD = canvasTex(256, 128, g => {
    g.fillStyle = INKS; g.beginPath(); g.roundRect(0, 0, 256, 128, 28); g.fill();
    g.font = "600 58px Fredoka"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#FFD4E5";
    g.fillText("READY!", 128, 68);
  }));
  add(rbox(1.08, .6, .12, .06, C.pink3, -1.5, FLOOR + .52, D / 2 + .38));
  add(plane(lcd, .92, .46, -1.5, FLOOR + .52, D / 2 + .45));
  add(blob(C.lav, .3, .05, .3, -.15, FLOOR + .31, D / 2 + .6));
  add(blob(C.white, .5, .07, .5, 1.45, FLOOR + .31, D / 2 + .58));

  // glass box
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(rbox(.34, GTOP - FLOOR, .34, .12, cfg.frame, sx * (W / 2 - .12), (FLOOR + GTOP) / 2, sz * (D / 2 - .12)));
  add(rbox(W - .2, .16, .2, .06, cfg.frame, 0, FLOOR + .08, D / 2 - .06));
  const inFloor = new THREE.Mesh(new THREE.PlaneGeometry(W - .3, D - .3), toon(C.white, { map: gingTex(cfg.ging, 7, 6) }));
  inFloor.rotation.x = -Math.PI / 2; inFloor.position.y = FLOOR + .005; inFloor.receiveShadow = true; add(inFloor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W - .3, GTOP - FLOOR), toon(C.white, { map: gingTex(cfg.ging, 7, 6) }));
  back.position.set(0, (FLOOR + GTOP) / 2, -D / 2 + .15); back.receiveShadow = true; add(back);
  add(rbox(W - .1, GTOP - FLOOR, .12, .05, C.white, 0, (FLOOR + GTOP) / 2, -D / 2 + .06));
  add(plane(label(cfg.name.toUpperCase(), 1024, 170, 104, "#" + cfg.sign.toString(16).padStart(6, "0")), 4.3, .72, 0, (FLOOR + GTOP) / 2 + .2, -D / 2 - .005, Math.PI));
  for (const s of [-1, 1]) add(rbox(.12, .12, D - .5, .04, C.lav, s * 2.18, GTOP - .22, 0));

  // chute
  const cR = new THREE.Mesh(new THREE.PlaneGeometry(CHUTE.z1 - CHUTE.z0, CHUTE.h), acrylMat);
  cR.position.set(CHUTE.x1, FLOOR + CHUTE.h / 2, (CHUTE.z0 + CHUTE.z1) / 2); cR.rotation.y = Math.PI / 2;
  const cB = new THREE.Mesh(new THREE.PlaneGeometry(CHUTE.x1 - CHUTE.x0, CHUTE.h), acrylMat);
  cB.position.set((CHUTE.x0 + CHUTE.x1) / 2, FLOOR + CHUTE.h / 2, CHUTE.z0);
  add(cR, cB);
  add(rbox(.1, .1, CHUTE.z1 - CHUTE.z0, .04, C.pink3, CHUTE.x1, FLOOR + CHUTE.h, (CHUTE.z0 + CHUTE.z1) / 2));
  add(rbox(CHUTE.x1 - CHUTE.x0, .1, .1, .04, C.pink3, (CHUTE.x0 + CHUTE.x1) / 2, FLOOR + CHUTE.h, CHUTE.z0));
  add(rbox(.1, CHUTE.h, .1, .04, C.pink3, CHUTE.x1, FLOOR + CHUTE.h / 2, CHUTE.z0));
  const arrow = ARROW || (ARROW = canvasTex(128, 128, g => {
    g.beginPath(); g.moveTo(34, 40); g.lineTo(94, 40); g.lineTo(64, 92); g.closePath();
    g.fillStyle = "#F48FB8"; g.lineWidth = 12; g.lineJoin = "round"; g.strokeStyle = INKS; g.stroke(); g.fill();
  }));
  add(plane(arrow, .5, .5, CHUTE.x1 + .01, FLOOR + CHUTE.h * .62, (CHUTE.z0 + CHUTE.z1) / 2, Math.PI / 2));
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(CHUTE.x1 - CHUTE.x0 - .05, CHUTE.z1 - CHUTE.z0 - .05), flat(C.hole));
  hole.rotation.x = -Math.PI / 2; hole.position.set((CHUTE.x0 + CHUTE.x1) / 2, FLOOR + .012, (CHUTE.z0 + CHUTE.z1) / 2); add(hole);

  // sign band + topper head
  add(rbox(W + .2, .62, D + .2, .2, cfg.sign, 0, GTOP + .31, 0));
  add(plane(label(cfg.name.toUpperCase(), 1024, 170, 116), 4.3, .72, 0, GTOP + .31, (D + .2) / 2 + .01));
  const topper = TOPPERS[cfg.topper](); topper.position.y = GTOP + .62;   // baked with the others (bakeToppers)

  const root = new THREE.Group();
  const body = bake(st);
  root.add(body, topper);

  // glass (transparent, drawn last)
  const gF = new THREE.Mesh(new THREE.PlaneGeometry(W - .4, GTOP - FLOOR), glassMat); gF.position.set(0, (FLOOR + GTOP) / 2, D / 2 - .1);
  const gL = new THREE.Mesh(new THREE.PlaneGeometry(D - .4, GTOP - FLOOR), glassMat); gL.position.set(-W / 2 + .1, (FLOOR + GTOP) / 2, 0); gL.rotation.y = Math.PI / 2;
  const gR = gL.clone(); gR.position.x = W / 2 - .1;
  body.add(gF, gL, gR);
  for (const [x, y, w, h] of [[-1.55, 5.35, .22, 2.1], [-1.1, 5.2, .1, 1.5]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), shineMat); s.position.set(x, y, D / 2 - .08); s.rotation.z = -.55; body.add(s);
  }

  // moving parts
  const stickPivot = new THREE.Group(); stickPivot.position.set(-.15, FLOOR + .33, D / 2 + .6);
  stickPivot.add(mesh(new THREE.CylinderGeometry(.06, .06, .42, 16), toon(C.lav2), 0, .2, 0), blob(C.pink5, .21, .21, .21, 0, .44, 0));
  const grabBtn = blob(C.pink5, .4, .15, .4, 1.45, FLOOR + .38, D / 2 + .58);
  const cross = rbox(4.5, .12, .22, .05, C.lav, 0, GTOP - .3, 0);
  const trolley = rbox(.5, .26, .42, .08, C.lav, 0, GTOP - .45, 0);
  const cable = mesh(new THREE.CylinderGeometry(.035, .035, 1, 10), toon(C.lav2), 0, 0, 0);
  for (const o of [stickPivot, grabBtn, cross, trolley, cable]) o.traverse(c => { if (c.isMesh) c.castShadow = false; });
  root.add(stickPivot, grabBtn, cross, trolley, cable);
  const parts = [stickPivot, grabBtn, cross, trolley, cable];

  const api = {
    root, body, topper, parts, cfg, stickPivot, grabBtn,
    // trolley over (tx, tz); cable runs from the trolley down to the swinging claw head (local coords)
    setRig(tx, tz, hx, hy, hz) {
      cross.position.z = tz;
      trolley.position.set(tx, GTOP - .45, tz);
      const a = new THREE.Vector3(tx, GTOP - .58, tz), b = new THREE.Vector3(hx, hy + .3, hz), d = a.clone().sub(b), len = Math.max(.05, d.length());
      cable.scale.set(1, len, 1); cable.position.copy(a).add(b).multiplyScalar(.5);
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    },
    tiltStick(dx, dz) { stickPivot.rotation.set(dz * .45, 0, -dx * .45); },
    pressGrab(p) { grabBtn.scale.y = .15 * (1 - .5 * p); grabBtn.position.y = FLOOR + .38 - .06 * p; },
  };
  return api;
}
