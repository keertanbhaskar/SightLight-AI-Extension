"""Small in-process sliding-window limiter for credential endpoints.

Limitation: state is per process. With several gunicorn workers/instances the effective limit is
N x configured; put a shared limiter (Redis / your reverse proxy) in front for strict guarantees.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

_hits: dict[str, deque[float]] = defaultdict(deque)
WINDOW_SECONDS = 60


def client_ip(request: Request) -> str:
    # Only trust X-Forwarded-For when running behind your own proxy (uvicorn --proxy-headers sets request.client).
    return request.client.host if request.client else "unknown"


async def limit_auth(request: Request) -> None:
    key = f"{request.url.path}:{client_ip(request)}"
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    if len(q) >= settings.RATE_LIMIT_AUTH_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait a minute.",
            headers={"Retry-After": str(WINDOW_SECONDS)},
        )
    q.append(now)


def reset() -> None:
    _hits.clear()
