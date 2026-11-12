import type { Config } from "tailwindcss";

// Colours point at CSS variables (RGB channels, see src/styles/index.css), so light and dark
// themes swap tokens instead of needing dark: variants on every element.
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: { DEFAULT: c("surface"), 2: c("surface-2"), 3: c("surface-3") },
        ink: { DEFAULT: c("ink"), 2: c("ink-2"), 3: c("ink-3") },
        line: c("line"),
        thread: { DEFAULT: c("thread"), strong: c("thread-strong"), soft: c("thread-soft"), on: c("on-thread") },
        ok: { DEFAULT: c("ok"), bg: c("ok-bg") },
        gap: { DEFAULT: c("gap"), bg: c("gap-bg") },
        insuf: { DEFAULT: c("insuf"), bg: c("insuf-bg") },
        conf: { DEFAULT: c("conf"), bg: c("conf-bg") },
        pend: { DEFAULT: c("pend"), bg: c("pend-bg") },
        side: { DEFAULT: c("side-bg"), ink: c("side-ink"), "ink-2": c("side-ink-2"), hover: c("side-hover"), active: c("side-active"), line: c("side-line") },
        hero: { DEFAULT: c("hero-bg"), ink: c("hero-ink"), "ink-2": c("hero-ink-2") },
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk"', "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", '"Cascadia Mono"', "Consolas", "monospace"],
        bn: ['"Noto Sans Bengali"', '"Schibsted Grotesk"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.05), 0 8px 24px -12px rgb(var(--shadow) / 0.12)",
        lift: "0 2px 4px rgb(var(--shadow) / 0.06), 0 16px 40px -16px rgb(var(--shadow) / 0.22)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { from: { opacity: "0", transform: "scale(.98) translateY(-4px)" }, to: { opacity: "1", transform: "none" } },
        "tile-in": { from: { opacity: "0", transform: "scale(.6) rotate(-12deg)" }, to: { opacity: "1", transform: "none" } },
        "grow-x": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
        "grow-y": { from: { transform: "scaleY(0)" }, to: { transform: "scaleY(1)" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-up": "fade-up .35s ease-out both", "pop-in": "pop-in .16s ease-out both",
        "tile-in": "tile-in .5s cubic-bezier(.2,1.4,.4,1) both", "grow-x": "grow-x .9s cubic-bezier(.2,.7,.2,1) both",
        "grow-y": "grow-y .3s ease-out both", float: "float 6s ease-in-out infinite", "rise-in": "rise-in .6s cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
