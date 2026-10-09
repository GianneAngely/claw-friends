// Other kids visiting the arcade: they walk the aisles from machine to machine, play a little, sometimes cheer,
// and leave by the door (coming back in a new outfit). They stop for Kyoko instead of walking through her.
import * as THREE from "three";
import { makeKid, HOODS, TOPS, BOTTOMS, HEIGHTS } from "./kid.js";

const DOOR = new THREE.Vector3(0, 0, 17), FRONT_Z = 11.5, AISLE_X = 10.65, SPEED = 3.4;
// leaving, they walk out of the door and along the sidewalk to its end, where they're out of sight: only there do they
// change into a new outfit (changing at the door, they swapped hood and clothes in plain view)
const STREET_Z = 23, AWAY_X = 13.5;
const HAIR = [0x7A4A32, 0x3A3442, 0xEBC46A, 0xF08DB8, 0x9D86D8, 0xC0603A];
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

export function makeVisitors(scene, places, rnd, n = 3) {
  const spots = places.map(p => ({ x: p.x + Math.sin(p.yaw) * 4.4, z: p.z + Math.cos(p.yaw) * 4.4, yaw: p.yaw + Math.PI }));
  const aisle = x => Math.sign(x) * AISLE_X;
  function dress(v) {
    if (v.kid) scene.remove(v.kid.root);
    const outfit = { hood: pick(HOODS, rnd).id, top: pick(TOPS, rnd).id, bottom: pick(BOTTOMS, rnd).id, height: pick(HEIGHTS.slice(0, 3), rnd).id };
    v.kid = makeKid(outfit, { hair: pick(HAIR, rnd) });
    scene.add(v.kid.root);
  }
  // a route along the aisles and the front walkway to a machine (or back to the door)
  function route(v, to) {
    const p = v.pos, path = [];
    const ax = v.atSpot ? aisle(p.x) : null;
    if (ax !== null) path.push(new THREE.Vector3(ax, 0, p.z));
    const cur = ax !== null ? ax : null;
    if (to === "door") {
      if (cur !== null) path.push(new THREE.Vector3(cur, 0, FRONT_Z));
      v.side = rnd() < .5 ? -1 : 1;
      path.push(new THREE.Vector3(0, 0, FRONT_Z), DOOR.clone(), new THREE.Vector3(0, 0, STREET_Z), new THREE.Vector3(v.side * AWAY_X, 0, STREET_Z));
    } else {
      const tx = aisle(to.x);
      if (v.away) { path.push(new THREE.Vector3(0, 0, STREET_Z), DOOR.clone()); v.away = false; }
      if (cur === null) path.push(new THREE.Vector3(0, 0, FRONT_Z), new THREE.Vector3(tx, 0, FRONT_Z));
      else if (cur !== tx) path.push(new THREE.Vector3(cur, 0, FRONT_Z), new THREE.Vector3(tx, 0, FRONT_Z));
      path.push(new THREE.Vector3(tx, 0, to.z), new THREE.Vector3(to.x, 0, to.z));
    }
    v.path = path; v.goal = to; v.atSpot = false;
  }
  // they're already in the arcade when the game opens, each at a different random machine, part-way through a play
  // (all starting at the door, they stood in the same spot behind Kyoko on every load)
  const list = [], taken = new Set();
  for (let i = 0; i < n; i++) {
    let s; do s = pick(spots, rnd); while (taken.has(s));
    taken.add(s);
    const v = { id: i, pos: new THREE.Vector3(s.x, 0, s.z), yaw: s.yaw, path: [], wait: 1 + rnd() * 8, plays: Math.floor(rnd() * 2), kid: null, atSpot: true, goal: s, said: null };
    dress(v); v.kid.root.position.copy(v.pos); list.push(v);
  }
  return {
    list,
    // player: Kyoko's position; returns lines to show in bubbles [{v, text}]
    update(dt, player) {
      const lines = [];
      for (const v of list) {
        let speed = 0;
        if (v.wait > 0) {
          v.wait -= dt;
          if (v.goal && v.goal !== "door" && v.atSpot && rnd() < dt * .12) { v.kid.setFace("happy", 1.6); lines.push({ v, text: pick(["Yay!", "Got one!", "So cute!", "♡♡♡"], rnd) }); }
          if (v.wait <= 0) {
            // back from the sidewalk's end in the new outfit (not on top of someone else coming back the same way)
            if (v.away && list.some(o => o !== v && o.kid.root.visible && Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z) < 2.5)) { v.wait = 1; continue; }
            if (v.away) v.kid.root.visible = true;
            if (v.goal && v.goal !== "door") taken.delete(v.goal);
            if (v.plays >= 2 + Math.floor(rnd() * 2)) route(v, "door");
            else {
              // (not the machine Kyoko stands at - they walked into her spot and stood inside her)
              const free = spots.filter(q => !taken.has(q) && Math.hypot(q.x - player.x, q.z - player.z) > 4);
              const s = pick(free.length ? free : spots, rnd);
              taken.add(s); route(v, s);
            }
          }
        } else if (v.path.length) {
          // steer round Kyoko (and her cart) and the other visitors instead of stopping and queueing behind them: a
          // sideways push away from anyone close ahead; another visitor right ahead going the same way is followed
          const t = v.path[0], d = Math.hypot(t.x - v.pos.x, t.z - v.pos.z);
          const fx = d > 1e-3 ? (t.x - v.pos.x) / d : 0, fz = d > 1e-3 ? (t.z - v.pos.z) / d : 0;
          let sx = 0, sz = 0, follow = false, nearKyoko = false;
          const avoid = (ox, oz, r) => {
            const dx = ox - v.pos.x, dz = oz - v.pos.z, dist = Math.hypot(dx, dz), ahead = dx * fx + dz * fz;
            if (dist > r || ahead < -.3 || dist < 1e-3) return false;
            const side = dx * -fz + dz * fx;                      // + = obstacle on the left of the way
            const k = (1 - dist / r) * 3.4 * (Math.abs(side) < .05 ? (v.id % 2 ? 1 : -1) : -Math.sign(side));
            sx += -fz * k; sz += fx * k;
            return true;
          };
          if (avoid(player.x, player.z, 3.6)) nearKyoko = true;
          for (const o of list) if (o !== v && o.kid.root.visible) {
            const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z, dist = Math.hypot(dx, dz);
            if (dist < 1.9 && dx * fx + dz * fz > 0 && o.id < v.id && !o.atSpot && o.path.length && Math.hypot(o.path[0].x - t.x, o.path[0].z - t.z) < .5) follow = true;
            else avoid(o.pos.x, o.pos.z, 2.4);
          }
          if (nearKyoko && !v.said) { v.said = 1; lines.push({ v, text: pick(["Oh! Sorry", "Hi!", "Excuse me~"], rnd) }); }
          if (!nearKyoko) v.said = null;
          if (!follow) {
            const mx = fx + sx, mz = fz + sz, ml = Math.hypot(mx, mz) || 1, step = Math.min(d, SPEED * dt);
            if (d > 1e-3) {
              v.pos.x += mx / ml * step; v.pos.z += mz / ml * step;
              const want = Math.atan2(mx, mz);
              v.yaw += Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw)) * Math.min(1, dt * 8);
            }
            speed = .75;
            if (Math.hypot(t.x - v.pos.x, t.z - v.pos.z) < (nearKyoko && v.path.length > 1 ? 1.4 : .15)) v.path.shift();   // (a corner by Kyoko is cut)
          }
          if (!v.path.length) {
            if (v.goal === "door") { v.plays = 0; v.goal = null; v.wait = 4 + rnd() * 6; dress(v); v.away = true; v.kid.root.visible = false; }
            else { v.atSpot = true; v.plays++; v.wait = 5 + rnd() * 6; }
          }
        }
        // Kyoko walks up to the machine they're playing: they make room
        if (v.atSpot && v.wait > .3 && Math.hypot(player.x - v.pos.x, player.z - v.pos.z) < 3) { v.wait = .3; lines.push({ v, text: "Your turn!" }); }
        if (v.atSpot && v.goal && v.goal !== "door") v.yaw += Math.atan2(Math.sin(v.goal.yaw - v.yaw), Math.cos(v.goal.yaw - v.yaw)) * Math.min(1, dt * 6);
        v.kid.root.position.copy(v.pos); v.kid.root.rotation.y = v.yaw;
        v.kid.animate(dt, speed, v.atSpot ? "reach" : "walk");
      }
      return lines;
    },
  };
}
