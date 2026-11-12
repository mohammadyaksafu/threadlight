import { useEffect, useRef, type RefObject } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";
import type { ThreadSceneHandle } from "@/three/threadScene";
import { cx } from "@/components/ui";

/**
 * Decorative WebGL layer for the indigo panels. It fills its positioned parent, ignores the pointer and
 * is hidden from assistive tech. three.js loads on demand; the animation pauses while the canvas is
 * off-screen or the tab is hidden, and reduced-motion users get one still frame.
 */
export function ThreadCanvas({ variant = "weave", nodes, active = 0, progress, className }: {
  variant?: "weave" | "path"; nodes?: number; active?: number; progress?: RefObject<number>; className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<ThreadSceneHandle | null>(null);
  const activeRef = useRef(active);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false, visible = false;
    const sync = () => handle.current?.setRunning(visible && !document.hidden);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
    const onPointer = (e: PointerEvent) => handle.current?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);

    void import("@/three/threadScene").then(({ createThreadScene }) => {
      if (cancelled) return;
      const h = createThreadScene(el, { variant, nodes, animate: !reduced, progress: progress ? () => progress.current ?? 0 : undefined });
      if (!h) return;
      handle.current = h;
      h.setActive(activeRef.current);
      el.dataset.ready = "";
      io.observe(el);
      document.addEventListener("visibilitychange", sync);
      if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });
    });

    return () => {
      cancelled = true;
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", onPointer);
      handle.current?.dispose();
      handle.current = null;
      delete el.dataset.ready;
    };
  }, [variant, nodes, reduced, progress]);

  useEffect(() => { activeRef.current = active; handle.current?.setActive(active); }, [active]);

  return <canvas ref={canvas} aria-hidden="true"
    className={cx("pointer-events-none absolute inset-0 h-full w-full opacity-0 motion-safe:transition-opacity motion-safe:duration-1000 data-[ready]:opacity-100", className)} />;
}
