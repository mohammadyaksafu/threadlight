"""Prompt-injection fencing for uploaded document text.

The text is placed inside <document> tags by the prompt templates, and the system prompt says it is data.
Here we (1) neutralise anything that could close or reopen the fence and (2) flag instruction-like text so
the document is logged and its extraction goes to human review. The model never has tools during
extraction, and its output is limited to the JSON schema, so a successful injection can at worst produce
wrong field values, which the verbatim-quote check and the review queue then catch.
"""

import re

FENCE = re.compile(r"</?\s*(document|chunk|draft|rule_output|system)\b[^>]*>", re.IGNORECASE)
SUSPICIOUS = [
    r"ignore (all |any )?(the )?(previous|prior|above) instructions",
    r"disregard (the )?(previous|prior|above)",
    r"\bsystem\s*:",
    r"you are now",
    r"output only",
    r"reveal (the |your )?(system )?prompt",
    r"note to (automated|ai) systems",
]
SUSPICIOUS_RX = re.compile("|".join(SUSPICIOUS), re.IGNORECASE)


def fence(text: str) -> str:
    return FENCE.sub(lambda m: m.group(0).replace("<", "‹").replace(">", "›"), text)


def scan(text: str) -> list[str]:
    return [m.group(0) for m in SUSPICIOUS_RX.finditer(text)]
