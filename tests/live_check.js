// Live-mode browser check (spec 003): the web app built with VITE_API_BASE=/api, served next to a running API.
// Signs in as the officer through the API, uploads the renewal PDF replacing D1, approves it in the review queue and
// checks the Overview coverage goes 29 -> 55. Needs: API on http://127.0.0.1:8000 (INLINE_JOBS=true, v1 documents
// approved, renewal not yet uploaded) and a live build in var/web-live:
//   (PowerShell) $env:VITE_API_BASE="/api"; cd web; npx vite build --outDir ../var/web-live
//   node tests/live_check.js [path-to-chrome]
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "var", "web-live");
const API = process.env.TL_API || "http://127.0.0.1:8000";
const RENEWAL = path.join(ROOT, "synth", "out", "v1", "fire_certificate_renewal.pdf");
const BROWSER = [process.argv[2], process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find((p) => fs.existsSync(p));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".map": "application/json" };

function serve() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) { // same-origin proxy to the API, as Caddy does on the VPS
      const up = http.request(API + req.url, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      up.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(up);
      return;
    }
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log("ok   " + name); } else { failed++; console.log("FAIL " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); }
};

async function main() {
  // TL_PAGE=https://host/ checks a deployed site instead of the local build + proxy
  const server = process.env.TL_PAGE ? null : await serve();
  const PAGE = process.env.TL_PAGE || `http://127.0.0.1:${server.address().port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tl-live-"));
  const port = 9800 + Math.floor(Math.random() * 100);
  const proc = spawn(BROWSER, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=" + port,
    "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
  });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
  const q = JSON.stringify;
  const kpi = (k) => evaluate(`(document.querySelector('[data-testid="kpi-${k}"]')||{}).textContent||""`);
  const waitFor = async (expr, ms) => { for (let t = 0; t < ms; t += 500) { if (await evaluate(expr)) return true; await sleep(500); } return false; };

  await send("Runtime.enable"); await send("Page.enable"); await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: PAGE });
  await sleep(2000);

  check("live build offers the Live API mode", await evaluate(`!!document.getElementById("mode-live")`));
  check("live mode is selected by default", (await evaluate(`document.getElementById("mode-live").getAttribute("aria-checked")`)) === "true");
  await evaluate(`document.getElementById("login-as-officer").click()`);
  check("officer signs in through the API (JWT stored)", await waitFor(`!!sessionStorage.getItem("tl-token")`, 8000));
  await waitFor(`!!document.querySelector('[data-testid="kpi-coverage"]')`, 8000);
  await sleep(1500);
  check("overview shows the API's data: coverage 29", (await kpi("coverage")).includes("29"), await kpi("coverage"));
  check("overview shows the API's data: risk 63", (await kpi("risk")).includes("63"), await kpi("risk"));

  await evaluate(`location.hash = "#/upload"`); await sleep(800);
  await evaluate(`(function(){var s=document.querySelector("select");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(s,"D1");s.dispatchEvent(new Event("change",{bubbles:true}));})()`);
  const doc = await send("DOM.getDocument");
  const node = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#upload-input" });
  await send("DOM.setFileInputFiles", { nodeId: node.result.nodeId, files: [RENEWAL] });
  const waited = await waitFor(`document.body.textContent.includes("Waiting for the Compliance Officer to approve") || document.body.textContent.includes("Failed")`, 240000);
  check("renewal runs through the pipeline to the approval step", waited && !(await evaluate(`document.body.textContent.includes("Failed")`)),
    await evaluate(`document.querySelector("main").textContent.slice(0,400)`));
  await evaluate(`location.hash = "#/"`); await sleep(1500);
  check("before approval coverage stays 29 (pending human review)", (await kpi("coverage")).includes("29"), await kpi("coverage"));

  await evaluate(`location.hash = "#/review"`);
  check("review queue lists the approval", await waitFor(`[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Approve")`, 10000));
  await evaluate(`[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Approve").click()`);
  await waitFor(`!document.body.textContent.includes("approve evidence")`, 60000);
  await evaluate(`location.hash = "#/"`);
  check("after the officer approves, coverage is 55", await waitFor(`(document.querySelector('[data-testid="kpi-coverage"]')||{}).textContent.includes("55")`, 15000), await kpi("coverage"));

  await evaluate(`location.hash = "#/system"`);
  check("system page shows live service health", await waitFor(`document.body.textContent.includes("postgres: up")`, 15000),
    await evaluate(`document.querySelector("main").textContent.slice(0,300)`));
  check("no JavaScript errors", errors.length === 0, errors);

  console.log(`\n${passed} passed, ${failed} failed`);
  ws.close(); proc.kill(); if (server) server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
