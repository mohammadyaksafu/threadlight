import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Alert } from "@/engine";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { ALERT_LABEL } from "@/lib/vocab";
import { Card, DefinitionList, Mono, cx } from "@/components/ui";
import { PageHeader } from "@/components/ui/page";
import { FindingsTabs } from "./FindingsPage";

const ids = (list: string[], base: string) =>
  list.map((id, i) => <span key={id}>{i ? ", " : ""}<Link to={`${base}/${id}`} className="font-mono text-thread hover:underline">{id}</Link></span>);

export function AlertCard({ alert }: { alert: Alert }) {
  const rows: [string, ReactNode][] = [];
  if (alert.subject.length) rows.push(["Needs correction", ids(alert.subject, "/documents")]);
  if (alert.related.length) rows.push(["Compare with", ids(alert.related, "/documents")]);
  if (alert.requirements.length) rows.push(["Requirements", ids(alert.requirements, "/requirements")]);
  return (
    <Card data-testid="alert-card" className="border-l-4 border-l-conf">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold"><Mono>{alert.id}</Mono> <span className="text-ink-3">&middot;</span> {ALERT_LABEL[alert.type].en}</h2>
        <span className={cx("rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider",
          alert.severity === "high" ? "bg-gap-bg text-gap" : "bg-insuf-bg text-insuf")}>{alert.severity} severity</span>
      </div>
      <p className="mt-2">{alert.message}</p>
      <DefinitionList className="mt-3" items={rows} />
      <div data-testid="alert-verify" className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px]">
        <strong>Recommended check:</strong> {alert.verify}
      </div>
    </Card>
  );
}

export function AlertsPage() {
  const { result } = useThreadLight();
  return (
    <>
      <PageHeader eyebrow="Analysis" title="Findings"
        description="Evidence-integrity alerts flag records that disagree with each other. They are prompts to check, not accusations of wrongdoing." />
      <FindingsTabs />
      <div className="grid gap-4 lg:grid-cols-2">
        {result.alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
      </div>
    </>
  );
}
