import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ACCOUNTS, accountFor, type Account, type Role } from "./accounts";

const KEY = "tl-session";

interface SessionCtx {
  user: Account | null;
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string) => string | null;
  signOut: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

function readStored(): Account | null {
  try {
    const role = sessionStorage.getItem(KEY) as Role | null;
    return role && ACCOUNTS.some((a) => a.role === role) ? accountFor(role) : null;
  } catch {
    return null;
  }
}

/** Demo session kept in sessionStorage (this tab only). Not real authentication. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(readStored);

  const signIn = useCallback((email: string, password: string) => {
    const acc = ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!acc || acc.password !== password) return "Email or password does not match a demo account.";
    try { sessionStorage.setItem(KEY, acc.role); } catch { /* storage blocked: keep the session in memory */ }
    setUser(acc);
    return null;
  }, []);

  const signOut = useCallback(() => {
    try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
