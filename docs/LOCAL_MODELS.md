# Local models (Ollama)

Installed on the development laptop on 2026-10-31 with `winget install Ollama.Ollama` (Ollama 0.40.13), then
`ollama pull llama3.2:3b bge-m3 qwen2.5:7b`. The router (`backend/llm/router.py`, routes in
`backend/llm/models.yaml`) talks to it at `OLLAMA_URL=http://localhost:11434`; with `PRIVATE_MODE=true` every model call
stays on the machine.

| Model | Size / quantization | Route(s) | What it ran on 2026-10-31 |
|---|---|---|---|
| `llama3.2:3b` (Meta Llama 3.2) | 3.2B, Q4_K_M, 2.0 GB | classify (primary), contextualize/rewrite fallback, judge fallback | extraction eval on 8 English documents; classify calls |
| `qwen2.5:7b` (Alibaba Qwen 2.5) | 7.6B, Q4_K_M, 4.7 GB | extract fallback, judge (primary), private-mode extract/draft | extraction eval on 8 English documents |
| `bge-m3` (BAAI) | 568M, 1.2 GB | embed (primary) | re-indexed the demo factory (12 chunks) and every retrieval eval query |
| `deepseek-r1:1.5b` (DeepSeek-R1 distill) | 1.8B, Q4_K_M, 1.1 GB | candidate only, not routed | extraction eval on the same 8 documents |
| `gemma2:2b` (Google Gemma 2) | 2.6B, Q4_K_M, 1.6 GB | candidate only, not routed | extraction eval on the same 8 documents |

**Hardware:** Lenovo ThinkPad T14s, Intel Core i5-10310U (4 cores), Intel UHD Graphics (no CUDA GPU), 16 GB RAM, CPU
inference only. The VPS (4 GB shared) has no room for these models, so it stays on Gemini.

## Measured

Extraction, 8 English digital documents (`python -m evals.extraction_eval --models baseline-regex llama3.2-3b
qwen2.5-7b --limit 8 --only en/digital`, `evals/reports/2026-10-31-extraction.json`):

| Model | type acc. | field acc. | all fields right | auto-accept | silent errors | injection resisted | p95 latency |
|---|---|---|---|---|---|---|---|
| baseline-regex (no model) | 1.0 | 1.0 | 1.0 | 0.75 | 0.0 | 2/2 | 2 ms |
| llama3.2:3b | 1.0 | 0.938 | 0.75 | 0.625 | 0.0 | 1/2 | 56 s |
| qwen2.5:7b | 0.875 | 0.875 | 0.875 | 0.75 | 0.0 | 1/2 | 102 s |
| gemma2:2b | 1.0 | 1.0 | 1.0 | 0.75 | 0.0 | 2/2 | 88 s |
| deepseek-r1:1.5b | 0.5 | 0.25 | 0.0 | 0.0 | **0.188** | 0/2 | 116 s |

The two small candidates ran with `--tag small` (`evals/reports/2026-10-31-extraction-small.json`). Gemma 2 2B matched
the larger models on this set; DeepSeek-R1 1.5B (a reasoning distill) failed the JSON extraction task and let 19% of wrong
fields pass validation, so it stays out of every route. No silent errors for Llama 3.2 or Qwen 2.5: every wrong field was caught by the validators and sent to human review. On a
4-core laptop CPU a 7B model takes one to two minutes per document, which is why extraction stays on Gemini by default
and the local models are the private-mode and fallback path. The synthetic documents follow simple templates (the
regex baseline scores 100%), so these numbers are a smoke test, not a benchmark.

Retrieval with bge-m3 embeddings: see docs/RAG.md (clause retrieval recall@5 1.0; Graph RAG recall@3 0.611 -> 0.722).

The `llm_calls` table logs every local call (provider `ollama`, model, purpose, tokens, latency), the same as cloud
calls.

Scanned documents need Tesseract: `winget install UB-Mannheim.TesseractOCR`, then a tessdata folder with `eng` and
`ben` (`TESSDATA_PREFIX`), since the default install has English only.
