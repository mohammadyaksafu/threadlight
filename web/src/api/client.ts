// Client for the ThreadLight API (live mode). The base URL is set at build time with VITE_API_BASE
// ("/api" on the VPS). Builds without it (GitHub Pages) have only the offline demo.

import type { Data } from "@/engine";

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
export const LIVE_AVAILABLE = API_BASE !== "";

const TOKEN_KEY = "tl-token";
const REFRESH_KEY = "tl-refresh";

export function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null, refresh?: string | null) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY);
    if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh); else if (!t) sessionStorage.removeItem(REFRESH_KEY);
  } catch { /* storage blocked */ }
}

/** Access tokens last 15 minutes; on a 401 the client swaps the refresh token for a new pair once. */
async function refresh(): Promise<boolean> {
  let rt: string | null = null;
  try { rt = sessionStorage.getItem(REFRESH_KEY); } catch { /* storage blocked */ }
  if (!rt) return false;
  const res = await fetch(API_BASE + "/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
  if (!res.ok) return false;
  const j = await res.json();
  setToken(j.access_token, j.refresh_token);
  return true;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(API_BASE + path, { ...init, headers });
  if (res.status === 401 && !retried && !path.startsWith("/auth/") && (await refresh())) return call<T>(path, init, true);
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j); } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export interface ApiUser { id: number; name: string; role: "officer" | "staff" | "viewer" | "auditor"; tenant_id: number }
export interface Job { id: string; state: string; step: string; error: string | null; document: string | null; events: { step: string; at: string; [k: string]: unknown }[] }
export interface ReviewItem {
  id: number; kind: "fields" | "approval"; job_id: string; document: string; filename: string; factory_id: number;
  type: string | null; ref: string | null; entity: string | null; issued: string | null; valid_until: string | null;
  payload: { validated?: { issues: string[]; low_fields: string[]; fields: Record<string, { value: string | null; quote: string; page: number | null; confidence: number }> } };
}
export interface MappingProposal { id: number; factory_id: number; requirement: string; title: string; document: string; score: number; method: string; page: number | null; chunk: string | null }

export const api = {
  login: (email: string, password: string) =>
    call<{ access_token: string; refresh_token: string; user: ApiUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  dataset: (factory: number) => call<Data>(`/factories/${factory}/dataset`),
  documents: (factory: number) => call<Record<string, unknown>[]>(`/factories/${factory}/documents`),
  document: (factory: number, code: string) => call<Record<string, unknown>>(`/factories/${factory}/documents/${code}`),
  upload: (factory: number, file: File, supersedes?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (supersedes) fd.append("supersedes", supersedes);
    return call<{ duplicate: boolean; document: string; job_id: string | null }>(`/factories/${factory}/documents`, { method: "POST", body: fd });
  },
  job: (id: string) => call<Job>(`/jobs/${id}`),
  reviewQueue: () => call<{ items: ReviewItem[]; mappings: MappingProposal[] }>("/review-queue"),
  resolve: (id: number, body: { type?: string | null; fields?: Record<string, string | null>; approved?: boolean }) =>
    call<{ job: Job }>(`/review/${id}/resolve`, { method: "POST", body: JSON.stringify(body) }),
  confirmMapping: (id: number, confirm: boolean) => call(`/mappings/${id}/confirm`, { method: "POST", body: JSON.stringify({ confirm }) }),
  search: (factory: number, query: string) =>
    call<{ method: string; embed_model: string; hits: { citation: string; file: string; score: number; context: string; text: string }[] }>(
      "/search", { method: "POST", body: JSON.stringify({ factory_id: factory, query }) }),
  report: (factory: number) => call<Record<string, unknown>>(`/factories/${factory}/report`),
  draftReport: (factory: number) => call<Record<string, unknown>>(`/factories/${factory}/report`, { method: "POST" }),
  health: () => call<{ status: string; services: Record<string, string>; llm_mode: string; private_mode: boolean }>("/health"),
  usage: () => call<Record<string, string | number>[]>("/system/usage"),
  evals: () => call<{ report: Record<string, unknown> | null; file?: string }>("/system/evals"),
  models: () => call<{ routes: Record<string, string[]>; models: Record<string, { provider: string; name: string }> }>("/system/models"),
};

export const FACTORY_ID = 1;
