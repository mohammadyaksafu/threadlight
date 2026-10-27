"""Local models through Ollama's HTTP API (chat with JSON-schema `format`, and /api/embed)."""

import httpx

from backend.config import settings


def generate(model: str, system: str, turns: list[dict], schema: dict | None, temperature: float = 0.0,
             max_tokens: int = 4096, **_) -> tuple[str, dict]:
    messages = [{"role": "system", "content": system}] + [
        {"role": "user" if t["role"] == "user" else "assistant", "content": t["text"]} for t in turns]
    body = {"model": model, "messages": messages, "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": 8192}}
    if schema:
        body["format"] = schema
    r = httpx.post(settings().ollama_url + "/api/chat", json=body, timeout=600)
    r.raise_for_status()
    j = r.json()
    return j["message"]["content"], {"input": j.get("prompt_eval_count", 0), "output": j.get("eval_count", 0), "cached": 0}


def embed(model: str, texts: list[str], dims: int, **_) -> tuple[list[list[float]], dict]:
    out = []
    for i in range(0, len(texts), 32):
        r = httpx.post(settings().ollama_url + "/api/embed", json={"model": model, "input": texts[i:i + 32]}, timeout=600)
        r.raise_for_status()
        out.extend(r.json()["embeddings"])
    if out and len(out[0]) != dims:
        raise RuntimeError("%s returned %d dimensions, expected %d" % (model, len(out[0]), dims))
    return out, {"input": sum(len(t) // 4 for t in texts), "output": 0, "cached": 0}


def available_models() -> list[str]:
    r = httpx.get(settings().ollama_url + "/api/tags", timeout=5)
    r.raise_for_status()
    return [m["name"] for m in r.json().get("models", [])]
