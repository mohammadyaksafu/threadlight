"""Enqueue pipeline work: on the arq worker normally, in a background thread when INLINE_JOBS=true."""

import threading

from backend.config import settings
from backend.pipeline import runner


def _inline(fn, *args, wait: bool):
    if wait:
        fn(*args)
    else:
        threading.Thread(target=fn, args=args, daemon=True).start()


async def enqueue_start(job_id: str, tenant_id: int, factory_id: int, document_id: int, wait: bool = False):
    if settings().inline_jobs:
        _inline(runner.start, job_id, tenant_id, factory_id, document_id, wait=wait)
        return
    from arq import create_pool
    from arq.connections import RedisSettings

    pool = await create_pool(RedisSettings.from_dsn(settings().redis_url))
    await pool.enqueue_job("run_job", job_id, tenant_id, factory_id, document_id)


async def enqueue_resume(job_id: str, tenant_id: int, value: dict, wait: bool = False):
    if settings().inline_jobs:
        _inline(runner.resume, job_id, tenant_id, value, wait=wait)
        return
    from arq import create_pool
    from arq.connections import RedisSettings

    pool = await create_pool(RedisSettings.from_dsn(settings().redis_url))
    await pool.enqueue_job("resume_job", job_id, tenant_id, value)
