// Finding lifecycle, TypeScript port of threadlight/lifecycle.py, written as pure functions so
// React state stays immutable. detected > explained > assigned > remediated > verified > closed,
// strictly sequential. Only a human assigns; remediation needs evidence; verification needs a
// passing recheck; closing needs a human actor, a named approver and evidence. AI can never close.

export const STATES = ["detected", "explained", "assigned", "remediated", "verified", "closed"] as const;
export type LifecycleState = (typeof STATES)[number];
export type Actor = "human" | "ai" | "system";

export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleError";
  }
}

export interface HistoryEntry { state: LifecycleState; actor: Actor; approver: string | null }

export interface Finding {
  readonly id: string;
  readonly requirement: string | null;
  readonly state: LifecycleState;
  readonly evidence: readonly string[];
  readonly approver: string | null;
  readonly history: readonly HistoryEntry[];
}

export interface AdvanceOptions {
  actor: Actor;
  approver?: string | null;
  evidence?: string[];
  recheckPassed?: boolean;
}

export function createFinding(id: string, requirement: string | null = null): Finding {
  return { id, requirement, state: "detected", evidence: [], approver: null, history: [{ state: "detected", actor: "system", approver: null }] };
}

export function nextState(f: Finding): LifecycleState | null {
  const i = STATES.indexOf(f.state);
  return i + 1 < STATES.length ? STATES[i + 1] : null;
}

/** Returns the advanced finding, or throws LifecycleError if a rule forbids the move. */
export function advance(f: Finding, to: LifecycleState, opts: AdvanceOptions): Finding {
  const { actor, approver = null, evidence = [], recheckPassed = false } = opts;
  if (!["human", "ai", "system"].includes(actor)) throw new LifecycleError(`Unknown actor ${actor}.`);
  if (!STATES.includes(to)) throw new LifecycleError(`Unknown state ${to}.`);
  if (to !== nextState(f)) throw new LifecycleError(`Cannot move from ${f.state} to ${to}; the next state is ${nextState(f)}.`);
  if (to === "assigned" && actor !== "human") throw new LifecycleError("Only a human can assign a finding.");
  if (to === "remediated" && !evidence.length) throw new LifecycleError("Remediation needs evidence.");
  if (to === "verified" && !recheckPassed) throw new LifecycleError("Verification needs a passing recheck.");
  if (to === "closed") {
    if (actor !== "human") throw new LifecycleError("AI cannot close this finding; a named human approver must close it.");
    if (!approver) throw new LifecycleError("Closing needs a named approver.");
    if (!(evidence.length || f.evidence.length)) throw new LifecycleError("Closing needs evidence.");
  }
  return {
    ...f,
    state: to,
    evidence: [...f.evidence, ...evidence],
    approver: to === "closed" ? approver : f.approver,
    history: [...f.history, { state: to, actor, approver }],
  };
}
