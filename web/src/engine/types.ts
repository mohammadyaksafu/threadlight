// Shared types for the ThreadLight engine and UI. Mirrors the shape of data/sample.json
// and the result returned by threadlight/engine.py.

export type Status = "supported" | "likely_gap" | "insufficient" | "conflicting" | "pending_review";
export type ExpiryState = "expired" | "expires_before_audit" | "valid" | "no_expiry";
export type CheckCode = "ok" | "missing" | "expired" | "expires_before_audit" | "too_old";
export type AlertType = "entity_mismatch" | "invalid_dates" | "reference_mismatch" | "missing_reference" | "closure_without_proof";
export type Severity = "high" | "medium";

export interface Citation { ref: string; of_type: string }

export interface Doc {
  id: string;
  type: string;
  title: string;
  entity: string;
  ref: string;
  issued: string;
  valid_until: string | null;
  source: { file: string; page: number };
  confidence: number;
  verified: boolean;
  cites: Citation[];
  supersedes?: string;
}

export interface RequirementSpec {
  id: string;
  clause: string;
  title: string;
  title_bn: string;
  criticality: number;
  needs: string[];
  department: string;
  text: string;
  max_age_days?: Record<string, number>;
}

export interface CorrectiveAction {
  id: string;
  title: string;
  claimed_status: string;
  closure_evidence: string[];
  requirement?: string;
}

export interface Data {
  today: string;
  audit_date: string;
  factory: string;
  buyer: string;
  framework: string;
  evidence_types: Record<string, { label: string; label_bn: string }>;
  requirements: RequirementSpec[];
  documents: Doc[];
  corrective_actions: CorrectiveAction[];
  renewal: Doc;
}

export interface Check {
  type: string;
  doc: string | null;
  code: CheckCode;
  state: ExpiryState | null;
  ok: boolean;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  subject: string[];
  related: string[];
  requirements: string[];
  message: string;
  verify: string;
}

export interface RequirementResult {
  id: string;
  clause: string;
  title: string;
  criticality: number;
  department: string;
  status: Status;
  reasons: string[];
  checks: Check[];
  supporting: string[];
  failing_type: string | null;
  alerts: string[];
}

export interface Edge { doc: string; req: string; type: string; status: Status }

export interface Task {
  id: string;
  requirement: string;
  status: Status;
  owner: string;
  due: string;
  priority: number;
  action: string;
  proof: string;
}

export interface Result {
  today: string;
  audit_date: string;
  days_to_audit: number;
  active_documents: string[];
  superseded: string[];
  documents: { id: string; expiry_state: ExpiryState; active: boolean }[];
  requirements: RequirementResult[];
  alerts: Alert[];
  edges: Edge[];
  plan: Task[];
  scores: {
    coverage: number;
    risk_index: number;
    open_findings: number;
    status_counts: Record<Status, number>;
  };
}
