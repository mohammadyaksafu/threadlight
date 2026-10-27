"""LLM router: one entry point for every model call.

- picks models by task from models.yaml (private mode routes everything to Ollama);
- falls back to the next model in the route on error or when a provider is not configured;
- caches responses in Redis (key = model + prompt version + rendered prompt);
- validates JSON against the prompt's schema shape and retries once on a parse failure;
- logs every call to `llm_calls` (tokens, cached tokens, latency, estimated cost) and to Langfuse.
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import structlog
import yaml

from backend.config import settings
from backend.llm import registry, tracing
from backend.llm.providers import anthropic as anthropic_p
from backend.llm.providers import gemini as gemini_p
from backend.llm.providers import ollama as ollama_p

log = structlog.get_logger()
PROVIDERS = {"gemini": gemini_p, "ollama": ollama_p, "anthropic": anthropic_p}


@dataclass
class LLMResult:
    data: dict | None
    text: str
    model: str
    provider: str
    prompt_version: str
    usage: dict = field(default_factory=dict)
    cost_usd: float = 0.0
    cache_hit: bool = False
    attempts: list = field(default_factory=list)


class AllModelsFailed(RuntimeError):
    pass


@lru_cache
def catalogue() -> dict:
    return yaml.safe_load(Path(settings().models_file).read_text(encoding="utf-8"))


def route(task: str) -> list[str]:
    c = catalogue()
    table = c["private_routes"] if settings().private_mode else c["routes"]
    return list(table[task])


def model_info(key: str) -> dict:
    return catalogue()["models"][key]


def cost(key: str, usage: dict) -> float:
    p = model_info(key).get("price") or {}
    fresh = max(usage.get("input", 0) - usage.get("cached", 0), 0)
    return (fresh * p.get("input", 0) + usage.get("cached", 0) * p.get("cached_input", 0)
            + usage.get("output", 0) * p.get("output", 0)) / 1_000_000


@lru_cache
def _redis():
    try:
        import redis

        r = redis.Redis.from_url(settings().redis_url, socket_timeout=2)
        r.ping()
        return r
    except Exception:
        return None


def _cache_key(model_key: str, rendered: registry.Rendered) -> str:
    blob = json.dumps([model_key, rendered.version, rendered.system, rendered.turns, rendered.schema], ensure_ascii=False)
    return "llm:" + hashlib.sha256(blob.encode()).hexdigest()


def parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1].rsplit("```", 1)[0]
    start, end = t.find("{"), t.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object in model output")
    return json.loads(t[start:end + 1])


def _check_required(data: dict, schema: dict | None):
    """Shallow schema check: required keys present at the top level and in nested objects."""
    if not schema:
        return
    for k in schema.get("required", []):
        if k not in data:
            raise ValueError("missing field %r" % k)
        sub = schema.get("properties", {}).get(k, {})
        if sub.get("type") == "object" and isinstance(data[k], dict):
            _check_required(data[k], sub)


def _log_call(tenant_id, purpose, provider, model, version, usage, latency_ms, cost_usd, cache_hit, ok, trace_id):
    from backend.db.session import admin_tx, tenant_tx
    from sqlalchemy import text

    sql = text("""INSERT INTO llm_calls (tenant_id, purpose, provider, model, prompt_version, input_tokens, output_tokens,
                  cached_tokens, latency_ms, cost_usd, cache_hit, ok, trace_id)
                  VALUES (:t, :p, :pr, :m, :v, :i, :o, :c, :l, :cost, :hit, :ok, :tr)""")
    params = dict(t=tenant_id, p=purpose, pr=provider, m=model, v=version, i=usage.get("input", 0), o=usage.get("output", 0),
                  c=usage.get("cached", 0), l=latency_ms, cost=cost_usd, hit=cache_hit, ok=ok, tr=trace_id)
    try:
        ctx = tenant_tx(tenant_id) if tenant_id else admin_tx()
        with ctx as conn:
            conn.execute(sql, params)
    except Exception as e:  # logging must not break the call
        log.warning("llm_call_log_failed", error=str(e))


_down_until: dict[str, float] = {}


def _provider_up(name: str) -> bool:
    """Circuit breaker: a provider that refused a connection is skipped for 60 s instead of costing a timeout per call."""
    return time.monotonic() >= _down_until.get(name, 0)


def _mark_down(name: str, error: Exception):
    import httpx

    if isinstance(error, (httpx.ConnectError, httpx.ConnectTimeout)):
        _down_until[name] = time.monotonic() + 60


def _call_model(model_key, purpose, rendered, variables, opts):
    info = model_info(model_key)
    if settings().llm_mode == "fake":
        from backend.llm.providers import fake

        return fake.generate(purpose, variables, rendered.schema), "fake", "fake/" + info["name"]
    if not _provider_up(info["provider"]):
        raise ConnectionError("%s skipped: unreachable in the last minute" % info["provider"])
    provider = PROVIDERS[info["provider"]]
    try:
        text_out, usage = provider.generate(info["name"], rendered.system, rendered.turns, rendered.schema,
                                            **{**opts, **(info.get("options") or {})})
    except Exception as e:
        _mark_down(info["provider"], e)
        raise
    return (text_out, usage), info["provider"], info["name"]


def complete(task: str, prompt_id: str, variables: dict, *, tenant_id: int | None = None, models: list[str] | None = None,
             type_hint: str | None = None, use_cache: bool = True, **opts) -> LLMResult:
    """Render prompt `prompt_id` with `variables` and run it on the route for `task`."""
    prompt = registry.load(prompt_id)
    rendered = registry.render(prompt, variables, type_hint=type_hint)
    attempts = []
    for model_key in models or route(task):
        ckey = _cache_key(model_key, rendered)
        r = _redis() if use_cache and settings().llm_mode != "fake" else None
        if r is not None:
            hit = r.get(ckey)
            if hit:
                c = json.loads(hit)
                _log_call(tenant_id, task, c["provider"], c["model"], rendered.version, {}, 0, 0.0, True, True, None)
                return LLMResult(c["data"], c["text"], c["model"], c["provider"], rendered.version, {}, 0.0, True, attempts)
        for attempt in range(2):  # one retry on invalid JSON
            t0 = time.perf_counter()
            try:
                (text_out, usage), provider, model_name = _call_model(model_key, task, rendered, variables, opts)
            except Exception as e:
                attempts.append({"model": model_key, "error": "%s: %s" % (type(e).__name__, str(e)[:300])})
                log.info("llm_model_unavailable", task=task, model=model_key, error=str(e)[:300])
                if not isinstance(e, ConnectionError):  # record real provider errors (quota, overload) in llm_calls
                    info = model_info(model_key)
                    _log_call(tenant_id, task, info["provider"], info["name"], rendered.version, {},
                              int((time.perf_counter() - t0) * 1000), 0.0, False, False, None)
                break
            latency = int((time.perf_counter() - t0) * 1000)
            data, ok = None, True
            if rendered.schema:
                try:
                    data = parse_json(text_out)
                    _check_required(data, rendered.schema)
                except Exception as e:
                    ok = False
                    attempts.append({"model": model_key, "error": "invalid JSON: %s" % e})
            c_usd = cost(model_key, usage) if provider != "fake" else 0.0
            trace_id = tracing.generation(task, model_name, rendered.version, rendered.turns[-1]["text"][:4000], text_out[:4000],
                                          usage, c_usd, {"tenant_id": tenant_id, "attempt": attempt})
            _log_call(tenant_id, task, provider, model_name, rendered.version, usage, latency, c_usd, False, ok, trace_id)
            if not ok:
                continue
            if r is not None:
                r.setex(ckey, 7 * 24 * 3600, json.dumps({"data": data, "text": text_out, "model": model_name, "provider": provider}))
            return LLMResult(data, text_out, model_name, provider, rendered.version, usage, c_usd, False, attempts)
    raise AllModelsFailed("%s: every model failed: %s" % (task, attempts))


def embed(texts: list[str], *, tenant_id: int | None = None, query: bool = False) -> tuple[list[list[float]], str]:
    """Embed texts with the first working model on the `embed` route. Returns (vectors, model name)."""
    if settings().llm_mode == "fake":
        from backend.llm.providers import fake

        return fake.embed(texts), "fake/bge-m3"
    errors = []
    for key in route("embed"):
        info = model_info(key)
        if not _provider_up(info["provider"]):
            errors.append("%s: skipped (unreachable)" % key)
            continue
        provider = PROVIDERS[info["provider"]]
        t0 = time.perf_counter()
        kind = "q" if query else "d"
        r = _redis()
        keys = ["emb:%s:%s:%s" % (info["name"], kind, hashlib.sha256(t.encode()).hexdigest()) for t in texts]
        cached = r.mget(keys) if r is not None else [None] * len(texts)
        missing = [i for i, c in enumerate(cached) if c is None]
        try:
            kwargs = {"task": "RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT"} if info["provider"] == "gemini" else {}
            vecs, usage = provider.embed(info["name"], [texts[i] for i in missing], info["dims"], **kwargs) if missing else ([], {})
        except Exception as e:
            _mark_down(info["provider"], e)
            errors.append("%s: %s" % (key, str(e)[:300]))
            continue
        out = [json.loads(c) if c is not None else None for c in cached]
        for i, v in zip(missing, vecs):
            out[i] = v
            if r is not None:
                r.setex(keys[i], 30 * 24 * 3600, json.dumps(v))
        _log_call(tenant_id, "embed", info["provider"], info["name"], None, usage, int((time.perf_counter() - t0) * 1000),
                  cost(key, usage), not missing, True, None)
        return out, info["name"]
    raise AllModelsFailed("embed: every model failed: %s" % errors)
