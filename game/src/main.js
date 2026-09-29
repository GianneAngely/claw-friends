// Claw Friends prototype: walk around the arcade as a chibi kid, play any claw machine.
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { outlineU, bake, ANIME } from "./gfx.js";
import { makeMachine, MACHINE_BY_ID, IX, IZ } from "./machine.js";
import { makePlush, PLUSH, PLUSH_BY_KEY, SPECIES } from "./plush.js";
import { buildRoom, PLACES, START, SHELF, CASHIER, SWAP, CORRAL, cartModel } from "./room.js";
import { ClawGame } from "./claw.js";
import { makeKid, loadKid, DEFAULT_OUTFIT, HOODS, TOPS, BOTTOMS } from "./kid.js";
import * as ui from "./ui.js";
import * as store from "./save.js";
import * as audio from "./sfx.js";

const Q = new URLSearchParams(location.search);
const TEST = Q.get("test");
const G_KID = (0x0002 << 16) | 0x0001;
const STEP = 1 / 60, WALK = 7.5, KID_Y = 2.0, ROUNDS = +(Q.get("rounds") || 12), CART_CAP = 15, CART_Z = 2.2, CART_S = .82;
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
  audio.init();
  ui.onMute(() => audio.toggleMute(), audio.isMuted());
  ui.onMusic(() => audio.toggleMusic(), audio.isMusicOn());
  await document.fonts.load("700 40px Fredoka");
  await RAPIER.init();
  await loadKid();
  if (Q.has("fresh")) store.save({});
  const save = store.load();

  // ---------- renderer ----------
  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xDCEFFB);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 300);
  // soft glow on the brightest areas, like a lit illustration
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .22, .35, 1.04);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xE2D4F4, 2.2));
  const sun = new THREE.DirectionalLight(0xFFFFFF, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 90 });
  sun.shadow.bias = -.0008; sun.shadow.normalBias = .03; sun.shadow.intensity = .45;
  scene.add(sun, sun.target);

  // ---------- world ----------
  const world = new RAPIER.World({ x: 0, y: -40, z: 0 });
  world.integrationParameters.numSolverIterations = 8;
  const rnd = mulberry32(TEST ? 7 : (Date.now() & 0xffffff));
  const room = buildRoom(scene, RAPIER, world);
  const statics = new THREE.Group();
  const games = PLACES.map((p, i) => {
    const m = makeMachine(MACHINE_BY_ID[p.species]);
    m.root.position.set(p.x, 0, p.z); m.root.rotation.y = p.yaw;
    scene.add(m.root); m.root.updateMatrixWorld(true);
    statics.attach(m.body);
    const g = new ClawGame(RAPIER, world, scene, m, p, p.species, rnd);
    g.fill(); g.place = p; g.index = i;
    return g;
  });
  scene.add(bake(statics));
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
  if (Q.get("outfit")) { const [hood, top, bottom] = Q.get("outfit").split("."); save.outfit = { hood, top, bottom }; }
  let kid = makeKid(save.outfit); scene.add(kid.root);
  kid.root.position.set(START.x, 0, START.z); kid.root.rotation.y = Math.PI;
  const kidBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(START.x, KID_Y, START.z));
  const kidCol = world.createCollider(RAPIER.ColliderDesc.capsule(1.2, 1.25).setCollisionGroups(G_KID), kidBody);
  const cc = world.createCharacterController(.05); cc.setSlideEnabled(true);
  let kidYaw = Math.PI, kidSpeed = 0;
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
  const cart = { obj: cartModel(CART_S), attached: false, meshes: [] };
  cart.obj.root.visible = false; scene.add(cart.obj.root);
  function layoutCart() {
    for (const m of cart.meshes) m.removeFromParent();
    cart.meshes = [];
    let slot = 0;
    const smalls = save.cart.filter(it => !it.big), bigs = save.cart.filter(it => it.big);
    for (const it of smalls) {
      const p = PLUSH_BY_KEY[it.key]; if (!p) continue;
      const m = makePlush(p.species, p.acc), L = Math.floor(slot / 6), i = slot % 6;
      m.scale.setScalar(.5); m.position.set((i % 3 - 1) * .44, .36 + L * .4, (Math.floor(i / 3) - .5) * .46); m.rotation.y = Math.PI + (i - 2.5) * .2;
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
    cart.obj.root.visible = true;
    kid.root.add(cart.obj.root); cart.obj.root.position.set(0, 0, CART_Z); cart.obj.root.rotation.set(0, 0, 0);
    setKidCollider(true);
    layoutCart();
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

  // ---------- camera ----------
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: .1, enablePan: false, minDistance: 8, maxDistance: 30, minPolarAngle: .3, maxPolarAngle: 1.3 });
  const at = (Q.get("at") || "").split(",").map(Number);
  if (at.length === 2 && at.every(Number.isFinite)) { START.x = at[0]; START.z = at[1]; kid.root.position.set(START.x, 0, START.z); kidBody.setTranslation({ x: START.x, y: KID_Y, z: START.z }, true); }
  controls.target.set(START.x, 3.4, START.z);
  camera.position.set(START.x, 3.4 + 7.5, START.z + 17.5);
  controls.update();
  let tween = null;
  function tweenTo(pos, tgt, dur = .8) { tween = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt }; controls.enabled = false; }
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function camAxes() { camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, UP).normalize(); }
  let mode = "walk", active = null;
  function setView() {
    const port = camera.aspect < 1, m = mode === "machine";
    camera.fov = m ? (port ? 70 : 50) : (port ? 58 : 40); camera.updateProjectionMatrix();
    Object.assign(controls, m
      ? { minDistance: 7, maxDistance: 11.6, minAzimuthAngle: active.place.yaw - 1.0, maxAzimuthAngle: active.place.yaw + 1.0 }
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
  ui.setIcons(makeIcons());
  ui.setCoins(save.coins); ui.setScore(save.score);
  const persist = () => store.save(save);

  // ---------- spots ----------
  const spots = games.map(g => ({ kind: "machine", g, x: g.place.x + Math.sin(g.place.yaw) * 4.6, z: g.place.z + Math.cos(g.place.yaw) * 4.6, r: 2.4 }));
  spots.push({ kind: "corral", x: CORRAL.x, z: CORRAL.z - 3.2, r: 2.6 });
  spots.push({ kind: "cashier", x: CASHIER.x + 3.1, z: CASHIER.z, r: 3.2 });
  spots.push({ kind: "swap", x: SWAP.x - 3.1, z: SWAP.z, r: 3.2 });
  spots.push({ kind: "shelf", x: SHELF.x, z: SHELF.z + 2.9, r: 3 });
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
        { text: `Collect all friends (${PLUSH.filter(q => save.owned[q.key]).length}/24)`, done: PLUSH.every(q => save.owned[q.key]) },
        { text: `Big friends (${SPECIES.filter(sp => save.big[sp.id]).length}/4)`, done: SPECIES.every(sp => save.big[sp.id]) },
      ]);
    }
  }
  function goal(key) { if (!save.goals[key]) { save.goals[key] = true; persist(); refreshGoals(); ui.toast("Goal complete!"); audio.sfx.coin(); } }
  refreshGoals();
  function addScore(n) { save.score += n; persist(); ui.setScore(save.score); ui.floatScore(`+${n}`); }

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
  const machineName = g => SPECIES_BY_ID[g.species].machine;

  function startRound() {
    if (save.coins < 1) { ui.toast("Out of coins! The cashier gives free coins every day"); return; }
    if (cartUsed() >= CART_CAP) { ui.toast("Your cart is full! Check out at the cashier"); return; }
    save.coins--; persist(); ui.setCoins(save.coins); audio.sfx.coin();
    roundWins = 0;
    active.start();
    ui.setGrab("GRAB");
  }
  function enterMachine(g) {
    if (!cart.attached) { ui.toast("Grab a cart first! They're by the door"); return; }
    if (save.coins < 1) { ui.toast("Out of coins! The cashier gives free coins every day"); return; }
    mode = "machine"; active = g; g.setLive(true); rebuildRow(rowOf(g));
    ui.setMode("machine"); ui.setMachineName(machineName(g)); ui.setSet(save.seen, g.species);
    const cp = g.toW(5.3, 0, 3.6); parkCart(new THREE.Vector3(cp.x, 0, cp.z), g.place.yaw - Math.PI / 2);
    const k = g.toW(3.3, 0, 3.9);
    kidBody.setNextKinematicTranslation({ x: k.x, y: KID_Y, z: k.z }); kidBody.setTranslation({ x: k.x, y: KID_Y, z: k.z }, true);
    kid.root.position.set(k.x, 0, k.z); kidYaw = g.place.yaw + Math.PI; kid.root.rotation.y = kidYaw;
    setView();
    const port = camera.aspect < 1;
    const c = g.toW(0, port ? 6.4 : 6.8, 11.2), t = g.toW(0, port ? 4.3 : 4.7, 0);
    tweenTo(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(t.x, t.y, t.z));
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
    tweenTo(new THREE.Vector3(p.x + dir.x, 10.9, p.z + dir.z), new THREE.Vector3(p.x, 3.4, p.z));
  }
  function onGame(g, ev, data) {
    if (ev === "win") {
      const key = data.key, p = PLUSH_BY_KEY[key], first = !save.seen[key];
      audio.sfx.win(); kid.setFace("happy", 2.6);
      save.seen[key] = true; save.wins++; persist();
      addScore(POINTS[p.tier] || 10);
      flyToCart(key, data.pos);
      if (save.wins >= 3) goal("win3");
      if (g === active) { ui.setSet(save.seen, g.species); roundWins++; }
      if (first && !TEST) ui.showWin(p, 1); else ui.toast(`${p.name} · into the cart!`);
      window.WINS = (window.WINS || 0) + 1;
    }
    if (g !== active) return;
    if (ev === "slip") { ui.toast("It slipped!"); audio.sfx.slip(); kid.setFace("sad", 1.8); }
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
    mode = "wardrobe"; ui.setMode("wardrobe");
    walkCam = { pos: camera.position.clone(), target: controls.target.clone() };
    camAxes();
    kidYaw = Math.atan2(-fwd.x, -fwd.z);
    const p = kid.root.position, dir = new THREE.Vector3(Math.sin(kidYaw), 0, Math.cos(kidYaw));
    const camR = new THREE.Vector3().crossVectors(dir.clone().negate(), UP).normalize();
    const port = camera.aspect < 1;
    const tgt = p.clone().add(new THREE.Vector3(0, port ? .1 : 1.9, 0)).addScaledVector(camR, port ? 0 : 1.65);
    tweenTo(p.clone().addScaledVector(dir, port ? 10 : 8.5).add(new THREE.Vector3(0, 2.6, 0)).addScaledVector(camR, port ? 0 : 1.65), tgt);
    ui.openWardrobe({ hood: HOODS, top: TOPS, bottom: BOTTOMS }, save.outfit, (kind, id) => {
      save.outfit = { ...save.outfit, [kind]: id }; persist();
      rebuildKid(); kid.setFace("happy", 1.1); audio.sfx.button();
    });
  }
  function closeWardrobe() {
    mode = "walk"; ui.setMode("walk");
    const d = walkCam.target.clone().sub(walkCam.pos).setY(0).normalize(), p = kid.root.position;
    tweenTo(new THREE.Vector3(p.x - d.x * 17.5, 10.9, p.z - d.z * 17.5), new THREE.Vector3(p.x, 3.4, p.z));
  }
  // drag to spin the kid while the wardrobe is open
  let spin = null;
  canvas.addEventListener("pointerdown", e => { if (mode === "wardrobe") spin = e.clientX; });
  addEventListener("pointermove", e => { if (spin !== null && mode === "wardrobe") { kidYaw += (e.clientX - spin) * .012; spin = e.clientX; } });
  addEventListener("pointerup", () => { spin = null; });

  function doAction() {
    if (!near || ui.isModal()) return;
    if (near.kind === "machine") enterMachine(near.g);
    else if (near.kind === "corral") {
      if (cart.attached) { ui.toast("You already have a cart"); return; }
      attachCart(); audio.sfx.cart(); goal("cart");
    } else if (near.kind === "cashier") {
      cashierNpc.setFace("happy", 1.5);
      const plan = checkoutPlan();
      ui.showCashier({ claimed: save.ticketDay === store.today(), items: save.cart.length, ...plan }, () => {
        save.ticketDay = store.today(); save.coins += 5; persist(); ui.setCoins(save.coins);
        ui.toast("+5 coins! Have fun"); audio.sfx.coin();
      }, checkout);
    } else if (near.kind === "swap") {
      swapNpc.setFace("happy", 1.5);
      ui.showSwap(save.cart.filter(it => !it.big).length, doSwap);
    } else if (near.kind === "shelf") ui.showCollection(owned);
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
    goal("swap");
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
    const { fresh, dupes, bigs } = checkoutPlan();
    for (const it of save.cart) {
      if (it.big) save.big[it.big] = (save.big[it.big] || 0) + 1;
      else save.owned[it.key] = (save.owned[it.key] || 0) + 1;
    }
    save.coins += dupes; save.cart = []; persist();
    ui.setCoins(save.coins); layoutCart(); room.setShelf(save.owned); room.setBig(save.big);
    audio.sfx.register(); kid.setFace("happy", 2); cashierNpc.setFace("happy", 2);
    ui.toast(`Thank you! ${fresh} new on your shelf${dupes ? ` · +${dupes} coin${dupes === 1 ? "" : "s"}` : ""}${bigs ? ` · ${bigs} big` : ""}`);
    goal("checkout"); refreshGoals();
  }
  function updatePrompt() {
    const p = kid.root.position;
    near = null;
    for (const s of spots) if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) { near = s; break; }
    if (!near) return ui.setAction(null);
    if (near.kind === "machine") ui.setAction(!cart.attached ? "Grab a cart first (by the door)" : save.coins > 0 ? `Play ${machineName(near.g)} · 1 coin` : "Out of coins · visit the cashier", !cart.attached || save.coins < 1);
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
    if (kidVel.lengthSq() > .3) kidYaw += angDiff(kidYaw, Math.atan2(kidVel.x, kidVel.z)) * Math.min(1, dt * 11);
    if (ev.action && !ui.isModal()) doAction();
    if (ev.wardrobe) openWardrobe();
  }
  function machineStep(dt, ev) {
    const g = active;
    if (ev.back && !ui.isModal()) return exitMachine();
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
    if (inp.grab) grabPress = 1;
    g.m.tiltStick(inp.x, inp.z);
    g.step(dt, inp);
    ui.setTimer(g.timer, g.state === "aim");
  }

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
  ui.ready();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const ev = ui.consume();
    let steps = 0;
    if (TEST) steps = TEST === "claw" ? 24 : 6;
    else { accum += dt; while (accum >= STEP && steps < 4) { accum -= STEP; steps++; } }
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
      else if (e.back && !tween) closeWardrobe();
      world.step();
      for (const g of games) g.after(STEP);
    }
    // kid visual + camera follow
    const p = kidBody.translation();
    if (mode === "walk") {
      const dx = p.x - kid.root.position.x, dz = p.z - kid.root.position.z;
      kid.root.position.set(p.x, 0, p.z);
      kid.root.rotation.y = kidYaw;
      if (!tween) { camera.position.x += dx; camera.position.z += dz; controls.target.x += dx; controls.target.z += dz; }
      updatePrompt();
    }
    if (mode === "wardrobe") kid.root.rotation.y = kidYaw;
    stepFlights(dt);
    cashierNpc.animate(dt, 0); swapNpc.animate(dt, 0);
    room.update(dt, kid.root.position, camera.position);
    kid.animate(dt, mode === "walk" ? kidSpeed : 0, mode === "machine" ? "reach" : cart.attached && mode === "walk" ? "push" : "walk");
    audio.levels(active ? active.motor : 0, active ? active.winch : 0);
    if (active) { grabPress = Math.max(0, grabPress - dt * 4); active.m.pressGrab(grabPress); }
    const look = ui.lookDir();
    if (mode === "wardrobe") kidYaw += look.x * 2.2 * dt;
    else if ((look.x || look.y) && !tween && !ui.isModal()) {
      const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
      sph.theta = THREE.MathUtils.clamp(sph.theta - look.x * 1.9 * dt, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      sph.phi = THREE.MathUtils.clamp(sph.phi + look.y * 1.1 * dt, controls.minPolarAngle, controls.maxPolarAngle);
      sph.makeSafe();
      camera.position.copy(controls.target).add(off.setFromSpherical(sph));
    }
    if (tween) {
      tween.t += dt / tween.dur;
      const k = ease(Math.min(1, tween.t));
      camera.position.lerpVectors(tween.p0, tween.p1, k);
      controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (tween.t >= 1) { tween = null; controls.enabled = mode !== "wardrobe"; }
    }
    controls.update();
    const f = controls.target;
    sun.position.set(f.x + 13, 24, f.z + 16); sun.target.position.set(f.x, 0, f.z);
    if (Q.get("cam") && frames < 3) { const c = Q.get("cam").split(",").map(Number); camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); controls.update(); }
    if (!TEST || frames % 10 === 0 || window.TEST_DONE || window.FROZEN) composer.render();
    if (++frames >= 5 && !tween && (TEST !== "machine" || frames > 40) && (TEST !== "walk" || window.ARRIVED) && (TEST !== "wardrobe" || frames > 30)) window.READY = true;
    if (TEST === "claw" && testRounds.length >= ROUNDS && !window.TEST_DONE) {
      window.TEST_RESULT = { rounds: testRounds, wins: window.WINS || 0 }; window.TEST_DONE = true;
    }
  });
  window.CF = { games, get kid() { return kid; }, camera, controls, save, scene, renderer };
}

main();
