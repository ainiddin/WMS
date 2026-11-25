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

    # Admin two-factor sign in (always on). The code goes ONLY to this one corporate mailbox, agreed in advance
    # (Admin and CEO). Without it no Admin can sign in.
    ADMIN_2FA_EMAIL: str | None = None
    # Demo channel: when BOTH are set, Admin codes go to this Telegram chat instead of ADMIN_2FA_EMAIL.
    # Token from BotFather. Only from the environment, never in code or logs.
    TG_BOT_TOKEN: str | None = None
    TG_OWNER_CHAT_ID: str | None = None
    TWO_FACTOR_CODE_SECONDS: int = 6 * 60       # a code lives 6 minutes
    TWO_FACTOR_MAX_ATTEMPTS: int = 5            # wrong codes before a new code is sent automatically
    TWO_FACTOR_RESEND_SECONDS: int = 60         # the "Send again" button: once a minute
    TWO_FACTOR_MAX_CODES: int = 3               # codes per account per window (sign in + auto + resend)
    TWO_FACTOR_WINDOW_SECONDS: int = 15 * 60
    ADMIN_WEB_SESSION_HOURS: int = 4            # website session of an Admin or Manager; then sign in again
    # Website sign in approved on the phone (Steam Guard style).
    WEB_LOGIN_SECONDS: int = 120                # the phone must answer within 2 minutes
    WEB_LOGIN_MAX_REQUESTS: int = 5             # unfinished website sign ins per account per window
    WEB_LOGIN_WINDOW_SECONDS: int = 15 * 60
    ADMIN_PASSWORD_MAX_DAYS: int = 180          # an Admin must change the password this often

    # Staff join only by invitation from a Manager.
    INVITATION_LINK_MINUTES: int = 60           # an invitation link lives 1 hour and works once

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

    # Top-ups go through CardPay Fake (app/fakepay): a pretend gateway, no real money. FAKEPAY_SECRET signs the
    # payment links and webhooks (shop <-> gateway); without it top-ups are off (503).
    FAKEPAY_SECRET: str | None = None
    FAKEPAY_WEBHOOK_URL: str | None = None      # default: this server on its own port
    FAKEPAY_EVENT_MAX_AGE_SECONDS: int = 300    # older webhooks are refused (replays)
    PAYMENT_MIN: int = 100                      # KZT per top-up
    PAYMENT_MAX: int = 300_000                  # KZT per top-up
    PAYMENT_DAILY_MAX: int = 1_000_000          # KZT per customer per calendar day (APP_TIMEZONE)
    PAYMENT_LINK_MINUTES: int = 15              # a payment link not paid in time expires

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
