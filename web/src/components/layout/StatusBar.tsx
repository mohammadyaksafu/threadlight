import type { ReactNode } from "react";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { Delta, cx } from "@/components/ui";

function Stat({ label, short, testId, value, unit, extra, title, dot }: {
  label: string; short?: string; testId: string; value: number; unit?: string; extra?: ReactNode; title?: string; dot?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 first:pl-3.5 last:pr-3.5 max-sm:flex-col-reverse max-sm:items-center max-sm:gap-0 max-sm:px-1 max-sm:first:pl-1 max-sm:last:pr-1" title={title}>
      {dot && <span className={cx("h-2 w-2 shrink-0 rounded-full max-sm:hidden", dot)} aria-hidden="true" />}
      <span className="text-[12px] text-ink-2 max-sm:text-[11px]">{short ? <><span className="max-xl:hidden">{label}</span><span className="xl:hidden">{short}</span></> : label}</span>
      <span className="whitespace-nowrap">
        <span data-testid={testId} className="text-[15px] font-bold tabular-nums">{value}</span>
        {unit && <span className="ml-px text-[12px] text-ink-2">{unit}</span>}
      </span>
      <span className="max-md:hidden">{extra}</span>
    </div>
  );
}

/** Live readiness figures on every page, as one segmented strip; deltas compare with the baseline. */
export function StatusBar() {
  const { result, baseline } = useThreadLight();
  const s = result.scores, b = baseline.scores;
  return (
    <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] max-sm:order-last max-sm:basis-full max-sm:pb-2.5">
      <div aria-label="Audit readiness" aria-live="polite" role="group"
        className="ml-auto flex w-max items-center divide-x divide-line rounded-xl border border-line bg-surface py-2 shadow-sm max-sm:grid max-sm:w-full max-sm:grid-cols-4">
        <Stat label="Audit in" short="Audit" testId="kpi-days" value={result.days_to_audit} unit=" days" title={`Audit date ${result.audit_date}`} dot="bg-thread" />
        <Stat label="Coverage" short="Cover" testId="kpi-coverage" value={s.coverage} unit="%" dot="bg-ok" extra={<Delta now={s.coverage} base={b.coverage} unit=" pts" />} />
        <Stat label="Decision-support risk index" short="Risk" testId="kpi-risk" value={s.risk_index} unit="/100" dot="bg-gap"
          title="Decision-support index, not an audit score or probability" extra={<Delta now={s.risk_index} base={b.risk_index} lowerIsBetter />} />
        <Stat label="Open findings" short="Open" testId="kpi-open" value={s.open_findings} dot="bg-insuf"
          extra={<Delta now={s.open_findings} base={b.open_findings} lowerIsBetter />} />
      </div>
    </div>
  );
}
