import { ArrowRight, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { Mono, StatusPill } from "@/components/ui";
import { LinkRow, List, PageHeader } from "@/components/ui/page";

export function ActionsPage() {
  const { result, state } = useThreadLight();
  return (
    <>
      <PageHeader eyebrow="Resolve" title="Actions"
        description="Ranked by criticality × status penalty. Owners come from each requirement; due dates are 14 days before the audit for likely gaps and 7 days before for everything else." />

      <Link to="/actions/workflow" id="open-workflow"
        className="mb-6 flex items-center gap-4 rounded-2xl border border-thread/30 bg-thread-soft p-5 hover:border-thread motion-safe:transition-colors">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-thread text-thread-on"><Workflow size={22} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Finding R1 workflow</span>
          <span className="block text-sm text-ink-2">Assign, upload the renewal, approve, close. Current step: <strong className="capitalize text-ink">{state.finding.state}</strong></span>
        </span>
        <ArrowRight size={20} className="shrink-0 text-thread" aria-hidden="true" />
      </Link>

      {result.plan.length === 0 ? <p className="card text-ink-2">No open tasks.</p> : (
        <List label="Ranked tasks">
          {result.plan.map((t, i) => (
            <LinkRow key={t.id} to={`/requirements/${t.requirement}`} testId="task">
              <div className="flex items-start gap-4" data-task-id={t.id}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-sm font-semibold tabular-nums text-thread-strong">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{t.action}</span>
                    <StatusPill status={t.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-2">
                    <span><Mono>{t.id}</Mono></span><span>{t.owner}</span><span>Due <Mono>{t.due}</Mono></span>
                  </div>
                  <p className="mt-1.5 text-[13px]"><span className="text-ink-2">Proof needed:</span> {t.proof}</p>
                </div>
              </div>
            </LinkRow>
          ))}
        </List>
      )}
    </>
  );
}
