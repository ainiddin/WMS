"""Sends signed webhooks from CardPay Fake to the shop, over HTTP like a real gateway would."""

import logging
import os

import httpx

from app.core.config import settings

log = logging.getLogger("keyfive")


def webhook_url() -> str:
    """FAKEPAY_WEBHOOK_URL, or this same server on its own port (Render sets PORT)."""
    if settings.FAKEPAY_WEBHOOK_URL:
        return settings.FAKEPAY_WEBHOOK_URL
    return f"http://127.0.0.1:{os.environ.get('PORT', '8000')}/api/payments/fakepay/webhook/"


def deliver(body: bytes, signature: str) -> bool:
    """True if the shop accepted the event (2xx). Nothing about the card is in the body or in the log."""
    try:
        r = httpx.post(webhook_url(), content=body, timeout=10,
                       headers={"Content-Type": "application/json", "FakePay-Signature": signature})
    except httpx.HTTPError as exc:
        log.error("CardPay Fake: the shop is not reachable (%s)", type(exc).__name__)
        return False
    if not r.is_success:
        log.error("CardPay Fake: the shop answered %s to the webhook", r.status_code)
    return r.is_success
