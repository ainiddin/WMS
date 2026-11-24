"""Top-ups by card: limits, the payment link, and the gateway's webhook that really moves the money.

Rules:
- one top-up is PAYMENT_MIN ... PAYMENT_MAX KZT;
- per customer at most PAYMENT_DAILY_MAX KZT a calendar day (APP_TIMEZONE), counting paid top-ups and links
  that are still open; the balance stays under account_service.MAX_BALANCE;
- a link lives PAYMENT_LINK_MINUTES, then the payment is EXPIRED;
- money is credited only by the gateway's signed, fresh webhook, once per payment; the return to the site
  proves nothing. Repeated webhooks change nothing.
Functions change the session but do not commit; the router commits once.
"""

import logging
from datetime import datetime, time, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Customer, Payment, PaymentStatus
from app.models.common import utcnow
from app.services import account_service, payment_gateway
from app.services.timeutil import local_tz

log = logging.getLogger("keyfive")

RETURN_PATH = "/account"


def _kzt(amount: Decimal | int) -> str:
    return f"{amount:,.0f}".replace(",", " ")


def _day_start(now: datetime) -> datetime:
    return datetime.combine(now.astimezone(local_tz()).date(), time(), local_tz())


def expire_old(db: Session, account_id: int, now: datetime) -> None:
    """Links nobody paid in time stop counting and can no longer be paid."""
    db.execute(update(Payment)
               .where(Payment.account_id == account_id, Payment.status == PaymentStatus.PENDING,
                      Payment.expires_at <= now)
               .values(status=PaymentStatus.EXPIRED, completed_at=now, failure_reason="The link expired"))


def _taken_today(db: Session, account_id: int, now: datetime) -> Decimal:
    return db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.account_id == account_id, Payment.created_at >= _day_start(now),
        Payment.status.in_((PaymentStatus.SUCCEEDED, PaymentStatus.PENDING))))


def _open_amount(db: Session, account_id: int) -> Decimal:
    return db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.account_id == account_id, Payment.status == PaymentStatus.PENDING))


def start_top_up(db: Session, customer: Customer, amount: Decimal,
                 now: datetime | None = None) -> tuple[Payment, str]:
    """Checks the limits, opens a PENDING payment and returns it with the gateway's payment page."""
    if not payment_gateway.configured():
        log.error("FAKEPAY_SECRET is not set: top-ups are off")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Top-ups are not available right now")
    if not settings.PAYMENT_MIN <= amount <= settings.PAYMENT_MAX:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"One top-up is {_kzt(settings.PAYMENT_MIN)} to {_kzt(settings.PAYMENT_MAX)} KZT")
    now = now or utcnow()
    account = account_service.get_account(db, customer.id, lock=True)  # parallel top-ups wait for each other
    expire_old(db, account.id, now)
    left_today = settings.PAYMENT_DAILY_MAX - _taken_today(db, account.id, now)
    if amount > left_today:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"The limit is {_kzt(settings.PAYMENT_DAILY_MAX)} KZT a day. "
                            f"Left today: {_kzt(max(left_today, 0))} KZT")
    if account.balance + _open_amount(db, account.id) + amount > account_service.MAX_BALANCE:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"The balance cannot be more than {_kzt(account_service.MAX_BALANCE)} KZT")
    payment = Payment(account_id=account.id, amount=amount, status=PaymentStatus.PENDING, created_at=now,
                      expires_at=now + timedelta(minutes=settings.PAYMENT_LINK_MINUTES))
    db.add(payment)
    db.flush()
    return payment, payment_gateway.checkout_url(payment.code, amount, f"{RETURN_PATH}?payment={payment.code}",
                                                 payment.expires_at)


def get_for(db: Session, customer: Customer, code: str) -> Payment:
    """A payment of this customer (404 for anyone else's: no probing other customers' payments)."""
    account = account_service.get_account(db, customer.id)
    payment = db.scalars(select(Payment).where(Payment.code == code, Payment.account_id == account.id)).one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    expire_old(db, account.id, utcnow())
    db.refresh(payment)
    return payment


def handle_webhook(db: Session, body: bytes, signature: str | None, now: datetime | None = None) -> str:
    """The gateway's word about a payment. Returns what happened (for the log); raises 400/404/409."""
    now = now or utcnow()
    try:
        event = payment_gateway.read_event(body, signature, now.timestamp())
    except payment_gateway.SignatureError as exc:
        log.warning("Payment webhook refused: %s", exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed webhook") from None

    payment = db.scalars(select(Payment).where(Payment.code == event.reference).with_for_update()).one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown payment")
    if payment.status != PaymentStatus.PENDING:
        if payment.gateway_event_id == event.id:
            return "already handled"  # the gateway retried the same event: the money moved the first time
        raise HTTPException(status.HTTP_409_CONFLICT, "This payment is already finished")
    if event.amount != payment.amount or event.currency != payment_gateway.CURRENCY:
        log.error("Payment %s: the webhook amount does not match", payment.code)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The amount does not match the payment")
    if payment.expires_at <= now:  # marked EXPIRED by expire_old on the next look; nothing is credited
        raise HTTPException(status.HTTP_409_CONFLICT, "The payment link expired")

    if event.kind == "payment.succeeded":
        _finish(payment, PaymentStatus.SUCCEEDED, now, event)
        db.flush()
        account_service.credit_payment(db, payment, now)
        return "credited"
    if event.kind == "payment.cancelled":
        _finish(payment, PaymentStatus.FAILED, now, event, "Cancelled on the payment page")
        return "cancelled"
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown webhook type")


def _finish(payment: Payment, result: str, now: datetime, event: payment_gateway.Event,
            reason: str | None = None) -> None:
    payment.status = result
    payment.completed_at = now
    payment.gateway_event_id = event.id
    payment.failure_reason = reason
    if result == PaymentStatus.SUCCEEDED:
        payment.card_brand = (event.card_brand or "Card")[:20]
        last4 = event.card_last4 or ""
        payment.card_last4 = last4 if len(last4) == 4 and last4.isdigit() else None


def summary(db: Session, now: datetime | None = None, limit: int = 200) -> dict:
    """For the Admin (read only): money received in total and today, and the latest payments."""
    now = now or utcnow()
    paid = Payment.status == PaymentStatus.SUCCEEDED
    total = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(paid))
    today = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        paid, Payment.completed_at >= _day_start(now)))
    latest = list(db.scalars(select(Payment).order_by(Payment.created_at.desc(), Payment.id.desc()).limit(limit)))
    return {"total": total, "today": today, "payments": latest}
