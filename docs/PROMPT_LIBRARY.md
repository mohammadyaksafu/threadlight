# Prompt Library

The prompts the team used during development, in order. All prompts were given to **Claude Code running
Claude Opus 5.5** on 2026-10-22. For each one: the prompt as written, what it asked for, and what it
produced. Short prompts are quoted exactly, typos included. Where a prompt was a pasted section of the
submission form, the paste is summarised.

For the form's "Add Prompt" button, use one entry per numbered prompt: **Title** = the heading,
**Prompt** = the quoted text, **Model** = Claude Opus 5.5 (Claude Code), **Purpose / outcome** = the
outcome line.

---

## 1. Build specification (spec-driven master prompt)

**Pattern:** role + goal, non-negotiable rules, exact repository layout, full data fixture, precise
algorithm, and expected results written as test assertions. This let the agent verify its own work.

**Outcome:** the Python rules engine and 37 unit tests, a JavaScript port with a 7-scenario parity test,
the demo page, all docs, the video script and the deploy note, with every expected number met
(coverage 29, risk index 63, 29 while pending, 55 after approval).

**Prompt:**

```text
You are building the working prototype for "ThreadLight", a compliance evidence platform for garment exporters, for the International AI Builders Congress (JusticeSphere AI > ComplianceOS). Deadline for the submission form is Oct 31, 2026. Work in the current folder.

HONESTY RULES (non-negotiable, judges verify these)
- All data is SYNTHETIC. Every page and doc must say so. No real company, buyer or standard names.
- The demo makes NO language-model calls. It runs deterministic rules in the browser. Anything that would be done by an LLM or OCR in the full design (clause extraction, document reading, drafting) must be shown as "pre-extracted sample result" and labelled as such in the UI and docs.
- Never invent statistics, test results, customers or advisors. Where real data is missing, leave a clearly marked [FILL] placeholder.
- The risk number is a "decision-support index", never an "audit score" or probability.
- Contradictions are "evidence-integrity alerts", never fraud accusations.

DELIVERABLES
1. Python rules engine (stdlib only) + unit tests (unittest)
2. JavaScript port of the same engine + a parity test proving both give identical results
3. One self-contained demo page (demo/index.html, build it by inlining src files with a build script; no external network calls except Google Fonts)
4. Docs: README, ARCHITECTURE (split into "Implemented in this prototype" vs "Planned"), EVALUATION (honest, small synthetic fixture only), REFERENCES, SUBMISSION_FIELDS (draft answers for "Data & AI Provenance" and "Tooling & IDE")
5. VIDEO_SCRIPT.md: a timed script that fits under 181 seconds, plus a shot list with exact click path
6. Git-ready repo with .gitignore and a deploy note for GitHub Pages

REPO LAYOUT
threadlight/
  data/sample.json
  threadlight/__init__.py, engine.py, lifecycle.py
  tests/test_engine.py, tests/parity.py
  demo/src/engine.js, app.js, style.css, template.html ; demo/build.py ; demo/index.html (built)
  docs/ARCHITECTURE.md, EVALUATION.md, REFERENCES.md, SUBMISSION_FIELDS.md, VIDEO_SCRIPT.md
  README.md

SCENARIO: "A factory 30 days before an audit"
today = 2026-10-22, audit_date = 2026-11-21 (30 days).
Factory: "Sample Apparel Ltd." | Buyer: "Buyer A (synthetic)" | Framework: "Buyer A Code of Conduct v3.2 (synthetic)"

Requirements (id, clause, title, criticality, needs[], department):
R1 4.1 Valid fire safety certificate, 5, [fire_certificate], Safety & Maintenance
R2 4.2 Structural safety assessment, 5, [structural_report], Engineering
R3 2.1 Valid trade license, 4, [trade_license], Administration
R4 7.3 Environmental clearance, 3, [env_clearance], Compliance
R5 4.4 Fire drill records, 3, [fire_drill_record, fire_certificate], Safety & Maintenance, max_age_days {fire_drill_record:180}
R6 5.2 Wage and working-hour records, 4, [payroll_summary], HR & Payroll
R7 4.6 Safety committee minutes, 2, [committee_minutes], HR & Payroll
R8 9.1 Closure proof for corrective action CAP-14, 5, [cap_closure_evidence], Safety & Maintenance
(Valid on the audit date means valid_until >= audit date. Equal to the audit date is valid.)

Documents (id, type, title, entity, ref, issued, valid_until, source file/page, confidence, verified):
D1 fire_certificate "Fire Safety Certificate" "Sample Apparel Ltd." FC-2025-0417 issued 2025-11-11 valid_until 2026-11-10 (fire_certificate.pdf p1, 0.97, verified)
D2 structural_report "Structural Assessment Report" same entity SR-2025-118 issued 2025-03-01 valid_until 2027-03-01 (structural_assessment.pdf p4, 0.95)
D3 trade_license "Trade License" same entity TL-77310 issued 2026-01-01 valid_until 2026-12-31 (trade_license.pdf p1, 0.98)
D4 env_clearance "Environmental Clearance" entity "Sample Apparels Ltd." (note the extra s) EC-2024-5521 issued 2024-10-01 valid_until 2026-09-30 (env_clearance_scan.pdf p2, 0.81)
D5 fire_drill_record "Fire Drill Log" same entity FD-LOG-2026 issued 2026-08-14 no expiry (fire_drill_log.pdf p1, 0.92)
D6 committee_minutes "Safety Committee Minutes (Sep 2026)" same entity SC-MIN-2026-09 issued 2026-09-20 no expiry, cites [{ref:"FC-2025-0471", of_type:"fire_certificate"}] (safety_committee_minutes.pdf p2, 0.88)
No payroll summary document exists.
Corrective action CAP-14: "Clear and re-mark blocked emergency exit, Floor 2", claimed_status "complete", closure_evidence [], requirement R8.
Replacement document D1-renewal: fire_certificate "Fire Safety Certificate (renewal)", entity "Sample Apparel Ltd.", ref FC-2026-0562, issued 2026-10-21, valid_until 2027-10-20, verified false, supersedes "D1".

ENGINE RULES (deterministic, no LLM)
- Superseded documents are ignored.
- Expiry state: expired (valid_until < today), expires_before_audit (valid_until < audit), valid, no_expiry.
- Per requirement, for each needed type pick the document with the latest valid_until (or issued if none; tie-break by id). No document -> insufficient. Expired / expires before audit / older than max_age_days -> likely_gap. likely_gap beats insufficient.
- Integrity alerts (ids A1.. in this order: per document in list order, then corrective actions):
  * entity_mismatch: normalize (lowercase, strip punctuation, "limited"->"ltd", collapse spaces) and compare to factory name; similarity = 1 - Levenshtein/longest; >=0.9 -> severity medium and "(possible spelling variant)", else high.
  * invalid_dates: issued after valid_until, or issued after today.
  * reference_mismatch: a document cites a reference that matches no document of the cited type -> high; missing_reference if no such document exists -> medium.
  * closure_without_proof: corrective action complete with no closure evidence -> high, linked to its requirement.
  Each alert has: subject (docs needing correction), related (docs to compare), message, verify (recommended check).
- A requirement that would be supported but whose supporting doc is an alert subject -> conflicting. If it would be supported but the supporting doc has verified=false -> pending_review (needs human approval).
- Risk: weight = criticality; penalty supported 0, likely_gap 1.0, insufficient 0.8, conflicting 0.7, pending_review 0.4. risk_index = round(100 * sum(w*p)/sum(w)); coverage = round(100 * sum(w of supported)/sum(w)). Round half up: floor(x+0.5) in both languages. Pending items do NOT count as covered.
- Task plan: one task per non-supported requirement, ranked by weight*penalty desc then id; owner = requirement department; due = audit minus 14 days for likely_gap, else minus 7; proof text comes from the failing evidence type (not the first type listed).
- Lifecycle (lifecycle.py): states detected > explained > assigned > remediated > verified > closed, strictly sequential. Only a human can assign. Remediated needs evidence. Verified needs a passing recheck. Closed needs actor "human", a named approver and evidence. An AI actor closing must raise LifecycleError.

EXPECTED RESULTS (write these as test assertions)
Baseline: days_to_audit 30; statuses R1 likely_gap, R2 supported, R3 supported, R4 likely_gap, R5 likely_gap, R6 insufficient, R7 conflicting, R8 insufficient; coverage 29; risk_index 63; open_findings 6.
Edges: document D1 supports exactly R1 and R5 (one document, two requirements).
Alerts: entity_mismatch on D4 (medium, spelling variant), reference_mismatch on D6 (cites FC-2025-0471 but file has FC-2025-0417), closure_without_proof for CAP-14 (R8).
Plan ranks T-R1 first; six tasks; R5's proof text mentions the fire safety certificate.
What-if D1.valid_until=2026-12-31 -> R1 and R5 supported, coverage 55.
D1 valid_until 2026-11-21 -> R1 supported; 2026-11-20 -> likely_gap; 2026-10-01 -> reason says expired.
Adding D1-renewal unverified -> R1 and R5 pending_review, coverage stays 29, D1 no longer in active documents.
Adding D1-renewal with verified=true -> R1 and R5 supported, coverage 55.
Also test: issue date after expiry raises invalid_dates; adding closure evidence removes closure_without_proof; every lifecycle rule above.
tests/parity.py runs 7 cases (baseline, extend_to_dec31, audit_day, day_before_audit, already_expired, renewal_unverified, renewal_approved) through Python and Node and asserts identical statuses, reasons, alerts, edges, plan, scores.
Run both test suites and fix until green before building the UI.

DEMO PAGE (single self-contained HTML, works at 400px and desktop, light and dark theme)
Header: "ThreadLight" name, factory + buyer + framework, a visible banner "Synthetic data. Rules run live in your browser. Extraction results are pre-computed samples, not live AI." Audit countdown (days to audit), coverage %, decision-support risk index, open findings count.
Tabs, in this order, default tab Findings:
1 Documents: the 6 files with type, ref, dates, extraction confidence, source file/page, and a "Run analysis" button that animates the 7 agents lighting up in order (Requirement Intelligence, Evidence Intelligence, Gap Auditor, Contradiction Engine, Risk and Audit Twin, Remediation Planner, Report Agent). Mark each as "rules" or "sample extraction".
2 Requirements: the 8 clauses with original text and the evidence types each needs.
3 Evidence graph: documents in one column, requirements in the other, lines between them colored by status; clicking D1 highlights R1 and R5 and says "1 document affects 2 requirements". Draw lines from element positions and redraw on resize and when the tab opens.
4 Findings: requirement cards with status pill (five statuses, color AND text/icon, not color alone), reasons, the cited source (file, page), confidence, and the limit of the conclusion. Integrity alerts panel with the "verify" recommendation.
5 Simulate: a date slider or input for "Fire certificate valid until" (range roughly 2026-10-01 to 2027-01-31). Live recalculation of statuses, coverage and risk with before/after deltas. Show "affected requirements: R1, R5".
6 Actions: ranked task list (owner, due, proof needed). A lifecycle panel for finding R1: Detect > Explain > Assign > Remediate > Verify > Close. Button "Upload renewed certificate" adds D1-renewal, engine rechecks, R1/R5 become pending_review. The Close button stays disabled until the user clicks "Approve as Compliance Officer"; show a message "AI cannot close this finding" if they try to skip. After approval R1/R5 turn supported and coverage becomes 55. A Reset button restores the baseline.
7 Report: English / Bangla toggle. Bilingual report listing each requirement, status, reason and source, plus a clear split between "Verified" and "Open". It must not label unverified items as confirmed. Footer line: "Draft for human review. Not an audit result." Bangla status labels: supported = প্রমাণ সমর্থিত, likely gap = সম্ভাব্য ঘাটতি, insufficient = অপর্যাপ্ত প্রমাণ, conflicting = পরস্পরবিরোধী প্রমাণ, pending review = মানব পর্যালোচনার অপেক্ষায়, verified = যাচাইকৃত. Use Noto Sans Bengali.
Design: no lorem ipsum, no emoji section markers, no purple gradient, no cream+terracotta look. Deep indigo "thread" accent with semantic green/amber/red/violet for statuses, Schibsted Grotesk for text, IBM Plex Mono for reference numbers and dates, defined as CSS tokens with dark mode via prefers-color-scheme and a [data-theme] override. Visible keyboard focus, prefers-reduced-motion respected, tabular numbers for figures. Page must be fully readable at rest with no scroll-triggered reveals.
Build: demo/build.py inlines style.css, engine.js, sample data and app.js into demo/index.html. Write data to the page as JSON.

DOCS
- README: what it is, what is implemented vs planned, how to run tests (python3 -m unittest discover -s tests; python3 tests/parity.py), how to open the demo, the synthetic-data notice.
- ARCHITECTURE: the seven agents, evidence graph, statuses, model routing, closure loop. Two clearly separate sections: "Implemented in this prototype" (deterministic checks, graph, risk index, what-if, lifecycle rules, bilingual report) and "Planned" (OCR, LLM clause extraction, hybrid retrieval and reranking, LLM drafting, auth, tenant isolation, MCP server).
- EVALUATION: report only what the tests actually verify (counts of assertions passing on the tiny synthetic fixture). State plainly that this is not an accuracy benchmark and list the metrics to be measured in a real pilot with [FILL] cells.
- REFERENCES, use exactly these:
  [1] Fibre2Fashion, "Bangladesh's RMG exports up 8.8% to $39.3 bn in FY25" (EPB data): https://www.fibre2fashion.com/news/apparel-news/bangladesh-s-rmg-exports-up-8-8-to-39-3-bn-in-fy25-303779-newsdetails.htm
  [2] Dhaka Tribune, "RMG exports grew 10.84% during July-March" (EPB data): https://www.dhakatribune.com/bangladesh/378920/rmg-exports-grew-10.84%25-during-july-march
  [3] RMG Sustainability Council, Monthly Report June 2025: https://rsc-bd.org/wp-content/uploads/2025/09/Monthly-Report-June-2025.pdf
  [4] UNI, "Over 400 garment factories shut down in Bangladesh between July 2023 and June 2026": https://www.uniindia.com/400-garment-factories-closed/168309
  [5] DLA Piper, "CSDDD: Amendments under Omnibus I finalised": https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2026/corporate-sustainability-due-diligence-directive-amendments-under-omnibus-i-finalised
  Facts allowed from them: apparel and home textiles were 83.29% of Bangladesh's $48.28B exports in FY2024-25; the EU took 49.82% of garment exports in July-March FY2024-25; 800 of 1,875 RSC-covered factories had completed structural remediation by June 2025 (structural only, RSC-covered factories only); 405 factories closed July 2023-June 2026 (do not claim compliance caused this); CSDDD now applies from July 2029 after being narrowed (add a note to re-verify on the official EU site).
- SUBMISSION_FIELDS: draft answers for "Data & AI Provenance" (all demo data is synthetic and generated for this project; public figures come from the references above; list which AI tools helped write code and docs, with [FILL] for exact tools) and "Tooling & IDE" ([FILL] with the editors and AI tools actually used).

VIDEO_SCRIPT (maximum 181 seconds, target 170). Timed voiceover plus on-screen action:
0:00-0:15 hook: one factory, one expired certificate 30 days before an audit.
0:15-0:35 problem with two sourced numbers (83.29% of exports; 800 of 1,875 structural remediation). Show source names on screen.
0:35-0:50 solution: Verified Evidence Passport, evidence graph, human-approved closure.
0:50-2:05 live demo, exact clicks: Documents > Run analysis > Evidence graph (click D1: one document, two requirements) > Findings (expired cert, wrong citation, CAP-14 closed without proof) > Simulate (move the slider, watch coverage change) > Actions (upload renewal, show pending review, try to close without approval and get blocked, approve) > Report (switch English to Bangla).
2:05-2:30 how the AI decides: rules decide dates, models only read text, every finding cited, humans approve. Say clearly what is implemented now vs planned.
2:30-2:50 business model and pilot plan, with [FILL] for any interview quote or price. No invented numbers.
2:50-3:00 close and ask: pilot factories and NRB advisors.
Also give: recording tips (1080p, hide bookmarks, record voice separately), how to upload as Unlisted on YouTube, and a title and description.

FINAL CHECKS before you stop
- Both test suites pass; show the output.
- Open demo/index.html logic with a headless check or by running the engine against every UI action (baseline, slider extremes, upload, approve, reset) and confirm the numbers above (29 -> 29 pending -> 55).
- Grep the whole repo to confirm no external network calls other than Google Fonts and no claim that an LLM runs in the demo.
- Print a short summary of what is implemented vs not, and list every [FILL] left for me to complete.
```

---

## 2. Rebuild the front end in TypeScript and Tailwind

**Prompt:** `make frontend best using typescript ant tailwint css`
**Outcome:** the demo UI and engine port were rewritten in strict TypeScript with Tailwind CSS compiled at
build time, still one offline page. Parity and UI checks were re-run.

## 3. Run it

**Prompt:** `now run`
**Outcome:** built the page and opened it in the browser.

## 4. Question about the framework

**Prompt:** `why index.html use full react frame work using .ts`
**Outcome:** explained the framework-free TypeScript choice and offered a React version; the team chose
in the next prompt.

## 5. Scalable React + TypeScript + Tailwind app

**Prompt:** `not index.html make it scaleble framework with type scripts and tailwind with beautiful ui`
**Outcome:** a Vite + React 18 + TypeScript + Tailwind project (`web/`) with an engine layer, a typed
reducer store, design-system components and feature folders; parity now runs the TypeScript engine
directly. 55 UI checks passed.

## 6. Organise the UI into pages

**Prompt:** `more organized way design the ui here show the massy way huge information one page if need make multiple page make the best ui design`
**Outcome:** a multi-page app (Overview, Documents and document detail, Requirements and requirement
detail, Evidence graph, Findings and Integrity alerts, Simulate, Actions and R1 workflow, Report) with
grouped sidebar navigation and a mobile drawer. 68 UI checks passed.

## 7. Convenience and theme

**Prompt:** `make more convinenet and design and beautiful theme`
**Outcome:** a deep-indigo sidebar and Overview summary panel, page header icons, a Ctrl+K command palette,
a System/Light/Dark theme switch and a two-row mobile header. 70 UI checks passed.

## 8. Create the submission links

**Prompt:** the submission form's link fields (YouTube, Facebook, GitHub, Figma, Demo/Live, Other), pasted,
followed by `now make all these things`
**Outcome:** a public GitHub repository, GitHub Pages deployment through GitHub Actions, a 163-second
narrated demo video recorded from the live site, and `docs/SUBMISSION_LINKS.md`.

## 9. Test credentials for judges

**Prompt:** the form's "Test credentials for judges" field, pasted, followed by `want this`
**Outcome:** a demo sign-in with three public roles (Compliance Officer, Factory staff, Guest), enforced in
the workflow and labelled as not real authentication. 80 UI checks passed.

## 10. Does the video need updating?

**Prompt:** `vedio need to update ?`
**Outcome:** confirmed the video was current and listed optional improvements.

## 11. Restructure the video to the 180-second pitch standard

**Prompt:** the event's "Idea to Unicorn Pitch Standard" (Problem, Solution, Demo, AI approach, Impact and
the mandatory items), pasted.
**Outcome:** the video was rebuilt as five labelled segments (174.6 s): user and urgency slides, solution,
the live demo, an input-to-AI-to-output pipeline slide tagged live or planned, and the pilot KPIs and
next steps.

## 12. AI Detail Usage answers

**Prompt:** the form's "AI Detail Usage" section, pasted, followed by `write in docs ... all answer`
**Outcome:** `docs/AI_USAGE.md` with honest answers and tick lists for every field (only what was
actually used is ticked).

## 13. Data & AI Provenance, Tooling & IDE, MCP, Prompt Library

**Prompt:** the form's "Data & AI Provenance", "Tooling & IDE", "MCP Usage" and "Prompt Library"
sections, pasted, followed by `make docs for tis`
**Outcome:** `docs/SUBMISSION_FIELDS.md` rewritten to match each form box, and this prompt library.
