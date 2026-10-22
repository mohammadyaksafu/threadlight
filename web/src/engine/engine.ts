// ThreadLight rules engine, TypeScript port of threadlight/engine.py.
// Deterministic. No language-model, OCR or network calls. Runs in the browser and in Node.
// tests/parity.py loads this file directly in Node (type stripping) and compares it with the
// Python engine, so keep it free of runtime imports and non-erasable TypeScript syntax.

import type {
  Alert, Check, CheckCode, Data, Doc, Edge, ExpiryState, RequirementResult, RequirementSpec, Result, Status, Task,
} from "./types";

export const PENALTY: Record<Status, number> = {
  supported: 0.0, likely_gap: 1.0, insufficient: 0.8, conflicting: 0.7, pending_review: 0.4,
};
const GAP_CODES: CheckCode[] = ["expired", "expires_before_audit", "too_old"];

// ---------------------------------------------------------------- helpers

export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function addDays(iso: string, n: number): string {
  return new Date((dayNumber(iso) + n) * 86400000).toISOString().slice(0, 10);
}

export const roundHalfUp = (x: number): number => Math.floor(x + 0.5);
const capitalize = (s: string): string => s.slice(0, 1).toUpperCase() + s.slice(1);
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function normalizeEntity(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  return s.split(/\s+/).filter(Boolean).map((w) => (w === "limited" ? "ltd" : w)).join(" ");
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1.0;
  return 1 - levenshtein(a, b) / longest;
}

export function expiryState(doc: Doc, today: string, auditDate: string): ExpiryState {
  const vu = doc.valid_until;
  if (!vu) return "no_expiry";
  if (vu < today) return "expired";
  if (vu < auditDate) return "expires_before_audit";
  return "valid";
}

export function typeLabel(data: Data, t: string): string {
  const info = (data.evidence_types || {})[t];
  return info ? info.label : t.replace(/_/g, " ");
}

function activeDocuments(data: Data): Doc[] {
  const superseded = new Set(data.documents.filter((d) => d.supersedes).map((d) => d.supersedes));
  return data.documents.filter((d) => !superseded.has(d.id));
}

// Latest valid_until (or issued when there is no expiry); ties broken by id.
function pickDocument(candidates: Doc[]): Doc {
  let best: Doc | null = null;
  for (const d of candidates) {
    if (best === null) { best = d; continue; }
    const k = d.valid_until || d.issued, bk = best.valid_until || best.issued;
    if (k > bk || (k === bk && d.id < best.id)) best = d;
  }
  return best as Doc;
}

// ---------------------------------------------------------------- checks

type FullCheck = Check & { reason: string };

function checkNeed(data: Data, req: RequirementSpec, t: string, docs: Doc[]): FullCheck {
  const today = data.today, audit = data.audit_date;
  const label = typeLabel(data, t);
  const candidates = docs.filter((d) => d.type === t);
  if (!candidates.length) {
    return { type: t, doc: null, code: "missing", state: null, ok: false, reason: `No ${label} found in the file set.` };
  }
  const d = pickDocument(candidates);
  const state = expiryState(d, today, audit);
  const head = `${d.id} ${label} (${d.ref})`;
  const maxAge = (req.max_age_days || {})[t];
  const age = dayNumber(audit) - dayNumber(d.issued);
  let code: CheckCode, reason: string;
  if (state === "expired") {
    code = "expired"; reason = `${head} expired on ${d.valid_until}.`;
  } else if (state === "expires_before_audit") {
    code = "expires_before_audit"; reason = `${head} expires on ${d.valid_until}, before the audit on ${audit}.`;
  } else if (maxAge !== undefined && maxAge !== null && age > maxAge) {
    code = "too_old"; reason = `${head} was issued ${age} days before the audit; the limit is ${maxAge} days.`;
  } else if (state === "no_expiry") {
    code = "ok"; reason = `${head} is on file (no expiry date).`;
  } else {
    code = "ok"; reason = `${head} is valid until ${d.valid_until}, covering the audit on ${audit}.`;
  }
  return { type: t, doc: d.id, code, state, ok: code === "ok", reason };
}

function buildAlerts(data: Data, docs: Doc[], chosenByReq: { id: string; ids: string[] }[]): Alert[] {
  const today = data.today;
  const factoryNorm = normalizeEntity(data.factory);
  const raw: Omit<Alert, "id">[] = [];
  const linked = (docId: string) => chosenByReq.filter((x) => x.ids.includes(docId)).map((x) => x.id);

  for (const d of docs) {
    const src = `${d.source.file} p${d.source.page}`;
    const ent = normalizeEntity(d.entity);
    if (ent !== factoryNorm) {
      const sim = similarity(ent, factoryNorm);
      const pct = roundHalfUp(sim * 100);
      const close = sim >= 0.9;
      const note = close ? `possible spelling variant, similarity ${pct}%` : `similarity ${pct}%`;
      raw.push({
        type: "entity_mismatch", severity: close ? "medium" : "high", subject: [d.id], related: [],
        requirements: linked(d.id),
        message: `${d.id} names the entity "${d.entity}", which differs from the factory name "${data.factory}" (${note}).`,
        verify: `Compare the entity name on ${src} with the registered factory name; request a corrected document from the issuer if it is wrong.`,
      });
    }
    const problems: string[] = [];
    if (d.valid_until && d.issued > d.valid_until) problems.push(`issue date ${d.issued} is after expiry date ${d.valid_until}`);
    if (d.issued > today) problems.push(`issue date ${d.issued} is after today (${today})`);
    if (problems.length) {
      raw.push({
        type: "invalid_dates", severity: "high", subject: [d.id], related: [], requirements: linked(d.id),
        message: `${d.id} has inconsistent dates: ${problems.join("; ")}.`,
        verify: `Check the dates on ${src}; the extraction may have misread them.`,
      });
    }
    for (const cite of d.cites || []) {
      const label = typeLabel(data, cite.of_type);
      const sameType = docs.filter((c) => c.type === cite.of_type);
      if (!sameType.length) {
        raw.push({
          type: "missing_reference", severity: "medium", subject: [d.id], related: [], requirements: linked(d.id),
          message: `${d.id} cites ${cite.ref} (${label}), but no ${label} is on file.`,
          verify: `Upload the cited ${label} or correct the reference in ${src}.`,
        });
      } else if (!sameType.some((c) => c.ref === cite.ref)) {
        let closest: Doc | null = null;
        for (const c of sameType) {
          if (closest === null || levenshtein(c.ref, cite.ref) < levenshtein(closest.ref, cite.ref)) closest = c;
        }
        const cl = closest as Doc;
        raw.push({
          type: "reference_mismatch", severity: "high", subject: [d.id], related: [cl.id], requirements: linked(d.id),
          message: `${d.id} cites ${cite.ref} but the ${label} on file (${cl.id}) has ${cl.ref}.`,
          verify: `Check whether ${cite.ref} is a typing error for ${cl.ref} or a different ${label}; correct ${src} or upload the cited document.`,
        });
      }
    }
  }

  for (const cap of data.corrective_actions || []) {
    if (cap.claimed_status === "complete" && !(cap.closure_evidence && cap.closure_evidence.length)) {
      raw.push({
        type: "closure_without_proof", severity: "high", subject: [], related: [],
        requirements: cap.requirement ? [cap.requirement] : [],
        message: `${cap.id} ("${cap.title}") is marked complete but has no closure evidence attached.`,
        verify: `Attach dated photographs or a verification note signed by a named person before reporting ${cap.id} as closed.`,
      });
    }
  }
  return raw.map((a, i) => ({ id: `A${i + 1}`, ...a }));
}

// ---------------------------------------------------------------- analysis

export function analyze(data: Data): Result {
  const today = data.today, audit = data.audit_date;
  const docs = activeDocuments(data);
  const byId = new Map(docs.map((d) => [d.id, d] as const));

  const checksByReq = data.requirements.map((r) => ({ r, checks: r.needs.map((t) => checkNeed(data, r, t, docs)) }));
  const chosenByReq = checksByReq.map((x) => ({ id: x.r.id, ids: x.checks.filter((c) => c.doc).map((c) => c.doc as string) }));
  const alerts = buildAlerts(data, docs, chosenByReq);

  const requirements: RequirementResult[] = checksByReq.map(({ r, checks }) => {
    const reasons = checks.map((c) => c.reason);
    const linked = alerts.filter((a) => a.requirements.includes(r.id));
    let status: Status, failing: string | null = null;
    const gaps = checks.filter((c) => GAP_CODES.includes(c.code));
    const missing = checks.filter((c) => c.code === "missing");
    if (gaps.length) {
      status = "likely_gap"; failing = gaps[0].type;
    } else if (missing.length) {
      status = "insufficient"; failing = missing[0].type;
    } else {
      const subj = checks.filter((c) => linked.some((a) => a.subject.includes(c.doc as string)));
      const unverified = checks.filter((c) => !byId.get(c.doc as string)!.verified);
      if (subj.length) {
        status = "conflicting"; failing = subj[0].type;
      } else if (unverified.length) {
        status = "pending_review"; failing = unverified[0].type;
        for (const c of unverified) reasons.push(`${c.doc} is a new upload that has not been approved by a person.`);
      } else {
        status = "supported";
      }
    }
    for (const a of linked) reasons.push(`Evidence-integrity alert ${a.id} (${a.type}) applies to this requirement.`);
    return {
      id: r.id, clause: r.clause, title: r.title, criticality: r.criticality, department: r.department,
      status, reasons,
      checks: checks.map(({ type, doc, code, state, ok }) => ({ type, doc, code, state, ok })),
      supporting: checks.filter((c) => c.doc).map((c) => c.doc as string),
      failing_type: failing, alerts: linked.map((a) => a.id),
    };
  });

  const edges: Edge[] = [];
  for (const r of requirements) for (const c of r.checks) if (c.doc) edges.push({ doc: c.doc, req: r.id, type: c.type, status: r.status });

  let total = 0, covered = 0, weighted = 0;
  const counts = { supported: 0, likely_gap: 0, insufficient: 0, conflicting: 0, pending_review: 0 } as Record<Status, number>;
  for (const r of requirements) {
    const w = r.criticality;
    total += w;
    weighted += w * PENALTY[r.status];
    if (r.status === "supported") covered += w;
    counts[r.status] += 1;
  }

  return {
    today, audit_date: audit,
    days_to_audit: dayNumber(audit) - dayNumber(today),
    active_documents: docs.map((d) => d.id),
    superseded: data.documents.filter((d) => !byId.has(d.id)).map((d) => d.id),
    documents: data.documents.map((d) => ({ id: d.id, expiry_state: expiryState(d, today, audit), active: byId.has(d.id) })),
    requirements, alerts, edges,
    plan: buildPlan(data, requirements),
    scores: {
      coverage: roundHalfUp((100 * covered) / total),
      risk_index: roundHalfUp((100 * weighted) / total),
      open_findings: requirements.filter((r) => r.status !== "supported").length,
      status_counts: counts,
    },
  };
}

function buildPlan(data: Data, requirements: RequirementResult[]): Task[] {
  const audit = data.audit_date;
  const reqSrc = new Map(data.requirements.map((r) => [r.id, r] as const));
  const tasks: Task[] = [];
  for (const r of requirements) {
    if (r.status === "supported") continue;
    const t = r.failing_type as string;
    const label = typeLabel(data, t);
    const check = r.checks.find((c) => c.type === t) as Check;
    let action: string, proof: string;
    if (r.status === "likely_gap") {
      if (check.code === "too_old") {
        action = `Run and record a new ${label}`;
        proof = `${capitalize(label)} dated within ${reqSrc.get(r.id)!.max_age_days![t]} days before ${audit}`;
      } else {
        action = `Renew or replace the ${label}`;
        proof = `${capitalize(label)} valid on or after ${audit}`;
      }
    } else if (r.status === "insufficient") {
      action = `Locate or produce the ${label}`;
      proof = `${capitalize(label)} covering clause ${r.clause}`;
    } else if (r.status === "conflicting") {
      action = `Resolve evidence-integrity alert ${r.alerts.join(", ")}`;
      proof = `${capitalize(label)} consistent with the records it references`;
    } else {
      action = `Review and approve the uploaded ${label}`;
      proof = `Named human approval of ${check.doc} (${label})`;
    }
    tasks.push({
      id: `T-${r.id}`, requirement: r.id, status: r.status, owner: r.department,
      due: addDays(audit, r.status === "likely_gap" ? -14 : -7),
      priority: r.criticality * PENALTY[r.status], action, proof,
    });
  }
  return tasks.sort((a, b) => (a.priority !== b.priority ? b.priority - a.priority : a.requirement < b.requirement ? -1 : a.requirement > b.requirement ? 1 : 0));
}

// ---------------------------------------------------------------- scenario helpers

export function setDocumentField<K extends keyof Doc>(data: Data, docId: string, field: K, value: Doc[K]): Data {
  const out = clone(data);
  for (const d of out.documents) if (d.id === docId) d[field] = value;
  return out;
}

export function addRenewal(data: Data, verified = false): Data {
  const out = clone(data);
  out.documents.push({ ...clone(out.renewal), verified });
  return out;
}

export const approveDocument = (data: Data, docId: string): Data => setDocumentField(data, docId, "verified", true);

export function addClosureEvidence(data: Data, capId: string, evidence: string): Data {
  const out = clone(data);
  for (const cap of out.corrective_actions) if (cap.id === capId) cap.closure_evidence = [...(cap.closure_evidence || []), evidence];
  return out;
}
