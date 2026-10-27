# Specs

Spec-Kit style: one folder per feature with `spec.md` (what and why, acceptance checks), `plan.md` (how) and
`tasks.md` (ordered checklist). Coding agents build from these; a task is ticked only when its check passes.

| Feature | Status |
|---|---|
| 001 document pipeline | implemented, tested (`backend/tests/test_api.py`) |
| 002 MCP server | implemented, tested (`backend/tests/test_mcp.py`, HTTP smoke test in `docs/MCP.md`) |
| 003 live web mode | implemented, tested (`tests/ui_check.js` offline 80/80, `tests/live_check.js` live 11/11) |
