"""Validation of an LLM extraction against the document it came from.

A field keeps the model's confidence only if
- its quote is found on the cited page (fuzzy match >= 90 after normalisation, to absorb OCR noise),
- its value is consistent with the quote (the reference or name appears in it; a date's year, month and
  day appear in it in some format, Bangla digits included), and
- the value is well-formed (ISO date, issue date not after expiry).
Otherwise the field's confidence becomes 0. Any field below the review threshold sends the document to
the human review queue.
"""

import datetime
import re
import unicodedata

from pydantic import BaseModel, Field
from rapidfuzz import fuzz

EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"]
BN_TO_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
FIELDS = ("ref", "entity", "issued", "valid_until")
DATE_FIELDS = ("issued", "valid_until")


class FieldValue(BaseModel):
    value: str = ""
    quote: str = ""
    page: int = 0
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class Cite(BaseModel):
    ref: str
    of_type: str
    page: int = 0


class Extraction(BaseModel):
    type: str
    title: str = ""
    notes: str = ""
    fields: dict[str, FieldValue]
    cites: list[Cite] = []


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s or "").translate(BN_TO_ASCII).lower()
    return re.sub(r"\s+", " ", s).strip()


def quote_on_page(quote: str, page_text: str) -> float:
    q, p = norm(quote), norm(page_text)
    if not q or not p:
        return 0.0
    if q in p:
        return 100.0
    return fuzz.partial_ratio(q, p)


def date_matches_quote(iso: str, quote: str) -> bool:
    try:
        d = datetime.date.fromisoformat(iso)
    except ValueError:
        return False
    q = norm(quote)
    if str(d.year) not in q:
        return False
    nums = [int(x) for x in re.findall(r"\d+", q)]
    month_names = [EN_MONTHS[d.month - 1].lower(), EN_MONTHS[d.month - 1][:3].lower(), BN_MONTHS[d.month - 1]]
    month_ok = d.month in nums or any(m in q for m in month_names)
    return month_ok and d.day in nums


def validate(raw: dict, pages: dict[int, str], evidence_types: list[str], threshold: float) -> dict:
    """Return {type, title, fields{name: {..., confidence, checks}}, cites, issues, needs_review}."""
    ex = Extraction.model_validate(raw)
    issues = []
    doc_type = ex.type if ex.type in evidence_types else None
    if not doc_type:
        issues.append("unknown document type %r" % ex.type)
    out = {}
    for name in FIELDS:
        f = ex.fields.get(name) or FieldValue()
        checks = {}
        conf = f.confidence
        if not f.value:
            out[name] = {"value": None, "quote": "", "page": None, "confidence": conf if not f.quote else 0.0, "checks": {"absent": True}}
            continue
        page_text = pages.get(f.page, "")
        checks["quote_score"] = round(quote_on_page(f.quote, page_text), 1)
        checks["quote_found"] = checks["quote_score"] >= 90
        if name in DATE_FIELDS:
            try:
                datetime.date.fromisoformat(f.value)
                checks["well_formed"] = True
            except ValueError:
                checks["well_formed"] = False
            checks["value_in_quote"] = date_matches_quote(f.value, f.quote)
        else:
            checks["well_formed"] = True
            checks["value_in_quote"] = norm(f.value) in norm(f.quote) or fuzz.partial_ratio(norm(f.value), norm(f.quote)) >= 92
        if not all(checks[k] for k in ("quote_found", "well_formed", "value_in_quote")):
            conf = 0.0
            issues.append("%s failed checks %s" % (name, {k: v for k, v in checks.items() if v is False}))
        out[name] = {"value": f.value, "quote": f.quote, "page": f.page, "confidence": round(conf, 3), "checks": checks}
    iss, vu = out["issued"]["value"], out["valid_until"]["value"]
    if iss and vu and out["issued"]["confidence"] and out["valid_until"]["confidence"] and iss > vu:
        issues.append("issue date %s is after expiry %s" % (iss, vu))
        out["issued"]["confidence"] = out["valid_until"]["confidence"] = 0.0
    required = ["ref", "entity", "issued"]
    low = [n for n in required if out[n]["value"] is None or out[n]["confidence"] < threshold]
    low += [n for n in ("valid_until",) if out[n]["value"] is not None and out[n]["confidence"] < threshold]
    return {
        "type": doc_type, "title": ex.title, "fields": out,
        "cites": [c.model_dump() for c in ex.cites if c.ref and c.of_type in evidence_types],
        "issues": issues, "low_fields": low, "needs_review": bool(low) or doc_type is None,
    }
