"""Langfuse traces (cost, tokens, prompt version) when LANGFUSE_* is set; a no-op otherwise."""

from functools import lru_cache

import structlog

from backend.config import settings

log = structlog.get_logger()


@lru_cache
def _client():
    s = settings()
    if not (s.langfuse_host and s.langfuse_public_key and s.langfuse_secret_key):
        return None
    try:
        from langfuse import Langfuse

        return Langfuse(public_key=s.langfuse_public_key, secret_key=s.langfuse_secret_key, host=s.langfuse_host)
    except Exception as e:  # tracing must never break a pipeline run
        log.warning("langfuse_unavailable", error=str(e))
        return None


def generation(name: str, model: str, prompt_version: str | None, input, output, usage: dict, cost: float,
               metadata: dict | None = None) -> str | None:
    lf = _client()
    if lf is None:
        return None
    try:
        obs = lf.start_observation(
            name=name, as_type="generation", model=model, input=input, output=output, version=prompt_version,
            metadata=metadata or {},
            usage_details={"input": usage.get("input", 0), "output": usage.get("output", 0),
                           "cache_read_input_tokens": usage.get("cached", 0)},
            cost_details={"total": cost})
        obs.end()
        return getattr(obs, "trace_id", None)
    except Exception as e:
        log.warning("langfuse_trace_failed", error=str(e))
        return None


def flush():
    lf = _client()
    if lf is not None:
        lf.flush()
