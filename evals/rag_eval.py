"""Clause-to-evidence retrieval evaluation, with an ablation of the retrieval pipeline.

    python -m evals.rag_eval [--factory 1] [--tenant 1]

Runs on a factory whose documents have gone through the pipeline (indexed chunks). For every buyer-code
clause, the relevant documents are the factory's documents whose type the clause needs (ground truth from
the synthetic generator's types, confirmed by a person in review). Requirements with no relevant document
on file are skipped.

Configurations: vector only, full-text only, hybrid (RRF), hybrid + query rewriting/HyDE, and each with the
cross-encoder reranker when it is installed. Metrics: recall@5 (share of relevant documents in the top 5,
counting a document once; 20 chunks are retrieved and collapsed to distinct documents), hit@1 and MRR of the first
relevant document. A relevant document with no indexed text (e.g. a scan on a machine without OCR) is listed in
`relevant_not_indexed` and still counts as a miss.
"""

import argparse
import datetime
import json

from backend.config import settings
from backend.db.session import rows, tenant_tx
from backend.rag.mapping import clause_queries
from backend.rag.search import _cross_encoder, search
from evals.common import REPORTS, pct


def evaluate(conn, tenant_id, factory_id, reqs, docs, modes, rewrite, rerank):
    per = []
    for r in reqs:
        relevant = {d["code"] for d in docs if d["type"] in r["needs"]}
        if not relevant:
            continue
        query, extra = clause_queries(r, tenant_id) if rewrite else ("Clause %s %s: %s" % (r["clause"], r["title"], r["text"]), [])
        res = search(conn, factory_id, query, k=20, tenant_id=tenant_id, extra_queries=extra, modes=modes, use_reranker=rerank)
        ranked = list(dict.fromkeys(h["document"] for h in res["hits"]))
        first = next((i for i, d in enumerate(ranked, 1) if d in relevant), None)
        indexed = {d["code"] for d in docs if d["chunks"]}
        per.append({"requirement": r["code"], "relevant": sorted(relevant), "relevant_not_indexed": sorted(relevant - indexed), "top5": ranked[:5],
                    "recall_at_5": len(relevant & set(ranked[:5])) / len(relevant), "hit_at_1": first == 1,
                    "rr": 1 / first if first else 0.0})
    return {"queries": len(per), "recall_at_5": pct(sum(p["recall_at_5"] for p in per), len(per)) if per else None,
            "hit_at_1": pct(sum(p["hit_at_1"] for p in per), len(per)), "mrr": pct(sum(p["rr"] for p in per), len(per)), "per_clause": per}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--factory", type=int, default=1)
    ap.add_argument("--tenant", type=int, default=1)
    args = ap.parse_args(argv)
    configs = [("vector", ("vector",), False), ("fts", ("fts",), False), ("hybrid", ("vector", "fts"), False),
               ("hybrid+rewrite", ("vector", "fts"), True)]
    reranker = settings().reranker != "off" and _cross_encoder() is not None
    results = {}
    with tenant_tx(args.tenant) as c:
        reqs = rows(c, """SELECT r.* FROM requirements r JOIN factories f ON f.framework_id = r.framework_id WHERE f.id = :f ORDER BY r.id""",
                    f=args.factory)
        docs = rows(c, """SELECT d.code, d.type, count(ch.id) AS chunks FROM documents d LEFT JOIN chunks ch ON ch.document_id = d.id
                         WHERE d.factory_id = :f AND d.type IS NOT NULL GROUP BY d.code, d.type""", f=args.factory)
        chunks = rows(c, "SELECT count(*) AS n, min(embed_model) AS m FROM chunks ch JOIN documents d ON d.id = ch.document_id WHERE d.factory_id = :f",
                      f=args.factory)[0]
        for name, modes, rewrite in configs:
            results[name] = evaluate(c, args.tenant, args.factory, reqs, docs, modes, rewrite, False)
            if reranker:
                results[name + "+rerank"] = evaluate(c, args.tenant, args.factory, reqs, docs, modes, rewrite, True)
    out = {"kind": "rag", "date": datetime.date.today().isoformat(), "factory": args.factory, "documents": len(docs),
           "chunks": chunks["n"], "embed_model": chunks["m"], "reranker": reranker, "results": results,
           "note": "Synthetic documents; relevance = document type needed by the clause. Not real-world retrieval quality."}
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / ("%s-rag.json" % out["date"])
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    for k, v in results.items():
        print("%-22s recall@5=%s hit@1=%s mrr=%s (n=%d)" % (k, v["recall_at_5"], v["hit_at_1"], v["mrr"], v["queries"]))
    print("wrote", path)


if __name__ == "__main__":
    main()
