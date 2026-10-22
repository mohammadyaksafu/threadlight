import { useSearchParams } from "react-router-dom";
import type { RequirementResult, Result, Status } from "@/engine";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { STATUS, STATUS_ORDER } from "@/lib/vocab";
import { Mono, StatusIcon, StatusPill, cx } from "@/components/ui";
import { LinkRow, List, PageHeader, SubNav } from "@/components/ui/page";

/** Open items first in plan order, supported items last in clause order. */
export function orderedRequirements(r: Result): RequirementResult[] {
  const rank = new Map(r.plan.map((t, i) => [t.requirement, i] as const));
  return r.requirements.slice().sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || (a.id < b.id ? -1 : 1));
}

export function FindingsTabs() {
  const { result } = useThreadLight();
  return (
    <SubNav label="Findings views" items={[
      { to: "/findings", label: "Requirements", count: result.requirements.length, end: true },
      { to: "/findings/alerts", label: "Integrity alerts", count: result.alerts.length },
    ]} />
  );
}

export function FindingsPage() {
  const { result } = useThreadLight();
  const [params, setParams] = useSearchParams();
  const raw = params.get("status");
  const filter = (raw && raw in STATUS ? raw : "all") as Status | "all";
  const counts = result.scores.status_counts;
  const list = orderedRequirements(result).filter((r) => filter === "all" || r.status === filter);

  const chip = (id: Status | "all", label: string, n: number) => {
    const on = filter === id;
    return (
      <button key={id} type="button" id={`filter-${id}`} aria-pressed={on}
        onClick={() => setParams(id === "all" ? {} : { status: id }, { replace: true })}
        className={cx("inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium motion-safe:transition",
          on ? "border-thread bg-thread-soft text-thread-strong" : "border-line bg-surface text-ink-2 hover:border-thread/60")}>
        {id !== "all" && <StatusIcon status={id} size={15} />}
        {label}<span className="font-mono text-xs tabular-nums opacity-75">{n}</span>
      </button>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Analysis" title="Findings"
        description="Each status comes from fixed rules applied to the extracted fields. Select a requirement for its reasons, cited sources and the limit of the conclusion." />
      <FindingsTabs />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {chip("all", "All", result.requirements.length)}
        {STATUS_ORDER.map((k) => chip(k, STATUS[k].en, counts[k]))}
      </div>
      {list.length === 0 ? <p className="card text-ink-2">No requirements with this status.</p> : (
        <List label="Findings">
          {list.map((r) => (
            <LinkRow key={r.id} id={`finding-${r.id}`} to={`/requirements/${r.id}`}>
              <div className="flex items-start gap-3">
                <span className={cx("mt-1 h-10 w-1 shrink-0 rounded-full", STATUS[r.status].dot)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><Mono className="font-semibold text-ink-2">{r.id}</Mono> <span className="font-semibold">{r.title}</span></span>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-2">{r.reasons[0]}</p>
                </div>
              </div>
            </LinkRow>
          ))}
        </List>
      )}
    </>
  );
}
