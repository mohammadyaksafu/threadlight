import { Activity, BookOpen, Cpu, Gauge, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { api, API_BASE, LIVE_AVAILABLE } from "@/api/client";
import { useSession } from "@/auth/SessionProvider";
import { Chip, Mono, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";

// Committed evaluation summaries (evals/reports/YYYY-MM-DD.json), bundled at build time so the page shows
// measured numbers even in the offline demo.
const REPORTS = import.meta.glob("../../../../evals/reports/????-??-??.json", { eager: true, import: "default" }) as Record<string, unknown>;
const LATEST = Object.entries(REPORTS).filter(([k]) => /\/\d{4}-\d{2}-\d{2}\.json$/.test(k)).sort(([a], [b]) => a.localeCompare(b)).pop()?.[1] as EvalSummary | undefined;

interface EvalSummary {
  date: string;
  extraction: Record<string, { model: string; docs?: number; field_accuracy?: number; type_accuracy?: number; silent_error_rate?: number; auto_accept_rate?: number; injection?: string; p95_latency_ms?: number }>;
  rag: Record<string, { recall_at_5: number; hit_at_1: number; mrr: number }> | null;
  draft: { runs: number; mean_citation_coverage: number; runs_with_unsupported_numbers: number; mean_judge_faithfulness: number | null; judge_model: string | null } | null;
  gates: Record<string, number | null>;
  gates_passed: boolean;
}

const STACK: [string, string, string][] = [
  ["API", "FastAPI, Pydantic v2, SQLAlchemy 2 (Core) + Alembic, JWT, slowapi", "implemented"],
  ["Pipeline", "LangGraph state machine, Postgres checkpoints, 2 human interrupts, arq workers on Redis", "implemented"],
  ["Parsing", "Docling (layout) + pypdfium2 text layer + Tesseract eng+ben OCR", "implemented"],
  ["Models", "Gemini 3.x Flash / Flash-Lite (extract, classify, context, draft), Gemma 4 (judge), Ollama Llama 3.2 3B + bge-m3 (local)", "implemented"],
  ["Retrieval", "pgvector HNSW + Postgres FTS, reciprocal rank fusion, bge-reranker-v2-m3, contextual chunks, query rewriting / HyDE", "implemented"],
  ["Guardrails", "Presidio PII redaction, injection fencing, verbatim-quote check, citation checker, review threshold 0.85", "implemented"],
  ["Protocol", "threadlight-mcp (FastMCP): 9 tools, 3 resources, 2 prompts, stdio + streamable HTTP, bearer auth", "implemented"],
  ["Storage", "Postgres 16 with row-level security per tenant, MinIO (S3), Redis cache", "implemented"],
  ["Automation", "n8n (expiry watch, nightly evals, email intake), GitHub Actions CI/CD", "implemented"],
  ["Observability", "Langfuse traces, llm_calls cost/token log, Prometheus + Grafana", "implemented"],
  ["Fine-tuning", "LoRA on a small open model", "not done"],
];

function Health() {
  const [h, setH] = useState<Awaited<ReturnType<typeof api.health>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.health().then(setH).catch((e: Error) => setErr(e.message)); }, []);
  if (err) return <p className="text-sm text-gap">API not reachable: {err}</p>;
  if (!h) return <p className="text-sm text-ink-3">Checking…</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {Object.entries(h.services).map(([k, v]) => (
        <li key={k}><Chip className={cx(v === "up" || v === "configured" ? "border-ok/30 bg-ok-bg text-ok" : "border-gap/30 bg-gap-bg text-gap")}>{k}: {v}</Chip></li>
      ))}
      <li><Chip>LLM mode: {h.llm_mode}{h.private_mode ? " (private)" : ""}</Chip></li>
    </ul>
  );
}

function Usage() {
  const [rows, setRows] = useState<Record<string, string | number>[] | null>(null);
  useEffect(() => { api.usage().then(setRows).catch(() => setRows([])); }, []);
  if (!rows?.length) return <p className="text-sm text-ink-3">No model calls logged yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="text-ink-2"><tr>{["Task", "Model", "Calls", "Input tok", "Cached tok", "Output tok", "Cache hits", "Avg ms"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}><td className="py-1.5 pr-3">{r.purpose}</td><td className="pr-3 font-mono">{r.model}</td><td className="pr-3 tabular-nums">{r.calls}</td>
              <td className="pr-3 tabular-nums">{r.input_tokens}</td><td className="pr-3 tabular-nums">{r.cached_tokens}</td><td className="pr-3 tabular-nums">{r.output_tokens}</td>
              <td className="pr-3 tabular-nums">{r.response_cache_hits}</td><td className="tabular-nums">{r.avg_latency_ms}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Evals({ e }: { e: EvalSummary }) {
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-ink-2"><tr>{["Extractor", "Docs", "Type acc.", "Field acc.", "Auto-accepted", "Silent errors", "Injection resisted", "p95 ms"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {Object.entries(e.extraction).map(([k, v]) => (
              <tr key={k}><td className="py-1.5 pr-3 font-mono">{v.model}</td><td className="pr-3">{v.docs}</td><td className="pr-3">{v.type_accuracy}</td>
                <td className="pr-3 font-semibold">{v.field_accuracy}</td><td className="pr-3">{v.auto_accept_rate}</td><td className="pr-3">{v.silent_error_rate}</td>
                <td className="pr-3">{v.injection}</td><td>{v.p95_latency_ms}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {e.rag && (
        <p className="text-[13px]"><strong>Retrieval</strong> (clause → evidence): {Object.entries(e.rag).map(([k, v]) => `${k} recall@5 ${v.recall_at_5}, MRR ${v.mrr}`).join(" · ")}</p>
      )}
      {e.draft && (
        <p className="text-[13px]"><strong>Drafts</strong>: {e.draft.runs} runs, citation coverage before the checker {e.draft.mean_citation_coverage},
          judge faithfulness {e.draft.mean_judge_faithfulness ?? "n/a"} ({e.draft.judge_model ?? "no judge"}), drafts with unsupported numbers {e.draft.runs_with_unsupported_numbers}.</p>
      )}
      <p className="text-[13px]"><strong>Gates</strong>: {Object.entries(e.gates).map(([k, v]) => `${k} ${v ?? "not measured"}`).join(" · ")} — {e.gates_passed ? "passed" : "not all passed"}.</p>
      <p className="text-xs text-ink-3">Synthetic labelled set from <Mono>synth/generate.py</Mono>. These are not real-world accuracy figures. Full report: <Mono>evals/reports/{e.date}.md</Mono>.</p>
    </div>
  );
}

export function SystemPage() {
  const { mode, apiUser } = useSession();
  const live = mode === "live" && !!apiUser;
  return (
    <>
      <PageHeader eyebrow="System" title="How ThreadLight works"
        description="Models read, rules decide, people approve. Language models only extract cited fields and draft text; the deterministic rules engine decides every status; a named Compliance Officer approves evidence and closes findings." />
      <div className="grid gap-4">
        <Panel title={<span className="flex items-center gap-2"><Server size={18} aria-hidden="true" />Live system</span>}
          description={LIVE_AVAILABLE ? `API at ${API_BASE} · OpenAPI at ${API_BASE}/docs · MCP at /mcp` : "This copy is the offline demo. The live system runs on the VPS."}>
          {live ? <Health /> : <p className="text-sm text-ink-2">Sign in with “Live API” to see service health and model usage.</p>}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><BookOpen size={18} aria-hidden="true" />Data flow</span>}>
          <ol className="grid gap-1.5 text-[13px] sm:grid-cols-2">
            {["Upload (API, n8n e-mail, MCP) → MinIO with SHA-256 duplicate check", "Parse: Docling / PDF text, Tesseract OCR for scans and Bangla",
              "Redact personal data (Presidio) and fence the text as untrusted data", "Classify locally (Llama 3.2 3B), fall back to Gemini Flash-Lite",
              "Extract fields + page quotes with Gemini (JSON schema, few-shot)", "Validate: quote on page, value in quote, dates; else human review",
              "Index: contextual chunks → bge-m3 / Gemini embeddings + full text", "Map clauses: hybrid search + rerank → proposals a person confirms",
              "Rules engine (unchanged, parity-tested) → statuses, alerts, plan", "Bilingual draft with source tags; uncited sentences removed",
              "Compliance Officer approves → evidence counts", "Outputs: app, CSV/XLSX, REST, webhooks, MCP"].map((s, i) => (
              <li key={i} className="flex gap-2"><span className="font-mono text-ink-3">{String(i + 1).padStart(2, "0")}</span>{s}</li>
            ))}
          </ol>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Cpu size={18} aria-hidden="true" />Stack: implemented vs not done</span>}>
          <ul className="divide-y divide-line text-[13px]">
            {STACK.map(([k, v, s]) => (
              <li key={k} className="flex flex-wrap items-start gap-3 py-2"><span className="w-28 shrink-0 font-semibold">{k}</span><span className="min-w-0 flex-1">{v}</span>
                <Chip className={s === "implemented" ? "border-ok/30 bg-ok-bg text-ok" : ""}>{s}</Chip></li>
            ))}
          </ul>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Gauge size={18} aria-hidden="true" />Latest evaluation{LATEST ? ` (${LATEST.date})` : ""}</span>}>
          {LATEST ? <Evals e={LATEST} /> : <p className="text-sm text-ink-3">No evaluation report committed yet.</p>}
        </Panel>
        {live && (
          <Panel title={<span className="flex items-center gap-2"><Activity size={18} aria-hidden="true" />Model usage (this tenant)</span>}
            description="From the llm_calls log: every call's model, tokens (incl. prompt-cache hits) and latency.">
            <Usage />
          </Panel>
        )}
      </div>
    </>
  );
}
