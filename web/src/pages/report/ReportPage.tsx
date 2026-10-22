import { Printer } from "lucide-react";
import type { ReactNode } from "react";
import type { RequirementResult } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { ALERT_LABEL, BN, pct, type Lang } from "@/lib/vocab";
import { Button, Mono, StatusPill, cx } from "@/components/ui";
import { PageHeader } from "@/components/ui/page";
import { orderedRequirements } from "@/pages/findings/FindingsPage";
import { alertBn, reasonsBn } from "./bangla";

function Heading({ children, n, className }: { children: ReactNode; n: number; className?: string }) {
  return (
    <h2 className={cx("mt-9 flex items-center gap-2 border-b-2 border-ink pb-2 text-base font-bold", className)}>
      {children} <span className="font-mono text-sm font-medium text-ink-2">({n})</span>
    </h2>
  );
}

/** Bilingual draft report. Verified items are only those supported by approved evidence. */
export function ReportPage() {
  const { state, result, dispatch } = useThreadLight();
  const data = state.data, bn = state.lang === "bn", sc = result.scores;
  const docs = new Map(data.documents.map((d) => [d.id, d] as const));
  const T = (en: string, key: keyof typeof BN) => (bn ? BN[key] : en);

  const source = (r: RequirementResult) => !r.supporting.length ? T("No document on file", "nosource") :
    r.supporting.map((id) => {
      const d = docs.get(id)!;
      return `${id} · ${d.source.file}, ${T("page", "page")} ${d.source.page} · ${T("extraction confidence", "conf")} ${pct(d.confidence)}% (${T("sample", "sample")})`;
    }).join("; ");

  const item = (r: RequirementResult, label: ReactNode) => (
    <div key={r.id} className="border-b border-line py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-semibold"><Mono>{r.id}</Mono> &middot; {bn ? SAMPLE.requirements.find((x) => x.id === r.id)!.title_bn : r.title}</span>
        {label}
      </div>
      <ul className="mt-2 list-disc pl-5 marker:text-ink-3">
        {(bn ? reasonsBn(r, data, result) : r.reasons).map((x) => <li key={x}>{x}</li>)}
      </ul>
      <div className="mt-1.5 text-[12.5px] text-ink-2">{T("Source", "source")}: {source(r)}</div>
    </div>
  );

  const verified = result.requirements.filter((r) => r.status === "supported");
  const open = orderedRequirements(result).filter((r) => r.status !== "supported");
  const LangButton = ({ lang, label }: { lang: Lang; label: string }) => (
    <button type="button" data-lang={lang} lang={lang === "bn" ? "bn" : undefined} aria-pressed={state.lang === lang}
      onClick={() => dispatch({ type: "lang", lang })}
      className={cx("min-h-[38px] rounded-lg px-4 text-sm font-semibold motion-safe:transition", state.lang === lang ? "bg-thread text-thread-on shadow-sm" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
      {label}
    </button>
  );
  const meta: [string, ReactNode][] = [
    [T("Factory", "factory"), data.factory], [T("Buyer", "buyer"), data.buyer], [T("Framework", "framework"), data.framework],
    [T("Audit date", "audit"), <Mono key="a">{data.audit_date}</Mono>], [T("Report date (scenario)", "today"), <Mono key="t">{data.today}</Mono>],
    [T("Evidence coverage", "coverage"), `${sc.coverage}%`], [T("Decision-support risk index (not an audit score)", "risk"), `${sc.risk_index} /100`],
    [T("Open findings", "open"), sc.open_findings],
  ];

  return (
    <>
      <PageHeader eyebrow="Resolve" title="Report"
        description="Assembled from the rule results with fixed templates. Language-model drafting is planned, not used here."
        actions={<>
          <div role="group" aria-label="Report language" className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-sm">
            <LangButton lang="en" label="English" /><LangButton lang="bn" label="বাংলা" />
          </div>
          <Button size="sm" onClick={() => window.print()} icon={<Printer size={15} aria-hidden="true" />}>Print</Button>
        </>} />

      <article data-testid="report" lang={bn ? "bn" : "en"} className="card mx-auto max-w-3xl px-6 py-9 shadow-lift sm:px-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">ThreadLight &middot; Evidence Passport</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{T("Evidence readiness report (draft)", "title")}</h2>
          </div>
          <span className="rounded-lg border-2 border-gap/50 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-widest text-gap">{bn ? BN.draft : "Draft"}</span>
        </div>

        <dl className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1.5 rounded-xl bg-surface-2 px-4 py-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
          {meta.map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-2">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
        </dl>
        <p className="mt-3 text-[13px] text-ink-2">{T("Produced by fixed rules and templates. No language model was used. All data is synthetic.", "how")}</p>

        <section data-testid="report-verified">
          <Heading n={verified.length} className="text-ok">{T("Verified", "verified")}</Heading>
          {verified.length
            ? verified.map((r) => item(r, <StatusPill status="supported" lang={bn ? "bn" : "en"} label={bn ? BN.verified : "Verified"} />))
            : <p className="py-4 text-ink-2">{T("No verified items yet.", "none_verified")}</p>}
        </section>

        <section data-testid="report-open">
          <Heading n={open.length}>{T("Open, not confirmed", "open_h")}</Heading>
          {open.map((r) => item(r, <StatusPill status={r.status} lang={bn ? "bn" : "en"} />))}
        </section>

        <section>
          <Heading n={result.alerts.length}>{T("Evidence-integrity alerts", "alerts")}</Heading>
          {result.alerts.map((a) => (
            <div key={a.id} className="border-b border-line py-4 last:border-0">
              <span className="font-semibold"><Mono>{a.id}</Mono> &middot; {ALERT_LABEL[a.type][bn ? "bn" : "en"]}</span>
              <p className="mt-1">{bn ? alertBn(a, data) : a.message}</p>
              {!bn && <div className="mt-1 text-[12.5px] text-ink-2">Recommended check: {a.verify}</div>}
            </div>
          ))}
        </section>

        {bn && <p className="mt-5 text-[12.5px] text-ink-2">{BN.note}</p>}
        <p data-testid="report-footer" className="mt-9 rounded-xl border-2 border-ink px-5 py-4 font-bold">
          {bn ? <>{BN.footer}<br /><span lang="en" className="font-sans font-medium">Draft for human review. Not an audit result.</span></> : "Draft for human review. Not an audit result."}
        </p>
      </article>
    </>
  );
}
