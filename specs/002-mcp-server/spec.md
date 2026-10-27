# 002 MCP server

## What
`threadlight-mcp` exposes the passport to MCP clients: 9 tools (get_passport, list_requirements, get_requirement,
list_alerts, search_evidence, get_document, what_if, get_report, propose_mapping), 3 resources
(passport://, framework://.../clauses, audit-log://) and 2 prompts (audit_prep_brief, explain_finding).
Transports: stdio and streamable HTTP at /mcp. Bearer token per user (tenant + role).

## Acceptance checks
1. Without a token the HTTP endpoint refuses the connection.
2. With an officer token, `get_passport(1)` returns coverage 29 / risk 63 on the v1 data.
3. A tenant-2 token gets an error for factory 1.
4. A viewer token cannot call `propose_mapping`; no tool can approve or close.
