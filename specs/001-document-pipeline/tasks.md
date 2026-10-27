# Tasks

- [x] Schema + RLS + seed (`backend/db/`) - check: passport 29/63 from the database, cross-tenant 404
- [x] Synthetic generator with ground truth (`synth/`) - check: 60 documents, 30 digital EN / 20 scan EN / 10 BN
- [x] Upload, storage, duplicate check - check: second upload of the same file returns `duplicate: true`
- [x] Parse + OCR + redaction + fencing - check: guardrail unit tests
- [x] Router, prompt registry, Gemini extraction, validation, review queue - check: e2e test (fake LLM) and live Gemini run
- [x] Indexing, hybrid search, reranker hook, clause proposals - check: search "fire certificate valid on audit day" returns D1
- [x] Bilingual draft + citation checker - check: report labelled "Draft for human review", uncited sentences removed
- [x] Approval interrupt + finalize - check: acceptance checks 1 and 2
