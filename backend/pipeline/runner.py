"""Start and resume pipeline jobs. The arq worker calls these; with INLINE_JOBS=true the API does."""

from functools import lru_cache

import structlog
from langgraph.types import Command

from backend.config import settings
from backend.db.session import tenant_tx
from backend.pipeline.graph import build

log = structlog.get_logger()
_memory = None


@lru_cache
def _postgres_saver():
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    # Checkpoint tables hold pipeline state only (no tenant rows), so they live outside RLS and use the
    # owner connection; tenant data is always written through tenant_tx.
    pool = ConnectionPool(settings().admin_database_url, max_size=4, kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row})
    saver = PostgresSaver(pool)
    saver.setup()
    return saver


def checkpointer():
    global _memory
    if settings().inline_jobs:
        from langgraph.checkpoint.memory import InMemorySaver

        _memory = _memory or InMemorySaver()
        return _memory
    return _postgres_saver()


@lru_cache
def graph():
    return build(checkpointer())


def _config(job_id: str) -> dict:
    return {"configurable": {"thread_id": job_id}}


def _fail(job_id: str, tenant_id: int, error: Exception):
    log.exception("pipeline_failed", job_id=job_id)
    with tenant_tx(tenant_id) as c:
        c.exec_driver_sql("UPDATE jobs SET state = 'failed', error = %s, updated_at = now() WHERE id = %s", (str(error)[:2000], job_id))
        c.exec_driver_sql("""UPDATE documents SET status = 'failed' WHERE id = (SELECT document_id FROM jobs WHERE id = %s)
                             AND status = 'processing'""", (job_id,))


def start(job_id: str, tenant_id: int, factory_id: int, document_id: int):
    try:
        graph().invoke({"job_id": job_id, "tenant_id": tenant_id, "factory_id": factory_id, "document_id": document_id}, _config(job_id))
    except Exception as e:
        _fail(job_id, tenant_id, e)


def resume(job_id: str, tenant_id: int, value: dict):
    try:
        graph().invoke(Command(resume=value), _config(job_id))
    except Exception as e:
        _fail(job_id, tenant_id, e)


def pending_interrupt(job_id: str) -> dict | None:
    snap = graph().get_state(_config(job_id))
    for task in snap.tasks:
        for it in task.interrupts:
            return it.value
    return None
