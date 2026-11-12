"""Shared task, tools and checks for the agent-framework bench.

Every framework gets the same four read-only tools over the deterministic rules engine and the same
task. There is no approve or close tool: agents read and propose, the rules decide, people approve.
The checks at the bottom are plain code, so a framework cannot talk its way to a pass.
Standard library only, so tests/test_agent_bench.py runs without the framework packages.
"""

import json
import re
from pathlib import Path

from threadlight.engine import analyze, set_document_field

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data" / "sample.json").read_text(encoding="utf-8"))
RESULT = analyze(DATA)
OPEN = [t["requirement"] for t in RESULT["plan"]]  # ranked by the rules engine, most urgent first

SYSTEM = ("You are the audit-prep assistant for a garment factory. You can only read and propose. "
          "You cannot approve evidence or close findings. Use the tools for every fact and never guess a number.")
TASK = ("Write the audit-prep brief. First call get_scores. Then call list_open_findings. Then give the final answer: "
        "the coverage, the risk index, and the three requirement ids to fix first, in the order the tool returned them, "
        "each with a one-sentence reason.")
JSON_HINT = (' Give the final answer as JSON only, in this shape: {"coverage": 0, "risk_index": 0, '
             '"priorities": [{"requirement": "R0", "reason": "..."}]}')

CALLS: list[dict] = []  # tool-call trace of the current run; the harness clears it between frameworks


def _rec(tool: str, args: dict, out) -> str:
    CALLS.append({"tool": tool, "args": args})
    return json.dumps(out, ensure_ascii=False)


def get_scores() -> str:
    """Return days to audit, evidence coverage in percent, the decision-support risk index (0-100) and the number of open findings."""
    s = RESULT["scores"]
    return _rec("get_scores", {}, {"days_to_audit": RESULT["days_to_audit"], "coverage": s["coverage"],
                                   "risk_index": s["risk_index"], "open_findings": s["open_findings"]})


def list_open_findings() -> str:
    """Return the open findings ranked most urgent first, each with requirement id, status and the next action."""
    return _rec("list_open_findings", {}, [{"requirement": t["requirement"], "status": t["status"], "action": t["action"]}
                                           for t in RESULT["plan"]])


def get_requirement(requirement_id: str) -> str:
    """Return one requirement with its status and the reasons the rules engine gave.

    Args:
        requirement_id: Requirement id such as R1.
    """
    r = next((x for x in RESULT["requirements"] if x["id"] == requirement_id.strip().upper()), None)
    out = {"error": "unknown requirement"} if r is None else {k: r[k] for k in ("id", "title", "status", "reasons")}
    return _rec("get_requirement", {"requirement_id": requirement_id}, out)


def what_if_valid_until(document_id: str, valid_until: str) -> str:
    """Read-only what-if: the scores if one document were valid until another date. Changes nothing.

    Args:
        document_id: Document id such as D1.
        valid_until: New expiry date as YYYY-MM-DD.
    """
    args = {"document_id": document_id, "valid_until": valid_until}
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valid_until) or document_id not in {d["id"] for d in DATA["documents"]}:
        return _rec("what_if_valid_until", args, {"error": "unknown document or bad date"})
    s = analyze(set_document_field(DATA, document_id, "valid_until", valid_until))["scores"]
    return _rec("what_if_valid_until", args, {"coverage": s["coverage"], "risk_index": s["risk_index"], "open_findings": s["open_findings"]})


TOOLS = [get_scores, list_open_findings, get_requirement, what_if_valid_until]


def parse_brief(raw) -> dict:
    """Normalise a framework's final output to {coverage, risk_index, priorities[ids]}. Lenient on shape, strict on values."""
    if hasattr(raw, "model_dump"):  # a validated pydantic Brief
        raw = raw.model_dump()
    if isinstance(raw, str):
        m = re.search(r"\{.*\}", raw, re.S)
        try:
            raw = json.loads(m.group(0)) if m else raw
        except ValueError:
            pass
    if isinstance(raw, dict):
        ids = []
        for p in raw.get("priorities") or []:
            v = p.get("requirement") if isinstance(p, dict) else p
            ids += re.findall(r"R\d+", str(v).upper())[:1]
        return {"coverage": _int(raw.get("coverage")), "risk_index": _int(raw.get("risk_index")), "priorities": ids}
    text = str(raw)
    ids = list(dict.fromkeys(re.findall(r"\bR\d+\b", text)))
    return {"coverage": _after(text, "coverage"), "risk_index": _after(text, "risk"), "priorities": ids}


def _int(v):
    m = re.search(r"-?\d+", str(v))
    return int(m.group(0)) if m else None


def _after(text: str, word: str):
    m = re.search(word + r"[^\d\n]{0,40}?(\d{1,3})", text, re.I)
    return int(m.group(1)) if m else None


def check(brief: dict, calls: list[dict]) -> dict:
    s = RESULT["scores"]
    ids = brief["priorities"]
    return {
        "called_tools": {"get_scores", "list_open_findings"} <= {c["tool"] for c in calls},
        "ids_are_open_findings": bool(ids) and all(i in OPEN for i in ids),
        "ranking_matches_rules": ids[:3] == OPEN[:3],
        "numbers_match_engine": brief["coverage"] == s["coverage"] and brief["risk_index"] == s["risk_index"],
    }
