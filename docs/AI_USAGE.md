# AI Detail Usage: draft answers

Paste-ready answers for the "AI Detail Usage" section of the submission form. Each heading matches a
form field. Under each one, **Tick** lists the checkboxes to select and **Paste** is the text for the box.

**Honesty rule for this form:** only tick what was actually used. Judges can check the repository.
ThreadLight has two separate stories, and every answer keeps them apart:

1. **How we built it:** the whole codebase, docs, tests and video tooling were written with an AI
   coding agent, Claude Code running Claude Opus 5.5 (model id `claude-opus-5-5`), directed by the team.
2. **What the product does at runtime:** the prototype makes **no** language-model calls. Decisions come
   from deterministic rules. The LLM, OCR and RAG parts are a documented design marked **planned**.

Where something is planned and not built, the answer says so. Leave a box empty rather than tick
something that was not used.

---

## Prompt Usage (/10)

**Paste:**

> **Building the product.** We used spec-driven prompting with Claude Code (Claude Opus 5.5). The main
> build prompt was one structured specification: the role and goal, non-negotiable honesty rules (synthetic
> data only, no LLM calls in the demo, no invented statistics, wording rules such as "decision-support
> index" and "evidence-integrity alert"), the exact repository layout, the full synthetic scenario, the
> engine rules, and the expected results written as test assertions (baseline coverage 29, risk index 63,
> 29 then 55 after approval). Writing the expected outputs into the prompt let the agent check its own
> work: it ran the unit tests, a Python-vs-TypeScript parity test and a headless-browser UI check, and fixed
> the code until they passed. We then iterated with short follow-up prompts (TypeScript + Tailwind,
> React, a multi-page layout, theme and command palette, demo sign-in, the 180-second video structure).
> Each iteration was committed to git, so the prompt history maps to the commit history.
>
> **Planned product prompts (not built yet).** Field extraction will use role prompting plus a strict
> JSON schema (type, reference, entity, issue and expiry dates, file and page for every field, `null`
> when a field is absent), with few-shot examples taken from the synthetic documents. Report drafting will
> receive only the rule output and must cite it. Prompts will be stored as versioned files next to the
> code, with a regression set re-run on every change.

## Token Optimization (/10)

**Tick:** Anthropic Prompt Caching (used by Claude Code during the build). Do **not** tick the others;
they are planned, not used.

**Paste:**

> **At runtime the product spends zero tokens.** Dates, coverage, contradictions, risk index, the plan and
> the bilingual report are computed by deterministic rules in the browser (about 1 ms per analysis), so
> no part of a decision depends on a model call. This was a deliberate design choice: the cheapest and
> most reliable token is the one never sent.
>
> **During the build**, Claude Code used Anthropic prompt caching for the long-running session context, and
> it compacts or summarises earlier context automatically when the conversation grows.
>
> **Planned for the AI layer:** structured outputs (JSON schema) for extraction so responses stay short and
> parseable; routing extraction and classification to a small model and only drafting to a larger one;
> caching the buyer-code clauses, which are reused across every document; and sending the model only the
> page that contains a field rather than the whole PDF.

## LLMs / Models Used (/15)

**Tick:** Claude.
**Add:** [FILL: any other model you personally used for this project, for example ChatGPT for
brainstorming. Leave it out if none.]

## How & why did you use these LLMs? (/5)

**Paste:**

> Claude Opus 5.5 in Claude Code (Anthropic's agentic coding tool in the terminal) wrote the Python rules
> engine and its unit tests, the TypeScript port and parity test, the React + TypeScript + Tailwind web app,
> the headless-browser UI test, the GitHub Actions deploy workflow, the documentation and the
> video-recording script. We chose it for long, multi-file work that needs to run its own tests and fix
> failures. It also ran commands, read test output and inspected screenshots of the app to fix layout
> problems. The shipped prototype itself calls no LLM. In the planned product, a small fast model would do
> field extraction and a stronger model would draft the explanations, always behind the rules and a human
> approval step.

## Retrieval & RAG (/12)

**Tick:** Knowledge Graph / Other Graph Methods (only this one).

**Paste in the notes if there is room:**

> Implemented: a deterministic evidence graph that links each document to every requirement it supports,
> coloured by status. This is what shows that one fire certificate affects two requirements. It is a typed
> graph built by rules, not LLM-based GraphRAG. Hybrid search, reranking and contextual RAG are planned and
> not ticked.

## RAG architecture details (/5)

**Paste:**

> **Today:** there is no vector index or embedding model. Clause-to-evidence links come from typed evidence
> requirements in the synthetic buyer code (for example "fire_certificate") and are stored as a graph:
> document nodes, requirement nodes, edges carrying the status, and alert nodes that point at the documents
> that disagree.
>
> **Planned:** data sources are factory PDFs and scans (English and Bangla) plus buyer codes of conduct.
> Chunking is layout-aware per page and section, so every chunk keeps a file and page citation. Retrieval
> is hybrid: BM25 keyword search (reference numbers and dates matter) combined with vector search, then a
> reranker. Results are filtered by factory (tenant) and document type. Retrieved candidates only *propose*
> links; the rules engine decides status, and a person confirms any new clause mapping.

## MCP (Model Context Protocol) Usage (/20)

**Leave "We built and/or used MCP servers" unticked.** No MCP server was built or used in this build.

**Paste if there is a notes box:**

> Not used yet. An MCP server is planned so that buyer and auditor tools can query a factory's Evidence
> Passport (requirements, statuses, cited evidence) with the factory's consent. It is listed under
> "Planned" in docs/ARCHITECTURE.md.

## Open Source Tools & Libraries (/8)

**Paste:**

> React 18 and React Router (the multi-page app with hash routing for GitHub Pages); TypeScript 5 in strict
> mode (the engine port and the UI); Vite 6 (build); Tailwind CSS 3 with PostCSS and Autoprefixer
> (design-token theming, light and dark); lucide-react (icons); the Python standard library and `unittest`
> (rules engine and tests); Node.js built-in TypeScript stripping (the parity test runs the TypeScript engine
> directly against Python); FFmpeg (video assembly); Google Fonts: Schibsted Grotesk, IBM Plex Mono and
> Noto Sans Bengali (Bangla text). No AI/LLM libraries such as LangChain or LlamaIndex are used, because the
> prototype makes no model calls.

## Agent Frameworks & Orchestration (/7)

**Paste:**

> No agent framework is used. The product's "seven agents" (Requirement Intelligence, Evidence
> Intelligence, Gap Auditor, Contradiction Engine, Risk and Audit Twin, Remediation Planner, Report Agent)
> are pipeline stages in custom deterministic code. Two of them are shown with pre-computed sample
> extraction, and the UI labels each one "rules" or "sample extraction". The planned version keeps a fixed,
> auditable pipeline instead of free-running agents: models extract and draft, rules decide, people
> approve. The build itself was orchestrated by Claude Code's agent loop, which edits files, runs commands
> and tests, and reads screenshots.

## Fine-tuning / Adaptation (/5)

**Leave blank** (none). Optional note:

> None. Planned: evaluate extraction on a labelled pilot set before considering any fine-tuning.

## Evaluation & Quality Measurement (/7)

**Paste:**

> We measure correctness of the rules, not model accuracy, because the prototype has no model. There are
> 37 Python unit tests (75 assertion statements) for the expected scenario results and every lifecycle
> rule. A parity test runs 7 scenarios through the Python and TypeScript engines and requires identical
> output. An 80-check headless-browser UI test clicks through the live app's flows: sign-in roles,
> baseline figures, the what-if boundaries, the human-approval gate, the Bangla report, 400 px mobile
> layout, dark mode, and no network calls except fonts. All of these run in CI on every push before
> deploying. This is not an accuracy benchmark (see docs/EVALUATION.md). Planned pilot metrics, left
> blank until measured: field-extraction accuracy against human labels, clause-to-evidence recall,
> agreement with a compliance officer's status, alert precision, missed issues, and preparation time.

## Guardrails, Safety & Privacy (/6)

**Paste:**

> - **Rules decide, models never do.** Status, dates, coverage and risk come from deterministic code with
>   tests.
> - **Citations.** Every finding shows its source file, page and extraction confidence, plus a stated
>   "limit of this conclusion".
> - **Human approval gate.** A new document stays "pending human review" and does not count as coverage
>   until a named person approves it. The lifecycle refuses to let an AI actor close a finding, checked
>   in both the UI and the state logic.
> - **Careful wording.** The risk number is a "decision-support index", not an audit score. Contradictions
>   are "evidence-integrity alerts", not accusations. The report is labelled "Draft for human review. Not
>   an audit result."
> - **Privacy.** All data is synthetic and contains no personal data. The app calls no external API
>   besides Google Fonts. The demo sign-in is browser-only and labelled as not real authentication.
>
> Planned: JSON-schema validation of every model output; low-confidence fields routed to human review;
> PII redaction before any model call; tenant isolation.

## Frontend AI / Visual App Builders (+1 each, max 5)

**Tick:** none of the listed builders (Lovable, v0, Bolt, Claude Artifacts and the rest were not used).
**Add:** Claude Code (Anthropic's agentic CLI).

**How did you use these tools? Paste:**

> The front end was written as code by Claude Code. We did not use a visual builder. It went through
> several iterations driven by our prompts: a single page, then TypeScript + Tailwind, then React, then a
> multi-page app with sidebar navigation, then the indigo theme, command palette (Ctrl+K) and demo
> sign-in. Practically all of the UI code was AI-generated; the team set the requirements, judged the
> design from screenshots and asked for changes. The agent verified each version with an automated
> headless-browser test and by inspecting screenshots at desktop and 400 px widths.
> [FILL: describe any manual code review or edits you made.]

## Workflow Automation (+1 each, max 4)

**Tick:** none of the listed platforms. **Add:** GitHub Actions.

**Paste:**

> GitHub Actions runs on every push to `main`: Python unit tests, then the Python/TypeScript parity test,
> then `npm ci` and a strict type-check plus production build, then deploy to GitHub Pages. A failing test
> blocks the deploy. The demo video is also reproducible: a script synthesises the narration offline,
> drives the live site in headless Chrome, records each scene and assembles the video with FFmpeg.

## Local / On-device LLMs

**Leave blank.** No local LLM runtime or model was used. (The video narration uses the Windows built-in
text-to-speech voice, which is not an LLM.)

## Agentic Frameworks Used

**Leave blank** (none of the listed frameworks). The build agent was Claude Code; see "Agent Frameworks &
Orchestration".

## AI Development Lifecycle (AI-DLC)

**Tick:** none of the listed frameworks were adopted as such. **Add:** "Spec-driven development with
Claude Code (spec prompt with acceptance tests)".

**Process notes, paste:**

> 1. **Spec:** a single specification prompt with the honesty rules, repository layout, synthetic data,
>    engine rules and expected results as test assertions.
> 2. **Engine first:** Python rules engine and unit tests, run until green.
> 3. **Port and parity:** TypeScript engine, with a parity gate requiring identical results across 7
>    scenarios.
> 4. **UI:** built against the passing engine, verified by an automated headless-browser test and
>    screenshot review.
> 5. **Docs:** split into "Implemented in this prototype" and "Planned", with honest evaluation and
>    references.
> 6. **Iterate:** each user-feedback round (stack change, layout, theme, sign-in, video structure) re-ran
>    every test before commit.
> 7. **Ship:** git commits, then CI with tests, parity, build and deploy, then the live demo.
>
> Review gates: unit tests, parity, UI checks, a grep for any network call other than fonts, and a check
> for any claim that an LLM runs in the demo.

## Build a Live /docs Module (Recommended)

**Current state:** documentation lives in the repository's `docs/` folder (ARCHITECTURE, EVALUATION,
REFERENCES, SUBMISSION_FIELDS, SUBMISSION_LINKS, VIDEO_SCRIPT, AI_USAGE) and in the README. There is
no live /docs page in the app yet. Tick this only if you want a /docs page added to the web app; it can
reuse these files.

## Anything else about your AI usage?

**Paste:**

> Our most deliberate AI decision is where *not* to use a model. Compliance evidence has to survive an
> audit, so models are limited to reading and drafting, deterministic rules make every decision, and
> only a named person can close a finding. The prototype proves that decision layer end to end (with
> tests, a Python/TypeScript parity check and CI) before any model is added. It also labels honestly
> what is live and what is planned. Everything is in English and Bangla. The video narration is a
> synthetic text-to-speech voice, disclosed in the submission.
