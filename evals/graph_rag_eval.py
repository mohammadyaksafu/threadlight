"""Graph RAG evaluation: multi-hop questions, hybrid retrieval vs hybrid + knowledge-graph expansion.

    python -m evals.graph_rag_eval [--factory 1] [--tenant 1]

The questions ask about relations between records (who cites a certificate, what supersedes it, what an alert
concerns, what a clause needs), where the answer spans documents that do not share wording. Relevant documents
come from the synthetic scenario's ground truth (data/sample.json: cites, supersedes, needs, alerts). Metric:
recall@3 over distinct documents (the factory has only 7 documents, so recall@5 is near 100% for any method), and hit@1. A small, synthetic set: it shows the mechanism, not real-world quality.
"""

import argparse
import datetime
import json

from backend.db.session import tenant_tx
from backend.rag.graph import graph_search
from backend.rag.search import search
from evals.common import REPORTS, pct

QUESTIONS = [
    ("Which records refer to fire certificate FC-2025-0417?", {"D1", "D6", "D1-renewal"}),
    ("If fire certificate D1 expires, which other evidence is affected?", {"D1", "D1-renewal", "D6"}),
    ("What evidence does requirement R5 need?", {"D5", "D1", "D1-renewal"}),
    ("Which certificate do the safety committee minutes quote?", {"D6", "D1"}),
    ("Which documents does alert A2 concern?", {"D6", "D1-renewal"}),
    ("Which document shows the entity name variant on environmental clearance EC-2024-5521?", {"D4"}),
]


def run(conn, tenant, factory, fn):
    per = []
    for q, relevant in QUESTIONS:
        res = fn(conn, factory, q, k=10, tenant_id=tenant, use_reranker=False)
        ranked = list(dict.fromkeys(h["document"] for h in res["hits"]))[:3]
        per.append({"question": q, "relevant": sorted(relevant), "top3": ranked,
                    "recall_at_3": len(relevant & set(ranked)) / len(relevant), "hit_at_1": bool(ranked) and ranked[0] in relevant,
                    "paths": {h["document"]: h["graph"]["path"] for h in res["hits"] if "graph" in h and h["document"] in ranked}})
    n = len(per)
    return {"queries": n, "recall_at_3": pct(sum(p["recall_at_3"] for p in per), n), "hit_at_1": pct(sum(p["hit_at_1"] for p in per), n),
            "per_question": per}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--factory", type=int, default=1)
    ap.add_argument("--tenant", type=int, default=1)
    args = ap.parse_args(argv)
    with tenant_tx(args.tenant) as c:
        results = {"hybrid": run(c, args.tenant, args.factory, search), "hybrid+graph": run(c, args.tenant, args.factory, graph_search)}
    out = {"kind": "graph_rag", "date": datetime.date.today().isoformat(), "factory": args.factory, "results": results,
           "note": "6 synthetic multi-hop questions; ground truth from data/sample.json relations. Not real-world retrieval quality."}
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / ("%s-graph-rag.json" % out["date"])
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    for k, v in results.items():
        print("%-14s recall@3=%s hit@1=%s (n=%d)" % (k, v["recall_at_3"], v["hit_at_1"], v["queries"]))
    print("wrote", path)


if __name__ == "__main__":
    main()
