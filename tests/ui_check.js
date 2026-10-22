// Headless UI check for the built web app (web/dist). Serves it on localhost, drives it in headless
// Chrome or Edge over the DevTools protocol, clicks what a user would click, and asserts the figures.
// Usage: (cd web && npm run build) && node tests/ui_check.js [path-to-chrome]   (Node 22+)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "web", "dist");
const SHOTS = process.env.TL_SHOTS || "";
const CANDIDATES = [
  process.argv[2], process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const BROWSER = CANDIDATES.find((p) => fs.existsSync(p));
if (!BROWSER) { console.error("No Chrome/Edge found; pass its path as an argument."); process.exit(2); }
if (!fs.existsSync(path.join(DIST, "index.html"))) { console.error("web/dist not found: run `npm run build` in web/ first."); process.exit(2); }

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".map": "application/json" };
function serve() {
  const server = http.createServer((req, res) => {
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
function check(name, cond, detail) {
  if (cond) { passed++; console.log("ok   " + name); }
  else { failed++; console.log("FAIL " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); }
}

async function main() {
  const server = await serve();
  const PAGE = `http://127.0.0.1:${server.address().port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tl-ui-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(BROWSER, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
  }
  if (!target) throw new Error("browser did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); const errors = []; const requests = new Set();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(JSON.stringify(m.params.args.map((a) => a.value)));
    if (m.method === "Network.requestWillBeSent" && /^https?:/.test(m.params.request.url)) requests.add(new URL(m.params.request.url).origin);
  });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.result.exceptionDetails) throw new Error(expr + " -> " + JSON.stringify(res.result.exceptionDetails));
    return res.result.result.value;
  };
  const q = JSON.stringify;
  const text = (sel) => evaluate(`(document.querySelector(${q(sel)})||{}).textContent||""`);
  const count = (sel) => evaluate(`document.querySelectorAll(${q(sel)}).length`);
  const click = async (sel) => { await evaluate(`document.querySelector(${q(sel)}).click()`); await sleep(80); };
  const go = async (route) => { await evaluate(`location.hash = ${q("#" + route)}`); await sleep(250); };
  const current = (sel) => evaluate(`(document.querySelector(${q(sel)})||{getAttribute:()=>null}).getAttribute("aria-current")`);
  const kpis = () => evaluate(`["days","coverage","risk","open"].map(k=>document.querySelector('[data-testid="kpi-'+k+'"]').textContent)`);
  const statusOf = async (rid) => { await click("#nav-findings"); await sleep(200); return text(`#finding-${rid} [data-testid="status-pill"]`); };
  const shot = async (name) => {
    if (!SHOTS) return;
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, name + ".png"), Buffer.from(r.result.data, "base64"));
  };
  // React tracks input values, so set the value through the native setter before dispatching "input".
  const setRange = (iso) => evaluate(`(function(){var r=document.getElementById("sim-range");var d0=Date.UTC(2026,9,1)/864e5;var p=${q(iso)}.split("-");
    var v=String(Date.UTC(+p[0],p[1]-1,+p[2])/864e5-d0);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(r,v);
    r.dispatchEvent(new Event("input",{bubbles:true}));})()`).then(() => sleep(80));
  const BASE = ["30", "29", "63", "6"];

  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: PAGE });
  await sleep(2000);

  // Demo sign-in: gate, wrong password, and role permissions
  const typeInto = async (sel, value) => { await evaluate(`document.querySelector(${q(sel)}).focus()`); await send("Input.insertText", { text: value }); };
  await shot("login");
  check("signed-out visitors land on the demo sign-in page", (await evaluate("location.hash")).startsWith("#/login"));
  check("sign-in page says it is not real authentication", (await text("main")).includes("Demo sign-in, not real authentication"));
  await typeInto("#login-email", "officer@threadlight.demo"); await typeInto("#login-password", "wrong-password");
  await click("#login-submit"); await sleep(150);
  check("wrong password is rejected", (await text("#login-error")).includes("does not match"));

  await click("#login-as-guest"); await sleep(400);
  check("guest account signs in", (await text("#session-role")) === "Guest (read-only)");
  await go("/actions/workflow");
  check("guest: Assign is locked to their role", await evaluate(`document.getElementById("lc-assign").getAttribute("aria-disabled")`) === "true");
  await click("#lc-assign");
  check("guest: clicking Assign explains the role needed", (await text("#lc-msg")).includes("cannot assign"));
  await click("#sign-out"); await sleep(300);

  await evaluate(`location.hash = "#/login"`); await sleep(250);
  await typeInto("#login-email", "staff@threadlight.demo"); await typeInto("#login-password", "Staff-Demo-2026");
  await click("#login-submit"); await sleep(400);
  check("staff account signs in with typed credentials", (await text("#session-role")) === "Factory staff");
  await go("/actions/workflow");
  await click("#lc-assign"); await click("#lc-upload");
  check("staff: can assign and upload (coverage stays 29)", (await kpis())[1] === "29" && await text('[data-testid="lc-current"] [data-label]') === "Remediate");
  await click("#lc-approve");
  check("staff: cannot approve (Compliance Officer only)", (await text("#lc-msg")).includes("cannot approve") && (await kpis())[1] === "29");
  await click("#lc-reset");
  await click("#sign-out"); await sleep(300);

  await evaluate(`location.hash = "#/login"`); await sleep(250);
  await click("#login-as-officer"); await sleep(400);
  check("officer account signs in", (await text("#session-role")) === "Compliance Officer");
  await go("/");

  // Overview + header figures
  check("home page is Overview", await current("#nav-overview") === "page");
  check("synthetic-data banner visible", (await text('[data-testid="synthetic-banner"]')).includes("Synthetic data. Rules run live in your browser. Extraction results are pre-computed samples, not live AI."));
  check("header: days 30, coverage 29, risk 63, open 6", q(await kpis()) === q(BASE), await kpis());
  check("overview shows top priorities and alerts", (await text("#main")).includes("Top priorities") && (await text("#main")).includes("Evidence-integrity alerts (3)"));
  await shot("overview-desktop");

  // Findings list (its own page)
  await click("#nav-findings"); await sleep(200);
  check("sidebar marks Findings as current page", await current("#nav-findings") === "page");
  const expected = { R1: "Likely gap", R2: "Supported", R3: "Supported", R4: "Likely gap", R5: "Likely gap", R6: "Insufficient evidence", R7: "Conflicting evidence", R8: "Insufficient evidence" };
  for (const [rid, label] of Object.entries(expected)) {
    const got = await text(`#finding-${rid} [data-testid="status-pill"]`);
    check(`baseline ${rid} shows ${label}`, got === label, got);
  }
  await click("#filter-likely_gap"); await sleep(150);
  check("status filter shows only likely gaps (3)", await count('[id^="finding-"]') === 3);
  await click("#filter-all"); await sleep(150);
  await shot("findings-desktop");

  // Requirement detail page
  await click("#finding-R5 a"); await sleep(300);
  const r5 = await text("#main");
  check("R5 detail page: reasons, cited source, limit, next action", r5.includes("Why this status") && r5.includes("fire_certificate.pdf") &&
    r5.includes("Limit of this conclusion") && r5.includes("Next action") && r5.includes("Fire safety certificate valid on or after 2026-11-21"));
  await shot("requirement-detail");

  // Integrity alerts sub-page
  await go("/findings/alerts");
  check("alerts page: three alerts with recommended checks", await count('[data-testid="alert-verify"]') === 3);
  const alertsText = await text("#main");
  check("alerts: D4 spelling variant, D6 FC-2025-0471 vs FC-2025-0417, CAP-14 without proof",
    alertsText.includes("possible spelling variant") && alertsText.includes("FC-2025-0471") && alertsText.includes("FC-2025-0417") && alertsText.includes("CAP-14"));
  await shot("alerts-desktop");

  // Documents + run analysis + document detail
  await click("#nav-documents"); await sleep(200);
  check("documents page lists 6 files", await count('[data-testid="doc-row"]') === 6);
  check("agents marked rules / sample extraction", await evaluate(`[...document.querySelectorAll('[data-testid="agent-kind"]')].map(c=>c.textContent).join("|")`) ===
    "sample extraction|sample extraction|rules|rules|rules|rules|rules");
  await click("#run-analysis");
  await sleep(3800);
  check("run analysis completes and lights all 7 agents", (await text("#run-status")).includes("Analysis complete") && await count('[data-testid="agent"][data-state="done"]') === 7, await text("#run-status"));
  await shot("documents-desktop");
  await click('[data-testid="doc-row"] a'); await sleep(300);
  check("D1 detail page: 1 document affects 2 requirements", (await text("#main")).includes("1 document affects 2 requirements"));
  await shot("document-detail");

  // Evidence graph
  await click("#nav-graph"); await sleep(400);
  check("graph draws one line per edge (7)", await count("#graph-svg path") === 7);
  check("lines are visibly stroked", await evaluate(`getComputedStyle(document.querySelector('#graph-svg path')).stroke !== "none"`));
  await click('[data-testid="node-doc"][data-id="D1"]');
  check("clicking D1: 1 document affects 2 requirements (R1, R5)", (await text("#graph-msg")).includes("1 document affects 2 requirements (R1, R5)"), await text("#graph-msg"));
  check("R1 and R5 highlighted", await evaluate(`[...document.querySelectorAll('[data-testid="node-req"][data-lit]')].map(n=>n.dataset.id).join()`) === "R1,R5");
  check("lines have real geometry", await evaluate(`document.querySelector('#graph-svg path[data-doc="D1"]').getTotalLength() > 20`));
  await shot("graph-desktop");

  // Simulate
  await click("#nav-simulate"); await sleep(200);
  const simCov = () => text('[data-testid="sim-coverage"]');
  check("simulate shows affected requirements R1, R5", (await text("#main")).includes("Affected requirements: R1, R5"));
  await setRange("2026-10-01");
  check("slider min 2026-10-01: coverage 29%, R1 reason says expired", (await simCov()) === "29%" && (await text("#sim-reason")).includes("expired on 2026-10-01"), await simCov());
  await setRange("2027-01-31");
  check("slider max 2027-01-31: coverage 55%", (await simCov()) === "55%", await simCov());
  await setRange("2026-11-20");
  check("2026-11-20 (day before audit): coverage 29%", (await simCov()) === "29%");
  await setRange("2026-11-21");
  check("2026-11-21 (audit day): coverage 55%", (await simCov()) === "55%");
  check("what-if does not change header", q(await kpis()) === q(BASE));
  await shot("simulate-desktop");

  // Actions list + workflow page
  await click("#nav-actions"); await sleep(200);
  check("plan ranks T-R1 first, six tasks", await evaluate(`[...document.querySelectorAll('[data-task-id]')].map(n=>n.dataset.taskId).join()`) === "T-R1,T-R8,T-R6,T-R4,T-R5,T-R7");
  await shot("actions-desktop");
  await click("#open-workflow"); await sleep(300);
  check("close starts locked (aria-disabled)", await evaluate(`document.getElementById("lc-close").getAttribute("aria-disabled")`) === "true");
  await click("#lc-close");
  check("closing early is blocked: 'AI cannot close this finding'", (await text("#lc-msg")).includes("AI cannot close this finding"), await text("#lc-msg"));
  await click("#lc-assign");
  await click("#lc-upload");
  check("after upload: coverage stays 29", (await kpis())[1] === "29", await kpis());
  await click("#lc-close");
  check("close without approval blocked", (await text("#lc-msg")).includes("AI cannot close this finding") && await text('[data-testid="lc-current"] [data-label]') === "Remediate");
  check("live recheck: R1 and R5 pending human review", (await text("#main")).split("Pending human review").length - 1 >= 2);
  await shot("workflow-pending");
  await click("#lc-approve");
  check("after approval: coverage 55", (await kpis())[1] === "55", await kpis());
  check("close unlocked after approval", await evaluate(`document.getElementById("lc-close").getAttribute("aria-disabled")`) === "false");
  await click("#lc-close");
  check("finding closed by named approver", await text('[data-testid="lc-current"] [data-label]') === "Close" && (await text("#lc-history")).includes("Compliance Officer (synthetic)"));
  await shot("workflow-closed");
  check("after approval: R1 and R5 supported", (await statusOf("R1")) === "Supported" && (await statusOf("R5")) === "Supported");

  // Report
  await click("#nav-report"); await sleep(200);
  const verAfter = await text('[data-testid="report-verified"]');
  check("report: approved R1 and R5 listed under Verified", verAfter.includes("R1") && verAfter.includes("R5"));
  await go("/actions/workflow"); await click("#lc-reset");
  check("reset restores baseline 29/63/6", q(await kpis()) === q(BASE), await kpis());
  await click("#lc-assign"); await click("#lc-upload");
  await click("#nav-report"); await sleep(200);
  const ver = await text('[data-testid="report-verified"]');
  check("report: pending items are under Open, not Verified", !ver.includes("R1") && !ver.includes("Pending") && (await text('[data-testid="report-open"]')).includes("Pending human review"));
  check("report footer present", (await text('[data-testid="report-footer"]')).includes("Draft for human review. Not an audit result."));
  await click('[data-lang="bn"]');
  const bn = await text('[data-testid="report"]');
  check("Bangla report: footer and status labels", ["মানব পর্যালোচনার জন্য খসড়া", "মানব পর্যালোচনার অপেক্ষায়", "সম্ভাব্য ঘাটতি", "পরস্পরবিরোধী প্রমাণ", "অপর্যাপ্ত প্রমাণ", "যাচাইকৃত"].every((s) => bn.includes(s)));
  check("Bangla report keeps English footer line", bn.includes("Draft for human review. Not an audit result."));
  await shot("report-bn");
  await click('[data-lang="en"]');
  await go("/actions/workflow"); await click("#lc-reset");

  // Keyboard: number keys open sections
  await evaluate(`document.activeElement && document.activeElement.blur()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "3", text: "3" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "3" });
  await sleep(250);
  check("pressing 3 opens the Evidence graph", (await evaluate("location.hash")) === "#/graph");

  // Command palette: Ctrl+K, type, Enter
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "k", code: "KeyK", modifiers: 2, windowsVirtualKeyCode: 75 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "k", code: "KeyK", modifiers: 2, windowsVirtualKeyCode: 75 });
  await sleep(250);
  check("Ctrl+K opens the command palette", await evaluate(`!!document.getElementById("cmd-input") && document.activeElement.id === "cmd-input"`));
  await send("Input.insertText", { text: "fire drill" });
  await sleep(150);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(300);
  check("palette search 'fire drill' + Enter opens R5", (await evaluate("location.hash")) === "#/requirements/R5" && !(await evaluate(`!!document.getElementById("cmd-input")`)));

  // Narrow viewport: no horizontal page scroll on any page; drawer navigation works
  await send("Emulation.setDeviceMetricsOverride", { width: 400, height: 860, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  for (const route of ["/", "/documents", "/documents/D1", "/requirements", "/requirements/R1", "/graph", "/findings", "/findings/alerts", "/simulate", "/actions", "/actions/workflow", "/report"]) {
    await go(route);
    const w = await evaluate(`document.documentElement.scrollWidth`);
    check(`400px: no horizontal scroll on ${route}`, w <= 400, w);
    if (["/", "/graph", "/actions/workflow"].includes(route)) await shot(`m${route.replace(/\//g, "-")}`);
  }
  await go("/graph"); await sleep(250);
  check("400px: graph lines redrawn", await count("#graph-svg path") === 7);
  check("400px: drawer closed by default", await evaluate(`getComputedStyle(document.getElementById("sidebar")).visibility`) === "hidden");
  await click('[aria-controls="sidebar"]'); await sleep(350);
  check("400px: menu opens the navigation drawer", await evaluate(`getComputedStyle(document.getElementById("sidebar")).visibility`) === "visible");
  await shot("m-drawer");
  await click("#nav-report"); await sleep(400);
  check("400px: choosing a page closes the drawer", (await evaluate("location.hash")) === "#/report" &&
    await evaluate(`getComputedStyle(document.getElementById("sidebar")).visibility`) === "hidden");

  // Dark theme
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await go("/");
  await click("#theme-dark");
  await sleep(250);
  check("dark theme applies", await evaluate(`getComputedStyle(document.body).backgroundColor`) === "rgb(12, 14, 28)");
  await shot("overview-dark");

  const external = [...requests].filter((o) => !o.startsWith("http://127.0.0.1") && !["https://fonts.googleapis.com", "https://fonts.gstatic.com"].includes(o));
  check("no network requests except Google Fonts", external.length === 0, external);
  check("no JavaScript errors", errors.length === 0, errors);
  ws.close(); proc.kill(); server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
