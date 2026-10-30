"""threadlight-rules-mcp: tools over an in-memory client session (sample data only, no database)."""

import asyncio
import json


def _session(fn):
    from mcp.shared.memory import create_connected_server_and_client_session

    from mcp_server.rules_server import mcp

    async def go():
        async with create_connected_server_and_client_session(mcp._mcp_server) as session:
            return await fn(session)

    return asyncio.run(go())


def _json(res):
    return json.loads(res.content[0].text)


def test_tools_listed_read_only():
    async def fn(s):
        return [t.name for t in (await s.list_tools()).tools]

    names = _session(fn)
    assert set(names) == {"get_scenario", "list_requirements", "get_requirement", "list_alerts", "get_task_plan",
                          "what_if_expiry", "what_if_renewal"}
    assert not any("close" in n or "approve" in n for n in names)


def test_scenario_scores():
    async def fn(s):
        return _json(await s.call_tool("get_scenario", {}))

    assert _session(fn)["scores"]["coverage"] == 29
    assert _session(fn)["scores"]["risk_index"] == 63


def test_renewal_needs_approval():
    async def fn(s):
        return (_json(await s.call_tool("what_if_renewal", {"approved": False})),
                _json(await s.call_tool("what_if_renewal", {"approved": True})),
                _json(await s.call_tool("get_scenario", {})))

    pending, approved, after = _session(fn)
    assert pending["after"]["coverage"] == 29
    assert approved["after"]["coverage"] == 55
    assert after["scores"]["coverage"] == 29  # nothing saved


def test_unknown_document_is_error():
    async def fn(s):
        return await s.call_tool("what_if_expiry", {"doc_id": "D99", "valid_until": "2027-01-01"})

    assert _session(fn).isError
