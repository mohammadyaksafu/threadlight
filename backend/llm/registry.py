"""Versioned prompt registry: backend/prompts/<id>_v<n>.yaml, rendered with Jinja.

The newest version of each prompt is used unless PROMPT_<ID>=<version> pins one. Rendering keeps a stable
prefix (system instruction, then few-shot turns) and puts the variable part last, which is what lets the
provider's prompt cache reuse the prefix across calls.
"""

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml
from jinja2 import Environment, StrictUndefined

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"
FEWSHOT = Path(__file__).resolve().parents[2] / "evals" / "datasets" / "fewshot.jsonl"
_env = Environment(undefined=StrictUndefined, trim_blocks=False, lstrip_blocks=False, autoescape=False)


@dataclass(frozen=True)
class Prompt:
    id: str
    version: str
    system: str
    few_shot: tuple
    template: str
    schema: dict | None


@dataclass(frozen=True)
class Rendered:
    version: str
    system: str
    turns: list
    schema: dict | None


def _vnum(path: Path) -> int:
    m = re.search(r"_v(\d+)\.yaml$", path.name)
    return int(m.group(1)) if m else 0


@lru_cache
def load(prompt_id: str, version: str | None = None) -> Prompt:
    version = version or os.environ.get("PROMPT_" + prompt_id.upper())
    if version:
        path = PROMPTS / (version + ".yaml")
    else:
        candidates = sorted(PROMPTS.glob(prompt_id + "_v*.yaml"), key=_vnum)
        if not candidates:
            raise FileNotFoundError("No prompt %s in %s" % (prompt_id, PROMPTS))
        path = candidates[-1]
    y = yaml.safe_load(path.read_text(encoding="utf-8"))
    return Prompt(y["id"], y["version"], y["system"], tuple(y.get("few_shot") or ()), y["template"], y.get("schema"))


@lru_cache
def _labelled_examples() -> tuple:
    if not FEWSHOT.exists():
        return ()
    return tuple(json.loads(line) for line in FEWSHOT.read_text(encoding="utf-8").splitlines() if line.strip())


def few_shot_for(prompt: Prompt, type_hint: str | None, k: int = 3) -> list:
    """Up to k examples from the labelled set with the predicted type, else the prompt's static examples."""
    if type_hint:
        same = [e for e in _labelled_examples() if e.get("type") == type_hint and e.get("prompt") == prompt.id]
        if same:
            return [{"input": e["input"], "output": e["output"]} for e in same[:k]]
    return list(prompt.few_shot)[:k]


def render(prompt: Prompt, variables: dict, type_hint: str | None = None) -> Rendered:
    system = _env.from_string(prompt.system).render(**variables)
    turns = []
    for ex in few_shot_for(prompt, type_hint):
        turns.append({"role": "user", "text": ex["input"]})
        out = ex["output"]
        turns.append({"role": "model", "text": out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)})
    turns.append({"role": "user", "text": _env.from_string(prompt.template).render(**variables)})
    return Rendered(prompt.version, system, turns, prompt.schema)
