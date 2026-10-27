import { CheckCircle2, CircleDashed, FileUp, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, FACTORY_ID, type Job } from "@/api/client";
import { useSession } from "@/auth/SessionProvider";
import { Button, Chip, Mono, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { LiveOnly } from "./LiveOnly";

const STEPS: [string, string][] = [
  ["ingest", "Stored"], ["parse", "Parse / OCR"], ["redact", "PII redaction"], ["classify", "Classify"], ["extract", "Extract"],
  ["validate", "Validate"], ["human_review", "Human review"], ["index", "Index (RAG)"], ["map_clauses", "Map clauses"],
  ["analyze", "Rules engine"], ["draft", "Bilingual draft"], ["request_approval", "Awaiting approval"], ["approval", "Approved"], ["finalize", "Done"],
];

interface Upload { file: string; document?: string; jobId?: string; job?: Job; error?: string; duplicate?: boolean }

function Progress({ job }: { job?: Job }) {
  const seen = new Set(job?.events.map((e) => e.step));
  const last = job?.step;
  return (
    <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Pipeline steps">
      {STEPS.filter(([id]) => id !== "human_review" || seen.has(id) || job?.state === "waiting_review").map(([id, label]) => {
        const done = seen.has(id);
        const failed = job?.state === "failed" && id === last;
        return (
          <li key={id} className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
            failed ? "border-gap/40 bg-gap-bg text-gap" : done ? "border-ok/30 bg-ok-bg text-ok" : "border-line text-ink-3")}>
            {failed ? <XCircle size={12} aria-hidden="true" /> : done ? <CheckCircle2 size={12} aria-hidden="true" /> : <CircleDashed size={12} aria-hidden="true" />}
            {label}
          </li>
        );
      })}
    </ol>
  );
}

const STATE_TEXT: Record<string, string> = {
  queued: "Queued", running: "Running", waiting_review: "Waiting for a person to check the fields",
  waiting_approval: "Waiting for the Compliance Officer to approve", done: "Done", failed: "Failed",
};

function UploadInner() {
  const { apiUser } = useSession();
  const { reload, result } = useThreadLight();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [supersedes, setSupersedes] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canUpload = apiUser?.role === "officer" || apiUser?.role === "staff";

  useEffect(() => {
    const active = uploads.filter((u) => u.jobId && !["done", "failed", "waiting_review", "waiting_approval"].includes(u.job?.state ?? ""));
    if (!active.length) return;
    const t = setTimeout(async () => {
      const next = await Promise.all(uploads.map(async (u) => {
        if (!u.jobId || !active.includes(u)) return u;
        try { return { ...u, job: await api.job(u.jobId) }; } catch { return u; }
      }));
      setUploads(next);
      if (next.some((u) => u.job && u.job.state !== "running" && u.job.state !== "queued")) void reload();
    }, 1500);
    return () => clearTimeout(t);
  }, [uploads, reload]);

  const send = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      setUploads((u) => [{ file: f.name }, ...u]);
      try {
        const r = await api.upload(FACTORY_ID, f, supersedes || undefined);
        setUploads((u) => u.map((x) => (x.file === f.name && !x.document ? { ...x, document: r.document, jobId: r.job_id ?? undefined, duplicate: r.duplicate } : x)));
      } catch (e) {
        const msg = e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message;
        setUploads((u) => u.map((x) => (x.file === f.name && !x.document ? { ...x, error: msg } : x)));
      }
    }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); void send(e.dataTransfer.files); };

  return (
    <>
      <PageHeader eyebrow="Live pipeline" title="Upload evidence"
        description="PDFs, scans or photos (≤ 20 MB). Each file is parsed (Tesseract OCR for scans and Bangla), personal data is redacted, Gemini extracts the fields with page citations, the rules engine re-runs, and a person reviews and approves before anything counts." />
      <Panel title="Add files" description={canUpload ? "Drop files here or choose them." : "Your role can view but not upload. Sign in as staff or the Compliance Officer."}>
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
          className={cx("grid place-items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center motion-safe:transition-colors",
            drag ? "border-thread bg-thread-soft" : "border-line bg-surface-2/50")}>
          <FileUp size={28} className="text-thread" aria-hidden="true" />
          <p className="text-sm text-ink-2">PDF, JPEG or PNG. Synthetic test files: <Mono>synth/out/</Mono> in the repository.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <label className="text-sm text-ink-2">Replaces document
              <select value={supersedes} onChange={(e) => setSupersedes(e.target.value)} className="ml-2 rounded-lg border border-line bg-surface px-2 py-1 text-sm">
                <option value="">none (new evidence)</option>
                {result.active_documents.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" id="upload-input"
              onChange={(e) => { void send(e.target.files); e.target.value = ""; }} />
            <Button variant="primary" disabled={!canUpload} onClick={() => input.current?.click()} icon={<FileUp size={16} aria-hidden="true" />}>Choose files</Button>
          </div>
        </div>
      </Panel>
      <div className="mt-6 grid gap-4">
        {uploads.map((u, i) => (
          <Panel key={i} title={<span className="flex flex-wrap items-center gap-2">{u.file}{u.document && <Chip>{u.document}</Chip>}{u.duplicate && <Chip>duplicate: already on file</Chip>}</span>}
            description={u.error ? undefined : u.job ? STATE_TEXT[u.job.state] ?? u.job.state : u.document ? "Queued" : "Uploading…"}
            actions={u.job?.state === "waiting_review" || u.job?.state === "waiting_approval"
              ? <Link to="/review" className="text-sm font-semibold text-thread underline">Open review queue</Link>
              : !u.error && u.job?.state !== "done" && u.job?.state !== "failed" ? <Loader2 size={18} className="animate-spin text-ink-3" aria-hidden="true" /> : null}>
            {u.error && <p role="alert" className="rounded-lg bg-gap-bg px-3 py-2 text-sm text-gap">{u.error}</p>}
            {u.job?.error && <p role="alert" className="rounded-lg bg-gap-bg px-3 py-2 text-sm text-gap">{u.job.error}</p>}
            {u.jobId && <Progress job={u.job} />}
          </Panel>
        ))}
      </div>
    </>
  );
}

export function UploadPage() {
  return <LiveOnly><UploadInner /></LiveOnly>;
}
