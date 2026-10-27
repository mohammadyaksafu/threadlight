"""Citation checker for drafted text: every sentence must carry a source tag that exists in the input.

Allowed tags are built from the rule output: [D1:p1] (document and page), [R6] (requirement), [A2]
(alert). A sentence without a valid tag is dropped; the caller regenerates once and then flags it.
"""

import re

TAG = re.compile(r"\[([A-Z][A-Za-z0-9-]*(?::p\d+)?)\]")
SENTENCE = re.compile(r"(?<=[.!?।])\s+")


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in SENTENCE.split(text.strip()) if s.strip()]


def check(text: str, allowed: set[str]) -> tuple[str, list[str]]:
    """Return (text with only cited sentences, dropped sentences)."""
    kept, dropped = [], []
    for s in split_sentences(text):
        tags = TAG.findall(s)
        if tags and all(t in allowed for t in tags):
            kept.append(s)
        else:
            dropped.append(s)
    return " ".join(kept), dropped


def allowed_tags(result: dict, documents: list[dict]) -> set[str]:
    tags = {r["id"] for r in result["requirements"]} | {a["id"] for a in result["alerts"]}
    tags |= {"%s:p%d" % (d["id"], d["source"]["page"]) for d in documents}
    tags |= {d["id"] for d in documents}
    return tags
