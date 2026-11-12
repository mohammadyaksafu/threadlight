# Open-source components

Versions are pinned in `backend/requirements.txt`, `backend/requirements-ml.txt`, `web/package.json` and the image tags
in `deploy/docker-compose.yml`.

| Component | Licence | Used for |
|---|---|---|
| FastAPI, Starlette, Uvicorn | MIT / BSD | REST API, OpenAPI docs |
| Pydantic, pydantic-settings | MIT | schemas, validation of model output, settings |
| SQLAlchemy 2, Alembic, psycopg 3 | MIT / LGPL | database access, migrations |
| PostgreSQL 16 + pgvector | PostgreSQL / PostgreSQL | relational store, vector index (HNSW), full-text search, row-level security |
| Redis, arq | BSD / MIT | job queue, response and embedding cache |
| LangGraph (+ checkpoint-postgres) | MIT | pipeline state machine with human-in-the-loop interrupts |
| three.js | MIT | WebGL thread scene behind the sign-in, overview and agent-framework panels (loaded on demand) |
| Pydantic AI, OpenAI Agents SDK, smolagents, AutoGen, Agno, DSPy | MIT / Apache-2.0 (see each package) | agent-framework bench only (`agent_bench/`), not deployed |
| MCP Python SDK (FastMCP) | MIT | threadlight-mcp server |
| Docling | MIT | layout-aware PDF parsing |
| Tesseract OCR (eng + ben), pytesseract, pypdfium2, pypdf, Pillow | Apache-2.0 / BSD / HPND | OCR, PDF rendering and text |
| Microsoft Presidio | MIT | PII detection before cloud model calls |
| sentence-transformers + BAAI bge-reranker-v2-m3 | Apache-2.0 / Apache-2.0 | cross-encoder reranking |
| Ollama + Llama 3.2 3B, Qwen 2.5 7B, bge-m3 | MIT / Llama 3.2 licence / Apache-2.0 / MIT | local classification, private mode, embeddings |
| Gemma 4 (via AI Studio) | Gemma terms | evaluation judge for Gemini-written drafts |
| RapidFuzz | MIT | fuzzy verbatim-quote check |
| Jinja2, PyYAML | BSD / MIT | prompt registry |
| structlog, prometheus-client, Langfuse | MIT / Apache-2.0 / MIT | logs, metrics, LLM traces |
| slowapi, PyJWT, bcrypt | MIT | rate limits, tokens, password hashes |
| MinIO | AGPL-3.0 | S3-compatible object storage (run unmodified as a service) |
| n8n | Sustainable Use Licence | workflow automation (self-hosted, internal use) |
| Prometheus, Grafana | Apache-2.0 / AGPL-3.0 | metrics and dashboards |
| Caddy | Apache-2.0 | HTTPS, reverse proxy |
| promptfoo | MIT | prompt regression tests |
| React, React Router, Vite, Tailwind CSS, lucide-react | MIT / ISC | web app |
| Recharts 2.15, Apache ECharts 5.5 | MIT / Apache-2.0 | Overview charts: risk-index composition, document validity timeline |

Gemini models are a hosted, closed service (Google AI Studio); they are listed in `docs/MODEL_ROUTING.md`, not here.
