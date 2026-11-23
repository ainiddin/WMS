"""Telegram bot that only sends messages to one chat (the system owner). Demo channel for Admin sign in codes.

The token and the chat id come only from the environment: TG_BOT_TOKEN (from BotFather), TG_OWNER_CHAT_ID.
The bot does not read updates and answers no commands.
"""

import logging

import httpx

from app.core.config import settings

log = logging.getLogger("keyfive")
# httpx logs every request URL at INFO, and the bot token is part of the URL.
logging.getLogger("httpx").setLevel(logging.WARNING)

API = "https://api.telegram.org"


class TelegramError(Exception):
    """Sending failed. The message never contains the token or the URL, so it is safe to log."""


def is_configured() -> bool:
    return bool(settings.TG_BOT_TOKEN and settings.TG_OWNER_CHAT_ID)


def is_half_configured() -> bool:
    """Only one of the two variables is set: almost certainly a mistake in the environment."""
    return bool(settings.TG_BOT_TOKEN) != bool(settings.TG_OWNER_CHAT_ID)


def send_to_owner(text: str) -> None:
    """Plain text, no Markdown: names from the database must not break the formatting."""
    try:
        r = httpx.post(
            f"{API}/bot{settings.TG_BOT_TOKEN}/sendMessage",
            json={"chat_id": settings.TG_OWNER_CHAT_ID, "text": text, "disable_web_page_preview": True},
            timeout=15,
        )
    except httpx.HTTPError as exc:  # timeouts, DNS, refused connections; str(exc) may contain the URL
        raise TelegramError(f"Telegram is not reachable ({type(exc).__name__})") from None
    if r.status_code != 200 or not _ok(r):
        raise TelegramError(f"Telegram answered {r.status_code}")


def _ok(r: httpx.Response) -> bool:
    try:
        return r.json().get("ok") is True
    except ValueError:
        return False
