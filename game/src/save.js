// Progress in localStorage. Test runs (?test=...) use their own key so they never touch real saves.
const KEY = "clawfriends.v1" + (new URLSearchParams(location.search).has("test") ? ".test" : "");
const fresh = () => ({ coins: 30, owned: {}, ticketDay: "", score: 0, cart: [], seen: {}, big: {}, goals: {}, wins: 0, hasCart: false });

export function load() {
  try {
    if (new URLSearchParams(location.search).has("test")) return { ...fresh(), coins: 99 };
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch { return fresh(); }
}
export function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
export function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
