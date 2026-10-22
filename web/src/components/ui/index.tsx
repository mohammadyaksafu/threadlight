// Design-system primitives. Every feature view is built from these, so visual changes happen here.

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import type { Status } from "@/engine";
import { STATUS, type Lang } from "@/lib/vocab";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- Button

type Variant = "primary" | "secondary" | "ghost" | "dashed";
const VARIANT: Record<Variant, string> = {
  primary: "border-thread bg-thread text-thread-on shadow-sm hover:bg-thread-strong hover:border-thread-strong",
  secondary: "border-line bg-surface text-ink hover:border-thread/60 hover:bg-surface-2",
  ghost: "border-transparent bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  dashed: "border-dashed border-line bg-transparent text-ink-2 hover:border-thread/60 hover:text-ink",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex items-center gap-2 rounded-xl border font-semibold motion-safe:transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
        size === "sm" ? "min-h-[36px] px-3 text-[13px]" : "min-h-[42px] px-4 text-sm",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Card

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card", className)} {...rest} />;
}

// ---------------------------------------------------------------- Mono, Chip, Kbd

export const Mono = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cx("font-mono", className)}>{children}</span>
);

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-surface-2 px-2 py-px text-xs font-medium text-ink-2", className)}>
      {children}
    </span>
  );
}

export const RulesChip = () => <Chip className="border-transparent bg-thread-soft text-thread-strong">rules</Chip>;
export const SampleChip = () => <Chip className="border-dashed bg-transparent">sample extraction</Chip>;

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-md border border-line bg-surface px-1.5 font-mono text-[10.5px] text-ink-3">{children}</kbd>
);

// ---------------------------------------------------------------- Status

const GLYPH: Record<Status, ReactNode> = {
  supported: <path d="M4 8.5l2.5 2.5L12 5.5" />,
  likely_gap: <path d="M8 4.5v4.2M8 11.5v.01" />,
  insufficient: <path d="M6.1 6.2a1.9 1.9 0 1 1 2.7 1.7c-.5.3-.8.7-.8 1.2v.3M8 11.6v.01" />,
  conflicting: <path d="M4.5 6.5h7M4.5 9.5h7M10 4l-4 8" />,
  pending_review: <path d="M8 4.8V8.2l2.2 1.4" />,
};

/** Status shown with colour AND a distinct glyph, never colour alone. */
export function StatusIcon({ status, size = 18 }: { status: Status; size?: number }) {
  return (
    <span className={cx("inline-grid shrink-0 place-items-center rounded-full text-surface", STATUS[status].dot)} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 16 16" width={size * 0.66} height={size * 0.66} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {GLYPH[status]}
      </svg>
    </span>
  );
}

export function StatusPill({ status, lang = "en", label }: { status: Status; lang?: Lang; label?: string }) {
  const s = STATUS[status];
  return (
    <span data-testid="status-pill" className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-0.5 pl-1 pr-2.5 text-[13px] font-semibold", s.pill)}>
      <StatusIcon status={status} />
      <span lang={lang === "bn" ? "bn" : undefined}>{label ?? (lang === "bn" ? s.bn : s.en)}</span>
    </span>
  );
}

// ---------------------------------------------------------------- Delta, Meter, DefinitionList

export function Delta({ now, base, lowerIsBetter = false, unit = "" }: { now: number; base: number; lowerIsBetter?: boolean; unit?: string }) {
  const d = now - base;
  if (!d) return null;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <span className={cx("ml-1.5 inline-flex items-center rounded-md px-1.5 align-middle text-xs font-semibold tabular-nums", good ? "bg-ok-bg text-ok" : "bg-gap-bg text-gap")}>
      {d > 0 ? "+" : "−"}{Math.abs(d)}{unit}
    </span>
  );
}

export function Meter({ value, className, label }: { value: number; className: string; label: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={label}>
      <div className={cx("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700", className)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function DefinitionList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="font-medium text-ink-2">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
