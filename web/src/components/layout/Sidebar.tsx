import { Monitor, Moon, Sun, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { SAMPLE } from "@/data/sample";
import { THEMES, type ThemeChoice } from "@/lib/hooks";
import { NAV } from "@/nav";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { cx } from "@/components/ui";

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="32" height="32" rx="9" fill="rgb(var(--side-ink) / 0.1)" stroke="rgb(var(--side-ink) / 0.25)" />
      <path d="M7 22 C 12 8, 17 30, 22 14 S 27 10, 28 12" fill="none" stroke="rgb(var(--side-ink))" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22" cy="14" r="2.6" fill="rgb(var(--side-ink))" />
    </svg>
  );
}

const THEME_META: Record<ThemeChoice, { label: string; icon: typeof Sun }> = {
  auto: { label: "System", icon: Monitor },
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
};

/** Deep-indigo navigation panel. Static column on large screens; slide-in drawer below lg. Rendered once so ids stay unique. */
export function Sidebar({ open, onClose, theme, onTheme }: {
  open: boolean; onClose: () => void; theme: ThemeChoice; onTheme: (t: ThemeChoice) => void;
}) {
  const { result } = useThreadLight();
  const badge: Record<string, number> = {
    documents: result.active_documents.length,
    findings: result.scores.open_findings,
    actions: result.plan.length,
  };

  return (
    <>
      <div onClick={onClose} aria-hidden="true"
        className={cx("fixed inset-0 z-40 bg-black/45 backdrop-blur-sm motion-safe:transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside id="sidebar" aria-label="Main"
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-hidden bg-side text-side-ink print:hidden motion-safe:transition-transform motion-safe:duration-200",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-auto lg:translate-x-0",
          open ? "translate-x-0 shadow-lift" : "-translate-x-full max-lg:invisible",
        )}>
        {/* quiet thread motif */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-36 h-48 w-full text-side-ink/[0.06]" viewBox="0 0 280 190" fill="none" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-10 150 C 60 20, 120 200, 190 80 S 260 30, 300 60" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
        </svg>

        <div className="relative flex items-center gap-3 px-5 pb-5 pt-6">
          <Logo />
          <div className="min-w-0 flex-1">
            <div className="text-[19px] font-extrabold leading-tight tracking-tight">ThreadLight</div>
            <div className="text-xs text-side-ink-2">Verified Evidence Passport</div>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-side-ink-2 hover:bg-side-hover hover:text-side-ink lg:hidden"
            aria-label="Close navigation" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>

        <nav aria-label="Sections" className="relative flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
          {NAV.map((g) => (
            <div key={g.label ?? "top"} className="mt-2 first:mt-0">
              {g.label && <div className="px-3 pb-1.5 pt-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-side-ink-2/80">{g.label}</div>}
              <ul className="grid gap-0.5">
                {g.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.id}>
                      <NavLink id={`nav-${it.id}`} to={it.to} end={it.to === "/"}
                        className={({ isActive }) => cx(
                          "relative flex min-h-[42px] items-center gap-3 rounded-xl px-3 text-sm font-medium motion-safe:transition-colors",
                          isActive ? "bg-side-active text-side-ink shadow-sm" : "text-side-ink-2 hover:bg-side-hover hover:text-side-ink",
                        )}>
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute -left-3 bottom-2 top-2 w-1 rounded-r-full bg-side-ink" aria-hidden="true" />}
                            <Icon size={18} aria-hidden="true" className="shrink-0" />
                            <span className="flex-1">{it.label}</span>
                            {badge[it.id] !== undefined && (
                              <span className={cx("min-w-[22px] rounded-full px-1.5 text-center font-mono text-[11px] tabular-nums",
                                isActive ? "bg-side-ink text-side" : "bg-side-hover text-side-ink-2")}>{badge[it.id]}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="relative border-t border-side-line p-4">
          <dl className="grid gap-1.5 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-side-ink-2">Factory</dt><dd className="truncate font-semibold">{SAMPLE.factory}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-side-ink-2">Buyer</dt><dd className="truncate font-semibold">{SAMPLE.buyer}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-side-ink-2">Scenario today</dt><dd className="font-mono font-semibold">{SAMPLE.today}</dd></div>
          </dl>
          <div role="radiogroup" aria-label="Colour theme" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-side-hover p-1">
            {THEMES.map((t) => {
              const { label, icon: Icon } = THEME_META[t];
              const on = theme === t;
              return (
                <button key={t} id={`theme-${t}`} type="button" role="radio" aria-checked={on} onClick={() => onTheme(t)}
                  className={cx("flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold motion-safe:transition-colors",
                    on ? "bg-side-ink text-side shadow-sm" : "text-side-ink-2 hover:text-side-ink")}>
                  <Icon size={14} aria-hidden="true" />{label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
