"""Optional Anthropic provider (a second cloud model family, used as an evaluation judge fallback)."""

from functools import lru_cache

from backend.config import settings
from backend.llm.providers.gemini import NotConfigured


@lru_cache
def _client():
    import anthropic

    if not settings().anthropic_api_key:
        raise NotConfigured("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic(api_key=settings().anthropic_api_key)


def generate(model: str, system: str, turns: list[dict], schema: dict | None, temperature: float = 0.0,
             max_tokens: int = 4096, **_) -> tuple[str, dict]:
    if schema:
        system += "\n\nReply with one JSON object that matches this JSON schema, and nothing else:\n" + str(schema)
    msgs = [{"role": "user" if t["role"] == "user" else "assistant", "content": t["text"]} for t in turns]
    r = _client().messages.create(
        model=model, max_tokens=max_tokens, temperature=temperature,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}], messages=msgs)
    text = "".join(b.text for b in r.content if b.type == "text")
    u = r.usage
    return text, {"input": u.input_tokens + (u.cache_read_input_tokens or 0), "output": u.output_tokens,
                  "cached": u.cache_read_input_tokens or 0}


def embed(*_, **__):
    raise NotConfigured("Anthropic has no embedding model")
