// Other kids visiting the arcade: they walk the aisles from machine to machine, play a little, sometimes cheer,
// and leave by the door (coming back in a new outfit). They stop for Kyoko instead of walking through her.
import * as THREE from "three";
import { makeKid, HOODS, TOPS, BOTTOMS, HEIGHTS } from "./kid.js";

const DOOR = new THREE.Vector3(0, 0, 17), FRONT_Z = 11.5, AISLE_X = 10.65, SPEED = 3.4;
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
      path.push(new THREE.Vector3(0, 0, FRONT_Z), DOOR.clone());
    } else {
      const tx = aisle(to.x);
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
    const v = { pos: new THREE.Vector3(s.x, 0, s.z), yaw: s.yaw, path: [], wait: 1 + rnd() * 8, plays: Math.floor(rnd() * 2), kid: null, atSpot: true, goal: s, said: null };
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
            if (v.goal && v.goal !== "door") taken.delete(v.goal);
            if (v.plays >= 2 + Math.floor(rnd() * 2)) route(v, "door");
            else {
              let s; do s = pick(spots, rnd); while (taken.has(s) && taken.size < spots.length);
              taken.add(s); route(v, s);
            }
          }
        } else if (v.path.length) {
          const t = v.path[0], d = Math.hypot(t.x - v.pos.x, t.z - v.pos.z);
          const blocked = Math.hypot(player.x - v.pos.x, player.z - v.pos.z) < 2.4 && (t.x - v.pos.x) * (player.x - v.pos.x) + (t.z - v.pos.z) * (player.z - v.pos.z) > 0;
          if (blocked) { v.blockT = (v.blockT || 0) + dt; if (v.blockT > .4 && !v.said) { v.said = 1; lines.push({ v, text: pick(["Oh! Sorry", "Hi!", "Excuse me~"], rnd) }); } }
          else {
            v.blockT = 0; v.said = null;
            const step = Math.min(d, SPEED * dt);
            if (d > 1e-3) { v.pos.x += (t.x - v.pos.x) / d * step; v.pos.z += (t.z - v.pos.z) / d * step; v.yaw += Math.atan2(Math.sin(Math.atan2(t.x - v.pos.x, t.z - v.pos.z) - v.yaw), Math.cos(Math.atan2(t.x - v.pos.x, t.z - v.pos.z) - v.yaw)) * Math.min(1, dt * 8); }
            speed = .75;
            if (d < .05) v.path.shift();
          }
          if (!v.path.length) {
            if (v.goal === "door") { v.plays = 0; v.goal = null; v.wait = 2 + rnd() * 4; dress(v); v.pos.copy(DOOR); v.yaw = Math.PI; }
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
