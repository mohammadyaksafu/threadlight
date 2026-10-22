import { typeLabel, type Doc } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { EXPIRY, pct } from "@/lib/vocab";
import { Chip, Mono, cx } from "@/components/ui";
import { LinkRow, List, PageHeader } from "@/components/ui/page";
import { AgentPipeline } from "./AgentPipeline";

export function DocBadge({ doc, active }: { doc: Doc; active: boolean }) {
  if (!active) return <Chip>Superseded</Chip>;
  if (!doc.verified) return <Chip className="border-pend/40 bg-pend-bg text-pend">Unverified upload</Chip>;
  return null;
}

export function Confidence({ value }: { value: number }) {
  const p = pct(value);
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <span className={cx("block h-full rounded-full", p >= 90 ? "bg-thread" : "bg-insuf")} style={{ width: `${p}%` }} />
      </span>
      {p}%
    </span>
  );
}

export function DocumentsPage() {
  const { state, result } = useThreadLight();
  const states = new Map(result.documents.map((d) => [d.id, d] as const));

  return (
    <>
      <PageHeader eyebrow="Evidence" title="Documents"
        description={<>Files uploaded by the factory. Type, reference, dates and entity are <strong className="text-ink">pre-extracted sample results</strong>; in the planned system OCR and a language model would read them. Select a file for details.</>} />

      <List label="Documents">
        <li className="hidden grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_86px_18px] gap-4 bg-surface-2/60 px-5 py-2.5 text-xs font-semibold text-ink-2 md:grid">
          <span>ID</span><span>Document</span><span>Valid until</span><span>Reference</span><span>Confidence</span><span />
        </li>
        {state.data.documents.map((d) => {
          const st = states.get(d.id)!, exp = EXPIRY[st.expiry_state];
          return (
            <LinkRow key={d.id} to={`/documents/${d.id}`} testId="doc-row" className={cx(!st.active && "opacity-60")}>
              <div className="grid items-center gap-x-4 gap-y-1 md:grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_86px]">
                <Mono className="font-semibold text-ink-2">{d.id}</Mono>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx("font-semibold", !st.active && "line-through")}>{d.title}</span><DocBadge doc={d} active={st.active} />
                  </div>
                  <div className="truncate text-xs text-ink-2">{typeLabel(SAMPLE, d.type)} &middot; {d.source.file} p{d.source.page}</div>
                </div>
                <div className="text-sm">
                  {d.valid_until ? <Mono>{d.valid_until}</Mono> : <span className="text-ink-3">No expiry</span>}
                  <span className={cx("ml-2 text-xs font-semibold md:ml-0 md:block", exp.cls)}>{exp.label}</span>
                </div>
                <Mono className="text-sm text-ink-2 max-md:hidden">{d.ref}</Mono>
                <span className="text-sm max-md:hidden"><Confidence value={d.confidence} /></span>
              </div>
            </LinkRow>
          );
        })}
      </List>

      <div className="mt-6"><AgentPipeline /></div>
    </>
  );
}
