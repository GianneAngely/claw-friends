// Progress in localStorage. Test runs (?test=...) use their own key so they never touch real saves.
// ?demo: a mid-game save of its own (for screenshots), never touching the real one
const QS = new URLSearchParams(location.search);
const KEY = "clawfriends.v1" + (QS.has("test") ? ".test" : QS.has("demo") ? ".demo" : "");
const DEMO = () => ({
  coins: 42, score: 2650, wins: 26, hasCart: true, tutorial: true, ticketDay: "", cart: [{ key: "shiba-sailor" }, { key: "seal-straw" }, { key: "duck-crown" }],
  owned: Object.fromEntries(["duck-plain", "duck-frog", "duck-straw", "duck-flower", "duck-sailor", "duck-crown", "shiba-plain", "shiba-frog", "shiba-straw",
    "shiba-crown", "seal-plain", "seal-flower", "seal-sailor", "alpaca-plain", "alpaca-straw"].map(k => [k, 1])),
  seen: {}, big: { duck: 1, seal: 1 }, shiny: { "duck-frog": true, "shiba-crown": true }, sets: { duck: true },
  goals: { cart: true, win3: true, swap: true, checkout: true }, day: 4,
  reqs: [{ kind: "species", sp: "seal", n: 3, have: 1, text: "Win 3 Seals" }, { kind: "tier", n: 1, have: 1, text: "Win a Sailor or Royal friend" }, { kind: "checkout", n: 5, have: 0, text: "Check out 5+ friends at once" }],
  outfit: { hood: "koala", top: "navy", bottom: "grey", hair: "red", face: "idle", height: "m", shoes: "sneakers" },   // (her own look, as drawn)
});
const fresh = () => ({ coins: 30, owned: {}, ticketDay: "", score: 0, cart: [], seen: {}, big: {}, goals: {}, wins: 0, hasCart: false });

export function load() {
  try {
    if (new URLSearchParams(location.search).has("test")) return { ...fresh(), coins: 99 };
    if (QS.has("demo") && !localStorage.getItem(KEY)) return { ...fresh(), ...DEMO() };
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch { return fresh(); }
}
export function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
export function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
