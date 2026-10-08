// HTML HUD: coins, context action, claw deck (arcade stick + GRAB), joystick, toasts, modals.
import { PLUSH, SPECIES } from "./plush.js";

const $ = id => document.getElementById(id);
const ICON = window.ICON;
let icons = {};
export function setIcons(m) { icons = m; }
const img = (key, miss) => `<img src="${icons[key] || ""}" class="${miss ? "miss" : ""}" alt="">`;

export const input = { stick: { x: 0, y: 0 }, walk: { x: 0, y: 0 }, grab: false, action: false, back: false, wardrobe: false, hideCart: false, keys: false, view: false, pause: false };
const keys = new Set();
let dragStick = null, dragJoy = null;

export function init() {
  window.injectDefs();
  ICON.duck = `<svg viewBox="-12 -12 144 134"><use href="#duck-plain"/></svg>`;
  document.querySelectorAll("[data-icon]").forEach(el => el.innerHTML = ICON[el.dataset.icon]);

  addEventListener("keydown", e => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") { input.grab = true; input.action = true; e.preventDefault(); }
    if (e.code === "Escape") input.back = true;
    if (e.code === "KeyC") input.wardrobe = true;
    if (e.code === "KeyH") input.hideCart = true;
    if (e.code === "KeyV") input.view = true;
    if (e.code === "KeyG") foldGoals();
    if (e.code.startsWith("Arrow")) e.preventDefault();
  });
  addEventListener("keyup", e => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  // arcade stick: drag the ball
  const stick = $("stick"), R = 38;
  const moveStick = e => {
    const r = stick.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(x, y); if (l > R) { x *= R / l; y *= R / l; }
    input.stick.x = x / R; input.stick.y = -y / R;
  };
  stick.addEventListener("pointerdown", e => { dragStick = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick.addEventListener("pointermove", e => { if (dragStick === e.pointerId) moveStick(e); });
  const endStick = e => { if (dragStick === e.pointerId) { dragStick = null; input.stick.x = input.stick.y = 0; } };
  stick.addEventListener("pointerup", endStick); stick.addEventListener("pointercancel", endStick);

  $("grab").addEventListener("pointerdown", e => { input.grab = true; e.preventDefault(); });
  $("action").addEventListener("click", e => { input.action = true; e.currentTarget.blur(); });
  $("back").addEventListener("click", e => { input.back = true; e.currentTarget.blur(); });
  $("w-done").addEventListener("click", e => { input.back = true; e.currentTarget.blur(); });
  $("wardBtn").addEventListener("click", e => { input.wardrobe = true; e.currentTarget.blur(); });
  $("cartPill").addEventListener("click", () => { input.hideCart = true; });
  $("keysBtn").addEventListener("click", e => { input.keys = true; e.currentTarget.blur(); });
  $("viewBtn").addEventListener("click", e => { input.view = true; e.currentTarget.blur(); });
  $("pauseBtn").addEventListener("click", e => { input.pause = true; e.currentTarget.blur(); });
  $("goals").addEventListener("click", foldGoals);
  $("goals").classList.toggle("folded", goalsFolded);

  // walking joystick (touch screens only)
  const joy = $("joy"), JR = 44;
  if (matchMedia("(pointer: coarse)").matches) joy.classList.remove("hide");
  const moveJoy = e => {
    const r = joy.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(x, y); if (l > JR) { x *= JR / l; y *= JR / l; }
    input.walk.x = x / JR; input.walk.y = -y / JR;
    $("knob").style.transform = `translate(${x}px, ${y}px)`;
  };
  joy.addEventListener("pointerdown", e => { dragJoy = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); });
  joy.addEventListener("pointermove", e => { if (dragJoy === e.pointerId) moveJoy(e); });
  const endJoy = e => { if (dragJoy === e.pointerId) { dragJoy = null; input.walk.x = input.walk.y = 0; $("knob").style.transform = ""; } };
  joy.addEventListener("pointerup", endJoy); joy.addEventListener("pointercancel", endJoy);

  ICON.tee = `<svg viewBox="-12 -12 24 24"><path d="M-4,-8 L-9.5,-5 L-11,0 L-7,1.2 L-7,8.5 L7,8.5 L7,1.2 L11,0 L9.5,-5 L4,-8 C3,-5.5 -3,-5.5 -4,-8 Z" fill="#FFA8D4" stroke="${window.INK}" stroke-width="2" stroke-linejoin="round"/><path d="M0,1.2 C-2.4,-.6 -2,-3 0,-1.6 C2,-3 2.4,-.6 0,1.2 Z" fill="#fff"/></svg>`;
  $("wardBtn").innerHTML = ICON.tee;
  ICON.kbd = `<svg viewBox="-12 -12 24 24"><rect x="-10.5" y="-6.5" width="21" height="13" rx="3" fill="#C9B6F2" stroke="${window.INK}" stroke-width="2.2"/>${[-6, -2, 2, 6].map(x => `<rect x="${x - 1.3}" y="-3.6" width="2.6" height="2.4" rx=".6" fill="#fff"/>`).join("")}<rect x="-5" y="1.6" width="10" height="2.4" rx=".8" fill="#fff"/></svg>`;
  $("keysBtn").innerHTML = ICON.kbd;
  ICON.eye = `<svg viewBox="-12 -12 24 24"><path d="M-10.5,0 C-6,-7.5 6,-7.5 10.5,0 C6,7.5 -6,7.5 -10.5,0 Z" fill="#fff" stroke="${window.INK}" stroke-width="2.2" stroke-linejoin="round"/><circle r="3.8" fill="#8ED8FF" stroke="${window.INK}" stroke-width="2"/><circle r="1.5" fill="${window.INK}"/></svg>`;
  $("viewBtn").innerHTML = ICON.eye;
  ICON.pause = `<svg viewBox="-12 -12 24 24"><rect x="-7" y="-8" width="5" height="16" rx="2" fill="#C9B6F2" stroke="${window.INK}" stroke-width="2.2"/><rect x="2" y="-8" width="5" height="16" rx="2" fill="#C9B6F2" stroke="${window.INK}" stroke-width="2.2"/></svg>`;
  $("pauseBtn").innerHTML = ICON.pause;
  ICON.note = `<svg viewBox="-12 -12 24 24"><path d="M-2,6 L-2,-7 L8,-9 L8,4" fill="none" stroke="${window.INK}" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="-4.6" cy="6.4" rx="3.4" ry="2.6" fill="#FFA8D4" stroke="${window.INK}" stroke-width="2"/><ellipse cx="5.4" cy="4.4" rx="3.4" ry="2.6" fill="#FFA8D4" stroke="${window.INK}" stroke-width="2"/></svg>`;
  ICON.star = `<svg viewBox="-12 -12 24 24"><path d="M0,-10 L2.9,-3.6 L9.8,-3 L4.6,1.6 L6.1,8.6 L0,5 L-6.1,8.6 L-4.6,1.6 L-9.8,-3 L-2.9,-3.6 Z" fill="#FF74B8" stroke="${window.INK}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  ICON.cart = `<svg viewBox="-12 -12 24 24"><path d="M-10,-7 L-7,-7 L-4,5 L7,5 L9,-3 L-5.5,-3" fill="#FFA8D4" stroke="${window.INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="-3" cy="8.4" r="1.8" fill="${window.INK}"/><circle cx="6" cy="8.4" r="1.8" fill="${window.INK}"/></svg>`;
  document.querySelectorAll("[data-icon2]").forEach(el => el.innerHTML = ICON[el.dataset.icon2]);
  ICON.soundOn = `<svg viewBox="-12 -12 24 24"><path d="M-8,-3 L-4,-3 L1,-8 L1,8 L-4,3 L-8,3 Z" fill="#FDB8D5" stroke="${window.INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M4,-4 Q7,0 4,4 M6.5,-7 Q11.5,0 6.5,7" fill="none" stroke="${window.INK}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  ICON.soundOff = `<svg viewBox="-12 -12 24 24"><path d="M-8,-3 L-4,-3 L1,-8 L1,8 L-4,3 L-8,3 Z" fill="#E6DDF0" stroke="${window.INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M4.5,-4 L10,4 M10,-4 L4.5,4" stroke="${window.INK}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  // floating doodles, kept to the left and right edges so they never cover the machine
  const DOODLE = [
    `<svg viewBox="-12 -12 24 24"><path d="M0,8 C-12,0 -8,-9 0,-4 C8,-9 12,0 0,8 Z" fill="#fff" stroke="#FF74B8" stroke-width="2" stroke-linejoin="round"/></svg>`,
    `<svg viewBox="-12 -12 24 24">${[0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(Math.cos(a) * 5).toFixed(1)}" cy="${(Math.sin(a) * 5).toFixed(1)}" r="4.2" fill="#fff" stroke="#B08CFF" stroke-width="1.8"/>`; }).join("")}<circle r="2.8" fill="#FFE45A" stroke="#B08CFF" stroke-width="1.4"/></svg>`,
    `<svg viewBox="-12 -12 24 24"><path d="M0,-10 C1.5,-2 2,-1.5 10,0 C2,1.5 1.5,2 0,10 C-1.5,2 -2,1.5 -10,0 C-2,-1.5 -1.5,-2 0,-10 Z" fill="#FFF7B0" stroke="#FFB84D" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  ];
  const fx = $("fx");
  for (let i = 0; i < 16; i++) {
    const el = document.createElement("div"), side = i % 2, bokeh = i % 4 === 3;
    el.className = "fx" + (bokeh ? " bokeh" : "");
    if (!bokeh) el.innerHTML = DOODLE[i % 3];
    const w = bokeh ? 26 + Math.random() * 40 : 18 + Math.random() * 16;
    el.style.cssText = `--w:${w}px;--d:${7 + Math.random() * 6}s;--delay:${-Math.random() * 12}s;--r:${(Math.random() - .5) * 120}deg;` +
      `left:${side ? 84 + Math.random() * 13 : 2 + Math.random() * 13}%;top:${15 + Math.random() * 75}%`;
    fx.appendChild(el);
  }
}

// WASD direction (walking / claw), x = right, y = forward
// the goals list folds down to its title (click it or G); remembered
let goalsFolded = false;
try { goalsFolded = localStorage.getItem("cf-goals-folded") === "1"; } catch {}
function foldGoals() {
  goalsFolded = !goalsFolded;
  try { localStorage.setItem("cf-goals-folded", goalsFolded ? "1" : "0"); } catch {}
  $("goals").classList.toggle("folded", goalsFolded);
  const f = $("goals").querySelector(".fold"); if (f) f.textContent = goalsFolded ? "+" : "–";
}
export function keyDir() {
  let x = 0, y = 0;
  if (keys.has("KeyA")) x -= 1;
  if (keys.has("KeyD")) x += 1;
  if (keys.has("KeyW")) y += 1;
  if (keys.has("KeyS")) y -= 1;
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}
// arrow keys look around: x = turn right, y = look up
export function lookDir() {
  return { x: (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0), y: (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0) };
}
export function stickDir() {
  const k = keyDir();
  const x = dragStick !== null ? input.stick.x : k.x, y = dragStick !== null ? input.stick.y : k.y;
  drawStick(x, y);
  return { x, y };
}
function drawStick(x, y) {
  const R = 38, px = x * R, py = -y * R;
  $("ball").style.transform = `translate(${px}px, ${py}px)`;
  const len = Math.hypot(px, py);
  const shaft = $("shaft");
  shaft.style.height = len + "px";
  shaft.style.transform = `rotate(${Math.atan2(-px, py)}rad)`;
}

export function consume() {
  const r = { grab: input.grab, action: input.action, back: input.back, wardrobe: input.wardrobe, hideCart: input.hideCart, keys: input.keys, view: input.view, pause: input.pause };
  input.grab = input.action = input.back = input.wardrobe = input.hideCart = input.keys = input.view = input.pause = false;
  return r;
}

export function setMode(m) {
  const walk = m === "walk", machine = m === "machine", ward = m === "wardrobe";
  $("logo").classList.toggle("hide", !walk);
  $("wardBtn").classList.toggle("hide", !walk);
  $("viewBtn").classList.toggle("hide", ward);
  $("viewBtn").classList.toggle("slot2", machine);   // (no wardrobe button at a machine: no gap left where it was)
  $("keysBtn").classList.toggle("hide", ward);
  $("goals").classList.toggle("hide", !walk || tutOn);
  $("tut").classList.toggle("hide", !tutOn || ward);
  $("back").classList.toggle("hide", !machine);
  $("top").classList.toggle("hide", !machine);
  $("deck").classList.toggle("hide", !machine);
  $("wardrobe").classList.toggle("hide", !ward);
  if (matchMedia("(pointer: coarse)").matches) $("joy").classList.toggle("hide", !walk);
  if (!walk) $("action").classList.add("hide");
}
// wardrobe panel: rows of swatches for hood, top and bottom; the kid rebuilds live behind it
const hex = c => "#" + c.toString(16).padStart(6, "0");
// lockOf(kind, id): stars still needed for a locked item (0 = unlocked)
export function openWardrobe(items, current, onPick, lockOf = () => 0) {
  for (const kind of ["face", "height", "hood", "hair", "top", "bottom"]) {
    const row = $("w-" + kind);
    row.innerHTML = items[kind].map(it =>
      { const lk = lockOf(kind, it.id);
        return `<button class="sw ${current[kind] === it.id ? "on" : ""} ${lk ? "locked" : ""}" data-kind="${kind}" data-id="${it.id}" ${lk ? `title="Unlocks at ${lk} stars"` : ""}>${it.color === undefined ? "" : `<i style="background:${hex(it.color)}"></i>`}<span>${it.name}</span>${lk ? `<small class="lk">🔒 ${lk}★</small>` : ""}</button>`; }).join("");
    row.onclick = e => {
      const b = e.target.closest(".sw"); if (!b) return;
      if (b.classList.contains("locked")) { toast(`Earn ${lockOf(kind, b.dataset.id)} stars to unlock`); return; }
      row.querySelectorAll(".sw").forEach(x => x.classList.toggle("on", x === b));
      onPick(kind, b.dataset.id); b.blur();
    };
  }
}
export function onMute(toggle, muted) {
  const b = $("snd");
  const paint = m => { b.innerHTML = m ? ICON.soundOff : ICON.soundOn; };
  paint(muted);
  b.addEventListener("click", e => { paint(toggle()); e.currentTarget.blur(); });
}
export function ready() { loading(1, "Ready!"); setTimeout(() => $("loading").classList.add("hide"), 250); }
export function loading(frac, text) { $("lbar").style.width = Math.round(frac * 100) + "%"; if (text) $("ltext").textContent = text; }

// ---- title screen ----
export function showTitle(hasSave, on) {
  document.body.classList.add("titling");
  $("title").classList.remove("hide");
  const items = hasSave
    ? [["Continue", "main", on.cont], ["New game", "", () => confirmCard("Start a new game?", "Your friends, coins and stars will be gone.", "Start over", on.fresh)]]
    : [["Play", "main", on.play]];
  items.push(["Settings", "", on.settings], ["Credits", "", on.credits]);
  const m = $("tmenu");
  m.innerHTML = items.map(([t, c], i) => `<button class="${c}" data-i="${i}">${t}</button>`).join("");
  m.onclick = e => { const b = e.target.closest("button"); if (b) { b.blur(); items[+b.dataset.i][2](); } };
}
export function hideTitle() { document.body.classList.remove("titling"); $("title").classList.add("hide"); }
function confirmCard(title, text, yes, onYes) {
  openCard(`<h2>${title}</h2><p>${text}</p><div class="menu"><button class="main" id="cf-yes">${yes}</button><button class="ok">Cancel</button></div>`, false);
  $("cf-yes").addEventListener("click", () => { $("modal").classList.add("hide"); onYes(); });
}
// ---- pause, settings, credits ----
export function showPause(on) {
  openCard(`<div class="rib">PAUSED</div><h2>Take a break</h2><div class="menu">
    <button class="main ok">Resume</button><button id="p-set">Settings</button><button id="p-keys">Controls</button><button id="p-title">Title screen</button></div>`, false, on.resume);
  $("p-set").addEventListener("click", () => on.settings());
  $("p-keys").addEventListener("click", () => on.keys());
  $("p-title").addEventListener("click", () => { $("modal").classList.add("hide"); on.title(); });
}
export function showSettings(s, onChange, onReset, onClose) {
  const pct = v => Math.round(v * 100) + "%";
  openCard(`<div class="rib">SETTINGS</div><h2>Settings</h2>
    <div class="srow"><span>Music</span><input type="range" id="s-music" min="0" max="1" step=".05" value="${s.music}"><output>${pct(s.music)}</output></div>
    <div class="srow"><span>Sound effects</span><input type="range" id="s-sfx" min="0" max="1" step=".05" value="${s.sfx}"><output>${pct(s.sfx)}</output></div>
    <div class="srow"><span>Camera speed</span><input type="range" id="s-sens" min=".4" max="2" step=".1" value="${s.sens}"><output>${pct(s.sens)}</output></div>
    <div class="srow"><span>Graphics</span><div class="seg" id="s-q"><button data-q="low">Light (phones)</button><button data-q="high">Pretty</button></div></div>
    <button class="danger" id="s-reset">Reset progress…</button><div id="s-conf"></div>
    <button class="ok">Done</button>`, true, onClose);
  for (const k of ["music", "sfx", "sens"]) {
    const el = $("s-" + k);
    el.addEventListener("input", () => { el.nextElementSibling.textContent = pct(+el.value); onChange({ [k]: +el.value }); });
  }
  const q = $("s-q"), paintQ = v => q.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.q === v));
  paintQ(s.quality);
  q.addEventListener("click", e => { const b = e.target.closest("button"); if (b) { paintQ(b.dataset.q); onChange({ quality: b.dataset.q }); } });
  $("s-reset").addEventListener("click", () => {
    $("s-conf").innerHTML = `<div class="confirm"><b>Erase all progress?</b><p>Friends, coins, stars and outfits. This can't be undone.</p><div class="row2"><button id="s-no">Keep it</button><button class="yes" id="s-yes">Erase</button></div></div>`;
    $("s-no").onclick = () => { $("s-conf").innerHTML = ""; };
    $("s-yes").onclick = () => { $("modal").classList.add("hide"); onReset(); };
  });
}
export function showCredits(onClose) {
  openCard(`<div class="rib">CREDITS</div><h2>Claw Friends</h2><div class="credits">
    <div class="who">Game & art direction</div><p>Angel's Desk</p>
    <div class="who">Starring</div><p>Kyoko and her plush friends</p>
    <div class="who">Made with</div><p>Three.js · Rapier physics · Blender</p>
    <div class="who">Music & sounds</div><p>Synthesized live in your browser</p>
    <div class="who">Thank you</div><p>for playing! ♡</p></div><button class="ok">Close</button>`, false, onClose);
}
export function setCoins(n) { $("coins").textContent = n; }
export function setScore(n) {
  const el = $("score"); el.textContent = n;
  const pill = el.parentElement; pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
}
// a burst of paper confetti from the top of the screen
export function confetti(n = 50) {
  const cols = ["#FF74B8", "#FFD86B", "#8ED8FF", "#A8E6CF", "#C9B6F2", "#fff"];
  for (let i = 0; i < n; i++) {
    const el = document.createElement("i");
    el.className = "conf";
    el.style.cssText = `left:${20 + Math.random() * 60}%;background:${cols[i % cols.length]};--x:${(Math.random() - .5) * 60}vw;--r:${Math.random() * 900 - 450}deg;--d:${1.3 + Math.random() * 1.1}s;--s:${.6 + Math.random() * .8}`;
    $("hud").appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
}
export function setCart(n, cap, show) { $("cartPill").classList.toggle("hide", !show); $("cartN").textContent = `${n}/${cap}`; }
export function floatScore(text) {
  const el = document.createElement("div");
  el.className = "floaty"; el.textContent = text;
  document.getElementById("hud").appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
export function setGoals(list, title = "Goals") {
  $("goals").innerHTML = `<b>${title} <i class="fold">${goalsFolded ? "+" : "–"}</i></b>` + list.map(g => `<div class="goal ${g.done ? "done" : ""}"><i>${g.done ? "✔" : ""}</i><span>${g.text}</span></div>`).join("");
}
export function onMusic(toggle, on) {
  const b = $("mus");
  const paint = m => { b.innerHTML = ICON.note; b.classList.toggle("off", !m); };
  paint(on);
  b.addEventListener("click", e => { paint(toggle()); e.currentTarget.blur(); });
}
export function setMachineName(n) { $("mname").textContent = n; }
export function setTimer(sec, show) {
  const b = $("tleft");
  b.textContent = show ? `0:${String(Math.ceil(Math.max(0, sec))).padStart(2, "0")}` : "–";
  b.classList.toggle("low", show && sec < 5);
}
export function setGrab(label, sub, off) {
  const g = $("grab");
  g.innerHTML = sub ? `${label}<small>${sub}</small>` : label;
  g.classList.toggle("off", !!off);
}
// first-run tutorial card: sits where the goals list is, which comes back when the tutorial ends
let tutOn = false;
export function showTut(step, idx, total, onSkip, onOk, visible) {
  tutOn = true;
  const el = $("tut");
  el.innerHTML = `<div class="tut-head"><b>${step.title}</b><span>${idx + 1}/${total}</span></div><p>${step.text}</p>` +
    `<div class="tut-foot"><button class="tut-skip">Skip tutorial</button>${onOk ? `<button class="tut-ok">Got it</button>` : ""}</div>`;
  el.classList.toggle("hide", !visible); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  $("goals").classList.add("hide");
  el.querySelector(".tut-skip").onclick = e => { e.currentTarget.blur(); onSkip(); };
  if (onOk) el.querySelector(".tut-ok").onclick = e => { e.currentTarget.blur(); onOk(); };
}
export function hideTut(walk) { tutOn = false; $("tut").classList.add("hide"); if (walk) $("goals").classList.remove("hide"); }
// the cart counter doubles as the put-away / bring-back switch
export function setCartHidden(h) { const c = $("cartPill"); c.classList.toggle("off", h); c.title = h ? "Cart put away · click to bring it back" : "Click to put the cart away"; }
export function setAction(text, off) {
  const a = $("action");
  a.classList.toggle("hide", !text);
  if (text) { a.textContent = text; a.classList.toggle("off", !!off); }
}
let toastT = 0;
export function toast(msg, ms = 1500) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms);
}
export function setSet(owned, species) {
  const list = PLUSH.filter(p => p.species === species);
  const n = list.filter(p => owned[p.key]).length;
  $("set").innerHTML = list.map(p => img(p.key, !owned[p.key])).join("") + `<b>${n}/6</b>`;
}

const modalOpen = () => !$("modal").classList.contains("hide");
export const isModal = modalOpen;
function openCard(html, wide, onClose) {
  const card = $("card");
  card.className = "card" + (wide ? " wide" : "");
  card.innerHTML = html;
  $("modal").classList.remove("hide");
  card.querySelector(".ok").addEventListener("click", () => { $("modal").classList.add("hide"); onClose && onClose(); }, { once: true });
}
export function showWin(p, count, onClose, shiny) {
  openCard(`${shiny ? `<div class="rib shiny">✦ SHINY! ✦</div>` : count === 1 ? `<div class="rib">NEW!</div>` : ""}
    <img class="big ${shiny ? "shine" : ""}" src="${icons[p.key]}" alt="">
    <h2>${p.name}</h2><div class="tier ${p.tier}">${p.tier}${count > 1 ? ` · x${count}` : ""}</div>
    <p>${shiny ? "A rare sparkly one · triple stars!" : count === 1 ? "Added to your collection!" : "Another one for the shelf!"}</p><button class="ok">Yay!</button>`, false, onClose);
}
// big swap: 5 small friends from the cart become 1 big friend of your choice
export function showSwap(smallCount, onPick) {
  const ok = smallCount >= 5;
  let html = `<div class="rib">BIG SWAP</div><h2>5 small = 1 BIG</h2><p>You have <b>${smallCount}</b> small friend${smallCount === 1 ? "" : "s"} in your cart${ok ? "" : " · win a few more!"}</p><div class="bigpick">`;
  for (const sp of SPECIES) html += `<button class="bp" data-sp="${sp.id}" ${ok ? "" : "disabled"}>${img(sp.id + "-crown", false)}<b>Big ${sp.name}</b></button>`;
  openCard(html + `</div><button class="ok">Close</button>`, true);
  $("card").querySelectorAll(".bp").forEach(b => b.addEventListener("click", () => { $("modal").classList.add("hide"); onPick(b.dataset.sp); }));
}
// cashier: daily coins, and checkout (new friends go to the shelf, duplicates become coins)
export function showCashier(info, onDaily, onCheckout) {
  const html = `<div class="rib">CASHIER</div><h2>Welcome!</h2>
    <div class="cashrow"><div><b>Daily coins</b><p>${info.claimed ? "Claimed today · see you tomorrow" : "Free +5 coins every day"}</p></div><button class="act" id="c-daily" ${info.claimed ? "disabled" : ""}>+5</button></div>
    <div class="cashrow"><div><b>Check out your cart</b><p>${info.items ? `${info.fresh} new for your shelf · ${info.dupes} extra = +${info.dupes} coin${info.dupes === 1 ? "" : "s"}${info.bigs ? ` · ${info.bigs} big` : ""}` : "Your cart is empty"}</p></div><button class="act" id="c-out" ${info.items ? "" : "disabled"}>Check out</button></div>
    <button class="ok">Close</button>`;
  openCard(html, true);
  $("c-daily").addEventListener("click", () => { $("modal").classList.add("hide"); onDaily(); });
  $("c-out").addEventListener("click", () => { $("modal").classList.add("hide"); onCheckout(); });
}
// the controls list (the keys button): for anyone who forgot the tutorial
export function showControls(touch, onReplay, onClose) {
  const K = s => s.split(" ").map(k => `<kbd>${k}</kbd>`).join("");
  const rows = touch ? [
    ["Joystick", "Walk"], ["Drag the screen", "Look around"], ["Pink button", "Use (carts, machines, cashier)"],
    ["Stick + <b>GRAB</b>", "Move the claw, grab"], ["Cart counter", "Put the cart away / bring it back"], ["Shirt button", "Wardrobe"], ["Eye button", "Through Kyoko's eyes / back"], ["Tap the goals", "Hide / show them"],
  ] : [
    [K("W A S D"), "Walk · move the claw"], [`${K("← → ↑ ↓")} or drag`, "Look around"], [`${K("E")} ${K("Space")}`, "Use · grab"],
    [K("H"), "Put the cart away / bring it back"], [K("C"), "Wardrobe"], [K("V"), "Through Kyoko's eyes / back"], [K("G"), "Hide / show the goals"], [K("Esc"), "Pause · leave the machine"],
  ];
  openCard(`<h2>Controls</h2><div class="keylist">${rows.map(([k, d]) => `<div class="krow"><span>${k}</span><b>${d}</b></div>`).join("")}</div>
    <button class="replay" id="k-replay">Replay the tutorial</button><button class="ok">Close</button>`, true, onClose);
  $("k-replay").addEventListener("click", () => { $("modal").classList.add("hide"); onReplay(); });
}
export function showCollection(owned, onClose, shiny = {}) {
  const n = PLUSH.filter(p => owned[p.key]).length, ns = PLUSH.filter(p => shiny[p.key]).length;
  let html = `<h2>Collection</h2><p>${n} / 24 friends${ns ? ` · ✦ ${ns} shiny` : ""}</p><div class="cbar"><i style="width:${n / 24 * 100}%"></i></div><div class="grid">`;
  for (const s of SPECIES) {
    const list = PLUSH.filter(p => p.species === s.id), k = list.filter(p => owned[p.key]).length;
    html += `<div class="row">${s.machine} <span>${k === 6 ? "✔ set complete" : `${k}/6`}</span></div>`;
    for (const p of list) {
      const c = owned[p.key] || 0;
      html += `<div class="slot ${p.tier} ${shiny[p.key] ? "shiny" : ""}" title="${c ? `${p.name} · ${p.tier}` : `??? · ${p.tier}`}">${img(p.key, !c)}${c > 1 ? `<i>x${c}</i>` : ""}${shiny[p.key] ? `<em>✦</em>` : ""}</div>`;
    }
  }
  openCard(html + `</div><button class="ok">Close</button>`, true, onClose);
}

// a short line sliding in at the top (unlocks, finished requests); queued so none hides another
const bannerQ = [];
export function banner(text) {
  bannerQ.push(text);
  if (bannerQ.length > 1) return;
  const next = () => {
    const el = document.createElement("div");
    el.className = "banner"; el.textContent = bannerQ[0];
    $("hud").appendChild(el);
    setTimeout(() => { el.remove(); bannerQ.shift(); if (bannerQ.length) next(); }, 2300);
  };
  next();
}
export function showDayDone(day, reward, nextDay, reqs, onClose) {
  openCard(`<div class="rib">DAY ${day} DONE!</div><h2>Great work!</h2><p>All of today's requests are done.</p>
    <div class="reward"><span>+${reward.coins} <small>coins</small></span><span>+${reward.stars} <small>stars</small></span></div>
    <p class="next"><b>Day ${nextDay}</b> · ${reqs.map(r => r.text).join(" · ")}</p><button class="ok">Next day!</button>`, false, onClose);
}
export function showSetDone(sp, reward, onClose) {
  openCard(`<div class="rib">SET COMPLETE</div><div class="setrow">${PLUSH.filter(p => p.species === sp.id).map(p => img(p.key, false)).join("")}</div>
    <h2>All 6 ${sp.name}s!</h2><div class="reward"><span>+${reward.coins} <small>coins</small></span><span>+${reward.stars} <small>stars</small></span></div><button class="ok">Hooray!</button>`, true, onClose);
}
export function showUnlock(title, text, onClose) {
  openCard(`<div class="rib">NEW!</div><h2>${title}</h2><p>${text}</p><button class="ok">Let's go!</button>`, false, onClose);
}
