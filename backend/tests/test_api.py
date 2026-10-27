"""API, tenant isolation, lifecycle and the end-to-end pipeline (fake LLM, digital synthetic PDFs)."""

from pathlib import Path

from backend.tests.conftest import login

V1 = Path(__file__).resolve().parents[2] / "synth" / "out" / "v1"


def test_login_rejects_wrong_password(client, seeded):
    r = client.post("/api/auth/login", json={"email": "officer@threadlight.demo", "password": "nope"})
    assert r.status_code == 401


def test_passport_from_database_matches_v1(client, seeded):
    r = client.get("/api/factories/1/passport", headers=login(client))
    assert r.status_code == 200
    assert r.json()["scores"]["coverage"] == 29
    assert r.json()["scores"]["risk_index"] == 63


def test_cross_tenant_read_is_refused(client, seeded):
    other = login(client, "officer@other.demo", "Other-Demo-2026")
    assert client.get("/api/factories/1/passport", headers=other).status_code == 404
    assert client.get("/api/factories/1/documents", headers=other).status_code == 404
    assert client.get("/api/factories/2/passport", headers=other).status_code == 200


def test_rls_blocks_direct_sql_without_tenant(seeded):
    from backend.db.session import anon_tx, scalar, tenant_tx

    with anon_tx() as c:
        assert scalar(c, "SELECT count(*) FROM documents") == 0
    with tenant_tx(2) as c:
        assert scalar(c, "SELECT count(*) FROM documents WHERE factory_id = 1") == 0


def test_audit_log_is_append_only(seeded):
    import pytest
    from sqlalchemy.exc import DBAPIError

    from backend.db.session import audit, tenant_tx

    with tenant_tx(1) as c:
        audit(c, 1, "test", "x")
    with pytest.raises(DBAPIError):
        with tenant_tx(1) as c:
            c.exec_driver_sql("DELETE FROM audit_log")


def test_roles(client, seeded):
    guest = login(client, "guest@threadlight.demo", "Guest-Demo-2026")
    staff = login(client, "staff@threadlight.demo", "Staff-Demo-2026")
    assert client.get("/api/review-queue", headers=staff).status_code == 403
    pdf = (V1 / "fire_certificate_renewal.pdf").read_bytes()
    assert client.post("/api/factories/1/documents", headers=guest, files={"file": ("x.pdf", pdf, "application/pdf")}).status_code == 403


def test_upload_rejects_non_pdf(client, seeded):
    r = client.post("/api/factories/1/documents", headers=login(client), files={"file": ("x.pdf", b"MZ\x90 not a pdf", "application/pdf")})
    assert r.status_code == 415


def test_finding_lifecycle_needs_human_officer_and_recheck(client, seeded):
    h = login(client)
    staff = login(client, "staff@threadlight.demo", "Staff-Demo-2026")
    url = "/api/factories/1/findings/R1/transition"
    assert client.post(url, headers=staff, json={"to": "explained"}).status_code == 200
    assert client.post(url, headers=staff, json={"to": "assigned"}).status_code == 200
    assert client.post(url, headers=staff, json={"to": "remediated"}).status_code == 409  # needs evidence
    assert client.post(url, headers=staff, json={"to": "remediated", "evidence": ["D1-renewal"]}).status_code == 200
    assert client.post(url, headers=staff, json={"to": "verified"}).status_code == 403  # officer only
    r = client.post(url, headers=h, json={"to": "verified"})
    assert r.status_code == 409 and "recheck" in r.json()["detail"]  # R1 is not supported yet


def test_pipeline_end_to_end_reaches_v1_scores(client, seeded_empty):
    """Upload the five digital v1 PDFs + the scan, review/approve, and land on the v1 scores.

    The scan has no text layer; without Tesseract it goes to the human review queue, where the officer
    enters the fields. That is the review path working as designed."""
    h = login(client)
    files = ["fire_certificate.pdf", "structural_assessment.pdf", "trade_license.pdf", "env_clearance_scan.pdf",
             "fire_drill_log.pdf", "safety_committee_minutes.pdf"]
    for f in files:
        r = client.post("/api/factories/1/documents?wait=true", headers=h, files={"file": (f, (V1 / f).read_bytes(), "application/pdf")})
        assert r.status_code == 202, r.text
        job = client.get("/api/jobs/" + r.json()["job_id"], headers=h).json()
        assert job["state"] in ("waiting_review", "waiting_approval"), job
    dup = client.post("/api/factories/1/documents", headers=h, files={"file": ("again.pdf", (V1 / files[0]).read_bytes(), "application/pdf")})
    assert dup.json()["duplicate"] is True

    for _ in range(12):
        queue = client.get("/api/review-queue", headers=h).json()["items"]
        if not queue:
            break
        item = queue[0]
        if item["kind"] == "fields":
            fix = {}
            if item["document"] == "D4":  # the scan: a person types what the scan says
                fix = {"type": "env_clearance", "fields": {"ref": "EC-2024-5521", "entity": "Sample Apparels Ltd.",
                                                           "issued": "2024-10-01", "valid_until": "2026-09-30"}}
            r = client.post("/api/review/%d/resolve" % item["id"], headers=h, json=fix)
        else:
            r = client.post("/api/review/%d/resolve" % item["id"], headers=h, json={"approved": True})
        assert r.status_code == 200, r.text
    scores = client.get("/api/factories/1/passport", headers=h).json()["scores"]
    assert scores["coverage"] == 29 and scores["risk_index"] == 63, scores

    hits = client.post("/api/search", headers=h, json={"factory_id": 1, "query": "fire safety certificate valid until"}).json()["hits"]
    assert hits and hits[0]["citation"].startswith("D")
    report = client.post("/api/factories/1/report", headers=h).json()
    assert report["label"] == "Draft for human review"
    assert client.get("/api/factories/1/export?format=csv", headers=h).text.startswith("requirement,")


def test_renewal_needs_officer_approval_before_it_counts(client, seeded):
    h = login(client)
    r = client.post("/api/factories/1/documents?wait=true", headers=h,
                    files={"file": ("fire_certificate_renewal.pdf", (V1 / "fire_certificate_renewal.pdf").read_bytes(), "application/pdf")},
                    data={"supersedes": "D1"})
    assert r.json()["document"] == "D1-renewal"
    p = client.get("/api/factories/1/passport", headers=h).json()
    statuses = {x["id"]: x["status"] for x in p["requirements"]}
    assert statuses["R1"] == "pending_review" and p["scores"]["coverage"] == 29
    item = next(i for i in client.get("/api/review-queue", headers=h).json()["items"] if i["kind"] == "approval")
    client.post("/api/review/%d/resolve" % item["id"], headers=h, json={"approved": True})
    p = client.get("/api/factories/1/passport", headers=h).json()
    assert {x["id"]: x["status"] for x in p["requirements"]}["R1"] == "supported"
    assert p["scores"]["coverage"] == 55
