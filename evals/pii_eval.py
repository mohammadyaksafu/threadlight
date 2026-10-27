"""PII redaction evaluation: what reaches the model, and what the redaction wrongly removes.

    PRESIDIO_URL=http://localhost:5002 python -m evals.pii_eval

For each labelled document (pages cached by extraction_eval): redact as the pipeline does, then count
- leaks: planted personal data (signatory name, phone number) still present in the model input;
- over-redaction: ground-truth field values (reference, entity) that were removed and so cannot be extracted.
"""

import datetime
import json

from backend.config import settings
from evals.common import REPORTS, llm_pages, load_dataset, pages_for, pct


def main():
    data = load_dataset()
    allow = sorted({r["fields"]["entity"]["value"] for r in data if r["fields"]["entity"]["value"]})
    rows = []
    for rec in data:
        sent, found = llm_pages(pages_for(rec), allow)
        text = "\n".join(p["text"] for p in sent)
        names, phones = [rec["pii"][0]], [rec["pii"][1]]
        kept = [rec["fields"][f]["value"] for f in ("ref", "entity") if rec["fields"][f]["value"]]
        rows.append({"doc_id": rec["doc_id"], "group": "%s/%s" % (rec["lang"], rec["variant"]),
                     "name_leaked": any(n.split(" (")[0] in text for n in names),
                     "phone_leaked": any(p in text for p in phones),
                     "fields_removed": [v for v in kept if v not in text], "entities_found": [e["type"] for e in found]})
    n = len(rows)
    summary = {"documents": n, "presidio": bool(settings().presidio_url),
               "name_leak_rate": pct(sum(r["name_leaked"] for r in rows), n),
               "phone_leak_rate": pct(sum(r["phone_leaked"] for r in rows), n),
               "docs_with_field_removed": sum(bool(r["fields_removed"]) for r in rows)}
    out = {"kind": "pii", "date": datetime.date.today().isoformat(), "summary": summary, "rows": rows,
           "note": "Names in the synthetic set are English-script; Presidio's English model does not cover Bangla-script names."}
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / ("%s-pii%s.json" % (out["date"], "" if summary["presidio"] else "-regex-only"))
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary), "\nwrote", path)


if __name__ == "__main__":
    main()
