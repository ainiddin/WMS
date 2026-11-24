"""Signatures between the shop and CardPay Fake (HMAC-SHA256 with FAKEPAY_SECRET).

This is what a gateway's SDK gives a merchant: the gateway signs, the merchant verifies, and the other way round.
- payment link: the shop signs reference, amount, currency, return path and expiry, so nobody can change the
  amount or the reference in the URL;
- webhook: the gateway signs `<timestamp>.<body>` and sends `FakePay-Signature: t=<timestamp>,v1=<hex>`.
"""

import hashlib
import hmac
import time

SIGNATURE_HEADER = "FakePay-Signature"


class SignatureError(Exception):
    """The signature is missing, wrong or too old. The message is safe to show and log."""


def _mac(secret: str, message: str) -> str:
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def _link_message(reference: str, amount: str, currency: str, return_path: str, expires: int) -> str:
    return "|".join((reference, amount, currency, return_path, str(expires)))


def sign_link(secret: str, reference: str, amount: str, currency: str, return_path: str, expires: int) -> str:
    return _mac(secret, _link_message(reference, amount, currency, return_path, expires))


def verify_link(secret: str, reference: str, amount: str, currency: str, return_path: str, expires: int,
                signature: str, now: float | None = None) -> None:
    expected = sign_link(secret, reference, amount, currency, return_path, expires)
    if not hmac.compare_digest(expected, signature or ""):
        raise SignatureError("This payment link is not valid")
    if (now if now is not None else time.time()) > expires:
        raise SignatureError("This payment link has expired. Go back to the shop and start again.")


def sign_event(secret: str, body: bytes, timestamp: int | None = None) -> str:
    """Value of the signature header for a webhook body."""
    t = int(time.time()) if timestamp is None else timestamp
    return f"t={t},v1={_mac(secret, f'{t}.{body.decode()}')}"


def verify_event(secret: str, body: bytes, header: str | None, max_age_seconds: int,
                 now: float | None = None) -> None:
    """Raises SignatureError unless the header signs exactly this body and is fresh (no replays of old events)."""
    parts = dict(p.split("=", 1) for p in (header or "").split(",") if "=" in p)
    try:
        t = int(parts["t"])
        given = parts["v1"]
    except (KeyError, ValueError):
        raise SignatureError("No webhook signature") from None
    if not hmac.compare_digest(_mac(secret, f"{t}.{body.decode(errors='replace')}"), given):
        raise SignatureError("Wrong webhook signature")
    if abs((now if now is not None else time.time()) - t) > max_age_seconds:
        raise SignatureError("The webhook is too old")
