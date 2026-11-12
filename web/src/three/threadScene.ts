// Three.js scene behind the indigo panels: threads of light with pulses travelling along them.
// "weave" is the ambient backdrop (sign-in, overview hero); "path" is one thread through a row of
// stations, where the active station lights up and the camera follows it (agent frameworks page).
// Loaded with a dynamic import, so three.js is not part of the first page.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, Group, Mesh, PerspectiveCamera,
  Points, PointsMaterial, Scene, ShaderMaterial, Sprite, SpriteMaterial, TubeGeometry, Vector3, WebGLRenderer,
} from "three";

export interface ThreadSceneOptions {
  variant: "weave" | "path";
  /** path: number of stations on the thread */
  nodes?: number;
  /** false renders still frames only (reduced motion) */
  animate: boolean;
  /** scroll progress 0..1, read every frame */
  progress?: () => number;
}

export interface ThreadSceneHandle {
  setActive(i: number): void;
  setPointer(x: number, y: number): void;
  setRunning(on: boolean): void;
  dispose(): void;
}

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A dim strand with bright pulses moving along it; uReveal draws the strand in from its start.
const FRAG = `
uniform float uTime;
uniform float uSpeed;
uniform float uOffset;
uniform float uReveal;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uGlow;
varying vec2 vUv;
void main() {
  float t = fract(vUv.x * 2.0 - uTime * uSpeed + uOffset);
  float pulse = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.06, 0.42, t));
  float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
  float shown = 1.0 - smoothstep(uReveal - 0.03, uReveal, vUv.x);
  vec3 col = mix(uColor, uGlow, pulse);
  float a = (0.3 + 0.7 * pulse) * ends * shown * uOpacity;
  gl_FragColor = vec4(col, a);
}`;

const BASE = new Color("#8f9bff"), GLOW = new Color("#fff0d2"), ACCENT = new Color("#6edea0"), DIM = new Color("#7d88e8");

function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Returns null when WebGL is not available; the SVG motif under the canvas stays as the fallback. */
export function createThreadScene(canvas: HTMLCanvasElement, opts: ThreadSceneOptions): ThreadSceneHandle | null {
  const attrs = { alpha: true, antialias: true, powerPreference: "low-power" as const };
  const gl = (canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs)) as WebGLRenderingContext | null;
  if (!gl) return null;
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true }); } catch { return null; }
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.set(0, 0, 9);
  const root = new Group();
  scene.add(root);

  const disposables: { dispose(): void }[] = [];
  const threads: ShaderMaterial[] = [];
  const sprite = glowTexture();
  disposables.push(sprite);

  const addThread = (pts: Vector3[], radius: number, speed: number, offset: number, opacity: number) => {
    const curve = new CatmullRomCurve3(pts);
    const geo = new TubeGeometry(curve, 220, radius, 6, false);
    const mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSpeed: { value: speed }, uOffset: { value: offset }, uReveal: { value: opts.animate ? 0 : 1.05 },
        uOpacity: { value: opacity }, uColor: { value: BASE.clone() }, uGlow: { value: GLOW.clone() } },
    });
    root.add(new Mesh(geo, mat));
    threads.push(mat);
    disposables.push(geo, mat);
    return curve;
  };

  const addGlow = (pos: Vector3, size: number, color: Color, opacity: number) => {
    const mat = new SpriteMaterial({ map: sprite, color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending });
    const s = new Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(size);
    root.add(s);
    disposables.push(mat);
    return s;
  };

  // Deterministic pseudo-random numbers so the scene looks the same on every visit.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const twinkles: { s: Sprite; base: number; phase: number }[] = [];
  const stations: { s: Sprite; core: Sprite; pos: Vector3 }[] = [];
  let traveller: Sprite | null = null;
  let mainCurve: CatmullRomCurve3 | null = null;
  const n = Math.max(2, opts.nodes ?? 6);
  const stationU = (i: number) => 0.08 + (0.84 * i) / (n - 1);

  if (opts.variant === "weave") {
    for (let k = 0; k < 7; k++) {
      const phase = rnd() * 6.28, amp = 0.5 + rnd() * 1.1, f = 0.45 + rnd() * 0.5, y0 = (k - 3) * 0.55, depth = 0.6 + rnd() * 1.6;
      const pts: Vector3[] = [];
      for (let x = -9; x <= 9; x += 1.5) pts.push(new Vector3(x, y0 + Math.sin(x * f + phase) * amp, Math.cos(x * f * 0.8 + phase) * depth - 1));
      const curve = addThread(pts, 0.016 + rnd() * 0.026, 0.05 + rnd() * 0.07, rnd(), 0.65 + rnd() * 0.35);
      for (let j = 0; j < 3; j++) {
        const s = addGlow(curve.getPoint(0.15 + rnd() * 0.7), 0.16 + rnd() * 0.2, rnd() > 0.75 ? ACCENT : GLOW, 0.8);
        twinkles.push({ s, base: s.scale.x, phase: rnd() * 6.28 });
      }
    }
  } else {
    const span = (n - 1) * 2.4;
    const at = (u: number, wob: number, z: number) => new Vector3((u - 0.5) * span * 1.25, Math.sin(u * Math.PI * 2.2 + wob) * 0.85, z + Math.cos(u * 7 + wob) * 0.5);
    const line = (wob: number, z: number) => Array.from({ length: 16 }, (_, i) => at(i / 15, wob, z));
    mainCurve = addThread(line(0, 0), 0.03, 0.09, 0, 1);
    addThread(line(1.3, -1.2), 0.014, 0.06, 0.3, 0.55);
    addThread(line(2.6, -2.2), 0.012, 0.05, 0.7, 0.4);
    for (let i = 0; i < n; i++) {
      const pos = mainCurve.getPoint(stationU(i));
      stations.push({ s: addGlow(pos, 0.5, DIM.clone(), 0.55), core: addGlow(pos, 0.14, new Color("#ffffff"), 0.9), pos });
    }
    traveller = addGlow(mainCurve.getPoint(stationU(0)), 0.9, GLOW.clone(), 0.95);
  }

  // Dust: slow points of light that give the scene depth.
  const DUST = 260, dust = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { dust[i * 3] = (rnd() - 0.5) * 22; dust[i * 3 + 1] = (rnd() - 0.5) * 9; dust[i * 3 + 2] = (rnd() - 0.5) * 9 - 1; }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(dust, 3));
  const dustMat = new PointsMaterial({ map: sprite, color: 0xb9c1ff, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
  const dustPoints = new Points(dustGeo, dustMat);
  scene.add(dustPoints);
  disposables.push(dustGeo, dustMat);

  let active = 0, travelU = stationU(0), camX = 0, px = 0, py = 0, tx = 0, ty = 0;
  let raf = 0, running = false, disposed = false, time = 0, last = 0;

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow panels: pull the camera back so the threads still cross the whole width.
    camera.position.z = opts.variant === "path" ? 7.5 : 9 + Math.max(0, 1.2 - camera.aspect) * 5;
    camera.updateProjectionMatrix();
  };

  const frame = (dt: number) => {
    time += dt;
    const p = opts.progress?.() ?? 0;
    for (const m of threads) {
      m.uniforms.uTime.value = time;
      if (m.uniforms.uReveal.value < 1.05) m.uniforms.uReveal.value = Math.min(1.05, m.uniforms.uReveal.value + dt * 0.8);
    }
    px += (tx - px) * Math.min(1, dt * 3);
    py += (ty - py) * Math.min(1, dt * 3);
    for (const t of twinkles) t.s.scale.setScalar(t.base * (1 + 0.35 * Math.sin(time * 1.4 + t.phase)));
    dustPoints.rotation.y = time * 0.012 + px * 0.05;
    dustPoints.position.y = p * 1.2;

    if (opts.variant === "weave") {
      root.rotation.x = -0.12 + py * 0.06 + p * 0.35;
      root.rotation.y = px * 0.1 + Math.sin(time * 0.1) * 0.05;
      root.position.y = Math.sin(time * 0.25) * 0.12 + p * 0.9;
      root.position.x = -p * 1.5;
    } else if (mainCurve && traveller) {
      const k = Math.min(1, dt * 2.6);
      travelU += (stationU(active) - travelU) * k;
      traveller.position.copy(mainCurve.getPoint(travelU));
      traveller.scale.setScalar(0.9 + 0.12 * Math.sin(time * 3));
      stations.forEach((st, i) => {
        const on = i === active, done = i < active;
        const target = on ? 1.15 : done ? 0.6 : 0.45;
        st.s.scale.setScalar(st.s.scale.x + (target - st.s.scale.x) * k);
        (st.s.material as SpriteMaterial).color.lerp(on ? GLOW : done ? ACCENT : DIM, k);
        (st.s.material as SpriteMaterial).opacity += ((on ? 1 : done ? 0.75 : 0.45) - (st.s.material as SpriteMaterial).opacity) * k;
      });
      camX += (stations[active].pos.x - camX) * Math.min(1, dt * 1.8);
      camera.position.x = camX + px * 0.4;
      camera.position.y = stations[active].pos.y * 0.5 + py * 0.25;
      camera.lookAt(camX, stations[active].pos.y * 0.5, 0);
      root.rotation.x = -0.08 + py * 0.04;
    }
    renderer.render(scene, camera);
  };

  const still = () => { if (!disposed) { resize(); frame(0); } };
  const loop = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    raf = requestAnimationFrame(loop);
  };

  const ro = new ResizeObserver(() => { resize(); if (!running) still(); });
  ro.observe(canvas);
  resize();
  if (opts.variant === "path") { travelU = stationU(0); camX = stations[0].pos.x; }
  still();

  return {
    setActive(i) {
      active = Math.max(0, Math.min(n - 1, i));
      if (!opts.animate) { travelU = stationU(active); camX = stations[active]?.pos.x ?? 0; for (let k = 0; k < 40; k++) frame(0.05); time = 0; still(); }
    },
    setPointer(x, y) { tx = x; ty = y; },
    setRunning(on) {
      if (disposed || !opts.animate || on === running) return;
      running = on;
      if (on) { last = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    },
    dispose() {
      disposed = true; running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
