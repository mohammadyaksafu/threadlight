"""Shared request dependencies: tenant-scoped transactions, rate limiting, metrics."""

from fastapi import HTTPException, Request
from prometheus_client import Counter, Histogram
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.app.auth import decode
from backend.db.session import one


def rate_key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            return "user:%d" % decode(auth[7:]).id
        except HTTPException:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=rate_key, default_limits=["60/minute"])

REQUESTS = Counter("tl_http_requests_total", "HTTP requests", ["method", "route", "status"])
LATENCY = Histogram("tl_http_request_seconds", "HTTP request latency", ["route"])
UPLOADS = Counter("tl_uploads_total", "Documents uploaded", ["result"])


def factory_or_404(conn, factory_id: int) -> dict:
    f = one(conn, "SELECT * FROM factories WHERE id = :id", id=factory_id)
    if not f:  # also what another tenant's factory looks like under RLS
        raise HTTPException(404, "Factory not found")
    return f
