# MCP: built and used

## Built: `threadlight-mcp` (`mcp_server/server.py`, FastMCP from the official `mcp` Python SDK 1.x)

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

**Transports and auth.** stdio (`python -m mcp_server.server`, token in `THREADLIGHT_MCP_TOKEN`) and streamable HTTP
(`--http`, served at `https://<domain>/mcp` behind Caddy). Every HTTP request needs `Authorization: Bearer <token>`;
`python -m mcp_server.token <email> <password>` prints a 30-day token for that user (tenant + role inside).

**Claude Desktop** (`claude_desktop_config.json`), local stdio:

```json
{ "mcpServers": { "threadlight": { "command": "C:/.../threadlight/.venv/Scripts/python.exe",
  "args": ["-m", "mcp_server.server"], "env": { "PYTHONPATH": "C:/.../threadlight", "THREADLIGHT_MCP_TOKEN": "<token>" } } } }
```

## Tests

- `backend/tests/test_mcp.py` (in-memory client session): tools listed and no close/approve tool; `get_passport` = 29;
  `what_if` does not save; another tenant's token gets an error; viewer cannot propose, staff can.
- HTTP smoke test, 2026-10-27, local server on :8001 against the database filled by the live Gemini pipeline run:
  no token -> connection refused; officer token -> 9 tools, `get_passport` coverage 29 / risk 63, `list_alerts`
  entity_mismatch / reference_mismatch / closure_without_proof, `search_evidence("fire certificate valid on audit day")`
  -> D1:p1 first, `propose_mapping` -> proposed, 3 resource templates, 2 prompts.

## Used during development (`.mcp.json`)

| Date | Server | Purpose |
|---|---|---|
| 2026-10-27 | threadlight-mcp (own, stdio + HTTP) | checking passport, alerts and search results after the live pipeline run |
| | Postgres MCP (`@modelcontextprotocol/server-postgres`) | configured for schema/RLS inspection; log a row here when used |
| | Filesystem MCP | configured for synthetic PDFs and eval reports; log a row here when used |

Only servers with a dated row count as "used" in the submission.
