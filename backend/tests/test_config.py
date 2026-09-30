import pytest

from app.core.config import Settings


def make(**kw):
    base = dict(DATABASE_URL="postgresql://u:p@h/db", JWT_SECRET="x" * 40)
    return Settings(_env_file=None, **{**base, **kw})


def test_comma_separated_cors_origins_parse():
    # Regression: the original List[str] field crashed startup on the project's own .env format
    s = make(CORS_ORIGINS="http://a.com, http://b.com/")
    assert s.cors_origins_list == ["http://a.com", "http://b.com"]


def test_database_url_gets_async_driver():
    assert make(DATABASE_URL="postgres://u:p@h/db").DATABASE_URL.startswith("postgresql+asyncpg://")
    assert make(DATABASE_URL="postgresql://u:p@h/db").DATABASE_URL.startswith("postgresql+asyncpg://")


def test_database_url_converts_sslmode_for_asyncpg():
    assert make(DATABASE_URL="postgres://u:p@h/db?sslmode=require").DATABASE_URL == (
        "postgresql+asyncpg://u:p@h/db?ssl=require"
    )
    assert make(DATABASE_URL="postgresql://u:p@h/db?sslmode=require&connect_timeout=10").DATABASE_URL == (
        "postgresql+asyncpg://u:p@h/db?ssl=require&connect_timeout=10"
    )


@pytest.mark.parametrize("secret", ["", "short", "change_me_to_a_secure_random_string", "dev_secret_change_in_production"])
def test_production_rejects_weak_secrets(secret):
    with pytest.raises(ValueError):
        make(ENVIRONMENT="production", JWT_SECRET=secret)


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValueError):
        make(ENVIRONMENT="production", CORS_ORIGINS="*")


def test_production_accepts_good_config():
    assert make(ENVIRONMENT="production", CORS_ORIGINS="https://app.example.com").is_production
