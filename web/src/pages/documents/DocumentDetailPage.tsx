import { Navigate, useParams } from "react-router-dom";
import { typeLabel } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { ALERT_LABEL, EXPIRY, plural } from "@/lib/vocab";
import { DefinitionList, Mono, StatusPill, cx } from "@/components/ui";
import { LinkRow, List, PageHeader, Panel } from "@/components/ui/page";
import { Confidence, DocBadge } from "./DocumentsPage";

export function DocumentDetailPage() {
  const { id = "" } = useParams();
  const { state, result } = useThreadLight();
  const doc = state.data.documents.find((d) => d.id === id);
  if (!doc) return <Navigate to="/documents" replace />;

  const st = result.documents.find((d) => d.id === id)!;
  const exp = EXPIRY[st.expiry_state];
  const uses = result.edges.filter((e) => e.doc === id);
  const alerts = result.alerts.filter((a) => a.subject.includes(id) || a.related.includes(id));
  const supersededBy = state.data.documents.find((d) => d.supersedes === id);

  return (
    <>
      <PageHeader back={{ to: "/documents", label: "Documents" }} eyebrow={`Document ${doc.id}`}
        title={<span className="flex flex-wrap items-center gap-3">{doc.title}<DocBadge doc={doc} active={st.active} /></span>}
        description={<>{typeLabel(SAMPLE, doc.type)} &middot; <Mono>{doc.ref}</Mono> &middot; <span className={cx("font-semibold", exp.cls)}>{exp.label}</span></>} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Extracted fields" description="Pre-extracted sample result, not read live by OCR or a language model.">
          <DefinitionList className="gap-y-2.5 text-sm" items={[
            ["Entity", doc.entity],
            ["Reference", <Mono key="r">{doc.ref}</Mono>],
            ["Issued", <Mono key="i">{doc.issued}</Mono>],
            ["Valid until", doc.valid_until ? <Mono key="v">{doc.valid_until}</Mono> : "No expiry date"],
            ["Source", <span key="s"><Mono>{doc.source.file}</Mono>, page {doc.source.page}</span>],
            ["Extraction confidence", <Confidence key="c" value={doc.confidence} />],
            ["Approved by a person", doc.verified ? "Yes" : "No, pending human review"],
            ...(doc.cites.length ? [["Cites", doc.cites.map((c) => c.ref).join(", ")] as [string, string]] : []),
            ...(supersededBy ? [["Superseded by", supersededBy.id] as [string, string]] : []),
          ]} />
        </Panel>

        <div className="grid gap-6">
          <Panel title="Used for" description={uses.length ? `1 document affects ${plural(uses.length, "requirement", "requirements")}.` : "Not currently used: it is superseded or no requirement needs it."}>
            {uses.length > 0 && (
              <List label="Requirements using this document">
                {uses.map((e) => (
                  <LinkRow key={e.req} to={`/requirements/${e.req}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm"><Mono className="font-semibold">{e.req}</Mono> {result.requirements.find((r) => r.id === e.req)!.title}</span>
                      <StatusPill status={e.status} />
                    </div>
                  </LinkRow>
                ))}
              </List>
            )}
          </Panel>

          <Panel title={`Integrity alerts (${alerts.length})`}>
            {alerts.length === 0 ? <p className="text-sm text-ink-2">No evidence-integrity alert involves this document.</p> : (
              <ul className="grid gap-3">
                {alerts.map((a) => (
                  <li key={a.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                    <div className="font-semibold"><Mono>{a.id}</Mono> &middot; {ALERT_LABEL[a.type].en}</div>
                    <p className="mt-1 text-ink-2">{a.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
