from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

router = APIRouter(prefix="/health", tags=["Health"])


class Health(BaseModel):
    status: str
    environment: str
    version: str = "1.1.0"


@router.get("", response_model=Health)
async def liveness():
    """Process is up. Used by container liveness probes; does not touch the database."""
    return Health(status="ok", environment=settings.ENVIRONMENT)


@router.get("/ready", response_model=Health)
async def readiness(db: AsyncSession = Depends(get_db)):
    """Ready to serve traffic (database reachable). Returns 503 otherwise so orchestrators stop routing."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        # Do not leak driver/connection details to the caller.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable") from None
    return Health(status="ready", environment=settings.ENVIRONMENT)


class DatabaseHealth(BaseModel):
    status: str
    connected: bool
    message: str


@router.get("/database", response_model=DatabaseHealth)
async def database(db: AsyncSession = Depends(get_db)):
    """Shape consumed by the dashboard's status widget. Unreachable DB -> 503 with a generic message."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable") from None
    return DatabaseHealth(status="healthy", connected=True, message="Database connection is healthy")
