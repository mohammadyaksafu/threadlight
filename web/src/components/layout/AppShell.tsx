import { Info, Menu, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "@/nav";
import { useTheme } from "@/lib/hooks";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

/** App frame: indigo sidebar (drawer on small screens), top bar with search + live readiness, page outlet. */
export function AppShell() {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);

  // New page: close the drawer, scroll to top, move focus to the page so screen readers announce it.
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  // Ctrl/Cmd+K or "/" opens search; keys 1-7 open the seven sections (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      if (e.key === "Escape") setOpen(false);
      if (palette || typing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "/") { e.preventDefault(); setPalette(true); return; }
      const item = NAV_ITEMS.find((i) => i.shortcut === e.key);
      if (item) navigate(item.to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, palette]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <a href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>

      <Sidebar open={open} onClose={() => setOpen(false)} theme={theme} onTheme={setTheme} />

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/80 backdrop-blur-md print:hidden supports-[backdrop-filter]:bg-bg/70">
          <div className="flex min-h-[64px] flex-wrap items-center gap-2 px-4 sm:flex-nowrap sm:gap-3 sm:px-8">
            <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface hover:text-ink lg:hidden"
              aria-label="Open navigation" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
              <Menu size={20} aria-hidden="true" />
            </button>
            <span className="flex-1 text-[17px] font-extrabold tracking-tight sm:hidden">ThreadLight</span>
            <button type="button" id="open-search" onClick={() => setPalette(true)} aria-label="Search and jump (Ctrl K)"
              className="flex h-10 shrink-0 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink-3 shadow-sm hover:border-thread/50 hover:text-ink-2 max-sm:w-10 max-sm:justify-center max-sm:px-0 md:w-64">
              <Search size={16} aria-hidden="true" />
              <span className="flex-1 text-left max-sm:hidden">Search or jump to&hellip;</span>
              <kbd className="rounded-md border border-line bg-surface-2 px-1.5 font-mono text-[10.5px] max-md:hidden">Ctrl K</kbd>
            </button>
            <StatusBar />
          </div>
          <p data-testid="synthetic-banner" role="note"
            className="flex items-start gap-2 border-t border-thread/10 bg-thread-soft/60 px-4 py-2 text-[12.5px] font-medium text-ink-2 sm:px-8">
            <Info size={14} className="mt-0.5 shrink-0 text-thread" aria-hidden="true" />
            <span><strong className="text-ink">Synthetic data.</strong> Rules run live in your browser. Extraction results are pre-computed samples, not live AI.</span>
          </p>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-8 lg:py-10">
          <div key={location.pathname} className="motion-safe:animate-fade-up"><Outlet /></div>
        </main>

        <footer className="border-t border-line/80 print:hidden">
          <div className="mx-auto max-w-6xl px-4 py-6 text-[12.5px] text-ink-3 sm:px-8">
            ThreadLight prototype. All factories, buyers, frameworks, documents and reference numbers are synthetic. No language model, OCR
            service or network API is called; the only external request is for Google Fonts. The risk figure is a decision-support index,
            not an audit score or probability.
          </div>
        </footer>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
