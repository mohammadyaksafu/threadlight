import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type Dispatch, type ReactNode } from "react";
import { analyze, type Result } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { api, FACTORY_ID } from "@/api/client";
import { useSession } from "@/auth/SessionProvider";
import { initialState, reducer, type Action, type AppState } from "./reducer";

interface Ctx {
  state: AppState;
  /** Engine result for the current file set, recomputed whenever the data changes. */
  result: Result;
  /** Engine result for the untouched sample, used for before/after deltas. */
  baseline: Result;
  dispatch: Dispatch<Action>;
  /** Live mode: where the current data came from, and a way to fetch it again after an upload or approval. */
  source: { kind: "sample" | "live"; loadedAt?: string; error?: string };
  reload: () => Promise<void>;
}

const ThreadLightContext = createContext<Ctx | null>(null);
const BASELINE = analyze(SAMPLE);

export function ThreadLightProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { mode, apiUser } = useSession();
  const [source, setSource] = useState<Ctx["source"]>({ kind: "sample" });
  const live = mode === "live" && !!apiUser;

  const reload = useCallback(async () => {
    if (!live) return;
    try {
      dispatch({ type: "load", data: await api.dataset(FACTORY_ID) });
      setSource({ kind: "live", loadedAt: new Date().toISOString() });
    } catch (e) {
      setSource({ kind: "live", error: (e as Error).message });
    }
  }, [live]);

  useEffect(() => {
    if (live) void reload();
    else { dispatch({ type: "reset" }); setSource({ kind: "sample" }); }
  }, [live, reload]);

  const result = useMemo(() => analyze(state.data), [state.data]);
  const value = useMemo(() => ({ state, result, baseline: BASELINE, dispatch, source, reload }), [state, result, source, reload]);
  return <ThreadLightContext.Provider value={value}>{children}</ThreadLightContext.Provider>;
}

export function useThreadLight(): Ctx {
  const ctx = useContext(ThreadLightContext);
  if (!ctx) throw new Error("useThreadLight must be used inside <ThreadLightProvider>");
  return ctx;
}
