// Records the ThreadLight live-demo video against the DEPLOYED system: signs in through the real API, uploads a
// real PDF (the renewed fire certificate), lets the Gemini pipeline run, approves it as the officer and shows the
// passport change. Frames come from the DevTools screencast; each scene is muxed with its narration WAV via ffmpeg.
//
// Usage (Windows): reset the demo on the server (python -m backend.db.reset_demo in the api container), then
//   powershell -File tools/video/tts.ps1      (offline Windows voice -> tools/video/audio/*.wav)
//   node tools/video/record.js                 -> recordings/threadlight-demo.mp4 (git-ignored)
// Needs Node 22+, Chrome, ffmpeg/ffprobe on PATH. TL_APP overrides the app address.
"use strict";
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = __dirname;
const ROOT = path.resolve(DIR, "..", "..");
const OUT = process.argv[2] || path.join(ROOT, "recordings");
const APP = process.env.TL_APP || "http://165.99.219.251:8095/";
const SLIDES = "file:///" + path.join(DIR, "slides.html").replace(/\\/g, "/");
const UPLOAD = path.join(ROOT, "synth", "out", "v1", "fire_certificate_renewal.pdf");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FONT = "C:/Windows/Fonts/segoeui.ttf";
const narration = JSON.parse(fs.readFileSync(path.join(DIR, "narration.json"), "utf8"));
const dur = Object.fromEntries(narration.map((n) => [n.id, +execFileSync("ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(DIR, "audio", n.id + ".wav")]).toString().trim()]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIMIT = 179;

// Scene plan (180-second structure): Problem, live demo (sign in, passport, upload, pipeline, review, result),
// AI approach (System page + slide), Impact. Steps are actions at offsets (seconds from scene start).
// `fastForward`: record in real time until `until` is true in the page, then compress the scene to its narration.
const SCENES = [
  { id: "p1_user", seg: "1 Problem", min: 0, url: SLIDES + "?s=user" },
  { id: "l1_signin", seg: "2 Live demo", min: 9, url: APP + "#/login", fresh: true,
    steps: [[1.2, "click", "#mode-live"], [4.6, "click", "#login-as-officer"]] },
  { id: "l2_overview", seg: "2 Live demo", min: 9, hash: "#/",
    steps: [[0.8, "point", '[data-testid="kpi-coverage"]'], [4.2, "point", '[data-testid="kpi-risk"]']] },
  { id: "l3_upload", seg: "2 Live demo", min: 8, hash: "#/upload",
    steps: [[0.8, "select", "D1"], [3.2, "pointText", "Choose files"], [4.6, "upload", UPLOAD]] },
  { id: "l4_pipeline", seg: "2 Live demo", fastForward: true, timeout: 420,
    until: `document.body.textContent.includes("Waiting for the Compliance Officer to approve") || document.body.textContent.includes("Failed")` },
  { id: "l5_review", seg: "2 Live demo", min: 11, hash: "#/review",
    steps: [[1.5, "pointText", "Approve"], [7.2, "clickText", "Approve"]] },
  { id: "l6_result", seg: "2 Live demo", min: 9, hash: "#/", reload: true, waitDone: true,
    steps: [[0.8, "point", '[data-testid="kpi-coverage"]'], [5, "hash", "#/findings"]] },
  { id: "l7_system", seg: "3 AI approach", min: 16, hash: "#/system",
    steps: [[6, "scroll", 560], [12, "scroll", 1250], [17, "scroll", 2000]] },
  { id: "a1_flow", seg: "3 AI approach", min: 0, url: SLIDES + "?s=flow" },
  { id: "i1_impact", seg: "4 Impact & next", min: 0, url: SLIDES + "?s=impact" },
];

for (const sc of SCENES) sc.len = +Math.max(sc.min || 0, dur[sc.id] + 0.8).toFixed(2);
const TOTAL = SCENES.reduce((a, s) => a + s.len, 0);
if (TOTAL > LIMIT) { console.error(`Planned length ${TOTAL.toFixed(1)}s is over ${LIMIT}s; shorten the narration.`); process.exit(1); }
console.log(`planned length ${TOTAL.toFixed(1)}s`);

const OVERLAY = `
(function(){
  if (window.__tl) return;
  const st = document.createElement('style');
  st.textContent = '#__cur{position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.9);border:3px solid #2b3590;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;transition:left .55s cubic-bezier(.3,.7,.3,1),top .55s cubic-bezier(.3,.7,.3,1),transform .15s;left:70%;top:60%;opacity:0}'
   + '#__cur.on{opacity:1}#__cur.down{transform:scale(.7)}'
   + '#__cap{position:fixed;z-index:99998;left:50%;bottom:22px;transform:translateX(-50%);max-width:1180px;width:max-content;padding:10px 20px;border-radius:14px;background:rgba(12,14,34,.86);color:#fff;font:500 21px/1.4 "Schibsted Grotesk",system-ui,sans-serif;text-align:center;pointer-events:none}'
   + '#__cap:empty{display:none}'
   + '#__seg{position:fixed;z-index:99998;right:18px;top:14px;padding:5px 12px;border-radius:999px;background:rgba(12,14,34,.86);color:#6ee0a0;font:600 13px/1.4 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;pointer-events:none}'
   + '#__ff{position:fixed;z-index:99998;left:50%;transform:translateX(-50%);top:64px;padding:8px 18px;border-radius:999px;background:#f0c25a;color:#151940;font:700 16px/1.4 "IBM Plex Mono",monospace;letter-spacing:.06em;pointer-events:none}'
   + '#__ff:empty{display:none}';
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id='__cur'; document.body.appendChild(c);
  const cap = document.createElement('div'); cap.id='__cap'; document.body.appendChild(cap);
  const seg = document.createElement('div'); seg.id='__seg'; document.body.appendChild(seg);
  const ff = document.createElement('div'); ff.id='__ff'; document.body.appendChild(ff);
  const byText = (t) => [...document.querySelectorAll('button,a,label')].find(e => e.textContent.trim() === t);
  window.__tl = {
    caption(t){ cap.textContent = t; },
    segment(t){ seg.textContent = t; },
    fastForward(t){ ff.textContent = t; },
    pointEl(el){ if(!el) return false; el.scrollIntoView({block:'center',behavior:'smooth'});
      return new Promise(r=>setTimeout(()=>{ const b=el.getBoundingClientRect(); c.classList.add('on'); c.style.left=(b.left+Math.min(b.width/2,90))+'px'; c.style.top=(b.top+b.height/2)+'px'; setTimeout(()=>r(true),600); },350)); },
    point(sel){ return this.pointEl(document.querySelector(sel)); },
    pointText(t){ return this.pointEl(byText(t)); },
    async clickEl(el){ const ok = await this.pointEl(el); if(!ok) return false; c.classList.add('down'); setTimeout(()=>c.classList.remove('down'),180); el.click(); return true; },
    click(sel){ return this.clickEl(document.querySelector(sel)); },
    clickText(t){ return this.clickEl(byText(t)); },
    async select(v){ const s=document.querySelector('select'); if(!s) return false; await this.pointEl(s);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,v); s.dispatchEvent(new Event('change',{bubbles:true})); return true; },
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

function captionPlan(id) {
  const cs = chunks(narration.find((n) => n.id === id).text), audio = dur[id], total = cs.reduce((a, s) => a + s.length, 0);
  let acc = 0;
  return cs.map((s) => { const at = acc; acc += (s.length / total) * audio; return [at, acc, s]; });
}

async function main() {
  for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
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
  const waitFor = async (expr, secs) => { for (let t = 0; t < secs; t += 1) { if (await ev(expr)) return true; await sleep(1000); } return false; };
  const setFile = async (file) => {
    const doc = await send("DOM.getDocument");
    const node = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#upload-input" });
    await send("DOM.setFileInputFiles", { nodeId: node.result.nodeId, files: [file] });
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

  for (const sc of SCENES) {
    if (sc.fresh) { await send("Page.navigate", { url: APP }); await sleep(1500); await ev(`sessionStorage.clear()`); }
    if (sc.url) { await send("Page.navigate", { url: sc.url }); await sleep(2500); }
    else if (sc.hash) {
      if (sc.waitDone) {
        // the worker finalises the passport a moment after approval; wait for it, then load fresh data
        await waitFor(`fetch("/api/factories/1/passport",{headers:{Authorization:"Bearer "+sessionStorage.getItem("tl-token")}}).then(r=>r.json()).then(j=>j.scores&&j.scores.coverage===55)`, 90);
      }
      await ev(`location.hash=${JSON.stringify(sc.hash)}`);
      if (sc.reload) { await ev(`location.reload()`); await sleep(2500); } else await sleep(900);
    }
    await ev(`window.scrollTo(0,0)`);
    await ev(OVERLAY);
    await ev(`window.__tl.segment(${JSON.stringify(sc.seg)})`);
    await sleep(300);
    const plan = captionPlan(sc.id);
    if (!sc.fastForward) {
      await ev(`(${JSON.stringify(plan.map(([a, , s]) => [a, s]))}).forEach(([at,s])=>setTimeout(()=>window.__tl.caption(s), at*1000)); setTimeout(()=>window.__tl.caption(''), ${(dur[sc.id] + 0.3) * 1000});`);
    }

    frames = [];
    sceneT0 = performance.now() / 1000;
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
    frames.push({ t: 0, data: shot.result.data });
    await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

    let real = sc.len;
    if (sc.fastForward) {
      await ev(`window.__tl.fastForward("\u25B6\u25B6 FAST-FORWARD \u00B7 live pipeline on the server")`);
      const ok = await waitFor(sc.until, sc.timeout);
      if (!ok) errors.push(`${sc.id}: pipeline did not reach the approval step in ${sc.timeout}s`);
      await sleep(1500);
      real = performance.now() / 1000 - sceneT0;
      await ev(`window.__tl.fastForward("")`);
      console.log(`${sc.id}: real pipeline time ${real.toFixed(1)}s, shown in ${sc.len}s`);
    } else {
      for (const [at, kind, arg] of sc.steps || []) {
        const wait = at - (performance.now() / 1000 - sceneT0);
        if (wait > 0) await sleep(wait * 1000);
        let ok = true;
        if (kind === "click") ok = await ev(`window.__tl.click(${JSON.stringify(arg)})`);
        else if (kind === "clickText") ok = await ev(`window.__tl.clickText(${JSON.stringify(arg)})`);
        else if (kind === "point") ok = await ev(`window.__tl.point(${JSON.stringify(arg)})`);
        else if (kind === "pointText") ok = await ev(`window.__tl.pointText(${JSON.stringify(arg)})`);
        else if (kind === "select") ok = await ev(`window.__tl.select(${JSON.stringify(arg)})`);
        else if (kind === "upload") await setFile(arg);
        else if (kind === "scroll") await ev(`window.__tl.scroll(${arg})`);
        else if (kind === "hash") { await ev(`location.hash=${JSON.stringify(arg)}`); await sleep(400); await ev(OVERLAY); await ev(`window.__tl.segment(${JSON.stringify(sc.seg)})`); }
        if (ok === false) errors.push(`${sc.id}: ${kind} ${arg} not found`);
      }
      const left = sc.len - (performance.now() / 1000 - sceneT0);
      if (left > 0) await sleep(left * 1000);
    }
    await send("Page.stopScreencast");
    const scale = sc.len / real; // 1 for normal scenes, < 1 for fast-forward
    const got = frames.map((f) => ({ t: f.t * scale, data: f.data })); frames = null;

    const fdir = path.join(OUT, sc.id);
    fs.mkdirSync(fdir, { recursive: true });
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
    console.log(`${sc.id}: ${kept.length} frames, ${sc.len}s (audio ${dur[sc.id].toFixed(1)}s)`);

    // fast-forward scenes get their captions burnt in by ffmpeg, timed on the final (compressed) timeline
    let vf = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x151940,fps=30`;
    if (sc.fastForward) {
      fs.copyFileSync(FONT, path.join(fdir, "font.ttf"));
      plan.forEach(([a, b, s], i) => {
        fs.writeFileSync(path.join(fdir, `c${i}.txt`), s);
        vf += `,drawtext=fontfile=font.ttf:textfile=c${i}.txt:fontsize=30:fontcolor=white:box=1:boxcolor=0x0c0e22@0.86:boxborderw=16:x=(w-text_w)/2:y=h-text_h-44:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`;
      });
    }
    vf += `,format=yuv420p[v];[1:a]apad,atrim=0:${sc.len},aresample=48000[a]`;
    const wav = path.join(DIR, "audio", sc.id + ".wav");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", wav,
      "-filter_complex", vf, "-map", "[v]", "-map", "[a]", "-t", String(sc.len), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-c:a", "aac", "-b:a", "160k", "-ac", "2", path.join(OUT, sc.id + ".mp4")], { cwd: fdir });
  }

  fs.writeFileSync(path.join(OUT, "scenes.txt"), SCENES.map((s) => `file '${s.id}.mp4'`).join("\n"));
  const final = path.join(OUT, "threadlight-demo.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(OUT, "scenes.txt"),
    "-vf", `fade=in:0:15,fade=out:st=${(TOTAL - 0.6).toFixed(2)}:d=0.6`, "-af", `loudnorm=I=-16:TP=-1.5:LRA=11,afade=in:st=0:d=0.3,afade=out:st=${(TOTAL - 0.6).toFixed(2)}:d=0.6`,
    "-ar", "48000", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final]);
  for (const sc of SCENES) fs.rmSync(path.join(OUT, sc.id), { recursive: true, force: true });
  console.log("errors:", errors.length ? errors : "none");
  console.log("wrote", final, TOTAL.toFixed(1) + "s");
  ws.close(); proc.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
