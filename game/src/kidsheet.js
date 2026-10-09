// Character sheet: every kid variant from the front, 3/4 and back, for picking a look.
import * as THREE from "three";
import { outlineU } from "./gfx.js";
import { makeKid, loadKid } from "./kid.js";

const Q = new URLSearchParams(location.search);
// ?outfits=hood.top.bottom,... (defaults: the main outfit plus a few mixes)
const kinds = (Q.get("outfits") || "koala.navy.grey,koala.pink.white,koala.lilac.navy,koala.mint.cream,koala.black.denim,koala.yellow.brown").split(",")
  .map(o => { const [hood, top, bottom, hair, height, shoes] = o.split("."); return { hood, top, bottom, hair, height, shoes }; });
const views = (Q.get("views") || "0.35").split(",").map(Number);
(async () => {
await document.fonts.load("700 40px Fredoka");
await loadKid();
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById("c") });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFBF1F7);
scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xE2D4F4, 2.2));
const sun = new THREE.DirectionalLight(0xFFFFFF, 1.5); sun.position.set(4, 9, 7); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 8, bottom: -3 }); sun.shadow.intensity = .45;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.ShadowMaterial({ color: 0x4A3A5E, opacity: .15 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const n = kinds.length * views.length, gap = 3.2;
const kids = [];
let i = 0;
for (const k of kinds) for (const yaw of views) {
  const kid = makeKid(k); kid.root.position.x = (i - (n - 1) / 2) * gap; kid.root.rotation.y = yaw; scene.add(kid.root); kids.push(kid); i++;
}
const cam = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, .1, 200);
const w = n * gap + 1.5, dist = Math.max(w / 2 / Math.tan(12 * Math.PI / 180) / cam.aspect, 16);
cam.position.set(0, +(Q.get("camy") || 3.4), dist); cam.lookAt(0, 2.3, 0);   // ?camy= for a view from above
const pr = renderer.getPixelRatio();
outlineU.res.value.set(innerWidth * pr, innerHeight * pr); outlineU.px.value = 2.2 * pr;
const faceQ = Q.get("face");
const poseQ = Q.get("pose") || "walk", speedQ = +(Q.get("speed") || 0), stepsQ = +(Q.get("steps") || 1);
const stepsList = (Q.get("stepsList") || "").split(",").filter(Boolean).map(Number);
const poseList = (Q.get("poseList") || "").split(",").filter(Boolean);
const faceList = (Q.get("faceList") || "").split(",").filter(Boolean);
// ?phaseList=0,.1,... walks each kid on (after its steps) until its walk cycle reaches that point
const phaseList = (Q.get("phaseList") || "").split(",").filter(Boolean).map(Number);
kids.forEach((kid, i) => {
  const f = faceList[i] || faceQ, pose = poseList[i] || poseQ, n = stepsList[i] ?? stepsQ;
  for (let k = 0; k < n; k++) { if (f && f !== "-") kid.setFace(f, 9); kid.animate(1 / 60, pose === "walk" || pose === "push" ? speedQ : 0, pose); }
  if (phaseList[i] !== undefined) for (let k = 0; k < 4000 && Math.abs(kid.phase - phaseList[i]) > .003; k++) kid.animate(1 / 1000, 1, pose);
});
// ?hide=MeshName,... hides model parts (and their outlines) for debugging
const hide = (Q.get("hide") || "").split(",").filter(Boolean);
if (hide.length) scene.traverse(o => { if (hide.some(h => o.name.startsWith(h))) o.visible = false; });
renderer.render(scene, cam);
window.KIDS = kids;
window.RENDER = () => renderer.render(scene, cam);   // for tools/cdpclip.mjs (animation clips)
window.THREE = THREE;   // for probes run from tools/cdpshot.mjs
window.READY = true;
})();
