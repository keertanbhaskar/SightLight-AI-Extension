from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_SECRETS = {"", "change_me_to_a_secure_random_string", "dev_secret_change_in_production", "secret", "changeme"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    APP_NAME: str = "SightLite API"
    ENVIRONMENT: Literal["development", "test", "production"] = "development"

    DATABASE_URL: str

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = Field(default=30, ge=1)
    JWT_REFRESH_EXPIRE_DAYS: int = Field(default=7, ge=1)

    # Plain string so `CORS_ORIGINS=http://a.com,http://b.com` in .env works.
    # (A List[str] field made pydantic-settings demand JSON and crashed the app on startup.)
    CORS_ORIGINS: str = "http://localhost:5173"

    # Comma-separated origins allowed to call the API from browser extensions, e.g. chrome-extension://<id>
    # Extensions send no cookies, so this is only needed if you keep credentials off (default).
    RATE_LIMIT_AUTH_PER_MINUTE: int = Field(default=10, ge=1)

    @field_validator("DATABASE_URL")
    @classmethod
    def _async_driver(cls, v: str) -> str:
        # Accept common PostgreSQL URLs from hosting providers.
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            # asyncpg uses `ssl`, while libpq URLs use `sslmode`.
            v = v.replace("sslmode=", "ssl=")
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    @model_validator(mode="after")
    def _production_guards(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if self.JWT_SECRET in _INSECURE_SECRETS or len(self.JWT_SECRET) < 32:
                raise ValueError("JWT_SECRET must be a random string of at least 32 characters in production")
            if "*" in self.cors_origins_list:
                raise ValueError("CORS_ORIGINS must not contain '*' in production")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
