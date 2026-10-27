"""Personal-data redaction before any cloud model call.

Presidio (the presidio-analyzer service) finds people, phone numbers and e-mail addresses; regexes add
Bangladeshi phone and national-ID patterns and act as the fallback when Presidio is not reachable.
Organisation names (the factory) are deliberately NOT redacted: the entity name is a field we extract.
Known factory names are passed as an allow-list so they are never mistaken for a person.
"""

import re

import httpx
import structlog

from backend.config import settings

log = structlog.get_logger()

PATTERNS = {
    "PHONE_NUMBER": re.compile(r"(?:\+?880[\s-]?)?\b01[3-9]\d{2}[\s-]?\d{6}\b|\+880[\s-]?\d{2,4}[\s-]?\d{6,8}"),
    "EMAIL_ADDRESS": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    "BD_NID": re.compile(r"\b(?:\d{10}|\d{13}|\d{17})\b"),
}
PRESIDIO_ENTITIES = ["PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS"]
# The name after a signature label (English or Bangla). Presidio's English model misses many Bangladeshi names
# (e.g. "Nasrin Akter" scored nothing in the 2026-10-27 eval) and all Bangla-script names, so labels catch them.
SIGNATORY = re.compile(r"(?:Signed|Signature|Verified by|Approved by|Prepared by|Inspected by|\S*ক্ষর|যাচাইকারী)\s*:\s*"
                       r"([^\n(,;:]{2,60}?)(?=\s*(?:\(|,|;|\n|$))", re.IGNORECASE)


def _presidio(text: str, allow: list[str]) -> list[tuple[int, int, str]]:
    url = settings().presidio_url
    if not url:
        return []
    try:
        r = httpx.post(url.rstrip("/") + "/analyze", timeout=20, json={
            "text": text, "language": "en", "entities": PRESIDIO_ENTITIES, "score_threshold": 0.6,
            "allow_list": allow})
        r.raise_for_status()
        return [(e["start"], e["end"], e["entity_type"]) for e in r.json()]
    except Exception as e:
        log.warning("presidio_unavailable", error=str(e))
        return []


def redact(text: str, allow: list[str] | None = None) -> tuple[str, list[dict]]:
    """Return (redacted text, [{type, placeholder}]). Placeholders are stable within one text."""
    allow = allow or []
    spans = _presidio(text, allow)
    for kind, rx in PATTERNS.items():
        spans += [(m.start(), m.end(), kind) for m in rx.finditer(text)]
    spans += [(m.start(1), m.end(1), "PERSON") for m in SIGNATORY.finditer(text)]
    # protect allow-listed names and reference-number-like tokens (FC-2025-0417) from accidental hits
    protected = [(m.start(), m.end()) for a in allow if a for m in re.finditer(re.escape(a), text)]
    protected += [(m.start(), m.end()) for m in re.finditer(r"\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b", text)]
    spans = [s for s in spans if not any(s[0] < pe and ps < s[1] for ps, pe in protected)]
    spans.sort()
    merged = []
    for s in spans:
        if merged and s[0] < merged[-1][1]:
            if s[1] > merged[-1][1]:
                merged[-1] = (merged[-1][0], s[1], merged[-1][2])
            continue
        merged.append(s)
    out, last, found, seen = [], 0, [], {}
    for start, end, kind in merged:
        original = text[start:end]
        key = (kind, original)
        if key not in seen:
            seen[key] = "<%s_%d>" % (kind, sum(1 for k in seen if k[0] == kind) + 1)
            found.append({"type": kind, "placeholder": seen[key]})
        out.append(text[last:start])
        out.append(seen[key])
        last = end
    out.append(text[last:])
    return "".join(out), found
