"""Use the two external MCP servers from .mcp.json (Postgres, Filesystem) for the checks logged in docs/MCP.md.

    python tools/mcp_used_check.py      # needs the tl-test-pg container and Node (npx downloads the pinned servers)
"""

import asyncio
import json
import os
import shutil

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

NPX = shutil.which("npx.cmd") or shutil.which("npx")


async def use(args, calls):
    params = StdioServerParameters(command=NPX, args=["-y"] + args, env=dict(os.environ))
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            info = await s.initialize()
            print("==", info.serverInfo.name, info.serverInfo.version, [t.name for t in (await s.list_tools()).tools])
            for name, a in calls:
                out = await s.call_tool(name, a)
                print("--", name, json.dumps(a), "error=%s" % out.isError)
                print(out.content[0].text[:900] if out.content else "")


async def main():
    await use(["@modelcontextprotocol/server-postgres@0.6.2", "postgresql://postgres:postgres@localhost:5434/threadlight"], [
        ("query", {"sql": "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"}),
        ("query", {"sql": "SELECT tablename, policyname, cmd FROM pg_policies ORDER BY 1"}),
        ("query", {"sql": "SELECT method, count(*) FROM mappings GROUP BY 1"})])
    await use(["@modelcontextprotocol/server-filesystem@2025.3.28", "./synth/out", "./evals/reports"], [
        ("list_allowed_directories", {}),
        ("list_directory", {"path": "./evals/reports"}),
        ("read_file", {"path": "./evals/reports/2026-10-27.md"}),
        ("read_file", {"path": "./.env"})])  # must be refused: outside the allowed folders


if __name__ == "__main__":
    asyncio.run(main())
