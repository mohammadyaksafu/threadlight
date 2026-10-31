"""Factory-scoped endpoints: passport, documents, upload + pipeline progress, requirements, search,
what-if, report and exports. Every query runs in a tenant transaction (row-level security)."""

import asyncio
import csv
import hashlib
import html
import io
import json
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel

from backend.app.auth import User, staff, viewer
from backend.app.deps import UPLOADS, factory_or_404, limiter
from backend.db.session import audit, one, rows, scalar, tenant_tx
from backend.rag.graph import graph_search
from backend.rag.search import search as rag_search
from backend.services import drafting, jobs, storage
from backend.services.passport import build_dataset, passport
from threadlight.engine import analyze, set_document_field

router = APIRouter(prefix="/api", tags=["factories"])

MAX_BYTES = 20 * 1024 * 1024
MAGIC = {b"%PDF": "application/pdf", b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png"}


@router.get("/factories")
def list_factories(user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        return rows(c, "SELECT id, name, buyer, audit_date FROM factories ORDER BY id")


@router.get("/expiring")
def expiring(user: User = Depends(viewer)):
    """Evidence that expires before each factory's next audit (used by the n8n expiry-watch workflow)."""
    out = []
    with tenant_tx(user.tenant_id) as c:
        for f in rows(c, "SELECT id, name FROM factories ORDER BY id"):
            r = passport(c, f["id"])["result"]
            gaps = [{"requirement": q["id"], "title": q["title"], "owner": q["department"], "reason": q["reasons"][0]}
                    for q in r["requirements"] if any(ch["code"] in ("expires_before_audit", "expired") for ch in q["checks"])]
            if gaps:
                out.append({"factory_id": f["id"], "factory": f["name"], "audit_date": r["audit_date"],
                            "days_to_audit": r["days_to_audit"], "items": gaps})
    return out


@router.get("/factories/{factory_id}/passport")
def get_passport(factory_id: int, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        p = passport(c, factory_id)
        r = p["result"]
        return {"factory": p["factory"], "today": r["today"], "audit_date": r["audit_date"], "days_to_audit": r["days_to_audit"],
                "scores": r["scores"], "requirements": [{k: x[k] for k in ("id", "clause", "title", "status", "reasons", "supporting", "alerts")}
                                                        for x in r["requirements"]],
                "alerts": r["alerts"], "plan": r["plan"]}


@router.get("/factories/{factory_id}/dataset")
def get_dataset(factory_id: int, user: User = Depends(viewer)):
    """The rules-engine input (same shape as data/sample.json); the web app's live mode runs on it."""
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        return build_dataset(c, factory_id)


@router.get("/factories/{factory_id}/requirements")
def list_requirements(factory_id: int, status: str | None = None, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        reqs = passport(c, factory_id)["result"]["requirements"]
    return [r for r in reqs if not status or r["status"] == status]


@router.get("/factories/{factory_id}/requirements/{code}")
def get_requirement(factory_id: int, code: str, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        p = passport(c, factory_id)
        r = next((x for x in p["result"]["requirements"] if x["id"] == code), None)
        if not r:
            raise HTTPException(404, "Requirement not found")
        src = next(x for x in p["dataset"]["requirements"] if x["id"] == code)
        docs = {d["id"]: d for d in p["dataset"]["documents"]}
        maps = rows(c, """SELECT m.id, d.code AS document, m.score, m.method, m.status, m.confirmed_by, ch.page, ch.text AS chunk
                          FROM mappings m JOIN requirements q ON q.id = m.requirement_id JOIN documents d ON d.id = m.document_id
                          LEFT JOIN chunks ch ON ch.id = m.chunk_id WHERE m.factory_id = :f AND q.code = :c ORDER BY m.score DESC""",
                    f=factory_id, c=code)
    return {**r, "text": src["text"], "limit_text": src["text"],
            "evidence": [{"document": d, "file": docs[d]["source"]["file"], "page": docs[d]["source"]["page"]} for d in r["supporting"] if d in docs],
            "mappings": maps}


@router.get("/factories/{factory_id}/alerts")
def list_alerts(factory_id: int, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        return passport(c, factory_id)["result"]["alerts"]


@router.get("/factories/{factory_id}/documents")
def list_documents(factory_id: int, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        return rows(c, """SELECT id, code, filename, type, title, ref, entity, issued, valid_until, confidence, verified, verified_by,
                                 status, model, prompt_version, supersedes, created_at FROM documents WHERE factory_id = :f ORDER BY id""",
                    f=factory_id)


def _document(c, factory_id: int, code: str) -> dict:
    d = one(c, "SELECT * FROM documents WHERE factory_id = :f AND code = :c", f=factory_id, c=code)
    if not d:
        raise HTTPException(404, "Document not found")
    return d


@router.get("/factories/{factory_id}/documents/{code}")
def get_document(factory_id: int, code: str, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        d = _document(c, factory_id, code)
        fields = rows(c, "SELECT field, value, page, confidence, source_span, corrected_by FROM extracted_fields WHERE document_id = :d ORDER BY id", d=d["id"])
        pages = rows(c, "SELECT page, method, left(text, 4000) AS text FROM pages WHERE document_id = :d ORDER BY page", d=d["id"])
    d.pop("file_key", None)
    return {**d, "fields": fields, "pages": pages}


@router.post("/factories/{factory_id}/documents", status_code=202)
@limiter.limit("20/hour")
async def upload(request: Request, factory_id: int, file: UploadFile = File(...), supersedes: str | None = Form(None),
                 wait: bool = Query(False, include_in_schema=False), user: User = Depends(staff)):
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        UPLOADS.labels("too_large").inc()
        raise HTTPException(413, "Files are limited to 20 MB")
    mime = next((m for sig, m in MAGIC.items() if data.startswith(sig)), None)
    if not mime:
        UPLOADS.labels("bad_type").inc()
        raise HTTPException(415, "Only PDF, JPEG and PNG files are accepted")
    sha = hashlib.sha256(data).hexdigest()
    filename = re.sub(r"[^\w.\- ]", "_", file.filename or "upload")[:120]
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        dup = one(c, "SELECT code FROM documents WHERE factory_id = :f AND sha256 = :s", f=factory_id, s=sha)
        if dup:
            UPLOADS.labels("duplicate").inc()
            return {"duplicate": True, "document": dup["code"], "job_id": None}
        if supersedes:
            _document(c, factory_id, supersedes)
            code = supersedes + "-renewal"
            n = 2
            while one(c, "SELECT 1 AS x FROM documents WHERE factory_id = :f AND code = :c", f=factory_id, c=code):
                code, n = "%s-renewal-%d" % (supersedes, n), n + 1
        else:
            n = scalar(c, r"SELECT coalesce(max((substring(code from '^D(\d+)$'))::int), 0) FROM documents WHERE factory_id = :f", f=factory_id)
            code = "D%d" % (n + 1)
        key = "t%d/f%d/%s/%s" % (user.tenant_id, factory_id, sha[:16], filename)
        storage.put(key, data, mime)
        doc_id = scalar(c, """INSERT INTO documents (tenant_id, factory_id, code, file_key, filename, mime, sha256, supersedes)
                              VALUES (:t, :f, :c, :k, :fn, :m, :s, :sup) RETURNING id""",
                        t=user.tenant_id, f=factory_id, c=code, k=key, fn=filename, m=mime, s=sha, sup=supersedes)
        job_id = str(uuid.uuid4())
        c.exec_driver_sql("INSERT INTO jobs (id, tenant_id, factory_id, document_id) VALUES (%s, %s, %s, %s)",
                          (job_id, user.tenant_id, factory_id, doc_id))
        audit(c, user.tenant_id, user.actor, "document_uploaded", "document:%d" % doc_id, {"file": filename, "sha256": sha, "code": code})
    UPLOADS.labels("accepted").inc()
    await jobs.enqueue_start(job_id, user.tenant_id, factory_id, doc_id, wait=wait)
    return {"duplicate": False, "document": code, "job_id": job_id}


@router.get("/jobs/{job_id}")
def get_job(job_id: uuid.UUID, user: User = Depends(staff)):
    with tenant_tx(user.tenant_id) as c:
        j = one(c, "SELECT j.*, d.code AS document FROM jobs j LEFT JOIN documents d ON d.id = j.document_id WHERE j.id = :id", id=str(job_id))
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@router.get("/jobs/{job_id}/events")
async def job_events(job_id: uuid.UUID, user: User = Depends(staff)):
    """Server-sent events: one message per pipeline step until the job finishes or waits for a person."""
    async def stream():
        sent = 0
        for _ in range(1800):
            with tenant_tx(user.tenant_id) as c:
                j = one(c, "SELECT state, step, events, error FROM jobs WHERE id = :id", id=str(job_id))
            if not j:
                yield "event: error\ndata: {}\n\n"
                return
            for e in j["events"][sent:]:
                yield "data: %s\n\n" % json.dumps({**e, "state": j["state"]}, default=str)
            sent = len(j["events"])
            if j["state"] in ("done", "failed", "waiting_review", "waiting_approval"):
                yield "event: end\ndata: %s\n\n" % json.dumps({"state": j["state"], "error": j["error"]})
                return
            await asyncio.sleep(1)
    return StreamingResponse(stream(), media_type="text/event-stream")


class SearchBody(BaseModel):
    factory_id: int
    query: str
    k: int = 5
    graph: bool = False  # Graph RAG: expand the hits over the evidence knowledge graph (backend/rag/graph.py)


@router.post("/search")
def search(body: SearchBody, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, body.factory_id)
        fn = graph_search if body.graph else rag_search
        return fn(c, body.factory_id, body.query, k=min(body.k, 20), tenant_id=user.tenant_id)


class WhatIf(BaseModel):
    document: str
    valid_until: str


@router.post("/factories/{factory_id}/what-if")
def what_if(factory_id: int, body: WhatIf, user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        data = build_dataset(c, factory_id)
    if not any(d["id"] == body.document for d in data["documents"]):
        raise HTTPException(404, "Document not found")
    before, after = analyze(data), analyze(set_document_field(data, body.document, "valid_until", body.valid_until))
    changed = [{"requirement": a["id"], "before": b["status"], "after": a["status"]}
               for b, a in zip(before["requirements"], after["requirements"]) if a["status"] != b["status"]]
    return {"before": before["scores"], "after": after["scores"], "changed": changed, "hypothetical": True}


@router.post("/factories/{factory_id}/report")
def make_report(factory_id: int, user: User = Depends(staff)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        report = drafting.generate(c, user.tenant_id, factory_id)
        audit(c, user.tenant_id, user.actor, "report_drafted", "report:%d" % report["id"])
    return report


def _latest_report(c, factory_id: int) -> dict:
    r = one(c, "SELECT id, body, created_at FROM reports WHERE factory_id = :f ORDER BY id DESC LIMIT 1", f=factory_id)
    if not r:
        raise HTTPException(404, "No report yet: POST /api/factories/{id}/report to draft one")
    return {**r["body"], "id": r["id"], "created_at": r["created_at"]}


@router.get("/factories/{factory_id}/report")
def get_report(factory_id: int, lang: str = "en", format: str = "json", user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        f = factory_or_404(c, factory_id)
        rep = _latest_report(c, factory_id)
    if format == "json":
        return rep
    key = "text_bn" if lang == "bn" else "text_en"
    summary = rep["summary_bn"] if lang == "bn" else rep["summary_en"]
    body = "".join("<h3>%s</h3><p>%s</p>" % (html.escape(s["requirement"] or ""), html.escape(s[key])) for s in rep["sections"])
    page = """<!doctype html><html lang="%s"><head><meta charset="utf-8"><title>ThreadLight report</title>
<style>body{font-family:'Noto Sans Bengali','Segoe UI',sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.6}
.label{background:#fef3c7;padding:.4rem .8rem;border-radius:.4rem;display:inline-block}</style></head><body>
<p class="label">%s</p><h1>%s</h1><p>Coverage %s%% · decision-support risk index %s/100 · audit %s</p><h2>%s</h2><p>%s</p>%s
<p><small>Model %s · prompt %s · %s uncited sentence(s) removed. Synthetic data.</small></p></body></html>""" % (
        lang, html.escape(rep["label"]), html.escape(f["name"]), rep["scores"]["coverage"], rep["scores"]["risk_index"], rep["audit_date"],
        "সারসংক্ষেপ" if lang == "bn" else "Summary", html.escape(summary), body, html.escape(rep["model"]),
        html.escape(rep["prompt_version"]), len(rep["uncited_dropped"]))
    return HTMLResponse(page)


@router.get("/factories/{factory_id}/export")
def export(factory_id: int, format: str = "csv", user: User = Depends(viewer)):
    with tenant_tx(user.tenant_id) as c:
        factory_or_404(c, factory_id)
        r = passport(c, factory_id)["result"]
    header = ["requirement", "clause", "title", "status", "owner", "due", "action", "proof", "reasons"]
    plan = {t["requirement"]: t for t in r["plan"]}
    table = [[q["id"], q["clause"], q["title"], q["status"], plan.get(q["id"], {}).get("owner", ""), plan.get(q["id"], {}).get("due", ""),
              plan.get(q["id"], {}).get("action", ""), plan.get(q["id"], {}).get("proof", ""), " | ".join(q["reasons"])]
             for q in r["requirements"]]
    if format == "xlsx":
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Findings"
        ws.append(header)
        for row in table:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": "attachment; filename=threadlight-findings.xlsx"})
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(table)
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=threadlight-findings.csv"})
