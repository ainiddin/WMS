"""CardPay Fake endpoints: the payment page and what it calls. Not part of the shop API (/api)."""

import json
import secrets
import time
from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.fakepay import cards, delivery, page, signing

router = APIRouter(prefix="/fakepay", tags=["CardPay Fake (demo gateway)"], include_in_schema=False)


class Link(BaseModel):
    """The signed payment link as it came from the shop."""

    ref: str = Field(min_length=1, max_length=40)
    amount: str = Field(min_length=1, max_length=20)
    currency: str = Field(min_length=3, max_length=3)
    back: str = Field(min_length=1, max_length=200)
    expires: int
    sig: str = Field(min_length=1, max_length=100)


class CardForm(Link):
    holder: str = Field(max_length=100)
    number: str = Field(max_length=40)
    exp_month: int
    exp_year: int
    cvc: str = Field(max_length=4)


def _safe_back(path: str) -> bool:
    """Only a path on the same site: no other site to redirect to."""
    return path.startswith("/") and not path.startswith("//") and "\\" not in path


def _check(link: Link) -> None:
    if not settings.FAKEPAY_SECRET:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "CardPay Fake is not configured")
    try:
        signing.verify_link(settings.FAKEPAY_SECRET, link.ref, link.amount, link.currency, link.back, link.expires,
                            link.sig)
    except signing.SignatureError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    if not _safe_back(link.back):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This payment link is not valid")


def make_event(reference: str, amount: str, currency: str, kind: str, card: dict | None = None,
               at: int | None = None) -> tuple[bytes, str]:
    """A webhook body and its signature header. The card part has only the brand and the last 4 digits."""
    created = int(time.time()) if at is None else at
    body = json.dumps({
        "id": "evt_" + secrets.token_hex(8), "type": kind, "created": created,
        "data": {"reference": reference, "amount": amount, "currency": currency, "card": card},
    }, separators=(",", ":")).encode()
    return body, signing.sign_event(settings.FAKEPAY_SECRET, body, created)


def _notify(link: Link, kind: str, card: dict | None = None) -> None:
    if not delivery.deliver(*make_event(link.ref, link.amount, link.currency, kind, card)):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            "The shop did not confirm the payment. Nothing was charged, try again.")


@router.get("/checkout", response_class=HTMLResponse)
def checkout(ref: str = Query(max_length=40), amount: str = Query(max_length=20),
             currency: str = Query(max_length=3), back: str = Query(max_length=200), expires: int = 0,
             sig: str = Query(max_length=100)):
    link = Link(ref=ref, amount=amount, currency=currency, back=back, expires=expires, sig=sig)
    try:
        _check(link)
    except HTTPException as exc:
        return HTMLResponse(page.error(exc.detail), status_code=exc.status_code)
    return HTMLResponse(page.checkout(link.model_dump()))


@router.post("/api/pay")
def pay(form: CardForm):
    """Charge the (fake) card. Errors are shown on the page; the customer may try another card."""
    _check(form)
    number = cards.digits(form.number)
    errors = cards.problems(form.holder, number, form.exp_month, form.exp_year, form.cvc, date.today())
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, errors)
    reason = cards.decline_reason(number)
    if reason:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, reason)
    _notify(form, "payment.succeeded", {"brand": cards.brand(number), "last4": number[-4:]})
    return {"redirect": form.back}


@router.post("/api/cancel")
def cancel(link: Link):
    """The customer gave up: the shop is told, the payment is closed there."""
    _check(link)
    _notify(link, "payment.cancelled")
    return {"redirect": link.back}
