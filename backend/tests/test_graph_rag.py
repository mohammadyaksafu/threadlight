"""Graph RAG: the knowledge graph built from seeded evidence and the multi-hop walk."""

from backend.db.session import tenant_tx
from backend.rag.graph import build_graph, query_seeds, walk


def test_graph_links_misquoted_certificate(seeded):
    with tenant_tx(1) as c:
        g = build_graph(c, 1)
    s = g.stats()
    assert s["by_kind"]["document"] >= 6 and s["by_kind"]["requirement"] == 8 and s["by_kind"]["reference"] >= 7
    # D6 (committee minutes) quotes FC-2025-0471; D1's own number is FC-2025-0417. The graph keeps a weak link.
    assert ("SIMILAR_TO", "ref:FC-2025-0471") in g.adj["ref:FC-2025-0417"]


def test_walk_reaches_citing_document_in_two_hops(seeded):
    with tenant_tx(1) as c:
        g = build_graph(c, 1)
    seeds = {n: "named in query" for n in query_seeds(g, "Which records refer to certificate FC-2025-0417?")}
    assert seeds == {"ref:FC-2025-0417": "named in query"}
    reached = walk(g, seeds)
    assert reached["doc:D1"]["hops"] == 1
    assert reached["doc:D6"]["hops"] == 2 and "SIMILAR_TO" in " ".join(reached["doc:D6"]["path"])


def test_requirement_seed_reaches_evidence_type(seeded):
    with tenant_tx(1) as c:
        g = build_graph(c, 1)
    reached = walk(g, {n: "named in query" for n in query_seeds(g, "What evidence supports R1?")})
    assert "doc:D1" in reached and "IS_A" in " ".join(reached["doc:D1"]["path"])


def test_graph_is_tenant_scoped(seeded):
    with tenant_tx(2) as c:
        g = build_graph(c, 1)
    assert g.stats()["nodes"] == 0
