# Security, privacy and guardrails

| Risk | Control | Where | Tested by |
|---|---|---|---|
| Model invents a field | JSON schema + Pydantic; the quote must be on the cited page (fuzzy >= 90 for OCR noise) and the value must match the quote; else confidence 0 and human review | `backend/guardrails/validators.py` | `test_guardrails.py` (invented quote, value not in quote, Bangla dates) |
| Prompt injection in an uploaded document | text fenced in `<document>`; fence-breaking tags neutralised; instruction-like text flagged and the document sent to review; no tools during extraction; output limited to the schema | `backend/guardrails/injection.py`, prompts | `test_guardrails.py`; 2 planted-injection documents in the eval set |
| Personal data sent to a cloud model | Presidio (people, phones, e-mails) + regex (BD phones, NID numbers, the name after a signature label in English or Bangla) before any Gemini call; factory names allow-listed; `PRIVATE_MODE=true` routes all calls to Ollama | `backend/guardrails/pii.py` | `test_guardrails.py`; eval reports count PII strings that reached the model input |
| Draft states something not in the rule output | every sentence needs a valid source tag; uncited sentences removed, one regeneration, then flagged; eval checks numbers against the rule output | `backend/guardrails/citations.py`, `backend/services/drafting.py` | `test_guardrails.py`, `evals/draft_eval.py` |
| AI closes a finding or approves evidence | lifecycle `LifecycleError`; API: verify/close officer-only and needs a passing recheck; pipeline approval node refuses non-officers; MCP has no write tools except a mapping proposal | `threadlight/lifecycle.py`, `backend/app/routers/review.py`, `backend/pipeline/graph.py` | `test_finding_lifecycle_needs_human_officer_and_recheck`, `test_mcp.py` |
| Cross-tenant data leak | Postgres row-level security on every table (`app.tenant_id` per transaction); app role without BYPASSRLS; tenant in the JWT; MCP tokens tenant-scoped | migration `0001_initial.py`, `backend/db/session.py` | `test_cross_tenant_read_is_refused`, `test_rls_blocks_direct_sql_without_tenant`, `test_other_tenant_cannot_read` |
| Tampering with history | `audit_log` and `finding_events` append-only (trigger + revoked UPDATE/DELETE) | migration | `test_audit_log_is_append_only` |
| Abuse | 60 req/min per user, 10 logins/min, 20 uploads/hour; 20 MB limit; magic-byte type check (PDF/JPEG/PNG only) | `backend/app/deps.py`, Caddy | `test_upload_rejects_non_pdf` |
| Secrets | `.env` files git-ignored; only `.env.example` templates committed; Gemini key never sent to the browser | `.gitignore`, `deploy/.env.example` | review |
| Admin tools exposed | n8n, Langfuse, Grafana on sub-domains behind basic auth and an IP allow-list | `deploy/Caddyfile` | manual on the VPS |

Measured: PII redaction, 60 documents with Presidio (Docker) + OCR: signatory names reaching the model 20% with Presidio alone (it missed Bangladeshi names such as "Nasrin Akter" and OCR-garbled Bangla labels), 0% after adding a signature-label rule; phone numbers 0%; no reference or entity field removed. The label rule was written after seeing this set, where names only appear after a signature label, so 0% is optimistic for real documents. Source: `evals/reports/2026-10-27-pii.json`.

Wording rules from v1 still apply: "decision-support index", "evidence-integrity alert", "Draft for human review".
Not done: malware scanning of uploads (ClamAV), SSO, at-rest encryption beyond the VPS disk.
