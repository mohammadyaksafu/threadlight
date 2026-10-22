"""Parity test: the Python engine and the TypeScript engine must give identical results.

Runs 7 scenarios through threadlight/engine.py and web/src/engine/engine.ts and compares
statuses, reasons, alerts, edges, plan and scores. Node loads the .ts file directly using its
built-in type stripping, so no build step is needed.
Usage: python3 tests/parity.py   (requires Node.js 22.6+ on PATH)
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from threadlight import engine  # noqa: E402

ENGINE_TS = os.path.join(ROOT, "web", "src", "engine", "engine.ts")

NODE_RUNNER = r"""
const { pathToFileURL } = await import("node:url");
const engine = await import(pathToFileURL(process.argv[1]).href);
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const cases = JSON.parse(input);
const out = {};
for (const name of Object.keys(cases)) out[name] = engine.analyze(cases[name]);
process.stdout.write(JSON.stringify(out));
"""

COMPARED = ["days_to_audit", "active_documents", "superseded", "documents",
            "requirements", "alerts", "edges", "plan", "scores"]


def build_cases():
    with open(os.path.join(ROOT, "data", "sample.json"), encoding="utf-8") as f:
        base = json.load(f)
    d1 = lambda v: engine.set_document_field(base, "D1", "valid_until", v)  # noqa: E731
    return {
        "baseline": base,
        "extend_to_dec31": d1("2026-12-31"),
        "audit_day": d1("2026-11-21"),
        "day_before_audit": d1("2026-11-20"),
        "already_expired": d1("2026-10-01"),
        "renewal_unverified": engine.add_renewal(base, verified=False),
        "renewal_approved": engine.add_renewal(base, verified=True),
    }


def main():
    cases = build_cases()
    cmd = ["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", NODE_RUNNER, ENGINE_TS]
    proc = subprocess.run(cmd, input=json.dumps(cases), capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        print(proc.stderr)
        print("Node.js 22.6 or newer is required (it runs the TypeScript engine directly).")
        sys.exit(2)
    js = json.loads(proc.stdout)
    failures = 0
    for name, data in cases.items():
        py = engine.analyze(data)
        bad = [k for k in COMPARED if py[k] != js[name][k]]
        s = py["scores"]
        summary = "coverage %d, risk %d, open %d" % (s["coverage"], s["risk_index"], s["open_findings"])
        if bad:
            failures += 1
            print("FAIL %-20s differs in: %s" % (name, ", ".join(bad)))
            for k in bad:
                print("  python:", json.dumps(py[k])[:400])
                print("  node:  ", json.dumps(js[name][k])[:400])
        else:
            print("ok   %-20s identical (%s)" % (name, summary))
    print("%d/%d cases identical" % (len(cases) - failures, len(cases)))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
