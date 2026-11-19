from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Money, ORMModel
from app.services.timeutil import local_tz


class TopUpRequest(BaseModel):
    """Whole tenge, 100 ... 1 000 000 KZT per top-up."""

    amount: Decimal = Field(ge=100, le=1_000_000, decimal_places=0)


def luhn_ok(number: str) -> bool:
    """The check digit every real card number has; catches typos."""
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def card_brand(number: str) -> str:
    if number.startswith("4"):
        return "Visa"
    if 51 <= int(number[:2]) <= 55 or 2221 <= int(number[:4]) <= 2720:
        return "Mastercard"
    if number[:2] in ("34", "37"):
        return "American Express"
    if 2200 <= int(number[:4]) <= 2204:
        return "Mir"
    if number.startswith("62"):
        return "UnionPay"
    return "Card"


class CardIn(BaseModel):
    """The full number is only checked here; the server keeps the last 4 digits. No CVV is asked."""

    holder: str = Field(min_length=2, max_length=100)
    number: str
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2000, le=2100)

    @field_validator("holder")
    @classmethod
    def holder_clean(cls, v: str) -> str:
        v = " ".join(v.split()).upper()
        if len(v) < 2:
            raise ValueError("Enter the name as written on the card")
        return v

    @field_validator("number")
    @classmethod
    def number_ok(cls, v: str) -> str:
        v = v.replace(" ", "").replace("-", "")
        if not v.isdigit() or not 13 <= len(v) <= 19:
            raise ValueError("A card number has 13 to 19 digits")
        if not luhn_ok(v):
            raise ValueError("The card number is wrong, check the digits")
        return v

    @model_validator(mode="after")
    def not_expired(self) -> "CardIn":
        today = datetime.now(local_tz()).date()
        if (self.exp_year, self.exp_month) < (today.year, today.month):
            raise ValueError("The card has expired")
        return self


class CardOut(BaseModel):
    holder: str
    brand: str
    last4: str
    exp_month: int
    exp_year: int


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
    bank: str
    card: CardOut | None = None
    transactions: list[TransactionOut]
