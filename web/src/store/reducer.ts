// App state as a pure reducer. The engine result is derived (see ThreadLightProvider), never stored,
// so every view always reflects the current file set.

import {
  addRenewal, advance, analyze, approveDocument, clone, createFinding, type Data, type Finding, type Result,
} from "@/engine";
import { APPROVER, D1_ORIGINAL, SAMPLE, SIM_MAX, SIM_MIN } from "@/data/sample";
import { STATUS, type Lang } from "@/lib/vocab";

export interface Selection { kind: "doc" | "req"; id: string }
export type Tone = "neutral" | "ok" | "blocked";

export interface AppState {
  data: Data;
  finding: Finding;
  selection: Selection | null;
  simDate: string;
  lang: Lang;
  message: { text: string; tone: Tone } | null;
}

export type Action =
  | { type: "assign" }
  | { type: "upload" }
  | { type: "approve" }
  | { type: "close" }
  | { type: "reset" }
  | { type: "select"; selection: Selection }
  | { type: "simDate"; date: string }
  | { type: "lang"; lang: Lang };

export function initialState(): AppState {
  return {
    data: clone(SAMPLE),
    finding: advance(createFinding("F-R1", "R1"), "explained", { actor: "system" }),
    selection: null,
    simDate: D1_ORIGINAL,
    lang: "en",
    message: null,
  };
}

const statusOf = (r: Result, id: string): string => STATUS[r.requirements.find((x) => x.id === id)!.status].en.toLowerCase();

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "assign":
      return {
        ...state,
        finding: advance(state.finding, "assigned", { actor: "human" }),
        message: { text: "Assigned to Safety & Maintenance by a person. Next: upload the renewed certificate.", tone: "neutral" },
      };

    case "upload": {
      const before = analyze(state.data).scores.coverage;
      const data = addRenewal(state.data, false);
      const r = analyze(data), rn = data.renewal;
      return {
        ...state, data,
        finding: advance(state.finding, "remediated", { actor: "human", evidence: [rn.id] }),
        message: {
          tone: "neutral",
          text: `Rules re-ran on the new file ${rn.ref} (valid until ${rn.valid_until}). R1 is now ${statusOf(r, "R1")} and R5 is now ${statusOf(r, "R5")}: ` +
            `the renewal is a sample extraction that no person has approved yet. Coverage stays at ${r.scores.coverage}% (was ${before}%).`,
        },
      };
    }

    case "approve": {
      const before = analyze(state.data).scores.coverage;
      const data = approveDocument(state.data, "D1-renewal");
      const r = analyze(data);
      const passed = r.requirements.find((x) => x.id === "R1")!.status === "supported";
      try {
        return {
          ...state, data,
          finding: advance(state.finding, "verified", { actor: "system", recheckPassed: passed }),
          message: {
            tone: "ok",
            text: `Approved by ${APPROVER}. Recheck passed: R1 and R5 are ${statusOf(r, "R5")}. Coverage ${before}% → ${r.scores.coverage}%. Close is now unlocked for a named person.`,
          },
        };
      } catch (e) {
        return { ...state, data, message: { tone: "blocked", text: `Recheck did not pass: ${(e as Error).message}` } };
      }
    }

    case "close": {
      const f = state.finding;
      if (f.state === "closed") return state;
      if (f.state !== "verified") {
        let rule = "";
        try { advance(f, "closed", { actor: "ai" }); } catch (e) { rule = (e as Error).message; }
        return {
          ...state,
          message: {
            tone: "blocked",
            text: `AI cannot close this finding. Close stays locked until a named person approves as Compliance Officer and the recheck passes. Lifecycle rule: ${rule}`,
          },
        };
      }
      return {
        ...state,
        finding: advance(f, "closed", { actor: "human", approver: APPROVER }),
        message: { tone: "ok", text: `Closed by ${APPROVER} with evidence D1-renewal. The finding history records who approved it.` },
      };
    }

    case "reset":
      return { ...initialState(), lang: state.lang };

    case "select": {
      const same = state.selection?.kind === action.selection.kind && state.selection.id === action.selection.id;
      return { ...state, selection: same ? null : action.selection };
    }

    case "simDate": {
      const d = action.date < SIM_MIN ? SIM_MIN : action.date > SIM_MAX ? SIM_MAX : action.date;
      return { ...state, simDate: d };
    }

    case "lang":
      return { ...state, lang: action.lang };
  }
}
