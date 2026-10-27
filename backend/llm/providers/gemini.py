"""Google Gemini through the google-genai SDK.

Structured output uses `response_json_schema`. Prompt caching is Gemini's implicit cache: the system
instruction and few-shot turns are a stable prefix and the document comes last, so repeated calls hit the
cache; the hit count comes back in `usage_metadata.cached_content_token_count` and is logged per call.
"""

import math
import re
import time
from functools import lru_cache

from backend.config import settings


class NotConfigured(RuntimeError):
    pass


@lru_cache
def _client():
    from google import genai

    key = settings().gemini_api_key
    if not key:
        raise NotConfigured("GEMINI_API_KEY is not set")
    from google.genai import types

    # 60 s per request, so an overloaded model fails over to the next one in the route instead of hanging
    return genai.Client(api_key=key, http_options=types.HttpOptions(timeout=60_000))


def _with_retry(call, attempts: int = 2):
    """Retry 503 (overloaded) with backoff. 429 (quota) is not retried: the router moves to the next model."""
    from google.genai import errors

    for i in range(attempts):
        try:
            return call()
        except errors.ServerError:
            if i == attempts - 1:
                raise
            time.sleep(2 * (i + 1) ** 2)
        except errors.ClientError as e:
            # per-minute quota: wait once for the advertised retry delay (capped); daily quota (long delay) fails over
            delay = re.search(r"retry in ([\d.]+)s", str(e))
            if e.code != 429 or i == attempts - 1 or not delay or float(delay.group(1)) > 65:
                raise
            time.sleep(float(delay.group(1)) + 1)


def generate(model: str, system: str, turns: list[dict], schema: dict | None, temperature: float = 0.0,
             max_tokens: int = 4096, thinking_budget: int | None = None, thinking_level: str | None = None) -> tuple[str, dict]:
    from google.genai import types

    contents = [types.Content(role="user" if t["role"] == "user" else "model", parts=[types.Part(text=t["text"])])
                for t in turns]
    cfg = dict(system_instruction=system, temperature=temperature, max_output_tokens=max_tokens)
    if schema:
        cfg.update(response_mime_type="application/json", response_json_schema=schema)
    if thinking_level:
        cfg["thinking_config"] = types.ThinkingConfig(thinking_level=thinking_level)
    elif thinking_budget is not None:
        cfg["thinking_config"] = types.ThinkingConfig(thinking_budget=thinking_budget)
    r = _with_retry(lambda: _client().models.generate_content(model=model, contents=contents, config=types.GenerateContentConfig(**cfg)))
    u = r.usage_metadata
    usage = {
        "input": (u.prompt_token_count or 0) if u else 0,
        "output": ((u.candidates_token_count or 0) + (u.thoughts_token_count or 0)) if u else 0,
        "cached": (u.cached_content_token_count or 0) if u else 0,
    }
    if not r.text:
        raise RuntimeError("Gemini returned no text (finish reason: %s)" % (r.candidates[0].finish_reason if r.candidates else "none"))
    return r.text, usage


def embed(model: str, texts: list[str], dims: int, task: str = "RETRIEVAL_DOCUMENT") -> tuple[list[list[float]], dict]:
    from google.genai import types

    out = []
    for i in range(0, len(texts), 100):
        r = _with_retry(lambda: _client().models.embed_content(
            model=model, contents=texts[i:i + 100],
            config=types.EmbedContentConfig(output_dimensionality=dims, task_type=task)))
        for e in r.embeddings:
            n = math.sqrt(sum(v * v for v in e.values)) or 1.0  # truncated dimensions need re-normalising
            out.append([v / n for v in e.values])
    return out, {"input": sum(len(t) // 4 for t in texts), "output": 0, "cached": 0}


def batch_extract(model: str, requests: list[dict], display_name: str) -> str:
    """Submit a Gemini Batch API job (half price, asynchronous) for bulk re-extraction. Returns the job name."""
    job = _client().batches.create(model=model, src=requests, config={"display_name": display_name})
    return job.name


def batch_status(name: str):
    return _client().batches.get(name=name)
