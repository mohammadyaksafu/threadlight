"""Lakehouse (Delta Lake + DuckDB) export and the Neo4j mirror of the evidence graph."""

import os
from pathlib import Path

import pytest


def _lake_root(tmp_path: Path) -> Path:
    if " " not in str(tmp_path):
        return tmp_path
    if os.environ.get("LAKEHOUSE_TEST_ROOT"):  # delta-rs cannot write under a path with spaces (Windows user folders)
        return Path(os.environ["LAKEHOUSE_TEST_ROOT"]) / tmp_path.name
    pytest.skip("temp path has spaces; set LAKEHOUSE_TEST_ROOT to a folder without spaces")


def test_lakehouse_export_is_idempotent_and_queryable(seeded, tmp_path):
    from backend.services.lakehouse import export, query

    root = _lake_root(tmp_path)
    first = export(1, root, "2026-10-31")
    again = export(1, root, "2026-10-31")  # same day: replaces the snapshot, does not duplicate it
    assert first["documents"]["rows"] == again["documents"]["rows"] >= 6
    res = query(root)
    assert sum(r["n"] for r in res["documents_by_status"]) == first["documents"]["rows"]
    assert all(set(r) >= {"action", "n"} for r in res["audit_actions"])


@pytest.mark.skipif(not os.environ.get("NEO4J_PASSWORD"), reason="needs a Neo4j server (NEO4J_URL, NEO4J_PASSWORD)")
def test_neo4j_mirror_matches_graph_and_finds_citing_document(seeded):
    from backend.rag.neo4j_sync import documents_linked_to, sync

    s = sync(1, 1)
    assert s["nodes"] == s["expected"]["nodes"] and s["edges"] == s["expected"]["edges"]
    found = {r["document"]: r for r in documents_linked_to(1, 1, "FC-2025-0417")}
    assert found["D1"]["hops"] == 1 and found["D6"]["rels"] == ["SIMILAR_TO", "CITES"]
