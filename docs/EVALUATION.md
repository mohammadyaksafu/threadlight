# Evaluation

> **v2 update (2026-10-27).** The backend now runs OCR and language models, so there are new measurements. They are
> in the section "v2: pipeline evaluation" at the end. The v1 notes directly below still describe the rules engine.

**This is not an accuracy benchmark.** Everything below was measured on one small synthetic
fixture (`data/sample.json`: 8 requirements, 6 documents, 1 corrective action, 1 renewal). It
shows that the rules do what the specification says on that fixture. It says nothing about how
well ThreadLight would perform on real factory documents, because no real documents have been
processed and no OCR or language model is part of this prototype.

## What the tests verify

| Suite | Command | Result on 2026-10-22 |
|---|---|---|
| Unit tests | `python3 -m unittest discover -s tests` | 37 tests (75 assertion statements) passing |
| Parity, Python vs TypeScript | `python3 tests/parity.py` | 7 of 7 scenarios identical |
| Headless UI check of the built web app | `npm run test:ui` (in `web/`) | 80 of 80 checks passing (Chrome, headless) |

### Unit tests cover

- Baseline: 30 days to audit; statuses R1 likely_gap, R2 supported, R3 supported, R4
  likely_gap, R5 likely_gap, R6 insufficient, R7 conflicting, R8 insufficient; coverage 29;
  risk index 63; 6 open findings.
- Graph: D1 supports exactly R1 and R5.
- Alerts: entity_mismatch on D4 (medium, spelling variant); reference_mismatch on D6
  (FC-2025-0471 cited, FC-2025-0417 on file); closure_without_proof for CAP-14 linked to R8;
  alert ids in order; no invalid_dates at baseline.
- Plan: six tasks, T-R1 first, full order R1, R8, R6, R4, R5, R7; R5 proof names the fire
  safety certificate; due dates 2026-11-07 (likely gap) and 2026-11-14 (other).
- What-if on D1 valid_until: 2026-12-31 gives R1 and R5 supported and coverage 55;
  2026-11-21 (audit day) supported; 2026-11-20 likely_gap; 2026-10-01 reason says expired.
- Renewal: unverified gives R1 and R5 pending_review, coverage 29, D1 inactive; approved
  gives R1 and R5 supported, coverage 55.
- Integrity rules: issue after expiry and issue in the future raise invalid_dates; adding
  closure evidence removes closure_without_proof; missing_reference; a distant entity name is
  high severity; "Limited" normalises to "Ltd"; round half up.
- Lifecycle: full path; no skipping; no going back; only a human assigns; remediation needs
  evidence; verification needs a passing recheck; an AI actor cannot close; closing needs a
  named approver and evidence; unknown actors rejected.

### Parity scenarios

baseline, extend_to_dec31, audit_day, day_before_audit, already_expired,
renewal_unverified, renewal_approved. Compared fields: days_to_audit, active and superseded
documents, document expiry states, requirements (status, reasons, checks, alerts), alerts,
edges, plan and scores.

### UI check covers

Demo sign-in (redirect when signed out, wrong password rejected, Guest read-only, Factory staff can upload but cannot approve, Compliance Officer full flow), Overview home page, sidebar current-page state, requirement and document detail pages, the alerts sub-page, the mobile navigation drawer, the Ctrl+K command palette, synthetic-data banner, header figures (30 / 29 / 63 / 6), all eight statuses,
Run analysis lighting 7 agents with correct rules/sample labels, graph lines and the "1
document affects 2 requirements (R1, R5)" message, slider extremes and the audit-day boundary,
the lifecycle (close blocked with "AI cannot close this finding", upload keeps coverage 29
with R1/R5 pending, approval gives 55, close by named approver, reset to baseline), report
Verified/Open split, Bangla labels and footer, no horizontal scroll at 400 px on all 12 pages,
dark theme, graph lines actually stroked, the status filter, the 1-7 keyboard shortcuts, no network request other than Google Fonts, and no JavaScript errors. The TypeScript sources also pass `tsc -b` in strict mode on every build.

## What has not been measured

No extraction accuracy, no retrieval quality, no user study, no time-saving measurement, no
real factory or buyer data. The confidence values shown in the demo are fixture values.

## Metrics for a real pilot

To be measured on consented documents from pilot factories, with a person producing the
reference labels. All cells are empty until measured.

| Metric | Definition | Target | Result |
|---|---|---|---|
| Field extraction accuracy | share of dates, reference numbers and entity names extracted exactly right | [FILL] | [FILL] |
| Clause-to-evidence recall | share of evidence types a compliance officer lists that the system also proposes | [FILL] | [FILL] |
| Status agreement | agreement between system status and a compliance officer's status per requirement | [FILL] | [FILL] |
| Integrity alert precision | share of alerts a reviewer confirms are worth checking | [FILL] | [FILL] |
| Missed issues | issues found by the auditor that the system did not flag | [FILL] | [FILL] |
| Preparation time | staff hours to assemble audit evidence, before vs after | [FILL] | [FILL] |
| Bangla report usability | rating by factory staff who read Bangla | [FILL] | [FILL] |
| Pilot factories | number of factories and documents processed | [FILL] | [FILL] |


## v2: pipeline evaluation (2026-10-27)

All numbers are on **synthetic** documents generated by `synth/generate.py` (ground truth written by the generator).
They show the pipeline works end to end; they are **not** real-world accuracy. Reports: `evals/reports/2026-10-27*.{md,json}`.

| Suite | Command | Result on 2026-10-27 |
|---|---|---|
| Backend tests (fake LLM, real Postgres + pgvector + RLS) | `python -m pytest backend/tests -q` | 23 passed: auth, roles, cross-tenant 404, RLS without tenant, append-only audit log, upload type check, lifecycle (officer + recheck), end-to-end pipeline back to 29 / 63, renewal 29 -> 55 only after approval, guardrails, MCP tools/scopes/tenancy |
| Live pipeline with Gemini | `scratchpad e2e` (six v1 PDFs uploaded through the API) | all six extracted by `gemini-3.5-flash-lite` with every field at confidence >= 0.95; the scan went to human review on the laptop (no OCR there); after review and approval: coverage 29, risk 63, alerts A1-A3, identical to v1 |
| Live web app | `node tests/live_check.js` | 11 of 11: API sign-in, live data on the Overview (29 / 63), renewal upload through the pipeline, coverage stays 29 until the officer approves in the Review queue, then 55; System page shows service health |
| MCP over HTTP | `docs/MCP.md` | no token refused; 9 tools; passport, alerts, search and proposal correct |
| Field extraction | `python -m evals.extraction_eval` | 60 documents in the Docker image with OCR: `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` 1.0 field accuracy, 0 silent errors, 2/2 injection documents routed to review; regex baseline 0.979 (fails on Bangla type detection). See `docs/MODEL_ROUTING.md` for why 1.0 on this set means little |
| Retrieval | `python -m evals.rag_eval` | 6 clauses with evidence on file: recall@5 1.0, MRR 1.0 for hybrid; full text alone hit@1 0.5 |
| Drafts | `python -m evals.draft_eval` | 3 bilingual drafts: 83% of sentences cited before the checker (rest removed), 0 numbers outside the rule output, judge (Gemma 4 31B) faithfulness 1.0 |
| PII redaction | `python -m evals.pii_eval` (with `PRESIDIO_URL`) | 60 documents with Presidio (Docker) + OCR: signatory names reaching the model 20% with Presidio alone (it missed Bangladeshi names such as "Nasrin Akter" and OCR-garbled Bangla labels), 0% after adding a signature-label rule; phone numbers 0%; no reference or entity field removed. The label rule was written after seeing this set, where names only appear after a signature label, so 0% is optimistic for real documents. Source: `evals/reports/2026-10-27-pii.json`. |
| Prompt regression | `npx promptfoo@0.103.5 eval -c evals/promptfooconfig.yaml` | 30 fixed cases configured for `.github/workflows/evals.yml`; **not run yet** (local npx install was interrupted) |

### What v2 has still not measured

- Real factory documents (none have been processed), so no real-world accuracy figure exists.
- Larger retrieval sets, and the reranker's effect (it is in the full Docker image, which was not built on the laptop).
- Gemini 3.8 Flash and Gemini Pro (overloaded / free-tier quota on 2026-10-27), local Qwen and Llama (Ollama not run on the laptop).
- A human spot check of the drafts (the `spot_check` field in the draft report is still empty).
