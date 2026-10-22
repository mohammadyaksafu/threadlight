import { Check, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { analyze } from "@/engine";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { AGENTS, plural } from "@/lib/vocab";
import { Button, RulesChip, SampleChip, cx } from "@/components/ui";
import { Panel } from "@/components/ui/page";

const STEP_MS = 420;

/** Lights up the seven agents in order and re-runs the rules engine for real (timed). */
export function AgentPipeline() {
  const { state } = useThreadLight();
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(-1); // -1 idle, 0..6 running, 7 done
  const [summary, setSummary] = useState("");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = () => {
    timers.current.forEach(clearTimeout);
    const t0 = performance.now();
    const r = analyze(state.data);
    const ms = performance.now() - t0;
    const done = `Analysis complete: ${r.requirements.length} requirements checked, ${plural(r.scores.open_findings, "open finding", "open findings")}, ` +
      `${plural(r.alerts.length, "evidence-integrity alert", "evidence-integrity alerts")}. Rules ran in your browser in ${ms < 1 ? "under 1" : Math.round(ms)} ms. No AI model was called.`;
    if (reduced) { setStep(AGENTS.length); setSummary(done); return; }
    setSummary("Running…");
    timers.current = AGENTS.map((_, i) => window.setTimeout(() => setStep(i), i * STEP_MS));
    timers.current.push(window.setTimeout(() => { setStep(AGENTS.length); setSummary(done); }, AGENTS.length * STEP_MS));
  };

  const running = step >= 0 && step < AGENTS.length;
  const status = running ? `Step ${step + 1} of 7: ${AGENTS[step].name} (${AGENTS[step].kind === "rules" ? "rules" : "sample extraction"})` : summary;

  return (
    <Panel title="Analysis pipeline"
      description={<>Seven agents in order. <RulesChip /> runs as deterministic code in your browser now. <SampleChip /> is a pre-computed sample standing in for a planned OCR or language-model step.</>}
      actions={<Button id="run-analysis" variant="primary" onClick={run} disabled={running} icon={<Play size={15} fill="currentColor" aria-hidden="true" />}>Run analysis</Button>}>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {AGENTS.map((a, i) => {
          const st = step === i ? "running" : step > i ? "done" : "idle";
          return (
            <li key={a.name} data-testid="agent" data-state={st} title={a.does}
              className={cx(
                "flex flex-col rounded-xl border p-2.5 text-[12.5px] motion-safe:transition-all motion-safe:duration-300",
                st === "idle" && "border-line bg-surface",
                st === "running" && "border-thread bg-surface ring-4 ring-thread/15",
                st === "done" && "border-thread/50 bg-thread-soft",
              )}>
              <span className="flex items-center justify-between font-mono text-[10.5px] text-ink-3">
                {String(i + 1).padStart(2, "0")}
                {st === "done" && <Check size={13} className="text-thread-strong" aria-label="done" />}
                {st === "running" && <span className="h-2 w-2 rounded-full bg-thread motion-safe:animate-pulse" aria-label="running" />}
              </span>
              <span className="mt-1 flex-1 font-semibold leading-snug">{a.name}</span>
              <span className="mt-2" data-testid="agent-kind">{a.kind === "rules" ? <RulesChip /> : <SampleChip />}</span>
            </li>
          );
        })}
      </ol>
      <p id="run-status" aria-live="polite" className="mt-3 min-h-[1.5em] text-sm text-ink-2">{status}</p>
    </Panel>
  );
}
