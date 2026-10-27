"""Test setup: a separate `threadlight_test` database, the fake LLM (no network), inline jobs.

Needs Postgres with pgvector reachable at TEST_PG (default: the local test container on :5434):
    docker run -d --name tl-test-pg -e POSTGRES_PASSWORD=postgres -p 5434:5432 pgvector/pgvector:pg16
"""

import os
import tempfile

PG = os.environ.get("TEST_PG", "localhost:5434")
os.environ.update({
    "DATABASE_URL": "postgresql://tl_app:tl_app@%s/threadlight_test" % PG,
    "ADMIN_DATABASE_URL": "postgresql://postgres:postgres@%s/threadlight_test" % PG,
    "LLM_MODE": "fake", "INLINE_JOBS": "true", "RERANKER": "off", "PRESIDIO_URL": "", "S3_ENDPOINT": "",
    "LOCAL_STORAGE_DIR": tempfile.mkdtemp(prefix="tl-files-"), "JWT_SECRET": "test-secret-for-pytest-only-0123456789abcdef", "QUERY_REWRITE": "true",
    "REDIS_URL": os.environ.get("TEST_REDIS", "redis://localhost:6381/15"), "GEMINI_API_KEY": "", "LANGFUSE_HOST": "",
})

import psycopg  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def _create_db():
    with psycopg.connect("postgresql://postgres:postgres@%s/postgres" % PG, autocommit=True) as c:
        c.execute("DROP DATABASE IF EXISTS threadlight_test WITH (FORCE)")
        c.execute("CREATE DATABASE threadlight_test")


@pytest.fixture(scope="session", autouse=True)
def database():
    _create_db()
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("backend/alembic.ini"), "head")
    yield


@pytest.fixture()
def seeded(database):
    from backend.db.seed import main

    main(["--reset"])


@pytest.fixture()
def seeded_empty(database):
    from backend.db.seed import main

    main(["--reset", "--no-docs"])


@pytest.fixture(scope="session")
def client():
    from backend.app.main import app

    return TestClient(app)


def login(client, email="officer@threadlight.demo", password="Officer-Demo-2026"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}
