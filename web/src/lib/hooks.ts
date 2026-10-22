import { useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";
export const THEMES: ThemeChoice[] = ["auto", "light", "dark"];

/** Theme preference: auto follows the OS; light/dark set [data-theme] on <html>. Stored per viewer. */
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      const v = localStorage.getItem("tl-theme") as ThemeChoice | null;
      return v && THEMES.includes(v) ? v : "auto";
    } catch {
      return "auto";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try { localStorage.setItem("tl-theme", theme); } catch { /* storage blocked */ }
  }, [theme]);
  return [theme, setTheme];
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
