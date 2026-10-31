"""Analytics lakehouse: operational tables exported to Delta Lake, queried with DuckDB.

    python -m backend.services.lakehouse <tenant_id> [--root <dir>]     # default $LAKEHOUSE_ROOT or var/lakehouse

delta-rs (0.22) cannot write under a path that contains spaces, so on a machine where the repo path has spaces set
LAKEHOUSE_ROOT to a folder without them (this laptop: C:/tl-lakehouse).

Postgres serves the app; the lakehouse is the analytics copy. Each run appends a snapshot of the tenant's
model-call log, pipeline jobs, document metadata, review queue and audit-log events to Delta tables
(Parquet + a transaction log, so every run is a versioned, time-travelable commit), partitioned by snapshot date.
No document text, extracted values or user data is exported: only ids, types, statuses, counts and timings.
DuckDB then reads the Delta tables through Arrow and writes evals/reports/<date>-lakehouse.json.
"""

import argparse
import datetime
import json
import os
from pathlib import Path

import duckdb
import pyarrow as pa
from deltalake import DeltaTable, write_deltalake

from backend.db.session import rows, tenant_tx
from evals.common import REPORTS

TABLES = {
    "llm_calls": "SELECT id, purpose, provider, model, prompt_version, input_tokens, output_tokens, cached_tokens, latency_ms, "
                 "cost_usd::float AS cost_usd, cache_hit, ok, created_at FROM llm_calls",
    "jobs": "SELECT id::text AS id, factory_id, document_id, state, step, created_at, updated_at FROM jobs",
    "documents": "SELECT id, factory_id, code, type, status, verified, confidence::float AS confidence, model, prompt_version, created_at FROM documents",
    "review_items": "SELECT id::text AS id, document_id, kind, status, created_at, resolved_at FROM review_items",
    "audit_events": "SELECT id, action, at FROM audit_log",
}

QUERIES = {
    "tokens_by_model": """SELECT provider, model, count(*) AS calls, sum(input_tokens + output_tokens) AS tokens,
                                 round(avg(latency_ms)) AS avg_latency_ms, round(avg(CASE WHEN cache_hit THEN 1 ELSE 0 END), 3) AS cache_hit_rate
                          FROM llm_calls WHERE snapshot = (SELECT max(snapshot) FROM llm_calls)
                          GROUP BY 1, 2 ORDER BY tokens DESC""",
    "calls_per_day": """SELECT CAST(created_at AS DATE) AS day, provider, count(*) AS calls FROM llm_calls
                        WHERE snapshot = (SELECT max(snapshot) FROM llm_calls) GROUP BY 1, 2 ORDER BY 1, 2""",
    "pipeline_seconds": """SELECT state, count(*) AS jobs, round(avg(epoch(updated_at) - epoch(created_at)), 1) AS avg_seconds
                           FROM jobs WHERE snapshot = (SELECT max(snapshot) FROM jobs) GROUP BY 1 ORDER BY 1""",
    "documents_by_status": """SELECT type, status, verified, count(*) AS n FROM documents
                              WHERE snapshot = (SELECT max(snapshot) FROM documents) GROUP BY 1, 2, 3 ORDER BY 1""",
    "review_backlog": """SELECT kind, status, count(*) AS n FROM review_items
                         WHERE snapshot = (SELECT max(snapshot) FROM review_items) GROUP BY 1, 2 ORDER BY 1, 2""",
    "audit_actions": """SELECT action, count(*) AS n FROM audit_events WHERE snapshot = (SELECT max(snapshot) FROM audit_events)
                        GROUP BY 1 ORDER BY n DESC""",
    "snapshots": "SELECT snapshot, count(*) AS rows FROM llm_calls GROUP BY 1 ORDER BY 1",
}


def export(tenant_id: int, root: Path, snapshot: str) -> dict:
    out = {}
    with tenant_tx(tenant_id) as c:
        for name, sql in TABLES.items():
            data = rows(c, sql)
            for r in data:
                r["tenant_id"], r["snapshot"] = tenant_id, snapshot
            if not data:
                out[name] = {"rows": 0}
                continue
            path = root / name
            mode = "append"
            if DeltaTable.is_deltatable(str(path)):
                DeltaTable(str(path)).delete("snapshot = '%s' AND tenant_id = %d" % (snapshot, tenant_id))  # idempotent per day
            else:
                mode = "overwrite"
            table = pa.Table.from_pylist(data)
            # an all-NULL column infers Arrow's null type, which Delta cannot store: keep it as a nullable string
            table = table.cast(pa.schema([pa.field(f.name, pa.string()) if pa.types.is_null(f.type) else f for f in table.schema]))
            write_deltalake(str(path), table, mode=mode, partition_by=["snapshot"])
            out[name] = {"rows": len(data), "delta_version": DeltaTable(str(path)).version()}
    return out


def query(root: Path) -> dict:
    con = duckdb.connect()
    for name in TABLES:
        path = root / name
        if DeltaTable.is_deltatable(str(path)):
            con.register(name, DeltaTable(str(path)).to_pyarrow_table())
    res = {}
    for name, sql in QUERIES.items():
        try:
            cur = con.execute(sql)
            cols = [d[0] for d in cur.description]
            res[name] = [dict(zip(cols, r)) for r in cur.fetchall()]
        except duckdb.CatalogException:
            res[name] = []
    return res


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("tenant", type=int)
    ap.add_argument("--root", default=os.environ.get("LAKEHOUSE_ROOT", "var/lakehouse"))
    args = ap.parse_args(argv)
    root = Path(args.root)
    root.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    report = {"kind": "lakehouse", "date": today, "format": "Delta Lake (delta-rs) + DuckDB", "root": args.root,
              "exported": export(args.tenant, root, today), "queries": query(root)}
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / ("%s-lakehouse.json" % today)
    path.write_text(json.dumps(report, indent=1, default=str), encoding="utf-8")
    print(json.dumps(report["exported"]))
    for k, v in report["queries"].items():
        print(k, v[:4])
    print("wrote", path)


if __name__ == "__main__":
    main()
