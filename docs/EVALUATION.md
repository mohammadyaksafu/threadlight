# Evaluation

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
