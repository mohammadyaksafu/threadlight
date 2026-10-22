# Submission form: Data & AI Provenance, Tooling & IDE, MCP Usage

Paste-ready answers, one block per form box, in the order the form shows them. Replace any [FILL]
before submitting. More detail on AI usage is in docs/AI_USAGE.md; the prompts are in
docs/PROMPT_LIBRARY.md.

---

## Data & AI Provenance (required · visible to judges and admins)

### data sources

> **Synthetic dataset, made for this project:** `data/sample.json`. It contains one factory ("Sample
> Apparel Ltd."), one buyer ("Buyer A (synthetic)"), one framework ("Buyer A Code of Conduct v3.2
> (synthetic)"), 8 requirements, 6 documents, 1 renewal and 1 corrective action. Every name, reference
> number, date, file name, page number and extraction-confidence value is invented. No real company,
> buyer, standard, worker or personal data is included.
>
> **No APIs, no scraped data, no third-party datasets.** The app makes no network calls except loading
> Google Fonts.
>
> **Public figures, used only in the pitch text and video (not loaded into the app):** five cited sources:
> Fibre2Fashion and Dhaka Tribune (Export Promotion Bureau export data), the RMG Sustainability Council
> Monthly Report June 2025, UNI, and DLA Piper on the EU CSDDD Omnibus I amendments. Each is listed with
> its caveat in docs/REFERENCES.md.

### ai models

> **Used to build the project:** Claude Opus 5.5 (Anthropic), through Claude Code, Anthropic's agentic
> coding tool. It wrote the code, tests, documentation and video tooling, directed by the team's prompts
> (see the Prompt Library). [FILL: add any other AI tool you used yourself, or delete this sentence.]
>
> **Used inside the product at runtime:** none. The prototype makes no language-model, OCR or AI API
> calls. Every status, alert, score, plan and report comes from deterministic rules, written in Python
> with a TypeScript port that is tested to give identical output. The steps a model would do in the
> full design (reading documents, extracting clauses) appear as pre-extracted sample results and are
> labelled that way in the UI.
>
> **Video narration:** the offline Windows text-to-speech voice "Microsoft Zira Desktop". It is a
> synthetic voice, not a person, and not a language model.
>
> **Planned, not built:** OCR plus LLM structured extraction, hybrid retrieval with reranking for
> clause-to-evidence matching, and LLM drafting of bilingual explanations, always behind the rules
> engine and human approval.

### responsible ai

> - **Models never decide.** Dates, coverage, statuses and the risk figure come from deterministic,
>   unit-tested rules. In the planned design, models only read text and draft wording.
> - **Transparency.** Every finding cites its source file and page, shows extraction confidence, and
>   states the "limit of this conclusion". The UI labels each pipeline stage as "rules" or "sample
>   extraction", and a banner on every page says the data is synthetic and the extraction results are
>   pre-computed.
> - **Human in the loop.** A newly uploaded document stays "pending human review" and does not count as
>   coverage until a named person approves it. An AI actor can never close a finding; this is enforced in
>   the lifecycle code and tested. In the demo, only the Compliance Officer role can approve or close.
> - **No over-claiming.** The risk number is a "decision-support index", not an audit score or a
>   probability. Contradictions are "evidence-integrity alerts", prompts to check rather than accusations.
>   The report says "Draft for human review. Not an audit result." docs/EVALUATION.md states that the
>   tests are not an accuracy benchmark.
> - **Fairness and language access.** Statuses and the report are available in Bangla as well as English,
>   so factory staff are not limited to English. The Bangla text is template-generated and flagged for
>   native-speaker review.
> - **Privacy.** Synthetic data only, no personal data, no external API calls. The demo sign-in is
>   browser-only and clearly labelled as not real authentication.
> - **Bias and limits.** The rules treat every factory and document the same way. Their main risk is
>   missing evidence that sits outside the file set, so an "insufficient" status says the evidence "may
>   exist elsewhere" rather than that the factory fails. Before any real use, the planned pilot will
>   compare the system's statuses with a compliance officer's judgement (docs/EVALUATION.md).

---

## Tooling & IDE (required · team only)

### IDE / Editor

> **Claude Code** (Anthropic's terminal coding agent) on Windows. If the dropdown has no Claude Code
> option, choose "Other" and type "Claude Code (CLI)". [FILL: add any editor you also used, e.g. VS Code.]

### Deployment Method

> **GitHub Pages, deployed by GitHub Actions.** On every push to `main`: Python unit tests, then the
> Python/TypeScript parity test, then `npm ci`, a strict type-check and `vite build`, then publish
> `web/dist` to GitHub Pages. It is a static site: no server, no database, no Docker.
> Live: https://mohammadyaksafu.github.io/threadlight/

### Frameworks & Libraries

> React 18, React Router 6, TypeScript 5 (strict), Vite 6, Tailwind CSS 3 (with PostCSS and
> Autoprefixer), lucide-react icons; Python 3 standard library and `unittest` for the rules engine; Node.js
> (the parity test runs the TypeScript engine directly); headless Chrome over the DevTools protocol for
> UI tests and video capture; FFmpeg for video assembly; Google Fonts (Schibsted Grotesk, IBM Plex Mono,
> Noto Sans Bengali). No AI or ML frameworks (no LangChain, TensorFlow or similar), because the prototype
> makes no model calls.

### Context / Memory Files

> **None.** There is no CLAUDE.md, .cursorrules or similar file in the repository. Context came from
> one written build specification (the first prompt in docs/PROMPT_LIBRARY.md), which set the honesty
> rules, repository layout, data, engine rules and expected test results, followed by short iteration
> prompts. The repository docs (README, docs/ARCHITECTURE.md, docs/EVALUATION.md) now serve as the
> project's reference context.

---

## MCP Usage (team only)

### mcp servers

> None. No Model Context Protocol server was built or used in this project. An MCP server is planned so
> buyer and auditor tools can query a factory's Evidence Passport with the factory's consent (see
> docs/ARCHITECTURE.md, "Planned").

### tools exposed

> None yet. Planned tools (read-only, per factory): `get_passport_summary`, `list_requirements`,
> `get_requirement` (status, reasons, cited evidence), `list_integrity_alerts`.

### permissions

> None granted, since no MCP tools exist. The planned design is read-only access, scoped to one factory
> (tenant), granted by the factory, with every request logged. No write or close permissions: closing a
> finding stays a human action inside the app.

---

## Prompt Library (team only)

Add the prompts from **docs/PROMPT_LIBRARY.md** with "Add Prompt", one entry per prompt (13 prompts,
starting with the build specification).
