# Model routing

Configuration: `backend/llm/models.yaml`. Every call goes through `backend/llm/router.py`, which tries the models of
a task's route in order, falls back on errors, quota (429) or an unreachable provider, caches responses in Redis,
and logs tokens, cached tokens, latency and an estimated cost to `llm_calls` (and Langfuse when configured).
`PRIVATE_MODE=true` switches every task to the local Ollama routes so no document text leaves the server.

Gemini model ids were checked against `models.list()` for the project's key on 2026-10-27: the `gemini-2.5-*`
models are closed to new keys, and on the free tier Gemini Pro returns 429.

| Task | Route (first = primary) | Why |
|---|---|---|
| Classify document type | Llama 3.2 3B (Ollama) -> Gemini 3.1 Flash-Lite | short input; local is enough and keeps page 1 private |
| Extract fields | **Gemini 3.5 Flash-Lite** -> Gemini 3.8 Flash -> Qwen 2.5 7B (Ollama) | best measured result at ~2-3 s per document (below) |
| Contextual chunk text | Gemini 3.1 Flash-Lite -> Llama 3.2 3B | many short calls |
| Query rewriting / HyDE | Gemini 3.1 Flash-Lite -> Llama 3.2 3B | short; cached per clause in Redis |
| Bilingual draft | Gemini Pro -> Gemini 3.8 Flash -> Gemini 3.5 Flash-Lite | writing quality; Pro needs a paid plan, so free-tier drafts came from 3.5 Flash-Lite |
| Judge drafts (eval) | Qwen 2.5 7B -> Gemma 4 31B -> Claude Haiku (if keyed) -> Llama 3.2 3B | never the Gemini model that wrote the draft |
| Embeddings | bge-m3 (Ollama) -> Gemini Embedding 001 (1024-d) | multilingual incl. Bangla; vectors are tagged with their model |

## Evidence (2026-10-27)

Extraction, 60 synthetic documents (30 digital English, 20 scanned English, 10 Bangla), run in the backend Docker image
with Tesseract OCR, one model at a time, no fallback. Source: `evals/reports/2026-10-27-extraction.json`.

| Extractor | Field accuracy (all 4 fields) | Type accuracy | Docs with all fields right | Silent errors | Injection docs resisted | p95 latency |
|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 1.0 | 1.0 | 1.0 | 0.0 | 2/2 | 3.0 s |
| `gemini-3.1-flash-lite` | 1.0 | 1.0 | 1.0 | 0.0 | 2/2 | 42.3 s |
| regex baseline (not an LLM) | 0.979 | 0.95 | 0.933 | 0.0 | 2/2 | 0 |
| `gemini-3.8-flash` | not measured: every call returned 503 (model overloaded) on 2026-10-27 | | | | | |

How to read this honestly:
- The synthetic documents are generated from a few templates. A regex parser written against the same templates
  also scores 1.0 on English; the models only pull ahead on Bangla (regex: type accuracy 0.5 on Bangla digital).
  So the set shows the pipeline works end to end (OCR, Bangla digits, multi-page, injection), **not** that the models
  are accurate on real factory documents.
- Earlier the same day, on the laptop without OCR, Bangla PDFs went through the PDF text layer (which scrambles
  Bangla glyph order); 3.5 Flash-Lite then scored 0.875 on Bangla fields. OCR of the rendered page fixed that,
  which is why the parser prefers Tesseract for Bangla pages.
- The two injection documents were resisted because instruction-like text sends the document to human review
  whatever the model returns. On the first run (before that rule was in the eval), 3.1 Flash-Lite *did* follow one
  planted instruction (`OVERRIDE-0000` as the reference); 3.5 Flash-Lite did not.
- Latency: 3.5 Flash-Lite was ~15x faster than 3.1 Flash-Lite at p95 on the free tier the same day, which decided the
  primary. 3.8 Flash with default thinking took 277 s for one document before the 503s; it now runs with
  `thinking_level: LOW` and a 60 s timeout when it is used as a fallback.
- Prompt caching: Gemini's implicit cache needs a longer shared prefix than our ~1.5k-token extraction prompts, so
  `cached_tokens` was 0 in every call so far. The Redis response cache did work: 55 of 63 rewrite calls and 36 of 124
  embedding calls in the pipeline run were cache hits.

Drafts: 3 runs from `gemini-3.5-flash-lite` (Pro returned 429): 83% of sentences carried a valid source tag before the
citation checker (the rest are removed before storage), no number outside the rule output, judge (Gemma 4 31B)
faithfulness 1.0. Source: `evals/reports/2026-10-27-draft.json`.

Re-run: `python -m evals.extraction_eval --models baseline-regex gemini-flash-lite-3.5 gemini-flash-lite gemini-flash`,
then `python -m evals.run_all`.
