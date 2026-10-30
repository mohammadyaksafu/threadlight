"""Smoke-test an MCP server over a real transport and print what it exposes plus one tool call.

    python tools/mcp_smoke.py stdio rules                       # spawns python -m mcp_server.rules_server
    python tools/mcp_smoke.py sse  http://127.0.0.1:8002/sse  get_scenario
    python tools/mcp_smoke.py http http://127.0.0.1:8001/mcp  get_passport '{"factory_id": 1}' <token>
"""

import asyncio
import json
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client


async def run(transport, target, tool, args, token):
    headers = {"Authorization": "Bearer " + token} if token else None
    if transport == "stdio":
        module = {"rules": "mcp_server.rules_server", "threadlight": "mcp_server.server"}[target]
        conn = stdio_client(StdioServerParameters(command=sys.executable, args=["-m", module], env={"PYTHONPATH": "."}))
    elif transport == "sse":
        conn = sse_client(target, headers=headers)
    else:
        conn = streamablehttp_client(target, headers=headers)
    async with conn as streams:
        async with ClientSession(streams[0], streams[1]) as s:
            info = await s.initialize()
            tools = [t.name for t in (await s.list_tools()).tools]
            res = [r.uri for r in (await s.list_resources()).resources]
            tpl = [r.uriTemplate for r in (await s.list_resource_templates()).resourceTemplates]
            prompts = [p.name for p in (await s.list_prompts()).prompts]
            print("server:", info.serverInfo.name, "| transport:", transport)
            print("tools (%d):" % len(tools), ", ".join(tools))
            print("resources:", [str(r) for r in res] + tpl, "| prompts:", prompts)
            out = await s.call_tool(tool, args)
            print("%s -> error=%s" % (tool, out.isError), out.content[0].text[:400] if out.content else "")


if __name__ == "__main__":
    a = sys.argv[1:]
    asyncio.run(run(a[0], a[1], a[2] if len(a) > 2 else "get_scenario", json.loads(a[3]) if len(a) > 3 else {},
                    a[4] if len(a) > 4 else None))
