// Claw Friends prototype: walk around the arcade as a chibi kid, play any claw machine.
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { outlineU, bake, ANIME, canvasTex } from "./gfx.js";
import { makeMachine, bakeToppers, MACHINE_BY_ID, IX, IZ } from "./machine.js";
import { makePlush, PLUSH, PLUSH_BY_KEY, SPECIES } from "./plush.js";
import { buildRoom, setSkyTint, PLACES, START, SHELF, CASHIER, SWAP, CORRAL, cartModel } from "./room.js";
import { makeVisitors } from "./visitors.js";
import { ClawGame } from "./claw.js";
import { makeKid, loadKid, setLight, DEFAULT_OUTFIT, HOODS, HAIRS, FACE_OPTS, HEIGHTS, SHOES, TOPS, BOTTOMS } from "./kid.js";
import * as ui from "./ui.js";
import * as store from "./save.js";
import * as audio from "./sfx.js";
import * as settings from "./settings.js";
import * as progress from "./progress.js";

const Q = new URLSearchParams(location.search);
const TEST = Q.get("test");
const G_KID = (0x0002 << 16) | 0x0001;
const STEP = 1 / 60, WALK = 6.5, KID_Y = 2.0, ROUNDS = +(Q.get("rounds") || 12), CART_CAP = 15, CART_Z = 2.2, CART_S = .82;
const POINTS = { common: 10, uncommon: 30, rare: 100 };
const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function makeIcons() {
  const W = 160, H = 150;
  const r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r2.setPixelRatio(1); r2.setSize(W, H);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xFFFFFF, 0xE2D4F4, 2.4));
  const d = new THREE.DirectionalLight(0xFFFFFF, 1.3); d.position.set(2, 3, 4); sc.add(d);
  const cam = new THREE.PerspectiveCamera(30, W / H, .1, 20); cam.position.set(0, .3, 3.2); cam.lookAt(0, .06, 0);
  const keep = { px: outlineU.px.value, res: outlineU.res.value.clone() };
  outlineU.px.value = 2.2; outlineU.res.value.set(W, H);
  const icons = {};
  for (const p of PLUSH) {
    const m = makePlush(p.species, p.acc); m.rotation.y = -.35; sc.add(m);
    r2.render(sc, cam); icons[p.key] = r2.domElement.toDataURL(); sc.remove(m);
  }
  outlineU.px.value = keep.px; outlineU.res.value.copy(keep.res);
  r2.dispose();
  return icons;
}

async function main() {
  ui.init();
  // the title screen comes first unless a test or a debug view asks for the game (or "new game" reloaded into it)
  let autoplay = false;
  try { autoplay = sessionStorage.getItem("cf-autoplay") === "1"; sessionStorage.removeItem("cf-autoplay"); } catch {}
  const TITLE = !TEST && !Q.has("play") && !Q.has("at") && !Q.has("cam") && !autoplay;
  audio.init(!TITLE);
  ui.onMute(() => audio.toggleMute(), audio.isMuted());
  ui.onMusic(() => audio.toggleMusic(), audio.isMusicOn());
  let S = settings.get();
  if (Q.get("quality")) S = { ...S, quality: Q.get("quality") };   // (?quality=low|high to try one, not saved)
  audio.setVolumes(S.music, S.sfx);
  ui.loading(.1, "Waking up the arcade…");
  await document.fonts.load("700 40px Fredoka");
  ui.loading(.25, "Oiling the claws…");
  await RAPIER.init();
  ui.loading(.45, "Kyoko is getting dressed…");
  setLight(S.quality === "low");
  await loadKid();
  ui.loading(.6, "Stacking the plushies…");
  await new Promise(r => setTimeout(r, 30));   // (lets the bar paint before the long synchronous build)
  if (Q.has("fresh")) store.save({});
  const save = store.load();

  // ---------- renderer ----------
  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(S.quality === "low" ? 1 : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = S.quality !== "low";   // (light: no shadow sampling in the shaders at all)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xDCEFFB);
  // (near .5 / far 160: phones with a 16-bit depth buffer showed the floor and walls black - their back faces and
  // outline hulls won the depth test at .1 / 300)
  const camera = new THREE.PerspectiveCamera(40, 1, .5, 160);
  // soft glow on the brightest areas, like a lit illustration
  // the scene is drawn into the composer's own render target: it needs its own multisampling (the canvas'
  // antialias doesn't reach it) - without it every outline was jagged and broken up
  // (light graphics: no multisampled half-float target - many phone GPUs can't render to one)
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, S.quality === "low" ? {} : { type: THREE.HalfFloatType, samples: 4 }));
  // the GPU gave up (a phone out of memory): try again on light graphics, or say so
  canvas.addEventListener("webglcontextlost", e => {
    e.preventDefault();
    if (S.quality !== "low") { settings.set({ quality: "low" }); try { sessionStorage.setItem("cf-autoplay", mode === "title" ? "" : "1"); } catch {} location.reload(); }
    else ui.toast("The graphics stopped · reload the page to keep playing", 6000);
  });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .22, .35, 1.04);
  composer.addPass(bloom); bloom.enabled = S.quality !== "low";
  composer.addPass(new OutputPass());
  scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xE2D4F4, 2.2));
  const sun = new THREE.DirectionalLight(0xFFFFFF, 1.5);
  sun.castShadow = S.quality !== "low";
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 90 });
  sun.shadow.bias = -.0008; sun.shadow.normalBias = .03; sun.shadow.intensity = .45;
  scene.add(sun, sun.target);

  // ---------- world ----------
  const world = new RAPIER.World({ x: 0, y: -40, z: 0 });
  world.integrationParameters.numSolverIterations = 8;
  const rnd = mulberry32(TEST ? 7 : (Date.now() & 0xffffff));
  save.shiny = save.shiny || {}; save.sets = save.sets || {};
  progress.ensureDay(save, rnd);
  const room = buildRoom(scene, RAPIER, world);
  const statics = new THREE.Group();
  const games = PLACES.map((p, i) => {
    const m = makeMachine(MACHINE_BY_ID[p.species]);
    m.root.position.set(p.x, 0, p.z); m.root.rotation.y = p.yaw;
    scene.add(m.root); m.root.updateMatrixWorld(true);
    statics.attach(m.body);
    const g = new ClawGame(RAPIER, world, scene, m, p, p.species, rnd);
    // two special machines per row: Lucky (strong claw) and Jackpot (more rare friends, weak claw)
    g.variant = TEST ? null : i % 4 === 0 ? "lucky" : i % 4 === 2 ? "jackpot" : null;
    if (g.variant === "lucky") g.grip = 1.3;
    if (g.variant === "jackpot") { g.grip = .85; g.rareBoost = 3.5; }
    if (g.variant) {
      const lucky = g.variant === "lucky", tex = canvasTex(360, 120, (c, w, h) => {
        c.fillStyle = lucky ? "#FFD86B" : "#FF74B8"; c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 50); c.fill();
        c.lineWidth = 7; c.strokeStyle = "#4A3A5E"; c.stroke();
        c.textAlign = "center"; c.textBaseline = "middle"; c.font = "700 58px Fredoka"; c.lineWidth = 12; c.lineJoin = "round";
        c.strokeText(lucky ? "LUCKY ★" : "JACKPOT", w / 2, h / 2 + 3); c.fillStyle = "#fff"; c.fillText(lucky ? "LUCKY ★" : "JACKPOT", w / 2, h / 2 + 3);
      });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .5), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      tag.position.set(-1.45, 6.0, 2.2); tag.rotation.z = .12; m.root.add(tag);
    }
    g.fill(); g.place = p; g.index = i;
    return g;
  });
  scene.add(bake(statics));
  // rows that aren't open yet carry a "locked" plate over the glass
  for (const g of games) {
    const need = progress.MACHINE_UNLOCK[g.species];
    if (!need) continue;
    const tex = canvasTex(512, 220, (c, w, h) => {
      c.fillStyle = "rgba(74, 58, 94, .88)"; c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, 40); c.fill();
      c.lineWidth = 8; c.strokeStyle = "#fff"; c.stroke();
      c.textAlign = "center"; c.fillStyle = "#FFD4E5"; c.font = "700 76px Fredoka"; c.fillText("LOCKED", w / 2, 108);
      c.fillStyle = "#fff"; c.font = "600 36px Fredoka"; c.fillText(`win ${need} friends to open`, w / 2, 168);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.42), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(0, 4.2, 2.25); g.m.root.add(sign); g.lockSign = sign;
  }
  const isLocked = g => !TEST && !progress.isOpen(save, g.species);
  // the day's event machine: double stars all day (one of the open, ordinary machines; it moves every day)
  const eventTex = canvasTex(360, 120, (c, w, h) => {
    c.fillStyle = "#7FE0C2"; c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 50); c.fill();
    c.lineWidth = 7; c.strokeStyle = "#4A3A5E"; c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle"; c.font = "700 50px Fredoka"; c.lineWidth = 12; c.lineJoin = "round";
    c.strokeText("★x2 TODAY", w / 2, h / 2 + 3); c.fillStyle = "#fff"; c.fillText("★x2 TODAY", w / 2, h / 2 + 3);
  });
  const eventTag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .5), new THREE.MeshBasicMaterial({ map: eventTex, transparent: true }));
  eventTag.position.set(1.45, 6.0, 2.2); eventTag.rotation.z = -.12;
  let eventGame = null;
  function pickEvent() {
    if (TEST) return;
    const pool = games.filter(g => !g.variant && !isLocked(g));
    eventGame = pool[(save.day * 7) % pool.length];
    eventGame.m.root.add(eventTag);
  }
  const paintLocks = () => { for (const g of games) if (g.lockSign) g.lockSign.visible = isLocked(g); };
  paintLocks(); pickEvent();
  const toppers = bakeToppers(games.map(g => g.m)); scene.add(toppers.group);
  for (let i = 0; i < 320; i++) world.step();
  const rows = SPECIES.map(s => games.filter(g => g.species === s.id)), rowBake = [];
  const rowOf = g => SPECIES.findIndex(s => s.id === g.species);
  function rebuildRow(r) {
    if (rowBake[r]) rowBake[r].removeFromParent();
    const grp = new THREE.Group();
    for (const g of rows[r]) if (!g.active) for (const c of g.idleClones()) grp.add(c);
    rowBake[r] = bake(grp); scene.add(rowBake[r]);
  }
  for (const g of games) g.setLive(false);
  rows.forEach((_, r) => rebuildRow(r));
  room.setShelf(save.owned);
  room.setBig(save.big);

  // ---------- kid ----------
  // the main character's outfit (?outfit=hood.top.bottom overrides for tests)
  save.outfit = { ...DEFAULT_OUTFIT, ...(save.outfit || {}) };
  if (Q.get("outfit")) { const [hood, top, bottom, hair] = Q.get("outfit").split("."); save.outfit = { ...DEFAULT_OUTFIT, hood, top, bottom, ...(hair && { hair }) }; }
  let kid = makeKid(save.outfit); scene.add(kid.root);
  // ?hide=MeshName,... hides parts of the kid (and their outlines, named Name_line) for debugging
  const HIDE = (Q.get("hide") || "").split(",").filter(Boolean);
  if (HIDE.length) kid.root.traverse(o => { if (HIDE.some(h => o.name.startsWith(h))) o.visible = false; });
  kid.root.position.set(START.x, 0, START.z); kid.root.rotation.y = Math.PI;
  const kidBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(START.x, KID_Y, START.z));
  const kidCol = world.createCollider(RAPIER.ColliderDesc.capsule(1.2, 1.25).setCollisionGroups(G_KID), kidBody);
  const cc = world.createCharacterController(.05); cc.setSlideEnabled(true);
  let kidYaw = Math.PI, kidSpeed = 0;
  // the kid's pose after the last two physics steps: drawn in between, so walking and turning look smooth on screens
  // faster than the 60 Hz physics (on 120 Hz, the yaw jumped every other frame and the turn lean flickered)
  const kidPrev = { x: 0, z: 0, yaw: kidYaw }, kidCur = { x: 0, z: 0, yaw: kidYaw };
  const kidVel = new THREE.Vector3();
  let kidColRef = kidCol;
  // with a cart the collider grows forward so the cart can't go through walls or machines
  function setKidCollider(withCart) {
    world.removeCollider(kidColRef, false);
    // with a cart: a capsule lying along the walking direction that covers the kid and the cart
    const d = withCart
      ? RAPIER.ColliderDesc.capsule(1.3, 1.2).setTranslation(0, 0, 1.3).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
      : RAPIER.ColliderDesc.capsule(1.2, 1.25);
    kidColRef = world.createCollider(d.setCollisionGroups(G_KID), kidBody);
  }

  // ---------- the shopping cart ----------
  const cart = { obj: cartModel(CART_S), attached: false, hidden: !!save.cartHidden, meshes: [] };
  cart.obj.root.visible = false; scene.add(cart.obj.root);
  function layoutCart() {
    for (const m of cart.meshes) m.removeFromParent();
    cart.meshes = [];
    let slot = 0;
    const smalls = save.cart.filter(it => !it.big), bigs = save.cart.filter(it => it.big);
    for (const it of smalls) {
      const p = PLUSH_BY_KEY[it.key]; if (!p) continue;
      const m = makePlush(p.species, p.acc), L = Math.floor(slot / 6), i = slot % 6, row = Math.floor(i / 2) - 1;
      m.scale.setScalar(.5); m.position.set((i % 2 - .5) * .48, .3 + L * .4 + row * .06, row * .46); m.rotation.y = Math.PI + (i - 2.5) * .2;
      cart.obj.basket.add(m); cart.meshes.push(m); slot++;
    }
    bigs.forEach((it, i) => {
      const m = makePlush(it.big, "crown"); m.scale.setScalar(1.05);
      m.position.set((i - (bigs.length - 1) / 2) * .6, .42 + Math.ceil(smalls.length / 6) * .4 + .3, 0); m.rotation.y = Math.PI;
      cart.obj.basket.add(m); cart.meshes.push(m);
    });
    const used = smalls.length + bigs.length * 3;
    ui.setCart(used, CART_CAP, cart.attached || save.cart.length > 0);
    return used;
  }
  const cartUsed = () => save.cart.filter(it => !it.big).length + save.cart.filter(it => it.big).length * 3;
  function attachCart() {
    cart.attached = true; save.hasCart = true;
    cart.obj.root.visible = !cart.hidden;
    kid.root.add(cart.obj.root); cart.obj.root.position.set(0, 0, CART_Z); cart.obj.root.rotation.set(0, 0, 0);
    setKidCollider(!cart.hidden);
    layoutCart(); ui.setCartHidden(cart.hidden);
  }
  // put the cart away (H or the cart counter) so it can't bump into things; its friends stay in it
  function toggleCart() {
    if (!cart.attached) { ui.toast("No cart yet · they're by the door"); return; }
    if (cart.hidden) {
      // only bring it back where there's room in front of her
      const q = new THREE.Quaternion().setFromAxisAngle(UP, kidYaw), p = kidBody.translation();
      const c = new THREE.Vector3(0, 0, 1.3).applyQuaternion(q).add(new THREE.Vector3(p.x, p.y, p.z));
      const r = q.clone().multiply(new THREE.Quaternion(Math.SQRT1_2, 0, 0, Math.SQRT1_2));
      if (world.intersectionWithShape(c, r, new RAPIER.Capsule(1.3, 1.2), undefined, G_KID, kidColRef, kidBody)) { ui.toast("No room for the cart here"); return; }
    }
    cart.hidden = !cart.hidden; save.cartHidden = cart.hidden; persist();
    cart.obj.root.visible = !cart.hidden; setKidCollider(!cart.hidden); ui.setCartHidden(cart.hidden);
    ui.toast(cart.hidden ? "Cart put away · your friends stay in it" : "Cart's back!");
    tutFlags.toggled = true;
  }
  function parkCart(pos, yaw) {
    scene.attach(cart.obj.root);
    cart.obj.root.position.copy(pos); cart.obj.root.rotation.set(0, yaw, 0);
  }

  // ---------- shop staff behind the counters ----------
  const cashierNpc = makeKid({ hood: "koala", top: "yellow", bottom: "brown" }, { hair: 0x7A4A32, hoodColor: 0xEBCBA4 });
  cashierNpc.root.position.set(CASHIER.x - 1.7, 0, CASHIER.z); cashierNpc.root.rotation.y = Math.PI / 2; scene.add(cashierNpc.root);
  const swapNpc = makeKid({ hood: "koala", top: "mint", bottom: "denim" }, { hair: 0xB9A2F0, hoodColor: 0xFFFFFF });
  swapNpc.root.position.set(SWAP.x + 1.7, 0, SWAP.z); swapNpc.root.rotation.y = -Math.PI / 2; scene.add(swapNpc.root);
  const visitors = TEST ? null : makeVisitors(scene, PLACES, rnd, S.quality === "low" ? 1 : 3, i => !isLocked(games[i]));   // (each kid costs ~80 draw calls)

  // ---------- speech bubbles over heads ----------
  const bubbles = [];
  function say(obj, text, ms = 2000) {
    for (const b of bubbles) if (b.obj === obj) { b.el.textContent = text; b.until = performance.now() + ms; return; }
    const el = document.createElement("div"); el.className = "bubble"; el.textContent = text;
    document.getElementById("hud").appendChild(el);
    bubbles.push({ el, obj, until: performance.now() + ms });
  }
  const _bp = new THREE.Vector3();
  function placeBubbles() {
    const now = performance.now();
    for (const b of [...bubbles]) {
      if (now > b.until || mode === "title") { b.el.remove(); bubbles.splice(bubbles.indexOf(b), 1); continue; }
      b.obj.getWorldPosition(_bp); _bp.y += 4.6; _bp.project(camera);
      const vis = _bp.z < 1 && Math.abs(_bp.x) < 1.1 && Math.abs(_bp.y) < 1.1;
      b.el.style.display = vis ? "" : "none";
      b.el.style.left = ((_bp.x + 1) / 2 * innerWidth) + "px"; b.el.style.top = ((1 - _bp.y) / 2 * innerHeight) + "px";
    }
  }
  // the staff greet Kyoko when she comes near (not too often)
  const staffLines = [
    { npc: cashierNpc, at: CASHIER, lines: ["Welcome! ♡", "Free coins every day!", "Check out here!", "Find any cute ones?"], next: 0 },
    { npc: swapNpc, at: SWAP, lines: ["5 small = 1 BIG!", "Big friends are so soft~", "Wanna swap?"], next: 0 },
  ];
  function staffTalk() {
    const now = performance.now(), p = kid.root.position;
    for (const s of staffLines) if (now > s.next && Math.hypot(p.x - s.at.x, p.z - s.at.z) < 7) {
      say(s.npc.root, s.lines[Math.floor(rnd() * s.lines.length)], 2400); s.npc.setFace("happy", 1.2); s.next = now + 15000;
    }
  }
  // ---------- time of day: the local clock (?hour= to try), seen through the windows and the door ----------
  function timeOfDay() {
    const d = new Date(), h = Q.get("hour") ? +Q.get("hour") : d.getHours() + d.getMinutes() / 60;
    const night = h < 6 || h >= 19, dusk = !night && (h >= 16.5 || h < 7.5);
    setSkyTint(night ? 0x4C4F96 : dusk ? 0xFFC9B0 : 0xFFFFFF);
    scene.background.set(night ? 0x2E3266 : dusk ? 0xF6CDBE : 0xDCEFFB);
    bloom.strength = night ? .34 : .22;          // (the machines glow a little more at night)
  }
  timeOfDay(); setInterval(timeOfDay, 60000);

  // ---------- camera ----------
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: .1, enablePan: false, minDistance: 8, maxDistance: 30, minPolarAngle: .3, maxPolarAngle: 1.3, rotateSpeed: S.sens });
  const at = (Q.get("at") || "").split(",").map(Number);
  if (at.length === 2 && at.every(Number.isFinite)) { START.x = at[0]; START.z = at[1]; kid.root.position.set(START.x, 0, START.z); kidBody.setTranslation({ x: START.x, y: KID_Y, z: START.z }, true); }
  controls.target.set(START.x, 3.4, START.z);
  camera.position.set(START.x, 3.4 + 7.5, START.z + 17.5);
  controls.update();
  let tween = null;
  function tweenTo(pos, tgt, dur = .8) { tween = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt }; controls.enabled = false; }
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function camAxes() { camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, UP).normalize(); }
  let mode = TITLE ? "title" : "walk", active = null;
  // first-person view (V / the eye button): the camera at Kyoko's eyes, walking and playing, her body hidden (the
  // cart stays). At a machine the eyes are in front of the glass, a little higher than hers (from her height the
  // prize pile hid the floor)
  let fp = false, fpYaw = 0, fpPitch = -.12, kidHidden = false;
  // at a machine the arrows / a drag move her round its front (to see through the side glass) and up / down,
  // always looking at the prizes; a step past ~.95 rad would put her into the next machine
  let mAz = 0, mH = 0;
  const EYE = 3.6;
  const fpEye = () => {
    if (mode === "machine" && active) { const e = active.toW(5 * Math.sin(mAz), 4.7 + EYE * (kid.height - 1) + mH, 5 * Math.cos(mAz)); return new THREE.Vector3(e.x, e.y, e.z); }
    return kid.root.position.clone().add(new THREE.Vector3(0, EYE * kid.height, 0));   // (her eyes at her size)
  };
  const fpLook = () => fpEye().add(new THREE.Vector3(Math.sin(fpYaw) * Math.cos(fpPitch), Math.sin(fpPitch), Math.cos(fpYaw) * Math.cos(fpPitch)).multiplyScalar(6));
  const fpOn = () => fp && (mode === "walk" || mode === "machine");
  function aimAtPrizes() {
    const e = fpEye(), l = active.toW(0, 3.4, 0), d = new THREE.Vector3(l.x - e.x, l.y - e.y, l.z - e.z);
    fpYaw = Math.atan2(d.x, d.z); fpPitch = Math.asin(d.y / d.length());
  }
  function setFirstPerson(on) {
    fp = on; ui.setViewOn(on);
    const p = kid.root.position;
    if (on) {
      const e = fpEye(), d = controls.target.clone().sub(mode === "machine" ? e : camera.position);
      fpYaw = Math.atan2(d.x, d.z); fpPitch = mode === "machine" ? Math.asin(d.y / d.length()) : -.12;
      tweenTo(e, fpLook(), .5);
    } else if (mode === "machine") {
      const c = active.toW(0, camera.aspect < 1 ? 7.6 : 8, 12.4), t = active.toW(0, camera.aspect < 1 ? 3.6 : 4, 0);
      tweenTo(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(t.x, t.y, t.z), .5);
    } else {
      const d = new THREE.Vector3(Math.sin(fpYaw), 0, Math.cos(fpYaw));
      tweenTo(new THREE.Vector3(p.x - d.x * 17.5, 10.9, p.z - d.z * 17.5), new THREE.Vector3(p.x, 3.4, p.z), .5);
    }
    setView();
  }
  function setView() {
    const port = camera.aspect < 1, m = mode === "machine";
    camera.fov = fpOn() ? (port ? 80 : 68) : m ? (port ? 70 : 50) : (port ? 58 : 40); camera.updateProjectionMatrix();
    Object.assign(controls, m
      ? { minDistance: 7, maxDistance: 16, minAzimuthAngle: active.place.yaw - 1.0, maxAzimuthAngle: active.place.yaw + 1.0 }
      : { minDistance: 8, maxDistance: 30, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity });
  }
  function resize() {
    const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    camera.aspect = w / h; setView();
    outlineU.res.value.set(w * pr, h * pr);
    outlineU.px.value = (w < 600 ? 2.0 : 2.4) * pr;
  }
  resize(); addEventListener("resize", resize);

  // ---------- UI data ----------
  ui.loading(.85, "Painting the prize icons…");
  ui.setIcons(makeIcons());
  ui.setCoins(save.coins); ui.setScore(save.score);
  const persist = () => store.save(save);

  // ---------- spots ----------
  // (r 3.2: pushing the cart, its front meets the machine with her ~7.1 from the machine's middle - just outside 2.4)
  const spots = games.map(g => ({ kind: "machine", g, x: g.place.x + Math.sin(g.place.yaw) * 4.6, z: g.place.z + Math.cos(g.place.yaw) * 4.6, r: 3.2 }));
  spots.push({ kind: "corral", x: CORRAL.x, z: CORRAL.z - 3.2, r: 2.6 });
  spots.push({ kind: "cashier", x: CASHIER.x + 3.1, z: CASHIER.z, r: 3.2 });
  spots.push({ kind: "swap", x: SWAP.x - 3.1, z: SWAP.z, r: 3.2 });
  // the shelf's middle is behind the central rows, out of reach: it's used from either end
  for (const sx of [-1, 1]) spots.push({ kind: "shelf", x: SHELF.x + sx * 6.3, z: SHELF.z + 2.6, r: 2.6 });
  let near = null;

  // ---------- goals: a short guided loop, then the collection ----------
  function refreshGoals() {
    const g = save.goals;
    if (!(g.cart && g.win3 && g.swap && g.checkout)) {
      ui.setGoals([
        { text: "Grab a cart by the door", done: !!g.cart },
        { text: `Win 3 friends (${Math.min(3, save.wins)}/3)`, done: !!g.win3 },
        { text: "Swap 5 for a BIG friend", done: !!g.swap },
        { text: "Check out at the cashier", done: !!g.checkout },
      ]);
    } else {
      ui.setGoals([
        ...save.reqs.map(r => ({ text: r.text + (r.n > 1 && r.kind !== "checkout" ? ` (${Math.min(r.have, r.n)}/${r.n})` : ""), done: r.have >= r.n })),
        { text: `Collection ${PLUSH.filter(q => save.owned[q.key]).length}/24 · big ${SPECIES.filter(sp => save.big[sp.id]).length}/4`, done: PLUSH.every(q => save.owned[q.key]) },
      ], `Day ${save.day} requests`);
    }
  }
  function goal(key) { if (!save.goals[key]) { save.goals[key] = true; persist(); refreshGoals(); ui.toast("Goal complete!"); audio.sfx.coin(); } }
  refreshGoals();
  const WARD = { hood: HOODS, face: FACE_OPTS, height: HEIGHTS, hair: HAIRS, top: TOPS, bottom: BOTTOMS, shoes: SHOES };
  function addScore(n) {
    const before = save.score;
    save.score += n; persist(); ui.setScore(save.score); ui.floatScore(`+${n}`);
    for (const t of progress.newlyUnlocked(before, save.score, WARD)) ui.banner(`Unlocked: ${t}!`);
  }
  // daily requests (once the starter goals are done)
  const starterDone = () => { const g = save.goals; return !!(g.cart && g.win3 && g.swap && g.checkout); };
  function req(ev, data) {
    if (!starterDone() || TEST) return;
    const done = progress.track(save, ev, data);
    if (!done.length) return;
    persist(); refreshGoals();
    for (const r of done) ui.banner(`Request done: ${r.text} ✔`);
    audio.sfx.coin();
    if (progress.dayComplete(save)) setTimeout(finishDay, 1200);
  }
  function finishDay() {
    if (ui.isModal()) return setTimeout(finishDay, 500);   // (after the win card is closed)
    const day = save.day, rw = progress.dayReward(day);
    save.coins += rw.coins; ui.setCoins(save.coins);
    progress.nextDay(save, rnd); persist(); pickEvent();
    addScore(rw.stars); refreshGoals();
    audio.sfx.win(); kid.setFace("happy", 2.4);
    ui.showDayDone(day, rw, save.day, save.reqs);
  }

  // a won friend flies from the prize door into the cart
  const flights = [];
  function flyToCart(key, from) {
    const p = PLUSH_BY_KEY[key], m = makePlush(p.species, p.acc);
    m.position.copy(from); m.scale.setScalar(.8); scene.add(m);
    flights.push({ m, key, t: 0, from: from.clone() });
  }
  function stepFlights(dt) {
    for (const f of [...flights]) {
      f.t += dt / .75;
      const to = new THREE.Vector3(); cart.obj.basket.getWorldPosition(to); to.y += .6;
      const k = Math.min(1, f.t);
      f.m.position.lerpVectors(f.from, to, k); f.m.position.y += Math.sin(k * Math.PI) * 2.2;
      f.m.scale.setScalar(.8 - .3 * k); f.m.rotation.y += dt * 8;
      if (f.t >= 1) {
        f.m.removeFromParent(); flights.splice(flights.indexOf(f), 1);
        save.cart.push({ key: f.key }); persist(); layoutCart(); audio.sfx.plop();
      }
    }
  }

  // ---------- modes ----------
  let grabPress = 0, roundWins = 0;
  const owned = save.owned;
  const machineName = g => SPECIES_BY_ID[g.species].machine + (g.variant === "lucky" ? " · Lucky" : g.variant === "jackpot" ? " · Jackpot" : g === eventGame ? " · ★x2" : "");

  function startRound() {
    if (save.coins < 1) { ui.toast("Out of coins! The cashier gives free coins every day"); return; }
    if (cartUsed() >= CART_CAP) { ui.toast("Your cart is full! Check out at the cashier"); return; }
    save.coins--; persist(); ui.setCoins(save.coins); audio.sfx.coin();
    roundWins = 0;
    active.start();
    ui.setGrab("GRAB");
  }
  function enterMachine(g) {
    if (isLocked(g)) { ui.toast(`Win ${progress.MACHINE_UNLOCK[g.species] - save.wins} more friends to open this one`); return; }
    if (!cart.attached) { ui.toast("Grab a cart first! They're by the door"); return; }
    if (save.coins < 1) { ui.toast("Out of coins! The cashier gives free coins every day"); return; }
    mode = "machine"; active = g; g.setLive(true); rebuildRow(rowOf(g));
    ui.setMode("machine"); ui.setMachineName(machineName(g)); ui.setSet(save.seen, g.species);
    const cp = g.toW(5.3, 0, 3.6); parkCart(new THREE.Vector3(cp.x, 0, cp.z), g.place.yaw - Math.PI / 2);
    const k = g.toW(0, 0, 3.9);   // (in the middle, in front of the controls; the camera looks over her head)
    kidBody.setNextKinematicTranslation({ x: k.x, y: KID_Y, z: k.z }); kidBody.setTranslation({ x: k.x, y: KID_Y, z: k.z }, true);
    kid.root.position.set(k.x, 0, k.z); kidYaw = g.place.yaw + Math.PI; kid.root.rotation.y = kidYaw;
    setView();
    const port = camera.aspect < 1;
    const c = g.toW(0, port ? 7.6 : 8, 12.4), t = g.toW(0, port ? 3.6 : 4, 0);
    mAz = mH = 0;
    if (fp) {                                       // looking at the prizes through the glass
      aimAtPrizes();
      tweenTo(fpEye(), fpLook());
    } else tweenTo(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(t.x, t.y, t.z));
    startRound();
  }
  function exitMachine() {
    if (active.playing) { ui.toast("Wait for the claw!"); return; }
    const g = active; active = null; mode = "walk";
    g.setLive(false); rebuildRow(rowOf(g));
    // turn toward the aisle so the cart comes back in front, away from the machine
    kidYaw = g.place.yaw; kid.root.rotation.y = kidYaw;
    kidBody.setRotation({ x: 0, y: Math.sin(kidYaw / 2), z: 0, w: Math.cos(kidYaw / 2) }, true);
    attachCart();
    ui.setMode("walk"); setView();
    const p = kid.root.position, back = g.toW(0, 0, 18);
    const dir = new THREE.Vector3(back.x - p.x, 0, back.z - p.z).setLength(15);
    dir.setLength(17.5);
    if (fp) { fpYaw = kidYaw; fpPitch = -.12; tweenTo(fpEye(), fpLook()); return; }
    tweenTo(new THREE.Vector3(p.x + dir.x, 10.9, p.z + dir.z), new THREE.Vector3(p.x, 3.4, p.z));
  }
  function onGame(g, ev, data) {
    if (ev === "win") {
      const key = data.key, p = PLUSH_BY_KEY[key], first = !save.seen[key];
      const shiny = !TEST && rnd() < .06;                       // a rare sparkly copy: triple stars
      audio.sfx.win(); kid.setFace("happy", 2.6);
      const opened = progress.openSpecies(save).length;
      save.seen[key] = true; save.wins++; if (shiny) save.shiny[key] = true; persist();
      const combo = g === active && roundWins >= 1;               // a second friend from the same grab
      addScore((POINTS[p.tier] || 10) * (shiny ? 3 : 1) * (combo ? 2 : 1) * (g === eventGame ? 2 : 1));
      if (combo) { ui.banner(`COMBO x${roundWins + 1}! Double stars`); kid.setFace("wow", 1.2); }
      if (!TEST) { ui.confetti(shiny || combo ? 90 : 45); shake(shiny || combo ? .22 : .12); }
      req("win", { key });
      if (!TEST && progress.openSpecies(save).length > opened) {
        const sp = progress.openSpecies(save).at(-1);
        paintLocks(); setTimeout(() => ui.showUnlock(`${sp.machine} is open!`, `A new row of machines full of ${sp.name}s. Go take a look!`), 1600);
      }
      flyToCart(key, data.pos);
      if (save.wins >= 3) goal("win3");
      if (g === active) { ui.setSet(save.seen, g.species); roundWins++; }
      if ((first || shiny) && !TEST) ui.showWin(p, first ? 1 : 2, undefined, shiny); else ui.toast(`${p.name} · into the cart!`);
      window.WINS = (window.WINS || 0) + 1;
    }
    if (g !== active) return;
    if (ev === "slip") {
      const h = g.head.translation(), l = g.toL(h.x, h.z), close = l.x < 0 && l.z > 0;   // (slipped on the way to the chute)
      ui.toast(close ? "Nooo, sooo close!" : "It slipped!"); audio.sfx.slip(); kid.setFace("sad", close ? 2.4 : 1.8);
      if (close && !TEST) shake(.1);
    }
    if (ev === "near" && !TEST) slowT = .85;   // slow motion as the friend is carried over the chute
    if (ev === "miss") { ui.toast("So close!"); audio.sfx.miss(); kid.setFace("sad", 1.4); }
    if (ev === "grab") { audio.sfx.grab(); kid.setFace("wow", 1.0); }
    if (ev === "open") audio.sfx.open();
    if (ev === "clack") audio.sfx.clack();
    if (ev === "thud") audio.sfx.thud(data);
    if (ev === "end") {
      ui.setGrab("PLAY", save.coins > 0 ? "1 coin" : "no coins", save.coins < 1);
      if (TEST) testRounds.push({ ...data, won: roundWins > 0 });
    }
  }
  for (const g of games) g.on = (ev, data) => onGame(g, ev, data);

  function rebuildKid() {
    const old = kid.root, p = old.position.clone();
    scene.remove(old);
    old.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    kid = makeKid(save.outfit);
    kid.root.position.copy(p); kid.root.rotation.y = kidYaw;
    scene.add(kid.root);
    if (cart.attached) { kid.root.add(cart.obj.root); cart.obj.root.position.set(0, 0, CART_Z); cart.obj.root.rotation.set(0, 0, 0); }
  }
  let walkCam = null;
  function openWardrobe() {
    if (mode !== "walk" || ui.isModal()) return;
    mode = "wardrobe"; ui.setMode("wardrobe"); setView();
    walkCam = { pos: camera.position.clone(), target: controls.target.clone() };
    camAxes();
    kidYaw = Math.atan2(-fwd.x, -fwd.z);
    const p = kid.root.position, dir = new THREE.Vector3(Math.sin(kidYaw), 0, Math.cos(kidYaw));
    const camR = new THREE.Vector3().crossVectors(dir.clone().negate(), UP).normalize();
    const port = camera.aspect < 1;
    const tgt = p.clone().add(new THREE.Vector3(0, port ? .1 : 1.9, 0)).addScaledVector(camR, port ? 0 : 1.65);
    tweenTo(p.clone().addScaledVector(dir, port ? 10 : 8.5).add(new THREE.Vector3(0, 2.6, 0)).addScaledVector(camR, port ? 0 : 1.65), tgt);
    ui.openWardrobe(WARD, save.outfit, (kind, id) => {
      save.outfit = { ...save.outfit, [kind]: id }; persist();
      rebuildKid(); if (kind !== "face") kid.setFace("happy", 1.1); audio.sfx.button();
    }, (kind, id) => { const c = progress.starsFor(kind, id); return TEST || save.score >= c ? 0 : c; });
  }
  function closeWardrobe() {
    mode = "walk"; ui.setMode("walk"); setView();
    const d = walkCam.target.clone().sub(walkCam.pos).setY(0).normalize(), p = kid.root.position;
    if (fp) { fpYaw = Math.atan2(d.x, d.z); tweenTo(fpEye(), fpLook()); return; }
    tweenTo(new THREE.Vector3(p.x - d.x * 17.5, 10.9, p.z - d.z * 17.5), new THREE.Vector3(p.x, 3.4, p.z));
  }
  // drag to spin the kid while the wardrobe is open
  let spin = null;
  canvas.addEventListener("pointerdown", e => { if (mode === "wardrobe") spin = e.clientX; });
  addEventListener("pointermove", e => { if (spin !== null && mode === "wardrobe") { kidYaw += (e.clientX - spin) * .012; spin = e.clientX; } });
  addEventListener("pointerup", () => { spin = null; });
  let fpDrag = null;
  canvas.addEventListener("pointerdown", e => { if (fpOn()) fpDrag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  addEventListener("pointermove", e => {
    if (!fpDrag || e.pointerId !== fpDrag.id || !fpOn()) return;
    if (mode === "machine") {                  // (drag the view: she steps the other way)
      mAz = THREE.MathUtils.clamp(mAz - (e.clientX - fpDrag.x) * .004 * S.sens, -.95, .95);
      mH = THREE.MathUtils.clamp(mH + (e.clientY - fpDrag.y) * .006 * S.sens, -1, 1.6);
    } else {
      fpYaw += (e.clientX - fpDrag.x) * .005 * S.sens;    // (drag the view, like the third-person camera)
      fpPitch = THREE.MathUtils.clamp(fpPitch + (e.clientY - fpDrag.y) * .004 * S.sens, -1.1, 1);
    }
    fpDrag.x = e.clientX; fpDrag.y = e.clientY;
  });
  addEventListener("pointerup", e => { if (fpDrag && e.pointerId === fpDrag.id) fpDrag = null; });

  function doAction() {
    if (!near || ui.isModal()) return;
    if (near.kind === "machine") enterMachine(near.g);
    else if (near.kind === "corral") {
      if (cart.attached) { ui.toast("You already have a cart"); return; }
      cart.hidden = false; save.cartHidden = false;
      attachCart(); audio.sfx.cart(); goal("cart");
    } else if (near.kind === "cashier") {
      cashierNpc.setFace("happy", 1.5);
      const plan = checkoutPlan();
      // (no coins, daily coins taken and nothing to sell: the game would be stuck until tomorrow - a small top-up)
      const claimed = save.ticketDay === store.today(), broke = claimed && save.coins < 1 && plan.dupes === 0;
      ui.showCashier({ claimed, broke, items: save.cart.length, ...plan }, () => {
        const n = broke ? 3 : 5;
        save.ticketDay = store.today(); save.coins += n; persist(); ui.setCoins(save.coins);
        ui.toast(`+${n} coins! Have fun`); audio.sfx.coin();
      }, checkout);
    } else if (near.kind === "swap") {
      swapNpc.setFace("happy", 1.5);
      ui.showSwap(save.cart.filter(it => !it.big).length, doSwap);
    } else if (near.kind === "shelf") ui.showCollection(owned, undefined, save.shiny);
  }
  // 5 small friends (commons first) become one big friend
  function doSwap(species) {
    const smalls = save.cart.filter(it => !it.big);
    if (smalls.length < 5) return;
    // trade duplicates first (already on the shelf, or a second copy in the cart), then the most common ones
    const order = { common: 0, uncommon: 1, rare: 2 }, seenInCart = {};
    const ranked = smalls.map(it => { const dup = !!save.owned[it.key] || !!seenInCart[it.key]; seenInCart[it.key] = true; return { it, dup }; });
    const give = ranked.sort((a, b) => (b.dup - a.dup) || (order[PLUSH_BY_KEY[a.it.key].tier] - order[PLUSH_BY_KEY[b.it.key].tier])).slice(0, 5).map(r => r.it);
    for (const it of give) save.cart.splice(save.cart.indexOf(it), 1);
    save.cart.push({ big: species }); persist(); layoutCart();
    addScore(50); audio.sfx.swap(); kid.setFace("happy", 2.4); swapNpc.setFace("happy", 2);
    ui.toast(`A BIG ${SPECIES_BY_ID[species].name}! It's in your cart`);
    goal("swap"); req("swap");
  }
  // checkout: first copy of a friend goes to the shelf, extra copies are bought back for 1 coin, big friends go on pedestals
  function checkoutPlan() {
    const have = { ...save.owned }; let fresh = 0, dupes = 0, bigs = 0;
    for (const it of save.cart) {
      if (it.big) { bigs++; continue; }
      if (have[it.key]) dupes++; else { fresh++; have[it.key] = 1; }
    }
    return { fresh, dupes, bigs };
  }
  function checkout() {
    const { fresh, dupes, bigs } = checkoutPlan(), count = save.cart.length;
    for (const it of save.cart) {
      if (it.big) save.big[it.big] = (save.big[it.big] || 0) + 1;
      else save.owned[it.key] = (save.owned[it.key] || 0) + 1;
    }
    save.coins += dupes; save.cart = []; persist();
    ui.setCoins(save.coins); layoutCart(); room.setShelf(save.owned); room.setBig(save.big);
    audio.sfx.register(); kid.setFace("happy", 2); cashierNpc.setFace("happy", 2);
    ui.toast(`Thank you! ${fresh} new on your shelf${dupes ? ` · +${dupes} coin${dupes === 1 ? "" : "s"}` : ""}${bigs ? ` · ${bigs} big` : ""}`);
    goal("checkout"); refreshGoals(); req("checkout", { count });
    // a whole species collected: a one-time reward
    for (const sp of SPECIES) {
      if (save.sets[sp.id] || !PLUSH.filter(q => q.species === sp.id).every(q => save.owned[q.key])) continue;
      save.sets[sp.id] = true; save.coins += 10; ui.setCoins(save.coins); persist(); addScore(200);
      if (!TEST) setTimeout(() => ui.showSetDone(sp, { coins: 10, stars: 200 }), 900);
      break;
    }
  }
  function updatePrompt() {
    const p = kid.root.position;
    near = null;
    for (const s of spots) if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) { near = s; break; }
    if (!near) return ui.setAction(null);
    if (near.kind === "machine" && isLocked(near.g)) ui.setAction(`Locked · win ${progress.MACHINE_UNLOCK[near.g.species] - save.wins} more friends`, true);
    else if (near.kind === "machine") ui.setAction(!cart.attached ? "Grab a cart first (by the door)" : save.coins > 0 ? `Play ${machineName(near.g)} · 1 coin` : "Out of coins · visit the cashier", !cart.attached || save.coins < 1);
    else if (near.kind === "corral") ui.setAction(cart.attached ? "You have a cart" : "Take a cart", cart.attached);
    else if (near.kind === "cashier") ui.setAction("Cashier · coins & checkout");
    else if (near.kind === "swap") ui.setAction("Big Swap · 5 small = 1 BIG");
    else ui.setAction(`Collection · ${PLUSH.filter(q => owned[q.key]).length}/24`);
  }

  // ---------- test autopilot ----------
  const testRounds = [];
  let autoTarget = null;
  function autopilot() {
    const g = active;
    if (g.state === "idle") { autoTarget = null; return { x: 0, z: 0, grab: testRounds.length < ROUNDS && save.coins > 0 }; }
    if (g.state !== "aim") return { x: 0, z: 0, grab: false };
    if (!autoTarget) {
      let best = null;
      for (const p of g.plush) { const t = p.body.translation(); if (!best || t.y > best.y) best = { p, y: t.y, t }; }
      const l = g.toL(best.t.x, best.t.z);
      autoTarget = { x: THREE.MathUtils.clamp(l.x + (rnd() - .5) * .24, -IX + .65, IX - .65), z: THREE.MathUtils.clamp(l.z + (rnd() - .5) * .24, -IZ + .65, IZ - .65) };
    }
    const dx = autoTarget.x - g.pos.x, dz = autoTarget.z - g.pos.z, d = Math.hypot(dx, dz);
    if (d < .05 && Math.hypot(g.vel.x, g.vel.z) < .05 && Math.hypot(g.sway.x, g.sway.z) < .03) return { x: 0, z: 0, grab: true };
    return { x: THREE.MathUtils.clamp(dx * 3 - g.vel.x * .6, -1, 1), z: THREE.MathUtils.clamp(dz * 3 - g.vel.z * .6, -1, 1), grab: false };
  }

  // ---------- steps ----------
  function walkStep(dt, ev) {
    const k = ui.keyDir(), j = ui.input.walk;
    const mx = k.x || j.x, my = k.y || j.y;
    camAxes();
    const mv = right.clone().multiplyScalar(mx).addScaledVector(fwd, my);
    if (TEST === "walk") {
      const t = spots[0], p0 = kidBody.translation();
      mv.set(t.x - p0.x, 0, t.z - p0.z);
      if (mv.length() < .3) { mv.set(0, 0, 0); window.ARRIVED = true; }
    }
    if (mv.length() > 1) mv.normalize();
    kidVel.lerp(mv.multiplyScalar(WALK), Math.min(1, dt * 9));
    kidBody.setNextKinematicRotation({ x: 0, y: Math.sin(kidYaw / 2), z: 0, w: Math.cos(kidYaw / 2) });
    cc.computeColliderMovement(kidColRef, { x: kidVel.x * dt, y: 0, z: kidVel.z * dt });
    const m = cc.computedMovement(), p = kidBody.translation();
    kidBody.setNextKinematicTranslation({ x: p.x + m.x, y: KID_Y, z: p.z + m.z });
    kidSpeed = Math.min(1, Math.hypot(m.x, m.z) / (WALK * dt));
    if (fp) kidYaw = fpYaw;
    else if (kidVel.lengthSq() > .3) kidYaw += angDiff(kidYaw, Math.atan2(kidVel.x, kidVel.z)) * Math.min(1, dt * 11);
    if (ev.action && !ui.isModal()) doAction();
    if (ev.wardrobe) openWardrobe();
    if (ev.hideCart && !ui.isModal()) toggleCart();
    if (ev.view && !ui.isModal() && !tween) setFirstPerson(!fp);
    if (ev.back && !ui.isModal()) pause();
  }
  function machineStep(dt, ev) {
    const g = active;
    if (ev.back && !ui.isModal()) return exitMachine();
    if (ev.view && !ui.isModal() && !tween) setFirstPerson(!fp);
    let inp;
    if (TEST === "claw") inp = autopilot();
    else {
      const s = ui.isModal() ? { x: 0, y: 0 } : ui.stickDir();
      camAxes();
      const v = right.clone().multiplyScalar(s.x).addScaledVector(fwd, s.y);
      const l = g.dirL(v.x, v.z);
      inp = { x: l.x, z: l.z, grab: false };
      if (ev.grab && !ui.isModal()) {
        if (g.state === "aim") inp.grab = true;
        else if (g.state === "idle") startRound();
      }
    }
    if (TEST === "claw" && inp.grab && g.state === "idle") { startRound(); inp.grab = false; }
    if (inp.grab) { grabPress = 1; tutFlags.dropped = true; }
    g.m.tiltStick(inp.x, inp.z);
    g.step(dt, inp);
    ui.setTimer(g.timer, g.state === "aim");
  }

  // ---------- first-run tutorial: teaches the controls step by step (instead of a permanent hint line) ----------
  const TOUCH = matchMedia("(pointer: coarse)").matches, KB = s => s.split(" ").map(k => `<kbd>${k}</kbd>`).join("");
  const TUT = [
    { id: "walk", title: "Walk around", text: TOUCH ? "Drag the joystick to walk." : `Press ${KB("W A S D")} to walk.` },
    { id: "look", title: "Look around", text: TOUCH ? "Drag the screen to turn the camera." : `Turn the camera with the ${KB("← →")} arrow keys, or drag the screen.` },
    { id: "cart", title: "Grab a cart", text: `The carts are by the door. Walk up to them and ${TOUCH ? "tap <b>Take a cart</b>" : `press ${KB("E")}`}.` },
    { id: "hide", title: "Cart in the way?", text: `${TOUCH ? "Tap the cart counter" : `Press ${KB("H")} or click the cart counter`} to put it away, and again to bring it back. Your friends stay inside.` },
    { id: "machine", title: "Play a claw machine", text: `Walk up to a machine and ${TOUCH ? "tap <b>Play</b>" : `press ${KB("E")}`}. One play costs 1 coin.` },
    { id: "claw", title: "Catch a friend!", text: TOUCH ? "Move the claw with the stick, then press <b>GRAB</b>." : `Move the claw with ${KB("W A S D")}, then press ${KB("Space")} to grab.` },
    { id: "ward", title: "Dress up", text: `${TOUCH ? "Tap the shirt button" : `Press ${KB("C")} or click the shirt button`} any time to change your tee and shorts.`, ok: true },
  ];
  const tutFlags = { toggled: false, dropped: false };
  let tut = null;
  const camAz = () => Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  function tutGo(i) {
    if (i >= TUT.length) return tutEnd("You're all set! Have fun");
    const st = TUT[i], p = kid.root.position;
    tut = { i, pos: p.clone(), az: camAz(), turned: 0 };
    tutFlags.toggled = tutFlags.dropped = false;
    ui.showTut(st, i, TUT.length, () => tutEnd("Tutorial skipped"), st.ok ? () => tutGo(i + 1) : null, mode === "walk" || mode === "machine");
  }
  function tutEnd(msg) {
    tut = null; save.tutorial = true; persist();
    ui.hideTut(mode === "walk"); ui.toast(msg, 1800);
  }
  function tutTick() {
    if (!tut || ui.isModal()) return;
    const az = camAz(); tut.turned += Math.abs(angDiff(tut.az, az)); tut.az = az;
    const done = {
      walk: () => tut.pos.distanceTo(kid.root.position) > 3,
      look: () => tut.turned > .8,
      cart: () => cart.attached,
      hide: () => tutFlags.toggled,
      machine: () => mode === "machine",
      claw: () => tutFlags.dropped,
      ward: () => mode === "wardrobe",
    }[TUT[tut.i].id]();
    if (done) tutGo(tut.i + 1);
  }
  const startTutorial = () => { if (!save.tutorial && !TEST) tutGo(0); };
  if (!TITLE) startTutorial();

  // ---------- loop ----------
  let last = performance.now(), accum = 0, frames = 0;
  if (save.hasCart || Q.has("cart") || TEST === "claw" || TEST === "machine") attachCart();
  if (Q.get("fill")) { for (const k of PLUSH.slice(0, +Q.get("fill")).map(p => p.key)) save.cart.push({ key: k }); if (Q.has("big")) save.cart.push({ big: "duck" }); }
  if (Q.get("yaw")) kidYaw = +Q.get("yaw");
  layoutCart();
  if (TEST === "claw" || TEST === "machine") enterMachine(games[0]);
  // scripted run through the whole loop: cart, 6 wins, big swap, checkout
  if (TEST === "flow") {
    const cs = spots.find(x => x.kind === "corral");
    kidBody.setTranslation({ x: cs.x, y: KID_Y, z: cs.z }, true);
    setTimeout(() => {
      updatePrompt(); doAction();
      const g = games[0], keys = ["duck-plain", "duck-frog", "duck-straw", "duck-plain", "duck-sailor", "duck-flower"];
      keys.forEach(k => onGame(g, "win", { key: k, pos: new THREE.Vector3(cs.x, 2, cs.z - 3) }));
      const waitCart = () => { if (save.cart.length < keys.length) return setTimeout(waitCart, 200); afterWins(); };
      setTimeout(waitCart, 300);
      const afterWins = () => {
        const beforeSwap = save.cart.length;
        doSwap("seal");
        const afterSwap = save.cart.map(it => it.big ? "BIG-" + it.big : it.key);
        const plan = checkoutPlan();
        checkout();
        window.TEST_RESULT = { beforeSwap, afterSwap, plan, owned: save.owned, big: save.big, cart: save.cart.length, score: save.score, coins: save.coins, goals: save.goals, hasCart: cart.attached };
        window.TEST_DONE = true;
      };
    }, 800);
  }
  if (TEST === "wardrobe") openWardrobe();

  // ---------- title screen, pause, settings ----------
  let paused = false, titleT = 0;
  // juice: slow motion over the chute, a little camera shake on wins
  let slowT = 0, timeScale = 1, shakeT = 0, shakeA = 0;
  function shake(a) { shakeA = a; shakeT = .35; }
  function applySettings(patch) {
    S = settings.set(patch);
    audio.setVolumes(S.music, S.sfx);
    controls.rotateSpeed = S.sens;
    // (graphics: the render target and the texture sizes are set at load, so it reloads - into the game if playing)
    if ("quality" in patch) restart(mode !== "title");
  }
  function restart(play) { try { if (play) sessionStorage.setItem("cf-autoplay", "1"); } catch {} location.reload(); }
  const resetProgress = () => { store.save({}); restart(true); };
  const openSettings = back => ui.showSettings(S, applySettings, resetProgress, back);
  function pause() { if (paused || ui.isModal() || tween) return; paused = true; pauseMenu(); }
  function pauseMenu() {
    ui.showPause({
      resume: () => { paused = false; }, settings: () => openSettings(pauseMenu),
      keys: () => ui.showControls(TOUCH, () => { paused = false; tutGo(0); }, pauseMenu), title: () => restart(false),
    });
  }
  function play() {
    audio.start();
    // phones: full screen, held sideways (where the browser allows locking it)
    if (TOUCH) (async () => { try { await document.documentElement.requestFullscreen(); await screen.orientation.lock("landscape"); } catch {} })();
    ui.hideTitle(); mode = "walk"; ui.setMode("walk");
    kidYaw = Math.PI; kid.root.rotation.y = kidYaw; kidPrev.yaw = kidCur.yaw = kidYaw;
    if (cart.attached) cart.obj.root.visible = !cart.hidden;
    const p = kid.root.position;
    tweenTo(new THREE.Vector3(p.x, 10.9, p.z + 17.5), new THREE.Vector3(p.x, 3.4, p.z), 1.4);
    startTutorial();
  }
  if (TITLE) {
    controls.enabled = false;
    kidYaw = 0; kid.root.rotation.y = 0; cart.obj.root.visible = false;
    const hasSave = save.wins > 0 || save.tutorial || save.hasCart || save.score > 0;
    ui.showTitle(hasSave, { play, cont: play, fresh: resetProgress, settings: () => openSettings(), credits: () => ui.showCredits() });
  }
  ui.ready();
  const frame = now => {
    const dt = Math.max(0, Math.min(.1, (now - last) / 1000)); last = now;   // rAF clocks can start behind performance.now()
    let steps = 0;
    if (TEST) steps = TEST === "claw" ? 24 : 6;
    else {
      slowT = Math.max(0, slowT - dt);
      timeScale += ((slowT > 0 ? .3 : 1) - timeScale) * Math.min(1, dt * 10);
      accum += dt * timeScale; while (accum >= STEP && steps < 4) { accum -= STEP; steps++; } accum = Math.min(accum, STEP);
    }   // (a long hitch is dropped, not caught up later)
    const ev = steps > 0 ? ui.consume() : {};   // presses wait for the next physics step instead of being dropped
    if (ev.keys && !ui.isModal()) ui.showControls(TOUCH, () => tutGo(0));
    if (ev.pause && (mode === "walk" || mode === "machine")) pause();
    if (paused) steps = 0;
    if (window.FREEZE) {
      steps = 0;
      if (!window.FROZEN) {
        const g = window.FREEZE, h = g.head.translation(), f = g.toW(0, 0, 1), o = g.toW(0, 0, 0);
        const fx = f.x - o.x, fz = f.z - o.z;
        tween = null; controls.enabled = false;
        controls.target.set(h.x, h.y - .75, h.z);
        camera.position.set(h.x + fx * 5.2 + fz * 1.4, h.y + .3, h.z + fz * 5.2 - fx * 1.4);
        camera.fov = 40; camera.updateProjectionMatrix();
        window.FROZEN = { state: g.state, angles: g.prongAngles(), headY: +h.y.toFixed(2), target: g.target && +g.target.toFixed(2) };
        console.warn("FROZEN " + JSON.stringify(window.FROZEN));
      }
    }
    for (let i = 0; i < steps; i++) {
      const e = i === 0 ? ev : {};
      if (mode === "walk") walkStep(STEP, e);
      else if (mode === "machine") machineStep(STEP, e);
      else if (mode === "wardrobe" && e.back && !tween) closeWardrobe();
      world.step();
      for (const g of games) g.after(STEP);
      const t = kidBody.translation();
      Object.assign(kidPrev, kidCur);
      Object.assign(kidCur, { x: t.x, z: t.z, yaw: kidYaw });
      if (Math.hypot(kidCur.x - kidPrev.x, kidCur.z - kidPrev.z) > 1.5) Object.assign(kidPrev, kidCur);   // a teleport
    }
    // kid visual + camera follow
    if (mode === "walk") {
      const a = TEST ? 1 : Math.min(1, accum / STEP);
      const px = kidPrev.x + (kidCur.x - kidPrev.x) * a, pz = kidPrev.z + (kidCur.z - kidPrev.z) * a;
      const dx = px - kid.root.position.x, dz = pz - kid.root.position.z;
      kid.root.position.set(px, 0, pz);
      kid.root.rotation.y = kidPrev.yaw + angDiff(kidPrev.yaw, kidCur.yaw) * a;
      if (!tween) { camera.position.x += dx; camera.position.z += dz; controls.target.x += dx; controls.target.z += dz; }
      updatePrompt();
    }
    if (mode === "wardrobe") kid.root.rotation.y = kidYaw;
    stepFlights(paused ? 0 : dt);
    cashierNpc.animate(dt, 0); swapNpc.animate(dt, 0);
    if (visitors) for (const l of visitors.update(paused ? 0 : dt, kid.root.position)) say(l.v.kid.root, l.text, 1600);
    if (mode === "walk") staffTalk();
    placeBubbles();
    room.update(dt, kid.root.position, camera.position, visitors ? visitors.list.filter(v => v.kid.root.visible).map(v => v.pos) : []);
    kid.animate(dt, mode === "walk" ? kidSpeed : 0, mode === "title" ? "wave" : mode === "machine" ? "reach" : cart.attached && !cart.hidden && mode === "walk" ? "push" : "walk");
    tutTick(dt);
    audio.levels(active ? active.motor : 0, active ? active.winch : 0);
    if (active) { grabPress = Math.max(0, grabPress - dt * 4); active.m.pressGrab(grabPress); }
    const look = ui.lookDir();
    if (mode === "wardrobe") kidYaw += look.x * 2.2 * dt;
    else if (fpOn()) {
      if (ui.isModal()) {}
      else if (mode === "machine") {
        mAz = THREE.MathUtils.clamp(mAz + look.x * 1.1 * S.sens * dt, -.95, .95); mH = THREE.MathUtils.clamp(mH + look.y * 1.6 * S.sens * dt, -1, 1.6);
        if (!tween) aimAtPrizes();
      } else { fpYaw -= look.x * 1.9 * S.sens * dt; fpPitch = THREE.MathUtils.clamp(fpPitch + look.y * 1.1 * S.sens * dt, -1.1, 1); }
    } else if ((look.x || look.y) && !tween && !ui.isModal()) {
      const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
      sph.theta = THREE.MathUtils.clamp(sph.theta - look.x * 1.9 * S.sens * dt, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      sph.phi = THREE.MathUtils.clamp(sph.phi + look.y * 1.1 * S.sens * dt, controls.minPolarAngle, controls.maxPolarAngle);
      sph.makeSafe();
      camera.position.copy(controls.target).add(off.setFromSpherical(sph));
    }
    if (mode === "title") {                           // the title screen: Kyoko waves by the door, the camera drifts
      titleT += dt;
      const a = .5 * Math.sin(titleT * .18), p = kid.root.position, port = camera.aspect < 1;
      const rgt = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      camera.position.set(p.x + Math.sin(a) * 9.5, 4.4, p.z + Math.cos(a) * 9.5);
      controls.target.copy(p).add(new THREE.Vector3(0, port ? .6 : 2.5, 0)).addScaledVector(rgt, port ? 0 : -2.6);
    }
    if (tween) {
      tween.t += dt / tween.dur;
      const k = ease(Math.min(1, tween.t));
      camera.position.lerpVectors(tween.p0, tween.p1, k);
      controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (tween.t >= 1) { tween = null; controls.enabled = mode !== "wardrobe" && !fpOn(); }
    }
    if (fpOn() && !tween) { camera.position.copy(fpEye()); controls.target.copy(fpLook()); camera.lookAt(controls.target); }
    else controls.update();
    const hide = fpOn() && (!tween || tween.t > .6);
    if (hide !== kidHidden) { kidHidden = hide; for (const c of kid.root.children) if (!cart.obj || c !== cart.obj.root) c.visible = !hide; }
    const f = controls.target;
    sun.position.set(f.x + 13, 24, f.z + 16); sun.target.position.set(f.x, 0, f.z);
    if (Q.get("cam") && frames < 3) { const c = Q.get("cam").split(",").map(Number); camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); controls.update(); }
    toppers.update(camera.position, controls.target, dt, mode !== "wardrobe", mode === "walk" && !fp);
    const sk = shakeT > 0 ? shakeA * shakeT / .35 : 0;
    shakeT = Math.max(0, shakeT - dt);
    const so = new THREE.Vector3((Math.random() - .5) * sk, (Math.random() - .5) * sk, 0).applyQuaternion(camera.quaternion);
    camera.position.add(so);
    // (light graphics: straight to the canvas - its own antialiasing, no extra full-screen target in GPU memory)
    if (!TEST || frames % 10 === 0 || window.TEST_DONE || window.FROZEN) S.quality === "low" ? renderer.render(scene, camera) : composer.render();
    camera.position.sub(so);
    if (++frames >= 5 && !tween && (TEST !== "machine" || frames > 40) && (TEST !== "walk" || window.ARRIVED) && (TEST !== "wardrobe" || frames > 30)) window.READY = true;
    if (TEST === "claw" && testRounds.length >= ROUNDS && !window.TEST_DONE) {
      window.TEST_RESULT = { rounds: testRounds, wins: window.WINS || 0 }; window.TEST_DONE = true;
    }
  };
  renderer.setAnimationLoop(frame);
  // (frame: one step of the main loop, for driving it at an exact frame rate in tests)
  window.CF = { games, get kid() { return kid; }, get mode() { return mode; }, kidBody, camera, controls, save, scene, renderer, frame, THREE, visitors, spots, world, RAPIER, get kidCol() { return kidColRef; } };
}

main();
