"""Mirror the evidence knowledge graph (backend/rag/graph.py) into Neo4j and query it with Cypher.

    NEO4J_URL=bolt://localhost:7688 NEO4J_PASSWORD=... python -m backend.rag.neo4j_sync <tenant_id> <factory_id> [reference]

Postgres stays the system of record (RLS, audit trail); Neo4j is a read model rebuilt from it, so a sync replaces
the factory's subgraph. Every node carries tenant_id and factory_id, and every query filters on both. Used for
exploring multi-hop questions in Neo4j Browser and for the Cypher check below; the app's Graph RAG walks the same
graph in Python, so the API does not depend on Neo4j being up.
"""

import os
import sys

from neo4j import GraphDatabase

from backend.db.session import tenant_tx
from backend.rag.graph import build_graph

LABEL = {"document": "Document", "entity": "Entity", "reference": "Reference", "doc_type": "DocType",
         "requirement": "Requirement", "corrective_action": "CorrectiveAction", "alert": "Alert"}


def driver():
    return GraphDatabase.driver(os.environ.get("NEO4J_URL", "bolt://localhost:7688"),
                                auth=(os.environ.get("NEO4J_USER", "neo4j"), os.environ["NEO4J_PASSWORD"]))


def sync(tenant_id: int, factory_id: int) -> dict:
    with tenant_tx(tenant_id) as c:
        g = build_graph(c, factory_id)
    nodes = [{"key": n["id"], "label": n["label"], "kind": n["kind"]} for n in g.nodes.values()]
    edges = [{"a": a, "rel": rel, "b": b} for a, adj in g.adj.items() for rel, b in adj if not rel.startswith("~")]
    scope = {"t": tenant_id, "f": factory_id}
    with driver() as d, d.session() as s:
        s.run("CREATE CONSTRAINT node_key IF NOT EXISTS FOR (n:Node) REQUIRE (n.tenant_id, n.factory_id, n.key) IS UNIQUE")
        s.run("MATCH (n:Node {tenant_id: $t, factory_id: $f}) DETACH DELETE n", **scope)
        for kind, label in LABEL.items():
            batch = [n for n in nodes if n["kind"] == kind]
            if batch:
                s.run("UNWIND $rows AS r CREATE (n:Node:%s {tenant_id: $t, factory_id: $f, key: r.key, name: r.label, kind: r.kind})" % label,
                      rows=batch, **scope)
        for rel in sorted({e["rel"] for e in edges}):
            s.run("""UNWIND $rows AS r
                     MATCH (a:Node {tenant_id: $t, factory_id: $f, key: r.a}), (b:Node {tenant_id: $t, factory_id: $f, key: r.b})
                     CREATE (a)-[:%s]->(b)""" % rel, rows=[e for e in edges if e["rel"] == rel], **scope)
        counts = s.run("""MATCH (n:Node {tenant_id: $t, factory_id: $f}) OPTIONAL MATCH (n)-[r]->()
                          RETURN count(DISTINCT n) AS nodes, count(r) AS edges""", **scope).single()
    return {"nodes": counts["nodes"], "edges": counts["edges"], "expected": g.stats()}


def documents_linked_to(tenant_id: int, factory_id: int, reference: str, hops: int = 3) -> list[dict]:
    """Documents within `hops` of a reference number, with the relationship path (Cypher variable-length match)."""
    q = """MATCH p = (r:Reference {tenant_id: $t, factory_id: $f, name: $ref})-[*1..%d]-(d:Document)
           WHERE all(n IN nodes(p) WHERE n.tenant_id = $t AND n.factory_id = $f AND NOT n:DocType AND NOT n:Entity)
           WITH d, p ORDER BY length(p)
           WITH d, collect(p)[0] AS p
           RETURN d.name AS document, length(p) AS hops,
                  [x IN relationships(p) | type(x)] AS rels, [n IN nodes(p) | n.name] AS names
           ORDER BY hops, document""" % int(hops)
    with driver() as d, d.session() as s:
        return [dict(r) for r in s.run(q, t=tenant_id, f=factory_id, ref=reference)]


if __name__ == "__main__":
    t, f = int(sys.argv[1]), int(sys.argv[2])
    print("sync:", sync(t, f))
    for row in documents_linked_to(t, f, sys.argv[3] if len(sys.argv) > 3 else "FC-2025-0417"):
        print(row)
