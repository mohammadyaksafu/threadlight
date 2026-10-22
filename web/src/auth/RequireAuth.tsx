import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "./SessionProvider";

/** Sends visitors without a demo session to /login, then back to where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { pathname, search } = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  return <>{children}</>;
}
