# ThreadLight

**A compliance evidence platform for garment exporters.** ThreadLight turns a factory's
scattered certificates, logs and minutes into a *Verified Evidence Passport*: every buyer
requirement is linked to the documents that support it, every gap is explained with a cited
source, and no finding is closed until a named person approves it.

Prototype for the International AI Builders Congress, track JusticeSphere AI > ComplianceOS.

> **Synthetic data notice.** Every factory, buyer, framework, document and reference number in
> this repository is invented ("Sample Apparel Ltd.", "Buyer A (synthetic)", "Buyer A Code of
> Conduct v3.2 (synthetic)"). No real company, buyer or standard is represented. The **offline demo**
> (GitHub Pages) makes no language-model, OCR or network API calls; the only external request is for
> Google Fonts. The **v2 backend** below does call models (Gemini, local Ollama models), on synthetic files only.

## v2: live backend (in this repository)

The prototype now has a real pipeline behind it. **Models read, rules decide, people approve.**

```
upload (API / n8n e-mail / MCP) -> parse (Docling, PDF text, Tesseract eng+ben) -> PII redaction (Presidio)
  -> classify (Llama 3.2 3B local, Gemini Flash-Lite fallback) -> extract cited fields (Gemini, JSON schema)
  -> validate (quote on page, value in quote) -> [human review if unsure] -> index (contextual chunks,
  pgvector + full text) -> propose clause mappings (hybrid search, rewrite/HyDE, reranker)
  -> the same rules engine -> bilingual draft with source tags -> [officer approval] -> passport
```

| Part | Where | Docs |
|---|---|---|
| FastAPI API (JWT, roles, Postgres row-level security, OpenAPI at `/api/docs`) | `backend/app/` | [docs/SECURITY.md](docs/SECURITY.md) |
| LangGraph pipeline with two human interrupts, arq workers | `backend/pipeline/` | [specs/001-document-pipeline](specs/001-document-pipeline/spec.md) |
| LLM router, versioned prompts, Gemini / Ollama / optional Anthropic providers | `backend/llm/`, `backend/prompts/` | [docs/MODEL_ROUTING.md](docs/MODEL_ROUTING.md) |
| Retrieval | `backend/rag/` | [docs/RAG.md](docs/RAG.md) |
| threadlight-mcp (9 tools, 3 resources, 2 prompts; stdio + HTTP) | `mcp_server/` | [docs/MCP.md](docs/MCP.md) |
| Synthetic PDFs and scans with ground truth (60 docs, EN + BN) | `synth/` | |
| Evaluations (extraction, retrieval, drafts, promptfoo) | `evals/` | `evals/reports/` |
| Docker Compose for one VPS, Caddy, CI/CD, backups; n8n workflows | `deploy/`, `automation/n8n/` | [docs/DEPLOY.md](docs/DEPLOY.md) |
| Live mode in the web app (Upload, Review queue, System pages) | `web/src/api/`, `web/src/pages/live/` | [specs/003-live-web](specs/003-live-web/spec.md) |

Run it locally (Windows; see [CLAUDE.md](CLAUDE.md) for all commands):

```
docker run -d --name tl-test-pg -e POSTGRES_PASSWORD=postgres -p 5434:5432 pgvector/pgvector:pg16
docker run -d --name tl-test-redis -p 6381:6379 redis:7-alpine
python -m venv .venv && .venv/Scripts/pip install -r backend/requirements.txt
copy deploy\.env.example .env      # then set GEMINI_API_KEY and the local database URLs (see .env in the repo docs)
.venv/Scripts/alembic -c backend/alembic.ini upgrade head && .venv/Scripts/python -m backend.db.seed
.venv/Scripts/uvicorn backend.app.main:app --port 8000
cd web && set VITE_API_BASE=http://localhost:8000/api && npm run dev
```

Status: live (lite profile, plain HTTP for now) at **http://165.99.219.251:8095/**; sign in with "Live API" and a demo
account below. Tested on the laptop and on the VPS (backend tests, live Gemini runs that reproduce coverage 29 / risk 63,
evaluation reports, live browser check 11/11). See [docs/DEPLOY.md](docs/DEPLOY.md). Plan and status: [update/plan.md](update/plan.md).

## The scenario

A factory 30 days before an audit (scenario today 2026-10-22, audit 2026-11-21). Eight
requirements, six documents, one corrective action. The engine finds an expiring fire
certificate that affects two requirements, an expired environmental clearance with a spelling
variant of the factory name, safety-committee minutes that cite a certificate number not on
file, a missing payroll summary and a corrective action marked complete with no proof.

Baseline: coverage 29%, decision-support risk index 63/100, 6 open findings. Uploading the
renewed certificate moves R1 and R5 to *pending human review* (coverage stays 29%); only after
a person approves it as Compliance Officer do they become *supported* (coverage 55%).

## Implemented vs planned (v1 offline prototype; see the v2 section above for what is now built)

| Implemented in this prototype | Planned (not in this repo) |
|---|---|
| Deterministic rules engine in Python (stdlib) and a TypeScript port with a parity test; React + TypeScript + Tailwind web app | OCR of scanned PDFs |
| Expiry, coverage and max-age checks against the audit date | Language-model clause extraction from buyer codes |
| Evidence-integrity alerts: entity mismatch, invalid dates, reference mismatch, missing reference, closure without proof | Hybrid retrieval and reranking over documents |
| Evidence graph (one document, many requirements) | Language-model drafting of explanations and reports |
| Decision-support risk index and coverage, what-if simulation | Authentication, roles, tenant isolation |
| Ranked task plan with owner, due date and proof needed | MCP server for buyer and auditor integrations |
| Demo sign-in with three public roles (browser-only, not real auth) | Real authentication and authorisation |
| Finding lifecycle with human-only assign/close and approval gate | Real pilot data |
| Bilingual (English / Bangla) template report | |

Anything the full design would do with a language model or OCR (reading documents, extracting
clauses) appears in the demo as a **pre-extracted sample result** and is labelled that way.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository layout

```
data/sample.json                 synthetic scenario, shared by Python, the tests and the web app
threadlight/engine.py            rules engine (stdlib only)
threadlight/lifecycle.py         finding lifecycle and approval rules
tests/test_engine.py             unit tests (unittest)
tests/parity.py                  Python vs TypeScript parity test (7 scenarios)
tests/ui_check.js                headless-browser check of the built web app
web/                             React 18 + TypeScript + Tailwind CSS app (Vite)
  src/engine/                    engine.ts, lifecycle.ts, types.ts: typed ports of the Python code
  src/store/                     reducer.ts (pure state transitions) + ThreadLightProvider (React context)
  src/components/ui/             design-system primitives (Button, Card, StatusPill, PageHeader, List, ...)
  src/components/layout/         AppShell, Sidebar (drawer on mobile), StatusBar (live readiness figures),
                                 CommandPalette (Ctrl+K search and jump)
  src/pages/                     one page per screen, with list -> detail pages:
                                 Overview, Documents (+ detail), Requirements (+ detail), Evidence graph,
                                 Findings (+ Integrity alerts), Simulate, Actions (+ R1 workflow), Report
  src/routes.tsx, src/nav.ts     route table and sidebar groups: add a page here
  src/lib/                       vocabulary (English/Bangla labels), hooks (theme, reduced motion)
  src/styles/index.css           design tokens (light/dark) + Tailwind layers
.github/workflows/pages.yml      CI: tests, parity, build, deploy to GitHub Pages
tools/video/                     script that records the demo video from the live site (TTS narration)
docs/                            ARCHITECTURE, EVALUATION, REFERENCES, SUBMISSION_FIELDS, SUBMISSION_LINKS,
                                 AI_USAGE, DATA_LIFECYCLE (form answers), PROMPT_LIBRARY, VIDEO_SCRIPT
```

## Run the web app

Requires Node.js 22.6+ (the parity test runs the TypeScript engine directly in Node).

```
cd web
npm install          # once
npm run dev          # development server with hot reload, prints a localhost URL
npm run build        # strict type-check (tsc -b) + production build into web/dist
npm run preview      # serve the production build locally
```

Stack: **React 18**, **TypeScript 5** (strict, `erasableSyntaxOnly`), **Tailwind CSS 3**, **Vite 6**,
lucide-react icons. Everything is bundled at build time; the app makes no network request
except Google Fonts. Colours are CSS-variable tokens, so light and dark themes (system setting
or the Theme button) switch tokens rather than classes.

The app opens on an **Overview** dashboard. Each section is its own page, grouped in the sidebar
(Evidence, Analysis, Resolve); lists open detail pages (for example `#/requirements/R1`, `#/documents/D1`).
Suggested path: Documents > Run analysis > Evidence graph (click D1) > Findings (open R1, then
Integrity alerts) > Simulate > Actions > R1 workflow (Assign, Upload, try Close, Approve, Close) >
Report (switch to Bangla). Keys `1`-`7` open the seven sections; **Ctrl+K** (or `/`) opens a search
palette to jump to any page, requirement or document. The sidebar has a System / Light / Dark theme switch.

## Demo accounts

The live demo opens on a **demo sign-in** page. These are public, throw-away accounts. This is not real
authentication: the check runs in the browser and only decides which demo buttons are enabled. All data is synthetic.

| Role | Email (username) | Password | What it can do |
|---|---|---|---|
| Compliance Officer | `officer@threadlight.demo` | `Officer-Demo-2026` | Everything: assign, upload, approve and close findings |
| Factory staff | `staff@threadlight.demo` | `Staff-Demo-2026` | Assign and upload evidence; approve/close are blocked |
| Guest (read-only) | `guest@threadlight.demo` | `Guest-Demo-2026` | Browse every page; no workflow actions |

Each account also has a one-click "Demo accounts" button on the sign-in page.

## Run the tests

Requires Python 3.8+, Node.js 22.6+ and, for the UI check, Chrome or Edge.

```
python3 -m unittest discover -s tests      # 37 unit tests
python3 tests/parity.py                    # 7 scenarios, Python vs TypeScript, must be identical
cd web && npm run build && npm run test:ui # drives the built app in headless Chrome/Edge
python -m pytest backend/tests -q          # v2 backend: 23 tests (needs the test Postgres on :5434)
```

On Windows use `python` instead of `python3` if needed.

## Deploy to GitHub Pages

1. `git init && git add . && git commit -m "ThreadLight prototype"` and push to a new GitHub repository (branch `main`).
2. Repository **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml`: unit tests, parity test, `npm ci`,
   `npm run build`, then publishes `web/dist`. Vite uses relative asset paths (`base: "./"`), so
   the app works at `https://<user>.github.io/<repo>/`.

Live demo: https://mohammadyaksafu.github.io/threadlight/  
Source: https://github.com/mohammadyaksafu/threadlight  
Video: [FILL: YouTube link]. It is generated by `tools/video/` (see docs/SUBMISSION_LINKS.md).

## Honesty rules this project follows

- All data is synthetic; public figures in the docs come only from [docs/REFERENCES.md](docs/REFERENCES.md).
- The risk number is a **decision-support index**, not an audit score or probability.
- Contradictions are **evidence-integrity alerts**, not fraud accusations.
- The report is a **draft for human review, not an audit result**.
- No accuracy claims: see [docs/EVALUATION.md](docs/EVALUATION.md).
