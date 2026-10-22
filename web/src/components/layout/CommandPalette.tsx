import { CornerDownLeft, FileText, Languages, ListChecks, RotateCcw, Search, Workflow, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "@/nav";
import { useThreadLight } from "@/store/ThreadLightProvider";
import { STATUS } from "@/lib/vocab";
import { StatusIcon, cx } from "@/components/ui";

interface Command {
  id: string; group: string; label: string; hint?: string; icon?: LucideIcon; status?: keyof typeof STATUS;
  keywords?: string; run: () => void;
}

/** Ctrl/Cmd+K (or "/") jump-to anything: pages, requirements, documents and demo actions. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, result, dispatch } = useThreadLight();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to);
    return [
      ...NAV_ITEMS.map((n) => ({ id: `page-${n.id}`, group: "Pages", label: n.label, icon: n.icon, hint: n.shortcut ? `Key ${n.shortcut}` : undefined, run: go(n.to) })),
      { id: "page-alerts", group: "Pages", label: "Integrity alerts", icon: ListChecks, keywords: "contradiction findings", run: go("/findings/alerts") },
      { id: "page-workflow", group: "Pages", label: "Finding R1 workflow", icon: Workflow, keywords: "approve close lifecycle", run: go("/actions/workflow") },
      ...result.requirements.map((r) => ({
        id: `req-${r.id}`, group: "Requirements", label: `${r.id} ${r.title}`, hint: `Clause ${r.clause}`, status: r.status,
        keywords: `${STATUS[r.status].en} ${r.department}`, run: go(`/requirements/${r.id}`),
      })),
      ...state.data.documents.map((d) => ({
        id: `doc-${d.id}`, group: "Documents", label: `${d.id} ${d.title}`, hint: d.ref, icon: FileText, keywords: d.type, run: go(`/documents/${d.id}`),
      })),
      { id: "act-bangla", group: "Actions", label: "Show the report in Bangla", icon: Languages, keywords: "bn language translate",
        run: () => { dispatch({ type: "lang", lang: "bn" }); navigate("/report"); } },
      { id: "act-reset", group: "Actions", label: "Reset demo to baseline", icon: RotateCcw, keywords: "restart clear", run: () => dispatch({ type: "reset" }) },
    ];
  }, [result.requirements, state.data.documents, navigate, dispatch]);

  const q = query.trim().toLowerCase();
  const matches = q ? commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q)) : commands;

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement;
    setQuery(""); setActive(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => returnFocus.current?.focus?.();
  }, [open]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    document.getElementById(`cmd-${matches[active]?.id}`)?.scrollIntoView({ block: "nearest" });
  }, [active, matches]);

  if (!open) return null;

  const choose = (c: Command | undefined) => { if (!c) return; returnFocus.current = null; onClose(); c.run(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(matches[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search and jump" onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-lift motion-safe:animate-pop-in">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
          <input ref={input} id="cmd-input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={matches[active] ? `cmd-${matches[active].id}` : undefined}
            placeholder="Search pages, requirements, documents..." autoComplete="off" spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
          <kbd className="rounded-md border border-line px-1.5 font-mono text-[11px] text-ink-3">Esc</kbd>
        </div>
        <ul id="cmd-list" role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto p-2">
          {matches.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-2">No match for &ldquo;{query}&rdquo;.</li>}
          {matches.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <li key={c.id} role="presentation">
                {header && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{header}</div>}
                <div id={`cmd-${c.id}`} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => choose(c)}
                  className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm", i === active ? "bg-thread-soft text-thread-strong" : "text-ink")}>
                  {c.status ? <StatusIcon status={c.status} size={18} /> : Icon ? <Icon size={17} className="shrink-0 text-ink-3" aria-hidden="true" /> : null}
                  <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                  {c.hint && <span className="shrink-0 font-mono text-[11px] text-ink-3">{c.hint}</span>}
                  {i === active && <CornerDownLeft size={14} className="shrink-0" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-surface-2/60 px-4 py-2.5 text-[11.5px] text-ink-3">
          <span><kbd className="font-mono">↑ ↓</kbd> move</span><span><kbd className="font-mono">Enter</kbd> open</span>
          <span><kbd className="font-mono">1–7</kbd> sections</span><span><kbd className="font-mono">Ctrl K</kbd> or <kbd className="font-mono">/</kbd> search</span>
        </div>
      </div>
    </div>
  );
}
