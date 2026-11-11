from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.common import Money, ORMModel


class TopUpRequest(BaseModel):
    """Whole tenge, 100 ... 1 000 000 KZT per top-up."""

    amount: Decimal = Field(ge=100, le=1_000_000, decimal_places=0)


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
    transactions: list[TransactionOut]
