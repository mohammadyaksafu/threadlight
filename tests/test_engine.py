"""Unit tests for the ThreadLight rules engine and lifecycle (synthetic fixture only)."""

import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from threadlight import engine  # noqa: E402
from threadlight.lifecycle import Finding, LifecycleError  # noqa: E402


def load_sample():
    with open(os.path.join(ROOT, "data", "sample.json"), encoding="utf-8") as f:
        return json.load(f)


def statuses(result):
    return dict((r["id"], r["status"]) for r in result["requirements"])


def req(result, rid):
    return [r for r in result["requirements"] if r["id"] == rid][0]


def alerts_of(result, kind):
    return [a for a in result["alerts"] if a["type"] == kind]


class BaselineTest(unittest.TestCase):
    def setUp(self):
        self.data = load_sample()
        self.res = engine.analyze(self.data)

    def test_days_to_audit(self):
        self.assertEqual(self.res["days_to_audit"], 30)

    def test_statuses(self):
        self.assertEqual(statuses(self.res), {
            "R1": "likely_gap", "R2": "supported", "R3": "supported", "R4": "likely_gap",
            "R5": "likely_gap", "R6": "insufficient", "R7": "conflicting", "R8": "insufficient",
        })

    def test_scores(self):
        s = self.res["scores"]
        self.assertEqual(s["coverage"], 29)
        self.assertEqual(s["risk_index"], 63)
        self.assertEqual(s["open_findings"], 6)

    def test_one_document_two_requirements(self):
        reqs = sorted(set(e["req"] for e in self.res["edges"] if e["doc"] == "D1"))
        self.assertEqual(reqs, ["R1", "R5"])

    def test_entity_mismatch_on_d4(self):
        a = alerts_of(self.res, "entity_mismatch")
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["subject"], ["D4"])
        self.assertEqual(a[0]["severity"], "medium")
        self.assertIn("possible spelling variant", a[0]["message"])

    def test_reference_mismatch_on_d6(self):
        a = alerts_of(self.res, "reference_mismatch")
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["subject"], ["D6"])
        self.assertEqual(a[0]["related"], ["D1"])
        self.assertEqual(a[0]["severity"], "high")
        self.assertIn("FC-2025-0471", a[0]["message"])
        self.assertIn("FC-2025-0417", a[0]["message"])
        self.assertTrue(a[0]["verify"])

    def test_closure_without_proof(self):
        a = alerts_of(self.res, "closure_without_proof")
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["requirements"], ["R8"])
        self.assertIn("CAP-14", a[0]["message"])
        self.assertEqual(a[0]["severity"], "high")

    def test_alert_ids_in_order(self):
        self.assertEqual([(a["id"], a["type"]) for a in self.res["alerts"]], [
            ("A1", "entity_mismatch"), ("A2", "reference_mismatch"), ("A3", "closure_without_proof")])

    def test_no_invalid_dates_in_baseline(self):
        self.assertEqual(alerts_of(self.res, "invalid_dates"), [])

    def test_r4_expired(self):
        self.assertTrue(any("expired on 2026-09-30" in x for x in req(self.res, "R4")["reasons"]))

    def test_plan(self):
        plan = self.res["plan"]
        self.assertEqual(len(plan), 6)
        self.assertEqual(plan[0]["id"], "T-R1")
        self.assertEqual([t["requirement"] for t in plan], ["R1", "R8", "R6", "R4", "R5", "R7"])
        r5 = [t for t in plan if t["requirement"] == "R5"][0]
        self.assertIn("fire safety certificate", r5["proof"].lower())
        self.assertEqual(r5["owner"], "Safety & Maintenance")
        self.assertEqual(plan[0]["due"], "2026-11-07")
        r6 = [t for t in plan if t["requirement"] == "R6"][0]
        self.assertEqual(r6["due"], "2026-11-14")


class WhatIfTest(unittest.TestCase):
    def setUp(self):
        self.data = load_sample()

    def run_d1(self, valid_until):
        return engine.analyze(engine.set_document_field(self.data, "D1", "valid_until", valid_until))

    def test_extend_to_dec31(self):
        res = self.run_d1("2026-12-31")
        st = statuses(res)
        self.assertEqual(st["R1"], "supported")
        self.assertEqual(st["R5"], "supported")
        self.assertEqual(res["scores"]["coverage"], 55)

    def test_valid_on_audit_day(self):
        self.assertEqual(statuses(self.run_d1("2026-11-21"))["R1"], "supported")

    def test_day_before_audit(self):
        self.assertEqual(statuses(self.run_d1("2026-11-20"))["R1"], "likely_gap")

    def test_already_expired(self):
        res = self.run_d1("2026-10-01")
        self.assertEqual(statuses(res)["R1"], "likely_gap")
        self.assertTrue(any("expired" in x for x in req(res, "R1")["reasons"]))
        self.assertEqual(req(res, "R1")["checks"][0]["code"], "expired")

    def test_original_data_not_mutated(self):
        self.run_d1("2026-12-31")
        self.assertEqual(self.data["documents"][0]["valid_until"], "2026-11-10")


class RenewalTest(unittest.TestCase):
    def setUp(self):
        self.data = load_sample()

    def test_renewal_unverified(self):
        res = engine.analyze(engine.add_renewal(self.data, verified=False))
        st = statuses(res)
        self.assertEqual(st["R1"], "pending_review")
        self.assertEqual(st["R5"], "pending_review")
        self.assertEqual(res["scores"]["coverage"], 29)
        self.assertNotIn("D1", res["active_documents"])
        self.assertIn("D1", res["superseded"])
        r1 = [t for t in res["plan"] if t["requirement"] == "R1"][0]
        self.assertIn("approval", r1["proof"].lower())

    def test_renewal_approved(self):
        res = engine.analyze(engine.add_renewal(self.data, verified=True))
        st = statuses(res)
        self.assertEqual(st["R1"], "supported")
        self.assertEqual(st["R5"], "supported")
        self.assertEqual(res["scores"]["coverage"], 55)

    def test_approve_document_helper(self):
        pending = engine.add_renewal(self.data)
        res = engine.analyze(engine.approve_document(pending, "D1-renewal"))
        self.assertEqual(res["scores"]["coverage"], 55)


class IntegrityRuleTest(unittest.TestCase):
    def setUp(self):
        self.data = load_sample()

    def test_issued_after_expiry(self):
        data = engine.set_document_field(self.data, "D3", "issued", "2027-02-01")
        a = alerts_of(engine.analyze(data), "invalid_dates")
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["subject"], ["D3"])
        self.assertIn("after expiry", a[0]["message"])

    def test_issued_in_future(self):
        data = engine.set_document_field(self.data, "D5", "issued", "2026-10-30")
        a = alerts_of(engine.analyze(data), "invalid_dates")
        self.assertEqual(len(a), 1)
        self.assertIn("after today", a[0]["message"])

    def test_closure_evidence_removes_alert(self):
        data = engine.add_closure_evidence(self.data, "CAP-14", "exit_floor2_photo.jpg")
        self.assertEqual(alerts_of(engine.analyze(data), "closure_without_proof"), [])

    def test_missing_reference(self):
        data = engine.set_document_field(self.data, "D6", "cites", [{"ref": "X-1", "of_type": "payroll_summary"}])
        a = alerts_of(engine.analyze(data), "missing_reference")
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["severity"], "medium")

    def test_distant_entity_is_high(self):
        data = engine.set_document_field(self.data, "D3", "entity", "Other Knitwear Co.")
        a = alerts_of(engine.analyze(data), "entity_mismatch")
        self.assertEqual([x["severity"] for x in a if x["subject"] == ["D3"]], ["high"])

    def test_limited_normalizes_to_ltd(self):
        self.assertEqual(engine.normalize_entity("Sample  Apparel Limited"), engine.normalize_entity("Sample Apparel Ltd."))

    def test_conflicting_from_alert_subject(self):
        self.assertEqual(statuses(engine.analyze(self.data))["R7"], "conflicting")

    def test_rounding_half_up(self):
        self.assertEqual(engine.round_half_up(28.5), 29)
        self.assertEqual(engine.round_half_up(62.4999), 62)


class LifecycleTest(unittest.TestCase):
    def walk_to(self, state):
        f = Finding("F-R1", "R1")
        steps = [
            ("explained", dict(actor="ai")),
            ("assigned", dict(actor="human")),
            ("remediated", dict(actor="human", evidence=["D1-renewal"])),
            ("verified", dict(actor="system", recheck_passed=True)),
            ("closed", dict(actor="human", approver="Compliance Officer (synthetic)")),
        ]
        for to, kw in steps:
            if f.state == state:
                break
            f.advance(to, **kw)
        return f

    def test_full_path(self):
        f = self.walk_to("closed")
        self.assertEqual(f.state, "closed")
        self.assertEqual(f.approver, "Compliance Officer (synthetic)")

    def test_cannot_skip(self):
        f = Finding("F-R1")
        with self.assertRaises(LifecycleError):
            f.advance("assigned", actor="human")

    def test_cannot_go_back(self):
        f = self.walk_to("assigned")
        with self.assertRaises(LifecycleError):
            f.advance("explained", actor="human")

    def test_only_human_assigns(self):
        f = self.walk_to("explained")
        for actor in ("ai", "system"):
            with self.assertRaises(LifecycleError):
                f.advance("assigned", actor=actor)

    def test_remediation_needs_evidence(self):
        f = self.walk_to("assigned")
        with self.assertRaises(LifecycleError):
            f.advance("remediated", actor="human")

    def test_verify_needs_passing_recheck(self):
        f = self.walk_to("remediated")
        with self.assertRaises(LifecycleError):
            f.advance("verified", actor="system", recheck_passed=False)

    def test_ai_cannot_close(self):
        f = self.walk_to("verified")
        with self.assertRaises(LifecycleError):
            f.advance("closed", actor="ai", approver="Compliance Officer (synthetic)", evidence=["x"])
        self.assertEqual(f.state, "verified")

    def test_close_needs_approver(self):
        f = self.walk_to("verified")
        with self.assertRaises(LifecycleError):
            f.advance("closed", actor="human")

    def test_close_needs_evidence(self):
        f = Finding("F-X")
        f.state = "verified"
        with self.assertRaises(LifecycleError):
            f.advance("closed", actor="human", approver="Compliance Officer (synthetic)")

    def test_unknown_actor(self):
        with self.assertRaises(LifecycleError):
            Finding("F").advance("explained", actor="robot")


if __name__ == "__main__":
    unittest.main()
