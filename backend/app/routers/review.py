"""Human-in-the-loop endpoints: review queue, evidence approval, mapping confirmation, finding lifecycle."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.auth import User, officer, staff
from backend.db.session import audit, js, one, rows, tenant_tx
from backend.services import jobs, webhooks
from backend.services.passport import passport
from threadlight.lifecycle import STATES, Finding, LifecycleError

router = APIRouter(prefix="/api", tags=["review"])


@router.get("/review-queue")
def review_queue(user: User = Depends(officer)):
    with tenant_tx(user.tenant_id) as c:
        items = rows(c, """SELECT r.id, r.kind, r.job_id, r.payload, r.created_at, d.code AS document, d.filename, d.factory_id,
                                  d.type, d.ref, d.entity, d.issued, d.valid_until
                           FROM review_items r JOIN documents d ON d.id = r.document_id WHERE r.status = 'open' ORDER BY r.id""")
        mappings = rows(c, """SELECT m.id, m.factory_id, q.code AS requirement, q.title, d.code AS document, m.score, m.method, ch.page,
                                     left(ch.text, 400) AS chunk
                              FROM mappings m JOIN requirements q ON q.id = m.requirement_id JOIN documents d ON d.id = m.document_id
                              LEFT JOIN chunks ch ON ch.id = m.chunk_id WHERE m.status = 'proposed' ORDER BY m.score DESC""")
    return {"items": items, "mappings": mappings}


class Resolve(BaseModel):
    type: str | None = None
    fields: dict[str, str | None] = {}
    approved: bool = True


def _open_item(c, item_id: int) -> dict:
    item = one(c, "SELECT * FROM review_items WHERE id = :id AND status = 'open'", id=item_id)
    if not item:
        raise HTTPException(404, "No open review item with that id")
    return item


@router.post("/review/{item_id}/resolve")
async def resolve(item_id: int, body: Resolve, user: User = Depends(officer)):
    """Fields item: accept/correct the extraction. Approval item: approve or reject the evidence."""
    with tenant_tx(user.tenant_id) as c:
        item = _open_item(c, item_id)
        c.exec_driver_sql("UPDATE review_items SET status = 'resolved', resolved_by = %s, resolved_at = now() WHERE id = %s",
                          (user.name, item_id))
        audit(c, user.tenant_id, user.actor, "review_resolved", "review_item:%d" % item_id, body.model_dump())
    if item["kind"] == "fields":
        value = {"by": user.name, "role": user.role, "type": body.type, "fields": body.fields}
    else:
        value = {"approved": body.approved, "by": user.name, "user_id": user.id, "role": user.role}
    await jobs.enqueue_resume(str(item["job_id"]), user.tenant_id, value, wait=True)
    with tenant_tx(user.tenant_id) as c:
        job = one(c, "SELECT state, step, error FROM jobs WHERE id = :id", id=str(item["job_id"]))
        if job and job["state"] == "done":
            webhooks.fire(c, user.tenant_id, "job.done", {"job_id": str(item["job_id"])})
    return {"resolved": item_id, "kind": item["kind"], "job": job}


class MappingDecision(BaseModel):
    confirm: bool = True


@router.post("/mappings/{mapping_id}/confirm")
def confirm_mapping(mapping_id: int, body: MappingDecision, user: User = Depends(officer)):
    with tenant_tx(user.tenant_id) as c:
        m = one(c, "SELECT id FROM mappings WHERE id = :id", id=mapping_id)
        if not m:
            raise HTTPException(404, "Mapping not found")
        c.exec_driver_sql("UPDATE mappings SET status = %s, confirmed_by = %s, confirmed_at = now() WHERE id = %s",
                          ("confirmed" if body.confirm else "rejected", user.name, mapping_id))
        audit(c, user.tenant_id, user.actor, "mapping_confirmed" if body.confirm else "mapping_rejected", "mapping:%d" % mapping_id)
    return {"id": mapping_id, "status": "confirmed" if body.confirm else "rejected"}


class Transition(BaseModel):
    to: str
    evidence: list[str] = []


def _load_finding(c, factory_id: int, req: str) -> tuple[dict, Finding]:
    row = one(c, "SELECT * FROM findings WHERE factory_id = :f AND requirement_code = :r", f=factory_id, r=req)
    if not row:
        tenant = one(c, "SELECT tenant_id FROM factories WHERE id = :f", f=factory_id)
        if not tenant:
            raise HTTPException(404, "Factory not found")
        c.exec_driver_sql("INSERT INTO findings (tenant_id, factory_id, requirement_code) VALUES (%s, %s, %s)", (tenant["tenant_id"], factory_id, req))
        row = one(c, "SELECT * FROM findings WHERE factory_id = :f AND requirement_code = :r", f=factory_id, r=req)
        c.exec_driver_sql("INSERT INTO finding_events (tenant_id, finding_id, state, actor_type, actor_id) VALUES (%s, %s, 'detected', 'system', 'rules-engine')",
                          (row["tenant_id"], row["id"]))
    f = Finding("F-" + req, req)
    f.state, f.evidence, f.approver = row["state"], list(row["evidence"]), row["approver"]
    return row, f


@router.get("/factories/{factory_id}/findings")
def list_findings(factory_id: int, user: User = Depends(staff)):
    with tenant_tx(user.tenant_id) as c:
        items = rows(c, "SELECT * FROM findings WHERE factory_id = :f ORDER BY id", f=factory_id)
        for it in items:
            it["history"] = rows(c, "SELECT state, actor_type, actor_id, approver, at FROM finding_events WHERE finding_id = :id ORDER BY id", id=it["id"])
    return items


@router.post("/factories/{factory_id}/findings/{req}/transition")
def transition(factory_id: int, req: str, body: Transition, user: User = Depends(staff)):
    """Lifecycle move. The server is the authority: roles, evidence, the recheck and "AI cannot close"."""
    if body.to not in STATES:
        raise HTTPException(422, "Unknown state")
    if body.to in ("verified", "closed") and user.role != "officer":
        raise HTTPException(403, "Only the Compliance Officer can verify or close a finding")
    with tenant_tx(user.tenant_id) as c:
        row, f = _load_finding(c, factory_id, req)
        status = next((r["status"] for r in passport(c, factory_id)["result"]["requirements"] if r["id"] == req), None)
        if status is None:
            raise HTTPException(404, "Requirement not found")
        try:
            f.advance(body.to, actor="human", approver=user.name if body.to == "closed" else None,
                      evidence=body.evidence or None, recheck_passed=status == "supported")
        except LifecycleError as e:
            raise HTTPException(409, str(e))
        c.exec_driver_sql("UPDATE findings SET state = %s, approver = %s, evidence = %s::jsonb WHERE id = %s",
                          (f.state, f.approver, js(f.evidence), row["id"]))
        c.exec_driver_sql("INSERT INTO finding_events (tenant_id, finding_id, state, actor_type, actor_id, approver) VALUES (%s, %s, %s, 'human', %s, %s)",
                          (row["tenant_id"], row["id"], f.state, user.actor, f.approver))
        audit(c, user.tenant_id, user.actor, "finding_" + f.state, "finding:%s" % req, body.model_dump())
        if f.state == "closed":
            webhooks.fire(c, user.tenant_id, "finding.closed", {"factory_id": factory_id, "requirement": req, "approver": f.approver})
    return {"requirement": req, "state": f.state, "approver": f.approver, "evidence": f.evidence}
