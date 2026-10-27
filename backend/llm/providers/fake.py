"""Deterministic stand-in for language models: unit tests, CI and the "regex baseline" row in evals.

It is NOT a language model and is never used by the deployed pipeline (LLM_MODE=live). Extraction is a
label-and-pattern parser over the document text; embeddings are a hashing trick over word tokens. The
evaluation reports it as `baseline-regex` so the LLM numbers have something simple to beat.
"""

import datetime
import hashlib
import json
import math
import re

from backend.guardrails.validators import BN_MONTHS, BN_TO_ASCII, EN_MONTHS

REF = re.compile(r"\b([A-Z]{2,4}(?:-[A-Z]{2,4})?-\d{2,5}(?:-\d{2,4})?(?:-CL)?)\b")
LABEL_SETS = {
    "entity": ["issued to", "name of factory", "prepared for", "facility", "name of business", "business name",
               "name of the industrial unit", "unit", "factory", "employer",
               "প্রতিষ্ঠানের নাম", "প্রতিষ্ঠান", "ব্যবসার নাম", "শিল্প প্রতিষ্ঠানের নাম", "কারখানা", "নিয়োগকর্তা"],
    "issued": ["date of issue", "issued on", "issued", "assessment completed on", "date of assessment", "drill conducted on",
               "date of drill", "prepared on", "date prepared", "meeting held on", "date of meeting", "verified on",
               "date of verification", "ইস্যুর তারিখ", "মূল্যায়নের তারিখ", "মহড়ার তারিখ", "প্রস্তুতের তারিখ", "সভার তারিখ", "যাচাইয়ের তারিখ"],
    "valid_until": ["valid until", "expiry date", "valid till", "this assessment remains valid until", "next assessment due by",
                    "expires on", "validity", "valid up to", "মেয়াদ উত্তীর্ণের তারিখ", "বৈধ থাকবে", "মেয়াদ"],
}
TYPE_WORDS = [
    ("structural_report", ["structural assessment", "কাঠামোগত"]),
    ("env_clearance", ["environmental clearance", "পরিবেশগত ছাড়পত্র"]),
    ("fire_drill_record", ["fire drill", "অগ্নি মহড়া"]),
    ("committee_minutes", ["committee minutes", "কার্যবিবরণী"]),
    ("cap_closure_evidence", ["closure note", "সমাপ্তি নোট"]),
    ("payroll_summary", ["payroll", "মজুরি"]),
    ("trade_license", ["trade licen", "ট্রেড লাইসেন্স"]),
    ("fire_certificate", ["fire safety certificate", "অগ্নি নিরাপত্তা সনদ"]),
]


def parse_date(s: str) -> str | None:
    t = s.translate(BN_TO_ASCII).strip()
    for rx, order in ((r"(\d{4})-(\d{2})-(\d{2})", "ymd"), (r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", "dmy")):
        m = re.search(rx, t)
        if m:
            a, b, c = (int(x) for x in m.groups())
            y, mo, d = (a, b, c) if order == "ymd" else (c, b, a)
            try:
                return datetime.date(y, mo, d).isoformat()
            except ValueError:
                return None
    m = re.search(r"(\d{1,2})[\s-]+([^\s\d-]+)[\s-]+(\d{4})", t)
    if m:
        name = m.group(2).lower()
        for i, (en, bn) in enumerate(zip(EN_MONTHS, BN_MONTHS)):
            if name in (en.lower(), en[:3].lower(), bn):
                try:
                    return datetime.date(int(m.group(3)), i + 1, int(m.group(1))).isoformat()
                except ValueError:
                    return None
    return None


def _pages(variables: dict) -> list[dict]:
    if "pages" in variables:
        return [{"page": p["page"], "text": p["text"]} for p in variables["pages"]]
    return [{"page": 1, "text": variables.get("text", "")}]


def _find_label(pages, labels):
    best = None
    for p in pages:
        for line in p["text"].splitlines():
            if ":" not in line:
                continue
            label, _, value = line.partition(":")
            label_n = label.strip().lower()
            for L in labels:
                if label_n == L and value.strip():
                    rank = labels.index(L)
                    if best is None or rank < best[0]:
                        best = (rank, value.strip(), line.strip(), p["page"])
    return best


def classify_text(text: str) -> str:
    low = text.lower()
    for t, words in TYPE_WORDS:
        if any(w in low for w in words):
            return t
    return "other"


def extract(variables: dict) -> dict:
    pages = _pages(variables)
    fields = {}
    ref = None
    for p in pages:
        for line in p["text"].splitlines():
            m = REF.search(line)
            if m and ("no" in line.lower() or "ref" in line.lower() or "নং" in line):
                ref = (m.group(1), line.strip(), p["page"])
                break
        if ref:
            break
    fields["ref"] = {"value": ref[0], "quote": ref[1], "page": ref[2], "confidence": 0.9} if ref else _empty()
    hit = _find_label(pages, LABEL_SETS["entity"])
    fields["entity"] = {"value": hit[1], "quote": hit[2], "page": hit[3], "confidence": 0.9} if hit else _empty()
    for name in ("issued", "valid_until"):
        hit = _find_label(pages, LABEL_SETS[name])
        iso = parse_date(hit[1]) if hit else None
        fields[name] = {"value": iso, "quote": hit[2], "page": hit[3], "confidence": 0.9} if iso else _empty()
    all_text = "\n".join(p["text"] for p in pages)
    doc_type = classify_text(all_text)
    cites = []
    for p in pages:
        for m in re.finditer(r"certificate\s+(FC-\d{4}-\d{4})|সনদ\s+(FC-\d{4}-\d{4})", p["text"], re.IGNORECASE):
            r = m.group(1) or m.group(2)
            if not ref or r != ref[0]:
                cites.append({"ref": r, "of_type": "fire_certificate", "page": p["page"]})
    return {"type": doc_type, "title": "", "notes": "regex baseline", "fields": fields, "cites": cites}


def _empty():
    return {"value": "", "quote": "", "page": 0, "confidence": 0}


def generate(purpose: str, variables: dict, schema) -> tuple[str, dict]:
    if purpose == "extract":
        out = extract(variables)
    elif purpose == "classify":
        out = {"type": classify_text(variables.get("text", "")), "confidence": 0.9}
    elif purpose == "contextualize":
        return "From %s (%s), page %s." % (variables.get("title") or "document", variables.get("filename"), variables.get("page")), {}
    elif purpose == "rewrite":
        out = {"queries": [variables.get("text", "")], "hypothetical": variables.get("text", "")}
    elif purpose == "draft":
        out = _draft(variables)
    elif purpose == "judge":
        out = {"faithfulness": 1.0, "completeness": 1.0, "unsupported_claims": []}
    else:
        raise ValueError(purpose)
    return json.dumps(out, ensure_ascii=False), {"input": 0, "output": 0, "cached": 0}


def _draft(v: dict) -> dict:
    sections = []
    for r in v["requirements"]:
        if r["status"] == "supported":
            continue
        tag = "[%s]" % (r["sources"][0] if r["sources"] else r["id"])
        sections.append({"requirement": r["id"],
                         "text_en": "%s is %s. %s %s" % (r["title"], r["status"].replace("_", " "), r["reasons"][0], tag),
                         "text_bn": "%s: %s %s" % (r["id"], r["status"].replace("_", " "), tag)})
    return {"summary_en": "Coverage is %s%% [R1]." % v["scores"]["coverage"],
            "summary_bn": "কভারেজ %s%% [R1]।" % v["scores"]["coverage"], "sections": sections}


def embed(texts: list[str], dims: int = 1024) -> list[list[float]]:
    out = []
    for t in texts:
        v = [0.0] * dims
        for tok in re.findall(r"\w+", t.lower()):
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            v[h % dims] += 1.0 if (h >> 20) & 1 else -1.0
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        out.append([x / n for x in v])
    return out
