"""threadlight-mcp: the ThreadLight passport as an MCP server (FastMCP).

    python -m mcp_server.server                 # stdio, for Claude Desktop / Claude Code on the same machine
    python -m mcp_server.server --http          # streamable HTTP on :8001/mcp (behind Caddy at /mcp)

Auth: stdio runs as the token in THREADLIGHT_MCP_TOKEN; over HTTP every request needs
`Authorization: Bearer <token>`. Tokens are API-issued JWTs (tenant + role). Scopes follow the role:
every role can `read`; staff and officers can `propose`. There is no tool that approves evidence or
closes a finding: those stay with a named person in the app.
"""

import argparse
import contextvars
import json
import os

from mcp.server.fastmcp import Context, FastMCP

from backend.app.auth import RANK, User, decode
from backend.db.session import one, rows, tenant_tx
from backend.rag.search import search
from backend.services.passport import build_dataset, passport
from threadlight.engine import analyze, set_document_field

MCP_KINDS = ("mcp", "access")
_current: contextvars.ContextVar[User | None] = contextvars.ContextVar("tl_user", default=None)

mcp = FastMCP(
    "threadlight",
    instructions="Read-only access to a factory's Verified Evidence Passport (synthetic data). Statuses come from a "
                 "deterministic rules engine; cite document ids and pages from tool results. You cannot approve evidence "
                 "or close findings; propose_mapping only creates a proposal a person must confirm.",
    host="0.0.0.0", port=8001, streamable_http_path="/mcp",
)


def _user(ctx: Context | None, scope: str = "read") -> User:
    user = _current.get()
    request = None
    try:
        request = ctx.request_context.request if ctx is not None else None
    except Exception:
        request = None
    if user is None and request is not None:  # HTTP transport: the bearer token on this request
        auth = request.headers.get("authorization", "")
        user = decode(auth[7:], MCP_KINDS) if auth.lower().startswith("bearer ") else None
        if user is None:
            raise PermissionError("Missing bearer token")
    if user is None:
        token = os.environ.get("THREADLIGHT_MCP_TOKEN", "")
        if not token:
            raise PermissionError("No token: set THREADLIGHT_MCP_TOKEN (stdio) or send Authorization: Bearer (HTTP)")
        user = decode(token, MCP_KINDS)
    if scope == "propose" and RANK[user.role] < RANK["staff"]:
        raise PermissionError("The propose scope needs the staff or officer role")
    return user


def _factory(c, factory_id: int):
    if not one(c, "SELECT id FROM factories WHERE id = :id", id=factory_id):
        raise ValueError("Factory %d not found for this tenant" % factory_id)


@mcp.tool()
def get_passport(factory_id: int, ctx: Context = None) -> dict:
    """Coverage, decision-support risk index, open findings and days to audit for a factory."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        _factory(c, factory_id)
        r = passport(c, factory_id)["result"]
    return {"today": r["today"], "audit_date": r["audit_date"], "days_to_audit": r["days_to_audit"], "scores": r["scores"],
            "open": [{"id": x["id"], "title": x["title"], "status": x["status"]} for x in r["requirements"] if x["status"] != "supported"]}


@mcp.tool()
def list_requirements(factory_id: int, status: str | None = None, ctx: Context = None) -> list[dict]:
    """Buyer-code requirements with their status (supported, likely_gap, insufficient, conflicting, pending_review)."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        _factory(c, factory_id)
        reqs = passport(c, factory_id)["result"]["requirements"]
    return [{"id": r["id"], "clause": r["clause"], "title": r["title"], "status": r["status"]} for r in reqs if not status or r["status"] == status]


@mcp.tool()
def get_requirement(factory_id: int, req_id: str, ctx: Context = None) -> dict:
    """Reasons, cited evidence (document, file, page) and the clause text for one requirement."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        _factory(c, factory_id)
        p = passport(c, factory_id)
    r = next((x for x in p["result"]["requirements"] if x["id"] == req_id), None)
    if not r:
        raise ValueError("Requirement %s not found" % req_id)
    docs = {d["id"]: d for d in p["dataset"]["documents"]}
    clause = next(x for x in p["dataset"]["requirements"] if x["id"] == req_id)
    return {**{k: r[k] for k in ("id", "clause", "title", "status", "reasons", "alerts")}, "clause_text": clause["text"],
            "evidence": [{"document": d, "file": docs[d]["source"]["file"], "page": docs[d]["source"]["page"]} for d in r["supporting"] if d in docs]}


@mcp.tool()
def list_alerts(factory_id: int, ctx: Context = None) -> list[dict]:
    """Evidence-integrity alerts (entity mismatch, invalid dates, reference mismatch, closure without proof) with the check to run."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        _factory(c, factory_id)
        return passport(c, factory_id)["result"]["alerts"]


@mcp.tool()
def search_evidence(factory_id: int, query: str, k: int = 5, ctx: Context = None) -> dict:
    """Hybrid search (vector + full text, reranked) over the factory's documents. Each hit has a citation like D1:p1."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        _factory(c, factory_id)
        return search(c, factory_id, query, k=min(k, 10), tenant_id=u.tenant_id)


@mcp.tool()
def get_document(factory_id: int, doc_id: str, ctx: Context = None) -> dict:
    """Extracted fields of one document with page, confidence and the verbatim source text."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        d = one(c, """SELECT id, code, filename, type, title, ref, entity, issued, valid_until, verified, verified_by, status, model, prompt_version
                      FROM documents WHERE factory_id = :f AND code = :c""", f=factory_id, c=doc_id)
        if not d:
            raise ValueError("Document %s not found" % doc_id)
        d["fields"] = rows(c, "SELECT field, value, page, confidence, source_span FROM extracted_fields WHERE document_id = :d", d=d.pop("id"))
    return json.loads(json.dumps(d, default=str))


@mcp.tool()
def what_if(factory_id: int, doc_id: str, valid_until: str, ctx: Context = None) -> dict:
    """Re-run the rules engine with a hypothetical expiry date for one document. Nothing is saved."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        _factory(c, factory_id)
        data = build_dataset(c, factory_id)
    before, after = analyze(data), analyze(set_document_field(data, doc_id, "valid_until", valid_until))
    return {"hypothetical": True, "before": before["scores"], "after": after["scores"],
            "changed": [{"requirement": a["id"], "before": b["status"], "after": a["status"]}
                        for b, a in zip(before["requirements"], after["requirements"]) if a["status"] != b["status"]]}


@mcp.tool()
def get_report(factory_id: int, lang: str = "en", ctx: Context = None) -> dict:
    """Latest bilingual draft report (always a draft for human review)."""
    u = _user(ctx)
    with tenant_tx(u.tenant_id) as c:
        _factory(c, factory_id)
        r = one(c, "SELECT body, created_at FROM reports WHERE factory_id = :f ORDER BY id DESC LIMIT 1", f=factory_id)
    if not r:
        return {"report": None, "note": "No draft yet; a person can create one in the app."}
    b = r["body"]
    key = "text_bn" if lang == "bn" else "text_en"
    return {"label": b["label"], "summary": b["summary_bn" if lang == "bn" else "summary_en"],
            "sections": [{"requirement": s["requirement"], "text": s[key]} for s in b["sections"]], "created_at": str(r["created_at"])}


@mcp.tool()
def propose_mapping(factory_id: int, req_id: str, doc_id: str, note: str = "", ctx: Context = None) -> dict:
    """Propose that a document is evidence for a requirement. Creates a PROPOSAL only; a Compliance Officer confirms it in the app."""
    u = _user(ctx, "propose")
    with tenant_tx(u.tenant_id) as c:
        req = one(c, """SELECT r.id FROM requirements r JOIN factories f ON f.framework_id = r.framework_id
                        WHERE f.id = :f AND r.code = :c""", f=factory_id, c=req_id)
        doc = one(c, "SELECT id FROM documents WHERE factory_id = :f AND code = :c", f=factory_id, c=doc_id)
        if not req or not doc:
            raise ValueError("Requirement or document not found")
        c.exec_driver_sql("""INSERT INTO mappings (tenant_id, factory_id, requirement_id, document_id, score, method, note)
                             VALUES (%s, %s, %s, %s, 0, 'mcp-proposal', %s) ON CONFLICT (requirement_id, document_id) DO NOTHING""",
                          (u.tenant_id, factory_id, req["id"], doc["id"], note[:500]))
        c.exec_driver_sql("INSERT INTO audit_log (tenant_id, actor, action, target, payload) VALUES (%s, %s, 'mapping_proposed_mcp', %s, %s::jsonb)",
                          (u.tenant_id, u.actor + "/mcp", "%s->%s" % (doc_id, req_id), json.dumps({"note": note})))
    return {"status": "proposed", "requirement": req_id, "document": doc_id, "next": "A Compliance Officer must confirm it in the review queue."}


@mcp.resource("passport://{factory_id}")
def passport_resource(factory_id: str) -> str:
    """The full engine result for a factory, as JSON."""
    u = _user(mcp.get_context())
    with tenant_tx(u.tenant_id) as c:
        _factory(c, int(factory_id))
        return json.dumps(passport(c, int(factory_id))["result"], default=str)


@mcp.resource("framework://{framework_id}/clauses")
def clauses_resource(framework_id: str) -> str:
    """Buyer code-of-conduct clauses (synthetic)."""
    u = _user(mcp.get_context())
    with tenant_tx(u.tenant_id) as c:
        return json.dumps(rows(c, "SELECT code, clause, title, title_bn, text, criticality FROM requirements WHERE framework_id = :f ORDER BY id",
                               f=int(framework_id)), ensure_ascii=False)


@mcp.resource("audit-log://{factory_id}")
def audit_resource(factory_id: str) -> str:
    """The latest 200 audit-log entries for the tenant (read-only, append-only log)."""
    u = _user(mcp.get_context())
    with tenant_tx(u.tenant_id) as c:
        return json.dumps(rows(c, "SELECT actor, action, target, at FROM audit_log ORDER BY id DESC LIMIT 200"), default=str)


@mcp.prompt()
def audit_prep_brief(factory_id: int) -> str:
    """Brief a manager on what is likely to fail at the next audit."""
    return ("Using the threadlight tools, prepare an audit-preparation brief for factory %d. Call get_passport and list_alerts first, "
            "then get_requirement for each open item. For each, say what is missing or wrong, who owns it and what proof would fix it. "
            "Cite document ids and pages. Say clearly that statuses are decision support, not a compliance verdict." % factory_id)


@mcp.prompt()
def explain_finding(req_id: str, lang: str = "en") -> str:
    """Explain one finding in English or Bangla."""
    return ("Call get_requirement for %s and explain its status in %s in plain words for a factory manager. Use only the tool output "
            "and cite each fact with its document and page." % (req_id, "Bangla" if lang == "bn" else "English"))


def http_app():
    """Streamable-HTTP app with bearer-token auth on every request."""
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.responses import JSONResponse

    app = mcp.streamable_http_app()

    class BearerAuth(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            auth = request.headers.get("authorization", "")
            if not auth.lower().startswith("bearer "):
                return JSONResponse({"error": "missing bearer token"}, status_code=401)
            try:
                user = decode(auth[7:], MCP_KINDS)
            except Exception:
                return JSONResponse({"error": "invalid token"}, status_code=401)
            tok = _current.set(user)
            try:
                return await call_next(request)
            finally:
                _current.reset(tok)

    app.add_middleware(BearerAuth)
    return app


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--http", action="store_true")
    ap.add_argument("--port", type=int, default=8001)
    args = ap.parse_args()
    if args.http:
        import uvicorn

        uvicorn.run(http_app(), host="0.0.0.0", port=args.port)
    else:
        mcp.run("stdio")
