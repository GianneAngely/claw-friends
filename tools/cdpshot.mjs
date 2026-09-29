// Headless Chrome screenshot that waits for the page to say it is ready.
// usage: node cdpshot.mjs <url> <out.png> <w> <h> [scale=2] [readyExpr="window.READY===true"] [timeoutMs=60000]
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, w, h, scale = "2", ready = "window.READY===true", timeout = "60000"] = process.argv.slice(2);
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
const pending = new Map();
const logs = [];
sock.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    logs.push(m.params.type.toUpperCase() + " " + m.params.args.map(a => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params }));
});

await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: +scale, mobile: false });
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });

const t0 = Date.now();
let ok = false;
while (Date.now() - t0 < +timeout) {
  const r = await send("Runtime.evaluate", { expression: ready, returnByValue: true });
  if (r.result?.result?.value === true) { ok = true; break; }
  await sleep(300);
}
await sleep(500);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
const tr = await send("Runtime.evaluate", { expression: "JSON.stringify(window.TEST_RESULT ?? null)", returnByValue: true });
if (tr.result?.result?.value && tr.result.result.value !== "null") console.log("TEST_RESULT " + tr.result.result.value);
console.log((ok ? "ok " : "TIMEOUT ") + out + ` (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
for (const l of [...new Set(logs)].slice(0, 12)) console.log("  " + l.slice(0, 300));
done(0);
