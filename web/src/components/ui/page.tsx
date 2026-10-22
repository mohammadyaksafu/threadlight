// Page-level building blocks: header with breadcrumbs, sub-navigation, list rows and panels.

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "@/nav";
import { cx } from "./index";

/** Page title block. The icon tile is taken from the sidebar entry for the current section. */
export function PageHeader({ eyebrow, title, description, actions, back }: {
  eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string };
}) {
  const { pathname } = useLocation();
  const section = NAV_ITEMS.find((n) => (n.to === "/" ? pathname === "/" : pathname === n.to || pathname.startsWith(`${n.to}/`)));
  const Icon = section?.icon;
  return (
    <header className="mb-8">
      {back && (
        <Link to={back.to} className="mb-4 inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-2 pr-3 text-[13px] font-medium text-ink-2 shadow-sm hover:border-thread/50 hover:text-thread">
          <ChevronLeft size={15} aria-hidden="true" />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 max-w-3xl gap-4">
          {Icon && (
            <span className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-thread text-thread-on shadow-card max-sm:hidden" aria-hidden="true">
              <Icon size={22} />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight max-sm:text-[22px]">{title}</h1>
            {description && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Segmented sub-navigation between sibling routes (e.g. Findings: Requirements | Alerts). */
export function SubNav({ items, label }: { items: { to: string; label: string; count?: number; end?: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 inline-flex rounded-xl border border-line bg-surface p-1 shadow-sm">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end}
          className={({ isActive }) => cx("inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3.5 text-sm font-semibold motion-safe:transition-colors",
            isActive ? "bg-thread text-thread-on shadow-sm" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
          {it.label}
          {it.count !== undefined && <span className="rounded-full bg-surface-2/30 px-1.5 font-mono text-[11px] tabular-nums">{it.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

/** A titled card section. */
export function Panel({ title, description, actions, children, className, id }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cx("card", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Clickable list row that navigates to a detail page. */
export function LinkRow({ to, children, className, id, testId }: { to: string; children: ReactNode; className?: string; id?: string; testId?: string }) {
  return (
    <li id={id} data-testid={testId}>
      <Link to={to} className={cx(
        "group flex items-center gap-3 px-4 py-3.5 motion-safe:transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2 sm:px-5",
        className)}>
        <div className="min-w-0 flex-1">{children}</div>
        <ChevronRight size={18} className="shrink-0 text-ink-3 group-hover:text-thread" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {children}
    </ul>
  );
}
