"""Bilingual (English + Bangla) draft explanations, written from the rule output only.

The rules engine has already decided every status. The model explains; the citation checker drops any
sentence without a valid source tag, the draft is regenerated once if anything was dropped, and anything
still uncited is flagged on the report. Reports are always labelled "Draft for human review".
"""

import structlog
from sqlalchemy.engine import Connection

from backend.db.session import js, scalar
from backend.guardrails import citations
from backend.llm import router
from backend.services.passport import passport

log = structlog.get_logger()


def _inputs(p: dict) -> dict:
    data, result = p["dataset"], p["result"]
    docs = {d["id"]: d for d in data["documents"]}
    reqs = []
    for r in result["requirements"]:
        sources = ["%s:p%d" % (d, docs[d]["source"]["page"]) for d in r["supporting"] if d in docs]
        reqs.append({"id": r["id"], "clause": r["clause"], "title": r["title"], "status": r["status"],
                     "reasons": r["reasons"], "sources": sources or [r["id"]]})
    return {"factory": data["factory"], "audit_date": data["audit_date"], "today": data["today"],
            "scores": result["scores"], "requirements": reqs, "alerts": result["alerts"]}


def _check(body: dict, allowed: set[str]) -> tuple[dict, list[str]]:
    dropped = []
    out = {"sections": []}
    for key in ("summary_en", "summary_bn"):
        out[key], d = citations.check(body.get(key, ""), allowed)
        dropped += d
    for s in body.get("sections", []):
        en, d1 = citations.check(s.get("text_en", ""), allowed)
        bn, d2 = citations.check(s.get("text_bn", ""), allowed)
        dropped += d1 + d2
        out["sections"].append({"requirement": s.get("requirement"), "text_en": en, "text_bn": bn})
    return out, dropped


def generate(conn: Connection, tenant_id: int, factory_id: int) -> dict:
    p = passport(conn, factory_id)
    variables = _inputs(p)
    allowed = citations.allowed_tags(p["result"], p["dataset"]["documents"])
    res = router.complete("draft", "draft", variables, tenant_id=tenant_id, max_tokens=6000)
    body, dropped = _check(res.data, allowed)
    regenerated = False
    if dropped:
        regenerated = True
        res2 = router.complete("draft", "draft", variables, tenant_id=tenant_id, use_cache=False, max_tokens=6000, temperature=0.3)
        body2, dropped2 = _check(res2.data, allowed)
        if len(dropped2) < len(dropped):
            body, dropped, res = body2, dropped2, res2
    report = {**body, "label": "Draft for human review", "scores": p["result"]["scores"],
              "uncited_dropped": dropped, "flagged": bool(dropped), "regenerated": regenerated,
              "model": res.model, "prompt_version": res.prompt_version,
              "today": p["dataset"]["today"], "audit_date": p["dataset"]["audit_date"]}
    rid = scalar(conn, """INSERT INTO reports (tenant_id, factory_id, lang, body, model, prompt_version)
                          VALUES (:t, :f, 'en+bn', CAST(:b AS jsonb), :m, :v) RETURNING id""",
                 t=tenant_id, f=factory_id, b=js(report), m=res.model, v=res.prompt_version)
    report["id"] = rid
    return report
