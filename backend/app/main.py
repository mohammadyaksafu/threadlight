"""ThreadLight API. OpenAPI docs at /api/docs.

    uvicorn backend.app.main:app --port 8000
"""

import time

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from backend.app.deps import LATENCY, REQUESTS, limiter
from backend.app.routers import auth, factories, review, system
from backend.config import settings

structlog.configure(processors=[structlog.processors.TimeStamper(fmt="iso"), structlog.processors.add_log_level,
                                structlog.processors.JSONRenderer()])

app = FastAPI(title="ThreadLight API", version="2.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
              description="Compliance evidence passport. Models read, rules decide, people approve. Synthetic data only.")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings().cors_origins.split(",") if o.strip()],
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def observe(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    route = getattr(request.scope.get("route"), "path", "unmatched")
    REQUESTS.labels(request.method, route, str(response.status_code)).inc()
    LATENCY.labels(route).observe(time.perf_counter() - t0)
    return response


for r in (auth.router, factories.router, review.router, system.router):
    app.include_router(r)
