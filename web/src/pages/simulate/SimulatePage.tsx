import { useMemo } from "react";
import { addDays, analyze, dayNumber, setDocumentField, type Result } from "@/engine";
import { D1_ORIGINAL, SAMPLE, SIM_MAX, SIM_MIN } from "@/data/sample";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { Button, Delta, Mono, StatusPill, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";

const offset = (iso: string) => dayNumber(iso) - dayNumber(SIM_MIN);
const SPAN = offset(SIM_MAX);
const PRESETS: [string, string][] = [
  ["Already expired", SIM_MIN], ["Day before audit", addDays(SAMPLE.audit_date, -1)],
  ["Audit day", SAMPLE.audit_date], ["Extend to Dec 31", "2026-12-31"], ["Original", D1_ORIGINAL],
];

function Metric({ label, before, after, lowerIsBetter, unit = "", testId }: {
  label: string; before: number; after: number; lowerIsBetter: boolean; unit?: string; testId?: string;
}) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-[12.5px] font-medium text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span data-testid={testId} className="text-3xl font-extrabold tabular-nums tracking-tight">{after}{unit}</span>
        {after === before ? <span className="ml-1 text-xs text-ink-3">no change</span> : <Delta now={after} base={before} lowerIsBetter={lowerIsBetter} />}
      </div>
      <div className="mt-1 text-xs text-ink-3">Baseline {before}{unit}</div>
    </div>
  );
}

/** What-if on the baseline file set: move D1's expiry and re-run the same rules. */
export function SimulatePage() {
  const { state, baseline, dispatch } = useThreadLight();
  const date = state.simDate;
  const sim = useMemo(() => analyze(setDocumentField(SAMPLE, "D1", "valid_until", date)), [date]);
  const affected = baseline.edges.filter((e) => e.doc === "D1").map((e) => e.req);
  const b = baseline.scores, s = sim.scores;
  const set = (d: string) => dispatch({ type: "simDate", date: d });
  const statusIn = (r: Result, id: string) => r.requirements.find((x) => x.id === id)!.status;

  const marker = (iso: string, label: string, cls: string) => (
    <span className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${(offset(iso) / SPAN) * 100}%` }}>
      <span className={cx("h-3 w-0.5 rounded", cls)} />
      <span className="mt-0.5 whitespace-nowrap font-mono text-[10.5px] text-ink-3">{label}</span>
    </span>
  );

  return (
    <>
      <PageHeader eyebrow="Analysis" title="Simulate"
        description={<>What-if on the baseline file set: change when the fire safety certificate (<Mono>D1</Mono>) expires and the same rules re-run instantly. Nothing is saved.</>} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Fire certificate valid until" description={<>Affected requirements: <strong className="text-ink">{affected.join(", ")}</strong> (linked to <Mono>D1</Mono> in the evidence graph)</>}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="sim-date" className="text-sm font-medium text-ink-2">Date</label>
            <input id="sim-date" type="date" min={SIM_MIN} max={SIM_MAX} value={date}
              onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && set(e.target.value)}
              className="min-h-[42px] rounded-xl border border-line bg-surface px-3 font-mono text-sm" />
          </div>
          <div className="mt-4">
            <input id="sim-range" type="range" className="h-8 w-full cursor-pointer" min={0} max={SPAN} step={1} value={offset(date)}
              aria-label="Fire certificate valid until, slider" aria-valuetext={date}
              onChange={(e) => set(addDays(SIM_MIN, Number(e.target.value)))} />
            <div className="relative h-8">{marker(SAMPLE.today, "today", "bg-ink-3")}{marker(SAMPLE.audit_date, "audit", "bg-gap")}</div>
            <div className="flex justify-between font-mono text-[11px] text-ink-3"><span>{SIM_MIN}</span><span>{SIM_MAX}</span></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map(([label, iso], i) => (
              <Button key={label} id={`preset-${i}`} size="sm" onClick={() => set(iso)} className={cx(iso === date && "border-thread bg-thread-soft")}>
                {label}
              </Button>
            ))}
          </div>
        </Panel>

        <Panel id="sim-out" title="Result" description={<>With D1 valid until <Mono>{date}</Mono></>}>
          <div aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Coverage" before={b.coverage} after={s.coverage} lowerIsBetter={false} unit="%" testId="sim-coverage" />
              <Metric label="Risk index" before={b.risk_index} after={s.risk_index} lowerIsBetter />
              <Metric label="Open findings" before={b.open_findings} after={s.open_findings} lowerIsBetter />
            </div>
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {affected.map((id) => (
                <li key={id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Mono className="w-8 font-semibold">{id}</Mono>
                  <StatusPill status={statusIn(baseline, id)} />
                  <span className="text-ink-3" aria-label="becomes">&rarr;</span>
                  <StatusPill status={statusIn(sim, id)} />
                </li>
              ))}
            </ul>
            <p id="sim-reason" className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13px]">
              <strong>R1 reason:</strong> {sim.requirements.find((x) => x.id === "R1")!.reasons[0]}
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
