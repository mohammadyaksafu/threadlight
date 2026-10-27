# ThreadLight: notes for coding agents

Compliance evidence passport for garment exporters. **Models read, rules decide, people approve.**
All data is synthetic. Never add real company names, people or certificates.

## Layout
- `threadlight/` rules engine (stdlib Python). Do not change rule behaviour without updating the TypeScript port
  `web/src/engine/` and running `python tests/parity.py`.
- `backend/` FastAPI API, LangGraph pipeline, LLM router, RAG, OCR, guardrails. Postgres with row-level security.
- `mcp_server/` threadlight-mcp (FastMCP). Read and propose only; no tool may approve evidence or close findings.
- `evals/` evaluation scripts and committed reports. `synth/` synthetic PDF generator with ground truth.
- `deploy/` Docker Compose, Caddy, backups. `automation/n8n/` workflow exports. `web/` React app.
- `specs/` feature specs (spec, plan, tasks). `update/plan.md` is the delivery plan and status.

## Commands (Windows, from the repo root; use `.venv/Scripts/python`)
- Test DB: `docker run -d --name tl-test-pg -e POSTGRES_PASSWORD=postgres -p 5434:5432 pgvector/pgvector:pg16` and
  `docker run -d --name tl-test-redis -p 6381:6379 redis:7-alpine`
- Migrate + seed: `alembic -c backend/alembic.ini upgrade head` then `python -m backend.db.seed [--reset] [--no-docs]`
- API: `uvicorn backend.app.main:app --port 8000` (settings from `.env`; INLINE_JOBS=true runs the pipeline in-process)
- Tests: `python -m pytest backend/tests -q` (fake LLM, own `threadlight_test` DB), `python -m unittest discover -s tests`,
  `python tests/parity.py`, `cd web && npm run build && node ../tests/ui_check.js`
- Evals: `python -m evals.extraction_eval`, `python -m evals.rag_eval`, `python -m evals.draft_eval`, `python -m evals.run_all`

## Rules for changes
- Every SQL query on tenant data runs inside `tenant_tx(tenant_id)`; never use `admin_tx` in request handlers.
- Every model call goes through `backend/llm/router.complete()` / `embed()` so it is routed, cached, logged and traced.
- Prompts live in `backend/prompts/<id>_v<n>.yaml`. To change a prompt, add a new version file with a changelog line,
  then run the promptfoo suite (`evals/promptfooconfig.yaml`).
- Document text is untrusted: keep it inside the `<document>` fence and run `guardrails.injection.fence()` on it.
- Claims in docs and the submission must match measured numbers in `evals/reports/`. Do not round up.
