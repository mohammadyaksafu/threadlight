import { ArrowRight, Eye, EyeOff, Info, LogIn, Server, ShieldCheck, UserCog, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ACCOUNTS, type Account } from "@/auth/accounts";
import { useSession, type Mode } from "@/auth/SessionProvider";
import { LIVE_AVAILABLE } from "@/api/client";
import { Logo } from "@/components/layout/Sidebar";
import { Button, Mono, cx } from "@/components/ui";
import { ThreadCanvas } from "@/components/fx/ThreadCanvas";

const ROLE_ICON = { officer: ShieldCheck, staff: UserCog, guest: UserRound };

/** Demo sign-in with public, throw-away accounts. Not real authentication (see the notice). */
export function LoginPage() {
  const { user, signIn, mode, setMode } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const go = async (em: string, pw: string) => {
    setBusy(true);
    const err = await signIn(em, pw);
    setBusy(false);
    setError(err);
    if (!err) navigate(next, { replace: true });
  };
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    void go(email, password);
  };
  const use = (a: Account) => {
    setEmail(a.email); setPassword(a.password);
    void go(a.email, a.password);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel */}
      <section className="aurora relative hidden overflow-hidden bg-side p-12 text-side-ink lg:flex lg:flex-col">
        <svg className="pointer-events-none absolute -bottom-10 -left-20 h-[420px] w-[760px] text-side-ink/[0.06]" viewBox="0 0 760 420" fill="none" aria-hidden="true">
          <path pathLength={1} className="thread-draw" d="M0 330 C 170 60, 330 470, 510 190 S 720 70, 760 120" stroke="currentColor" strokeWidth="30" strokeLinecap="round" />
        </svg>
        <ThreadCanvas variant="weave" />
        <div className="relative flex items-center gap-3 motion-safe:animate-rise-in">
          <Logo size={40} />
          <div>
            <div className="text-2xl font-extrabold tracking-tight">ThreadLight</div>
            <div className="text-sm text-side-ink-2">Verified Evidence Passport</div>
          </div>
        </div>
        <div className="relative mt-auto max-w-md motion-safe:animate-rise-in motion-safe:[animation-delay:.25s]">
          <h1 className="text-[40px] font-extrabold leading-[1.08] tracking-tight">Evidence you can verify, before the auditor asks.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-side-ink-2">
            A garment factory 30 days before a buyer audit. Rules check every certificate against the audit date, flag records that
            disagree, and only a named person can close a finding.
          </p>
          <p className="mt-8 font-mono text-xs uppercase tracking-[0.14em] text-side-ink-2">Synthetic data &middot; {LIVE_AVAILABLE ? "live AI pipeline or offline demo" : "offline demo, no AI calls"}</p>
        </div>
      </section>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md motion-safe:animate-rise-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-side"><Logo size={30} /></span>
            <div className="text-xl font-extrabold tracking-tight">ThreadLight</div>
          </div>
          <h2 className="text-[26px] font-bold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-ink-2">Pick a demo role below, or type its credentials.</p>

          {LIVE_AVAILABLE && (
            <div role="radiogroup" aria-label="Data source" className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
              {(["live", "offline"] as Mode[]).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} id={`mode-${m}`} onClick={() => setMode(m)}
                  className={cx("inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg text-sm font-semibold",
                    mode === m ? "bg-thread text-thread-on shadow-sm" : "text-ink-2 hover:bg-surface-2")}>
                  {m === "live" ? <Server size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}
                  {m === "live" ? "Live API" : "Offline demo"}
                </button>
              ))}
            </div>
          )}

          {mode === "live" ? (
            <p role="note" className="mt-5 flex gap-2.5 rounded-xl border border-thread/30 bg-thread-soft px-4 py-3 text-[13px] text-ink">
              <Server size={16} className="mt-0.5 shrink-0 text-thread" aria-hidden="true" />
              <span><strong>Live mode.</strong> You sign in to the ThreadLight API (JWT, roles enforced on the server, data isolated per
                factory group). Uploads go through OCR, Gemini extraction, retrieval and the rules engine. The demo accounts below are
                public and the data is synthetic.</span>
            </p>
          ) : (
            <p role="note" className="mt-5 flex gap-2.5 rounded-xl border border-insuf/30 bg-insuf-bg px-4 py-3 text-[13px] text-ink">
              <Info size={16} className="mt-0.5 shrink-0 text-insuf" aria-hidden="true" />
              <span><strong>Offline demo, not real authentication.</strong> These accounts are public, checked in your browser, and only decide
                which demo buttons you can use. All data is synthetic{LIVE_AVAILABLE ? "; switch to Live API for the real backend." : "."}</span>
            </p>
          )}

          <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                className="min-h-[44px] rounded-xl border border-line bg-surface px-3.5 text-[15px] shadow-sm outline-none focus:border-thread focus:ring-4 focus:ring-thread/15"
                placeholder="officer@threadlight.demo" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Password
              <span className="relative">
                <input id="login-password" type={show ? "text" : "password"} autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-line bg-surface px-3.5 pr-11 text-[15px] shadow-sm outline-none focus:border-thread focus:ring-4 focus:ring-thread/15" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
                  {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </span>
            </label>
            {error && <p id="login-error" role="alert" className="rounded-lg bg-gap-bg px-3 py-2 text-sm text-gap">{error}</p>}
            <Button id="login-submit" type="submit" variant="primary" className="justify-center" disabled={busy} icon={<LogIn size={16} aria-hidden="true" />}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>

          <div className="mt-8">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Demo accounts</h3>
            <ul className="mt-3 grid gap-2.5">
              {ACCOUNTS.map((a) => {
                const Icon = ROLE_ICON[a.role];
                return (
                  <li key={a.role}>
                    <button type="button" id={`login-as-${a.role}`} onClick={() => use(a)}
                      className={cx("group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left shadow-sm",
                        "lift hover:border-thread/50")}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-thread-soft text-thread-strong motion-safe:transition-transform motion-safe:group-hover:scale-110"><Icon size={19} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{a.title}</span>
                        <span className="block text-xs text-ink-2">{a.summary}</span>
                        <span className="mt-1 block truncate text-[11.5px] text-ink-3"><Mono>{a.email}</Mono> &middot; <Mono>{a.password}</Mono></span>
                      </span>
                      <ArrowRight size={17} className="shrink-0 text-ink-3 motion-safe:transition-transform group-hover:translate-x-1 group-hover:text-thread" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
