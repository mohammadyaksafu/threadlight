# One image for the API, the arq worker and the MCP server.
FROM python:3.12-slim
ARG WITH_ML=1
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/models/hf
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-ben libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/requirements-ml.txt backend/
RUN pip install -r backend/requirements.txt
RUN if [ "$WITH_ML" = "1" ]; then pip install -r backend/requirements-ml.txt; fi
COPY threadlight/ threadlight/
COPY backend/ backend/
COPY mcp_server/ mcp_server/
COPY evals/ evals/
COPY synth/ synth/
COPY data/ data/
# alembic and `python -m` both import the `backend` package from the repository root
ENV PYTHONPATH=/app
RUN useradd -m -u 10001 app && mkdir -p /models /app/var /data/files && chown -R app /models /app/var /data/files
USER app
EXPOSE 8000 8001
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
