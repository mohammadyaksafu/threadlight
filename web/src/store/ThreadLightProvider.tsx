import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { analyze, type Result } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { initialState, reducer, type Action, type AppState } from "./reducer";

interface Ctx {
  state: AppState;
  /** Engine result for the current file set, recomputed whenever the data changes. */
  result: Result;
  /** Engine result for the untouched sample, used for before/after deltas. */
  baseline: Result;
  dispatch: Dispatch<Action>;
}

const ThreadLightContext = createContext<Ctx | null>(null);
const BASELINE = analyze(SAMPLE);

export function ThreadLightProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const result = useMemo(() => analyze(state.data), [state.data]);
  const value = useMemo(() => ({ state, result, baseline: BASELINE, dispatch }), [state, result]);
  return <ThreadLightContext.Provider value={value}>{children}</ThreadLightContext.Provider>;
}

export function useThreadLight(): Ctx {
  const ctx = useContext(ThreadLightContext);
  if (!ctx) throw new Error("useThreadLight must be used inside <ThreadLightProvider>");
  return ctx;
}
