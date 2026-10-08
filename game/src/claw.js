// Claw machine gameplay on Rapier with a physical claw: a swaying head and 3 hinged prongs driven by
// force-limited motors, so a plush is held only as well as the prongs actually cradle it.
// Works in machine-local coordinates; the machine can sit anywhere with any yaw.
import * as THREE from "three";
import { makePlush, ACCS, DA, DB, DC } from "./plush.js";
import { FLOOR, GTOP, IX, IZ, CHUTE, CLAW_TOP, D } from "./machine.js";
import { C, toon, blob, mesh, tube } from "./gfx.js";

export const G_MACH = (0x0004 << 16) | 0x0018;
export const G_PLUSH = (0x0008 << 16) | 0x001C;
export const G_CLAW = (0x0010 << 16) | 0x000C;
export const HOME = { x: (CHUTE.x0 + CHUTE.x1) / 2, z: (CHUTE.z0 + CHUTE.z1) / 2 };
const LIM = { x0: -IX + .62, x1: IX - .62, z0: -IZ + .62, z1: IZ - .62 };
export const AIM_TIME = 20;
const SPEED = 2.4, ACCEL = 7, DROP = 2.1, LIFT = 1.4, PILE = 18, GRAV = 40;
const HINGE_R = .15, HINGE_Y = -.14, SINK = .06;
const PRONG = [[0, 0], [.26, -.2], [.36, -.56], [.26, -.88], [.1, -.98]];
const OPEN = .62, SHUT = -.16, REST = .25;
const Q = new URLSearchParams(location.search);
export const GRIP = +(Q.get("grip") || 5.5);      // motor torque limit while holding = claw strength

const HULL = (() => {
  const g = new THREE.SphereGeometry(1, 10, 8), p = g.attributes.position, out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { out[i * 3] = p.getX(i) * DA; out[i * 3 + 1] = p.getY(i) * DB; out[i * 3 + 2] = p.getZ(i) * DC; }
  return out;
})();
const Y = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _d = new THREE.Vector3();

function prongMesh(rad) {
  const g = new THREE.Group();
  g.add(tube(PRONG.map(([x, y]) => [rad.x * x, y, rad.z * x]), .06, toon(C.lav2)));
  const [tx, ty] = PRONG.at(-1);
  g.add(blob(C.pink3, .082, .082, .082, rad.x * tx, ty, rad.z * tx));
  return g;
}

export class ClawGame {
  constructor(R, world, scene, machine, place, species, rnd) {
    Object.assign(this, { R, world, scene, m: machine, species, rnd });
    this.o = { x: place.x, z: place.z };
    this.cy = Math.cos(place.yaw); this.sy = Math.sin(place.yaw);
    this.yq = new THREE.Quaternion().setFromAxisAngle(Y, place.yaw);
    this.rq = { x: this.yq.x, y: this.yq.y, z: this.yq.z, w: this.yq.w };
    this.plush = []; this.pops = [];
    this.state = "idle"; this.t = 0; this.timer = 0;
    this.pos = new THREE.Vector3(HOME.x, CLAW_TOP, HOME.z);
    this.vel = { x: 0, z: 0 }; this.sway = { x: 0, z: 0, vx: 0, vz: 0 }; this.prev = { x: 0, z: 0 };
    this.target = null; this.held = null; this.angle = REST;
    this.stats = { grabbed: false, slipped: false };
    this.active = false; this.motor = 0; this.winch = 0;
    this.grip = 1; this.rareBoost = 1;   // (machine variants: claw strength, how often uncommon / rare friends turn up)
    this.on = () => {};
    this.colliders();
    this.buildClaw();
  }
  toW(x, y, z) { return { x: this.o.x + x * this.cy + z * this.sy, y, z: this.o.z - x * this.sy + z * this.cy }; }
  toL(wx, wz) { const dx = wx - this.o.x, dz = wz - this.o.z; return { x: dx * this.cy - dz * this.sy, z: dx * this.sy + dz * this.cy }; }
  dirL(wx, wz) { return { x: wx * this.cy - wz * this.sy, z: wx * this.sy + wz * this.cy }; }

  colliders() {
    const { R, world } = this;
    const box = (hx, hy, hz, x, y, z) => { const p = this.toW(x, y, z); world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, p.y, p.z).setRotation(this.rq).setFriction(.7).setCollisionGroups(G_MACH)); };
    const m = .3, cx = CHUTE.x1;
    box((IX + m - cx) / 2, .2, IZ + m, (cx + IX + m) / 2, FLOOR - .2, 0);
    box((cx + IX + m) / 2, .2, (CHUTE.z0 + IZ + m) / 2, (cx - IX - m) / 2, FLOOR - .2, (CHUTE.z0 - IZ - m) / 2);
    for (const s of [-1, 1]) {
      box(.2, 7, IZ + .4, s * (IX + .2), FLOOR + 5, 0);
      box(IX + .4, 7, .2, 0, FLOOR + 5, s * (IZ + .2));
    }
    box(IX + .4, .2, IZ + .4, 0, GTOP + .2, 0);
    const hz = (CHUTE.z1 - CHUTE.z0) / 2, hx = (CHUTE.x1 - CHUTE.x0) / 2, top = FLOOR + CHUTE.h, bot = FLOOR - 2;
    box(.04, (top - bot) / 2, hz, CHUTE.x1, (top + bot) / 2, CHUTE.z0 + hz);
    box(hx, (top - bot) / 2, .04, CHUTE.x0 + hx, (top + bot) / 2, CHUTE.z0);
    box(hx + .3, .1, hz + .3, CHUTE.x0 + hx, bot, CHUTE.z0 + hz);
  }

  buildClaw() {
    const { R, world } = this;
    const h = this.toW(this.pos.x, this.pos.y, this.pos.z);
    this.head = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(h.x, h.y, h.z).setRotation(this.rq));
    world.createCollider(R.ColliderDesc.ball(.25).setCollisionGroups(G_CLAW).setFriction(.6), this.head);
    world.createCollider(R.ColliderDesc.cylinder(.1, .15).setTranslation(0, .24, 0).setCollisionGroups(G_CLAW), this.head);
    this.headMesh = new THREE.Group();
    this.headMesh.add(blob(C.pink3, .3, .24, .3), mesh(new THREE.CylinderGeometry(.13, .16, .16, 24), toon(C.lav2), 0, .25, 0));
    this.scene.add(this.headMesh);
    this.prongs = [];
    for (let i = 0; i < 3; i++) {
      const th = i / 3 * Math.PI * 2 + Math.PI / 2;
      const rad = new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), tan = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
      const hinge = rad.clone().multiplyScalar(HINGE_R).setY(HINGE_Y);
      const hw = hinge.clone().applyQuaternion(this.yq).add(_v.set(h.x, h.y, h.z));
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(hw.x, hw.y, hw.z).setRotation(this.rq)
        .setAngularDamping(2).setLinearDamping(.5).setCanSleep(true));
      const cols = [];
      for (let k = 0; k < PRONG.length - 1; k++) {
        const a = new THREE.Vector3(rad.x * PRONG[k][0], PRONG[k][1], rad.z * PRONG[k][0]);
        const b = new THREE.Vector3(rad.x * PRONG[k + 1][0], PRONG[k + 1][1], rad.z * PRONG[k + 1][0]);
        const mid = a.clone().add(b).multiplyScalar(.5), dir = b.clone().sub(a), len = dir.length();
        const q = new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize());
        cols.push(world.createCollider(R.ColliderDesc.capsule(len / 2, .055).setTranslation(mid.x, mid.y, mid.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setMass(.07).setFriction(1.1).setCollisionGroups(G_CLAW), body));
      }
      const [tx, ty] = PRONG.at(-1);
      cols.push(world.createCollider(R.ColliderDesc.ball(.08).setTranslation(rad.x * tx, ty, rad.z * tx).setMass(.05).setFriction(1.2).setCollisionGroups(G_CLAW), body));
      const joint = world.createImpulseJoint(R.JointData.revolute({ x: hinge.x, y: hinge.y, z: hinge.z }, { x: 0, y: 0, z: 0 }, { x: tan.x, y: tan.y, z: tan.z }), this.head, body, true);
      joint.setContactsEnabled(false);
      joint.setLimits(SHUT - .12, OPEN + .18);
      joint.configureMotorModel(R.MotorModel.ForceBased);
      const vis = prongMesh(rad); this.scene.add(vis);
      this.prongs.push({ body, joint, cols, vis, tip: new THREE.Vector3(rad.x * tx, ty, rad.z * tx) });
    }
    this.setMotor(REST, 30);
  }
  setMotor(angle, force) {
    this.angle = angle;
    for (const p of this.prongs) { p.joint.configureMotorPosition(angle, 400, 30); p.joint.setMotorMaxForce(force); p.body.wakeUp(); }
  }
  // while letting go, the prongs stop touching plush so a wedged prize can't jam them
  prongsHitPlush(on) {
    const g = on ? G_CLAW : (0x0010 << 16) | 0x0004;
    for (const p of this.prongs) for (const c of p.cols) c.setCollisionGroups(g);
  }
  prongAngles() {
    const hr = this.head.rotation(), hq = new THREE.Quaternion(hr.x, hr.y, hr.z, hr.w).invert();
    return this.prongs.map((p, i) => {
      const r = p.body.rotation(), rel = hq.clone().multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
      const th = i / 3 * Math.PI * 2 + Math.PI / 2, ax = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
      return +(2 * Math.atan2(rel.x * ax.x + rel.y * ax.y + rel.z * ax.z, rel.w)).toFixed(2);
    });
  }
  tipWorld(p) {
    const t = p.body.translation(), r = p.body.rotation();
    return _v.copy(p.tip).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_d.set(t.x, t.y, t.z)).clone();
  }

  // ---------- plush ----------
  pickAcc() {
    const w = d => d.weight * (d.tier === "common" ? 1 : this.rareBoost);
    let r = this.rnd() * ACCS.reduce((a, d) => a + w(d), 0);
    for (const d of ACCS) if ((r -= w(d)) < 0) return d.id;
    return "plain";
  }
  spawn(acc, x, y, z) {
    const { R, world } = this;
    const e = new THREE.Euler((this.rnd() - .5) * 3, this.rnd() * Math.PI * 2, (this.rnd() - .5) * 3);
    const q = this.yq.clone().multiply(new THREE.Quaternion().setFromEuler(e)), p = this.toW(x, y, z);
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(.15).setAngularDamping(.9).setCcdEnabled(true));
    const col = (desc, dens = 1.4) => world.createCollider(desc.setDensity(dens).setFriction(.9).setRestitution(0).setCollisionGroups(G_PLUSH), body);
    col(R.ColliderDesc.convexHull(HULL));
    if (acc === "straw") col(R.ColliderDesc.cylinder(.02, .46).setTranslation(0, .4, 0), .3);
    if (acc === "crown") col(R.ColliderDesc.cylinder(.07, .19).setTranslation(0, .54, 0), 3);
    if (acc === "sailor") col(R.ColliderDesc.cylinder(.07, .2).setTranslation(0, .48, 0), .5);
    if (acc === "frog") for (const s of [-1, 1]) col(R.ColliderDesc.ball(.1).setTranslation(.19 * s, .45, .08), .5);
    if (this.species === "alpaca") col(R.ColliderDesc.ball(.15).setTranslation(0, .44, .06), .5);
    const root = new THREE.Group(), axis = new THREE.Group(), scaler = new THREE.Group(), inner = new THREE.Group();
    root.add(axis); axis.add(scaler); scaler.add(inner); inner.add(makePlush(this.species, acc));
    root.visible = this.active;
    this.scene.add(root);
    const pl = { acc, body, root, axis, scaler, inner, sq: 0, sqv: 0, pv: new THREE.Vector3(), held: false };
    this.plush.push(pl);
    this.sync(pl, 0);
    return pl;
  }
  fill() {
    const cells = [];
    for (const z of [-1.2, 0, 1.2]) for (const x of [-1.62, -.54, .54, 1.62]) if (!(x < CHUTE.x1 && z > CHUTE.z0 - .3)) cells.push([x, z]);
    const accs = ["crown"];
    while (accs.length < PILE) accs.push(this.pickAcc());
    const front = cells.findIndex(([x, z]) => x > 1 && z > 1);
    cells.unshift(cells.splice(front, 1)[0]);
    accs.forEach((a, i) => {
      const [x, z] = cells[i % cells.length];
      this.spawn(a, x + (this.rnd() - .5) * .3, FLOOR + .7 + Math.floor(i / cells.length) * 1.15, z + (this.rnd() - .5) * .3);
    });
  }
  sync(p, dt) {
    const t = p.body.translation(), r = p.body.rotation();
    p.root.position.set(t.x, t.y, t.z);
    p.root.quaternion.set(r.x, r.y, r.z, r.w);
    if (!dt) return;
    // soft-toy squash: impacts flatten it along the hit direction, prongs squeeze it taller
    const lv = p.body.linvel();
    _d.set(lv.x - p.pv.x, lv.y - p.pv.y, lv.z - p.pv.z);
    p.pv.set(lv.x, lv.y, lv.z);
    const hit = _d.length();
    _q.set(r.x, r.y, r.z, r.w).invert();
    if (p.held) {
      p.axis.quaternion.setFromUnitVectors(Y, _v.copy(Y).applyQuaternion(_q));
      p.inner.quaternion.copy(p.axis.quaternion).invert();
    } else if (hit > 3) {
      p.axis.quaternion.setFromUnitVectors(Y, _v.copy(_d).normalize().applyQuaternion(_q));
      p.inner.quaternion.copy(p.axis.quaternion).invert();
      p.sq = Math.max(p.sq, Math.min(.24, hit * .016)); p.sqv = 0;
      if (hit > 6) this.on("thud", Math.min(1, hit / 16));
    }
    p.sqv += (-260 * (p.sq - (p.held ? -.07 : 0)) - 13 * p.sqv) * dt;
    p.sq += p.sqv * dt;
    p.scaler.scale.set(1 + p.sq * .5, 1 - p.sq, 1 + p.sq * .5);
  }
  remove(p) {
    this.world.removeRigidBody(p.body);
    p.root.removeFromParent();
    this.plush.splice(this.plush.indexOf(p), 1);
  }

  // ---------- live vs idle (idle machines are drawn by a merged per-row mesh) ----------
  syncClaw() {
    const t = this.head.translation(), r = this.head.rotation();
    this.headMesh.position.set(t.x, t.y, t.z); this.headMesh.quaternion.set(r.x, r.y, r.z, r.w);
    for (const p of this.prongs) {
      const pt = p.body.translation(), pr = p.body.rotation();
      p.vis.position.set(pt.x, pt.y, pt.z); p.vis.quaternion.set(pr.x, pr.y, pr.z, pr.w);
    }
    const tl = this.toL(t.x, t.z);
    this.m.setRig(this.pos.x, this.pos.z, tl.x, t.y, tl.z);
  }
  clawMeshes() { return [this.headMesh, ...this.prongs.map(p => p.vis)]; }
  setLive(on) {
    this.active = on;
    for (const p of this.plush) { this.sync(p, 0); p.sq = p.sqv = 0; p.scaler.scale.set(1, 1, 1); p.root.visible = on; }
    this.syncClaw();
    for (const o of [...this.m.parts, ...this.clawMeshes()]) o.visible = on;
  }
  idleClones() {
    const out = [];
    for (const p of this.plush) { this.sync(p, 0); const c = p.root.clone(); c.visible = true; out.push(c); }
    this.syncClaw();
    this.m.root.updateMatrixWorld(true);
    for (const part of this.m.parts) { const c = part.clone(); c.visible = true; part.matrixWorld.decompose(c.position, c.quaternion, c.scale); out.push(c); }
    for (const o of this.clawMeshes()) { const c = o.clone(); c.visible = true; out.push(c); }
    return out;
  }

  // ---------- rounds ----------
  get playing() { return this.state !== "idle" || this.pops.length > 0; }
  start() {
    if (this.state !== "idle") return;
    this.state = "aim"; this.t = 0; this.timer = AIM_TIME;
    this.stats = { grabbed: false, slipped: false };
    this.setMotor(REST, 30);
  }

  // one fixed step; input = { x, z, grab } in machine-local axes
  step(dt, input) {
    const s = this.state, P = this.pos;
    this.t += dt;
    if (s === Q.get("freeze") && this.active && !window.FREEZE && this.t >= +(Q.get("ft") || 0) && (this.freezeN || 0) >= +(Q.get("fn") || 1)) window.FREEZE = this;
    let tvx = 0, tvz = 0;
    this.winch = 0;
    if (s === "aim") {
      tvx = input.x * SPEED; tvz = input.z * SPEED;
      this.timer -= dt;
      if (input.grab || this.timer <= 0) this.go("open");
    } else if (s === "open") {
      if (this.t > .35) this.go("drop");
    } else if (s === "drop") {
      P.y -= DROP * dt; this.winch = 1;
      if (P.y <= this.target) { P.y = this.target; this.go("close"); }
    } else if (s === "close") {
      const k = Math.min(1, this.t / .6);
      this.setMotor(OPEN + (SHUT - OPEN) * k, GRIP * this.grip * 1.6);
      if (this.t > .75) { this.setMotor(SHUT, GRIP * this.grip); this.go("lift"); }
    } else if (s === "lift") {
      P.y += LIFT * dt; this.winch = 1;
      if (P.y >= CLAW_TOP) { P.y = CLAW_TOP; this.go("top"); }
    } else if (s === "top") {
      if (this.t > .35) this.go("carry");
    } else if (s === "carry") {
      const dx = HOME.x - P.x, dz = HOME.z - P.z, d = Math.hypot(dx, dz);
      const sp = Math.min(SPEED * .85, d * 3);
      if (d > .02) { tvx = dx / d * sp; tvz = dz / d * sp; }
      if (d < .03 && Math.hypot(this.vel.x, this.vel.z) < .05) this.go("release");
    } else if (s === "release") {
      if (this.t > .12 && this.t - dt <= .12) this.prongsHitPlush(false);
      // wait until a dropped prize has popped out, so the round result includes it
      if ((this.t > 1.1 && this.pops.every(p => p.told)) || this.t > 4) { this.prongsHitPlush(true); this.setMotor(REST, 30); this.go("idle"); this.on("end", this.stats); }
    }
    // trolley with acceleration, clamped to the rails
    const ax = THREE.MathUtils.clamp(tvx - this.vel.x, -ACCEL * dt, ACCEL * dt), az = THREE.MathUtils.clamp(tvz - this.vel.z, -ACCEL * dt, ACCEL * dt);
    this.vel.x += ax; this.vel.z += az;
    P.x += this.vel.x * dt; P.z += this.vel.z * dt;
    if (P.x < LIM.x0 || P.x > LIM.x1) { P.x = THREE.MathUtils.clamp(P.x, LIM.x0, LIM.x1); this.vel.x = 0; }
    if (P.z < LIM.z0 || P.z > LIM.z1) { P.z = THREE.MathUtils.clamp(P.z, LIM.z0, LIM.z1); this.vel.z = 0; }
    this.motor = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / SPEED);
    // the head hangs on a cable: damped pendulum driven by the trolley's acceleration
    const acx = (this.vel.x - this.prev.x) / dt, acz = (this.vel.z - this.prev.z) / dt;
    this.prev.x = this.vel.x; this.prev.z = this.vel.z;
    const L = Math.max(.7, GTOP - .6 - P.y), w2 = GRAV / L, sw = this.sway;
    sw.vx += (-w2 * sw.x - acx * .8 - 2.2 * sw.vx) * dt; sw.vz += (-w2 * sw.z - acz * .8 - 2.2 * sw.vz) * dt;
    sw.x = THREE.MathUtils.clamp(sw.x + sw.vx * dt, -.3, .3); sw.z = THREE.MathUtils.clamp(sw.z + sw.vz * dt, -.3, .3);
    const w = this.toW(P.x + sw.x, P.y, P.z + sw.z);
    this.head.setNextKinematicTranslation(w);
  }

  go(s) {
    this.state = s; this.t = 0;
    if (s === Q.get("freeze")) this.freezeN = (this.freezeN || 0) + 1;
    if (s === "open") { this.setMotor(OPEN, 40); this.on("open"); }
    if (s === "drop") this.target = this.dropTarget();
    if (s === "close") this.on("clack");
    if (s === "top") this.checkHeld();
    // a strong push so a plush wedged against the head still drops out
    if (s === "release") { this.setMotor(OPEN, 60); this.on("open"); if (this.held) this.held.body.wakeUp(); }
  }

  // how far the claw can go down before the head or a prong tip rests on something
  dropTarget() {
    const { R, world } = this;
    const cast = (pos, r, groups) => {
      const hit = world.castShape(pos, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new R.Ball(r), 0, 8, true, undefined, groups);
      return hit ? (hit.time_of_impact ?? hit.timeOfImpact) : 8;
    };
    // the head rests on the pile; the prongs slide down around the plush and only stop on the floor or walls
    const h = this.head.translation();
    let d = cast({ x: h.x, y: h.y, z: h.z }, .26, G_CLAW) + SINK;
    for (const p of this.prongs) d = Math.min(d, cast(this.tipWorld(p), .085, (0x0010 << 16) | 0x0004));
    return THREE.MathUtils.clamp(h.y - d, FLOOR + .35, CLAW_TOP);
  }

  // how many prongs are touching this plush right now
  touching(p) {
    let n = 0;
    for (const pr of this.prongs) {
      let hit = false;
      for (const c of pr.cols) {
        for (let i = 0; i < p.body.numColliders() && !hit; i++)
          this.world.contactPair(c, p.body.collider(i), m => { if (m.numContacts() > 0) hit = true; });
        if (hit) break;
      }
      if (hit) n++;
    }
    return n;
  }
  checkHeld() {
    const h = this.head.translation();
    this.held = null;
    for (const p of this.plush) {
      const t = p.body.translation();
      if (Math.hypot(t.x - h.x, t.z - h.z) < .8 && h.y - t.y > .2 && h.y - t.y < 1.6 && this.touching(p) >= 2) { this.held = p; break; }
    }
    if (this.held) { this.held.held = true; this.stats.grabbed = true; this.on("grab"); }
    else this.on("miss");
  }

  // after world.step(): sync meshes, track the held plush, detect prizes, refill
  after(dt) {
    if (!this.active) return;
    const h = this.head.translation();
    if (this.held) {
      const t = this.held.body.translation();
      if (Math.hypot(t.x - h.x, t.z - h.z) > 1 || h.y - t.y > 1.9) {
        this.held.held = false; this.held = null;
        if (this.state === "carry" || this.state === "top" || this.state === "lift") { this.stats.slipped = true; this.on("slip"); }
      } else if (this.state === "release" && this.t > .3) { this.held.held = false; this.held = null; }
    }
    if (this.held && !this.nearTold && (this.state === "carry" || this.state === "release")) {
      const t = this.held.body.translation(), l = this.toL(t.x, t.z);
      if (l.x < CHUTE.x1 + .5 && l.z > CHUTE.z0 - .5) { this.nearTold = true; this.on("near"); }
    }
    if (this.state === "aim") this.nearTold = false;
    for (const p of [...this.plush]) {
      this.sync(p, dt);
      const t = p.body.translation(), l = this.toL(t.x, t.z);
      if (t.y < FLOOR - .7 && l.x < CHUTE.x1 && l.z > CHUTE.z0) { if (p === this.held) this.held = null; this.remove(p); this.prize(p.acc); }
      else if (t.y < -5) this.remove(p);
    }
    if (this.plush.length < PILE && this.state === "idle") {
      let x, z;
      do { x = LIM.x0 + this.rnd() * (LIM.x1 - LIM.x0); z = LIM.z0 + this.rnd() * (LIM.z1 - LIM.z0); } while (x < CHUTE.x1 + .5 && z > CHUTE.z0 - .5);
      this.spawn(this.pickAcc(), x, GTOP - 1.2, z);
    }
    this.syncClaw();
    this.stepPops(dt);
  }

  // the prize pops out of the PRIZE door
  prize(acc) {
    const m = makePlush(this.species, acc);
    m.quaternion.copy(this.yq);
    this.scene.add(m);
    this.pops.push({ m, acc, t: 0, told: false });
  }
  stepPops(dt) {
    for (const pp of [...this.pops]) {
      pp.t += dt;
      const k = Math.min(1, pp.t / .7), e = 1 - (1 - k) ** 3;
      const lz = D / 2 - .1 + (.75) * e, ly = 1.15 + Math.sin(k * Math.PI) * .45 - .1 * e;
      const w = this.toW(-1.3, ly, lz);
      pp.m.position.set(w.x, w.y, w.z);
      pp.m.scale.setScalar(Math.min(1, k * 2) * .8 * (pp.t > 2.6 ? Math.max(0, 1 - (pp.t - 2.6) * 3) : 1));
      // the prize then flies off (into the cart); main.js takes it from here
      if (!pp.told && pp.t > .75) {
        pp.told = true; pp.m.removeFromParent(); this.pops.splice(this.pops.indexOf(pp), 1);
        this.on("win", { key: `${this.species}-${pp.acc}`, pos: pp.m.position.clone() });
      }
    }
  }
}
