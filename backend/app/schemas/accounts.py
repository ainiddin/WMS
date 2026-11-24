from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import Money, ORMModel


class TopUpRequest(BaseModel):
    """Whole tenge; the limits (min, max, per day) are checked by payment_service."""

    amount: Decimal = Field(gt=0, le=100_000_000, decimal_places=0)


class TopUpStarted(BaseModel):
    """Open `checkout_url` (the gateway's page) in the browser; the result comes back by webhook."""

    code: str
    amount: Money
    checkout_url: str
    expires_at: datetime


class PaymentOut(ORMModel):
    code: str
    amount: Money
    status: str
    card_brand: str | None
    card_last4: str | None
    failure_reason: str | None
    created_at: datetime
    expires_at: datetime
    completed_at: datetime | None


class AdminPaymentOut(PaymentOut):
    account_code: str
    customer_name: str

    @classmethod
    def from_payment(cls, p) -> "AdminPaymentOut":
        return cls(**PaymentOut.model_validate(p).model_dump(), account_code=p.account.code,
                   customer_name=p.account.customer.full_name)


class PaymentsSummaryOut(BaseModel):
    """Read only: there is no withdrawal for anybody."""

    gateway: str
    total: Money
    today: Money
    payments: list[AdminPaymentOut]


class TransactionOut(ORMModel):
    id: int
    code: str
    tx_type: str
    amount: Money
    balance_after: Money
    order_id: int | None
    order_code: str | None
    note: str | None
    created_at: datetime

    @classmethod
    def from_tx(cls, tx) -> "TransactionOut":
        return cls(
            id=tx.id, code=tx.code, tx_type=tx.tx_type, amount=tx.amount, balance_after=tx.balance_after,
            order_id=tx.order_id, order_code=tx.order.code if tx.order else None, note=tx.note,
            created_at=tx.created_at,
        )


class AccountOut(BaseModel):
    code: str
    balance: Money
    gateway: str  # who takes the card for top-ups
    transactions: list[TransactionOut]
