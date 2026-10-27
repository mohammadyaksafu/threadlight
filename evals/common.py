"""Shared helpers for the evaluation scripts: dataset loading, cached parsing, scoring."""

import json
from pathlib import Path

from backend.guardrails import injection, pii
from backend.ocr.parse import ocr_available, parse
from threadlight.engine import normalize_entity

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "evals" / "datasets" / "extraction.jsonl"
CACHE = ROOT / "evals" / ".cache" / "pages"
REPORTS = ROOT / "evals" / "reports"
SAMPLE = json.loads((ROOT / "data" / "sample.json").read_text(encoding="utf-8"))
EVIDENCE_TYPES = SAMPLE["evidence_types"]


def load_dataset() -> list[dict]:
    return [json.loads(line) for line in DATASET.read_text(encoding="utf-8").splitlines() if line.strip()]


def file_for(rec: dict) -> Path:
    return ROOT / "synth" / "out" / rec["set"] / rec["file"]


def pages_for(rec: dict) -> list[dict]:
    """Parse once and cache (OCR is slow). Returns [{page, text, method}]."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / ("%s.%s.json" % (rec["doc_id"], "ocr" if ocr_available() else "noocr"))
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    pages = [p.__dict__ for p in parse(file_for(rec).read_bytes(), "application/pdf", rec["file"])]
    if any(p["text"].strip() for p in pages):
        cached.write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")
    return pages


def llm_pages(pages: list[dict], allow: list[str]) -> tuple[list[dict], list[dict]]:
    out, found = [], []
    for p in pages:
        text, ents = pii.redact(p["text"], allow)
        out.append({"page": p["page"], "text": injection.fence(text)})
        found += ents
    return out, found


def field_match(name: str, got, want: str) -> bool:
    got = (got or "").strip()
    want = (want or "").strip()
    if not want:
        return not got
    if name == "entity":
        return normalize_entity(got) == normalize_entity(want)
    if name == "ref":
        return got.upper() == want.upper()
    return got == want


def pct(n: int, d: int) -> float | None:
    return round(n / d, 3) if d else None
