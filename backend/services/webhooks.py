"""Outbound webhooks, HMAC-SHA256 signed (header X-ThreadLight-Signature: sha256=<hex>)."""

import hashlib
import hmac
import json
import threading

import httpx
import structlog

from backend.db.session import rows

log = structlog.get_logger()


def sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _post(url: str, secret: str, body: bytes):
    try:
        httpx.post(url, content=body, timeout=5, headers={"Content-Type": "application/json", "X-ThreadLight-Signature": sign(secret, body)})
    except Exception as e:
        log.warning("webhook_failed", url=url, error=str(e))


def fire(conn, tenant_id: int, event: str, payload: dict):
    hooks = rows(conn, "SELECT url, secret, events FROM webhooks")
    body = json.dumps({"event": event, "tenant_id": tenant_id, "data": payload}, default=str).encode()
    for h in hooks:
        if not h["events"] or event in h["events"]:
            threading.Thread(target=_post, args=(h["url"], h["secret"], body), daemon=True).start()
