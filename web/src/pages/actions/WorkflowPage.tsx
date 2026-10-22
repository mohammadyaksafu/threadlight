import { Check, Lock, RotateCcw, ShieldCheck, Upload, UserCheck, UserPlus, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { STATES, type LifecycleState } from "@/engine";
import { useThreadLight } from "@/store/ThreadLightProvider";
import type { Action } from "@/store/reducer";
import { Button, Mono, StatusPill, cx } from "@/components/ui";
import { PageHeader, Panel } from "@/components/ui/page";

interface StepDef {
  state: LifecycleState; label: string; who: string; detail: string;
  button?: { id: string; label: string; icon: LucideIcon; action: Action["type"] };
}

const STEPS: StepDef[] = [
  { state: "detected", label: "Detect", who: "Rules engine", detail: "The certificate expires on 2026-11-10, before the audit." },
  { state: "explained", label: "Explain", who: "Rules engine", detail: "Reasons and cited source are attached to the finding." },
  { state: "assigned", label: "Assign", who: "A person", detail: "Only a person can assign an owner.",
    button: { id: "lc-assign", label: "Assign to Safety & Maintenance", icon: UserPlus, action: "assign" } },
  { state: "remediated", label: "Remediate", who: "A person", detail: "Upload the renewed certificate; the rules recheck it.",
    button: { id: "lc-upload", label: "Upload renewed certificate (sample file)", icon: Upload, action: "upload" } },
  { state: "verified", label: "Verify", who: "Compliance Officer + rules", detail: "A named person approves; the recheck must pass.",
    button: { id: "lc-approve", label: "Approve as Compliance Officer", icon: UserCheck, action: "approve" } },
  { state: "closed", label: "Close", who: "Compliance Officer", detail: "A named human approver closes with evidence. AI cannot close." },
];

/** Finding R1, step by step: only the current step is actionable, Close is locked until approval. */
export function WorkflowPage() {
  const { state, result, baseline, dispatch } = useThreadLight();
  const f = state.finding, cur = STATES.indexOf(f.state);
  const canClose = f.state === "verified";
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});
  const prev = useRef(f.state);
  const status = (id: string) => result.requirements.find((r) => r.id === id)!.status;

  // When a step completes its button disables; move focus to the next actionable control.
  useEffect(() => {
    if (prev.current === f.state) return;
    prev.current = f.state;
    const next = { assigned: "lc-upload", remediated: "lc-approve", verified: "lc-close", closed: "lc-reset" }[f.state as string];
    if (next) btns.current[next]?.focus();
  }, [f.state]);

  const tone = state.message?.tone;

  return (
    <>
      <PageHeader back={{ to: "/actions", label: "Actions" }} eyebrow="Resolve" title="Finding R1 workflow"
        description="Strictly in order. Only a person can assign, approve or close. The rules recheck after every upload."
        actions={<Button id="lc-reset" ref={(el) => { btns.current["lc-reset"] = el; }} variant="dashed" size="sm" onClick={() => dispatch({ type: "reset" })} icon={<RotateCcw size={15} aria-hidden="true" />}>Reset to baseline</Button>} />

      <p id="lc-msg" aria-live="polite" tabIndex={-1}
        className={cx("mb-6 min-h-[52px] rounded-2xl px-5 py-3.5 text-sm",
          tone === "blocked" ? "border border-gap/30 border-l-4 border-l-gap bg-gap-bg" : tone === "ok" ? "border border-ok/30 border-l-4 border-l-ok bg-ok-bg" : "border border-line bg-surface")}>
        {state.message?.text ?? "Work through the steps below. The current step is highlighted."}
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Steps">
          <ol aria-label="Lifecycle steps" className="relative">
            {STEPS.map((st, i) => {
              const done = i < cur, now = i === cur, nextUp = i === cur + 1;
              const Icon = st.button?.icon;
              return (
                <li key={st.state} data-testid={now ? "lc-current" : undefined} aria-current={now ? "step" : undefined}
                  className="relative flex gap-4 pb-6 last:pb-0">
                  {i < STEPS.length - 1 && <span aria-hidden="true" className={cx("absolute left-[15px] top-9 h-[calc(100%-28px)] w-0.5", i < cur ? "bg-thread" : "bg-line")} />}
                  <span aria-hidden="true" className={cx("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 font-mono text-xs font-semibold",
                    now ? "border-thread bg-thread text-thread-on ring-4 ring-thread/15" : done ? "border-thread bg-thread-soft text-thread-strong" : "border-line bg-surface text-ink-3")}>
                    {done ? <Check size={15} strokeWidth={3} /> : i + 1}
                  </span>
                  <div className={cx("min-w-0 flex-1 rounded-xl p-3 -mt-1.5", nextUp && "bg-surface-2/70")}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span data-label className={cx("font-semibold", now ? "text-thread-strong" : !done && "text-ink-2")}>{st.label}</span>
                      <span className="text-xs text-ink-3">{st.who}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">{st.detail}</p>
                    {st.button && Icon && i > cur && (
                      <Button id={st.button.id} ref={(el) => { btns.current[st.button!.id] = el; }} className="mt-3" size="sm"
                        variant={nextUp ? "primary" : "secondary"} disabled={!nextUp || (st.state === "remediated" && state.data.documents.some((d) => d.id === "D1-renewal"))}
                        onClick={() => dispatch({ type: st.button!.action } as Action)} icon={<Icon size={15} aria-hidden="true" />}>
                        {st.button.label}
                      </Button>
                    )}
                    {st.button && i <= cur && i > 0 && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ok"><Check size={13} strokeWidth={3} aria-hidden="true" />Done</p>}
                    {st.state === "closed" && (
                      // aria-disabled (not disabled) so an early click can explain why Close is locked.
                      <Button id="lc-close" ref={(el) => { btns.current["lc-close"] = el; }} className="mt-3" size="sm"
                        variant={canClose ? "primary" : "secondary"} aria-disabled={!canClose} onClick={() => dispatch({ type: "close" })}
                        icon={canClose || f.state === "closed" ? <ShieldCheck size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}>
                        {f.state === "closed" ? "Finding closed" : "Close finding"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="grid gap-6 lg:sticky lg:top-32">
          <Panel title="Live recheck" description="The rules re-run after every change.">
            <ul className="grid gap-2.5">
              {["R1", "R5"].map((id) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                  <Mono className="font-semibold">{id}</Mono><StatusPill status={status(id)} />
                </li>
              ))}
              <li className="mt-1 flex items-baseline justify-between border-t border-line pt-3 text-sm">
                <span className="text-ink-2">Coverage</span>
                <span><strong className="text-lg tabular-nums">{result.scores.coverage}%</strong>
                  <span className="ml-1 text-xs text-ink-3">baseline {baseline.scores.coverage}%</span></span>
              </li>
            </ul>
          </Panel>

          <Panel title="History">
            <ol id="lc-history" className="grid gap-2.5 border-l border-line pl-4 text-[13px] text-ink-2">
              {f.history.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-[6px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-thread" aria-hidden="true" />
                  <span className="font-medium capitalize text-ink">{h.state}</span> &middot; {h.actor === "human" ? h.approver || "a person (you)" : "rules engine"}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
