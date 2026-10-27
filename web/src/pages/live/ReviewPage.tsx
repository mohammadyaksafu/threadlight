import { Check, Link2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type MappingProposal, type ReviewItem } from "@/api/client";
import { useSession } from "@/auth/SessionProvider";
import { Button, Chip, Mono, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { LiveOnly } from "./LiveOnly";

const FIELDS = ["ref", "entity", "issued", "valid_until"] as const;
const LABEL: Record<string, string> = { ref: "Reference", entity: "Entity", issued: "Issued", valid_until: "Valid until" };

function FieldsItem({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const v = item.payload.validated;
  const [type, setType] = useState(item.type ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f, v?.fields[f]?.value ?? ""])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.resolve(item.id, { type: type || null, fields: Object.fromEntries(FIELDS.map((f) => [f, values[f] || null])) });
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Panel title={<span className="flex flex-wrap items-center gap-2">{item.document} <Mono className="text-sm text-ink-2">{item.filename}</Mono><Chip>check fields</Chip></span>}
      description={v?.issues.length ? `Why: ${v.issues.join("; ")}` : `Low confidence: ${v?.low_fields.join(", ") || "type"}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Document type
          <input value={type} onChange={(e) => setType(e.target.value)} className="min-h-[40px] rounded-lg border border-line bg-surface px-3 font-mono text-sm" />
        </label>
        {FIELDS.map((f) => {
          const fv = v?.fields[f];
          const low = v?.low_fields.includes(f);
          return (
            <label key={f} className="grid gap-1 text-sm font-medium">
              <span className="flex items-center justify-between gap-2">{LABEL[f]}
                <span className={cx("font-mono text-[11px]", low ? "text-gap" : "text-ink-3")}>
                  {fv?.confidence !== undefined ? `conf ${fv.confidence}` : ""}{fv?.page ? ` · p${fv.page}` : ""}
                </span>
              </span>
              <input value={values[f]} onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                className={cx("min-h-[40px] rounded-lg border bg-surface px-3 font-mono text-sm", low ? "border-gap/50" : "border-line")} />
              {fv?.quote && <span className="text-xs font-normal text-ink-3">Source: “{fv.quote}”</span>}
            </label>
          );
        })}
      </div>
      {err && <p role="alert" className="mt-3 rounded-lg bg-gap-bg px-3 py-2 text-sm text-gap">{err}</p>}
      <div className="mt-4"><Button variant="primary" disabled={busy} onClick={save} icon={<Check size={16} aria-hidden="true" />}>Save checked fields</Button></div>
    </Panel>
  );
}

function ApprovalItem({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (approved: boolean) => {
    setBusy(true); setErr(null);
    try { await api.resolve(item.id, { approved }); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Panel title={<span className="flex flex-wrap items-center gap-2">{item.document} <Mono className="text-sm text-ink-2">{item.filename}</Mono><Chip>approve evidence</Chip></span>}
      description="Until a named Compliance Officer approves it, the rules treat this document as pending human review.">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-2">Type</dt><dd className="font-mono">{item.type}</dd>
        <dt className="text-ink-2">Reference</dt><dd className="font-mono">{item.ref}</dd>
        <dt className="text-ink-2">Entity</dt><dd>{item.entity}</dd>
        <dt className="text-ink-2">Issued / valid until</dt><dd className="font-mono">{item.issued} → {item.valid_until ?? "no expiry"}</dd>
      </dl>
      {err && <p role="alert" className="mt-3 rounded-lg bg-gap-bg px-3 py-2 text-sm text-gap">{err}</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => decide(true)} icon={<Check size={16} aria-hidden="true" />}>Approve</Button>
        <Button disabled={busy} onClick={() => decide(false)} icon={<X size={16} aria-hidden="true" />}>Reject</Button>
      </div>
    </Panel>
  );
}

function MappingRow({ m, onDone }: { m: MappingProposal; onDone: () => void }) {
  const decide = async (confirm: boolean) => { await api.confirmMapping(m.id, confirm); onDone(); };
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <Link2 size={16} className="mt-1 text-thread" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{m.requirement} {m.title} ← {m.document}{m.page ? `:p${m.page}` : ""}
          <span className="ml-2 font-mono text-xs font-normal text-ink-3">{m.method} · {m.score}</span></p>
        {m.chunk && <p className="mt-1 line-clamp-2 text-xs text-ink-2">{m.chunk}</p>}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => decide(true)} icon={<Check size={14} aria-hidden="true" />}>Confirm</Button>
        <Button size="sm" variant="ghost" onClick={() => decide(false)} icon={<X size={14} aria-hidden="true" />}>Reject</Button>
      </div>
    </li>
  );
}

function ReviewInner() {
  const { apiUser } = useSession();
  const { reload } = useThreadLight();
  const [data, setData] = useState<{ items: ReviewItem[]; mappings: MappingProposal[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await api.reviewQueue()); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const done = () => { void load(); void reload(); };

  if (apiUser?.role !== "officer") {
    return <Panel title="Review queue"><p className="text-sm text-ink-2">Only the Compliance Officer reviews fields, approves evidence and confirms mappings.</p></Panel>;
  }
  return (
    <>
      <PageHeader eyebrow="Human in the loop" title="Review queue"
        description="Low-confidence or failed fields, evidence waiting for approval, and clause mappings proposed by retrieval. Nothing here takes effect until you act."
        actions={<Button onClick={() => void load()} icon={<RefreshCw size={15} aria-hidden="true" />}>Refresh</Button>} />
      {err && <p role="alert" className="mb-4 rounded-lg bg-gap-bg px-3 py-2 text-sm text-gap">{err}</p>}
      <div className="grid gap-4">
        {data && data.items.length === 0 && <Panel title="Nothing waiting"><p className="text-sm text-ink-2">No documents need checking or approval.</p></Panel>}
        {data?.items.map((it) => it.kind === "fields" ? <FieldsItem key={it.id} item={it} onDone={done} /> : <ApprovalItem key={it.id} item={it} onDone={done} />)}
        {data && data.mappings.length > 0 && (
          <Panel title={`Proposed clause mappings (${data.mappings.length})`} description="Hybrid retrieval + reranking proposed these links. Confirm the ones a person agrees with.">
            <ul className="-mx-2 divide-y divide-line">{data.mappings.map((m) => <MappingRow key={m.id} m={m} onDone={done} />)}</ul>
          </Panel>
        )}
      </div>
    </>
  );
}

export function ReviewPage() {
  return <LiveOnly><ReviewInner /></LiveOnly>;
}
