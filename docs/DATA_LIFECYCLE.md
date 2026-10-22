# Data Lifecycle & Engineering: draft answers

Paste-ready answers for the "Data Lifecycle & Engineering" section of the submission form, in the form's
order. **Tick** lists the checkboxes to select; **Paste** is the text for each box.

**Read this first.** ThreadLight is a browser-only prototype on synthetic data. There is no backend,
database, scraper, OCR or AI model running yet. The answers below tick only what exists and describe the
rest as **Planned**, so judges checking the repository find exactly what is claimed. Leave a checkbox
empty rather than tick something that was not built.

---

## 1. Data Sources

**Tick:** Synthetic / AI-generated Data. Nothing else.

**List specific sources, paste:**

> One synthetic dataset, `data/sample.json`, made for this project: a fictional factory ("Sample Apparel
> Ltd."), buyer ("Buyer A (synthetic)") and buyer code of conduct ("Buyer A Code of Conduct v3.2
> (synthetic)"), with 8 requirements (clause text, criticality, required evidence types, owning
> department), 6 documents (type, reference, entity, issue and expiry dates, source file and page,
> extraction confidence, approval flag, citations), 1 replacement certificate and 1 corrective action.
> All values are invented to cover the cases the rules must handle: an expiring certificate, an expired
> clearance with a misspelt entity name, a wrong citation, missing evidence, and a corrective action
> claimed complete without proof. The same file feeds the Python engine, the tests and the web app.
>
> Public statistics (EPB export data via Fibre2Fashion and Dhaka Tribune, RMG Sustainability Council, UNI,
> DLA Piper) appear only in the pitch and are not ingested (docs/REFERENCES.md).
>
> Planned real sources: factory uploads (certificates, licences, logs, photos; PDF or scan, English or
> Bangla) and buyer codes of conduct, with the factory's consent.

## 2. Acquisition Methods

**Tick:** none. Nothing is acquired automatically today.

**Scrapers / crawlers used, paste:**

> None. No scraping. Compliance evidence comes from the factory itself, not the public web.

**MCP servers for data access, paste:**

> None used or built. Planned: a read-only MCP server so buyer and auditor tools can query a factory's
> Evidence Passport with the factory's consent.

**Bulk upload UI, automated flows, AI-driven extraction details, paste:**

> Today the dataset is a hand-authored JSON file bundled into the app at build time. The "Upload renewed
> certificate" button in the demo adds a pre-defined sample record; it simulates an upload and accepts
> no real files. Extraction is shown as a pre-computed sample and labelled that way in the UI.
>
> Planned pipeline: bulk PDF and photo upload, then OCR (for scans, including Bangla), then LLM structured
> extraction into a JSON schema (type, reference, entity, dates, with file and page for every field and
> null when a field is absent), then low-confidence fields routed to human review, then a person
> approves before a document counts as evidence.

## 3. Parsing, Formats & Cleaning

**Tick formats:** JSON. (Markdown is used only for docs; do not tick formats that are not processed as data.)

**Parsers used, paste:**

> `JSON.parse` in the browser (bundled by Vite) and Python's `json` module. No PDF or HTML parsing yet.
> Planned: PDF text extraction plus OCR for scans, then LLM JSON-mode parsing validated against a schema.

**Formatters / converters, paste:**

> None as a data step. The bilingual report is rendered as HTML and can be saved as PDF through the
> browser's Print. Planned: CSV and PDF export of the report and task plan.

**Data cleaning & enrichment, paste:**

> All implemented in the rules engine, identically in Python and TypeScript:
> - **Entity resolution:** names are normalised (lower-case, punctuation stripped, "limited" turned into
>   "ltd", spaces collapsed) and compared by Levenshtein similarity. A score of 0.9 or more is flagged
>   as a "possible spelling variant" (medium); below that, high.
> - **De-duplication / versioning:** superseded documents are ignored, and for each evidence type the
>   document with the latest expiry (then issue date, then id) is chosen.
> - **Date normalisation:** ISO dates, an expiry state against today and the audit date, and a maximum
>   age per evidence type (for example, fire drills within 180 days).
> - **Consistency enrichment:** citations between documents are checked against the reference numbers
>   on file (the closest match is shown), invalid date orders are flagged, and corrective actions claimed
>   complete without proof are flagged.

**Schema validation, paste:**

> TypeScript types (`web/src/engine/types.ts`) define the data and result shapes and are enforced at
> compile time in strict mode. 37 Python unit tests and a 7-scenario Python/TypeScript parity test act as
> contract tests on the engine output. There is no runtime validator yet; planned: Zod (front end) and
> Pydantic (back end) for every extracted record and every model output.

## 4. Storage Targets

**Tick:** none. There is no database.

**Schema design, partitioning, indexes, retention, tiered storage, paste:**

> Today: a static JSON file in the repository, loaded into the browser. App state lives in memory (React
> reducer); only the theme choice (localStorage) and the demo role (sessionStorage, current tab) are stored,
> both on the viewer's device. Nothing is sent to a server.
>
> Planned: Postgres with one schema per factory (tenant) holding factories, requirements, documents,
> extracted fields (each with file, page and confidence), alerts, findings, the lifecycle history and
> approvals. Original files go in object storage, and pgvector holds chunk embeddings for retrieval. The
> evidence graph lives as relational edge tables (document to requirement, document to document for
> citations). The approval history is append-only, for audit trails.

## 5. Visualization

**Tick:** none of the listed libraries. **Add:** "Custom SVG + React (no chart library)".

**Visualization details, paste:**

> All charts are hand-built SVG and HTML in React with Tailwind:
> - an **evidence graph**, with documents and requirements in two columns joined by curves drawn from the
>   real element positions and redrawn on resize. Each line takes the status colour *and* a dash pattern,
>   so it is not colour-only, and clicking a node highlights its links ("1 document affects 2
>   requirements").
> - a **coverage ring**, a risk-index meter and a stacked status bar.
> - a **what-if** slider that re-runs the rules live, with before/after deltas.
> - a **workflow timeline** for the finding lifecycle.
>
> Accessibility: every status has an icon and text as well as a colour; there is visible keyboard focus,
> reduced-motion support, tabular numbers, light and dark themes, and layouts that work at 400 px.

**Dashboards & reports, paste:**

> An in-app Overview dashboard (days to audit, coverage, decision-support risk index, open findings, top
> priorities, alerts) and a live status strip on every page. The report is bilingual (English/Bangla)
> and separates "Verified" from "Open, not confirmed"; it can be printed or saved as PDF from the
> browser. No BI tool is used. Planned: a buyer view of the Evidence Passport and a scheduled PDF report
> before each audit.

## 6. Insights: AI, ML & Non-AI

**Tick:** Rule Engine / Heuristics (non-AI). Nothing else.

**AI / ML details, paste:**

> No AI or ML model runs in the prototype, by design: rules make every decision. Planned: an LLM for
> structured extraction, hybrid retrieval with reranking for clause-to-evidence matching, and LLM drafting
> of bilingual explanations. Each will be evaluated against a human-labelled pilot set (field accuracy,
> clause-to-evidence recall, agreement with a compliance officer); see docs/EVALUATION.md.

**Non-AI analytics, paste:**

> A deterministic rules engine (Python, with a TypeScript port tested to give identical output) produces:
> - a **status** per requirement (supported, likely gap, insufficient, conflicting, pending human review),
>   with reasons and cited sources;
> - **evidence-integrity alerts** (entity mismatch, invalid dates, reference mismatch, missing reference,
>   closure without proof), each with a recommended check;
> - **KPIs:** coverage = criticality-weighted share supported; the decision-support risk index =
>   criticality-weighted status penalties (0 to 100, not a probability); open findings; days to audit;
> - a **ranked task plan** (owner, due date, proof needed) and a **what-if** simulation.

**How are insights delivered to users, paste:**

> In the app: the Overview dashboard, Findings (with filters and detail pages), Integrity alerts, the
> ranked Actions list, a step-by-step approval workflow, and the bilingual report (printable). There are
> no emails or bots yet. Planned: alerts when a document is about to expire before an audit, and a
> buyer-facing Evidence Passport.

## 7. Pipelines & Orchestration

**Orchestration, paste:**

> No data orchestrator. The analysis re-runs in the browser on every change to the file set (about 1 ms),
> as a pure function of the data. The build and deploy pipeline is GitHub Actions: unit tests, then the
> parity test, then type-check and build, then deploy to GitHub Pages.

**Scheduling / Triggers, paste:**

> Event-driven: a push to `main` triggers CI/CD. In the app, user actions (upload, approve) trigger an
> immediate recheck. No cron jobs. Planned: a daily expiry check against upcoming audit dates.

**Streaming / Real-time, paste:**

> None.

## 8. Outbound: APIs & Distribution

**Outbound APIs, paste:**

> None yet; the prototype is a static site. Planned: a read-only REST API and an MCP server exposing a
> factory's Evidence Passport (requirement statuses, cited evidence, alerts), access granted by the
> factory and every request logged.

**Webhooks & exports, paste:**

> No webhooks. Export: the bilingual report can be printed or saved as PDF from the browser. Planned:
> CSV/XLSX export of the task plan and findings.

**Embeddings / model serving, paste:**

> None. No embeddings or hosted models yet (planned with the retrieval layer).

## 9. Open Source Stack

**Paste:**

> React 18 + React Router (UI and hash routing for static hosting) · TypeScript 5 (engine port and UI, strict)
> · Vite 6 (build) · Tailwind CSS 3 + PostCSS + Autoprefixer (design tokens, light/dark themes) ·
> lucide-react (icons) · Python 3 standard library + unittest (rules engine and tests) · Node.js (runs the
> TypeScript engine directly for the parity test) · headless Chrome over the DevTools protocol (UI tests,
> video capture) · FFmpeg (video assembly) · Google Fonts: Schibsted Grotesk, IBM Plex Mono, Noto Sans
> Bengali (Bangla rendering) · GitHub Actions + GitHub Pages (CI/CD and hosting).

## 10. Quality, Governance & Observability

**Data quality, paste:**

> 37 unit tests pin the expected results on the synthetic fixture (statuses, alerts, KPIs, plan, every
> lifecycle rule). A parity test requires identical output from the Python and TypeScript engines across
> 7 scenarios. An 80-check headless-browser test exercises the live flows. All of these run in CI and
> block deployment on failure. The engine itself is a data-quality checker: it flags expired or
> soon-expiring documents, records that are too old, missing evidence, misspelt entities, wrong citations
> and claims without proof. No freshness SLAs yet, since there is no live data.

**Privacy & compliance, paste:**

> Synthetic data only; no personal data is collected or processed. There are no external API calls
> besides Google Fonts. Browser storage holds only the theme and the demo role. The demo sign-in is
> labelled as not real authentication. Planned: per-factory tenant isolation, role-based access, PII
> redaction before any model call, and consent-based sharing with buyers.

**Lineage & observability, paste:**

> Evidence lineage is built into the data model: every finding carries the document id, source file,
> page and extraction confidence it was derived from, plus the alert ids that affect it. Superseded
> documents are kept and marked, not deleted. The finding lifecycle keeps an append-only history of who
> did what (rules engine, person, named approver). Code lineage is in the git history and CI logs.

**Cost & performance, paste:**

> Runtime cost is zero: a static site on GitHub Pages, no servers and no model tokens. A full analysis
> takes about 1 ms in the browser, so the what-if slider recalculates live. The production JavaScript
> bundle is about 100 KB gzipped. Planned: cheap-model routing for extraction, caching buyer-code clauses,
> and sending only the relevant page to a model.

## Anything else about your data stack?

**Paste:**

> The design principle is "models read, rules decide, people approve." The decision layer (status, alerts,
> KPIs, plan) is deterministic, versioned in code, tested in two languages and identical between them,
> so every number in the app can be traced to a rule and a cited page. The planned AI layer only feeds
> structured, cited fields into it and never overrides it. Roadmap: real upload with OCR and LLM
> extraction (including Bangla scans), hybrid retrieval over buyer codes, Postgres with tenant isolation,
> and a consent-based Evidence Passport API and MCP server for buyers.

## Publish local environment to internet

**Tick:** none. No tunnelling tool was used.

**Tunneling usage notes / what was exposed, paste:**

> Not used. Nothing local was exposed. The demo is a static build published by GitHub Actions to GitHub
> Pages (https://mohammadyaksafu.github.io/threadlight/), which is public, read-only and always on, and
> has no backend to secure. There are no webhooks or OAuth callbacks.
