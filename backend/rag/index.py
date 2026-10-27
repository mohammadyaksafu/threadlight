"""Chunking, contextual RAG and indexing into pgvector + Postgres full-text search.

- Layout-aware chunking: paragraphs and Docling headings/tables stay whole; chunks are packed to about
  400-600 tokens with ~15% overlap and never cross a page, so each chunk keeps its file and page.
- Contextual RAG: each chunk gets a 1-2 sentence context written by a small model that sees the whole
  document first (a stable, cacheable prefix) and the chunk last.
- Exact-duplicate chunks (same text in the tenant, e.g. boilerplate footers) reuse the stored context and
  embedding instead of calling the models again.
"""

import hashlib
import re

from sqlalchemy.engine import Connection

from backend.db.session import one, rows, scalar
from backend.llm import router

TARGET_WORDS, MAX_WORDS, OVERLAP = 330, 450, 0.15  # ~1.33 tokens per word -> ~440-600 tokens


def vec(v: list[float]) -> str:
    return "[" + ",".join("%.6f" % x for x in v) + "]"


def _blocks(text: str) -> list[str]:
    parts = re.split(r"\n\s*\n|\n(?=#+ )|\n(?=\|)", text)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        lines = p.splitlines()
        # many short lines (key: value forms, OCR output) -> keep as one block
        out.append(" \n".join(l.strip() for l in lines if l.strip()))
    return out


def chunk_pages(pages: list[dict]) -> list[dict]:
    chunks = []
    for p in pages:
        cur: list[str] = []
        for block in _blocks(p["text"]):
            words = block.split()
            while len(words) > MAX_WORDS:  # an oversized block is split on word boundaries
                chunks.append({"page": p["page"], "text": " ".join(words[:TARGET_WORDS])})
                words = words[int(TARGET_WORDS * (1 - OVERLAP)):]
            block = " ".join(words) if len(words) != len(block.split()) else block
            if cur and sum(len(b.split()) for b in cur) + len(block.split()) > TARGET_WORDS:
                chunks.append({"page": p["page"], "text": "\n".join(cur)})
                tail = " ".join("\n".join(cur).split()[-int(TARGET_WORDS * OVERLAP):])
                cur = [tail] if len(cur) > 1 else []
            cur.append(block)
        if cur:
            chunks.append({"page": p["page"], "text": "\n".join(cur)})
    return [c for c in chunks if len(c["text"].strip()) >= 10]


def index_document(conn: Connection, tenant_id: int, document_id: int) -> dict:
    doc = one(conn, "SELECT id, filename, title, type FROM documents WHERE id = :id", id=document_id)
    pages = rows(conn, "SELECT page, text FROM pages WHERE document_id = :d ORDER BY page", d=document_id)
    conn.exec_driver_sql("DELETE FROM chunks WHERE document_id = %s", (document_id,))
    chunks = chunk_pages(pages)
    whole = "\n".join("[page %d]\n%s" % (p["page"], p["text"]) for p in pages)[:30000]
    todo, reused = [], 0
    for c in chunks:
        c["hash"] = hashlib.sha256(c["text"].encode()).hexdigest()
        prev = one(conn, "SELECT context, embedding::text AS emb, embed_model FROM chunks WHERE content_hash = :h AND embedding IS NOT NULL LIMIT 1", h=c["hash"])
        if prev:
            c["context"], c["emb"], c["model"] = prev["context"], prev["emb"], prev["embed_model"]
            reused += 1
            continue
        res = router.complete("contextualize", "contextualize", {
            "filename": doc["filename"], "title": doc["title"] or doc["type"] or "", "document": whole,
            "page": c["page"], "chunk": c["text"]}, tenant_id=tenant_id, max_tokens=200)
        c["context"] = res.text.strip()[:600]
        todo.append(c)
    if todo:
        vectors, model = router.embed([c["context"] + "\n" + c["text"] for c in todo], tenant_id=tenant_id)
        for c, v in zip(todo, vectors):
            c["emb"], c["model"] = vec(v), model
    for c in chunks:
        conn.exec_driver_sql(
            "INSERT INTO chunks (tenant_id, document_id, page, text, context, content_hash, embedding, embed_model) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s)",
            (tenant_id, document_id, c["page"], c["text"], c["context"], c["hash"], c["emb"], c["model"]))
    return {"chunks": len(chunks), "reused": reused, "embed_model": chunks[0]["model"] if chunks else None}


def index_clauses(conn: Connection, tenant_id: int, framework_id: int) -> int:
    """Embed buyer-code clauses once per framework (skipped when already indexed)."""
    have = scalar(conn, """SELECT count(*) FROM clause_chunks cc JOIN requirements r ON r.id = cc.requirement_id
                           WHERE r.framework_id = :fw""", fw=framework_id)
    if have:
        return 0
    reqs = rows(conn, "SELECT id, code, clause, title, text FROM requirements WHERE framework_id = :fw ORDER BY id", fw=framework_id)
    texts = ["Clause %s %s: %s" % (r["clause"], r["title"], r["text"]) for r in reqs]
    vectors, model = router.embed(texts, tenant_id=tenant_id)
    for r, t, v in zip(reqs, texts, vectors):
        conn.exec_driver_sql(
            "INSERT INTO clause_chunks (tenant_id, requirement_id, text, context, embedding, embed_model) VALUES (%s, %s, %s, %s, %s::vector, %s)",
            (tenant_id, r["id"], t, "Buyer code clause %s (%s)" % (r["clause"], r["code"]), vec(v), model))
    return len(reqs)
