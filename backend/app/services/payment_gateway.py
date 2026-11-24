"""The shop's adapter to the card gateway (now CardPay Fake). The only module that knows the gateway's formats.

A real gateway later = a new module with the same three functions; payment_service does not change.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode

from app.core.config import settings
from app.fakepay import signing
from app.fakepay.signing import SignatureError

CURRENCY = "KZT"
NAME = "CardPay Fake"

__all__ = ["CURRENCY", "NAME", "Event", "SignatureError", "checkout_url", "configured", "read_event"]


@dataclass(frozen=True)
class Event:
    """What the gateway says happened to a payment."""

    id: str
    kind: str  # "payment.succeeded" | "payment.cancelled"
    reference: str
    amount: Decimal
    currency: str
    card_brand: str | None
    card_last4: str | None


def configured() -> bool:
    return bool(settings.FAKEPAY_SECRET)


def checkout_url(reference: str, amount: Decimal, return_path: str, expires_at: datetime) -> str:
    """The gateway's payment page for this payment. Signed: the amount and reference cannot be changed in the URL."""
    params = {"ref": reference, "amount": f"{amount:.2f}", "currency": CURRENCY, "back": return_path,
              "expires": int(expires_at.timestamp())}
    params["sig"] = signing.sign_link(settings.FAKEPAY_SECRET, params["ref"], params["amount"], CURRENCY,
                                      return_path, params["expires"])
    return "/fakepay/checkout?" + urlencode(params)


def read_event(body: bytes, signature: str | None, now: float | None = None) -> Event:
    """The webhook, only if the gateway really signed it and it is fresh. SignatureError / ValueError otherwise."""
    signing.verify_event(settings.FAKEPAY_SECRET, body, signature, settings.FAKEPAY_EVENT_MAX_AGE_SECONDS, now)
    try:
        raw = json.loads(body)
        data = raw["data"]
        card = data.get("card") or {}
        return Event(id=str(raw["id"])[:40], kind=str(raw["type"]), reference=str(data["reference"]),
                     amount=Decimal(str(data["amount"])), currency=str(data["currency"]),
                     card_brand=card.get("brand"), card_last4=card.get("last4"))
    except (ValueError, KeyError, TypeError, InvalidOperation, AttributeError):
        raise ValueError("Malformed webhook") from None
