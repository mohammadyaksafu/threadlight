import { ArrowRight, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { typeLabel } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { ALERT_LABEL, LIMITS, STATUS, pct } from "@/lib/vocab";
import { Chip, DefinitionList, Mono, StatusPill, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";
import { Criticality } from "./RequirementsPage";

/** One requirement in full: why it has this status, the evidence behind it, and what to do next. */
export function RequirementDetailPage() {
  const { id = "" } = useParams();
  const { state, result } = useThreadLight();
  const req = result.requirements.find((r) => r.id === id);
  if (!req) return <Navigate to="/requirements" replace />;

  const spec = SAMPLE.requirements.find((r) => r.id === id)!;
  const docs = new Map(state.data.documents.map((d) => [d.id, d] as const));
  const task = result.plan.find((t) => t.requirement === id);
  const alerts = result.alerts.filter((a) => req.alerts.includes(a.id));
  const ids = SAMPLE.requirements.map((r) => r.id), i = ids.indexOf(id);
  const prev = ids[i - 1], next = ids[i + 1];

  return (
    <>
      <PageHeader back={{ to: "/findings", label: "Findings" }} eyebrow={`Requirement ${req.id} · Clause ${req.clause}`}
        title={req.title}
        description={<span className="flex flex-wrap items-center gap-x-4 gap-y-2"><StatusPill status={req.status} /><Criticality value={req.criticality} /><span>Owner: {req.department}</span></span>} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Panel title="Why this status" className={cx("border-l-4", STATUS[req.status].stripe)}>
            <ul className="grid gap-2">
              {req.reasons.map((x) => (
                <li key={x} className="flex gap-2.5"><span className={cx("mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full", STATUS[req.status].dot)} aria-hidden="true" />{x}</li>
              ))}
            </ul>
            <p className="mt-4 flex gap-2 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span><strong className="text-ink">Limit of this conclusion:</strong> {LIMITS[req.status]}</span>
            </p>
          </Panel>

          <Panel title="Evidence on file" description="Cited source for every document the rules used.">
            {req.supporting.length === 0 ? <p className="text-sm text-ink-2">No matching document in this file set.</p> : (
              <ul className="grid gap-2">
                {req.checks.filter((c) => c.doc).map((c) => {
                  const d = docs.get(c.doc!)!;
                  return (
                    <li key={c.doc}>
                      <Link to={`/documents/${d.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-thread/50 hover:bg-surface-2/60">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold"><Mono>{d.id}</Mono> {d.title}</div>
                          <div className="mt-0.5 text-xs text-ink-2">
                            <Mono>{d.source.file}</Mono>, page {d.source.page} &middot; extraction confidence {pct(d.confidence)}% (sample)
                            {!d.verified && <span className="font-semibold text-pend"> &middot; not yet approved</span>}
                          </div>
                        </div>
                        <span className={cx("text-xs font-semibold", c.ok ? "text-ok" : "text-gap")}>{c.ok ? "Passes" : "Fails"}</span>
                        <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Clause text" description="Synthetic sample, pre-extracted.">
            <blockquote className="rounded-r-xl border-l-[3px] border-thread/50 bg-surface-2 px-4 py-3 text-ink-2">{spec.text}</blockquote>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="text-ink-2">Evidence needed:</span>
              {spec.needs.map((t) => <Chip key={t}>{typeLabel(SAMPLE, t)}{spec.max_age_days?.[t] ? ` (max ${spec.max_age_days[t]} days old)` : ""}</Chip>)}
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 lg:sticky lg:top-32">
          <Panel title="Next action">
            {task ? (
              <>
                <p className="font-semibold">{task.action}</p>
                <DefinitionList className="mt-3" items={[["Owner", task.owner], ["Due", <Mono key="d">{task.due}</Mono>], ["Proof needed", task.proof]]} />
                {req.id === "R1" && (
                  <Link to="/actions/workflow" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-thread hover:underline">
                    Open the R1 workflow <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </>
            ) : <p className="text-sm text-ink-2">None. This requirement is supported by approved evidence.</p>}
          </Panel>

          {alerts.length > 0 && (
            <Panel title="Integrity alerts">
              <ul className="grid gap-3">
                {alerts.map((a) => (
                  <li key={a.id} className="text-sm">
                    <div className="font-semibold"><Mono>{a.id}</Mono> &middot; {ALERT_LABEL[a.type].en}</div>
                    <p className="mt-1 text-ink-2">{a.message}</p>
                    <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2"><strong>Recommended check:</strong> {a.verify}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <nav aria-label="Other requirements" className="mt-8 flex justify-between gap-3 border-t border-line pt-5 text-sm font-semibold">
        {prev ? <Link to={`/requirements/${prev}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-thread"><ChevronLeft size={16} aria-hidden="true" />{prev}</Link> : <span />}
        {next ? <Link to={`/requirements/${next}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-thread">{next}<ChevronRight size={16} aria-hidden="true" /></Link> : <span />}
      </nav>
    </>
  );
}
