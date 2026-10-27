"""Builds the rules-engine input from the database and runs the unchanged engine.

The dict has the same shape as data/sample.json, so `threadlight.engine.analyze()` (and the TypeScript
port in the web app) work on it without changes. There is no second copy of the rules.
"""

import datetime

from sqlalchemy.engine import Connection

from backend.db.session import one, rows
from threadlight.engine import analyze

ENGINE_STATUSES = ("extracted",)  # documents still awaiting human field review do not drive the rules


def _iso(d):
    return d.isoformat() if d else None


def factory_row(conn: Connection, factory_id: int) -> dict | None:
    return one(conn, """
        SELECT f.*, fw.name AS framework_name, fw.version AS framework_version, fw.evidence_types
        FROM factories f JOIN frameworks fw ON fw.id = f.framework_id WHERE f.id = :id""", id=factory_id)


def today_for(factory: dict) -> str:
    return _iso(factory["scenario_today"]) or datetime.date.today().isoformat()


def doc_to_engine(d: dict) -> dict:
    out = {
        "id": d["code"], "type": d["type"], "title": d["title"], "entity": d["entity"] or "", "ref": d["ref"] or "",
        "issued": _iso(d["issued"]), "valid_until": _iso(d["valid_until"]),
        "source": {"file": d["filename"], "page": d["source_page"]},
        "confidence": round(float(d["confidence"]), 2) if d["confidence"] is not None else None,
        "verified": bool(d["verified"]), "cites": d["cites"] or [],
    }
    if d.get("supersedes"):
        out["supersedes"] = d["supersedes"]
    return out


def build_dataset(conn: Connection, factory_id: int) -> dict:
    f = factory_row(conn, factory_id)
    if not f:
        raise KeyError(factory_id)
    reqs = rows(conn, "SELECT * FROM requirements WHERE framework_id = :fw ORDER BY id", fw=f["framework_id"])
    docs = rows(conn, """
        SELECT * FROM documents WHERE factory_id = :f AND status = ANY(:st) AND type IS NOT NULL AND issued IS NOT NULL
        ORDER BY id""", f=factory_id, st=list(ENGINE_STATUSES))
    caps = rows(conn, "SELECT * FROM corrective_actions WHERE factory_id = :f ORDER BY id", f=factory_id)
    data = {
        "_notice": "SYNTHETIC DATA served by the ThreadLight API from Postgres.",
        "scenario": f["scenario"],
        "today": today_for(f),
        "audit_date": _iso(f["audit_date"]),
        "factory": f["name"],
        "buyer": f["buyer"],
        "framework": "%s %s" % (f["framework_name"], f["framework_version"]) if f["framework_version"] else f["framework_name"],
        "evidence_types": f["evidence_types"],
        "requirements": [],
        "documents": [doc_to_engine(d) for d in docs],
        "corrective_actions": [{
            "id": c["code"], "title": c["title"], "claimed_status": c["claimed_status"],
            "closure_evidence": c["closure_evidence"], "requirement": c["requirement_code"],
        } for c in caps],
    }
    for r in reqs:
        item = {
            "id": r["code"], "clause": r["clause"], "title": r["title"], "title_bn": r["title_bn"],
            "criticality": r["criticality"], "needs": r["needs"], "department": r["department"], "text": r["text"],
        }
        if r["max_age"]:
            item["max_age_days"] = r["max_age"]
        data["requirements"].append(item)
    if f["demo"].get("renewal"):
        data["renewal"] = f["demo"]["renewal"]
    return data


def passport(conn: Connection, factory_id: int) -> dict:
    data = build_dataset(conn, factory_id)
    result = analyze(data)
    return {"factory": {"id": factory_id, "name": data["factory"], "buyer": data["buyer"], "framework": data["framework"]},
            "dataset": data, "result": result}
