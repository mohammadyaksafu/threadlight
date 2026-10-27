import { Server } from "lucide-react";
import type { ReactNode } from "react";
import { LIVE_AVAILABLE } from "@/api/client";
import { useSession } from "@/auth/SessionProvider";
import { Panel } from "@/components/ui/page";

/** Pages that need the backend. In the offline demo they explain where the live system is instead. */
export function LiveOnly({ children }: { children: ReactNode }) {
  const { mode, apiUser } = useSession();
  if (mode === "live" && apiUser) return <>{children}</>;
  return (
    <Panel title={<span className="flex items-center gap-2"><Server size={18} aria-hidden="true" />Needs the live API</span>}>
      <p className="text-sm text-ink-2">
        This page talks to the ThreadLight backend (upload, OCR, Gemini extraction, review queue).
        {LIVE_AVAILABLE
          ? " Sign out and choose “Live API” on the sign-in page."
          : " This copy is the static offline demo (GitHub Pages). The live system runs on the VPS; see the System page for its address."}
      </p>
    </Panel>
  );
}
