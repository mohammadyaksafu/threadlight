import { ArrowRight, CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { SAMPLE } from "@/data/sample";
import { NAV_ITEMS } from "@/nav";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { ALERT_LABEL, STATUS, STATUS_ORDER } from "@/lib/vocab";
import { Meter, Mono, StatusIcon, StatusPill, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";

function Ring({ value, size = 148 }: { value: number; size?: number }) {
  const stroke = 13, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-hero-ink/15" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)} className="stroke-[rgb(110_222_160)] motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[34px] font-extrabold leading-none tabular-nums tracking-tight">{value}<span className="text-lg font-semibold text-hero-ink-2">%</span></div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-hero-ink-2">coverage</div>
        </div>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { result, baseline, state } = useThreadLight();
  const s = result.scores, total = result.requirements.length;
  const top = result.plan.slice(0, 3);
  const reqTitle = (id: string) => result.requirements.find((r) => r.id === id)!.title;

  return (
    <>
      <PageHeader eyebrow="Overview" title="Audit readiness"
        description={<>{SAMPLE.factory} against {SAMPLE.framework}. A summary of where the evidence stands; open any section for the detail.</>} />

      {/* Readiness hero: deep indigo band with the thread motif */}
      <section aria-label="Readiness summary" className="relative overflow-hidden rounded-3xl bg-hero p-6 text-hero-ink shadow-lift sm:p-8">
        <svg className="pointer-events-none absolute -right-16 -top-8 h-72 w-[560px] text-hero-ink/[0.07]" viewBox="0 0 560 280" fill="none" aria-hidden="true">
          <path d="M0 220 C 130 30, 250 300, 380 120 S 520 50, 560 90" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
        </svg>
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-hero-ink/10 px-3 py-1 text-xs font-semibold text-hero-ink-2">
              <CalendarClock size={14} aria-hidden="true" />Audit on <Mono>{result.audit_date}</Mono>
            </p>
            <h2 className="mt-4 text-[34px] font-extrabold leading-[1.1] tracking-tight max-sm:text-[28px]">
              {result.days_to_audit} days to audit.<br />
              <span className="text-hero-ink-2">{s.open_findings} of {total} requirements still need evidence.</span>
            </h2>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link to="/actions/workflow" className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-hero-ink px-4 text-sm font-semibold text-hero shadow-sm hover:bg-white">
                Resolve the fire certificate <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/findings" className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-hero-ink/25 px-4 text-sm font-semibold text-hero-ink hover:bg-hero-ink/10">
                Review findings
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <Ring value={s.coverage} />
            <dl className="grid gap-5">
              <div>
                <dt className="text-[12.5px] font-medium text-hero-ink-2">Decision-support risk index</dt>
                <dd className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold tabular-nums tracking-tight">{s.risk_index}</span><span className="text-sm text-hero-ink-2">/100</span>
                  <span className="ml-1 rounded-md bg-hero-ink/10 px-1.5 text-xs font-semibold tabular-nums">
                    {s.risk_index === baseline.scores.risk_index ? "baseline" : `${s.risk_index > baseline.scores.risk_index ? "+" : "−"}${Math.abs(s.risk_index - baseline.scores.risk_index)}`}
                  </span>
                </dd>
                <dd className="mt-0.5 text-[11.5px] text-hero-ink-2">Not an audit score or probability</dd>
              </div>
              <div>
                <dt className="text-[12.5px] font-medium text-hero-ink-2">Requirements by status</dt>
                <dd className="mt-2 flex h-2 w-44 gap-0.5 overflow-hidden rounded-full" role="img"
                  aria-label={STATUS_ORDER.map((k) => `${s.status_counts[k]} ${STATUS[k].en}`).join(", ")}>
                  {STATUS_ORDER.filter((k) => s.status_counts[k]).map((k) => <span key={k} className={STATUS[k].dot} style={{ flex: `${s.status_counts[k]} 1 0` }} />)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Top priorities" description="Ranked by criticality and status."
          actions={<Link to="/actions" className="inline-flex items-center gap-1 text-sm font-semibold text-thread hover:underline">All {result.plan.length} tasks <ArrowRight size={15} aria-hidden="true" /></Link>}>
          {top.length === 0 ? <p className="text-ink-2">No open tasks.</p> : (
            <ol className="grid gap-2">
              {top.map((t, i) => (
                <li key={t.id}>
                  <Link to={`/requirements/${t.requirement}`} className="flex items-start gap-3 rounded-xl border border-line p-3 hover:border-thread/50 hover:bg-surface-2/60">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-thread-soft font-mono text-[13px] font-semibold text-thread-strong">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{t.action}</span>
                      <span className="mt-0.5 block text-xs text-ink-2">{t.requirement} &middot; {t.owner} &middot; due <Mono>{t.due}</Mono></span>
                    </span>
                    <StatusIcon status={t.status} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Requirements by status" description={`${total} clauses from the buyer framework.`}
          actions={<Link to="/findings" className="inline-flex items-center gap-1 text-sm font-semibold text-thread hover:underline">Findings <ArrowRight size={15} aria-hidden="true" /></Link>}>
          <ul className="grid gap-1">
            {STATUS_ORDER.map((k) => (
              <li key={k}>
                <Link to={`/findings?status=${k}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                  <StatusIcon status={k} />
                  <span className="flex-1 text-sm">{STATUS[k].en}</span>
                  <span className="w-24"><Meter value={(s.status_counts[k] / total) * 100} className={STATUS[k].dot} label={`${s.status_counts[k]} of ${total}`} /></span>
                  <span className="w-6 text-right font-mono text-sm tabular-nums">{s.status_counts[k]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={`Evidence-integrity alerts (${result.alerts.length})`} description="Records that disagree. Prompts to check, not accusations."
          actions={<Link to="/findings/alerts" className="inline-flex items-center gap-1 text-sm font-semibold text-thread hover:underline">Review <ArrowRight size={15} aria-hidden="true" /></Link>}>
          <ul className="grid gap-2">
            {result.alerts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                <Mono className="mt-px font-semibold">{a.id}</Mono>
                <span className="min-w-0 flex-1"><span className="font-semibold">{ALERT_LABEL[a.type].en}</span>
                  <span className="text-ink-2"> &middot; {[...a.subject, ...a.requirements].join(", ") || "n/a"}</span></span>
                <span className={cx("rounded-md px-1.5 font-mono text-[10.5px] font-semibold uppercase", a.severity === "high" ? "bg-gap-bg text-gap" : "bg-insuf-bg text-insuf")}>{a.severity}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Finding R1 workflow" description="The fire certificate: from detection to a human-approved close."
          actions={<Link to="/actions/workflow" className="inline-flex items-center gap-1 text-sm font-semibold text-thread hover:underline">Open <ArrowRight size={15} aria-hidden="true" /></Link>}>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={result.requirements.find((r) => r.id === "R1")!.status} />
            <span className="text-sm text-ink-2">Current step: <strong className="capitalize text-ink">{state.finding.state}</strong></span>
          </div>
          <p className="mt-3 text-sm text-ink-2">{reqTitle("R1")} expires before the audit and also affects R5. Only a named person can approve and close it.</p>
        </Panel>
      </div>

      <Panel className="mt-6" title="Guided walkthrough" description="The seven sections in demo order. Keys 1-7 jump straight to each.">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_ITEMS.filter((i) => i.shortcut).map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.id}>
                <Link to={it.to} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm font-medium hover:border-thread/50 hover:bg-surface-2/60">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-surface-2 font-mono text-[11px] text-ink-3">{it.shortcut}</span>
                  <Icon size={16} className="text-thread" aria-hidden="true" />{it.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </Panel>
    </>
  );
}
