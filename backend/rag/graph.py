"""Graph RAG: an entity-relation knowledge graph over a factory's evidence, used to expand hybrid retrieval.

Nodes and edges come from what the pipeline already extracted and people confirmed (no extra model calls):

    document  -ISSUED_TO->      entity        (normalized organisation name on the document)
    document  -HAS_REF->        reference     (its own certificate / report number)
    document  -CITES->          reference     (numbers it quotes, e.g. minutes citing a certificate)
    reference -SIMILAR_TO->     reference     (one edit apart: a likely typo, kept as a weak edge)
    document  -IS_A->           doc_type
    requirement -NEEDS->        doc_type      (buyer-code clause -> evidence type)
    document  -SUPERSEDES->     document
    document  -MAPPED_TO->      requirement   (clause mappings a person confirmed)
    corrective_action -ADDRESSES-> requirement
    alert     -FLAGS->          document / requirement

graph_search() seeds the graph with the hybrid-search hits and with nodes named in the query (reference numbers,
clause ids, document codes), walks up to three hops, and adds the best chunk of every document it reaches with the
path that led there, so an answer can say *why* a document is relevant ("D6 cites FC-2025-0471, one character
from D1's FC-2025-0417"). The graph is rebuilt per call from tenant-scoped rows; nothing is stored.
"""

import re
from collections import deque

from sqlalchemy.engine import Connection

from backend.db.session import rows
from backend.rag.search import search
from threadlight.engine import levenshtein, normalize_entity

HOP_WEIGHT = {0: 1.0, 1: 0.6, 2: 0.35, 3: 0.2}
WEAK = {"SIMILAR_TO": 0.5, "IS_A": 0.5, "NEEDS": 0.5, "ISSUED_TO": 0.3}  # broad edges count for less


class Graph:
    def __init__(self):
        self.nodes: dict[str, dict] = {}
        self.adj: dict[str, list[tuple[str, str]]] = {}

    def node(self, nid: str, kind: str, label: str) -> str:
        self.nodes.setdefault(nid, {"id": nid, "kind": kind, "label": label})
        self.adj.setdefault(nid, [])
        return nid

    def edge(self, a: str, rel: str, b: str):
        self.adj[a].append((rel, b))
        self.adj[b].append(("~" + rel, a))  # walkable both ways; "~" marks the reverse direction

    def stats(self) -> dict:
        kinds: dict[str, int] = {}
        for n in self.nodes.values():
            kinds[n["kind"]] = kinds.get(n["kind"], 0) + 1
        return {"nodes": len(self.nodes), "edges": sum(len(v) for v in self.adj.values()) // 2, "by_kind": kinds}


def build_graph(conn: Connection, factory_id: int) -> Graph:
    g = Graph()
    docs = rows(conn, """SELECT code, type, ref, entity, cites, supersedes FROM documents
                         WHERE factory_id = :f AND status <> 'rejected'""", f=factory_id)
    reqs = rows(conn, """SELECT r.id, r.code, r.title, r.needs FROM requirements r JOIN factories f ON f.framework_id = r.framework_id
                         WHERE f.id = :f""", f=factory_id)
    req_code = {r["id"]: r["code"] for r in reqs}
    refs: set[str] = set()
    for d in docs:
        dn = g.node("doc:" + d["code"], "document", d["code"])
        if d["type"]:
            g.edge(dn, "IS_A", g.node("type:" + d["type"], "doc_type", d["type"]))
        if d["entity"]:
            g.edge(dn, "ISSUED_TO", g.node("entity:" + normalize_entity(d["entity"]), "entity", d["entity"]))
        if d["ref"]:
            refs.add(d["ref"])
            g.edge(dn, "HAS_REF", g.node("ref:" + d["ref"], "reference", d["ref"]))
        for c in d["cites"] or []:
            refs.add(c["ref"])
            g.edge(dn, "CITES", g.node("ref:" + c["ref"], "reference", c["ref"]))
        if d["supersedes"]:
            g.edge(dn, "SUPERSEDES", g.node("doc:" + d["supersedes"], "document", d["supersedes"]))
    refs_sorted = sorted(refs)
    for i, a in enumerate(refs_sorted):
        for b in refs_sorted[i + 1:]:
            if len(a) == len(b) and levenshtein(a, b) == 1 or len(a) >= 6 and sorted(a) == sorted(b) and levenshtein(a, b) <= 2:
                g.edge("ref:" + a, "SIMILAR_TO", "ref:" + b)
    for r in reqs:
        rn = g.node("req:" + r["code"], "requirement", "%s %s" % (r["code"], r["title"]))
        for t in r["needs"] or []:
            g.edge(rn, "NEEDS", g.node("type:" + t, "doc_type", t))
    for m in rows(conn, """SELECT m.requirement_id, d.code FROM mappings m JOIN documents d ON d.id = m.document_id
                           WHERE m.factory_id = :f AND m.status = 'confirmed'""", f=factory_id):
        if m["requirement_id"] in req_code:
            g.edge("doc:" + m["code"], "MAPPED_TO", g.node("req:" + req_code[m["requirement_id"]], "requirement", req_code[m["requirement_id"]]))
    for c in rows(conn, "SELECT code, title, requirement_code FROM corrective_actions WHERE factory_id = :f", f=factory_id):
        cn = g.node("cap:" + c["code"], "corrective_action", "%s %s" % (c["code"], c["title"]))
        if c["requirement_code"]:
            g.edge(cn, "ADDRESSES", g.node("req:" + c["requirement_code"], "requirement", c["requirement_code"]))
    for a in rows(conn, "SELECT code, type, subject, related, requirements FROM alerts WHERE factory_id = :f", f=factory_id):
        an = g.node("alert:" + a["code"], "alert", "%s %s" % (a["code"], a["type"]))
        for d in (a["subject"] or []) + (a["related"] or []):
            g.edge(an, "FLAGS", g.node("doc:" + d, "document", d))
        for r in a["requirements"] or []:
            g.edge(an, "FLAGS", g.node("req:" + r, "requirement", r))
    return g


def query_seeds(g: Graph, query: str) -> list[str]:
    """Nodes named in the query: reference numbers, document codes (D1), clause ids (R1), corrective actions (CAP-14), alerts (A2)."""
    q = query.upper()
    toks = set(re.findall(r"[A-Z]{1,4}-[A-Z0-9-]+|\b[DRA]\d+(?:-RENEWAL)?\b|\bCAP-\d+\b", q))
    out = []
    for nid, n in g.nodes.items():
        label = n["label"].split(" ")[0].upper()
        if n["kind"] in ("reference", "document", "requirement", "corrective_action", "alert") and label in toks:
            out.append(nid)
    return out


def walk(g: Graph, seeds: dict[str, str], hops: int = 3) -> dict[str, dict]:
    """Breadth-first from the seeds; each reached document keeps its hop count, best weight and the path."""
    best: dict[str, dict] = {}
    queue = deque((s, 0, 1.0, [g.nodes[s]["label"] + " (" + why + ")"]) for s, why in seeds.items() if s in g.nodes)
    seen = {}
    while queue:
        nid, hop, w, path = queue.popleft()
        if seen.get(nid, -1) >= w:
            continue
        seen[nid] = w
        if g.nodes[nid]["kind"] == "document":
            cur = best.get(nid)
            if cur is None or w * HOP_WEIGHT[hop] > cur["weight"]:
                best[nid] = {"document": g.nodes[nid]["label"], "hops": hop, "weight": round(w * HOP_WEIGHT[hop], 3), "path": path}
        if hop == hops:
            continue
        for rel, nxt in g.adj[nid]:
            # do not fan out through hubs: a doc type or the factory's entity links almost everything
            if g.nodes[nxt]["kind"] in ("doc_type", "entity") and hop + 1 == hops:
                continue
            queue.append((nxt, hop + 1, w * WEAK.get(rel.lstrip("~"), 1.0), path + ["%s %s" % (rel, g.nodes[nxt]["label"])]))
    return best


HIT_SEED_WEIGHT = 0.5  # a search hit is weaker evidence of relevance than a node the query names


def graph_search(conn: Connection, factory_id: int, query: str, k: int = 5, tenant_id: int | None = None,
                 extra_queries: list[str] | None = None, use_reranker: bool = True, hops: int = 3) -> dict:
    base = search(conn, factory_id, query, k=max(k, 10), tenant_id=tenant_id, extra_queries=extra_queries, use_reranker=use_reranker)
    g = build_graph(conn, factory_id)
    named = {nid: "named in query" for nid in query_seeds(g, query)}
    from_hits = {"doc:" + h["document"]: "search hit #%d" % (i + 1) for i, h in enumerate(base["hits"][:2])}
    reached = walk(g, named, hops) if named else {}
    for nid, r in walk(g, {n: w for n, w in from_hits.items() if n not in named}, hops).items():
        r = {**r, "weight": round(r["weight"] * HIT_SEED_WEIGHT, 3)}
        if nid not in reached or r["weight"] > reached[nid]["weight"]:
            reached[nid] = r
    # Fuse per document: score = hybrid rank score (0.6 for the first document, 0.6/n for the n-th) + graph weight.
    by_doc: dict[str, dict] = {}
    for h in base["hits"]:
        by_doc.setdefault(h["document"], h)
    score = {d: 0.6 / n for n, d in enumerate(by_doc, 1)}
    for nid, r in reached.items():
        score[r["document"]] = score.get(r["document"], 0) + r["weight"]
        if r["document"] in by_doc:
            by_doc[r["document"]]["graph"] = r
    missing = [r for r in reached.values() if r["document"] not in by_doc]
    if missing:
        best_chunk = {r["code"]: r for r in rows(conn, """
            SELECT DISTINCT ON (d.code) d.code, d.filename, d.type, c.id, c.document_id, c.page, c.text, c.context
            FROM chunks c JOIN documents d ON d.id = c.document_id
            WHERE d.factory_id = :f AND d.code = ANY(:codes)
            ORDER BY d.code, ts_rank(c.tsv, plainto_tsquery('simple', :q)) DESC, c.page""",
            f=factory_id, codes=[r["document"] for r in missing], q=query)}
        for r in missing:
            c = best_chunk.get(r["document"])
            if c:
                by_doc[c["code"]] = {"chunk_id": c["id"], "document": c["code"], "document_id": c["document_id"], "file": c["filename"],
                                     "page": c["page"], "type": c["type"], "score": 0.0, "vector_rank": None, "fts_rank": None,
                                     "context": c["context"], "text": c["text"][:800], "citation": "%s:p%d" % (c["code"], c["page"]), "graph": r}
    hits = sorted(by_doc.values(), key=lambda h: -score.get(h["document"], 0))[:k]
    for h in hits:
        h["fused_score"] = round(score.get(h["document"], 0), 3)
    return {**base, "method": base["method"] + "+graph", "hits": hits,
            "graph": {**g.stats(), "seeds": {**from_hits, **named}, "reached": len(reached)}}
