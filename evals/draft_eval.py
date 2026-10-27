"""Draft quality: deterministic checks plus an LLM judge from a different model family than the drafter.

    python -m evals.draft_eval [--factory 1] [--tenant 1] [--runs 3]

For each run, a fresh bilingual draft is generated from the rule output (no response cache) and scored:
- citation coverage: sentences kept by the citation checker / all sentences (EN and BN);
- uncited sentences that reached the report (must be 0: the checker removes them);
- number faithfulness: every number in the English draft also appears in the rule output;
- judge (route `judge`: Qwen 2.5 / Gemma 4 / Claude, never the Gemini drafter): faithfulness, completeness.
A person spot-checks the drafts listed in the report (`spot_check` field is filled in by hand).
"""

import argparse
import datetime
import json
import re

from backend.db.session import tenant_tx
from backend.guardrails import citations
from backend.llm import registry, router
from backend.services.drafting import _inputs
from backend.services.passport import passport
from evals.common import REPORTS, pct


def numbers(text: str, strip_tags: bool = True) -> set[str]:
    if strip_tags:  # source tags like [D1:p1] are checked by the citation checker, not here
        text = re.sub(r"\[[A-Z][A-Za-z0-9-]*(?::p\d+)?\]", "", text)
    return set(re.findall(r"\d+", text))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--factory", type=int, default=1)
    ap.add_argument("--tenant", type=int, default=1)
    ap.add_argument("--runs", type=int, default=3)
    args = ap.parse_args(argv)
    with tenant_tx(args.tenant) as c:
        p = passport(c, args.factory)
    variables = _inputs(p)
    allowed = citations.allowed_tags(p["result"], p["dataset"]["documents"])
    rule_text = json.dumps(variables, ensure_ascii=False, default=str)
    prompt = registry.render(registry.load("draft"), variables)
    rule_numbers = numbers(prompt.turns[-1]["text"], strip_tags=False)  # everything the drafter was shown
    runs = []
    for i in range(args.runs):
        res = router.complete("draft", "draft", variables, tenant_id=args.tenant, use_cache=False, max_tokens=6000, temperature=0.3)
        body = res.data
        texts_en = [body.get("summary_en", "")] + [s.get("text_en", "") for s in body.get("sections", [])]
        texts_bn = [body.get("summary_bn", "")] + [s.get("text_bn", "") for s in body.get("sections", [])]
        sent = [s for t in texts_en + texts_bn for s in citations.split_sentences(t)]
        kept = [s for s in sent if citations.check(s, allowed)[0]]
        en = " ".join(texts_en)
        extra_numbers = sorted(numbers(en) - rule_numbers)
        try:
            j = router.complete("judge", "judge", {"rule_output": rule_text, "draft": en, "lang": "en"}, tenant_id=args.tenant, max_tokens=1500)
            judge = {**j.data, "model": j.model}
        except Exception as e:
            judge = {"error": str(e)[:300]}
        open_reqs = [r["id"] for r in p["result"]["requirements"] if r["status"] != "supported"]
        covered = {s.get("requirement") for s in body.get("sections", [])}
        runs.append({"drafter": res.model, "sentences": len(sent), "citation_coverage": pct(len(kept), len(sent)),
                     "numbers_not_in_rule_output": extra_numbers, "open_requirements_covered": pct(len(covered & set(open_reqs)), len(open_reqs)),
                     "judge": judge, "draft_en": en, "draft_bn": " ".join(texts_bn), "spot_check": None})
        print("run %d drafter=%s coverage=%s extra_numbers=%s judge=%s" % (i + 1, res.model, runs[-1]["citation_coverage"],
              extra_numbers, {k: judge.get(k) for k in ("faithfulness", "completeness", "model", "error")}), flush=True)
    jf = [r["judge"]["faithfulness"] for r in runs if "faithfulness" in r["judge"]]
    out = {"kind": "draft", "date": datetime.date.today().isoformat(), "runs": runs, "summary": {
        "runs": len(runs), "mean_citation_coverage": pct(sum(r["citation_coverage"] or 0 for r in runs), len(runs)),
        "runs_with_unsupported_numbers": sum(bool(r["numbers_not_in_rule_output"]) for r in runs),
        "mean_judge_faithfulness": round(sum(jf) / len(jf), 3) if jf else None,
        "judge_model": next((r["judge"].get("model") for r in runs if r["judge"].get("model")), None)},
        "note": "Uncited sentences are removed by the citation checker before a report is stored; coverage is measured before that step."}
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / ("%s-draft.json" % out["date"])
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(out["summary"]), "\nwrote", path)


if __name__ == "__main__":
    main()
