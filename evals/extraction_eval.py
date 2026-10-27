"""Field-extraction evaluation on the labelled synthetic set.

    python -m evals.extraction_eval --models baseline-regex gemini-flash gemini-flash-lite-3.5 [--limit N] [--sleep 4]

For every document and model: parse (cached), redact, run the extraction prompt on that ONE model (no
fallback), validate with the production guardrails, and compare with the ground truth.

Metrics per model, overall and per group (en/digital, en/scan, bn/*):
- type accuracy; exact-match accuracy per field (ref, entity, issued, valid_until) and for all fields;
- auto-accept rate: share of documents that pass validation without human review;
- silent error rate: share of fields that are WRONG but passed validation (the number that matters most:
  these are errors a person would not be asked to check);
- injection resistance on the two documents with planted instructions; PII leaks into the model input.
`baseline-regex` is the non-LLM pattern parser (backend/llm/providers/fake.py), reported for comparison.
Writes evals/reports/<date>-extraction.json and is summarised by evals/run_all.py.
"""

import argparse
import datetime
import json
import os
import time

from backend.config import settings
from backend.guardrails import injection
from backend.guardrails.validators import FIELDS, validate
from backend.llm import router
from evals.common import EVIDENCE_TYPES, REPORTS, field_match, llm_pages, load_dataset, pages_for, pct

GROUPS = lambda r: "%s/%s" % (r["lang"], r["variant"])  # noqa: E731


def run_model(model: str, rec: dict, pages: list[dict]) -> dict:
    variables = {"evidence_types": EVIDENCE_TYPES, "filename": rec["file"], "pages": pages}
    t0 = time.perf_counter()
    if model == "baseline-regex":
        from backend.llm.providers import fake

        raw, usage, used = fake.extract(variables), {}, "baseline-regex"
    else:
        res = router.complete("extract", "extract", variables, models=[model], use_cache=False, max_tokens=3000)
        raw, usage, used = res.data, res.usage, res.model
    return {"raw": raw, "usage": usage, "model": used, "latency_ms": int((time.perf_counter() - t0) * 1000)}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=["baseline-regex", "gemini-flash", "gemini-flash-lite-3.5"])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.0, help="seconds between calls (free-tier rate limits)")
    ap.add_argument("--only", default="", help="comma list of groups, e.g. en/digital,bn/digital")
    args = ap.parse_args(argv)
    data = load_dataset()
    if args.only:
        data = [r for r in data if GROUPS(r) in args.only.split(",")]
    if args.limit:
        data = data[:args.limit]
    allow = sorted({r["fields"]["entity"]["value"] for r in data if r["fields"]["entity"]["value"]})
    threshold = settings().review_threshold
    rows, skipped = [], []
    for rec in data:
        pages = pages_for(rec)
        if not any(p["text"].strip() for p in pages):
            skipped.append({"doc_id": rec["doc_id"], "reason": "no text (OCR not available on this machine)"})
            continue
        sent, found = llm_pages(pages, allow)
        sent_text = "\n".join(p["text"] for p in sent)
        flagged = bool(injection.scan(sent_text))  # the pipeline sends flagged documents to review whatever the model says
        pii_leaks = [x for x in rec["pii"] if x and x in sent_text]
        for model in args.models:
            try:
                out = run_model(model, rec, sent)
            except Exception as e:
                rows.append({"doc_id": rec["doc_id"], "group": GROUPS(rec), "model": model, "error": str(e)[:300]})
                continue
            try:
                v = validate(out["raw"], {p["page"]: p["text"] for p in sent}, list(EVIDENCE_TYPES), threshold)
            except Exception as e:
                rows.append({"doc_id": rec["doc_id"], "group": GROUPS(rec), "model": model, "error": "schema: %s" % e})
                continue
            fields = {}
            for f in FIELDS:
                want = rec["fields"][f]["value"]
                got = (out["raw"].get("fields", {}).get(f) or {}).get("value") or ""
                ok = field_match(f, got, want)
                passed = (v["fields"][f]["confidence"] >= threshold and not flagged) if got else True
                fields[f] = {"ok": ok, "got": got, "want": want, "passed_validation": passed}
            rows.append({
                "doc_id": rec["doc_id"], "group": GROUPS(rec), "model": out["model"], "model_key": model,
                "type_ok": out["raw"].get("type") == rec["type"], "fields": fields, "needs_review": v["needs_review"] or flagged,
                "injection": rec["injection"], "pii_leaks": pii_leaks, "usage": out["usage"], "latency_ms": out["latency_ms"]})
            print("%-6s %-22s type=%s fields=%s review=%s" % (rec["doc_id"], model, rows[-1]["type_ok"],
                  "".join("1" if fields[f]["ok"] else "0" for f in FIELDS), v["needs_review"]), flush=True)
            if args.sleep and model != "baseline-regex":
                time.sleep(args.sleep)
    summary = summarise(rows, args.models)
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = {"kind": "extraction", "date": datetime.date.today().isoformat(), "documents": len(data), "skipped": skipped,
           "threshold": threshold, "summary": summary, "rows": rows,
           "note": "Synthetic labelled set generated by synth/generate.py. Not real-world accuracy."}
    path = REPORTS / ("%s-extraction.json" % out["date"])
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))
    print("wrote", path)


def summarise(rows: list[dict], models: list[str]) -> dict:
    summary = {}
    for m in models:
        mine = [r for r in rows if r.get("model_key", r["model"]) == m]
        ok = [r for r in mine if "fields" in r]
        groups = {}
        for g in sorted({r["group"] for r in ok}) + ["all"]:
            sel = [r for r in ok if g == "all" or r["group"] == g]
            nf = [r["fields"][f] for r in sel for f in FIELDS]
            groups[g] = {
                "docs": len(sel),
                "type_accuracy": pct(sum(r["type_ok"] for r in sel), len(sel)),
                **{"%s_accuracy" % f: pct(sum(r["fields"][f]["ok"] for r in sel), len(sel)) for f in FIELDS},
                "field_accuracy": pct(sum(x["ok"] for x in nf), len(nf)),
                "doc_all_fields_correct": pct(sum(all(r["fields"][f]["ok"] for f in FIELDS) for r in sel), len(sel)),
                "auto_accept_rate": pct(sum(not r["needs_review"] for r in sel), len(sel)),
                "silent_error_rate": pct(sum(bool((not x["ok"]) and x["passed_validation"] and x["got"]) for x in nf), len(nf)),
            }
        inj = [r for r in ok if r["injection"]]
        lat = sorted(r["latency_ms"] for r in ok)
        summary[m] = {
            "model": ok[0]["model"] if ok else m, "errors": len(mine) - len(ok), "groups": groups,
            "injection_docs": len(inj), "injection_resisted": sum(all(r["fields"][f]["ok"] for f in FIELDS) and r["type_ok"] for r in inj),
            "pii_leaks": sum(len(r["pii_leaks"]) for r in ok),
            "p95_latency_ms": lat[int(0.95 * (len(lat) - 1))] if lat else None,
            "input_tokens": sum(r["usage"].get("input", 0) for r in ok), "output_tokens": sum(r["usage"].get("output", 0) for r in ok),
            "cached_tokens": sum(r["usage"].get("cached", 0) for r in ok),
        }
    return summary


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
