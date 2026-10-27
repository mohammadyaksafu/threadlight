"""LangGraph document pipeline with two human-in-the-loop interrupts.

ingest -> parse -> redact -> classify -> extract -> validate -> [human_review] -> index -> map_clauses
       -> analyze -> request_approval -> approval (interrupt) -> finalize -> draft

- `human_review` pauses the graph when any field is below the confidence threshold or failed a check; a
  person resumes it with accepted/corrected values (stored as labels for the eval set).
- `approval` pauses until a user with the officer role approves the document. Only then does the document
  count as verified evidence. The graph cannot pass this node without an officer's user id.
- State is checkpointed (Postgres in the worker, memory in tests), so a job resumes after a restart.
Each node runs in its own short tenant-scoped transaction, so row-level security applies throughout.
"""

import datetime
import re
from typing import Any, TypedDict

import structlog
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from backend.config import settings
from backend.db.session import audit, js, one, rows, tenant_tx
from backend.guardrails import injection, pii
from backend.guardrails.validators import validate as validate_extraction
from backend.llm import router
from backend.ocr.parse import parse
from backend.rag.index import index_clauses, index_document
from backend.rag.mapping import propose_for_document
from backend.services import drafting, storage
from backend.services.passport import passport

log = structlog.get_logger()
MAX_PAGES_TO_MODEL = 6
CANDIDATE_LINE = re.compile(r"\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}|[০-৯]{2}|\b[A-Z]{2,}-\d|\d{4}|:")


class State(TypedDict, total=False):
    job_id: str
    tenant_id: int
    factory_id: int
    document_id: int
    pages: list[dict]
    llm_pages: list[dict]
    pii: list[dict]
    injection_flags: list[str]
    type_hint: str | None
    raw_extraction: dict
    validated: dict
    review: Any
    proposals: list[dict]
    scores: dict
    report_id: int
    approval: Any


def _event(conn, job_id: str, step: str, state: str = "running", detail: dict | None = None):
    conn.exec_driver_sql(
        "UPDATE jobs SET step = %s, state = %s, updated_at = now(), events = events || %s::jsonb WHERE id = %s",
        (step, state, js([{"step": step, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), **(detail or {})}]), job_id))


def _tx(s: State):
    return tenant_tx(s["tenant_id"])


def ingest(s: State) -> State:
    with _tx(s) as c:
        _event(c, s["job_id"], "ingest")
    return {}


def parse_node(s: State) -> State:
    with _tx(s) as c:
        d = one(c, "SELECT file_key, mime, filename FROM documents WHERE id = :id", id=s["document_id"])
    pages = [p.__dict__ for p in parse(storage.get(d["file_key"]), d["mime"], d["filename"])]
    with _tx(s) as c:
        c.exec_driver_sql("DELETE FROM pages WHERE document_id = %s", (s["document_id"],))
        for p in pages:
            c.exec_driver_sql("INSERT INTO pages (tenant_id, document_id, page, text, method) VALUES (%s, %s, %s, %s, %s)",
                              (s["tenant_id"], s["document_id"], p["page"], p["text"], p["method"]))
        _event(c, s["job_id"], "parse", detail={"pages": len(pages), "methods": sorted({p["method"] for p in pages})})
    return {"pages": pages}


def redact_node(s: State) -> State:
    with _tx(s) as c:
        allow = [r["name"] for r in rows(c, "SELECT name FROM factories")]
    llm_pages, found, flags = [], [], []
    for p in s["pages"]:
        text, ents = pii.redact(p["text"], allow)
        flags += injection.scan(text)
        llm_pages.append({"page": p["page"], "text": injection.fence(text)})
        found += ents
    with _tx(s) as c:
        _event(c, s["job_id"], "redact", detail={"pii": len(found), "injection_flags": len(flags)})
        if flags:
            audit(c, s["tenant_id"], "system", "injection_suspected", "document:%d" % s["document_id"], {"matches": flags[:5]})
    return {"llm_pages": llm_pages, "pii": found, "injection_flags": flags}


def _evidence_types(s: State) -> dict:
    with _tx(s) as c:
        return one(c, """SELECT fw.evidence_types FROM factories f JOIN frameworks fw ON fw.id = f.framework_id
                         WHERE f.id = :f""", f=s["factory_id"])["evidence_types"]


def classify_node(s: State) -> State:
    et = _evidence_types(s)
    with _tx(s) as c:
        fn = one(c, "SELECT filename FROM documents WHERE id = :id", id=s["document_id"])["filename"]
    first = s["llm_pages"][0]["text"][:2500] if s["llm_pages"] else ""
    try:
        r = router.complete("classify", "classify", {"evidence_types": et, "filename": fn, "text": first},
                            tenant_id=s["tenant_id"], max_tokens=100)
        hint = r.data.get("type") if r.data.get("type") in et else None
        detail = {"type": hint, "model": r.model}
    except router.AllModelsFailed as e:
        hint, detail = None, {"error": str(e)[:300]}
    with _tx(s) as c:
        _event(c, s["job_id"], "classify", detail=detail)
    return {"type_hint": hint}


def trim_pages(pages: list[dict]) -> list[dict]:
    """Context trimming: page 1 plus pages that contain field-like lines (dates, references, labels)."""
    keep = [p for p in pages if p["page"] == 1 or len(CANDIDATE_LINE.findall(p["text"])) >= 2]
    return keep[:MAX_PAGES_TO_MODEL] or pages[:1]


def extract_node(s: State) -> State:
    et = _evidence_types(s)
    with _tx(s) as c:
        fn = one(c, "SELECT filename FROM documents WHERE id = :id", id=s["document_id"])["filename"]
    sent = trim_pages(s["llm_pages"])
    r = router.complete("extract", "extract", {"evidence_types": et, "filename": fn, "pages": sent},
                        tenant_id=s["tenant_id"], type_hint=s.get("type_hint"), max_tokens=3000)
    with _tx(s) as c:
        c.exec_driver_sql("UPDATE documents SET model = %s, prompt_version = %s WHERE id = %s", (r.model, r.prompt_version, s["document_id"]))
        _event(c, s["job_id"], "extract", detail={"model": r.model, "prompt_version": r.prompt_version, "pages_sent": [p["page"] for p in sent],
                                                  "tokens": r.usage, "cache_hit": r.cache_hit})
    return {"raw_extraction": r.data}


def _write_fields(c, s: State, v: dict, corrected_by: str | None = None):
    for name, f in v["fields"].items():
        c.exec_driver_sql("""
            INSERT INTO extracted_fields (tenant_id, document_id, field, value, page, confidence, source_span, corrected_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (document_id, field) DO UPDATE SET value = EXCLUDED.value, page = EXCLUDED.page,
              confidence = EXCLUDED.confidence, source_span = EXCLUDED.source_span, corrected_by = EXCLUDED.corrected_by""",
            (s["tenant_id"], s["document_id"], name, f["value"], f["page"], f["confidence"], f["quote"], corrected_by))
    fields = v["fields"]
    confs = [fields[n]["confidence"] for n in ("ref", "entity", "issued") if fields[n]["value"]]
    pages_used = [fields[n]["page"] for n in ("issued", "valid_until", "ref") if fields[n]["value"] and fields[n]["page"]]
    c.exec_driver_sql("""
        UPDATE documents SET type = %s, title = %s, ref = %s, entity = %s, issued = %s, valid_until = %s, cites = %s::jsonb,
          source_page = %s, confidence = %s WHERE id = %s""",
        (v["type"], v["title"] or "", fields["ref"]["value"], fields["entity"]["value"], fields["issued"]["value"],
         fields["valid_until"]["value"], js([{"ref": x["ref"], "of_type": x["of_type"]} for x in v["cites"]]),
         pages_used[0] if pages_used else 1, min(confs) if confs else 0, s["document_id"]))


def validate_node(s: State) -> State:
    et = _evidence_types(s)
    pages = {p["page"]: p["text"] for p in s["llm_pages"]}
    try:
        v = validate_extraction(s["raw_extraction"], pages, list(et), settings().review_threshold)
    except Exception as e:  # schema failure -> whole document to review
        v = {"type": None, "title": "", "fields": {n: {"value": None, "quote": "", "page": None, "confidence": 0.0, "checks": {}}
                                                  for n in ("ref", "entity", "issued", "valid_until")},
             "cites": [], "issues": ["schema: %s" % e], "low_fields": ["ref", "entity", "issued"], "needs_review": True}
    if s.get("injection_flags"):
        v["needs_review"] = True
        v["issues"].append("instruction-like text found in the document")
    with _tx(s) as c:
        _write_fields(c, s, v)
        status = "needs_review" if v["needs_review"] else "extracted"
        c.exec_driver_sql("UPDATE documents SET status = %s WHERE id = %s", (status, s["document_id"]))
        if v["needs_review"]:
            c.exec_driver_sql("""INSERT INTO review_items (tenant_id, job_id, document_id, kind, payload)
                                 VALUES (%s, %s, %s, 'fields', %s::jsonb)""",
                              (s["tenant_id"], s["job_id"], s["document_id"], js({"validated": v})))
        _event(c, s["job_id"], "validate", state="waiting_review" if v["needs_review"] else "running",
               detail={"issues": v["issues"], "low_fields": v["low_fields"]})
    return {"validated": v}


def human_review(s: State) -> State:
    """Interrupt: a person accepts or corrects the fields. Resume value: {by, role, type?, fields{name: value}}."""
    answer = interrupt({"kind": "fields", "document_id": s["document_id"], "low_fields": s["validated"]["low_fields"]})
    v = s["validated"]
    if answer.get("type"):
        v["type"] = answer["type"]
    for name, value in (answer.get("fields") or {}).items():
        f = v["fields"][name]
        f.update(value=value or None, confidence=1.0, page=f["page"] or 1)
    for name in ("ref", "entity", "issued", "valid_until"):  # everything the person saw counts as reviewed
        if v["fields"][name]["value"]:
            v["fields"][name]["confidence"] = 1.0
    with _tx(s) as c:
        _write_fields(c, s, v, corrected_by=answer["by"])
        c.exec_driver_sql("UPDATE documents SET status = 'extracted' WHERE id = %s", (s["document_id"],))
        audit(c, s["tenant_id"], answer["by"], "fields_reviewed", "document:%d" % s["document_id"], answer)
        _event(c, s["job_id"], "human_review", detail={"by": answer["by"]})
    return {"validated": v, "review": answer}


def index_node(s: State) -> State:
    with _tx(s) as c:
        fw = one(c, "SELECT framework_id FROM factories WHERE id = :f", f=s["factory_id"])["framework_id"]
        index_clauses(c, s["tenant_id"], fw)
        stats = index_document(c, s["tenant_id"], s["document_id"])
        _event(c, s["job_id"], "index", detail=stats)
    return {}


def map_node(s: State) -> State:
    with _tx(s) as c:
        props = propose_for_document(c, s["tenant_id"], s["factory_id"], s["document_id"])
        _event(c, s["job_id"], "map_clauses", detail={"proposals": props})
    return {"proposals": props}


def _snapshot_alerts(c, s: State, result: dict):
    c.exec_driver_sql("DELETE FROM alerts WHERE factory_id = %s", (s["factory_id"],))
    for a in result["alerts"]:
        c.exec_driver_sql("""INSERT INTO alerts (tenant_id, factory_id, code, type, severity, subject, related, requirements, message, verify)
                             VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)""",
                          (s["tenant_id"], s["factory_id"], a["id"], a["type"], a["severity"], js(a["subject"]), js(a["related"]),
                           js(a["requirements"]), a["message"], a["verify"]))


def analyze_node(s: State) -> State:
    with _tx(s) as c:
        result = passport(c, s["factory_id"])["result"]
        _snapshot_alerts(c, s, result)
        _event(c, s["job_id"], "analyze", detail={"scores": result["scores"]})
    return {"scores": result["scores"]}


def draft_node(s: State) -> State:
    try:
        with _tx(s) as c:
            report = drafting.generate(c, s["tenant_id"], s["factory_id"])
            _event(c, s["job_id"], "draft", state="done", detail={"report_id": report["id"], "flagged": report["flagged"], "model": report["model"]})
        return {"report_id": report["id"]}
    except Exception as e:  # a failed draft must not fail the job: the evidence is already approved
        with _tx(s) as c:
            _event(c, s["job_id"], "draft", state="done", detail={"error": str(e)[:300]})
        return {}


def request_approval(s: State) -> State:
    with _tx(s) as c:
        open_item = one(c, "SELECT id FROM review_items WHERE document_id = :d AND kind = 'approval' AND status = 'open'", d=s["document_id"])
        if not open_item:
            c.exec_driver_sql("INSERT INTO review_items (tenant_id, job_id, document_id, kind, payload) VALUES (%s, %s, %s, 'approval', %s::jsonb)",
                              (s["tenant_id"], s["job_id"], s["document_id"], js({"scores": s.get("scores")})))
        _event(c, s["job_id"], "request_approval", state="waiting_approval")
    return {}


class ApprovalError(Exception):
    pass


def approval(s: State) -> State:
    """Interrupt: resume value {approved: bool, by: user name, user_id, role}. Only an officer may approve."""
    answer = interrupt({"kind": "approval", "document_id": s["document_id"]})
    if answer.get("role") != "officer" or not answer.get("user_id"):
        raise ApprovalError("Only a named Compliance Officer can approve evidence")
    with _tx(s) as c:
        if answer.get("approved"):
            c.exec_driver_sql("UPDATE documents SET verified = true, verified_by = %s, verified_at = now() WHERE id = %s",
                              (answer["by"], s["document_id"]))
        audit(c, s["tenant_id"], "user:%s" % answer["user_id"], "evidence_approved" if answer.get("approved") else "evidence_rejected",
              "document:%d" % s["document_id"], {"by": answer["by"]})
        _event(c, s["job_id"], "approval", detail={"approved": bool(answer.get("approved")), "by": answer["by"]})
    return {"approval": answer}


def finalize(s: State) -> State:
    with _tx(s) as c:
        result = passport(c, s["factory_id"])["result"]
        _snapshot_alerts(c, s, result)
        _event(c, s["job_id"], "finalize", state="done", detail={"scores": result["scores"]})
    return {"scores": result["scores"]}


def build(checkpointer):
    g = StateGraph(State)
    for name, fn in [("ingest", ingest), ("parse", parse_node), ("redact", redact_node), ("classify", classify_node),
                     ("extract", extract_node), ("validate", validate_node), ("human_review", human_review),
                     ("index", index_node), ("map_clauses", map_node), ("analyze", analyze_node), ("draft", draft_node),
                     ("request_approval", request_approval), ("approval", approval), ("finalize", finalize)]:
        g.add_node(name, fn)
    g.add_edge(START, "ingest")
    for a, b in [("ingest", "parse"), ("parse", "redact"), ("redact", "classify"), ("classify", "extract"), ("extract", "validate")]:
        g.add_edge(a, b)
    g.add_conditional_edges("validate", lambda s: "human_review" if s["validated"]["needs_review"] else "index",
                            {"human_review": "human_review", "index": "index"})
    # The draft runs after finalize so a slow or rate-limited model never delays the officer's approval step.
    for a, b in [("human_review", "index"), ("index", "map_clauses"), ("map_clauses", "analyze"), ("analyze", "request_approval"),
                 ("request_approval", "approval"), ("approval", "finalize"), ("finalize", "draft"), ("draft", END)]:
        g.add_edge(a, b)
    return g.compile(checkpointer=checkpointer)
