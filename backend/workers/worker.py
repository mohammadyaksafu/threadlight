"""arq worker: runs pipeline jobs from the Redis queue.

    arq backend.workers.worker.WorkerSettings
"""

import asyncio

from arq.connections import RedisSettings

from backend.config import settings
from backend.pipeline import runner


async def run_job(ctx, job_id: str, tenant_id: int, factory_id: int, document_id: int):
    await asyncio.to_thread(runner.start, job_id, tenant_id, factory_id, document_id)


async def resume_job(ctx, job_id: str, tenant_id: int, value: dict):
    await asyncio.to_thread(runner.resume, job_id, tenant_id, value)


async def nightly_reindex(ctx):
    """Placeholder hook for scheduled maintenance; scheduling itself is done by n8n."""
    return "ok"


class WorkerSettings:
    functions = [run_job, resume_job, nightly_reindex]
    redis_settings = RedisSettings.from_dsn(settings().redis_url)
    max_jobs = 2
    job_timeout = 1800
