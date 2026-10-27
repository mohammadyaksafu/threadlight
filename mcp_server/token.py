"""Print a 30-day MCP bearer token for a demo user (for Claude Desktop / MCP Inspector).

    python -m mcp_server.token officer@threadlight.demo Officer-Demo-2026
"""

import sys

from backend.app.auth import authenticate, issue_mcp_token

if __name__ == "__main__":
    user = authenticate(sys.argv[1], sys.argv[2])
    if not user:
        sys.exit("wrong email or password")
    print(issue_mcp_token(user))
