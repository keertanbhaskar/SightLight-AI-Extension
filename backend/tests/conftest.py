import os

# Must be set before the app is imported
os.environ.update(
    DATABASE_URL="sqlite+aiosqlite://",
    JWT_SECRET="test-secret-test-secret-test-secret-123456",
    ENVIRONMENT="test",
    CORS_ORIGINS="http://localhost:5173,http://localhost:3000",
    RATE_LIMIT_AUTH_PER_MINUTE="1000",
)

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import rate_limit  # noqa: E402
from app.core.database import Base, get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app import models  # noqa: E402,F401  (register tables)


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    async def override_get_db():
        async with Session() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    fastapi_app.dependency_overrides[get_db] = override_get_db
    rate_limit.reset()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()
    await engine.dispose()


async def register(client, email="a@example.com", password="correct-horse-1", name="Alice"):
    r = await client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def auth(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}
