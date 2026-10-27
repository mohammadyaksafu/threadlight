"""Hybrid retrieval: pgvector (cosine, HNSW) + Postgres FTS, fused with reciprocal rank fusion, then a
multilingual cross-encoder reranker (bge-reranker-v2-m3). Every hit carries document, file and page.
"""

import re
from functools import lru_cache

import structlog
from sqlalchemy.engine import Connection

from backend.config import settings
from backend.db.session import rows
from backend.llm import router
from backend.rag.index import vec

log = structlog.get_logger()
CANDIDATES, RRF_K = 30, 60


def fts_query(q: str) -> str:
    toks = [t for t in re.findall(r"\w+", q.lower()) if len(t) > 1][:24]
    return " | ".join(dict.fromkeys(toks)) or "nothing"


@lru_cache
def _cross_encoder():
    if settings().reranker == "off":
        return None
    try:
        from sentence_transformers import CrossEncoder

        return CrossEncoder(settings().reranker_model, max_length=512, device="cpu")
    except Exception as e:
        log.warning("reranker_unavailable", error=str(e))
        return None


def rerank(query: str, hits: list[dict], k: int) -> tuple[list[dict], str]:
    ce = _cross_encoder()
    if ce is None or not hits:
        return hits[:k], "rrf"
    scores = ce.predict([(query, (h["context"] + "\n" + h["text"])[:2000]) for h in hits])
    for h, s in zip(hits, scores):
        h["rerank_score"] = float(s)
    return sorted(hits, key=lambda h: -h["rerank_score"])[:k], "rrf+bge-reranker"


def search(conn: Connection, factory_id: int, query: str, k: int = 5, tenant_id: int | None = None,
           document_id: int | None = None, extra_queries: list[str] | None = None,
           modes: tuple = ("vector", "fts"), use_reranker: bool = True) -> dict:
    """`modes` and `use_reranker` exist for the retrieval ablation in evals/rag_eval.py; the app uses the defaults."""
    queries = [query] + (extra_queries or [])
    vectors, model = router.embed(queries, tenant_id=tenant_id, query=True)
    doc_filter = "AND c.document_id = :doc" if document_id else ""
    ranked: dict[int, dict] = {}
    for q, v in zip(queries, vectors):
        by_vec = rows(conn, """
            SELECT c.id, 1 - (c.embedding <=> CAST(:v AS vector)) AS sim FROM chunks c JOIN documents d ON d.id = c.document_id
            WHERE d.factory_id = :f AND c.embed_model = :m %s ORDER BY c.embedding <=> CAST(:v AS vector) LIMIT :n""" % doc_filter,
                      v=vec(v), f=factory_id, m=model, n=CANDIDATES, doc=document_id)
        by_fts = rows(conn, """
            SELECT c.id, ts_rank(c.tsv, to_tsquery('simple', :q)) AS r FROM chunks c JOIN documents d ON d.id = c.document_id
            WHERE d.factory_id = :f AND c.tsv @@ to_tsquery('simple', :q) %s ORDER BY r DESC LIMIT :n""" % doc_filter,
                      q=fts_query(q), f=factory_id, n=CANDIDATES, doc=document_id)
        for lst, key in ((by_vec if "vector" in modes else [], "vector_rank"), (by_fts if "fts" in modes else [], "fts_rank")):
            for rank, r in enumerate(lst, 1):
                h = ranked.setdefault(r["id"], {"rrf": 0.0})
                h["rrf"] += 1.0 / (RRF_K + rank)
                h[key] = min(h.get(key, rank), rank)
    if not ranked:
        return {"query": query, "hits": [], "method": "none", "embed_model": model}
    detail = {r["id"]: r for r in rows(conn, """
        SELECT c.id, c.document_id, c.page, c.text, c.context, d.code, d.filename, d.type, d.title
        FROM chunks c JOIN documents d ON d.id = c.document_id WHERE c.id = ANY(:ids)""", ids=list(ranked))}
    hits = [{**detail[i], **ranked[i]} for i in sorted(ranked, key=lambda i: -ranked[i]["rrf"])[:CANDIDATES]]
    top, method = rerank(query, hits, k) if use_reranker else (hits[:k], "rrf")
    method = "+".join(modes) + ("" if method == "rrf" else "+bge-reranker")
    return {"query": query, "embed_model": model, "method": method, "hits": [{
        "chunk_id": h["id"], "document": h["code"], "document_id": h["document_id"], "file": h["filename"], "page": h["page"],
        "type": h["type"], "score": round(h.get("rerank_score", h["rrf"]), 4), "vector_rank": h.get("vector_rank"),
        "fts_rank": h.get("fts_rank"), "context": h["context"], "text": h["text"][:800],
        "citation": "%s:p%d" % (h["code"], h["page"])} for h in top]}
