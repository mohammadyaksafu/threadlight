# ThreadLight architecture

ThreadLight builds a *Verified Evidence Passport* for a garment factory: a graph that links
each buyer requirement to the documents that support it, with explained statuses, evidence-
integrity alerts, a ranked remediation plan and a human-approved closure loop.

The design principle is a strict split of responsibilities:

- **Models only read text.** In the full design, OCR and a language model turn PDFs and buyer
  codes into structured fields (dates, reference numbers, entity names, clauses).
- **Rules decide.** Whether a certificate covers the audit date, whether two records agree,
  and what the status of a requirement is, are all decided by deterministic code.
- **Every finding is cited** to a source file and page.
- **Humans approve.** Only a person can assign or close a finding; new uploads count as
  coverage only after a named person approves them.

This document has two separate parts: what exists in this repository, and what is planned.

---

## Implemented in this prototype

Everything in this section is in the code and covered by tests (see EVALUATION.md). All data is
synthetic (`data/sample.json`).

### Seven agents (as implemented today)

"Agent" here names a pipeline stage. In this prototype two stages are represented by
pre-extracted sample data and five are deterministic code.

| # | Agent | In this prototype | Code |
|---|---|---|---|
| 1 | Requirement Intelligence | **Sample extraction**: clause text, criticality and evidence types are fixed in `data/sample.json` | data only |
| 2 | Evidence Intelligence | **Sample extraction**: document type, reference, dates, entity, source page and a confidence value are fixed in `data/sample.json` | data only |
| 3 | Gap Auditor | **Rules**: expiry state, max-age, missing evidence, status per requirement | `engine._check_need`, `engine.analyze` |
| 4 | Contradiction Engine | **Rules**: evidence-integrity alerts | `engine._alerts` |
| 5 | Risk and Audit Twin | **Rules**: coverage, decision-support risk index, what-if | `engine.analyze`, `set_document_field` |
| 6 | Remediation Planner | **Rules**: ranked tasks with owner, due date and proof needed | `engine._plan` |
| 7 | Report Agent | **Templates**: bilingual English/Bangla report assembled from rule output | `web/src/features/report/` |

The "confidence" values in the sample data are illustrative fixture values, not the output of a model.

### Deterministic checks

- Superseded documents (a document named in another's `supersedes`) are ignored.
- Expiry state per document: `expired` (valid_until < today), `expires_before_audit`
  (valid_until < audit date), `valid`, `no_expiry`. Valid on the audit date means
  valid_until >= audit date.
- For each evidence type a requirement needs, the engine picks the document with the latest
  valid_until (or issued date when there is no expiry), ties broken by id.
- Max age (e.g. fire drill records within 180 days) is measured from the issue date to the audit date.

### Statuses

| Status | Rule | Penalty |
|---|---|---|
| supported | every needed type has an in-date, approved document with no integrity alert on it | 0 |
| likely_gap | a picked document is expired, expires before the audit, or is too old | 1.0 |
| insufficient | a needed type has no document | 0.8 |
| conflicting | would be supported, but a supporting document is the subject of an evidence-integrity alert | 0.7 |
| pending_review | would be supported, but a supporting document has not been approved by a person | 0.4 |

likely_gap takes precedence over insufficient. Pending items do not count as covered.

### Evidence-integrity alerts

Alerts are prompts to check records, never accusations. Each has a `subject` (documents
needing correction), `related` (documents to compare with), a `message` and a recommended
`verify` step. Ids A1, A2, ... follow document order, then corrective actions.

- `entity_mismatch`: entity name normalised (lowercase, punctuation stripped, "limited" to
  "ltd", spaces collapsed) and compared with the factory name. Similarity = 1 - Levenshtein /
  longest length. >= 0.9 is medium severity ("possible spelling variant"), otherwise high.
- `invalid_dates`: issued after valid_until, or issued after today (high).
- `reference_mismatch`: a document cites a reference that matches no document of the cited
  type (high); the closest reference on file is shown for comparison.
- `missing_reference`: the cited type has no document at all (medium).
- `closure_without_proof`: a corrective action is marked complete with no closure evidence
  (high), linked to its requirement.

Known limitation: once a certificate is superseded, a citation of the old number is compared
with the new one (as in the "renewal" scenario). A versioned citation check is planned.

### Evidence graph

Edges link each picked document to each requirement it is used for, coloured by the
requirement status. One document can affect several requirements: D1 (fire certificate)
supports R1 and R5, so its expiry changes both.

### Risk index and coverage

weight = criticality (1-5). `risk_index = round(100 * sum(weight * penalty) / sum(weight))`,
`coverage = round(100 * sum(weight of supported) / sum(weight))`, with round half up
(`floor(x + 0.5)`) in both languages. The risk index is a **decision-support index** for
prioritising work, not an audit score or a probability of failing an audit.

### What-if

`set_document_field` returns a modified copy of the data; the engine re-runs on it. The
Simulate tab uses this to move the fire certificate expiry from 2026-10-01 to 2027-01-31.

### Remediation plan

One task per non-supported requirement, ranked by weight x penalty (desc), then id. Owner is
the requirement's department. Due date is audit minus 14 days for likely gaps, minus 7 days
otherwise. The proof text comes from the evidence type that failed (for R5 that is the fire
certificate, not the fire drill log).

### Closure loop (lifecycle)

`threadlight/lifecycle.py` (ported to `web/src/engine/lifecycle.ts` as pure functions for the web app):
detected > explained > assigned > remediated > verified > closed, strictly sequential.

- Only a human actor can assign.
- Remediated requires evidence.
- Verified requires a passing recheck (the rules re-run and the requirement is supported).
- Closed requires actor "human", a named approver and evidence. An AI actor attempting to
  close raises `LifecycleError`.

In the demo: upload renewal > rules recheck > R1/R5 pending review > a person approves as
Compliance Officer > recheck passes > verified > a person closes.

### Bilingual report

English and Bangla, assembled from rule output with fixed templates. Verified (supported)
items are separated from open items; pending items are never labelled verified. Footer:
"Draft for human review. Not an audit result." The Bangla templates need review by a native
speaker before real use.

### Parity

`web/src/engine/engine.ts` is a typed TypeScript port of `engine.py`. `tests/parity.py` loads
it directly in Node (built-in type stripping, no build step), runs 7 scenarios through both
engines and requires identical statuses, reasons, alerts, edges, plan and scores.

### Frontend

React 18 + TypeScript (strict) + Tailwind CSS 3, built with Vite.

- **Engine layer** (`src/engine/`): pure functions with no React or DOM dependency, same data
  shapes as the Python engine. The lifecycle is immutable (`advance()` returns a new finding or throws).
- **State** (`src/store/`): a typed reducer holds the file set, the R1 finding, selection,
  filters, what-if date and language. The engine result is derived with `useMemo`, never stored,
  so every view always reflects the current documents.
- **Design system** (`src/components/ui/`): primitives used by every view; status is always
  shown with colour plus a glyph plus text.
- **Pages and routing** (`src/pages/`, `src/routes.tsx`, `src/nav.ts`): React Router with hash
  URLs. Each section is its own page with list > detail navigation (documents, requirements,
  findings/alerts, actions/workflow); the sidebar groups them as Evidence, Analysis and Resolve.
  A persistent status bar shows the live readiness figures and the synthetic-data notice; a
  command palette (Ctrl+K) jumps to any page, requirement or document.
- **Theming**: colours are CSS-variable tokens consumed by Tailwind; dark mode follows the OS or
  the Theme button via `[data-theme]`.
- **Delivery**: `vite build` emits static files to `web/dist`; a GitHub Actions workflow tests,
  builds and publishes them to GitHub Pages. The only network request is Google Fonts.

### Model routing (today)

No model is called. Every step is either fixed sample data or deterministic code.

---

## Planned

None of the following exists in this repository.

- **OCR** for scanned certificates, with page-level provenance kept on every extracted field.
- **LLM clause extraction**: propose requirements and required evidence types from a buyer
  code of conduct; a person confirms before they are used.
- **Hybrid retrieval and reranking**: keyword plus embedding search over the document store,
  reranked, so each clause is matched to candidate evidence with citations.
- **LLM drafting**: plain-language explanations and report drafts in English and Bangla,
  constrained to cite rule output; drafts stay drafts until a person approves.
- **Model routing**: small, cheap models for classification and field extraction; a larger
  model only for drafting; rules (never a model) for dates, coverage, statuses and closure.
- **Auth and roles** (factory staff, compliance officer, buyer viewer), **tenant isolation**
  per factory, and an audit log of every approval.
- **MCP server** so buyer and auditor tools can query a factory's passport with the factory's consent.
- **Pilot evaluation** on real, consented documents (see EVALUATION.md).
