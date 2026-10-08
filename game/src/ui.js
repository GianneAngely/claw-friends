// HTML HUD: coins, context action, claw deck (arcade stick + GRAB), joystick, toasts, modals.
import { PLUSH, SPECIES } from "./plush.js";

const $ = id => document.getElementById(id);
const ICON = window.ICON;
let icons = {};
export function setIcons(m) { icons = m; }
const img = (key, miss) => `<img src="${icons[key] || ""}" class="${miss ? "miss" : ""}" alt="">`;

export const input = { stick: { x: 0, y: 0 }, walk: { x: 0, y: 0 }, grab: false, action: false, back: false, wardrobe: false, hideCart: false, keys: false, view: false };
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
  const r = { grab: input.grab, action: input.action, back: input.back, wardrobe: input.wardrobe, hideCart: input.hideCart, keys: input.keys, view: input.view };
  input.grab = input.action = input.back = input.wardrobe = input.hideCart = input.keys = input.view = false;
  return r;
}

export function setMode(m) {
  const walk = m === "walk", machine = m === "machine", ward = m === "wardrobe";
  $("logo").classList.toggle("hide", !walk);
  $("wardBtn").classList.toggle("hide", !walk);
  $("viewBtn").classList.toggle("hide", ward);
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
export function openWardrobe(items, current, onPick) {
  for (const kind of ["hood", "top", "bottom"]) {
    const row = $("w-" + kind);
    row.innerHTML = items[kind].map(it =>
      `<button class="sw ${current[kind] === it.id ? "on" : ""}" data-kind="${kind}" data-id="${it.id}"><i style="background:${hex(it.color)}"></i><span>${it.name}</span></button>`).join("");
    row.onclick = e => {
      const b = e.target.closest(".sw"); if (!b) return;
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
export function ready() { $("loading").classList.add("hide"); }
export function setCoins(n) { $("coins").textContent = n; }
export function setScore(n) { $("score").textContent = n; }
export function setCart(n, cap, show) { $("cartPill").classList.toggle("hide", !show); $("cartN").textContent = `${n}/${cap}`; }
export function floatScore(text) {
  const el = document.createElement("div");
  el.className = "floaty"; el.textContent = text;
  document.getElementById("hud").appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
export function setGoals(list) {
  $("goals").innerHTML = `<b>Goals <i class="fold">${goalsFolded ? "+" : "–"}</i></b>` + list.map(g => `<div class="goal ${g.done ? "done" : ""}"><i>${g.done ? "✔" : ""}</i><span>${g.text}</span></div>`).join("");
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
export function showWin(p, count, onClose) {
  openCard(`${count === 1 ? `<div class="rib">NEW!</div>` : ""}
    <img class="big" src="${icons[p.key]}" alt="">
    <h2>${p.name}</h2><div class="tier ${p.tier}">${p.tier}${count > 1 ? ` · x${count}` : ""}</div>
    <p>${count === 1 ? "Added to your collection!" : "Another one for the shelf!"}</p><button class="ok">Yay!</button>`, false, onClose);
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
export function showControls(touch, onReplay) {
  const K = s => s.split(" ").map(k => `<kbd>${k}</kbd>`).join("");
  const rows = touch ? [
    ["Joystick", "Walk"], ["Drag the screen", "Look around"], ["Pink button", "Use (carts, machines, cashier)"],
    ["Stick + <b>GRAB</b>", "Move the claw, grab"], ["Cart counter", "Put the cart away / bring it back"], ["Shirt button", "Wardrobe"], ["Eye button", "Through Kyoko's eyes / back"], ["Tap the goals", "Hide / show them"],
  ] : [
    [K("W A S D"), "Walk · move the claw"], [`${K("← → ↑ ↓")} or drag`, "Look around"], [`${K("E")} ${K("Space")}`, "Use · grab"],
    [K("H"), "Put the cart away / bring it back"], [K("C"), "Wardrobe"], [K("V"), "Through Kyoko's eyes / back"], [K("G"), "Hide / show the goals"], [K("Esc"), "Leave the machine"],
  ];
  openCard(`<h2>Controls</h2><div class="keylist">${rows.map(([k, d]) => `<div class="krow"><span>${k}</span><b>${d}</b></div>`).join("")}</div>
    <button class="replay" id="k-replay">Replay the tutorial</button><button class="ok">Close</button>`, true);
  $("k-replay").addEventListener("click", () => { $("modal").classList.add("hide"); onReplay(); });
}
export function showCollection(owned, onClose) {
  const n = PLUSH.filter(p => owned[p.key]).length;
  let html = `<h2>Collection</h2><p>${n} / 24 friends</p><div class="grid">`;
  for (const s of SPECIES) {
    html += `<div class="row">${s.machine}</div>`;
    for (const p of PLUSH.filter(p => p.species === s.id)) {
      const c = owned[p.key] || 0;
      html += `<div class="slot" title="${c ? p.name : "???"}">${img(p.key, !c)}${c > 1 ? `<i>x${c}</i>` : ""}</div>`;
    }
  }
  openCard(html + `</div><button class="ok">Close</button>`, true, onClose);
}
