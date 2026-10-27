"""MCP server: tools over an in-memory client session, auth and scopes."""

import asyncio
import json

import pytest

from backend.app.auth import User, issue_tokens


def _token(role="viewer", tenant=1):
    return issue_tokens(User(1, tenant, role, "test"))["access_token"]


def _call(name, args, token):
    import os

    from mcp.shared.memory import create_connected_server_and_client_session

    from mcp_server.server import mcp

    os.environ["THREADLIGHT_MCP_TOKEN"] = token

    async def go():
        async with create_connected_server_and_client_session(mcp._mcp_server) as session:
            tools = await session.list_tools()
            res = await session.call_tool(name, args)
            return [t.name for t in tools.tools], res

    return asyncio.run(go())


def _json(res):
    return json.loads(res.content[0].text)


def test_tools_listed_and_no_close_tool(seeded):
    names, _ = _call("get_passport", {"factory_id": 1}, _token())
    assert set(names) >= {"get_passport", "list_requirements", "get_requirement", "list_alerts", "search_evidence",
                          "get_document", "what_if", "get_report", "propose_mapping"}
    assert not any("close" in n or "approve" in n for n in names)


def test_get_passport(seeded):
    _, res = _call("get_passport", {"factory_id": 1}, _token())
    assert _json(res)["scores"]["coverage"] == 29


def test_what_if_does_not_save(seeded):
    _, res = _call("what_if", {"factory_id": 1, "doc_id": "D1", "valid_until": "2027-06-30"}, _token())
    out = _json(res)
    assert out["hypothetical"] and any(c["requirement"] == "R1" for c in out["changed"])
    _, res = _call("get_passport", {"factory_id": 1}, _token())
    assert _json(res)["scores"]["coverage"] == 29


def test_other_tenant_cannot_read(seeded):
    _, res = _call("get_passport", {"factory_id": 1}, _token(tenant=2))
    assert res.isError


@pytest.mark.parametrize("role,ok", [("viewer", False), ("staff", True)])
def test_propose_scope(seeded, role, ok):
    _, res = _call("propose_mapping", {"factory_id": 1, "req_id": "R6", "doc_id": "D5", "note": "test"}, _token(role))
    assert res.isError is (not ok)
