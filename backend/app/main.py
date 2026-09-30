import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import analytics, auth, executions, health, tasks
from app.api import settings as settings_api
from app.core.config import settings
from app.core.database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("sightlite")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Schema is managed exclusively by Alembic (`alembic upgrade head`); never create_all() here.
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.1.0",
    description="Backend for the SightLite browser agent: task history and analytics.",
    lifespan=lifespan,
    # Interactive docs are useful in dev, but do not expose them in production by default.
    docs_url=None if settings.is_production else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Auth uses bearer tokens in headers, not cookies, so credentialed CORS is unnecessary.
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    if not request.url.path.endswith("/health"):
        log.info("%s %s -> %s %.0fms rid=%s", request.method, request.url.path, response.status_code,
                 (time.perf_counter() - start) * 1000, rid)
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


for r in (auth.router, tasks.router, executions.router, analytics.router, settings_api.router, health.router):
    app.include_router(r, prefix="/api")


@app.get("/", include_in_schema=False)
async def root():
    return {"name": settings.APP_NAME, "version": app.version, "health": "/api/health"}
