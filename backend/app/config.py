"""
Krishi-Saarthi Backend Configuration
Pydantic Settings for all environment variables
"""
import secrets

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    # ─── Application ───
    APP_NAME: str = "Krishi-Saarthi API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # ─── Database ───
    # Default to SQLite for local development/testing so the app runs out of the box.
    # Override via environment variables for Postgres in production or staging.
    DATABASE_URL: str = "sqlite+aiosqlite:///./app.db"
    DATABASE_URL_SYNC: str = "sqlite:///./app.db"

    # ─── Redis ───
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── Security ───
    # A deployment should set SECRET_KEY explicitly.  A random local fallback
    # avoids shipping a known key while keeping first-run development simple.
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # ─── External APIs ───
    IMD_API_KEY: str = ""
    IMD_API_URL: str = "https://api.imd.gov.in/v1"
    AGMARKNET_API_KEY: str = ""
    AGMARKNET_API_URL: str = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
    OGD_API_KEY: str = ""

    # ─── AI & Basemaps (Protected Free-Tier Quota Guards) ───
    GEMINI_API_KEY: str = ""
    GEMINI_RATE_LIMIT_PER_HOUR: int = 15
    CARTO_API_KEY: str = ""
    CARTO_RATE_LIMIT_PER_HOUR: int = 15

    # ─── USSD ───
    USSD_SHORT_CODE: str = "*123#"
    USSD_GATEWAY_URL: str = ""

    # ─── MinIO (S3-compatible) ───
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET: str = "krishi-saarthi"
    MINIO_USE_SSL: bool = False

    # ─── Kriging ───
    KRIGING_GRID_SIZE: int = 100
    KRIGING_PREDICTION_HOURS: int = 72

    # ─── Celery ───
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ─── CORS ───
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug_value(cls, value: object) -> object:
        # Some hosting control panels expose an environment name instead of a
        # boolean. Treat their common production names as DEBUG=false.
        if isinstance(value, str) and value.strip().lower() in {"release", "production", "prod"}:
            return False
        return value


@lru_cache()
def get_settings() -> Settings:
    cfg = Settings()
    return cfg


settings = get_settings()
