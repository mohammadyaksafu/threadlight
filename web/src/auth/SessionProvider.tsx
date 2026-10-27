import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ACCOUNTS, accountFor, type Account, type Role } from "./accounts";
import { api, LIVE_AVAILABLE, setToken, type ApiUser } from "@/api/client";

const KEY = "tl-session";
const MODE_KEY = "tl-mode";

export type Mode = "live" | "offline";

interface SessionCtx {
  user: Account | null;
  mode: Mode;
  /** In live mode, the user as the API knows them. */
  apiUser: ApiUser | null;
  setMode: (m: Mode) => void;
  /** Resolves to an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

const ROLE_FROM_API: Record<ApiUser["role"], Role> = { officer: "officer", staff: "staff", viewer: "guest", auditor: "guest" };

function read<T>(key: string, parse: (s: string) => T | null): T | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? parse(v) : null;
  } catch {
    return null;
  }
}

function readStored(): { user: Account | null; apiUser: ApiUser | null } {
  const stored = read(KEY, (s) => JSON.parse(s) as { role: Role; apiUser?: ApiUser });
  if (!stored || !ACCOUNTS.some((a) => a.role === stored.role)) return { user: null, apiUser: null };
  return { user: accountFor(stored.role), apiUser: stored.apiUser ?? null };
}

/**
 * Two modes. Offline demo: public demo accounts checked in the browser (not authentication).
 * Live: the same accounts are real users in the API; sign-in returns a JWT and the server enforces roles.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readStored);
  const [mode, setModeState] = useState<Mode>(() => {
    if (!LIVE_AVAILABLE) return "offline";
    return (read(MODE_KEY, (s) => (s === "offline" ? "offline" : "live")) ?? "live") as Mode;
  });

  const setMode = useCallback((m: Mode) => {
    try { sessionStorage.setItem(MODE_KEY, m); } catch { /* storage blocked */ }
    setModeState(LIVE_AVAILABLE ? m : "offline");
  }, []);

  const keep = (user: Account, apiUser: ApiUser | null) => {
    try { sessionStorage.setItem(KEY, JSON.stringify({ role: user.role, apiUser })); } catch { /* keep in memory */ }
    setState({ user, apiUser });
  };

  const signIn = useCallback(async (email: string, password: string) => {
    if (mode === "live") {
      try {
        const r = await api.login(email.trim(), password);
        setToken(r.access_token, r.refresh_token);
        keep({ ...accountFor(ROLE_FROM_API[r.user.role]), name: r.user.name, email: email.trim() }, r.user);
        return null;
      } catch (e) {
        return `Live sign-in failed: ${(e as Error).message}`;
      }
    }
    const acc = ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!acc || acc.password !== password) return "Email or password does not match a demo account.";
    keep(acc, null);
    return null;
  }, [mode]);

  const signOut = useCallback(() => {
    try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
    setToken(null);
    setState({ user: null, apiUser: null });
  }, []);

  const value = useMemo(() => ({ user: state.user, apiUser: state.apiUser, mode, setMode, signIn, signOut }),
    [state, mode, setMode, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
