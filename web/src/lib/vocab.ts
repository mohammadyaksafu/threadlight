// UI vocabulary: status labels (English + Bangla), status styling, alert labels and fixed copy.
// Tailwind class names are written out in full so the Tailwind compiler can find them.

import type { AlertType, ExpiryState, Status } from "@/engine";

export type Lang = "en" | "bn";

export interface StatusMeta {
  en: string;
  bn: string;
  pill: string;
  dot: string;
  stripe: string;
  text: string;
  soft: string;
}

export const STATUS: Record<Status, StatusMeta> = {
  supported: { en: "Supported", bn: "প্রমাণ সমর্থিত", pill: "border-ok/35 bg-ok-bg text-ok", dot: "bg-ok", stripe: "border-l-ok", text: "text-ok", soft: "bg-ok-bg" },
  likely_gap: { en: "Likely gap", bn: "সম্ভাব্য ঘাটতি", pill: "border-gap/35 bg-gap-bg text-gap", dot: "bg-gap", stripe: "border-l-gap", text: "text-gap", soft: "bg-gap-bg" },
  insufficient: { en: "Insufficient evidence", bn: "অপর্যাপ্ত প্রমাণ", pill: "border-insuf/35 bg-insuf-bg text-insuf", dot: "bg-insuf", stripe: "border-l-insuf", text: "text-insuf", soft: "bg-insuf-bg" },
  conflicting: { en: "Conflicting evidence", bn: "পরস্পরবিরোধী প্রমাণ", pill: "border-conf/35 bg-conf-bg text-conf", dot: "bg-conf", stripe: "border-l-conf", text: "text-conf", soft: "bg-conf-bg" },
  pending_review: { en: "Pending human review", bn: "মানব পর্যালোচনার অপেক্ষায়", pill: "border-pend/35 bg-pend-bg text-pend", dot: "bg-pend", stripe: "border-l-pend", text: "text-pend", soft: "bg-pend-bg" },
};

/** Most urgent first. */
export const STATUS_ORDER: Status[] = ["likely_gap", "insufficient", "conflicting", "pending_review", "supported"];

export const LIMITS: Record<Status, string> = {
  supported: "Shows that a dated, approved document is on file for the audit date. It does not confirm conditions on the factory floor.",
  likely_gap: "Based on the extracted date only. Confirm against the original document before acting; a newer copy may exist outside this file set.",
  insufficient: "No matching document is in this file set. The evidence may exist elsewhere; this is not a finding that the practice is missing.",
  conflicting: "Records disagree with each other. This is an evidence-integrity alert to check, not a finding of wrongdoing.",
  pending_review: "A new document was read but no person has approved it yet, so it does not count as coverage.",
};

export const ALERT_LABEL: Record<AlertType, { en: string; bn: string }> = {
  entity_mismatch: { en: "Entity name mismatch", bn: "প্রতিষ্ঠানের নামে অমিল" },
  invalid_dates: { en: "Invalid dates", bn: "তারিখে অসংগতি" },
  reference_mismatch: { en: "Reference mismatch", bn: "রেফারেন্সে অমিল" },
  missing_reference: { en: "Missing referenced document", bn: "উল্লিখিত নথি নেই" },
  closure_without_proof: { en: "Closure without proof", bn: "প্রমাণ ছাড়া সমাপ্তি" },
};

export const EXPIRY: Record<ExpiryState, { label: string; cls: string }> = {
  expired: { label: "Expired", cls: "text-gap" },
  expires_before_audit: { label: "Expires before audit", cls: "text-gap" },
  valid: { label: "Valid on audit date", cls: "text-ok" },
  no_expiry: { label: "No expiry date", cls: "text-ink-2" },
};

export interface AgentInfo { name: string; kind: "rules" | "sample"; does: string }

export const AGENTS: AgentInfo[] = [
  { name: "Requirement Intelligence", kind: "sample", does: "Clause text and evidence needs" },
  { name: "Evidence Intelligence", kind: "sample", does: "Document type, reference, dates, entity" },
  { name: "Gap Auditor", kind: "rules", does: "Dates against the audit day" },
  { name: "Contradiction Engine", kind: "rules", does: "Evidence-integrity alerts" },
  { name: "Risk and Audit Twin", kind: "rules", does: "Decision-support index, what-if" },
  { name: "Remediation Planner", kind: "rules", does: "Ranked tasks, owners, due dates" },
  { name: "Report Agent", kind: "rules", does: "Template report, English and Bangla" },
];

export const BN = {
  title: "প্রমাণ প্রস্তুতি প্রতিবেদন (খসড়া)", draft: "খসড়া", factory: "কারখানা", buyer: "ক্রেতা", framework: "আচরণবিধি",
  audit: "অডিটের তারিখ", today: "প্রতিবেদনের তারিখ (দৃশ্যপট)", coverage: "প্রমাণ কভারেজ",
  risk: "সিদ্ধান্ত-সহায়ক ঝুঁকি সূচক (অডিট স্কোর নয়)", open: "অমীমাংসিত বিষয়",
  how: "এই প্রতিবেদন নির্ধারিত নিয়ম ও টেমপ্লেট দিয়ে তৈরি। কোনো ভাষা মডেল ব্যবহার করা হয়নি। সব তথ্য কৃত্রিম (সিনথেটিক)।",
  verified: "যাচাইকৃত", open_h: "অমীমাংসিত (নিশ্চিত নয়)", none_verified: "এখনো কোনো যাচাইকৃত বিষয় নেই।",
  alerts: "প্রমাণ-সংগতি সতর্কতা", source: "উৎস", page: "পৃষ্ঠা", conf: "তথ্য আহরণের আস্থা", sample: "নমুনা",
  nosource: "ফাইলে কোনো নথি নেই",
  footer: "মানব পর্যালোচনার জন্য খসড়া। এটি অডিটের ফলাফল নয়।",
  note: "বাংলা লেখা টেমপ্লেট থেকে তৈরি; ব্যবহারের আগে একজন বাংলাভাষী পর্যালোচক দিয়ে যাচাই করুন।",
} as const;

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
export const pct = (x: number): number => Math.round(x * 100);
