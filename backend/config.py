"""Settings, read from the environment (deploy/.env on the VPS). Secrets are never committed."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "deploy/.env"), extra="ignore")

    # Postgres: the app connects as a role without BYPASSRLS; migrations and seeding use the owner.
    database_url: str = "postgresql://tl_app:tl_app@localhost:5434/threadlight"
    admin_database_url: str = "postgresql://postgres:postgres@localhost:5434/threadlight"
    redis_url: str = "redis://localhost:6381/0"

    # Object storage (MinIO). Empty endpoint = local folder, used by tests and laptops without MinIO.
    s3_endpoint: str = ""
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "threadlight"
    s3_secure: bool = False
    local_storage_dir: str = "var/files"

    jwt_secret: str = "change-me-in-.env"
    jwt_access_minutes: int = 15
    jwt_refresh_days: int = 7

    # Models. Gemini is the cloud provider; Ollama runs the local models.
    gemini_api_key: str = ""
    anthropic_api_key: str = ""  # optional second cloud family, used only if set
    ollama_url: str = "http://localhost:11434"
    models_file: str = "backend/llm/models.yaml"
    # "live" calls real providers. "fake" is a deterministic stand-in for unit tests and CI only;
    # it is never used in the deployed system and never reported as a model.
    llm_mode: str = "live"
    private_mode: bool = False  # route every LLM call to Ollama

    presidio_url: str = ""  # e.g. http://presidio-analyzer:3000; empty = regex redaction only
    reranker: str = "bge"  # "bge" (sentence-transformers cross-encoder) or "off"
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    review_threshold: float = 0.85
    query_rewrite: bool = True  # rewrite clauses into evidence-seeking queries + HyDE before retrieval
    mapping_top_k: int = 5

    langfuse_host: str = ""
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""

    # Jobs run on the arq worker; inline=true runs them in-process (tests, single-box dev).
    inline_jobs: bool = False
    cors_origins: str = "http://localhost:5173"
    public_base_url: str = "http://localhost:8000"


@lru_cache
def settings() -> Settings:
    return Settings()
