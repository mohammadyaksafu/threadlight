"""Seed the synthetic tenants, demo accounts, buyer code and (optionally) the v1 documents.

    python -m backend.db.seed              # tenant 1 with the six v1 documents (pre-extracted, verified)
    python -m backend.db.seed --no-docs    # tenant 1 without documents: upload them through the pipeline
    python -m backend.db.seed --reset      # drop all rows first

Tenant 2 is a second synthetic factory group used only by the cross-tenant isolation tests.
"""

import argparse
import json
import os
from pathlib import Path

import bcrypt

from backend.db.session import admin_tx, js, scalar
from threadlight.engine import normalize_entity

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = json.loads((ROOT / "data" / "sample.json").read_text(encoding="utf-8"))

# Same public demo credentials as the offline web app (web/src/auth/accounts.ts).
DEMO_USERS = [
    ("officer@threadlight.demo", "Compliance Officer (synthetic)", "officer", "Officer-Demo-2026"),
    ("staff@threadlight.demo", "Factory staff (synthetic)", "staff", "Staff-Demo-2026"),
    ("guest@threadlight.demo", "Guest viewer", "viewer", "Guest-Demo-2026"),
    ("auditor@threadlight.demo", "Buyer auditor (synthetic)", "auditor", "Auditor-Demo-2026"),
    # read-only service account for the n8n workflows; set AUTOMATION_PASSWORD on the VPS
    ("automation@threadlight.demo", "n8n automation", "viewer", os.environ.get("AUTOMATION_PASSWORD", "Automation-Demo-2026")),
]
OTHER_USERS = [("officer@other.demo", "Other group officer (synthetic)", "officer", "Other-Demo-2026")]

TABLES = ["review_items", "jobs", "reports", "webhooks", "llm_calls", "alerts", "mappings", "clause_chunks",
          "chunks", "extracted_fields", "pages", "corrective_actions", "documents", "factories", "requirements",
          "frameworks", "users", "tenants"]


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def reset(conn):
    # audit_log and finding_events are append-only by trigger; a reset is the one owner-level exception.
    conn.exec_driver_sql("ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only")
    conn.exec_driver_sql("ALTER TABLE finding_events DISABLE TRIGGER finding_events_append_only")
    conn.exec_driver_sql("TRUNCATE %s, audit_log, finding_events, findings RESTART IDENTITY CASCADE" % ", ".join(TABLES))
    conn.exec_driver_sql("ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only")
    conn.exec_driver_sql("ALTER TABLE finding_events ENABLE TRIGGER finding_events_append_only")


def seed_tenant(conn, name, users, factory_name, with_docs):
    tid = scalar(conn, "INSERT INTO tenants (name) VALUES (:n) RETURNING id", n=name)
    for email, uname, role, pw in users:
        conn.exec_driver_sql(
            "INSERT INTO users (tenant_id, email, name, password_hash, role) VALUES (%s, %s, %s, %s, %s)",
            (tid, email, uname, hash_pw(pw), role))
    fw_name, _, fw_version = SAMPLE["framework"].rpartition(" ")
    fw = scalar(conn, "INSERT INTO frameworks (tenant_id, name, version, evidence_types) VALUES (:t, :n, :v, CAST(:e AS jsonb)) RETURNING id",
                t=tid, n=fw_name, v=fw_version, e=js(SAMPLE["evidence_types"]))
    for r in SAMPLE["requirements"]:
        scalar(conn, """INSERT INTO requirements (tenant_id, framework_id, code, clause, title, title_bn, text, criticality, needs, department, max_age)
                        VALUES (:t, :fw, :c, :cl, :ti, :tb, :tx, :cr, CAST(:n AS jsonb), :d, CAST(:m AS jsonb)) RETURNING id""",
               t=tid, fw=fw, c=r["id"], cl=r["clause"], ti=r["title"], tb=r["title_bn"], tx=r["text"], cr=r["criticality"],
               n=js(r["needs"]), d=r["department"], m=js(r.get("max_age_days", {})))
    fid = scalar(conn, """INSERT INTO factories (tenant_id, framework_id, name, normalized_name, buyer, scenario, audit_date, scenario_today, demo)
                          VALUES (:t, :fw, :n, :nn, :b, :s, :a, :td, CAST(:demo AS jsonb)) RETURNING id""",
                 t=tid, fw=fw, n=factory_name, nn=normalize_entity(factory_name), b=SAMPLE["buyer"], s=SAMPLE["scenario"],
                 a=SAMPLE["audit_date"], td=SAMPLE["today"], demo=js({"renewal": SAMPLE["renewal"]}))
    for cap in SAMPLE["corrective_actions"]:
        scalar(conn, """INSERT INTO corrective_actions (tenant_id, factory_id, code, title, claimed_status, closure_evidence, requirement_code)
                        VALUES (:t, :f, :c, :ti, :s, CAST(:e AS jsonb), :r) RETURNING id""",
               t=tid, f=fid, c=cap["id"], ti=cap["title"], s=cap["claimed_status"], e=js(cap["closure_evidence"]), r=cap["requirement"])
    if with_docs:
        for d in SAMPLE["documents"]:
            did = scalar(conn, """INSERT INTO documents (tenant_id, factory_id, code, filename, type, title, ref, entity, issued, valid_until,
                                       cites, source_page, confidence, verified, verified_by, status, model, prompt_version)
                            VALUES (:t, :f, :c, :fn, :ty, :ti, :r, :e, :i, :v, CAST(:ci AS jsonb), :p, :co, :ve, :vb, 'extracted', 'sample-pre-extracted', 'v1-sample')
                            RETURNING id""",
                         t=tid, f=fid, c=d["id"], fn=d["source"]["file"], ty=d["type"], ti=d["title"], r=d["ref"], e=d["entity"],
                         i=d["issued"], v=d["valid_until"], ci=js(d["cites"]), p=d["source"]["page"], co=d["confidence"],
                         ve=d["verified"], vb="Compliance Officer (synthetic)" if d["verified"] else None)
            for field in ("type", "ref", "entity", "issued", "valid_until"):
                conn.exec_driver_sql(
                    "INSERT INTO extracted_fields (tenant_id, document_id, field, value, page, confidence) VALUES (%s, %s, %s, %s, %s, %s)",
                    (tid, did, field, d[field], d["source"]["page"], d["confidence"]))
    return tid, fid


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-docs", action="store_true")
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args(argv)
    with admin_tx() as conn:
        if args.reset:
            reset(conn)
        elif scalar(conn, "SELECT count(*) FROM tenants"):
            print("Already seeded; use --reset to start over.")
            return
        t1, f1 = seed_tenant(conn, "Sample Group (synthetic)", DEMO_USERS, SAMPLE["factory"], not args.no_docs)
        t2, f2 = seed_tenant(conn, "Other Group (synthetic)", OTHER_USERS, "Other Knitwear Ltd. (synthetic)", True)
    print("Seeded tenant %d (factory %d) and tenant %d (factory %d)%s." % (t1, f1, t2, f2, " without documents" if args.no_docs else ""))


if __name__ == "__main__":
    main()
