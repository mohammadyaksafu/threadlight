"""threadlight-rules-mcp: the deterministic rules engine over the bundled synthetic scenario (no database, no login).

    python -m mcp_server.rules_server                 # stdio
    python -m mcp_server.rules_server --sse           # SSE on :8002/sse (messages at /messages/)
    python -m mcp_server.rules_server --http          # streamable HTTP on :8002/mcp
    python -m mcp_server.rules_server --http --host 0.0.0.0 --path /rules-mcp   # VPS container (public at /rules-mcp)

This is the "try it without an account" server: it reads only data/sample.json (synthetic, public in the repo),
runs threadlight.engine in memory and saves nothing. Every tool is read-only; what-if tools return a copy.
For real tenant data use threadlight-mcp (mcp_server/server.py), which needs a bearer token.
"""

import argparse
import json
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from threadlight.engine import add_renewal, analyze, approve_document, set_document_field

SAMPLE = Path(__file__).resolve().parent.parent / "data" / "sample.json"

mcp = FastMCP(
    "threadlight-rules",
    instructions="Read-only rules engine over one synthetic factory scenario (data/sample.json). Statuses and scores are "
                 "decision support from fixed rules, not a compliance verdict. Cite requirement and document ids. "
                 "What-if tools never save anything.",
    host="127.0.0.1", port=8002, streamable_http_path="/mcp",
)


def _data() -> dict:
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


def _diff(before: dict, after: dict) -> dict:
    return {"hypothetical": True, "before": before["scores"], "after": after["scores"],
            "changed": [{"requirement": a["id"], "before": b["status"], "after": a["status"]}
                        for b, a in zip(before["requirements"], after["requirements"]) if a["status"] != b["status"]]}


@mcp.tool()
def get_scenario() -> dict:
    """Factory, buyer framework, scenario date, audit date, coverage, risk index and open findings."""
    d = _data()
    r = analyze(d)
    return {"scenario": d["scenario"], "factory": d["factory"], "buyer": d["buyer"], "framework": d["framework"],
            "today": r["today"], "audit_date": r["audit_date"], "days_to_audit": r["days_to_audit"], "scores": r["scores"]}


@mcp.tool()
def list_requirements(status: str | None = None) -> list[dict]:
    """Requirements with status (supported, likely_gap, insufficient, conflicting, pending_review); optional status filter."""
    reqs = analyze(_data())["requirements"]
    return [{"id": r["id"], "clause": r["clause"], "title": r["title"], "status": r["status"]} for r in reqs if not status or r["status"] == status]


@mcp.tool()
def get_requirement(req_id: str) -> dict:
    """Status, reasons, checks and supporting documents for one requirement (e.g. R1)."""
    r = next((x for x in analyze(_data())["requirements"] if x["id"] == req_id), None)
    if not r:
        raise ValueError("Requirement %s not found" % req_id)
    return {k: r[k] for k in ("id", "clause", "title", "status", "reasons", "checks", "supporting", "alerts")}


@mcp.tool()
def list_alerts() -> list[dict]:
    """Evidence-integrity alerts (entity mismatch, invalid dates, reference mismatch, closure without proof) with the check to run."""
    return analyze(_data())["alerts"]


@mcp.tool()
def get_task_plan() -> list[dict]:
    """Ranked task plan: owner, due date, action and the proof that would close each gap."""
    return analyze(_data())["plan"]


@mcp.tool()
def what_if_expiry(doc_id: str, valid_until: str) -> dict:
    """Re-run the rules with a hypothetical expiry date (YYYY-MM-DD) for one document. Nothing is saved."""
    d = _data()
    if not any(x["id"] == doc_id for x in d["documents"]):
        raise ValueError("Document %s not found" % doc_id)
    return _diff(analyze(d), analyze(set_document_field(d, doc_id, "valid_until", valid_until)))


@mcp.tool()
def what_if_renewal(approved: bool = False) -> dict:
    """Add the renewed fire certificate. Unapproved it is pending human review; approved=True shows the effect of a person approving it."""
    d = _data()
    after = add_renewal(d)
    if approved:
        after = approve_document(after, d["renewal"]["id"])
    return _diff(analyze(d), analyze(after))


@mcp.resource("sample://dataset")
def dataset_resource() -> str:
    """The synthetic scenario input (factory, requirements, documents, corrective actions) as JSON."""
    return SAMPLE.read_text(encoding="utf-8")


@mcp.resource("sample://result")
def result_resource() -> str:
    """The full engine result for the scenario, as JSON."""
    return json.dumps(analyze(_data()), ensure_ascii=False)


@mcp.prompt()
def gap_walkthrough() -> str:
    """Walk a factory manager through the open gaps and what would close them."""
    return ("Using the threadlight-rules tools, call get_scenario, list_alerts and get_task_plan. For each open requirement, "
            "say what is wrong, who owns it, the due date and the proof needed. Then call what_if_renewal twice "
            "(approved false, then true) and explain why coverage only moves after a person approves. Cite ids.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--http", action="store_true")
    ap.add_argument("--sse", action="store_true")
    ap.add_argument("--port", type=int, default=8002)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--path", default="/mcp")
    args = ap.parse_args()
    mcp.settings.host, mcp.settings.port, mcp.settings.streamable_http_path = args.host, args.port, args.path
    if args.host not in ("127.0.0.1", "localhost"):  # behind the VPS proxy: drop the localhost-only Host check
        mcp.settings.transport_security = None
    mcp.run("streamable-http" if args.http else "sse" if args.sse else "stdio")
