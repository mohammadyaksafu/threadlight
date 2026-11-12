"""Checks for the agent-framework bench that need no model: tools are read-only and the scorer is strict."""

import copy
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from agent_bench import tools  # noqa: E402

GOOD = '{"coverage": 29, "risk_index": 63, "priorities": [{"requirement": "R1", "reason": "x"}, {"requirement": "R8", "reason": "y"}, {"requirement": "R6", "reason": "z"}]}'
BOTH = [{"tool": "get_scores", "args": {}}, {"tool": "list_open_findings", "args": {}}]


class AgentBench(unittest.TestCase):
    def setUp(self):
        tools.CALLS.clear()

    def test_no_tool_can_approve_or_close(self):
        names = [f.__name__ for f in tools.TOOLS]
        self.assertEqual(names, ["get_scores", "list_open_findings", "get_requirement", "what_if_valid_until"])
        self.assertFalse([n for n in names if "approve" in n or "close" in n])

    def test_tools_return_engine_figures_and_record_calls(self):
        self.assertEqual(json.loads(tools.get_scores()), {"days_to_audit": 30, "coverage": 29, "risk_index": 63, "open_findings": 6})
        self.assertEqual([f["requirement"] for f in json.loads(tools.list_open_findings())], ["R1", "R8", "R6", "R4", "R5", "R7"])
        self.assertEqual(json.loads(tools.get_requirement("r1"))["status"], "likely_gap")
        self.assertEqual([c["tool"] for c in tools.CALLS], ["get_scores", "list_open_findings", "get_requirement"])

    def test_what_if_is_read_only(self):
        before = copy.deepcopy(tools.DATA)
        self.assertEqual(json.loads(tools.what_if_valid_until("D1", "2026-11-21"))["coverage"], 55)
        self.assertEqual(tools.DATA, before)
        self.assertIn("error", json.loads(tools.what_if_valid_until("D1", "next year")))
        self.assertIn("error", json.loads(tools.what_if_valid_until("D99", "2026-11-21")))

    def test_correct_brief_passes_all_checks(self):
        self.assertEqual(sum(tools.check(tools.parse_brief(GOOD), BOTH).values()), 4)
        self.assertEqual(sum(tools.check(tools.parse_brief("Here is the brief:\n```json\n%s\n```" % GOOD), BOTH).values()), 4)

    def test_prose_answer_is_parsed(self):
        b = tools.parse_brief("Coverage is 29% and the risk index is 63. Fix R1 first, then R8, then R6.")
        self.assertEqual(b, {"coverage": 29, "risk_index": 63, "priorities": ["R1", "R8", "R6"]})

    def test_wrong_answers_fail_the_matching_check(self):
        c = tools.check(tools.parse_brief(GOOD.replace("29", "92")), BOTH)
        self.assertFalse(c["numbers_match_engine"])
        c = tools.check(tools.parse_brief(GOOD.replace("R8", "R2")), BOTH)  # R2 is supported, not an open finding
        self.assertFalse(c["ids_are_open_findings"] or c["ranking_matches_rules"])
        c = tools.check(tools.parse_brief(GOOD.replace('"R1"', '"R4"')), BOTH)
        self.assertTrue(c["ids_are_open_findings"])
        self.assertFalse(c["ranking_matches_rules"])
        self.assertFalse(tools.check(tools.parse_brief(GOOD), BOTH[:1])["called_tools"])
        self.assertEqual(sum(tools.check(tools.parse_brief(""), []).values()), 0)


if __name__ == "__main__":
    unittest.main()
