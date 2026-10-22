"""ThreadLight rules engine.

Deterministic, standard library only. No language-model or OCR calls happen here:
the engine reads documents whose fields were already extracted (in this prototype,
pre-extracted synthetic sample results) and applies fixed rules.

demo/src/engine.ts is a line-for-line TypeScript port; tests/parity.py checks both agree.
"""

import copy
import datetime
import math
import re

PENALTY = {
    "supported": 0.0,
    "likely_gap": 1.0,
    "insufficient": 0.8,
    "conflicting": 0.7,
    "pending_review": 0.4,
}

GAP_CODES = ("expired", "expires_before_audit", "too_old")


# ---------------------------------------------------------------- helpers

def day_number(iso):
    return datetime.date.fromisoformat(iso).toordinal()


def add_days(iso, n):
    return (datetime.date.fromisoformat(iso) + datetime.timedelta(days=n)).isoformat()


def round_half_up(x):
    return int(math.floor(x + 0.5))


def capitalize(s):
    return s[:1].upper() + s[1:]


def normalize_entity(name):
    s = re.sub(r"[^a-z0-9\s]", "", name.lower())
    words = ["ltd" if w == "limited" else w for w in s.split()]
    return " ".join(words)


def levenshtein(a, b):
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[len(b)]


def similarity(a, b):
    longest = max(len(a), len(b))
    if longest == 0:
        return 1.0
    return 1 - levenshtein(a, b) / longest


def expiry_state(doc, today, audit_date):
    vu = doc.get("valid_until")
    if not vu:
        return "no_expiry"
    if vu < today:
        return "expired"
    if vu < audit_date:
        return "expires_before_audit"
    return "valid"


def type_label(data, t):
    info = data.get("evidence_types", {}).get(t)
    return info["label"] if info else t.replace("_", " ")


def active_documents(data):
    superseded = set(d["supersedes"] for d in data["documents"] if d.get("supersedes"))
    return [d for d in data["documents"] if d["id"] not in superseded]


def pick_document(candidates):
    """Latest valid_until (or issued when there is no expiry); ties broken by id."""
    best = None
    for d in candidates:
        if best is None:
            best = d
            continue
        k, bk = d.get("valid_until") or d["issued"], best.get("valid_until") or best["issued"]
        if k > bk or (k == bk and d["id"] < best["id"]):
            best = d
    return best


# ---------------------------------------------------------------- checks

def _check_need(data, req, t, docs):
    today, audit = data["today"], data["audit_date"]
    label = type_label(data, t)
    candidates = [d for d in docs if d["type"] == t]
    if not candidates:
        return {"type": t, "doc": None, "code": "missing", "state": None, "ok": False,
                "reason": "No %s found in the file set." % label}
    d = pick_document(candidates)
    state = expiry_state(d, today, audit)
    head = "%s %s (%s)" % (d["id"], label, d["ref"])
    max_age = req.get("max_age_days", {}).get(t)
    age = day_number(audit) - day_number(d["issued"])
    if state == "expired":
        code, reason = "expired", "%s expired on %s." % (head, d["valid_until"])
    elif state == "expires_before_audit":
        code, reason = "expires_before_audit", "%s expires on %s, before the audit on %s." % (head, d["valid_until"], audit)
    elif max_age is not None and age > max_age:
        code, reason = "too_old", "%s was issued %d days before the audit; the limit is %d days." % (head, age, max_age)
    elif state == "no_expiry":
        code, reason = "ok", "%s is on file (no expiry date)." % head
    else:
        code, reason = "ok", "%s is valid until %s, covering the audit on %s." % (head, d["valid_until"], audit)
    return {"type": t, "doc": d["id"], "code": code, "state": state, "ok": code == "ok", "reason": reason}


def _alerts(data, docs, chosen_by_req):
    today = data["today"]
    factory_norm = normalize_entity(data["factory"])
    raw = []

    def linked(doc_id):
        return [rid for rid, ids in chosen_by_req if doc_id in ids]

    for d in docs:
        src = "%s p%d" % (d["source"]["file"], d["source"]["page"])
        ent = normalize_entity(d["entity"])
        if ent != factory_norm:
            sim = similarity(ent, factory_norm)
            pct = round_half_up(sim * 100)
            if sim >= 0.9:
                severity, note = "medium", "possible spelling variant, similarity %d%%" % pct
            else:
                severity, note = "high", "similarity %d%%" % pct
            raw.append({
                "type": "entity_mismatch", "severity": severity, "subject": [d["id"]], "related": [],
                "requirements": linked(d["id"]),
                "message": '%s names the entity "%s", which differs from the factory name "%s" (%s).' % (d["id"], d["entity"], data["factory"], note),
                "verify": "Compare the entity name on %s with the registered factory name; request a corrected document from the issuer if it is wrong." % src,
            })
        problems = []
        if d.get("valid_until") and d["issued"] > d["valid_until"]:
            problems.append("issue date %s is after expiry date %s" % (d["issued"], d["valid_until"]))
        if d["issued"] > today:
            problems.append("issue date %s is after today (%s)" % (d["issued"], today))
        if problems:
            raw.append({
                "type": "invalid_dates", "severity": "high", "subject": [d["id"]], "related": [],
                "requirements": linked(d["id"]),
                "message": "%s has inconsistent dates: %s." % (d["id"], "; ".join(problems)),
                "verify": "Check the dates on %s; the extraction may have misread them." % src,
            })
        for cite in d.get("cites", []):
            label = type_label(data, cite["of_type"])
            same_type = [c for c in docs if c["type"] == cite["of_type"]]
            if not same_type:
                raw.append({
                    "type": "missing_reference", "severity": "medium", "subject": [d["id"]], "related": [],
                    "requirements": linked(d["id"]),
                    "message": "%s cites %s (%s), but no %s is on file." % (d["id"], cite["ref"], label, label),
                    "verify": "Upload the cited %s or correct the reference in %s." % (label, src),
                })
            elif not any(c["ref"] == cite["ref"] for c in same_type):
                closest = None
                for c in same_type:
                    if closest is None or levenshtein(c["ref"], cite["ref"]) < levenshtein(closest["ref"], cite["ref"]):
                        closest = c
                raw.append({
                    "type": "reference_mismatch", "severity": "high", "subject": [d["id"]], "related": [closest["id"]],
                    "requirements": linked(d["id"]),
                    "message": "%s cites %s but the %s on file (%s) has %s." % (d["id"], cite["ref"], label, closest["id"], closest["ref"]),
                    "verify": "Check whether %s is a typing error for %s or a different %s; correct %s or upload the cited document." % (cite["ref"], closest["ref"], label, src),
                })

    for cap in data.get("corrective_actions", []):
        if cap["claimed_status"] == "complete" and not cap.get("closure_evidence"):
            raw.append({
                "type": "closure_without_proof", "severity": "high", "subject": [], "related": [],
                "requirements": [cap["requirement"]] if cap.get("requirement") else [],
                "message": '%s ("%s") is marked complete but has no closure evidence attached.' % (cap["id"], cap["title"]),
                "verify": "Attach dated photographs or a verification note signed by a named person before reporting %s as closed." % cap["id"],
            })

    alerts = []
    for i, a in enumerate(raw):
        out = {"id": "A%d" % (i + 1)}
        out.update(a)
        alerts.append(out)
    return alerts


# ---------------------------------------------------------------- analysis

def analyze(data):
    today, audit = data["today"], data["audit_date"]
    docs = active_documents(data)
    by_id = dict((d["id"], d) for d in docs)

    checks_by_req = []
    for r in data["requirements"]:
        checks_by_req.append((r, [_check_need(data, r, t, docs) for t in r["needs"]]))
    chosen_by_req = [(r["id"], [c["doc"] for c in checks if c["doc"]]) for r, checks in checks_by_req]

    alerts = _alerts(data, docs, chosen_by_req)

    requirements = []
    for r, checks in checks_by_req:
        reasons = [c["reason"] for c in checks]
        linked = [a for a in alerts if r["id"] in a["requirements"]]
        failing = None
        if any(c["code"] in GAP_CODES for c in checks):
            status = "likely_gap"
            failing = [c for c in checks if c["code"] in GAP_CODES][0]["type"]
        elif any(c["code"] == "missing" for c in checks):
            status = "insufficient"
            failing = [c for c in checks if c["code"] == "missing"][0]["type"]
        else:
            subj = [c for c in checks if any(c["doc"] in a["subject"] for a in linked)]
            unverified = [c for c in checks if not by_id[c["doc"]].get("verified")]
            if subj:
                status, failing = "conflicting", subj[0]["type"]
            elif unverified:
                status, failing = "pending_review", unverified[0]["type"]
                for c in unverified:
                    reasons.append("%s is a new upload that has not been approved by a person." % c["doc"])
            else:
                status = "supported"
        for a in linked:
            reasons.append("Evidence-integrity alert %s (%s) applies to this requirement." % (a["id"], a["type"]))
        requirements.append({
            "id": r["id"], "clause": r["clause"], "title": r["title"], "criticality": r["criticality"],
            "department": r["department"], "status": status, "reasons": reasons,
            "checks": [dict((k, c[k]) for k in ("type", "doc", "code", "state", "ok")) for c in checks],
            "supporting": [c["doc"] for c in checks if c["doc"]],
            "failing_type": failing, "alerts": [a["id"] for a in linked],
        })

    edges = []
    for r in requirements:
        for c in r["checks"]:
            if c["doc"]:
                edges.append({"doc": c["doc"], "req": r["id"], "type": c["type"], "status": r["status"]})

    plan = _plan(data, requirements)

    total = covered = weighted = 0
    for r in requirements:
        w = r["criticality"]
        total += w
        weighted += w * PENALTY[r["status"]]
        if r["status"] == "supported":
            covered += w
    counts = dict((s, 0) for s in PENALTY)
    for r in requirements:
        counts[r["status"]] += 1

    return {
        "today": today,
        "audit_date": audit,
        "days_to_audit": day_number(audit) - day_number(today),
        "active_documents": [d["id"] for d in docs],
        "superseded": [d["id"] for d in data["documents"] if d["id"] not in by_id],
        "documents": [{"id": d["id"], "expiry_state": expiry_state(d, today, audit), "active": d["id"] in by_id}
                      for d in data["documents"]],
        "requirements": requirements,
        "alerts": alerts,
        "edges": edges,
        "plan": plan,
        "scores": {
            "coverage": round_half_up(100 * covered / total),
            "risk_index": round_half_up(100 * weighted / total),
            "open_findings": len([r for r in requirements if r["status"] != "supported"]),
            "status_counts": counts,
        },
    }


def _plan(data, requirements):
    audit = data["audit_date"]
    req_src = dict((r["id"], r) for r in data["requirements"])
    tasks = []
    for r in requirements:
        if r["status"] == "supported":
            continue
        t = r["failing_type"]
        label = type_label(data, t)
        check = [c for c in r["checks"] if c["type"] == t][0]
        if r["status"] == "likely_gap":
            if check["code"] == "too_old":
                action = "Run and record a new %s" % label
                proof = "%s dated within %d days before %s" % (capitalize(label), req_src[r["id"]]["max_age_days"][t], audit)
            else:
                action = "Renew or replace the %s" % label
                proof = "%s valid on or after %s" % (capitalize(label), audit)
        elif r["status"] == "insufficient":
            action = "Locate or produce the %s" % label
            proof = "%s covering clause %s" % (capitalize(label), r["clause"])
        elif r["status"] == "conflicting":
            action = "Resolve evidence-integrity alert %s" % ", ".join(r["alerts"])
            proof = "%s consistent with the records it references" % capitalize(label)
        else:
            action = "Review and approve the uploaded %s" % label
            proof = "Named human approval of %s (%s)" % (check["doc"], label)
        w = r["criticality"]
        tasks.append({
            "id": "T-" + r["id"], "requirement": r["id"], "status": r["status"],
            "owner": r["department"],
            "due": add_days(audit, -14 if r["status"] == "likely_gap" else -7),
            "priority": w * PENALTY[r["status"]],
            "action": action, "proof": proof,
        })
    tasks.sort(key=lambda x: (-x["priority"], x["requirement"]))
    return tasks


# ---------------------------------------------------------------- scenario helpers

def set_document_field(data, doc_id, field, value):
    out = copy.deepcopy(data)
    for d in out["documents"]:
        if d["id"] == doc_id:
            d[field] = value
    return out


def add_renewal(data, verified=False):
    out = copy.deepcopy(data)
    doc = copy.deepcopy(out["renewal"])
    doc["verified"] = verified
    out["documents"].append(doc)
    return out


def approve_document(data, doc_id):
    return set_document_field(data, doc_id, "verified", True)


def add_closure_evidence(data, cap_id, evidence):
    out = copy.deepcopy(data)
    for cap in out["corrective_actions"]:
        if cap["id"] == cap_id:
            cap["closure_evidence"] = list(cap.get("closure_evidence", [])) + [evidence]
    return out
