"""Health, metrics, webhooks registration and the live status/eval data shown on the /docs page."""

import json
import secrets
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, HttpUrl

from backend.app.auth import User, officer, viewer
from backend.config import settings
from backend.db.session import anon_tx, audit, rows, scalar, tenant_tx
from backend.llm.router import catalogue
from backend.services import storage

router = APIRouter(prefix="/api", tags=["system"])
REPORTS = Path(__file__).resolve().parents[3] / "evals" / "reports"


def _check(fn) -> str:
    try:
        return "up" if fn() else "down"
    except Exception:
        return "down"


def _db():
    with anon_tx() as c:
        return scalar(c, "SELECT 1") == 1


def _redis():
    import redis

    return redis.Redis.from_url(settings().redis_url, socket_timeout=2).ping()


def _ollama():
    return httpx.get(settings().ollama_url + "/api/tags", timeout=3).status_code == 200


def _presidio():
    return bool(settings().presidio_url) and httpx.get(settings().presidio_url.rstrip("/") + "/health", timeout=3).status_code == 200


@router.get("/health")
def health():
    services = {"postgres": _check(_db), "redis": _check(_redis), "storage": _check(storage.healthy),
                "ollama": _check(_ollama), "presidio": _check(_presidio),
                "gemini": "configured" if settings().gemini_api_key else "not configured"}
    return {"status": "ok" if services["postgres"] == "up" else "degraded", "services": services,
            "llm_mode": settings().llm_mode, "private_mode": settings().private_mode}


@router.get("/metrics", include_in_schema=False)
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


class Hook(BaseModel):
    url: HttpUrl
    events: list[str] = []


@router.post("/webhooks", status_code=201)
def register_webhook(body: Hook, user: User = Depends(officer)):
    secret = secrets.token_hex(24)
    with tenant_tx(user.tenant_id) as c:
        hid = scalar(c, "INSERT INTO webhooks (tenant_id, url, secret, events) VALUES (:t, :u, :s, CAST(:e AS jsonb)) RETURNING id",
                     t=user.tenant_id, u=str(body.url), s=secret, e=json.dumps(body.events))
        audit(c, user.tenant_id, user.actor, "webhook_registered", "webhook:%d" % hid, {"url": str(body.url)})
    return {"id": hid, "secret": secret, "signature_header": "X-ThreadLight-Signature"}


@router.get("/system/usage")
def usage(user: User = Depends(viewer)):
    """Token, cache and cost totals per task and model for this tenant (from llm_calls)."""
    with tenant_tx(user.tenant_id) as c:
        return rows(c, """SELECT purpose, provider, model, count(*) AS calls, sum(input_tokens) AS input_tokens,
                                 sum(output_tokens) AS output_tokens, sum(cached_tokens) AS cached_tokens,
                                 sum(CASE WHEN cache_hit THEN 1 ELSE 0 END) AS response_cache_hits,
                                 round(avg(latency_ms)) AS avg_latency_ms, sum(cost_usd)::float AS cost_usd
                          FROM llm_calls GROUP BY purpose, provider, model ORDER BY purpose, calls DESC""")


@router.get("/system/evals")
def evals():
    """Latest committed evaluation report (markdown + summary JSON written by evals/run_all.py)."""
    if not REPORTS.exists():
        return {"report": None}
    files = sorted(REPORTS.glob("????-??-??.json"))
    if not files:
        return {"report": None}
    return {"report": json.loads(files[-1].read_text(encoding="utf-8")), "file": files[-1].name}


@router.get("/system/models")
def models():
    c = catalogue()
    return {"routes": c["routes"], "private_routes": c["private_routes"],
            "models": {k: {"provider": v["provider"], "name": v["name"]} for k, v in c["models"].items()}}
