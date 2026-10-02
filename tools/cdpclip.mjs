// Headless Chrome clip: load a page, then repeatedly run a step expression and grab a frame.
// usage: node cdpclip.mjs <url> <outDir> <w> <h> <frames> <stepExpr> [scale=1] [readyExpr="window.READY===true"] [frameMs]
// with frameMs the page runs on virtual time: each frame advances its clock by exactly frameMs (smooth clips of a
// real-time page like the game, however slow the headless renderer is); stepExpr gets the frame number as window.FRAME.
// outDir "-" skips the screenshots and prints JSON.stringify(window.LOG) at the end (for numeric checks)
// frames land in outDir/f_0000.png ...; make a video with ffmpeg -framerate 30 -i outDir/f_%04d.png ...
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, outDir, w, h, frames, stepExpr, scale = "1", ready = "window.READY===true", frameMs = ""] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ud = mkdtempSync(join(process.env.CDP_TMP || tmpdir(), "cdp-"));
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(CHROME, [
  "--headless=new", `--user-data-dir=${ud}`, `--remote-debugging-port=${port}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
  "--hide-scrollbars", `--window-size=${w},${h}`, "about:blank",
], { stdio: "ignore" });
const done = code => { proc.kill("SIGKILL"); rmSync(ud, { recursive: true, force: true }); process.exit(code); };

let wsUrl;
for (let i = 0; i < 75 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = list.find(t => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(200);
}
if (!wsUrl) { console.log("FAIL no devtools endpoint"); done(1); }
const sock = new WebSocket(wsUrl);
await new Promise(r => sock.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map(), logs = [];
let budgetDone = null;
sock.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Emulation.virtualTimeBudgetExpired" && budgetDone) { budgetDone(); budgetDone = null; }
  if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });

await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: +scale, mobile: false });
await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate", { url });
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const r = await send("Runtime.evaluate", { expression: ready, returnByValue: true });
  if (r.result?.result?.value === true) break;
  await sleep(300);
}
if (outDir !== "-") mkdirSync(outDir, { recursive: true });
if (frameMs) await send("Emulation.setVirtualTimePolicy", { policy: "pause" });
for (let f = 0; f < +frames; f++) {
  const r = await send("Runtime.evaluate", { expression: `window.FRAME = ${f}; ${stepExpr}`, returnByValue: true, awaitPromise: true });
  if (frameMs) {
    const wait = new Promise(res => { budgetDone = res; setTimeout(res, 15000); });   // (never hang on a lost event)
    await send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: +frameMs });
    await wait;
  }
  if (r.result?.exceptionDetails) { console.log("step error", JSON.stringify(r.result.exceptionDetails).slice(0, 300)); break; }
  const shot = await send("Page.captureScreenshot", { format: "png" });   // (also what makes the page draw a frame)
  if (outDir === "-") continue;
  writeFileSync(join(outDir, `f_${String(f).padStart(4, "0")}.png`), Buffer.from(shot.result.data, "base64"));
}
if (outDir === "-") {
  const r = await send("Runtime.evaluate", { expression: "JSON.stringify(window.LOG ?? null)", returnByValue: true });
  console.log("LOG " + r.result?.result?.value);
}
console.log(`ok ${frames} frames -> ${outDir} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
for (const l of [...new Set(logs)].slice(0, 8)) console.log("  " + l.slice(0, 300));
done(0);
