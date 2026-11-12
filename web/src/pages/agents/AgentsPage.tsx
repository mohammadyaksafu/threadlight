import { ArrowRight, Check, Clock, Lock, UserCheck, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Chip, Mono, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";
import { ThreadCanvas } from "@/components/fx/ThreadCanvas";
import { CountUp, useReveal } from "@/lib/scroll";
import { usePrefersReducedMotion } from "@/lib/hooks";

// Committed bench report (evals/reports/YYYY-MM-DD-agents.json, written by agent_bench/run.py), bundled
// at build time. Every figure on this page is read from that file; nothing here is typed in by hand.
// <date>-agents.json is the main run; <date>-agents-<model>.json files are the same bench on another model.
const REPORTS = Object.entries(import.meta.glob("../../../../evals/reports/*-agents*.json", { eager: true, import: "default" }) as Record<string, Bench>)
  .sort(([a], [b]) => a.localeCompare(b));
const BENCH = REPORTS.filter(([k]) => k.endsWith("-agents.json")).pop()?.[1];
const OTHER_MODELS = REPORTS.filter(([k]) => !k.endsWith("-agents.json")).map(([, v]) => v).filter((v) => v.model !== BENCH?.model);

interface Run {
  id: string; name: string; package: string; version: string; pattern: string; status: "ran" | "error"; error?: string;
  latency_s: number; tool_calls: { tool: string; args: Record<string, string> }[];
  brief: { coverage: number | null; risk_index: number | null; priorities: string[] };
  raw: string; notes: Record<string, string>; checks: Record<string, boolean>; passed: number;
}
interface Bench {
  date: string; model: string; host: string; task: string; tools: string[];
  expected: { coverage: number; risk_index: number; priorities: string[] };
  checks: Record<string, string>; frameworks: Run[];
}

/** What each framework does in this repository. Only LangGraph is on the production path. */
const ROLE: Record<string, { production: boolean; where: string; role: string }> = {
  langgraph: { production: true, where: "backend/pipeline/graph.py", role: "Runs the document pipeline: 14 nodes, Postgres checkpoints and two human interrupts. The bench adapter reuses it as a plain tool loop." },
  "pydantic-ai": { production: false, where: "agent_bench/adapters.py", role: "The answer has to validate against the Brief schema before the run can end, so a malformed brief is retried instead of returned." },
  "openai-agents": { production: false, where: "agent_bench/adapters.py", role: "A triage agent with no tools hands the request to a gap analyst that owns the tools. Run against the local model through the Chat Completions interface." },
  smolagents: { production: false, where: "agent_bench/adapters.py", role: "A multi-step tool-calling agent that finishes through its own final_answer tool. The code-writing agent type is not used: nothing here executes model-written code." },
  autogen: { production: false, where: "agent_bench/adapters.py", role: "A two-agent conversation: the analyst writes the brief and a reviewer without tools replies once. The reviewer's line is recorded, not scored." },
  agno: { production: false, where: "agent_bench/adapters.py", role: "A single agent on Agno's own Ollama client, with the four Python functions passed as tools." },
  dspy: { production: false, where: "agent_bench/adapters.py", role: "A ReAct module over a typed signature. DSPy builds the prompt from the signature's fields, so there is no hand-written prompt for this adapter." },
};

const PIPELINE: { id: string; human?: boolean }[] = [
  { id: "ingest" }, { id: "parse" }, { id: "redact" }, { id: "classify" }, { id: "extract" }, { id: "validate" },
  { id: "human review", human: true }, { id: "index" }, { id: "map clauses" }, { id: "analyze" }, { id: "request approval" },
  { id: "officer approval", human: true }, { id: "finalize" }, { id: "draft" },
];

/** The production LangGraph pipeline as a row of nodes; a light walks through them and waits at the two human steps. */
function PipelineFlow() {
  const reduced = usePrefersReducedMotion();
  const [at, setAt] = useState(reduced ? -1 : 0);
  useEffect(() => {
    if (reduced) { setAt(-1); return; }
    const id = window.setTimeout(() => setAt((i) => (i + 1) % PIPELINE.length), PIPELINE[at]?.human ? 1700 : 520);
    return () => clearTimeout(id);
  }, [at, reduced]);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Document pipeline nodes in order">
      {PIPELINE.map((n, i) => (
        <li key={n.id} className="flex items-center gap-1">
          <span className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11.5px] motion-safe:transition-all motion-safe:duration-300",
            n.human ? "border-[rgb(255_217_160)]/60 text-[rgb(255_229_190)]" : "border-hero-ink/20 text-hero-ink-2",
            at === i && (n.human ? "scale-105 bg-[rgb(255_217_160)]/20 shadow-[0_0_18px_rgb(255_217_160/.45)]" : "scale-105 border-hero-ink/60 bg-hero-ink/15 text-hero-ink shadow-[0_0_18px_rgb(154_165_255/.5)]"),
          )}>
            {n.human && <UserCheck size={12} aria-hidden="true" />}{n.id}
          </span>
          {i < PIPELINE.length - 1 && <ArrowRight size={12} className="text-hero-ink-2/60" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <span className={cx("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full", ok ? "bg-ok text-surface" : "bg-gap text-surface")}>
        {ok ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : <X size={11} strokeWidth={3} aria-hidden="true" />}
      </span>
      <span><span className="sr-only">{ok ? "Passed: " : "Failed: "}</span>{label}</span>
    </li>
  );
}

function Chapter({ run, bench, index, onActive }: { run: Run; bench: Bench; index: number; onActive: (i: number) => void }) {
  const ref = useReveal<HTMLElement>();
  const role = ROLE[run.id];
  // The chapter that crosses the middle of the viewport drives the 3D thread.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) onActive(index); }, { rootMargin: "-45% 0px -45% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [index, onActive, ref]);

  return (
    <article ref={ref} data-reveal="" id={`fw-${run.id}`} data-testid="framework" className="card scroll-mt-40 lg:my-[9vh] first:lg:mt-0 last:lg:mb-0 max-lg:mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">{String(index + 1).padStart(2, "0")} &middot; {run.pattern}</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight">{run.name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {role?.production
            ? <Chip className="border-ok/30 bg-ok-bg text-ok">in the product</Chip>
            : <Chip className="border-dashed bg-transparent">bench only</Chip>}
          <Chip><Mono>{run.package} {run.version}</Mono></Chip>
        </div>
      </div>
      {role && <p className="mt-3 text-sm leading-relaxed text-ink-2">{role.role} <Mono className="text-ink-3">{role.where}</Mono></p>}

      {run.status === "error" ? (
        <p className="mt-4 rounded-xl bg-gap-bg px-3 py-2 text-[13px] text-gap"><strong>Run failed.</strong> {run.error}</p>
      ) : (
        <>
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3"><Wrench size={12} aria-hidden="true" />Tool calls it made</p>
            {run.tool_calls.length === 0 ? <p className="mt-1.5 text-[13px] text-gap">None. It answered without reading the engine.</p> : (
              <ol className="mt-1.5 flex flex-wrap items-center gap-1">
                {run.tool_calls.map((c, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="rounded-md bg-thread-soft px-1.5 py-0.5 font-mono text-[11.5px] text-thread-strong">
                      {c.tool}({Object.values(c.args).join(", ")})
                    </span>
                    {i < run.tool_calls.length - 1 && <ArrowRight size={11} className="text-ink-3" aria-hidden="true" />}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {([["Coverage", run.brief.coverage, bench.expected.coverage], ["Risk index", run.brief.risk_index, bench.expected.risk_index]] as const).map(([k, got, want]) => (
              <div key={k} className="rounded-xl bg-surface-2 px-2 py-2">
                <dt className="text-[11px] text-ink-2">{k}</dt>
                <dd className={cx("font-mono text-lg font-semibold tabular-nums", got === want ? "text-ok" : "text-gap")}>{got ?? "none"}</dd>
              </div>
            ))}
            <div className="rounded-xl bg-surface-2 px-2 py-2">
              <dt className="text-[11px] text-ink-2">Top three</dt>
              <dd className="font-mono text-[13px] font-semibold leading-7">{run.brief.priorities.slice(0, 3).join(" ") || "none"}</dd>
            </div>
          </dl>
        </>
      )}

      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {Object.entries(bench.checks).map(([k, label]) => <CheckRow key={k} ok={!!run.checks[k]} label={label} />)}
      </ul>
      {Object.entries(run.notes ?? {}).map(([k, v]) => (
        <p key={k} className="mt-3 border-l-2 border-line pl-3 text-[13px] text-ink-2"><span className="font-semibold capitalize text-ink">{k.replace(/_/g, " ")}:</span> {v}</p>
      ))}
      <p className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[13px] text-ink-2">
        <span data-testid="fw-score" className="font-semibold text-ink">{run.passed} of 4 checks</span>
        <span className="flex items-center gap-1"><Clock size={13} aria-hidden="true" /><Mono>{run.latency_s} s</Mono></span>
      </p>
    </article>
  );
}

export function AgentsPage() {
  const [active, setActive] = useState(0);
  const scrollTo = useRef((id: string) => document.getElementById(`fw-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));

  if (!BENCH) {
    return (
      <>
        <PageHeader eyebrow="Agentic workflow" title="Agent frameworks" />
        <Panel><p className="text-ink-2">No bench report is committed yet. Run <Mono>python -m agent_bench.run</Mono> to create one.</p></Panel>
      </>
    );
  }
  const runs = BENCH.frameworks, cur = runs[active] ?? runs[0];
  const slowest = Math.max(...runs.map((r) => r.latency_s), 1);
  const full = runs.filter((r) => r.passed === 4).length;

  return (
    <>
      <PageHeader eyebrow="Agentic workflow" title="Agents read and propose. Rules decide. People approve."
        description={<>One framework runs the product's pipeline. {runs.length} frameworks were given the same task, the same four read-only tools and the same local model, and scored by plain code.</>} />

      <section aria-label="Production pipeline" className="aurora relative overflow-hidden rounded-3xl bg-hero p-6 text-hero-ink shadow-lift sm:p-8">
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-hero-ink/10 px-3 py-1 text-xs font-semibold text-hero-ink-2">
            <Lock size={13} aria-hidden="true" />No agent has an approve or close tool
          </p>
          <h2 className="mt-4 max-w-2xl text-[28px] font-extrabold leading-[1.12] tracking-tight max-sm:text-[23px]">
            The LangGraph pipeline stops twice and waits for a person.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-hero-ink-2">
            A reviewer corrects low-confidence fields, and a named Compliance Officer approves the evidence. The graph cannot pass either node on a model's say-so.
          </p>
          <div className="mt-6"><PipelineFlow /></div>
          <dl className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([[PIPELINE.length, "pipeline nodes"], [2, "human interrupts"], [runs.length, "frameworks benchmarked"], [full, "passed all 4 checks"]] as const).map(([n, label]) => (
              <div key={label}>
                <dd className="text-3xl font-extrabold tabular-nums tracking-tight"><CountUp value={n} /></dd>
                <dt className="text-[12.5px] text-hero-ink-2">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <h2 className="mb-1 mt-12 text-xl font-bold tracking-tight">Same task, {runs.length} frameworks</h2>
      <p className="max-w-3xl text-sm text-ink-2">
        Task given to each: <q>{BENCH.task}</q> Expected from the rules engine: coverage <Mono>{BENCH.expected.coverage}</Mono>, risk
        index <Mono>{BENCH.expected.risk_index}</Mono>, top three <Mono>{BENCH.expected.priorities.join(" ")}</Mono>. Scroll to follow the thread.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Sticky 3D thread: one station per framework; the light moves to the chapter in view. */}
        <div className="lg:relative">
          <div className="relative h-56 overflow-hidden rounded-3xl bg-side text-side-ink shadow-lift lg:sticky lg:top-36 lg:h-[min(62vh,540px)]">
            <ThreadCanvas variant="path" nodes={runs.length} active={active} />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-side-ink-2">{String(active + 1).padStart(2, "0")} / {String(runs.length).padStart(2, "0")}</span>
              <span className="rounded-full bg-side-ink/10 px-2.5 py-1 font-mono text-[11px] text-side-ink-2">{BENCH.model}</span>
            </div>
            <div key={cur.id} className="absolute inset-x-0 bottom-0 p-5 motion-safe:animate-rise-in" aria-live="polite">
              <p className="text-[12.5px] text-side-ink-2">{cur.pattern}</p>
              <p className="text-2xl font-extrabold tracking-tight">{cur.name}</p>
              <p className="mt-1 text-sm text-side-ink-2">{cur.status === "error" ? "run failed" : `${cur.passed} of 4 checks · ${cur.latency_s} s`}</p>
            </div>
            <nav aria-label="Frameworks" className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
              {runs.map((r, i) => (
                <button key={r.id} type="button" onClick={() => scrollTo.current(r.id)} aria-label={r.name} aria-current={i === active ? "true" : undefined} title={r.name}
                  className={cx("h-2.5 w-2.5 rounded-full motion-safe:transition-all", i === active ? "scale-150 bg-[rgb(255_240_210)]" : i < active ? "bg-[rgb(110_222_160)]" : "bg-side-ink/30 hover:bg-side-ink/60")} />
              ))}
            </nav>
          </div>
        </div>
        <div>
          {runs.map((r, i) => <Chapter key={r.id} run={r} bench={BENCH} index={i} onActive={setActive} />)}
        </div>
      </div>

      <Panel className="mt-10" title="Side by side" description="Checks passed and wall-clock time for the one run. Time includes every model call the framework made.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-[13px]">
            <thead className="text-ink-2">
              <tr>
                {["Framework", "Version", "Tool calls", "Checks"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}
                {OTHER_MODELS.map((o) => <th key={o.model} className="pb-2 pr-3 font-medium">On <Mono>{o.model}</Mono></th>)}
                <th className="pb-2 pr-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 font-semibold">{r.name}</td>
                  <td className="pr-3 font-mono">{r.version}</td>
                  <td className="pr-3 tabular-nums">{r.tool_calls.length}</td>
                  <td className="pr-3">
                    <span className="flex items-center gap-1" role="img" aria-label={`${r.passed} of 4 checks passed`}>
                      {Object.keys(BENCH.checks).map((k) => <span key={k} className={cx("h-2.5 w-2.5 rounded-full", r.checks[k] ? "bg-ok" : "border border-gap bg-gap-bg")} />)}
                      <span className="ml-1.5 tabular-nums">{r.passed}/4</span>
                    </span>
                  </td>
                  {OTHER_MODELS.map((o) => {
                    const alt = o.frameworks.find((f) => f.id === r.id);
                    return <td key={o.model} data-testid="fw-alt" className="pr-3 tabular-nums text-ink-2">{!alt ? "not run" : alt.status === "error" ? "failed to finish" : `${alt.passed}/4`}</td>;
                  })}
                  <td className="w-[30%]">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full origin-left rounded-full bg-thread motion-safe:animate-grow-x" style={{ width: `${(r.latency_s / slowest) * 100}%` }} />
                      </span>
                      <span className="w-14 text-right font-mono tabular-nums">{r.latency_s} s</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="mt-6" title="How to read this" description={`Report evals/reports/${BENCH.date}-agents.json`}>
        <ul className="grid gap-2 text-sm text-ink-2">
          <li><strong className="text-ink">Small sample.</strong> <Mono>{BENCH.model}</Mono> on {BENCH.host}. A different model or a second run can change who passes.</li>
          <li><strong className="text-ink">A reviewer agent is not a check.</strong> In the AutoGen run the reviewer agent read the tool output and still accepted a ranking that differed from it. Only the code check caught it, which is why approvals here go to people.</li>
          <li><strong className="text-ink">It measures plumbing, not intelligence.</strong> All frameworks used the same model. The differences come from how each one prompts, loops and parses.</li>
          {OTHER_MODELS.map((o) => (
            <li key={o.model}><strong className="text-ink">The model matters more than the framework.</strong> The same bench on <Mono>{o.model}</Mono> ({o.date}):{" "}
              {o.frameworks.filter((f) => f.passed === 4).length} of {o.frameworks.length} frameworks passed all four checks, against {full} of {runs.length} on <Mono>{BENCH.model}</Mono>.</li>
          ))}
          <li><strong className="text-ink">Time is laptop time.</strong> Seconds reflect a CPU-only laptop and the number of model calls each framework chose to make.</li>
          <li><strong className="text-ink">Only LangGraph is in the product.</strong> The other frameworks exist in <Mono>agent_bench/</Mono> with their own virtual environment and are not deployed.</li>
        </ul>
      </Panel>
    </>
  );
}
