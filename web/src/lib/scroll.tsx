// Scroll effects: reveal-on-scroll, per-element scroll progress, the page progress bar and count-up numbers.
// All of them are progressive: with reduced motion (or no IntersectionObserver) content is simply shown.

import { useEffect, useRef, useState, type RefObject } from "react";
import { usePrefersReducedMotion } from "./hooks";

let revealObserver: IntersectionObserver | null = null;
function observer(): IntersectionObserver | null {
  if (revealObserver || typeof IntersectionObserver === "undefined") return revealObserver;
  revealObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      (e.target as HTMLElement).dataset.in = "";
      revealObserver!.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -5% 0px", threshold: 0.04 });
  return revealObserver;
}

/**
 * Put the returned ref on an element that also has a `data-reveal` attribute. The element fades and
 * rises in the first time it scrolls into view (styles in index.css). `data-in` is set outside React,
 * so re-renders do not reset it.
 */
export function useReveal<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = observer();
    if (!io) { el.dataset.in = ""; return; }
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  return ref;
}

/** Runs `fn` at most once per animation frame on scroll and resize, and once on mount. */
function onScrollFrame(fn: () => void): () => void {
  let raf = 0;
  const tick = () => { raf = 0; fn(); };
  const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
  window.addEventListener("scroll", on, { passive: true });
  window.addEventListener("resize", on);
  fn();
  return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
}

/**
 * Tracks how far an element has travelled through the viewport: 0 when its top reaches the bottom edge,
 * 1 when its bottom leaves the top. The value is written to the returned ref (for WebGL) and to the
 * `--p` CSS variable on the element (for CSS parallax), without re-rendering React.
 */
export function useScrollProgress<T extends HTMLElement>(): [RefObject<T>, RefObject<number>] {
  const el = useRef<T>(null);
  const progress = useRef(0);
  useEffect(() => onScrollFrame(() => {
    const node = el.current;
    if (!node) return;
    const r = node.getBoundingClientRect(), vh = window.innerHeight || 1;
    const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
    progress.current = p;
    node.style.setProperty("--p", p.toFixed(4));
  }), []);
  return [el, progress];
}

/** Thin bar under the top bar that fills as the page scrolls. Hidden on pages that do not scroll. */
export function ScrollProgressBar() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => onScrollFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar.current) bar.current.style.transform = `scaleX(${max > 40 ? Math.min(1, window.scrollY / max) : 0})`;
  }), []);
  return <div ref={bar} aria-hidden="true" className="scroll-bar pointer-events-none absolute inset-x-0 -bottom-px h-[3px] origin-left" style={{ transform: "scaleX(0)" }} />;
}

/** True once the page has scrolled past `offset` pixels. */
export function useScrolled(offset = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => onScrollFrame(() => setScrolled(window.scrollY > offset)), [offset]);
  return scrolled;
}

/** Number that counts up to its value when it first appears and glides when the value changes. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current;
    let raf = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(a + (value - a) * eased);
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);
  return <span aria-label={String(value)}>{shown}</span>;
}
