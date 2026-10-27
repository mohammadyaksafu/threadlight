# 001 Document pipeline

## Why
Factories hold certificates as PDFs and scans. v1 used hand-written, pre-extracted fields. v2 must read real files.

## What
- Upload PDF/JPEG/PNG (<= 20 MB) per factory; duplicate files (same SHA-256) are not processed twice.
- Text per page with page numbers (Docling / PDF text layer / Tesseract `eng+ben`).
- Personal data redacted before any cloud model call; document text treated as untrusted data.
- Fields `type, ref, entity, issued, valid_until, cites` extracted with a verbatim quote and page per field.
- A field is trusted only if its quote is on the cited page and its value matches the quote; otherwise a person reviews it.
- The unchanged rules engine decides statuses. A document counts as verified only after an officer approves it.

## Acceptance checks
1. Uploading the six v1 PDFs and approving them reproduces v1: coverage 29, risk index 63, alerts A1-A3.
2. Uploading the renewal with `supersedes=D1` gives R1 `pending_review` and coverage 29 until approved, then 55.
3. A scan with no readable text goes to the review queue instead of producing guessed fields.
4. A user of tenant 2 cannot read tenant 1's factory (404) and RLS returns no rows without a tenant.
