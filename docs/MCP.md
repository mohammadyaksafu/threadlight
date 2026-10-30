# MCP: built and used

Two servers built (both FastMCP from the official `mcp` Python SDK 1.x), external servers used during development,
three transports, and the hosts/clients each one was tested with.

## Built 1: `threadlight-mcp` (`mcp_server/server.py`): live tenant data, token required

| Tool | Scope | What it returns |
|---|---|---|
| `get_passport(factory_id)` | read | coverage, risk index, open findings, days to audit |
| `list_requirements(factory_id, status?)` | read | requirements with status |
| `get_requirement(factory_id, req_id)` | read | reasons, cited evidence (file, page), clause text |
| `list_alerts(factory_id)` | read | evidence-integrity alerts with the check to run |
| `search_evidence(factory_id, query, k)` | read | hybrid RAG hits with citations like `D1:p1` |
| `get_document(factory_id, doc_id)` | read | extracted fields with page, confidence, source text |
| `what_if(factory_id, doc_id, valid_until)` | read | rules re-run on a hypothetical expiry; nothing saved |
| `get_report(factory_id, lang)` | read | latest bilingual draft (always "Draft for human review") |
| `propose_mapping(factory_id, req_id, doc_id, note)` | propose (staff/officer) | a mapping *proposal*; an officer confirms it in the app |

Resources: `passport://{factory_id}`, `framework://{framework_id}/clauses`, `audit-log://{factory_id}`.
Prompts: `audit_prep_brief(factory_id)`, `explain_finding(req_id, lang)`.
There is no tool that approves evidence or closes a finding.

## Built 2: `threadlight-rules-mcp` (`mcp_server/rules_server.py`): offline sandbox, no login

The deterministic rules engine (`threadlight/engine.py`) over the bundled synthetic scenario `data/sample.json`.
No database, no network, no model calls; every call re-reads the file and saves nothing. It lets a judge, buyer or
another agent try the passport logic without an account.

| Tool | What it returns |
|---|---|
| `get_scenario()` | factory, buyer, framework, dates, coverage 29 / risk 63 / 6 open findings |
| `list_requirements(status?)` | R1-R8 with status |
| `get_requirement(req_id)` | status, reasons, checks, supporting documents |
| `list_alerts()` | entity mismatch, reference mismatch, closure without proof, ... |
| `get_task_plan()` | ranked tasks with owner, due date and proof needed |
| `what_if_expiry(doc_id, valid_until)` | before/after scores for a hypothetical expiry |
| `what_if_renewal(approved)` | renewal pending review: coverage stays 29; approved by a person: 55 |

Resources: `sample://dataset`, `sample://result`. Prompt: `gap_walkthrough`.

## Transports and auth

| Server | stdio | SSE | Streamable HTTP | Auth |
|---|---|---|---|---|
| threadlight-mcp | `python -m mcp_server.server` (token in `THREADLIGHT_MCP_TOKEN`) | `--sse` -> `:8001/sse` | `--http` -> `:8001/mcp` (`/mcp` behind Caddy) | JWT bearer on every HTTP/SSE request (401 without); tenant + role inside the token |
| threadlight-rules-mcp | `python -m mcp_server.rules_server` | `--sse` -> `127.0.0.1:8002/sse` | `--http` -> `127.0.0.1:8002/mcp`; on the VPS: `http://165.99.219.251:8095/rules-mcp` | none: synthetic sample data only, read-only, no write path |

`python -m mcp_server.token <email> <password>` prints a 30-day token for that user.

## Hosts and clients (disclosure)

| Host / client | Servers | How |
|---|---|---|
| Claude Code (CLI) | both built servers, Postgres, Filesystem | project `.mcp.json` (stdio); configured, see the dated rows below for what was run |
| Claude Desktop | threadlight-mcp, threadlight-rules-mcp | `claude_desktop_config.json` (stdio, below); config provided, not yet run from Desktop |
| MCP Python SDK client (`ClientSession`) | both built servers over stdio, SSE and HTTP | `tools/mcp_smoke.py`, in-memory sessions in `backend/tests/test_mcp.py`, `backend/tests/test_rules_mcp.py` |
| MCP Python SDK client, streamable HTTP | CloudCamp BD knowledge-base MCP (external) | read the competition guide resource |

```json
{ "mcpServers": {
  "threadlight": { "command": "C:/.../threadlight/.venv/Scripts/python.exe", "args": ["-m", "mcp_server.server"],
                   "env": { "PYTHONPATH": "C:/.../threadlight", "THREADLIGHT_MCP_TOKEN": "<token>" } },
  "threadlight-rules": { "command": "C:/.../threadlight/.venv/Scripts/python.exe", "args": ["-m", "mcp_server.rules_server"],
                         "env": { "PYTHONPATH": "C:/.../threadlight" } } } }
```

## Permission boundaries

- **Read** is the default scope for every role. **Propose** (`propose_mapping`) needs staff or officer; viewers and
  auditors get an error. No MCP tool can approve evidence, close a finding or change a rule: those stay with a named
  person in the app (models read, rules decide, people approve).
- Every threadlight-mcp query runs inside `tenant_tx(tenant_id)` with Postgres row-level security, so a token for
  tenant 2 cannot read tenant 1 (tested). Proposals are written to `audit_log` with actor `<user>/mcp`.
- threadlight-rules-mcp has no write path at all and reads only `data/sample.json`.
- External servers used in development are scoped: Filesystem MCP is limited to `./synth/out` and
  `./evals/reports` (not `.env`); Postgres MCP runs read-only queries against the local test container only, never
  the VPS. The CloudCamp server was used read-only (one resource, no tools).
- Content returned by external servers is treated as untrusted data, not instructions.

## Reuse notes

- Both servers reuse the same code as the web app and API: `threadlight.engine.analyze` (the rules engine with a
  TypeScript parity test), `backend.services.passport`, `backend.rag.search`. No business logic is duplicated in the
  MCP layer; it is a thin adapter.
- The rules sandbox can be dropped into any MCP host (Claude, Cursor, Gemini, n8n's MCP client) with one stdio entry.
- The bearer middleware in `server.http_app()` wraps both the SSE and the streamable-HTTP app, so new transports get
  the same auth.
- `tools/mcp_smoke.py` tests any MCP server over stdio, SSE or HTTP and is reusable for other projects.

## Tests

- `backend/tests/test_mcp.py` (in-memory client session): tools listed and no close/approve tool; `get_passport` = 29;
  `what_if` does not save; another tenant's token gets an error; viewer cannot propose, staff can.
- `backend/tests/test_rules_mcp.py`: 7 read-only tools; coverage 29 / risk 63; renewal pending -> 29, approved -> 55,
  nothing saved; unknown document -> error. 2026-10-31: both files, 10 passed.
- HTTP smoke test, 2026-10-27, threadlight-mcp on :8001 against the database filled by the live Gemini pipeline run:
  no token -> connection refused; officer token -> 9 tools, `get_passport` coverage 29 / risk 63, `list_alerts`
  entity_mismatch / reference_mismatch / closure_without_proof, `search_evidence("fire certificate valid on audit day")`
  -> D1:p1 first, `propose_mapping` -> proposed, 3 resource templates, 2 prompts.
- Transport smoke test, 2026-10-31 (`tools/mcp_smoke.py`): threadlight-rules-mcp over stdio (`get_scenario` 29/63),
  SSE (`what_if_renewal approved` -> risk 37, 4 open) and streamable HTTP (`list_alerts`); threadlight-mcp over SSE:
  no token -> 401, officer token -> 9 tools, 3 resource templates, 2 prompts, `get_passport` ok.
- VPS, 2026-10-31: `http://165.99.219.251:8095/rules-mcp` -> 7 tools, 2 resources, 1 prompt, `get_scenario` ok;
  `http://165.99.219.251:8095/mcp` without token -> 401, officer token -> 9 tools, `get_passport` ok.

## Used during development

| Date | Server | Transport | Purpose |
|---|---|---|---|
| 2026-10-27 | threadlight-mcp (own) | stdio + HTTP | checking passport, alerts and search results after the live pipeline run |
| 2026-10-31 | CloudCamp BD knowledge-base MCP (external, `cloudcamp-mcp` 1.29.0) | streamable HTTP | read the competition knowledge base resource (`cloudcamp://knowledge-base`) to audit the submission and MCP disclosure |
| | Postgres MCP (`@modelcontextprotocol/server-postgres@0.6.2`) | stdio | configured for schema/RLS inspection (`tools/mcp_used_check.py`); log a row here when run |
| | Filesystem MCP (`@modelcontextprotocol/server-filesystem@2025.3.28`) | stdio | configured for synthetic PDFs and eval reports (`tools/mcp_used_check.py`); log a row here when run |

Only servers with a dated row count as "used" in the submission.
