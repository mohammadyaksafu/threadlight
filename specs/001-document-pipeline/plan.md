# Plan

- LangGraph `StateGraph` with nodes ingest, parse, redact, classify, extract, validate, human_review (interrupt),
  index, map_clauses, analyze, draft, request_approval, approval (interrupt), finalize. Postgres checkpointer.
- Router picks models from `backend/llm/models.yaml`; prompts from `backend/prompts/`.
- Validation in `backend/guardrails/validators.py`; review threshold 0.85.
- Jobs on arq (Redis); `INLINE_JOBS=true` for tests and laptops.
