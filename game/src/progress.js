// Progression: machine rows that open as you win, daily requests ("Day N"), and outfits unlocked by stars.
import { SPECIES, PLUSH, PLUSH_BY_KEY } from "./plush.js";

// a machine row opens after this many wins in total
export const MACHINE_UNLOCK = { duck: 0, shiba: 3, seal: 10, alpaca: 20 };
export const isOpen = (save, sp) => save.wins >= MACHINE_UNLOCK[sp];
export const openSpecies = save => SPECIES.filter(s => isOpen(save, s.id));

// ---- daily requests: three small jobs a day; finishing all three ends the day with a reward ----
const NAME = Object.fromEntries(SPECIES.map(s => [s.id, s.name]));
function makeReqs(save, rnd) {
  const sps = openSpecies(save).map(s => s.id), pick = a => a[Math.floor(rnd() * a.length)];
  const pool = [
    () => { const sp = pick(sps), n = 2 + Math.floor(rnd() * 2); return { kind: "species", sp, n, text: `Win ${n} ${NAME[sp]}s` }; },
    () => { const p = pick(PLUSH.filter(q => sps.includes(q.species) && q.tier !== "rare")); return { kind: "key", key: p.key, n: 1, text: `Win a ${p.name}` }; },
    () => ({ kind: "tier", n: 1, text: "Win a Sailor or Royal friend" }),
    () => ({ kind: "checkout", n: 5, text: "Check out 5+ friends at once" }),
    () => ({ kind: "swap", n: 1, text: "Swap for a BIG friend" }),
    () => ({ kind: "wins", n: 4, text: "Win 4 friends" }),
  ];
  const out = [], used = new Set();
  while (out.length < 3) {
    const i = Math.floor(rnd() * pool.length);
    if (used.has(i)) continue;
    used.add(i); out.push({ ...pool[i](), have: 0 });
  }
  return out;
}
export function ensureDay(save, rnd) { if (!save.day || !save.reqs) { save.day = (save.day || 0) + 1; save.reqs = makeReqs(save, rnd); } }
export function nextDay(save, rnd) { save.day++; save.reqs = makeReqs(save, rnd); }
export const dayReward = day => ({ coins: 6, stars: 100 + day * 20 });
// an event moves the matching requests on; returns the ones it just finished
export function track(save, ev, data = {}) {
  const done = [];
  for (const r of save.reqs || []) {
    if (r.have >= r.n) continue;
    const p = data.key && PLUSH_BY_KEY[data.key];
    const hit = ev === "win" ? (r.kind === "wins" || (r.kind === "species" && p.species === r.sp) || (r.kind === "key" && data.key === r.key) || (r.kind === "tier" && p.tier !== "common"))
      : ev === "swap" ? r.kind === "swap"
      : ev === "checkout" ? r.kind === "checkout" && data.count >= r.n : false;
    if (!hit) continue;
    r.have = ev === "checkout" ? r.n : r.have + 1;
    if (r.have >= r.n) done.push(r);
  }
  return done;
}
export const dayComplete = save => (save.reqs || []).length > 0 && save.reqs.every(r => r.have >= r.n);

// ---- outfits: stars (all-time score) needed per wardrobe item; 0 = from the start ----
const LOCKS = {
  face: { happy: 0, idle: 0, wow: 150, sad: 400, pout: 700, wink: 1100 },
  height: { m: 0, s: 100, l: 250, xs: 600, xl: 900 },
  hood: { koala: 0, cat: 200, bunny: 500, bear: 900, frog: 1400 },
  hair: { red: 0, brown: 80, black: 160, pink: 300, lilac: 600, blonde: 1000 },
  top: { navy: 0, pink: 0, lilac: 120, mint: 240, black: 450, yellow: 750 },
  bottom: { grey: 0, white: 0, navy: 120, cream: 240, denim: 450, brown: 750 },
};
export const starsFor = (kind, id) => (LOCKS[kind] && LOCKS[kind][id]) || 0;
// items whose price lies in (before, after]: just unlocked by a score change
export function newlyUnlocked(before, after, items) {
  const out = [];
  for (const kind in LOCKS) for (const id in LOCKS[kind]) {
    const c = LOCKS[kind][id];
    if (c > before && c <= after) { const it = items[kind].find(x => x.id === id); if (it) out.push(`${it.name} ${kind === "hood" ? "hood" : kind === "face" ? "face" : kind === "height" ? "size" : kind === "hair" ? "hair" : kind}`); }
  }
  return out;
}
