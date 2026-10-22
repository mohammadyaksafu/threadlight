// Demo accounts for judges. NOT real authentication: these credentials are public, checked in the
// browser, and guard nothing but which demo buttons are enabled. Real auth is listed as Planned.

export type Role = "officer" | "staff" | "guest";
export type Permission = "assign" | "upload" | "approve" | "close" | "reset";

export interface Account {
  role: Role;
  name: string;
  title: string;
  email: string;
  password: string;
  summary: string;
  can: Permission[];
}

export const ACCOUNTS: Account[] = [
  {
    role: "officer", name: "Compliance Officer (synthetic)", title: "Compliance Officer",
    email: "officer@threadlight.demo", password: "Officer-Demo-2026",
    summary: "Full workflow: assign, upload, approve and close findings.",
    can: ["assign", "upload", "approve", "close", "reset"],
  },
  {
    role: "staff", name: "Factory staff (synthetic)", title: "Factory staff",
    email: "staff@threadlight.demo", password: "Staff-Demo-2026",
    summary: "Can assign and upload evidence; cannot approve or close.",
    can: ["assign", "upload", "reset"],
  },
  {
    role: "guest", name: "Guest viewer", title: "Guest (read-only)",
    email: "guest@threadlight.demo", password: "Guest-Demo-2026",
    summary: "Read-only: browse every page, no workflow actions.",
    can: ["reset"],
  },
];

export const accountFor = (role: Role): Account => ACCOUNTS.find((a) => a.role === role)!;
export const can = (role: Role | undefined, p: Permission): boolean => !!role && accountFor(role).can.includes(p);
