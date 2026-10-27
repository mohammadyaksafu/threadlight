"""Database access. SQLAlchemy 2 Core over psycopg 3.

The app connects as `tl_app`, which has no BYPASSRLS: every query runs inside `tenant_tx`, which sets
`app.tenant_id` for the transaction, so Postgres row-level security filters every table.
`admin_tx` (table owner) is only for migrations, seeding and offline evals.
"""

import json
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from backend.config import settings


def sa_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


@lru_cache
def app_engine() -> Engine:
    return create_engine(sa_url(settings().database_url), pool_pre_ping=True, pool_size=10, max_overflow=10)


@lru_cache
def admin_engine() -> Engine:
    return create_engine(sa_url(settings().admin_database_url), pool_pre_ping=True, pool_size=2)


@contextmanager
def tenant_tx(tenant_id: int):
    with app_engine().begin() as conn:
        conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(int(tenant_id))})
        yield conn


@contextmanager
def admin_tx():
    with admin_engine().begin() as conn:
        yield conn


@contextmanager
def anon_tx():
    """No tenant set: RLS hides every tenant row. Used for sign-in (via tl_auth_user) only."""
    with app_engine().begin() as conn:
        yield conn


def rows(conn: Connection, sql: str, **params) -> list[dict]:
    return [dict(r._mapping) for r in conn.execute(text(sql), params)]


def one(conn: Connection, sql: str, **params) -> dict | None:
    r = conn.execute(text(sql), params).first()
    return dict(r._mapping) if r else None


def scalar(conn: Connection, sql: str, **params):
    return conn.execute(text(sql), params).scalar()


def js(value) -> str:
    """JSON-encode a value for a jsonb parameter (`CAST(:x AS jsonb)`)."""
    return json.dumps(value, ensure_ascii=False, default=str)


def audit(conn: Connection, tenant_id: int, actor: str, action: str, target: str | None = None, payload=None):
    conn.execute(
        text("INSERT INTO audit_log (tenant_id, actor, action, target, payload) VALUES (:t, :a, :ac, :tg, CAST(:p AS jsonb))"),
        {"t": tenant_id, "a": actor, "ac": action, "tg": target, "p": js(payload or {})},
    )
