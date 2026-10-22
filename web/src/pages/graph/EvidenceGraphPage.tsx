import { ArrowRight } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Edge } from "@/engine";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { STATUS, STATUS_ORDER, plural } from "@/lib/vocab";
import { Mono, StatusIcon, cx } from "@/components/ui";
import { PageHeader } from "@/components/ui/page";

interface PathDef { key: string; d: string; edge: Edge }

/** Documents on the left, requirements on the right, lines drawn from real element positions. */
export function EvidenceGraphPage() {
  const { state, result, dispatch } = useThreadLight();
  const sel = state.selection;
  const wrap = useRef<HTMLDivElement>(null);
  const nodes = useRef<Record<string, HTMLButtonElement | null>>({});
  const [paths, setPaths] = useState<PathDef[]>([]);
  const docs = new Map(state.data.documents.map((d) => [d.id, d] as const));

  const draw = useCallback(() => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const f = (n: number) => n.toFixed(1);
    setPaths(result.edges.flatMap((e) => {
      const a = nodes.current[`doc:${e.doc}`], b = nodes.current[`req:${e.req}`];
      if (!a || !b) return [];
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.right - box.left, y1 = ra.top + ra.height / 2 - box.top;
      const x2 = rb.left - box.left, y2 = rb.top + rb.height / 2 - box.top;
      const dx = Math.max(12, (x2 - x1) * 0.5);
      return [{ key: `${e.doc}-${e.req}`, edge: e, d: `M${f(x1)} ${f(y1)} C${f(x1 + dx)} ${f(y1)} ${f(x2 - dx)} ${f(y2)} ${f(x2)} ${f(y2)}` }];
    }));
  }, [result.edges]);

  // Redraw after layout, on resize (window or container) and once web fonts have loaded.
  useLayoutEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (wrap.current) ro.observe(wrap.current);
    window.addEventListener("resize", draw);
    document.fonts?.ready.then(draw);
    return () => { ro.disconnect(); window.removeEventListener("resize", draw); };
  }, [draw]);

  const related = sel ? result.edges.filter((e) => (sel.kind === "doc" ? e.doc === sel.id : e.req === sel.id)) : [];
  const litDocs = new Set(related.map((e) => e.doc)), litReqs = new Set(related.map((e) => e.req));
  const withEdges = new Set(result.edges.map((e) => e.req));

  let message: ReactNode = "Select a document or a requirement to trace its links.";
  let detail: string | null = null;
  if (sel?.kind === "doc" && docs.has(sel.id)) {
    const reqs = [...litReqs].sort();
    detail = `/documents/${sel.id}`;
    message = (
      <>
        <strong className="text-thread-strong">{sel.id}</strong> {docs.get(sel.id)!.title}: 1 document affects {plural(reqs.length, "requirement", "requirements")}
        {reqs.length ? ` (${reqs.join(", ")})` : ""}.{reqs.length > 1 && " If it lapses, all of them change status together."}
      </>
    );
  } else if (sel?.kind === "req") {
    const r = result.requirements.find((x) => x.id === sel.id)!;
    const ds = related.map((e) => e.doc);
    detail = `/requirements/${sel.id}`;
    message = (
      <>
        <strong className="text-thread-strong">{sel.id}</strong> {r.title} ({STATUS[r.status].en}):{" "}
        {ds.length ? `depends on ${plural(ds.length, "document", "documents")} (${ds.join(", ")}).` : "no document on file."}
      </>
    );
  }

  const nodeCls = (kind: "doc" | "req", id: string) => {
    const isSel = sel?.kind === kind && sel.id === id;
    const lit = kind === "doc" ? litDocs.has(id) : litReqs.has(id);
    return cx(
      "relative block min-h-[48px] w-full rounded-xl border bg-surface px-3 py-2.5 text-left text-[13px] leading-snug shadow-sm motion-safe:transition max-sm:px-2 max-sm:py-2 max-sm:text-xs",
      "hover:border-thread/60",
      isSel ? "border-thread ring-2 ring-thread" : lit ? "border-thread bg-thread-soft" : "border-line",
      sel && !lit && !isSel && "opacity-40",
    );
  };

  return (
    <>
      <PageHeader eyebrow="Evidence" title="Evidence graph"
        description={<>Each line links a document to a requirement it is used for. Lines take the colour <em>and</em> dash pattern of the requirement status.</>} />

      <div className="mb-4 flex min-h-[52px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-sm">
        <p id="graph-msg" aria-live="polite" className="min-w-0 flex-1">{message}</p>
        {detail && <Link to={detail} className="inline-flex items-center gap-1 font-semibold text-thread hover:underline">Open details <ArrowRight size={15} aria-hidden="true" /></Link>}
      </div>

      <div className="card">
        <div ref={wrap} className="relative grid grid-cols-[minmax(0,1fr)_minmax(56px,0.55fr)_minmax(0,1fr)] max-sm:grid-cols-[minmax(0,1fr)_26px_minmax(0,1fr)]">
          <svg id="graph-svg" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {paths.map(({ key, d, edge }) => {
              const on = !!sel && (sel.kind === "doc" ? edge.doc === sel.id : edge.req === sel.id);
              return <path key={key} d={d} data-doc={edge.doc} data-req={edge.req} className={cx("edge", `e-${edge.status}`, on && "lit", sel && !on && "dim")} />;
            })}
          </svg>

          <div className="relative z-10 grid content-start gap-2.5">
            <h2 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Documents</h2>
            {result.active_documents.map((id) => (
              <button key={id} type="button" ref={(el) => { nodes.current[`doc:${id}`] = el; }}
                data-testid="node-doc" data-id={id} data-lit={litDocs.has(id) || undefined}
                aria-pressed={sel?.kind === "doc" && sel.id === id} className={nodeCls("doc", id)}
                onClick={() => dispatch({ type: "select", selection: { kind: "doc", id } })}>
                <Mono className="font-semibold">{id}</Mono> {docs.get(id)!.title}
                <Mono className="block text-[11px] text-ink-3">{docs.get(id)!.ref}</Mono>
              </button>
            ))}
          </div>
          <div />
          <div className="relative z-10 grid content-start gap-2.5">
            <h2 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Requirements</h2>
            {result.requirements.map((r) => (
              <button key={r.id} type="button" ref={(el) => { nodes.current[`req:${r.id}`] = el; }}
                data-testid="node-req" data-id={r.id} data-lit={litReqs.has(r.id) || undefined}
                aria-pressed={sel?.kind === "req" && sel.id === r.id} className={cx(nodeCls("req", r.id), "border-l-4", STATUS[r.status].stripe)}
                onClick={() => dispatch({ type: "select", selection: { kind: "req", id: r.id } })}>
                <Mono className="font-semibold">{r.id}</Mono> {r.title}
                <span className="mt-1 flex flex-wrap items-center gap-1 text-[11.5px]">
                  <span className={cx("inline-flex items-center gap-1 font-semibold", STATUS[r.status].text)}>
                    <StatusIcon status={r.status} size={14} />{STATUS[r.status].en}
                  </span>
                  {!withEdges.has(r.id) && <span className="text-ink-3">&middot; no document on file</span>}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-[12.5px] text-ink-2">
          {STATUS_ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <svg width="30" height="8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4" className={cx("edge", `e-${k}`)} /></svg>
              {STATUS[k].en}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
