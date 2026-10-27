# Retrieval and RAG

| Item | Implementation | Code |
|---|---|---|
| Sources | buyer-code clauses (`clause_chunks`) and factory document text (`chunks`), per tenant under row-level security | `backend/rag/index.py` |
| Chunking | layout-aware: paragraphs, Docling headings and tables stay whole; packed to ~330 words (~440 tokens), max 450 words, 15% overlap; never crosses a page, so every chunk keeps file and page | `chunk_pages()` |
| Contextual RAG | each chunk gets a 1-2 sentence context written by Gemini Flash-Lite; the whole document is the stable prompt prefix and the chunk comes last (prompt-cache friendly) | `prompts/contextualize_v1.yaml` |
| Dedup | an exact-duplicate chunk in the tenant reuses the stored context and embedding (no model calls) | `index_document()` |
| Embeddings | bge-m3 on Ollama (1024-d, multilingual) on the VPS; Gemini `gemini-embedding-001` at 1024-d as fallback (used on the laptop run). Vectors carry `embed_model`, and a query only compares vectors from the same model | `router.embed()` |
| Embedding cache | Redis, key = model + query/document + SHA-256(text), 30 days | `router.embed()` |
| Index | pgvector HNSW (cosine, m=16, ef_construction=64) + generated `tsvector` with the `simple` config (no stemming, so Bangla words and reference numbers stay intact), GIN index | migration `0001` |
| Hybrid retrieval | top 30 by vector + top 30 by full text per query, merged with reciprocal rank fusion (k=60) | `backend/rag/search.py` |
| Query rewriting / HyDE | each clause is rewritten into 3 evidence-seeking queries plus one hypothetical document passage; all are searched and fused | `prompts/rewrite_v1.yaml`, `rag/mapping.py` |
| Reranking | bge-reranker-v2-m3 cross-encoder on the fused top 30 -> top k (installed in the Docker image; `RERANKER=off` skips it) | `rerank()` |
| Clause mapping | for each clause, a new document is proposed when it ranks among the top N distinct documents (N = evidence types the clause needs); proposals wait for an officer in the review queue | `rag/mapping.py` |
| Knowledge graph | `mappings` (clause <-> document), alerts (document <-> document references) and the engine's edges; served to the evidence-graph page and the MCP server | |

## Measured (2026-10-27)

Factory 1 after the live Gemini pipeline run on the six v1 PDFs; D4 (a scan) re-indexed in the Docker image with
Tesseract OCR. Gemini embeddings, no reranker installed in that image (`WITH_ML=0`). Relevance = documents whose type
the clause needs; R6 and R8 have no document on file and are skipped. From `evals/reports/2026-10-27-rag.json`:

| Configuration | Clauses | recall@5 | hit@1 | MRR |
|---|---|---|---|---|
| vector only | 6 | 1.0 | 1.0 | 1.0 |
| full text only | 6 | 1.0 | 0.5 | 0.75 |
| hybrid (RRF) | 6 | 1.0 | 1.0 | 1.0 |
| hybrid + query rewriting | 6 | 1.0 | 1.0 | 1.0 |

Before D4 was OCR'd (laptop without Tesseract) every configuration missed R4 (recall@5 0.833). Full text alone ranks
the right document first only half the time; hybrid fixes that. Six documents are far too few to tell rewriting or
reranking apart, so this is a smoke test, not a benchmark. Re-run `python -m evals.rag_eval` on the VPS with the
reranker installed and more documents before quoting retrieval quality.
