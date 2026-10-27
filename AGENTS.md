# Agents in ThreadLight

Two kinds of agents touch this repository: the agents **inside** the product, and coding agents that **build** it.

## Inside the product

| Agent | Where | Can do | Cannot do |
|---|---|---|---|
| Document pipeline (LangGraph) | `backend/pipeline/graph.py` | parse, redact, classify, extract cited fields, index, propose clause mappings, run the rules, draft text | approve evidence, close findings, skip the human-review interrupt |
| MCP clients (Claude Desktop, IDE agents) | `mcp_server/server.py` | read the passport, search evidence, run what-if, propose a mapping (staff/officer token) | write anything except a mapping *proposal*; there is no approve/close tool |
| n8n workflows | `automation/n8n/` | read-only automation account: expiry alerts, eval summaries; staff account for e-mail intake | approve or close anything |

The lifecycle (`threadlight/lifecycle.py`) raises `LifecycleError` if an AI actor tries to close a finding; the API only
lets an authenticated officer verify or close; the pipeline's approval node refuses a resume value without an officer.

## Building it (coding agents)
- Read `CLAUDE.md` first. Work from the specs in `specs/`; each feature has `spec.md` (what and why), `plan.md` (how),
  `tasks.md` (checklist with acceptance checks).
- Write the test first when changing behaviour. The rules engine and its TypeScript port must stay in parity.
- MCP servers used while building: `.mcp.json` (threadlight-mcp itself, Postgres, Filesystem). Log real use in `docs/MCP.md`.
