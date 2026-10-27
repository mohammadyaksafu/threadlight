"""Clause-to-evidence mapping proposals. RAG proposes; a Compliance Officer confirms each new mapping."""

import structlog
from sqlalchemy.engine import Connection

from backend.config import settings
from backend.db.session import rows
from backend.llm import router
from backend.rag.search import search

log = structlog.get_logger()


def clause_queries(req: dict, tenant_id: int) -> tuple[str, list[str]]:
    base = "Clause %s %s: %s" % (req["clause"], req["title"], req["text"])
    if not settings().query_rewrite:
        return base, []
    try:
        r = router.complete("rewrite", "rewrite", {"clause": req["clause"], "text": req["text"]}, tenant_id=tenant_id, max_tokens=400)
        return base, (r.data.get("queries") or [])[:3] + ([r.data["hypothetical"]] if r.data.get("hypothetical") else [])
    except Exception as e:  # rewriting is an optimisation; plain clause search still works
        log.info("query_rewrite_skipped", error=str(e))
        return base, []


def propose_for_document(conn: Connection, tenant_id: int, factory_id: int, document_id: int) -> list[dict]:
    reqs = rows(conn, """SELECT r.* FROM requirements r JOIN factories f ON f.framework_id = r.framework_id
                         WHERE f.id = :f ORDER BY r.id""", f=factory_id)
    proposals = []
    for req in reqs:
        query, extra = clause_queries(req, tenant_id)
        res = search(conn, factory_id, query, k=settings().mapping_top_k, tenant_id=tenant_id, extra_queries=extra)
        # propose only when the new document ranks among the top N distinct documents, N = evidence types the
        # clause needs; with a small file set, "anywhere in the top 5" would propose almost every pairing
        top_docs = list(dict.fromkeys(h["document_id"] for h in res["hits"]))[:max(1, len(req["needs"]))]
        hit = next((h for h in res["hits"] if h["document_id"] == document_id), None) if document_id in top_docs else None
        if not hit:
            continue
        conn.exec_driver_sql("""
            INSERT INTO mappings (tenant_id, factory_id, requirement_id, document_id, chunk_id, score, method)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (requirement_id, document_id) DO UPDATE SET score = EXCLUDED.score, chunk_id = EXCLUDED.chunk_id
            WHERE mappings.status = 'proposed'""",
            (tenant_id, factory_id, req["id"], document_id, hit["chunk_id"], hit["score"], res["method"]))
        proposals.append({"requirement": req["code"], "citation": hit["citation"], "score": hit["score"]})
    return proposals
