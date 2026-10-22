// Records the ThreadLight demo video: drives the LIVE site in headless Chrome, captures frames per
// scene with the DevTools screencast, then muxes each scene with its narration WAV via ffmpeg.
// Usage (Windows): powershell -File tools/video/tts.ps1   then   node tools/video/record.js
// Needs Node 22+, Chrome, ffmpeg/ffprobe on PATH. Output: recordings/threadlight-demo.mp4 (git-ignored).
// Narration uses the offline Windows voice "Microsoft Zira Desktop" (System.Speech), not a cloud service.
"use strict";
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = __dirname;
const OUT = process.argv[2] || path.join(DIR, "..", "..", "recordings");
const APP = "https://mohammadyaksafu.github.io/threadlight/";
const SLIDES = "file:///" + path.join(DIR, "slides.html").replace(/\\/g, "/");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const narration = JSON.parse(fs.readFileSync(path.join(DIR, "narration.json"), "utf8"));
const dur = Object.fromEntries(narration.map((n) => [n.id, +execFileSync("ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(DIR, "audio", n.id + ".wav")]).toString().trim()]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scene plan: length in seconds and the actions to run at given offsets (seconds from scene start).
const SCENES = [
  { id: "s01_hook", len: 13.5, url: SLIDES + "?s=hook" },
  { id: "s02_problem", len: 23, url: SLIDES + "?s=problem" },
  { id: "s03_solution", len: 14, url: APP + "#/", steps: [[6.5, "scroll", 260], [11.5, "scroll", 0]] },
  { id: "s04_documents", len: 10, hash: "#/documents", steps: [[1.2, "click", "#run-analysis"], [5, "scroll", 420]] },
  { id: "s05_graph", len: 8.5, hash: "#/graph", steps: [[1.5, "click", '[data-testid="node-doc"][data-id="D1"]']] },
  { id: "s06_findings", len: 17.5, hash: "#/findings", steps: [[2.2, "click", "#finding-R1 a"], [6.5, "hash", "#/findings/alerts"], [11, "scroll", 380]] },
  { id: "s07_simulate", len: 11, hash: "#/simulate", steps: [[0.8, "slide", "2026-12-31"], [6, "click", "#preset-1"], [8.5, "click", "#preset-2"]] },
  { id: "s08_workflow", len: 22, hash: "#/actions/workflow", steps: [
    [0.8, "click", "#lc-assign"], [3, "click", "#lc-upload"], [6.2, "point", "#main aside, #main .lg\\:sticky"],
    [9.2, "click", "#lc-close"], [13.5, "click", "#lc-approve"], [17.2, "click", "#lc-close"]] },
  { id: "s09_report", len: 10, hash: "#/report", steps: [[1.8, "click", '[data-lang="bn"]'], [4.5, "scroll", 700]] },
  { id: "s10_how", len: 23, url: SLIDES + "?s=how" },
  { id: "s11_close", len: 10.5, url: SLIDES + "?s=close" },
];

const OVERLAY = `
(function(){
  if (window.__tl) return;
  const st = document.createElement('style');
  st.textContent = '#__cur{position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.9);border:3px solid #2b3590;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;transition:left .55s cubic-bezier(.3,.7,.3,1),top .55s cubic-bezier(.3,.7,.3,1),transform .15s;left:70%;top:60%;opacity:0}'
   + '#__cur.on{opacity:1}#__cur.down{transform:scale(.7)}'
   + '#__cap{position:fixed;z-index:99998;left:50%;bottom:22px;transform:translateX(-50%);max-width:1180px;width:max-content;padding:10px 20px;border-radius:14px;background:rgba(12,14,34,.86);color:#fff;font:500 21px/1.4 "Schibsted Grotesk",system-ui,sans-serif;text-align:center;pointer-events:none}'
   + '#__cap:empty{display:none}';
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id='__cur'; document.body.appendChild(c);
  const cap = document.createElement('div'); cap.id='__cap'; document.body.appendChild(cap);
  window.__tl = {
    caption(t){ cap.textContent = t; },
    point(sel){ const el = document.querySelector(sel); if(!el) return false; el.scrollIntoView({block:'center',behavior:'smooth'});
      return new Promise(r=>setTimeout(()=>{ const b=el.getBoundingClientRect(); c.classList.add('on'); c.style.left=(b.left+Math.min(b.width/2,90))+'px'; c.style.top=(b.top+b.height/2)+'px'; setTimeout(()=>r(true),600); },350)); },
    async click(sel){ const ok = await this.point(sel); if(!ok) return false; c.classList.add('down'); setTimeout(()=>c.classList.remove('down'),180); document.querySelector(sel).click(); return true; },
    scroll(y){ window.scrollTo({top:y,behavior:'smooth'}); },
  };
})();`;

function chunks(text) {
  const parts = text.match(/[^.?!:]+[.?!:]+["']?\s*/g) || [text];
  const out = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && (last + p).length < 110) out[out.length - 1] = last + p; else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tl-rec-"));
  const port = 9800 + Math.floor(Math.random() * 100);
  const proc = spawn(CHROME, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); let frames = null; let sceneT0 = 0; const errors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Page.screencastFrame") {
      send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
      if (frames) frames.push({ t: performance.now() / 1000 - sceneT0, data: m.params.data });
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
  });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  // Start a demo session as the Compliance Officer (public demo account; sessionStorage lasts for this tab).
  await send("Page.navigate", { url: APP + "#/login" }); await sleep(2500);
  await ev(`sessionStorage.setItem("tl-session", "officer")`);

  for (const sc of SCENES) {
    if (sc.url) { await send("Page.navigate", { url: sc.url }); await sleep(2500); }
    else { await ev(`location.hash=${JSON.stringify(sc.hash)}`); await sleep(700); }
    await ev(`window.scrollTo(0,0)`);
    await ev(OVERLAY);
    await sleep(300);
    // caption schedule (inside the page so timing is independent of CDP latency)
    const text = narration.find((n) => n.id === sc.id).text;
    const cs = chunks(text), audio = dur[sc.id], total = cs.reduce((a, s) => a + s.length, 0);
    let acc = 0; const plan = cs.map((s) => { const at = acc; acc += (s.length / total) * audio; return [at, s]; });
    await ev(`(${JSON.stringify(plan)}).forEach(([at,s])=>setTimeout(()=>window.__tl.caption(s), at*1000)); setTimeout(()=>window.__tl.caption(''), ${(audio + 0.3) * 1000});`);

    frames = [];
    sceneT0 = performance.now() / 1000;
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
    frames.push({ t: 0, data: shot.result.data });
    await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

    for (const [at, kind, arg] of sc.steps || []) {
      const wait = at - (performance.now() / 1000 - sceneT0);
      if (wait > 0) await sleep(wait * 1000);
      if (kind === "click") { const ok = await ev(`window.__tl.click(${JSON.stringify(arg)})`); if (!ok) errors.push(`${sc.id}: no ${arg}`); }
      else if (kind === "point") await ev(`window.__tl.point(${JSON.stringify(arg)})`);
      else if (kind === "scroll") await ev(`window.__tl.scroll(${arg})`);
      else if (kind === "hash") { await ev(`location.hash=${JSON.stringify(arg)}`); await sleep(300); await ev(`window.scrollTo(0,0)`); }
      else if (kind === "slide") {
        await ev(`window.__tl.point('#sim-range')`);
        await ev(`(async()=>{const r=document.getElementById('sim-range');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
          const d0=Date.UTC(2026,9,1)/864e5, p=${JSON.stringify(arg)}.split('-'), target=Date.UTC(+p[0],p[1]-1,+p[2])/864e5-d0, start=+r.value;
          for(let i=1;i<=40;i++){ set.call(r,String(Math.round(start+(target-start)*i/40))); r.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(x=>setTimeout(x,55)); }})()`);
      }
    }
    const left = sc.len - (performance.now() / 1000 - sceneT0);
    if (left > 0) await sleep(left * 1000);
    await send("Page.stopScreencast");
    const got = frames; frames = null;

    // write frames + concat list
    const fdir = path.join(OUT, sc.id);
    fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
    const kept = got.filter((f) => f.t < sc.len).sort((a, b) => a.t - b.t);
    let list = "";
    kept.forEach((f, i) => {
      const name = `f${String(i).padStart(5, "0")}.jpg`;
      fs.writeFileSync(path.join(fdir, name), Buffer.from(f.data, "base64"));
      const next = i + 1 < kept.length ? kept[i + 1].t : sc.len;
      list += `file '${name}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
    });
    list += `file 'f${String(kept.length - 1).padStart(5, "0")}.jpg'\n`;
    fs.writeFileSync(path.join(fdir, "list.txt"), list);
    console.log(`${sc.id}: ${kept.length} frames, ${sc.len}s (audio ${audio.toFixed(1)}s)`);

    const wav = path.join(DIR, "audio", sc.id + ".wav");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(fdir, "list.txt"), "-i", wav,
      "-filter_complex", `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x151940,fps=30,format=yuv420p[v];[1:a]apad,atrim=0:${sc.len},aresample=48000[a]`,
      "-map", "[v]", "-map", "[a]", "-t", String(sc.len), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-ac", "2",
      path.join(OUT, sc.id + ".mp4")]);
  }

  const concat = SCENES.map((s) => `file '${s.id}.mp4'`).join("\n");
  fs.writeFileSync(path.join(OUT, "scenes.txt"), concat);
  const final = path.join(OUT, "threadlight-demo.mp4");
  const total = SCENES.reduce((a, s) => a + s.len, 0);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(OUT, "scenes.txt"),
    "-vf", `fade=in:0:15,fade=out:st=${(total - 0.6).toFixed(2)}:d=0.6`, "-af", `loudnorm=I=-16:TP=-1.5:LRA=11,afade=in:st=0:d=0.3,afade=out:st=${(total - 0.6).toFixed(2)}:d=0.6`, "-ar", "48000",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final]);
  console.log("errors:", errors.length ? errors : "none");
  console.log("wrote", final, total + "s");
  ws.close(); proc.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
