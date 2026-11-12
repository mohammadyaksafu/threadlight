"""Run the agent-framework bench and write evals/reports/<date>-agents.json.

    .venv-agents/Scripts/python -m agent_bench.run [--model qwen2.5:7b] [--only pydantic-ai,agno] [--tag llama3.2-3b]

One run per framework at temperature 0 on a local Ollama model. With --only, results for the other
frameworks are kept from today's report so a single adapter can be re-run. --tag writes
<date>-agents-<tag>.json, used for a second model; the web page treats the untagged file as the main run.
"""

import argparse
import datetime
import importlib.metadata as md
import json
import platform
import time
import traceback

from agent_bench import tools
from agent_bench.adapters import ADAPTERS

REPORTS = tools.ROOT / "evals" / "reports"


def run_one(fid: str, name: str, package: str, fn, pattern: str, model: str) -> dict:
    tools.CALLS.clear()
    row = {"id": fid, "name": name, "package": package, "version": md.version(package), "pattern": pattern}
    t0 = time.perf_counter()
    try:
        raw = fn(model)
        row["status"] = "ran"
    except Exception as e:
        raw = ""
        row["status"] = "error"
        row["error"] = ("%s: %s" % (type(e).__name__, e))[:400]
        traceback.print_exc()
    row["latency_s"] = round(time.perf_counter() - t0, 1)
    row["tool_calls"] = list(tools.CALLS)
    extra = raw if isinstance(raw, dict) and "text" in raw else {}
    brief = tools.parse_brief(extra["text"] if extra else raw)
    row["brief"] = brief
    row["raw"] = (extra["text"] if extra else raw if isinstance(raw, str) else json.dumps(tools.parse_brief(raw)))[:700]
    row["notes"] = {k: v for k, v in extra.items() if k != "text"}
    row["checks"] = tools.check(brief, row["tool_calls"])
    row["passed"] = sum(row["checks"].values())
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="qwen2.5:7b")
    ap.add_argument("--tag", default="")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    only = {x for x in a.only.split(",") if x}
    out = REPORTS / ("%s-agents%s.json" % (datetime.date.today().isoformat(), "-" + a.tag if a.tag else ""))
    prev = {r["id"]: r for r in json.loads(out.read_text(encoding="utf-8"))["frameworks"]} if out.exists() and only else {}

    rows = []
    for fid, name, package, fn, pattern in ADAPTERS:
        if only and fid not in only:
            if fid in prev:
                rows.append(prev[fid])
            continue
        print("== %s" % name, flush=True)
        row = run_one(fid, name, package, fn, pattern, a.model)
        print("   %s  %ss  %d/4  calls=%s  brief=%s" % (row["status"], row["latency_s"], row["passed"],
                                                       [c["tool"] for c in row["tool_calls"]], row["brief"]), flush=True)
        rows.append(row)

    s = tools.RESULT["scores"]
    report = {
        "date": datetime.date.today().isoformat(),
        "model": a.model,
        "host": "local Ollama on a laptop CPU (%s), temperature 0, one run per framework" % platform.machine(),
        "system": tools.SYSTEM,
        "task": tools.TASK,
        "tools": [f.__name__ for f in tools.TOOLS],
        "expected": {"coverage": s["coverage"], "risk_index": s["risk_index"], "priorities": tools.OPEN[:3]},
        "checks": {
            "called_tools": "called get_scores and list_open_findings",
            "ids_are_open_findings": "every requirement id it cites is an open finding",
            "ranking_matches_rules": "its top three match the rules engine's ranking",
            "numbers_match_engine": "coverage and risk index equal the engine's figures",
        },
        "frameworks": rows,
    }
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md_rows = ["| %s | %s | %s | %s | %d/4 | %s |" % (
        r["name"], r["version"], "error" if r["status"] == "error" else " → ".join(c["tool"] for c in r["tool_calls"]) or "none",
        ", ".join(k for k, ok in r["checks"].items() if not ok) or "none", r["passed"], r["latency_s"]) for r in rows]
    out.with_suffix(".md").write_text("\n".join([
        "# Agent-framework bench, %s" % report["date"], "",
        "Model `%s`. %s." % (a.model, report["host"][0].upper() + report["host"][1:]),
        "Expected: coverage %d, risk index %d, top three %s." % (s["coverage"], s["risk_index"], " ".join(tools.OPEN[:3])), "",
        "| Framework | Version | Tool calls | Checks failed | Passed | Seconds |", "|---|---|---|---|---|---|", *md_rows, ""]), encoding="utf-8")
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
