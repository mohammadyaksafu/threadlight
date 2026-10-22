// Sidebar navigation: groups, order and 1-7 keyboard shortcuts. Pair each entry with a route in routes.tsx.

import {
  ClipboardCheck, FileBarChart2, FileText, LayoutDashboard, ListChecks, Network, ShieldAlert, SlidersHorizontal, type LucideIcon,
} from "lucide-react";

export interface NavItem { id: string; to: string; label: string; icon: LucideIcon; shortcut?: string }
export interface NavGroup { label: string | null; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: null, items: [{ id: "overview", to: "/", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Evidence",
    items: [
      { id: "documents", to: "/documents", label: "Documents", icon: FileText, shortcut: "1" },
      { id: "requirements", to: "/requirements", label: "Requirements", icon: ListChecks, shortcut: "2" },
      { id: "graph", to: "/graph", label: "Evidence graph", icon: Network, shortcut: "3" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { id: "findings", to: "/findings", label: "Findings", icon: ShieldAlert, shortcut: "4" },
      { id: "simulate", to: "/simulate", label: "Simulate", icon: SlidersHorizontal, shortcut: "5" },
    ],
  },
  {
    label: "Resolve",
    items: [
      { id: "actions", to: "/actions", label: "Actions", icon: ClipboardCheck, shortcut: "6" },
      { id: "report", to: "/report", label: "Report", icon: FileBarChart2, shortcut: "7" },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);
