// Player settings (the settings menu), kept apart from the game save so "reset progress" leaves them alone.
const KEY = "clawfriends.settings";
// (phones start on light graphics: on the full ones a phone's GPU ran out of memory and the 3D view went blank)
const DEFAULTS = { music: .8, sfx: .8, sens: 1, quality: matchMedia("(pointer: coarse)").matches ? "low" : "high" };
let cur = { ...DEFAULTS };
try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
export const get = () => cur;
export function set(patch) {
  cur = { ...cur, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {}
  return cur;
}
