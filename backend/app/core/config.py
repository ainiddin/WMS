from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All settings come from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg://postgres@localhost:5432/keyfive_wms"

    JWT_SECRET: str = "change-me-in-env"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 60
    REFRESH_TOKEN_DAYS: int = 7
    BCRYPT_ROUNDS: int = 12

    # Brute-force protection (sliding window, see core/rate_limit.py). Login counts only failed attempts.
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_WINDOW_SECONDS: int = 15 * 60
    LOGIN_MAX_FAILS_PER_EMAIL: int = 5
    LOGIN_MAX_FAILS_PER_IP: int = 20
    SIGNUP_WINDOW_SECONDS: int = 60 * 60
    SIGNUP_MAX_PER_IP: int = 10
    SEND_CODE_MAX_PER_IP: int = 10  # emails with a sign-up code per IP per SIGNUP_WINDOW_SECONDS

    # First admin, created on startup if no ADMIN exists. The password must live only in .env.
    ADMIN_EMAIL: str = "Admin001@wms.kz"
    ADMIN_PASSWORD: str | None = None
    ADMIN_FULL_NAME: str = "System Administrator"

    # Password for all demo users created by `python -m app.seed --demo`.
    DEMO_PASSWORD: str | None = None

    # Sign-up email codes. Delivery: Brevo HTTP API if BREVO_API_KEY is set, else SMTP if SMTP_HOST is set,
    # else the code is only written to the server log (local development).
    EMAIL_CODE_MINUTES: int = 10
    EMAIL_CODE_RESEND_SECONDS: int = 60
    EMAIL_CODE_MAX_ATTEMPTS: int = 5
    EMAIL_FROM: str = "KeyFive WMS <no-reply@keyfive.kz>"
    BREVO_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Used to group dates into days/weeks/months for charts.
    APP_TIMEZONE: str = "Asia/Almaty"

    # Production: folder with the built React app (frontend/dist). FastAPI then serves the site and the API together.
    FRONTEND_DIST: str | None = None

    @field_validator("DATABASE_URL")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        """Hosting providers (Render, Heroku...) give postgres:// or postgresql:// URLs; SQLAlchemy needs the driver."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
