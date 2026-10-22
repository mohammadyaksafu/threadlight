import { typeLabel } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { Mono, StatusPill, cx } from "@/components/ui";
import { LinkRow, List, PageHeader } from "@/components/ui/page";

export function Criticality({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Criticality ${value} of 5`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => <span key={i} className={cx("h-1.5 w-1.5 rounded-full", i < value ? "bg-thread" : "bg-surface-3")} />)}
      </span>
      <span className="sr-only">Criticality {value} of 5</span>
    </span>
  );
}

export function RequirementsPage() {
  const { result } = useThreadLight();
  const status = new Map(result.requirements.map((r) => [r.id, r.status] as const));

  return (
    <>
      <PageHeader eyebrow="Evidence" title="Requirements"
        description={<>{SAMPLE.framework}. Clause text and the evidence each clause needs are <strong className="text-ink">pre-extracted sample results</strong>; in the planned system a language model proposes them and a person confirms.</>} />
      <List label="Requirements">
        {SAMPLE.requirements.map((r) => (
          <LinkRow key={r.id} to={`/requirements/${r.id}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Mono className="font-semibold text-ink-2">{r.id}</Mono>
                  <span className="font-semibold">{r.title}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-2">
                  <span>Clause {r.clause}</span><Criticality value={r.criticality} /><span>{r.department}</span>
                  <span className="max-sm:hidden">Needs: {r.needs.map((t) => typeLabel(SAMPLE, t)).join(", ")}</span>
                </div>
              </div>
              <StatusPill status={status.get(r.id)!} />
            </div>
          </LinkRow>
        ))}
      </List>
    </>
  );
}
