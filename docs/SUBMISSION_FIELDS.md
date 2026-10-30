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

> **Built (2), both with the official MCP Python SDK (FastMCP):**
> 1. **threadlight-mcp** (`mcp_server/server.py`): a factory's live Verified Evidence Passport from Postgres.
>    Transports: stdio, SSE (`--sse`, `/sse`) and streamable HTTP (`--http`, `/mcp` behind Caddy). JWT bearer
>    token on every HTTP/SSE request (401 without one); tenant and role come from the token.
> 2. **threadlight-rules-mcp** (`mcp_server/rules_server.py`): the deterministic rules engine over the bundled
>    synthetic scenario, no database and no login, so anyone can try the passport logic. stdio, SSE and
>    streamable HTTP; public at http://165.99.219.251:8095/rules-mcp.
>
> **Used during development (external):** CloudCamp BD knowledge-base MCP (streamable HTTP, read-only resource,
> 2026-10-31) to audit the submission; Postgres MCP (`@modelcontextprotocol/server-postgres`) and Filesystem MCP
> (`@modelcontextprotocol/server-filesystem`) configured in `.mcp.json` [FILL: keep only if the dated row in
> docs/MCP.md exists].
>
> **Hosts/clients:** Claude Code via the project `.mcp.json`; Claude Desktop config in docs/MCP.md; MCP Python SDK
> `ClientSession` for tests and the stdio/SSE/HTTP smoke test (`tools/mcp_smoke.py`). Both servers are thin
> adapters that reuse the same engine, RAG search and passport services as the web app and API (no duplicated
> logic). Tests: `backend/tests/test_mcp.py`, `backend/tests/test_rules_mcp.py` (10 passed). Details: docs/MCP.md.

### tools exposed

> **threadlight-mcp (9 tools, 3 resources, 2 prompts):** `get_passport`, `list_requirements`, `get_requirement`
> (reasons, cited evidence with file and page, clause text), `list_alerts`, `search_evidence` (hybrid RAG with
> citations like D1:p1), `get_document` (extracted fields with page, confidence, source text), `what_if`
> (hypothetical expiry, nothing saved), `get_report` (bilingual draft), `propose_mapping` (proposal only).
> Resources `passport://{factory_id}`, `framework://{framework_id}/clauses`, `audit-log://{factory_id}`; prompts
> `audit_prep_brief`, `explain_finding`.
>
> **threadlight-rules-mcp (7 tools, 2 resources, 1 prompt):** `get_scenario`, `list_requirements`,
> `get_requirement`, `list_alerts`, `get_task_plan`, `what_if_expiry`, `what_if_renewal`; resources
> `sample://dataset`, `sample://result`; prompt `gap_walkthrough`.

### permissions

> Read is the default scope for every role; `propose_mapping` needs staff or officer and only creates a proposal
> that a Compliance Officer confirms in the app. No MCP tool can approve evidence, close a finding or change a
> rule. Every threadlight-mcp query runs in a tenant transaction with Postgres row-level security (a token for
> another tenant gets an error, tested) and proposals are written to the audit log as `<user>/mcp`. The rules
> server has no write path and reads only synthetic sample data. External servers were scoped: Filesystem MCP to
> `synth/out` and `evals/reports` only, Postgres MCP to the local test database, CloudCamp read-only. Output from
> external servers is treated as data, not instructions.

---

## Prompt Library (team only)

Add the prompts from **docs/PROMPT_LIBRARY.md** with "Add Prompt", one entry per prompt (13 prompts,
starting with the build specification).
